const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';

function parseDataUrl(v){
  const m=String(v||'').match(/^data:(image\/[^;]+);base64,(.+)$/s);
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
    .replace(/^```json\s*/i,'').replace(/^```\s*/,'')
    .replace(/\s*```$/,'').trim();
  try{return JSON.parse(clean);}catch{}
  const a=clean.indexOf('{'),b=clean.lastIndexOf('}');
  if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));
  throw new Error('JSON inválido.');
}

module.exports=async(req,res)=>{
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  const key=process.env.GEMINI_API_KEY;
  if(!key)return res.status(200).json({ok:false,softFail:true,error:'GEMINI_API_KEY indisponível.'});

  try{
    const {cellDataUrl,machine,scope}=req.body||{};
    const cell=parseDataUrl(cellDataUrl);
    if(!cell)return res.status(200).json({ok:false,softFail:true,error:'Célula não recebida.'});

    const mk=String(machine||'').trim();
    const label=String(scope?.label||'').trim();

    const prompt=`
Você está lendo UMA ÚNICA CÉLULA de um quadro de OEE industrial manuscrito.

Máquina esperada: ${mk}
Coluna/turno esperado: ${label}

REGRA ABSOLUTA:
1. Leia somente esta célula.
2. Procure um percentual de OEE escrito dentro dela.
3. Não use números de produção, nomes, horários, quantidades ou células vizinhas.
4. Não transforme números sem símbolo % em OEE.
5. Se a célula estiver vazia, ilegível, cortada ou houver dúvida entre dois valores, NÃO adivinhe.
6. "confirmed" só pode ser true se o percentual estiver visualmente claro.
7. O valor deve estar entre 0 e 100.

Retorne SOMENTE JSON:
{
 "machine":"${mk}",
 "scope":"${label}",
 "oee":62,
 "confirmed":true,
 "confidence":97,
 "percentVisible":true,
 "cellReadable":true,
 "reason":"62% claramente visível dentro da célula"
}

Se não houver leitura segura:
{
 "machine":"${mk}",
 "scope":"${label}",
 "oee":null,
 "confirmed":false,
 "confidence":0,
 "percentVisible":false,
 "cellReadable":false,
 "reason":"célula vazia ou leitura incerta"
}`;

    const gr=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
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
    });

    const body=await gr.json();
    if(!gr.ok)return res.status(200).json({ok:false,softFail:true,error:body?.error?.message||`Gemini HTTP ${gr.status}`});

    const p=parseJson(extractText(body));
    const n=Number(p.oee);
    const confirmed=Boolean(p.confirmed)&&Boolean(p.percentVisible)&&Boolean(p.cellReadable)&&
      Number.isFinite(n)&&n>=0&&n<=100&&Number(p.confidence)>=90;

    return res.status(200).json({
      ok:true,
      machine:mk,
      scope:label,
      oee:confirmed?n:null,
      confirmed,
      confidence:Math.max(0,Math.min(100,Number(p.confidence||0))),
      percentVisible:Boolean(p.percentVisible),
      cellReadable:Boolean(p.cellReadable),
      reason:String(p.reason||'')
    });
  }catch(e){
    return res.status(200).json({ok:false,softFail:true,error:String(e?.message||e)});
  }
};
