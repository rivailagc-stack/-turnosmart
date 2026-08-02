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
Você é um instrutor sênior de manutenção industrial.
Analise a imagem ou quadro do vídeo e crie uma aula completa em português brasileiro.

Contexto:
- Máquina: ${context.machine||'uso geral'}
- Família: ${context.machineTypeLabel||context.machineType||'não informada'}
- Componente sugerido: ${context.component||'não informado'}
- Grupo técnico: ${context.componentGroup||'não informado'}
- Problema/regulagem: ${context.problemType||'não informado'}
- Categoria: ${context.category||'não informada'}
- Observações: ${context.notes||'nenhuma'}
- SGMan: ${(context.sgmanReferences||[]).join(' | ')}

A aula deve conter:
- identificação do componente;
- função e princípio de funcionamento;
- portas, terminais, conexões, placa, código ou símbolo;
- instrumentos e ferramentas;
- inspeção visual;
- como testar eletricamente, mecanicamente, pneumaticamente,
  hidraulicamente ou pelo CLP;
- como separar alimentação, comando, componente e carga;
- sintomas, causas e defeitos comuns;
- confirmação da causa antes de trocar peças;
- segurança e bloqueio;
- teste final e critério de liberação;
- registro no SGMan.

Não invente tensão, resistência, torque, folga ou pressão.
Quando depender do modelo, mande consultar placa, manual ou componente igual.
Nunca ensine a anular relé, proteção ou circuito de segurança.
Gere entre 8 e 16 passos.

Responda somente JSON válido:
{
  "component":"componente identificado",
  "componentGroup":"Pneumática, Elétrica, Automação, Mecânica, Hidráulica, Instrumentação ou Geral",
  "principle":"como funciona",
  "description":"objetivo e aplicação",
  "tools":"instrumentos e ferramentas",
  "steps":"passos numerados",
  "faults":"defeitos, sintomas e causas numerados",
  "safety":"bloqueio e cuidados",
  "validation":"teste final e liberação",
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
