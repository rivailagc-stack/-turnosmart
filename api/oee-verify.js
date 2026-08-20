const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';

function parseDataUrl(value){
  const m=String(value||'').match(/^data:(image\/[^;]+);base64,(.+)$/s);
  return m?{mimeType:m[1],data:m[2]}:null;
}

function extractText(body){
  const out=[];
  for(const step of body?.steps||[]){
    if(step?.type==='model_output'){
      for(const c of step?.content||[]){
        if(c?.type==='text'&&c?.text)out.push(c.text);
      }
    }
    if(step?.text)out.push(step.text);
  }
  if(typeof body?.output_text==='string')out.push(body.output_text);
  return out.join('').trim();
}

function parseJson(text){
  const clean=String(text||'')
    .trim()
    .replace(/^```json\s*/i,'')
    .replace(/^```\s*/,'')
    .replace(/\s*```$/,'')
    .trim();

  try{return JSON.parse(clean);}catch{}

  const a=clean.indexOf('{');
  const b=clean.lastIndexOf('}');
  if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));

  throw new Error('Resposta JSON inválida.');
}

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    return res.status(405).json({ok:false,error:'Use POST.'});
  }

  const key=process.env.GEMINI_API_KEY;
  if(!key){
    return res.status(500).json({
      ok:false,
      error:'GEMINI_API_KEY não configurada.'
    });
  }

  try{
    const {
      fullBoardDataUrl,
      cellDataUrl,
      machine,
      scope,
      initialOee
    }=req.body||{};

    const full=parseDataUrl(fullBoardDataUrl);
    const cell=parseDataUrl(cellDataUrl);

    if(!full||!cell){
      return res.status(400).json({
        ok:false,
        error:'Foto completa e recorte da célula são obrigatórios.'
      });
    }

    const label=String(scope?.label||'').trim();
    const mk=String(machine||'').trim();
    const first=Number(initialOee);

    const instruction=`
Você é o SEGUNDO CONFERENTE de um quadro industrial de OEE.

IMPORTANTE:
A primeira leitura automática sugeriu ${Number.isFinite(first)?first:'?'}% para ${mk}.
ESSA PRIMEIRA LEITURA PODE ESTAR ERRADA.
NÃO copie esse número sem conferir visualmente.

Você recebeu:
IMAGEM 1 = quadro completo, usada para confirmar a linha ${mk} e a coluna ${label}.
IMAGEM 2 = recorte EXATO da célula correspondente a ${mk} em ${label}.

TAREFA:
1. Confirme que a célula é realmente da máquina ${mk} e da coluna ${label}.
2. Procure SOMENTE um percentual escrito nessa célula.
3. Diferencie com cuidado algarismos manuscritos parecidos:
   - 2 x 6
   - 3 x 5
   - 4 x 7
   - 1 x 7
   - 5 x 6
   - 8 x 3
4. Ignore produção, nomes e outros números sem %.
5. Se o percentual estiver legível, informe o valor correto.
6. Se não estiver seguro, marque uncertain.
7. Uma célula vazia deve ser blank.
8. Nunca invente OEE.

REGRA DE DECISÃO:
- confirm = o valor visual coincide com a primeira leitura;
- correct = o valor visual está claramente diferente da primeira leitura;
- uncertain = não há segurança visual suficiente;
- blank = não existe percentual naquela célula.

Se decidir "correct", confidence precisa ser >= 90 e evidence deve mostrar o percentual visto.
Se confidence < 90, use "uncertain".

JSON EXATO:
{
  "machine":"${mk}",
  "decision":"confirm|correct|uncertain|blank",
  "finalOee":54,
  "confidence":96,
  "rowConfirmed":true,
  "columnConfirmed":true,
  "percentVisible":true,
  "evidence":"54%",
  "reason":"O primeiro algarismo é 5, não 3."
}
`;

    const input=[
      {type:'text',text:instruction},
      {type:'image',data:full.data,mime_type:full.mimeType},
      {type:'image',data:cell.data,mime_type:cell.mimeType}
    ];

    const gr=await fetch(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-goog-api-key':key,
          'Api-Revision':'2026-05-20'
        },
        body:JSON.stringify({
          model:MODEL,
          input,
          store:false,
          generation_config:{
            thinking_level:'high'
          },
          response_format:{
            type:'text',
            mime_type:'application/json'
          }
        })
      }
    );

    const body=await gr.json();

    if(!gr.ok){
      return res.status(gr.status).json({
        ok:false,
        error:body?.error?.message||`Gemini HTTP ${gr.status}`
      });
    }

    const parsed=parseJson(extractText(body));
    const finalOee=Number(parsed.finalOee);
    const validOee=
      Number.isFinite(finalOee)&&
      finalOee>=0&&
      finalOee<=100;

    let decision=String(parsed.decision||'uncertain');

    if(
      decision==='correct' &&
      Number(parsed.confidence||0)<90
    ){
      decision='uncertain';
    }

    if(
      (decision==='confirm'||decision==='correct') &&
      !validOee
    ){
      decision='uncertain';
    }

    return res.status(200).json({
      ok:true,
      model:MODEL,
      machine:mk,
      decision,
      finalOee:validOee?finalOee:null,
      confidence:Math.max(
        0,
        Math.min(100,Number(parsed.confidence||0))
      ),
      rowConfirmed:Boolean(parsed.rowConfirmed),
      columnConfirmed:Boolean(parsed.columnConfirmed),
      percentVisible:Boolean(parsed.percentVisible),
      evidence:String(parsed.evidence||''),
      reason:String(parsed.reason||'')
    });

  }catch(error){
    return res.status(500).json({
      ok:false,
      error:String(error?.message||error)
    });
  }
};
