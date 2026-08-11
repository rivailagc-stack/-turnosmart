const MODEL=process.env.GEMINI_MODEL||'gemini-2.5-flash';

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
      imageDataUrl,
      compositeDataUrl,
      date,
      shift,
      scope
    }=req.body||{};

    const parseImage=dataUrl=>{
      const match=String(dataUrl||'').match(
        /^data:(image\/[^;]+);base64,(.+)$/s
      );
      return match
        ?{mimeType:match[1],data:match[2]}
        :null;
    };

    const full=parseImage(imageDataUrl);
    const composite=parseImage(compositeDataUrl);

    if(!full){
      return res.status(400).json({
        ok:false,
        error:'Foto principal inválida.'
      });
    }

    const machines=[
      'MK-138','MK-105','MK-108','MK-223','MK-192',
      'MK-69','MK-172','MK-173','MK-178','MK-179',
      'MK-212','MK-214','MK-217','MK-220','MK-159',
      'MK-222','MK-170','MK-176','MK-188','MK-149'
    ];

    const scopeLabel=scope?.label||String(shift||'');

    const prompt=`
Leia o OEE manuscrito da coluna ${scopeLabel}.

A IMAGEM 1 foi preparada especialmente:
- esquerda = códigos impressos das máquinas;
- direita = somente a coluna ${scopeLabel};
- as duas partes estão exatamente alinhadas na vertical.

A IMAGEM 2 é a foto completa do quadro, apenas para contexto.

ORDEM OFICIAL:
${machines.map((m,i)=>`${i+1}. ${m}`).join('\n')}

REGRAS:
1. Associe pelo mesmo nível horizontal da IMAGEM 1.
2. Nunca desloque valor para a máquina acima ou abaixo.
3. Use o código impresso da esquerda para identificar a máquina.
4. Leia somente percentual de 0 a 100.
5. Não use produção em peças, OP, meta, semana ou outro número.
6. Se não estiver legível, oee=null.
7. Nunca invente.
8. Retorne todas as máquinas.
9. description deve explicar rapidamente o que foi lido.
10. confidence deve ser 0 a 100.
11. anchorFound e rowChecked devem ser verdadeiros somente se houve confirmação visual na mesma faixa.

Exemplo:
MK-217: "49.000 55%" => oee 55.
description: "55% lido no fim da linha; 49.000 é produção."
`;

    const parts=[];

    if(composite){
      parts.push({
        inlineData:{
          mimeType:composite.mimeType,
          data:composite.data
        }
      });
    }

    parts.push({
      inlineData:{
        mimeType:full.mimeType,
        data:full.data
      }
    });

    parts.push({text:prompt});

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
          parts
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

    const normalizeMachine=value=>{
      const digits=String(value||'').match(/\d{2,3}/)?.[0];
      return digits?`MK-${Number(digits)}`:'';
    };

    const incoming=new Map(
      (parsed.rows||[]).map(row=>[
        normalizeMachine(row.machine),
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
        n>=0 &&
        n<=100;

      return {
        machine,
        oee:valid?n:null,
        confidence:Math.max(
          0,
          Math.min(100,Number(row.confidence||0))
        ),
        anchorFound:Boolean(row.anchorFound),
        rowChecked:Boolean(row.rowChecked),
        evidence:String(row.evidence||''),
        description:String(
          row.description||
          (
            valid
              ?`${n}% identificado na mesma linha.`
              :'Linha sem percentual legível.'
          )
        )
      };
    });

    return res.status(200).json({
      ok:true,
      provider:'gemini',
      model:MODEL,
      scope:scopeLabel,
      rows
    });

  }catch(error){
    return res.status(500).json({
      ok:false,
      error:String(error?.message||error),
      model:MODEL
    });
  }
};
