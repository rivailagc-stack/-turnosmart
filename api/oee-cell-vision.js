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
  const clean=String(text||'').trim()
    .replace(/^```json\s*/i,'')
    .replace(/^```\s*/,'')
    .replace(/\s*```$/,'')
    .trim();
  try{return JSON.parse(clean);}catch{}
  const a=clean.indexOf('{'),b=clean.lastIndexOf('}');
  if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));
  throw new Error('JSON inválido.');
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
    const {cellDataUrl,machine,scope}=req.body||{};
    const cell=parseDataUrl(cellDataUrl);

    if(!cell){
      return res.status(200).json({
        ok:false,
        softFail:true,
        error:'Célula não recebida.'
      });
    }

    const mk=String(machine||'').trim();
    const label=String(scope?.label||'').trim();

    const prompt=`
Você recebe UMA CÉLULA ISOLADA do quadro semanal de OEE da Ecopack.

Máquina: ${mk}
Turno/coluna: ${label}

Leia SOMENTE o OEE percentual desta célula.

REGRAS:
- Ignore nomes, produção e números sem porcentagem.
- Célula vazia = null.
- Ilegível = null.
- Dúvida entre algarismos = null.
- NUNCA converta vazio/null em 0.
- 0 só é válido se "0%" estiver literalmente visível.
- Cuidado com 2/6, 3/5, 3/8, 4/7, 5/6, 1/7.
- Só confirme com confiança >= 92.

Responda SOMENTE JSON:
{
  "oee":62,
  "confirmed":true,
  "confidence":97,
  "percentVisible":true,
  "cellReadable":true,
  "evidence":"62%",
  "reason":"62% claramente escrito"
}

Sem segurança:
{
  "oee":null,
  "confirmed":false,
  "confidence":0,
  "percentVisible":false,
  "cellReadable":false,
  "evidence":"",
  "reason":"sem percentual seguro"
}`;

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
            {type:'image',data:cell.data,mime_type:cell.mimeType}
          ],
          store:false,
          generation_config:{thinking_level:'high'},
          response_format:{type:'text',mime_type:'application/json'}
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

    const raw=parsed.oee;
    const hasValue=raw!==null && raw!==undefined && raw!=='';
    const n=hasValue?Number(raw):null;
    const evidence=String(parsed.evidence||'');

    const valid=
      parsed.confirmed===true &&
      parsed.percentVisible===true &&
      parsed.cellReadable===true &&
      Number(parsed.confidence)>=92 &&
      n!==null &&
      Number.isFinite(n) &&
      n>=0 &&
      n<=100 &&
      (n!==0 || /\b0\s*%/.test(evidence));

    return res.status(200).json({
      ok:true,
      machine:mk,
      scope:label,
      oee:valid?n:null,
      confirmed:valid,
      confidence:Math.max(0,Math.min(100,Number(parsed.confidence||0))),
      percentVisible:Boolean(parsed.percentVisible),
      cellReadable:Boolean(parsed.cellReadable),
      evidence,
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
