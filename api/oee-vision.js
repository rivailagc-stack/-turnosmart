const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';

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

function extractInteractionText(body){
  // Schema atual da Interactions API: steps[]
  const texts=[];

  for(const step of body?.steps||[]){
    if(step?.type==='model_output'){
      for(const content of step?.content||[]){
        if(content?.type==='text' && content?.text){
          texts.push(content.text);
        }
      }
    }

    // fallback tolerante
    if(step?.text){
      texts.push(step.text);
    }
  }

  if(texts.length){
    return texts.join('').trim();
  }

  // Compatibilidade defensiva com possíveis convenience/raw outputs.
  if(typeof body?.output_text==='string'){
    return body.output_text.trim();
  }

  for(const output of body?.outputs||[]){
    if(output?.type==='text' && output?.text){
      texts.push(output.text);
    }
  }

  return texts.join('').trim();
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

    const input=[
      {
        type:'text',
        text:
`Você receberá 20 imagens individuais de linhas de um quadro industrial.

Cada imagem é precedida pelo nome EXATO da máquina correspondente.

Escopo: ${scopeLabel}.

Para CADA imagem:
1. Leia SOMENTE o percentual OEE manuscrito de 0 a 100.
2. Ignore produção em peças, nomes, OP, meta, semana e outros números.
3. Exemplo: "49.000 55%" => OEE é 55; 49.000 é produção.
4. Nunca use número da máquina como OEE.
5. Nunca atribua valor a outra máquina.
6. Se não houver percentual legível, use null.
7. Não invente.
8. confidence deve ser inteiro de 0 a 100.
9. description deve explicar de forma curta o que foi lido.
10. Retorne exatamente as 20 máquinas.`
      }
    ];

    for(const item of rowImages){
      const machine=normalizeMachine(item.machine);
      const image=parseDataUrl(item.dataUrl);

      if(!machine || !image){
        continue;
      }

      input.push({
        type:'text',
        text:`MÁQUINA ${machine} — leia somente a próxima imagem para esta máquina.`
      });

      input.push({
        type:'image',
        data:image.data,
        mime_type:image.mimeType
      });
    }

    const schema={
      type:'object',
      properties:{
        rows:{
          type:'array',
          items:{
            type:'object',
            properties:{
              machine:{
                type:'string',
                description:'Código da máquina, ex: MK-138.'
              },
              oee:{
                type:['number','null'],
                description:'Percentual OEE de 0 a 100, ou null se ilegível.'
              },
              confidence:{
                type:'integer',
                description:'Confiança da leitura de 0 a 100.'
              },
              description:{
                type:'string',
                description:'Descrição curta da leitura e do número ignorado, se houver.'
              }
            },
            required:[
              'machine',
              'oee',
              'confidence',
              'description'
            ],
            additionalProperties:false
          }
        }
      },
      required:['rows'],
      additionalProperties:false
    };

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
        input,
        store:false,
        generation_config:{
          thinking_level:'low'
        },
        response_format:{
          type:'text',
          mime_type:'application/json',
          schema
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

    const text=extractInteractionText(body);

    if(!text){
      return res.status(502).json({
        ok:false,
        error:'Gemini respondeu sem texto estruturado.',
        model:MODEL,
        api:'interactions',
        diagnostic:{
          status:body?.status||'',
          stepTypes:(body?.steps||[]).map(s=>s?.type).filter(Boolean)
        }
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
      api:'interactions',
      model:MODEL,
      returned:rows.length,
      nonNull,
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
