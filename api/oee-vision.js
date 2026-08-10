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

  if(!apiKey)return Promise.resolve(null);

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
  const text=String(value||'')
    .toUpperCase()
    .replace(/\s+/g,'');

  const match=text.match(/(?:MK[-_]?|M[_-]?|^)(\d{2,3})/);

  if(!match)return '';

  return `MK-${Number(match[1])}`;
}

function normalizeRows(rows=[]){
  const map=new Map();

  for(const item of rows){
    const machine=normalizeMachine(item?.machine);

    if(!MACHINES.includes(machine))continue;

    const raw=item?.oee;
    const oee=raw===null||raw===undefined||raw===''
      ? null
      : Number(raw);

    const confidence=Math.max(
      0,
      Math.min(100,Number(item?.confidence||0))
    );

    map.set(machine,{
      machine,
      oee:Number.isFinite(oee)&&oee>=0&&oee<=100?oee:null,
      confidence,
      evidence:String(item?.evidence||'').slice(0,160),
      anchorFound:Boolean(item?.anchorFound),
      rowChecked:Boolean(item?.rowChecked)
    });
  }

  return MACHINES.map(machine=>
    map.get(machine)||{
      machine,
      oee:null,
      confidence:0,
      evidence:'Não identificado',
      anchorFound:false,
      rowChecked:true
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

    const shiftLabel=selectedShift==='2'?'B':'A';

    const prompt=`
Você é um inspetor visual especializado em quadros industriais manuscritos.

TAREFA:
Extrair o OEE (%) de cada máquina da FOTO INTEIRA.

IMPORTANTE:
NÃO faça OCR geral da imagem.
Você DEVE trabalhar LINHA POR LINHA.

DATA SELECIONADA:
${selectedDate||'não informada'}

TURNO:
${shiftLabel}

ESCOPO:
${scope.label||'coluna correspondente à data e turno selecionados'}

ORDEM VERTICAL EXATA DAS MÁQUINAS:
${MACHINES.map((m,i)=>`${i+1}. ${m}`).join('\n')}

MÉTODO OBRIGATÓRIO PARA CADA MÁQUINA:

ETAPA 1 — LOCALIZE A ÂNCORA
Localize visualmente o código impresso da máquina na primeira coluna.
Exemplo: para MK-172, encontre o número impresso "172".

ETAPA 2 — TRACE A LINHA
Imagine uma linha horizontal saindo do centro do código impresso da máquina.

ETAPA 3 — ENTRE NA COLUNA CORRETA
Siga essa MESMA linha horizontal até a coluna correspondente ao dia e turno selecionados.

ETAPA 4 — LEIA SOMENTE O PERCENTUAL
Dentro dessa célula, procure um valor manuscrito com "%" ou um número que claramente represente percentual de OEE.

ETAPA 5 — VALIDE A MESMA LINHA
Antes de aceitar o número, confirme que ele está verticalmente dentro da mesma linha da máquina.
Se o número estiver acima ou abaixo da linha, NÃO use.

ETAPA 6 — NÃO CONFUNDA
Nunca use como OEE:
- o código da própria máquina;
- quantidade produzida (ex.: 45.600, 67.320, 90.800);
- OP;
- meta diária;
- OEE geral do cabeçalho;
- percentual da máquina acima;
- percentual da máquina abaixo;
- número de outra coluna;
- horário;
- qualquer anotação sem relação com a mesma linha.

EXEMPLO DE ERRO PROIBIDO:
Se existe MK-223, o número "223", "22" ou "23" NÃO pode ser lido como OEE da MK-108.
Se existe MK-149, "149" NÃO é percentual.
Se existe "45.600 80%", o OEE é 80 e 45.600 é produção.

VALIDAÇÃO DE ÂNCORA:
Para devolver um OEE diferente de null, anchorFound DEVE ser true.
Isso significa que você localizou primeiro a máquina impressa e depois seguiu a mesma linha.

CONFIANÇA:
95-100 = percentual claramente visível na mesma linha.
85-94 = muito provável e alinhamento correto.
70-84 = legível, mas existe pequena dúvida.
Abaixo de 70 = devolva null.

REGRA DE NÃO ADIVINHAR:
Se não encontrar percentual confiável na linha, devolva null.
É MELHOR deixar uma máquina sem valor do que associar o valor errado.

REVISÃO FINAL:
Antes de responder:
1. confira cada máquina novamente;
2. verifique se nenhum percentual foi duplicado em duas máquinas por engano;
3. verifique se nenhum código de máquina virou OEE;
4. verifique se nenhum número de produção virou OEE;
5. confira especialmente MK-108/MK-223, MK-172/MK-173 e MK-222/MK-170.

RESPONDA SOMENTE JSON VÁLIDO:
{
  "scope":"coluna identificada",
  "rows":[
    {
      "machine":"MK-138",
      "anchorFound":true,
      "rowChecked":true,
      "oee":62,
      "confidence":96,
      "evidence":"âncora 138 localizada; 62% está na mesma linha e na coluna selecionada"
    },
    {
      "machine":"MK-108",
      "anchorFound":true,
      "rowChecked":true,
      "oee":null,
      "confidence":0,
      "evidence":"linha localizada, mas sem percentual legível"
    }
  ]
}

Inclua TODAS as ${MACHINES.length} máquinas na resposta e mantenha exatamente a ordem fornecida.
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
      max_output_tokens:2600
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

    let rows=normalizeRows(parsed?.rows||[]);

    // Segurança adicional:
    // sem âncora ou sem confirmação de linha => OEE descartado.
    rows=rows.map(row=>{
      if(
        row.oee!==null &&
        (!row.anchorFound || !row.rowChecked || row.confidence<70)
      ){
        return {
          ...row,
          oee:null,
          evidence:`Descartado por segurança: ${row.evidence}`
        };
      }

      return row;
    });

    const detected=rows.filter(row=>row.oee!==null).length;

    return send(res,200,{
      ok:true,
      source:'openai-vision-line-anchor',
      mode:'machine-row-anchor',
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
