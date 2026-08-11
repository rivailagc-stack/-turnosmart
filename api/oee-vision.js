const MODEL=process.env.GEMINI_MODEL||'gemini-2.5-flash';

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    return res.status(405).json({ok:false,error:'Use POST.'});
  }

  const key=process.env.GEMINI_API_KEY;
  if(!key){
    return res.status(500).json({
      ok:false,
      error:'GEMINI_API_KEY não configurada.',
      hint:'Vercel > Settings > Environment Variables > GEMINI_API_KEY'
    });
  }

  try{
    const {imageDataUrl,date,shift,scope}=req.body||{};
    const match=String(imageDataUrl||'').match(
      /^data:(image\/[^;]+);base64,(.+)$/s
    );

    if(!match){
      return res.status(400).json({ok:false,error:'Imagem inválida.'});
    }

    const machines=[
      'MK-138','MK-105','MK-108','MK-223','MK-192','MK-69','MK-172',
      'MK-173','MK-178','MK-179','MK-212','MK-214','MK-217','MK-220',
      'MK-159','MK-222','MK-170','MK-176','MK-188','MK-149'
    ];

    const prompt=`Analise visualmente esta FOTO INTEIRA de um quadro de produção da Ecopack.

Data do relatório: ${date||''}
Turno/coluna esperada: ${scope?.label||shift||''}

MAPA REAL DO CABEÇALHO:
SEGUNDA A, SEGUNDA B, TERÇA A, TERÇA B, QUARTA A, QUARTA B,
QUINTA A, QUINTA B, SEXTA A, SEXTA B, SÁBADO A, SÁBADO B.

Se o escopo for SEGUNDA B, leia somente a segunda coluna de produção,
imediatamente à direita de SEGUNDA A.

Máquinas na ordem vertical:
${machines.join(', ')}

OBJETIVO:
Para CADA máquina, localize o número impresso da máquina na coluna esquerda.
Depois siga EXATAMENTE A MESMA LINHA HORIZONTAL para a direita e leia o OEE
percentual manuscrito correspondente.

REGRAS OBRIGATÓRIAS:
1. Não divida a imagem em partes iguais.
2. Use as linhas físicas da grade para associar máquina e percentual.
3. Não use produção em peças como OEE.
4. Não use meta, semana, OP, quantidade ou percentual da linha vizinha.
5. O OEE deve estar entre 0 e 100.
6. A escrita pode ser verde, vermelha, azul ou preta.
7. Se houver mais de um número na linha, escolha SOMENTE o que representa percentual/OEE.
8. Se não conseguir ler com segurança, use null. NÃO INVENTE.
9. MK-138 é MK-138; nunca converta para MK-130.
10. Retorne todas as 20 máquinas.
11. anchorFound=true somente se você realmente localizou a máquina impressa.
12. rowChecked=true somente se seguiu a linha correta.
13. confidence é 0 a 100.

Retorne SOMENTE JSON válido:
{"rows":[
 {"machine":"MK-138","oee":62,"confidence":95,"anchorFound":true,"rowChecked":true,"evidence":"62% manuscrito na mesma linha"},
 {"machine":"MK-105","oee":null,"confidence":0,"anchorFound":true,"rowChecked":true,"evidence":"percentual não legível"}
]}`;

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
          parts:[
            {inlineData:{mimeType:match[1],data:match[2]}},
            {text:prompt}
          ]
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
        error:body?.error?.message||`Gemini HTTP ${gr.status}`
      });
    }

    let text=(body?.candidates?.[0]?.content?.parts||[])
      .map(part=>part.text||'')
      .join('')
      .trim()
      .replace(/^```json\s*/i,'')
      .replace(/^```\s*/,'')
      .replace(/\s*```$/,'')
      .trim();

    const parsed=JSON.parse(text);
    const incoming=new Map(
      (parsed.rows||[]).map(row=>[
        String(row.machine||'').replace(/\s+/g,'').replace(/^MK(?=\d)/,'MK-').toUpperCase(),
        row
      ])
    );

    const rows=machines.map(machine=>{
      const row=incoming.get(machine)||{};
      const n=Number(row.oee);
      const valid=
        row.oee!==null &&
        row.oee!=='' &&
        Number.isFinite(n) &&
        n>=0 && n<=100;

      return {
        machine,
        oee:valid?n:null,
        confidence:Math.max(0,Math.min(100,Number(row.confidence||0))),
        anchorFound:Boolean(row.anchorFound),
        rowChecked:Boolean(row.rowChecked),
        evidence:String(row.evidence||'')
      };
    });

    return res.status(200).json({
      ok:true,
      provider:'gemini',
      model:MODEL,
      rows
    });

  }catch(error){
    return res.status(500).json({
      ok:false,
      error:String(error?.message||error)
    });
  }
};
