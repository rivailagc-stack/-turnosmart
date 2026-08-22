const MODEL=process.env.GEMINI_MODEL||'gemini-3.6-flash';

const MACHINES=[
  'MK-138','MK-105','MK-108','MK-223','MK-192','MK-69','MK-172','MK-173',
  'MK-178','MK-179','MK-212','MK-214','MK-217','MK-220','MK-159','MK-222',
  'MK-170','MK-176','MK-188','MK-149'
];

function parseDataUrl(v){
  const m=String(v||'').match(/^data:(image\/[^;]+);base64,(.+)$/s);
  return m?{mimeType:m[1],data:m[2]}:null;
}

function normalizeMachine(v){
  const n=String(v||'').match(/\d{1,3}/)?.[0];
  return n?`MK-${Number(n)}`:'';
}

function parseJsonText(text){
  const clean=String(text||'')
    .trim()
    .replace(/^```json\s*/i,'')
    .replace(/^```\s*/,'')
    .replace(/\s*```$/,'')
    .trim();

  try{
    return JSON.parse(clean);
  }catch{}

  const a=clean.indexOf('{');
  const b=clean.lastIndexOf('}');
  if(a>=0 && b>a){
    return JSON.parse(clean.slice(a,b+1));
  }

  throw new Error('A IA não retornou JSON válido.');
}

function responseText(body){
  const parts=body?.candidates?.[0]?.content?.parts||[];
  return parts.map(p=>p?.text||'').join('').trim();
}

module.exports=async(req,res)=>{
  if(req.method!=='POST'){
    return res.status(405).json({ok:false,error:'Use POST.'});
  }

  const key=process.env.GEMINI_API_KEY;
  if(!key){
    return res.status(200).json({
      ok:false,
      error:'GEMINI_API_KEY não está disponível na Vercel.'
    });
  }

  try{
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
    const image=parseDataUrl(body.imageDataUrl);
    const label=String(body.scope?.label||'').trim();

    if(!image){
      return res.status(400).json({ok:false,error:'Foto inválida ou não recebida.'});
    }

    // Proteção adicional contra payload exagerado.
    if(image.data.length>3_500_000){
      return res.status(413).json({
        ok:false,
        error:'A foto ficou grande demais para análise. Tire a foto mais próxima do quadro.'
      });
    }

    const prompt=`
Você está analisando uma fotografia do QUADRO DE ACOMPANHAMENTO DE OEE SEMANAL.

Leia SOMENTE a coluna/turno: ${label}.

A ordem das máquinas no quadro é:
${MACHINES.join(', ')}

REGRAS OBRIGATÓRIAS:
1. Primeiro localize visualmente o cabeçalho ${label}.
2. Depois localize cada MK na coluna da esquerda.
3. Siga horizontalmente a linha da MK até a coluna ${label}.
4. Leia SOMENTE o percentual de OEE escrito naquela célula.
5. Ignore produção, nome de operador, horário, quantidade de peças, comentários e células vizinhas.
6. Célula vazia = null.
7. Ilegível ou duvidosa = null.
8. Nunca invente um número.
9. Nunca converta célula vazia em 0.
10. 0% só é válido se "0%" estiver explicitamente escrito.
11. Confirme visualmente linha + coluna antes de aceitar.
12. confirmed=true apenas se confidence >= 90.
13. Leia também, se estiver claramente visível no topo:
    - OEE geral do turno ${label};
    - OEE geral do turno imediatamente anterior.

Retorne SOMENTE JSON:
{
  "scope":"${label}",
  "currentTurnOee":55,
  "previousTurnOee":62,
  "rows":[
    {
      "machine":"MK-138",
      "oee":64,
      "confirmed":true,
      "confidence":96,
      "rowConfirmed":true,
      "columnConfirmed":true,
      "percentVisible":true,
      "evidence":"64%",
      "reason":"64% visível na célula correta"
    }
  ]
}`;

    const gemini=await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-goog-api-key':key
        },
        body:JSON.stringify({
          contents:[{
            role:'user',
            parts:[
              {text:prompt},
              {
                inlineData:{
                  mimeType:image.mimeType,
                  data:image.data
                }
              }
            ]
          }],
          generationConfig:{
            responseMimeType:'application/json'
          }
        })
      }
    );

    const geminiBody=await gemini.json().catch(()=>({}));

    if(!gemini.ok){
      const msg=
        geminiBody?.error?.message||
        `Gemini HTTP ${gemini.status}`;
      throw new Error(msg);
    }

    const parsed=parseJsonText(responseText(geminiBody));
    const map=new Map(
      (parsed.rows||[]).map(r=>[normalizeMachine(r.machine),r])
    );

    const rows=MACHINES.map(machine=>{
      const r=map.get(machine)||{};
      const raw=r.oee;
      const has=raw!==null && raw!==undefined && raw!=='';
      const oee=has?Number(raw):null;
      const confidence=Number(r.confidence||0);
      const evidence=String(r.evidence||'');

      const valid=
        r.confirmed===true &&
        r.rowConfirmed===true &&
        r.columnConfirmed===true &&
        r.percentVisible===true &&
        confidence>=90 &&
        oee!==null &&
        Number.isFinite(oee) &&
        oee>=0 &&
        oee<=100 &&
        (oee!==0 || /\b0\s*%/.test(evidence));

      return {
        machine,
        oee:valid?oee:null,
        confirmed:valid,
        confidence,
        evidence,
        reason:String(r.reason||'')
      };
    });

    const current=Number(parsed.currentTurnOee);
    const previous=Number(parsed.previousTurnOee);

    return res.status(200).json({
      ok:true,
      scope:label,
      rows,
      confirmedCount:rows.filter(r=>r.confirmed).length,
      currentTurnOee:Number.isFinite(current)?current:null,
      previousTurnOee:Number.isFinite(previous)?previous:null,
      model:MODEL
    });

  }catch(error){
    console.error('OEE analyze error:',error);
    return res.status(200).json({
      ok:false,
      error:String(error?.message||error)
    });
  }
};
