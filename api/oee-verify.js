const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';
const MACHINES=['MK-138','MK-105','MK-108','MK-223','MK-192','MK-69','MK-172','MK-173','MK-178','MK-179','MK-212','MK-214','MK-217','MK-220','MK-159','MK-222','MK-170','MK-176','MK-188','MK-149'];

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
    .replace(/^```json\s*/i,'')
    .replace(/^```\s*/,'')
    .replace(/\s*```$/,'')
    .trim();
  try{return JSON.parse(clean);}catch{}
  const a=clean.indexOf('{'),b=clean.lastIndexOf('}');
  if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));
  throw new Error('JSON inválido.');
}
function normalizeMachine(v){
  const d=String(v||'').match(/\d{2,3}/)?.[0];
  return d?`MK-${Number(d)}`:'';
}
async function askGemini(key,input){
  const r=await fetch(
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
        generation_config:{thinking_level:'high'},
        response_format:{type:'text',mime_type:'application/json'}
      })
    }
  );
  const body=await r.json();
  if(!r.ok)throw new Error(body?.error?.message||`Gemini HTTP ${r.status}`);
  return parseJson(extractText(body));
}

async function handleGroup(req,res,key){
  const {fullBoardDataUrl,scope,machines}=req.body||{};
  const img=parseDataUrl(fullBoardDataUrl);
  if(!img)return res.status(400).json({ok:false,error:'Foto completa não recebida.'});

  const wanted=(machines||[])
    .map(normalizeMachine)
    .filter(m=>MACHINES.includes(m))
    .slice(0,5);

  const label=String(scope?.label||'').trim();

  const prompt=`Você é o SEGUNDO LEITOR independente de um quadro de OEE industrial.

Veja a FOTO INTEIRA. Leia SOMENTE a coluna ${label}.

Para cada máquina:
1. localize a linha pelo número MK na esquerda;
2. siga horizontalmente;
3. encontre exatamente a coluna ${label};
4. leia apenas o percentual da interseção.

Máquinas: ${wanted.join(', ')}

NÃO use nenhuma primeira leitura.
PROIBIDO usar produção, OEE geral, linha vizinha ou coluna vizinha.
Célula vazia/ilegível/ambígua => oee:null, confirmed:false.
0 só é válido se 0% estiver explicitamente escrito.
Diferencie 2/6, 3/5, 3/8, 4/7, 5/6 e 1/7.

JSON:
{"rows":[{"machine":"MK-172","oee":59,"confirmed":true,"confidence":96,"columnConfirmed":true,"rowConfirmed":true,"percentVisible":true,"evidence":"59%","reason":"59% visível na interseção correta"}]}`;

  const parsed=await askGemini(key,[
    {type:'text',text:prompt},
    {type:'image',data:img.data,mime_type:img.mimeType}
  ]);

  const map=new Map(
    (parsed.rows||[]).map(r=>[normalizeMachine(r.machine),r])
  );

  const rows=wanted.map(machine=>{
    const r=map.get(machine)||{};
    const raw=r.oee;
    const has=raw!==null&&raw!==undefined&&raw!=='';
    const n=has?Number(raw):null;

    const valid=
      r.confirmed===true &&
      r.columnConfirmed===true &&
      r.rowConfirmed===true &&
      r.percentVisible===true &&
      Number(r.confidence)>=85 &&
      n!==null &&
      Number.isFinite(n) &&
      n>=0 &&
      n<=100 &&
      (n!==0||/\b0\s*%/.test(String(r.evidence||'')));

    return {
      machine,
      oee:valid?n:null,
      confirmed:valid,
      confidence:Number(r.confidence||0),
      evidence:String(r.evidence||''),
      reason:String(r.reason||'')
    };
  });

  return res.status(200).json({ok:true,rows,model:MODEL});
}

async function handleMachine(req,res,key){
  const {fullBoardDataUrl,scope,machine}=req.body||{};
  const img=parseDataUrl(fullBoardDataUrl);
  if(!img)return res.status(400).json({ok:false,error:'Foto completa não recebida.'});

  const mk=normalizeMachine(machine);
  const label=String(scope?.label||'').trim();

  const prompt=`Você é o TERCEIRO LEITOR de desempate de um quadro de OEE.

Veja a FOTO INTEIRA e leia somente ${mk} na coluna ${label}.

1. encontre ${mk} na lista de máquinas à esquerda;
2. siga exatamente a mesma linha;
3. encontre ${label} no topo;
4. leia somente a célula da interseção.

Não use produção, nomes, célula acima/abaixo ou coluna anterior/seguinte.
Se houver dúvida, retorne null.
0 só é válido se 0% estiver explicitamente escrito.

JSON:
{"machine":"${mk}","oee":54,"confirmed":true,"confidence":97,"columnConfirmed":true,"rowConfirmed":true,"percentVisible":true,"evidence":"54%","reason":"54% visível na interseção correta"}`;

  const r=await askGemini(key,[
    {type:'text',text:prompt},
    {type:'image',data:img.data,mime_type:img.mimeType}
  ]);

  const raw=r.oee;
  const has=raw!==null&&raw!==undefined&&raw!=='';
  const n=has?Number(raw):null;

  const valid=
    r.confirmed===true &&
    r.columnConfirmed===true &&
    r.rowConfirmed===true &&
    r.percentVisible===true &&
    Number(r.confidence)>=88 &&
    n!==null &&
    Number.isFinite(n) &&
    n>=0 &&
    n<=100 &&
    (n!==0||/\b0\s*%/.test(String(r.evidence||'')));

  return res.status(200).json({
    ok:true,
    machine:mk,
    oee:valid?n:null,
    confirmed:valid,
    confidence:Number(r.confidence||0),
    evidence:String(r.evidence||''),
    reason:String(r.reason||'')
  });
}

async function handleLegacy(req,res,key){
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

  const prompt=`Você é o segundo conferente de OEE.

Máquina: ${mk}
Coluna: ${label}
Primeira leitura: ${Number.isFinite(first)?first:'?'}%

A primeira leitura pode estar errada.
Confira visualmente. Se não houver certeza, use uncertain.

JSON:
{"decision":"confirm|correct|uncertain","finalOee":54,"confidence":97,"rowConfirmed":true,"columnConfirmed":true,"percentVisible":true,"reason":"54% está claramente escrito."}`;

  const parsed=await askGemini(key,[
    {type:'text',text:prompt},
    {type:'image',data:full.data,mime_type:full.mimeType},
    {type:'image',data:cell.data,mime_type:cell.mimeType}
  ]);

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
    const mode=String(req.body?.mode||'legacy');

    if(mode==='group'){
      return await handleGroup(req,res,key);
    }
    if(mode==='machine'){
      return await handleMachine(req,res,key);
    }
    return await handleLegacy(req,res,key);

  }catch(error){
    return res.status(200).json({
      ok:false,
      softFail:true,
      error:String(error?.message||error)
    });
  }
};
