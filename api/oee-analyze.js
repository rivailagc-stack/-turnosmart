const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';

const MACHINES=['MK-138','MK-105','MK-108','MK-223','MK-192','MK-69','MK-172','MK-173','MK-178','MK-179','MK-212','MK-214','MK-217','MK-220','MK-159','MK-222','MK-170','MK-176','MK-188','MK-149'];

function parseDataUrl(v){
  const m=String(v||'').match(/^data:(image\/[^;]+);base64,(.+)$/s);
  return m?{mimeType:m[1],data:m[2]}:null;
}
function extractText(body){
  const out=[];
  for(const s of body?.steps||[]){
    if(s?.type==='model_output')for(const c of s?.content||[])if(c?.type==='text'&&c?.text)out.push(c.text);
    if(s?.text)out.push(s.text);
  }
  if(typeof body?.output_text==='string')out.push(body.output_text);
  return out.join('').trim();
}
function parseJson(text){
  const c=String(text||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
  try{return JSON.parse(c)}catch{}
  const a=c.indexOf('{'),b=c.lastIndexOf('}');
  if(a>=0&&b>a)return JSON.parse(c.slice(a,b+1));
  throw new Error('JSON inválido');
}
function norm(v){
  const d=String(v||'').match(/\d{2,3}/)?.[0];
  return d?`MK-${Number(d)}`:'';
}

module.exports=async(req,res)=>{
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  const key=process.env.GEMINI_API_KEY;
  if(!key)return res.status(200).json({ok:false,error:'Configure GEMINI_API_KEY na Vercel.'});
  try{
    const {imageDataUrl,scope}=req.body||{};
    const img=parseDataUrl(imageDataUrl);
    if(!img)return res.status(400).json({ok:false,error:'Imagem inválida.'});
    const label=String(scope?.label||'').trim();

    const prompt=`Você está lendo o QUADRO DE ACOMPANHAMENTO DE OEE SEMANAL da Ecopack.
Leia SOMENTE o turno/coluna ${label}.

Máquinas na ordem vertical:
${MACHINES.join(', ')}

REGRAS:
1) Localize primeiro o cabeçalho ${label}.
2) Para cada MK, encontre a linha pela etiqueta da máquina à esquerda e siga horizontalmente até a coluna ${label}.
3) Leia somente o percentual de OEE dentro da célula correta.
4) Ignore produção, nomes, horários, contagens, OEE geral, células vizinhas e anotações técnicas.
5) Vazio, ilegível ou dúvida = null. Nunca invente. Nunca transforme vazio em 0.
6) 0 só é válido se "0%" estiver explicitamente escrito.
7) Faça uma autoconsistência interna: antes de confirmar, confira de novo a linha e a coluna.
8) confirmed=true somente quando rowConfirmed, columnConfirmed e percentVisible forem verdadeiros e confidence>=90.
9) Também tente ler o OEE geral do turno atual no cabeçalho e o OEE geral do turno imediatamente anterior, apenas se estiverem claramente visíveis.

Retorne SOMENTE JSON:
{
 "scope":"${label}",
 "currentTurnOee":55,
 "previousTurnOee":62,
 "rows":[
  {"machine":"MK-138","oee":64,"confirmed":true,"confidence":96,"rowConfirmed":true,"columnConfirmed":true,"percentVisible":true,"evidence":"64%","reason":"64% visível na interseção correta"}
 ]
}`;

    const r=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-goog-api-key':key,'Api-Revision':'2026-05-20'},
      body:JSON.stringify({
        model:MODEL,
        input:[{type:'text',text:prompt},{type:'image',data:img.data,mime_type:img.mimeType}],
        store:false,
        generation_config:{thinking_level:'high'},
        response_format:{type:'text',mime_type:'application/json'}
      })
    });
    const body=await r.json();
    if(!r.ok)throw new Error(body?.error?.message||`Gemini HTTP ${r.status}`);
    const parsed=parseJson(extractText(body));
    const map=new Map((parsed.rows||[]).map(x=>[norm(x.machine),x]));

    const rows=MACHINES.map(machine=>{
      const x=map.get(machine)||{};
      const raw=x.oee, has=raw!==null&&raw!==undefined&&raw!=='';
      const n=has?Number(raw):null, ev=String(x.evidence||'');
      const valid=x.confirmed===true&&x.rowConfirmed===true&&x.columnConfirmed===true&&x.percentVisible===true&&Number(x.confidence)>=90&&n!==null&&Number.isFinite(n)&&n>=0&&n<=100&&(n!==0||/\b0\s*%/.test(ev));
      return {machine,oee:valid?n:null,confirmed:valid,confidence:Number(x.confidence||0),reason:String(x.reason||''),evidence:ev};
    });
    const current=Number(parsed.currentTurnOee), prev=Number(parsed.previousTurnOee);
    return res.status(200).json({
      ok:true,scope:label,rows,confirmedCount:rows.filter(x=>x.confirmed).length,
      currentTurnOee:Number.isFinite(current)?current:null,
      previousTurnOee:Number.isFinite(prev)?prev:null,
      model:MODEL
    });
  }catch(e){
    return res.status(200).json({ok:false,error:String(e?.message||e)});
  }
};
