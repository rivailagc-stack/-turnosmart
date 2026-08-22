const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';
const MACHINES=['MK-138','MK-105','MK-108','MK-223','MK-192','MK-69','MK-172','MK-173','MK-178','MK-179','MK-212','MK-214','MK-217','MK-220','MK-159','MK-222','MK-170','MK-176','MK-188','MK-149'];
function parseDataUrl(v){const m=String(v||'').match(/^data:(image\/[^;]+);base64,(.+)$/s);return m?{mimeType:m[1],data:m[2]}:null;}
function extractText(body){const out=[];for(const step of body?.steps||[]){if(step?.type==='model_output'){for(const c of step?.content||[]){if(c?.type==='text'&&c?.text)out.push(c.text);}}if(step?.text)out.push(step.text);}if(typeof body?.output_text==='string')out.push(body.output_text);return out.join('').trim();}
function parseJson(text){const clean=String(text||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();try{return JSON.parse(clean);}catch{}const a=clean.indexOf('{'),b=clean.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));throw new Error('JSON inválido.');}
function normalizeMachine(v){const d=String(v||'').match(/\d{2,3}/)?.[0];return d?`MK-${Number(d)}`:'';}
async function askGemini(key,input){const r=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key,'Api-Revision':'2026-05-20'},body:JSON.stringify({model:MODEL,input,store:false,generation_config:{thinking_level:'high'},response_format:{type:'text',mime_type:'application/json'}})});const body=await r.json();if(!r.ok)throw new Error(body?.error?.message||`Gemini HTTP ${r.status}`);return parseJson(extractText(body));}

module.exports=async(req,res)=>{
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
 const key=process.env.GEMINI_API_KEY;if(!key)return res.status(500).json({ok:false,error:'GEMINI_API_KEY não configurada.'});
 try{
  const {fullBoardDataUrl,scope,machine}=req.body||{};const img=parseDataUrl(fullBoardDataUrl);if(!img)return res.status(400).json({ok:false,error:'Foto completa não recebida.'});
  const mk=normalizeMachine(machine);const label=String(scope?.label||'').trim();
  const prompt=`Você é o TERCEIRO LEITOR de desempate. Veja a FOTO INTEIRA do quadro.\nLeia somente ${mk} na coluna ${label}.\n1) encontre ${mk} na coluna de máquinas à esquerda; 2) siga a mesma linha; 3) encontre exatamente ${label} no topo; 4) leia só a célula da interseção.\nNão use produção, nomes, célula acima/abaixo ou coluna anterior/seguinte. Não invente. Se houver dúvida, retorne null.\nRetorne JSON: {"machine":"${mk}","oee":54,"confirmed":true,"confidence":97,"columnConfirmed":true,"rowConfirmed":true,"percentVisible":true,"evidence":"54%","reason":"..."}`;
  const r=await askGemini(key,[{type:'text',text:prompt},{type:'image',data:img.data,mime_type:img.mimeType}]);
  const raw=r.oee;const has=raw!==null&&raw!==undefined&&raw!=='';const n=has?Number(raw):null;const valid=r.confirmed===true&&r.columnConfirmed===true&&r.rowConfirmed===true&&r.percentVisible===true&&Number(r.confidence)>=88&&n!==null&&Number.isFinite(n)&&n>=0&&n<=100&&(n!==0||/\b0\s*%/.test(String(r.evidence||'')));
  return res.status(200).json({ok:true,machine:mk,oee:valid?n:null,confirmed:valid,confidence:Number(r.confidence||0),evidence:String(r.evidence||''),reason:String(r.reason||'')});
 }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)});}
};
