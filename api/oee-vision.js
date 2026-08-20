const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';

const MACHINES=[
  'MK-138','MK-105','MK-108','MK-223','MK-192',
  'MK-69','MK-172','MK-173','MK-178','MK-179',
  'MK-212','MK-214','MK-217','MK-220','MK-159',
  'MK-222','MK-170','MK-176','MK-188','MK-149'
];

function parseDataUrl(dataUrl){
  const m=String(dataUrl||'').match(
    /^data:(image\/[^;]+);base64,(.+)$/s
  );
  return m?{mimeType:m[1],data:m[2]}:null;
}

function normalizeMachine(value){
  const d=String(value||'').match(/\d{2,3}/)?.[0];
  return d?`MK-${Number(d)}`:'';
}

function extractText(body){
  const texts=[];
  for(const step of body?.steps||[]){
    if(step?.type==='model_output'){
      for(const c of step?.content||[]){
        if(c?.type==='text'&&c?.text)texts.push(c.text);
      }
    }
    if(step?.text)texts.push(step.text);
  }
  if(typeof body?.output_text==='string')texts.push(body.output_text);
  return texts.join('').trim();
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
      imageDataUrl,
      rowImages=[],
      scope
    }=req.body||{};

    const full=parseDataUrl(fullBoardDataUrl||imageDataUrl);

    if(!full){
      return res.status(400).json({
        ok:false,
        error:'Foto completa do quadro não recebida.'
      });
    }

    const label=scope?.label||'';

    const parts=[{
      text:
`Você é um leitor industrial de quadro OEE manuscrito.

OBJETIVO:
Ler SOMENTE a coluna ${label}.

REGRAS CRÍTICAS:
1. Use a FOTO COMPLETA para confirmar dia/turno e posição vertical das máquinas.
2. Depois use cada IMAGEM DE CÉLULA apenas como zoom da mesma máquina.
3. Nunca transfira OEE de uma máquina para outra.
4. Produção em peças NÃO é OEE.
5. Número da máquina NÃO é OEE.
6. OEE válido é percentual entre 0 e 100 e precisa estar visualmente associado ao símbolo %.
7. Célula vazia ou máquina sem registro = status "blank" ou "not_running", oee null.
8. Se houver escrita mas não der para confirmar percentual, status "unreadable", oee null.
9. NÃO INVENTE.
10. sameCell só pode ser true se o percentual estiver visualmente na mesma célula da máquina.
11. percentVisible só pode ser true se o símbolo % ou notação percentual estiver realmente visível.
12. confidence é 0 a 100.
13. Retorne todas as 20 máquinas.

ORDEM:
${MACHINES.join(', ')}

JSON:
{
 "rows":[
  {
   "machine":"MK-172",
   "status":"oee|not_running|blank|unreadable",
   "oee":68,
   "confidence":96,
   "sameCell":true,
   "percentVisible":true,
   "evidence":"68%",
   "description":"68% lido na mesma célula."
  }
 ]
}`
    }];

    parts.push({
      inlineData:{
        mimeType:full.mimeType,
        data:full.data
      }
    });

    for(const item of rowImages){
      const machine=normalizeMachine(item.machine);
      const img=parseDataUrl(item.dataUrl);
      if(!machine||!img)continue;

      parts.push({
        text:`ZOOM DA CÉLULA ${machine}: confira esta célula contra a posição na foto completa.`
      });

      parts.push({
        inlineData:{
          mimeType:img.mimeType,
          data:img.data
        }
      });
    }

    const url=
      'https://generativelanguage.googleapis.com/v1beta/interactions';

    const gr=await fetch(url,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-goog-api-key':key,
        'Api-Revision':'2026-05-20'
      },
      body:JSON.stringify({
        model:MODEL,
        input:parts.map(p=>{
          if(p.text)return {type:'text',text:p.text};
          return {
            type:'image',
            data:p.inlineData.data,
            mime_type:p.inlineData.mimeType
          };
        }),
        store:false,
        generation_config:{
          thinking_level:'medium'
        },
        response_format:{
          type:'text',
          mime_type:'application/json'
        }
      })
    });

    const body=await gr.json();

    if(!gr.ok){
      return res.status(gr.status).json({
        ok:false,
        error:body?.error?.message||`Gemini HTTP ${gr.status}`,
        model:MODEL,
        api:'interactions'
      });
    }

    const parsed=parseJson(extractText(body));

    const incoming=new Map(
      (parsed.rows||[]).map(r=>[
        normalizeMachine(r.machine),
        r
      ])
    );

    const rows=MACHINES.map(machine=>{
      const r=incoming.get(machine)||{};
      const n=Number(r.oee);
      const valid=
        r.oee!==null &&
        r.oee!==undefined &&
        r.oee!=='' &&
        Number.isFinite(n) &&
        n>=0 &&
        n<=100;

      return {
        machine,
        status:String(r.status||'unreadable'),
        oee:valid?n:null,
        confidence:Math.max(0,Math.min(100,Number(r.confidence||0))),
        sameCell:Boolean(r.sameCell),
        percentVisible:Boolean(r.percentVisible),
        evidence:String(r.evidence||''),
        description:String(r.description||r.evidence||'')
      };
    });

    return res.status(200).json({
      ok:true,
      provider:'gemini',
      api:'interactions',
      model:MODEL,
      rows
    });

  }catch(error){
    return res.status(500).json({
      ok:false,
      error:String(error?.message||error),
      model:MODEL,
      api:'interactions'
    });
  }
};
