
const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';

const MACHINES=[
  'MK-138','MK-105','MK-108','MK-223','MK-192',
  'MK-69','MK-172','MK-173','MK-178','MK-179',
  'MK-212','MK-214','MK-217','MK-220','MK-159',
  'MK-222','MK-170','MK-176','MK-188','MK-149'
];

function parseDataUrl(value){
  const m=String(value||'').match(/^data:(image\/[^;]+);base64,(.+)$/s);
  return m?{mimeType:m[1],data:m[2]}:null;
}

function normalizeMachine(value){
  const d=String(value||'').match(/\d{2,3}/)?.[0];
  return d?`MK-${Number(d)}`:'';
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
  const clean=String(text||'')
    .trim()
    .replace(/^```json\s*/i,'')
    .replace(/^```\s*/,'')
    .replace(/\s*```$/,'')
    .trim();

  try{return JSON.parse(clean);}catch{}

  const a=clean.indexOf('{');
  const b=clean.lastIndexOf('}');

  if(a>=0&&b>a){
    return JSON.parse(clean.slice(a,b+1));
  }

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
      scope
    }=req.body||{};

    const full=parseDataUrl(fullBoardDataUrl||imageDataUrl);

    if(!full){
      return res.status(400).json({
        ok:false,
        error:'Foto completa não recebida.'
      });
    }

    const label=String(scope?.label||'').trim();

    const instruction=`
Você está vendo UMA FOTO COMPLETA de um quadro industrial chamado
"QUADRO DE ACOMPANHAMENTO DE OEE SEMANAL".

TAREFA:
Ler SOMENTE a coluna "${label}" diretamente na FOTO COMPLETA.

A estrutura física é:
- à esquerda existem as linhas das máquinas;
- no topo existem dias da semana;
- cada dia possui turno A e turno B;
- cada máquina ocupa uma linha horizontal;
- dentro de cada célula podem existir nome, produção e OEE;
- OEE normalmente aparece como número seguido de %.

MÁQUINAS, NESTA ORDEM VERTICAL:
${MACHINES.join(', ')}

PROCEDIMENTO OBRIGATÓRIO PARA CADA MK:
1. Localize no topo o cabeçalho "${label}".
2. Desça verticalmente exatamente na mesma coluna.
3. Localize horizontalmente a linha da máquina usando a coluna de MK à esquerda.
4. Leia SOMENTE a interseção dessa linha com "${label}".
5. Se houver percentual legível, retorne o OEE.
6. Se a célula estiver vazia, retorne blank.
7. Se houver informação mas nenhum percentual confiável, retorne unreadable.
8. Se ficar claro que a máquina não rodou/sem apontamento, retorne not_running.

PROIBIDO:
- usar valor da coluna anterior ou seguinte;
- usar valor da linha acima ou abaixo;
- transformar produção em OEE;
- transformar 61.300 em 61%;
- inferir OEE pela cor;
- inventar percentual;
- usar OEE geral do turno como OEE da máquina.

VALIDAÇÃO:
columnConfirmed=true SOMENTE se você identificou visualmente o cabeçalho "${label}" e permaneceu nessa coluna.
rowConfirmed=true SOMENTE se você conferiu a linha da MK pela coluna da esquerda.
percentVisible=true SOMENTE se houver percentual visualmente legível na célula.
confidence 0-100.

Retorne TODAS as 20 máquinas.

JSON EXATO:
{
  "rows":[
    {
      "machine":"MK-172",
      "status":"oee|blank|not_running|unreadable",
      "oee":68,
      "confidence":96,
      "columnConfirmed":true,
      "rowConfirmed":true,
      "percentVisible":true,
      "evidence":"68%",
      "description":"68% visível na linha MK-172 e coluna correta."
    }
  ]
}
`;

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
        input:[
          {type:'text',text:instruction},
          {
            type:'image',
            data:full.data,
            mime_type:full.mimeType
          }
        ],
        store:false,
        generation_config:{
          thinking_level:'high'
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
        columnConfirmed:Boolean(r.columnConfirmed),
        rowConfirmed:Boolean(r.rowConfirmed),
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
      mode:'full-board-only',
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
