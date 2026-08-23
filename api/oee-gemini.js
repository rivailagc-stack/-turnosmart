const DEFAULT_MODEL='gemini-2.5-flash';

function parseDataUrl(value){
  const match=String(value||'').match(/^data:(image\/[^;]+);base64,(.+)$/s);
  return match?{mimeType:match[1],data:match[2]}:null;
}

function responseText(body){
  return (body?.candidates?.[0]?.content?.parts||[])
    .map(part=>part?.text||'')
    .join('')
    .trim();
}

function parseJson(text){
  const clean=String(text||'')
    .trim()
    .replace(/^```json\s*/i,'')
    .replace(/^```\s*/,'')
    .replace(/\s*```$/,'')
    .trim();

  try{return JSON.parse(clean);}catch{}

  const start=clean.indexOf('{');
  const end=clean.lastIndexOf('}');
  if(start>=0&&end>start){
    return JSON.parse(clean.slice(start,end+1));
  }

  throw new Error('Gemini não retornou JSON válido.');
}

function normalizeMachine(value){
  const match=String(value||'').match(/\d{1,3}/);
  return match?`MK-${String(Number(match[0])).padStart(2,'0')}`:'';
}

module.exports=async function handler(req,res){
  if(req.method!=='POST'){
    return res.status(405).json({ok:false,error:'Use POST.'});
  }

  const key=
    process.env.GEMINI_API_KEY||
    process.env.GOOGLE_API_KEY;

  if(!key){
    return res.status(503).json({
      ok:false,
      error:'GEMINI_API_KEY não configurada na Vercel.'
    });
  }

  try{
    const body=typeof req.body==='string'
      ?JSON.parse(req.body)
      :(req.body||{});

    const image=parseDataUrl(body.imageDataUrl);
    if(!image){
      return res.status(400).json({ok:false,error:'Imagem da coluna não recebida.'});
    }

    const machines=(body.machines||[])
      .map(normalizeMachine)
      .filter(Boolean);

    const scope=body.scope||{};
    const examples=Array.isArray(body.examples)
      ?body.examples.slice(-3)
      :[];

    const instruction=`
Você lê UMA COLUNA RECORTADA do quadro semanal de OEE da Ecopack.

Coluna atual: ${scope.label||''}.

As linhas, de cima para baixo, são EXATAMENTE:
${machines.join(', ')}.

Sua tarefa:
- ler somente o OEE percentual de cada linha;
- usar a ordem vertical acima;
- ignorar produção, nomes, horários e outros números;
- célula vazia = null;
- leitura duvidosa = null;
- nunca inventar;
- nunca transformar vazio em 0;
- 0 só é válido quando "0%" estiver claramente escrito;
- cuidado especial com escrita manual: 2/6, 3/5, 3/8, 4/7, 5/6 e 1/7.

Você também recebe abaixo exemplos que o supervisor CORRIGIU.
Eles mostram como a escrita deste quadro deve ser interpretada.
Use os exemplos como referência visual, mas NÃO copie seus números para a foto atual.

Retorne SOMENTE JSON:
{
  "rows":[
    {
      "machine":"MK-149",
      "oee":62,
      "confidence":94,
      "evidence":"62%",
      "reason":"62% está visível na linha da MK-149"
    }
  ]
}

Inclua todas as máquinas. Quando não houver leitura segura:
{"machine":"MK-149","oee":null,"confidence":0,"evidence":"","reason":"sem leitura segura"}
`;

    const parts=[{text:instruction}];

    for(let index=0;index<examples.length;index++){
      const example=examples[index];
      const exImage=parseDataUrl(example.imageDataUrl);
      if(!exImage)continue;

      const correctRows=(example.rows||[])
        .map(row=>({
          machine:normalizeMachine(row.machine),
          oee:Number(row.oee)
        }))
        .filter(row=>row.machine&&Number.isFinite(row.oee));

      parts.push({
        text:
          `EXEMPLO CORRIGIDO ${index+1}. Coluna: ${example.scope||example.column||'não informada'}. `+
          `A imagem seguinte foi conferida pelo supervisor.`
      });
      parts.push({
        inlineData:{
          mimeType:exImage.mimeType,
          data:exImage.data
        }
      });
      parts.push({
        text:`RESPOSTA CORRETA DO EXEMPLO ${index+1}: ${JSON.stringify(correctRows)}`
      });
    }

    parts.push({
      text:
        `AGORA ANALISE A FOTO ATUAL da coluna ${scope.label||''}. `+
        `Não copie os valores dos exemplos.`
    });
    parts.push({
      inlineData:{
        mimeType:image.mimeType,
        data:image.data
      }
    });

    const model=process.env.GEMINI_MODEL||DEFAULT_MODEL;

    const response=await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
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
            responseMimeType:'application/json',
            temperature:0.1
          }
        })
      }
    );

    const result=await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(
        result?.error?.message||
        `Gemini HTTP ${response.status}`
      );
    }

    const parsed=parseJson(responseText(result));
    const map=new Map(
      (parsed.rows||[])
        .map(row=>[normalizeMachine(row.machine),row])
        .filter(([machine])=>machine)
    );

    const rows=machines.map(machine=>{
      const row=map.get(machine)||{};
      const raw=row.oee;
      const has=raw!==null&&raw!==undefined&&raw!=='';
      const oee=has?Number(raw):null;

      return {
        machine,
        oee:
          Number.isFinite(oee)&&
          oee>=0&&
          oee<=100
            ?oee
            :null,
        confidence:Math.max(
          0,
          Math.min(100,Number(row.confidence||0))
        ),
        evidence:String(row.evidence||''),
        reason:String(row.reason||'')
      };
    });

    return res.status(200).json({
      ok:true,
      model,
      examplesUsed:examples.length,
      rows
    });

  }catch(error){
    console.error('oee-gemini:',error);
    return res.status(502).json({
      ok:false,
      error:String(error?.message||error)
    });
  }
};
