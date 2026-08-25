const DEFAULT_MODEL='gemini-3.6-flash';

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
    const columnImage=parseDataUrl(body.columnImageDataUrl);
    const comparisonImage=parseDataUrl(body.comparisonImageDataUrl);
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
Você é um leitor visual de um QUADRO SEMANAL DE OEE da Ecopack Brasil.

IMPORTANTE:
A imagem atual mostra o QUADRO INTEIRO, não apenas uma célula.

Sua primeira tarefa é localizar visualmente a coluna:
${scope.label||''}

Depois siga cada linha horizontalmente a partir dos códigos de máquina na esquerda.

A ordem das máquinas no quadro é EXATAMENTE:
${machines.join(', ')}

REGRAS:
1. Leia SOMENTE a coluna ${scope.label||''}.
2. Para cada MK, use a linha horizontal correta.
3. Dentro da célula existem nomes, produção, horários e comentários.
4. OEE é o percentual escrito na célula, normalmente acompanhado de %.
5. Ignore números grandes de produção, como 31.200, 48.540, 69.100.
6. Ignore horários, contagens, nomes e números sem relação com OEE.
7. Se a célula está vazia ou a máquina não rodou, use oee=null.
8. NUNCA transforme célula vazia em 0.
9. 0 só é válido se "0%" estiver claramente escrito.
10. É melhor retornar null do que inventar.
11. Use o cabeçalho do dia/turno e as linhas da esquerda como referência espacial.
12. Não pegue percentual da linha acima ou abaixo.

EXEMPLO DE CÉLULA:
"SANDRO 48.540 54%"
Resposta correta: 54.

EXEMPLO:
"MARISA 31.200 59%"
Resposta correta: 59.

EXEMPLO:
célula vazia
Resposta correta: null.

Você poderá receber exemplos de fotos anteriores que foram CONFIRMADAS pelo supervisor.
Use esses exemplos somente para aprender:
- formato físico da lousa;
- posição das colunas;
- estilo da escrita;
- aparência do símbolo %;
- relação entre linha da MK e sua célula.

NÃO copie números antigos para a foto nova.


ATENÇÃO À IMAGEM DA COLUNA AMPLIADA:
- ela contém as linhas na MESMA ordem da lista de máquinas;
- percorra verticalmente de cima para baixo;
- não use o cabeçalho como MK-02;
- comece a associar máquinas apenas na primeira linha de dados após o cabeçalho;
- confirme o percentual usando também a posição correspondente na imagem do quadro inteiro.


REGRA DE ALINHAMENTO:
Use a IMAGEM DE ALINHAMENTO como principal referência.
Lado esquerdo = MKs.
Lado direito = coluna do turno.
Mesma altura = mesma máquina.
Não use o cabeçalho como MK-02 ou MK-08.
Se houver dúvida, confirme com o quadro inteiro.


REGRA PRINCIPAL — FOLHA DE CÉLULAS:
Você receberá uma imagem em que cada linha já está rotulada pelo aplicativo:
MK-02, MK-08, MK-138, MK-105, etc.

O nome da MK foi colocado pelo CÓDIGO, não foi lido da foto.
Portanto:
- NÃO tente descobrir a máquina pela posição no quadro;
- NÃO mova um percentual para a linha de cima ou de baixo;
- leia SOMENTE o conteúdo da célula à direita do rótulo;
- procure preferencialmente um número acompanhado por "%";
- números grandes como 48.540, 31.200 ou 69.100 são produção e devem ser ignorados;
- se não houver percentual legível naquela célula, retorne null;
- NÃO invente 0;
- a confiança deve refletir somente a legibilidade do percentual, não uma suposição.

Exemplo:
linha rotulada "MK-223" + célula contendo "Sandro 48.540 54%" => MK-223 = 54.
linha rotulada "MK-105" + célula sem percentual => MK-105 = null.

A FOLHA DE CÉLULAS é a fonte principal.
Use a foto inteira e a coluna ampliada apenas para desempatar uma leitura duvidosa.

Retorne SOMENTE JSON:
{
  "rows":[
    {
      "machine":"MK-149",
      "oee":62,
      "confidence":94,
      "evidence":"62%",
      "reason":"62% está na linha MK-149 e coluna ${scope.label||''}"
    }
  ]
}

Inclua TODAS as máquinas da lista.
Se não houver leitura segura para uma máquina, retorne oee:null.
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
      text:`AGORA ANALISE A FOTO ATUAL.
A primeira imagem é o QUADRO INTEIRO: use para localizar exatamente ${scope.label||''} e conferir a linha de cada MK.
A segunda imagem, quando presente, é a COLUNA ${scope.label||''} AMPLIADA: use principalmente para ler a escrita e o símbolo %.
Cruze as duas imagens. Não copie valores dos exemplos.`
    });
    parts.push({inlineData:{mimeType:image.mimeType,data:image.data}});
    if(columnImage){
      parts.push({text:`COLUNA ${scope.label||''} AMPLIADA EM ALTA RESOLUÇÃO:`});
      parts.push({inlineData:{mimeType:columnImage.mimeType,data:columnImage.data}});
    }
    if(comparisonImage){
      parts.push({
        text:`FOLHA DE CÉLULAS.
Cada linha já está rotulada pelo aplicativo com a MK correta.
Leia somente o percentual dentro da célula à direita de cada rótulo.
Esta é a referência PRINCIPAL da análise.`
      });
      parts.push({
        inlineData:{
          mimeType:comparisonImage.mimeType,
          data:comparisonImage.data
        }
      });
    }


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
            responseMimeType:'application/json'
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
