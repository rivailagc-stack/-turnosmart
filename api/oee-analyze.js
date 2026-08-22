const MACHINES=['MK-02','MK-08','MK-138','MK-105','MK-108','MK-223','MK-192','MK-69','MK-172','MK-173','MK-178','MK-179','MK-212','MK-214','MK-217','MK-220','MK-159','MK-222','MK-170','MK-176','MK-188','MK-149'];

function extractText(data){
  if(typeof data?.output_text==='string') return data.output_text;
  for(const item of data?.output||[]) for(const c of item?.content||[]) if(c?.type==='output_text'&&c?.text) return c.text;
  return '';
}
function parseJson(text){
  const clean=String(text||'').replace(/^```json\s*/i,'').replace(/```$/,'').trim();
  return JSON.parse(clean);
}

module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Use POST.'});
  const key=process.env.OPENAI_API_KEY||process.env.OPENAI_KEY;
  if(!key) return res.status(500).json({ok:false,error:'OPENAI_API_KEY não está configurada no Vercel.'});
  const {imageDataUrl,scope={}}=req.body||{};
  if(!imageDataUrl||!String(imageDataUrl).startsWith('data:image/')) return res.status(400).json({ok:false,error:'Imagem não recebida.'});

  const prompt=`Você é o leitor visual do quadro semanal de OEE da Ecopack. Leia a FOTO ORIGINAL inteira, usando a geometria da tabela, não OCR cego.\n\nCOLUNA ALVO: ${scope.label||''}. Data: ${scope.date||''}. Turno: ${scope.shift||''}.\nA tabela tem dias SEGUNDA a DOMINGO e, em cada dia, subcolunas A e B. Leia SOMENTE a coluna alvo. Não pegue números da coluna vizinha.\nAs linhas, de cima para baixo, são EXATAMENTE: ${MACHINES.join(', ')}.\nEm cada célula há anotações como nome, quantidade produzida e OEE. O OEE é o percentual escrito na célula. NÃO transforme produção em percentual. NÃO invente 0. Se a célula estiver vazia ou ilegível, use null.\nTambém leia no cabeçalho da MESMA coluna o OEE geral do turno, quando existir. Se não estiver legível, null. previousTurnOee só deve ser preenchido se você conseguir ler com segurança o OEE geral da coluna cronologicamente anterior; senão null.\nResponda APENAS JSON válido neste formato: {"ok":true,"currentTurnOee":55,"previousTurnOee":54,"rows":[{"machine":"MK-02","oee":null,"confidence":0,"evidence":"","reason":"vazio"},{"machine":"MK-08","oee":63,"confidence":95,"evidence":"63%","reason":"percentual visível na célula"}]}.\nInclua as 22 máquinas, exatamente uma vez cada.`;

  try{
    const r=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:process.env.OPENAI_VISION_MODEL||'gpt-5.6-luna',
        input:[{role:'user',content:[
          {type:'input_text',text:prompt},
          {type:'input_image',image_url:imageDataUrl,detail:'high'}
        ]}],
        max_output_tokens:3500
      })
    });
    const raw=await r.json();
    if(!r.ok) return res.status(r.status).json({ok:false,error:raw?.error?.message||'Erro OpenAI.'});
    const parsed=parseJson(extractText(raw));
    const allowed=new Set(MACHINES);
    const rows=(Array.isArray(parsed.rows)?parsed.rows:[]).filter(x=>allowed.has(x.machine));
    return res.status(200).json({ok:true,currentTurnOee:parsed.currentTurnOee??null,previousTurnOee:parsed.previousTurnOee??null,rows});
  }catch(e){
    return res.status(500).json({ok:false,error:`Falha IA visual: ${e.message||e}`});
  }
};
