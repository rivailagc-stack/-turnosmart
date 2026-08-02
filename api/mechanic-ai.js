const https=require('https');

function send(res,status,body){
  res.status(status).json(body);
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
          return reject(new Error('Resposta inválida da inteligência artificial.'));
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

    request.on('error',reject);
    request.write(body);
    request.end();
  });
}

function responseText(response){
  if(typeof response?.output_text==='string'){
    return response.output_text;
  }

  const texts=[];

  for(const item of response?.output||[]){
    for(const content of item?.content||[]){
      if(typeof content?.text==='string'){
        texts.push(content.text);
      }
    }
  }

  return texts.join('\n');
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

    const body=req.body||{};
    const organization=body.organization||{};
    const references=Array.isArray(body.sgmanReferences)
      ? body.sgmanReferences
      : [];

    const prompt=`
Você é o Mecânico IA de uma plataforma profissional de manutenção industrial.

Empresa: ${organization.companyName||'não informada'}
Unidade: ${organization.unitName||'não informada'}
Departamento: ${organization.departmentName||'Manutenção'}
Máquina: ${body.machine||'aplicação geral'}
Componente: ${body.component||'não informado'}
Tipo de orientação: ${body.mode||'diagnosis'}
Prioridade: ${body.priority||'normal'}
Pergunta ou sintoma: ${body.problem||'não informado'}

Histórico relevante do SGMan:
${references.length
  ? references.map((item,index)=>`${index+1}. ${item}`).join('\n')
  : 'Nenhuma referência disponível.'}

Resumo da consulta:
${body.historySummary
  ? JSON.stringify(body.historySummary)
  : 'Sem resumo disponível.'}

Crie uma resposta técnica em português brasileiro.

Regras:
1. Comece pelos testes mais rápidos, seguros e prováveis.
2. Separe alimentação, comando, componente, carga mecânica e lógica.
3. Não mande trocar peça sem confirmar a causa.
4. Não invente tensão, resistência, pressão, torque ou folga.
5. Quando depender do modelo, oriente consultar placa, manual ou componente igual.
6. Inclua bloqueio e energias residuais.
7. Nunca ensine a burlar CLP, relé de segurança, cortina de luz ou intertravamento.
8. Use o histórico do SGMan como referência, não como prova definitiva.
9. Para máquina parada, priorize restauração segura e depois causa raiz.
10. Para reincidência, inclua ação preventiva e forma de evitar retorno.
11. Responda de modo curto, direto e utilizável no chão de fábrica.

Responda somente JSON válido:
{
  "title":"título da orientação",
  "summary":"entendimento técnico da situação",
  "immediateActions":["ação 1","ação 2","ação 3"],
  "tests":"testes numerados em uma única string",
  "probableCauses":"causas prováveis numeradas",
  "safety":"cuidados e bloqueio",
  "releaseCriteria":"como testar, acompanhar e liberar",
  "sgmanRecord":"o que registrar na OS",
  "confidence":"alta, média ou baixa, com justificativa curta"
}
`;

    const response=await requestOpenAI({
      model:process.env.OPENAI_MODEL||'gpt-4.1-mini',
      input:[{
        role:'user',
        content:[{
          type:'input_text',
          text:prompt
        }]
      }],
      max_output_tokens:1600
    });

    const text=responseText(response)
      .replace(/^```json\s*/i,'')
      .replace(/```$/,'')
      .trim();

    let answer;

    try{
      answer=JSON.parse(text);
    }catch{
      throw new Error('A IA não devolveu o formato técnico esperado.');
    }

    return send(res,200,{
      ok:true,
      answer
    });
  }catch(error){
    return send(res,500,{
      ok:false,
      error:error.message
    });
  }
};
