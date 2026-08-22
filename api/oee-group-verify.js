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
  const {fullBoardDataUrl,scope,machines}=req.body||{};const img=parseDataUrl(fullBoardDataUrl);if(!img)return res.status(400).json({ok:false,error:'Foto completa não recebida.'});
  const wanted=(machines||[]).map(normalizeMachine).filter(m=>MACHINES.includes(m)).slice(0,5);const label=String(scope?.label||'').trim();
  const prompt=`Você é o SEGUNDO LEITOR independente de um quadro de OEE industrial.\n\nVeja a FOTO INTEIRA. Leia SOMENTE a coluna ${label}.\nPara cada máquina solicitada: localize a linha pelo número MK na esquerda, siga horizontalmente até a coluna ${label}, e leia apenas o percentual daquela interseção.\n\nMáquinas: ${wanted.join(', ')}\n\nNÃO receba nem tente adivinhar a primeira leitura.\nPROIBIDO usar números de produção, linha vizinha, coluna vizinha ou OEE geral.\nCélula vazia/ilegível/ambígua => oee:null, confirmed:false.\n0 só é válido se 0% estiver explicitamente escrito.\nDiferencie com cuidado 2/6, 3/5, 3/8, 4/7, 5/6, 1/7.\n\nJSON EXATO:{"rows":[{"machine":"MK-172","oee":59,"confirmed":true,"confidence":96,"columnConfirmed":true,"rowConfirmed":true,"percentVisible":true,"evidence":"59%","reason":"59% visível na interseção correta"}]}`;
  const parsed=await askGemini(key,[{type:'text',text:prompt},{type:'image',data:img.data,mime_type:img.mimeType}]);
  const map=new Map((parsed.rows||[]).map(r=>[normalizeMachine(r.machine),r]));
  const rows=wanted.map(machine=>{const r=map.get(machine)||{};const raw=r.oee;const has=raw!==null&&raw!==undefined&&raw!=='';const n=has?Number(raw):null;const valid=r.confirmed===true&&r.columnConfirmed===true&&r.rowConfirmed===true&&r.percentVisible===true&&Number(r.confidence)>=85&&n!==null&&Number.isFinite(n)&&n>=0&&n<=100&&(n!==0||/\b0\s*%/.test(String(r.evidence||'')));return {machine,oee:valid?n:null,confirmed:valid,confidence:Number(r.confidence||0),evidence:String(r.evidence||''),reason:String(r.reason||'')};});
  return res.status(200).json({ok:true,rows,model:MODEL});
 }catch(e){return res.status(500).json({ok:false,error:String(e?.message||e)});}
};
