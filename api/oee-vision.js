const MODEL=process.env.GEMINI_MODEL||'gemini-2.5-flash';
const MACHINES=['MK-138','MK-105','MK-108','MK-223','MK-192','MK-69','MK-172','MK-173','MK-178','MK-179','MK-212','MK-214','MK-217','MK-220','MK-159','MK-222','MK-170','MK-176','MK-188','MK-149'];
function normalizeMachine(value){const digits=String(value||'').match(/\d{2,3}/)?.[0];return digits?`MK-${Number(digits)}`:'';}
function extractJson(text){
  let clean=String(text||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
  try{return JSON.parse(clean);}catch{}
  const a=clean.indexOf('{'), b=clean.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(clean.slice(a,b+1));}catch{}}
  const x=clean.indexOf('['), y=clean.lastIndexOf(']');
  if(x>=0&&y>x){try{return {rows:JSON.parse(clean.slice(x,y+1))};}catch{}}
  throw new Error('JSON do Gemini não pôde ser interpretado.');
}
module.exports=async(req,res)=>{
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  const key=process.env.GEMINI_API_KEY;
  if(!key)return res.status(500).json({ok:false,error:'GEMINI_API_KEY não configurada.'});
  try{
    const {compositeDataUrl,imageDataUrl,scope}=req.body||{};
    const parseImage=dataUrl=>{const m=String(dataUrl||'').match(/^data:(image\/[^;]+);base64,(.+)$/s);return m?{mimeType:m[1],data:m[2]}:null;};
    const sheet=parseImage(compositeDataUrl), full=parseImage(imageDataUrl);
    if(!sheet)return res.status(400).json({ok:false,error:'Folha de 20 linhas não recebida.'});
    const scopeLabel=scope?.label||'';
    const prompt=`Você recebeu uma imagem preparada pelo aplicativo com EXATAMENTE 20 linhas. Em cada linha, à esquerda há um rótulo DIGITAL da máquina e à direita somente o recorte real daquela mesma máquina na coluna ${scopeLabel}. Você NÃO precisa descobrir sequência nem máquina. Leia apenas o percentual OEE manuscrito de 0 a 100 na parte direita da mesma linha. Ignore produção em peças, nomes, OP, meta, semana e outros números. Se não houver percentual legível, oee=null. Nunca mova valor para outra linha. Retorne TODAS as 20 máquinas. confidence de 0 a 100. description curta. ORDEM EXATA: ${MACHINES.join(', ')}. JSON obrigatório: {"rows":[{"machine":"MK-138","oee":64,"confidence":93,"description":"64% lido; 583.740 é produção."}]}`;
    const parts=[{inlineData:{mimeType:sheet.mimeType,data:sheet.data}}];
    if(full)parts.push({inlineData:{mimeType:full.mimeType,data:full.data}});
    parts.push({text:prompt});
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
    const gr=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{temperature:0,responseMimeType:'application/json'}})});
    const body=await gr.json();
    if(!gr.ok)return res.status(gr.status).json({ok:false,error:body?.error?.message||`Gemini HTTP ${gr.status}`,model:MODEL});
    const text=(body?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();
    if(!text)return res.status(502).json({ok:false,error:'Gemini respondeu sem conteúdo.',model:MODEL});
    const parsed=extractJson(text);
    const incoming=new Map((parsed.rows||[]).map(row=>[normalizeMachine(row.machine),row]));
    const rows=MACHINES.map(machine=>{const row=incoming.get(machine)||{};const n=Number(row.oee);const valid=row.oee!==null&&row.oee!==undefined&&row.oee!==''&&Number.isFinite(n)&&n>=0&&n<=100;const confidence=Math.max(0,Math.min(100,Number(row.confidence||0)));return {machine,oee:valid?n:null,confidence,anchorFound:true,rowChecked:true,evidence:String(row.description||''),description:String(row.description||(valid?`${n}% identificado na linha ${machine}.`:'Sem percentual legível nesta linha.'))};});
    return res.status(200).json({ok:true,provider:'gemini',model:MODEL,scope:scopeLabel,rows});
  }catch(error){return res.status(500).json({ok:false,error:String(error?.message||error),model:MODEL});}
};
