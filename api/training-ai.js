const https=require('https');

function send(res,status,body){
  res.status(status).json(body);
}

function requestOpenAI(body){
  const key=process.env.OPENAI_API_KEY;

  if(!key){
    return Promise.resolve(null);
  }

  const payload=JSON.stringify(body);

  return new Promise((resolve,reject)=>{
    const req=https.request({
      method:'POST',
      hostname:'api.openai.com',
      path:'/v1/responses',
      headers:{
        Authorization:`Bearer ${key}`,
        'Content-Type':'application/json',
        'Content-Length':Buffer.byteLength(payload)
      }
    },response=>{
      let text='';

      response.on('data',chunk=>text+=chunk);

      response.on('end',()=>{
        let data={};

        try{
          data=text?JSON.parse(text):{};
        }catch{
          return reject(new Error('Resposta inválida da IA.'));
        }

        if(response.statusCode<200||response.statusCode>=300){
          return reject(new Error(
            data?.error?.message||
            `Erro da IA ${response.statusCode}`
          ));
        }

        resolve(data);
      });
    });

    req.on('error',reject);
    req.write(payload);
    req.end();
  });
}

function outputText(response){
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

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return send(res,405,{ok:false,error:'Método não permitido.'});
  }

  try{
    const imageDataUrl=req.body?.imageDataUrl;
    const context=req.body?.context||{};

    if(!imageDataUrl){
      return send(res,400,{
        ok:false,
        error:'Imagem obrigatória para análise.'
      });
    }

    if(!process.env.OPENAI_API_KEY){
      return send(res,503,{
        ok:false,
        error:'OPENAI_API_KEY não configurada.'
      });
    }

    const prompt=`
Você é um especialista em manutenção industrial da Ecopack Brasil.
Analise a imagem enviada e crie uma pequena lição prática em português brasileiro.

Contexto:
- Máquina: ${context.machine||'geral'}
- Tipo de máquina: ${context.machineTypeLabel||context.machineType||'não informado'}
- Problema ou regulagem: ${context.problemType||'não informado'}
- Categoria: ${context.category||'não informada'}
- Observações: ${context.notes||'nenhuma'}
- Referências recentes do SGMan: ${(context.sgmanReferences||[]).join(' | ')}

Regras:
1. Não invente detalhes que não sejam visíveis ou informados.
2. Faça uma lição curta, clara e técnica.
3. Entregue de 6 a 10 passos numerados.
4. Inclua bloqueio, segurança, teste e acompanhamento.
5. Foque em regulagem, diagnóstico e prevenção de retrabalho.
6. Use linguagem simples para mecânicos e líderes.
7. Responda somente JSON válido com:
{
  "description":"objetivo da lição",
  "steps":"passos numerados em uma única string",
  "safety":"cuidados de segurança",
  "validation":"como testar, acompanhar e liberar",
  "keywords":["palavra 1","palavra 2"]
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
            image_url:imageDataUrl
          }
        ]
      }],
      max_output_tokens:1200
    });

    const text=outputText(response)
      .replace(/^```json\s*/i,'')
      .replace(/```$/,'')
      .trim();

    let lesson;

    try{
      lesson=JSON.parse(text);
    }catch{
      throw new Error('A IA não devolveu o formato de lição esperado.');
    }

    return send(res,200,{
      ok:true,
      lesson
    });
  }catch(error){
    return send(res,500,{
      ok:false,
      error:error.message
    });
  }
};
