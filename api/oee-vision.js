const MODEL=process.env.GEMINI_MODEL||'gemini-2.5-flash';

const MACHINES=[
  'MK-138','MK-105','MK-108','MK-223','MK-192',
  'MK-69','MK-172','MK-173','MK-178','MK-179',
  'MK-212','MK-214','MK-217','MK-220','MK-159',
  'MK-222','MK-170','MK-176','MK-188','MK-149'
];

function normalizeMachine(value){
  const digits=String(value||'').match(/\d{2,3}/)?.[0];
  return digits?`MK-${Number(digits)}`:'';
}

function parseDataUrl(dataUrl){
  const m=String(dataUrl||'').match(
    /^data:(image\/[^;]+);base64,(.+)$/s
  );

  return m
    ?{mimeType:m[1],data:m[2]}
    :null;
}

function extractJson(text){
  const clean=String(text||'')
    .trim()
    .replace(/^```json\s*/i,'')
    .replace(/^```\s*/,'')
    .replace(/\s*```$/,'')
    .trim();

  try{
    return JSON.parse(clean);
  }catch{}

  const a=clean.indexOf('{');
  const b=clean.lastIndexOf('}');

  if(a>=0 && b>a){
    return JSON.parse(clean.slice(a,b+1));
  }

  throw new Error('JSON do Gemini não pôde ser interpretado.');
}

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    return res.status(405).json({
      ok:false,
      error:'Use POST.'
    });
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
      rowImages=[],
      scope
    }=req.body||{};

    if(!Array.isArray(rowImages) || rowImages.length<1){
      return res.status(400).json({
        ok:false,
        error:'Nenhuma linha individual recebida.'
      });
    }

    const scopeLabel=scope?.label||'';

    const parts=[];

    parts.push({
      text:
`Você receberá imagens individuais de linhas de um quadro industrial.
Cada imagem é precedida pelo nome EXATO da máquina correspondente.

Para cada imagem:
- leia SOMENTE o percentual OEE manuscrito de 0 a 100;
- ignore produção em peças, nomes, OP, meta e outros números;
- nunca use número sem contexto de percentual como OEE;
- se não houver percentual legível, use null;
- nunca atribua um valor a outra máquina;
- description deve explicar brevemente o que foi lido.

Escopo: ${scopeLabel}.

Retorne TODAS as máquinas em JSON:
{
  "rows":[
    {
      "machine":"MK-138",
      "oee":64,
      "confidence":90,
      "description":"64% lido; 583.740 é produção."
    }
  ]
}`
    });

    for(const item of rowImages){
      const machine=normalizeMachine(item.machine);
      const image=parseDataUrl(item.dataUrl);

      if(!machine || !image){
        continue;
      }

      parts.push({
        text:`MÁQUINA: ${machine}. Leia somente esta imagem.`
      });

      parts.push({
        inlineData:{
          mimeType:image.mimeType,
          data:image.data
        }
      });
    }

    const url=
      `https://generativelanguage.googleapis.com/v1beta/models/`+
      `${encodeURIComponent(MODEL)}:generateContent`;

    const gr=await fetch(url,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-goog-api-key':key
      },
      body:JSON.stringify({
        contents:[{
          role:'user',
          parts
        }],
        generationConfig:{
          temperature:0,
          responseMimeType:'application/json'
        }
      })
    });

    const body=await gr.json();

    if(!gr.ok){
      return res.status(gr.status).json({
        ok:false,
        error:body?.error?.message||`Gemini HTTP ${gr.status}`,
        model:MODEL
      });
    }

    const text=(body?.candidates?.[0]?.content?.parts||[])
      .map(part=>part.text||'')
      .join('')
      .trim();

    if(!text){
      return res.status(502).json({
        ok:false,
        error:'Gemini respondeu sem conteúdo.',
        model:MODEL
      });
    }

    const parsed=extractJson(text);

    const incoming=new Map(
      (parsed.rows||[]).map(row=>[
        normalizeMachine(row.machine),
        row
      ])
    );

    const rows=MACHINES.map(machine=>{
      const row=incoming.get(machine)||{};
      const n=Number(row.oee);

      const valid=
        row.oee!==null &&
        row.oee!==undefined &&
        row.oee!=='' &&
        Number.isFinite(n) &&
        n>=0 &&
        n<=100;

      return {
        machine,
        oee:valid?n:null,
        confidence:Math.max(
          0,
          Math.min(
            100,
            Number(row.confidence||0)
          )
        ),
        anchorFound:true,
        rowChecked:true,
        evidence:String(row.description||''),
        description:String(
          row.description||
          (
            valid
              ?`${n}% identificado nesta imagem.`
              :'Sem percentual legível nesta imagem.'
          )
        )
      };
    });

    const nonNull=rows.filter(row=>row.oee!==null).length;

    return res.status(200).json({
      ok:true,
      provider:'gemini',
      model:MODEL,
      returned:rows.length,
      nonNull,
      rows
    });

  }catch(error){
    return res.status(500).json({
      ok:false,
      error:String(error?.message||error),
      model:MODEL
    });
  }
};
