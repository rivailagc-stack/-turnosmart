const https=require('https');

const MACHINES=[
  'MK-138','MK-105','MK-108','MK-223','MK-192',
  'MK-69','MK-172','MK-173','MK-178','MK-179',
  'MK-212','MK-214','MK-217','MK-220','MK-159',
  'MK-222','MK-170','MK-176','MK-188','MK-149'
];

function send(res,status,body){
  return res.status(status).json(body);
}

function requestOpenAI(payload){
  const apiKey=process.env.OPENAI_API_KEY;

  if(!apiKey){
    return Promise.resolve(null);
  }

  const body=JSON.stringify(payload);

  return new Promise((resolve,reject)=>{
    const request=https.request({
      method:'POST',
      hostname:'api.openai.com',
      path:'/v1/responses',
      headers:{
        Authorization:`Bearer ${apiKey}`,
        'Content-Type':'application/json',
        'Content-Length':Buffer.byteLength(body)
      }
    },response=>{
      let text='';

      response.on('data',chunk=>text+=chunk);

      response.on('end',()=>{
        let data={};

        try{
          data=text?JSON.parse(text):{};
        }catch{
          return reject(new Error('Resposta inválida da IA visual.'));
        }

        if(response.statusCode<200||response.statusCode>=300){
          return reject(new Error(
            data?.error?.message||
            `Erro da IA visual ${response.statusCode}`
          ));
        }

        resolve(data);
      });
    });

    request.on('error',reject);
    request.write(body);
    request.end();
  });
}

function responseText(response){
  if(typeof response?.output_text==='string'){
    return response.output_text;
  }

  const parts=[];

  for(const item of response?.output||[]){
    for(const content of item?.content||[]){
      if(typeof content?.text==='string'){
        parts.push(content.text);
      }
    }
  }

  return parts.join('\n');
}

function normalizeMachine(value){
  const text=String(value||'').toUpperCase().replace(/\s+/g,'');
  const match=text.match(/(?:MK[-_]?|M[_-]?|^)(\d{2,3})/);
  if(!match)return '';
  return `MK-${Number(match[1])}`;
}

function normalizeRows(rows=[]){
  const map=new Map();

  for(const item of rows){
    const machine=normalizeMachine(item?.machine);
    if(!MACHINES.includes(machine))continue;

    const rawOee=item?.oee;
    const oee=rawOee===null||rawOee===undefined||rawOee===''
      ? null
      : Number(rawOee);

    const confidence=Math.max(
      0,
      Math.min(100,Number(item?.confidence||0))
    );

    map.set(machine,{
      machine,
      oee:Number.isFinite(oee)&&oee>=0&&oee<=100?oee:null,
      confidence,
      evidence:String(item?.evidence||'').slice(0,120)
    });
  }

  return MACHINES.map(machine=>
    map.get(machine)||{
      machine,
      oee:null,
      confidence:0,
      evidence:'Não identificado'
    }
  );
}

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return send(res,405,{
      ok:false,
      error:'Método não permitido.'
    });
  }

  try{
    if(!process.env.OPENAI_API_KEY){
      return send(res,503,{
        ok:false,
        error:'OPENAI_API_KEY não configurada.'
      });
    }

    const imageDataUrl=req.body?.imageDataUrl;
    const scope=req.body?.scope||{};
    const selectedDate=String(req.body?.date||'');
    const selectedShift=String(req.body?.shift||'1');

    if(!imageDataUrl || !String(imageDataUrl).startsWith('data:image/')){
      return send(res,400,{
        ok:false,
        error:'Foto do quadro obrigatória.'
      });
    }

    const prompt=`
Você é um leitor visual especializado em quadros de produção industrial escritos à mão.

OBJETIVO:
Ler o OEE (%) de cada máquina na FOTO INTEIRA do quadro, sem recortar a imagem.

CONTEXTO DO TURNO:
- Data selecionada no aplicativo: ${selectedDate||'não informada'}
- Turno selecionado: ${selectedShift==='2'?'B':'A'}
- Escopo esperado: ${scope.label||'coluna correspondente à data/turno selecionado'}

ORDEM EXATA DAS MÁQUINAS NA PRIMEIRA COLUNA:
${MACHINES.join(', ')}

REGRAS CRÍTICAS:
1. Leia SOMENTE o percentual OEE da célula correspondente à máquina e ao dia/turno selecionado.
2. NÃO confunda:
   - código da máquina;
   - quantidade de peças (ex.: 45.600, 67.320);
   - meta do cabeçalho;
   - número de OP;
   - número escrito em outra linha;
   - percentual de outra coluna/dia/turno.
3. O OEE normalmente é escrito à mão no final da anotação da linha e está entre 0% e 100%.
4. Use a posição vertical da máquina impressa na primeira coluna como âncora da linha.
5. Use a posição horizontal da coluna selecionada como âncora do turno.
6. Se o valor não estiver realmente legível, devolva null. NÃO adivinhe.
7. MK-138 é MK-138 (não MK-130).
8. MK-223 é MK-223; nunca use os dígitos "22" ou "23" do código como OEE de outra máquina.
9. Confiança:
   - 95-100: claramente legível;
   - 80-94: muito provável;
   - 60-79: provável mas merece conferência;
   - abaixo de 60: use null.
10. Preserve todas as máquinas na resposta, inclusive as que não possuem OEE.

Responda SOMENTE JSON válido neste formato:
{
  "scope":"descrição curta da coluna lida",
  "rows":[
    {
      "machine":"MK-138",
      "oee":62,
      "confidence":95,
      "evidence":"percentual 62% visível na mesma linha"
    }
  ]
}
`;

    const response=await requestOpenAI({
      model:process.env.OPENAI_MODEL||'gpt-4.1-mini',
      input:[{
        role:'user',
        content:[
          {
            type:'input_text',
            text:prompt
          },
          {
            type:'input_image',
            image_url:imageDataUrl,
            detail:'high'
          }
        ]
      }],
      max_output_tokens:1800
    });

    const text=responseText(response)
      .replace(/^```json\s*/i,'')
      .replace(/```$/,'')
      .trim();

    let parsed;

    try{
      parsed=JSON.parse(text);
    }catch{
      throw new Error('A IA visual não devolveu JSON válido.');
    }

    const rows=normalizeRows(parsed?.rows||[]);
    const detected=rows.filter(row=>row.oee!==null).length;

    return send(res,200,{
      ok:true,
      source:'openai-vision',
      scope:parsed?.scope||scope.label||'',
      detected,
      rows
    });
  }catch(error){
    return send(res,500,{
      ok:false,
      error:error.message
    });
  }
};
