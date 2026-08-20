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
    return res.status(200).json({
      ok:false,
      softFail:true,
      error:'GEMINI_API_KEY indisponível.'
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
      return res.status(200).json({
        ok:false,
        softFail:true,
        error:'Imagens insuficientes para segunda conferência.'
      });
    }

    const mk=String(machine||'').trim();
    const label=String(scope?.label||'').trim();
    const first=Number(initialOee);

    const prompt=`
Você é o segundo conferente de OEE de um quadro industrial manuscrito.

Máquina: ${mk}
Coluna/turno: ${label}
Primeira leitura: ${Number.isFinite(first)?first:'?'}%

ATENÇÃO:
- A primeira leitura pode estar certa ou errada.
- Não copie o valor sugerido.
- Confira visualmente.
- Diferencie 2/6, 3/5, 4/7, 1/7, 5/6 e 3/8.
- Ignore produção, nomes e números sem símbolo %.
- Se não houver certeza, responda uncertain.
- Só use correct se houver certeza visual MUITO alta.

Retorne JSON:
{
  "decision":"confirm|correct|uncertain",
  "finalOee":54,
  "confidence":97,
  "rowConfirmed":true,
  "columnConfirmed":true,
  "percentVisible":true,
  "reason":"54% está claramente escrito."
}
`;

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
          input:[
            {type:'text',text:prompt},
            {type:'image',data:full.data,mime_type:full.mimeType},
            {type:'image',data:cell.data,mime_type:cell.mimeType}
          ],
          store:false,
          generation_config:{thinking_level:'high'},
          response_format:{
            type:'text',
            mime_type:'application/json'
          }
        })
      }
    );

    const body=await gr.json();

    if(!gr.ok){
      return res.status(200).json({
        ok:false,
        softFail:true,
        error:body?.error?.message||`Gemini HTTP ${gr.status}`
      });
    }

    const parsed=parseJson(extractText(body));
    const finalOee=Number(parsed.finalOee);

    return res.status(200).json({
      ok:true,
      decision:String(parsed.decision||'uncertain'),
      finalOee:Number.isFinite(finalOee)?finalOee:null,
      confidence:Math.max(0,Math.min(100,Number(parsed.confidence||0))),
      rowConfirmed:Boolean(parsed.rowConfirmed),
      columnConfirmed:Boolean(parsed.columnConfirmed),
      percentVisible:Boolean(parsed.percentVisible),
      reason:String(parsed.reason||'')
    });

  }catch(error){
    return res.status(200).json({
      ok:false,
      softFail:true,
      error:String(error?.message||error)
    });
  }
};
