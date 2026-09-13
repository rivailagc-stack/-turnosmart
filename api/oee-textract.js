const { TextractClient, AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');

function normalizeMachineCode(value) {
  const digits = String(value || '').toUpperCase().replace(/[^0-9]/g, '');
  if (!digits) return '';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '';
  return `MK-${n < 10 ? String(n).padStart(2, '0') : String(n)}`;
}

function parseDataUrl(dataUrl = '') {
  const match = String(dataUrl).match(/^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) throw new Error('Imagem inválida para leitura.');
  return Buffer.from(match[1], 'base64');
}

function boxOf(block = {}) { return block.Geometry?.BoundingBox || {}; }
function centerY(block = {}) { const b=boxOf(block); return Number(b.Top||0)+Number(b.Height||0)/2; }
function centerX(block = {}) { const b=boxOf(block); return Number(b.Left||0)+Number(b.Width||0)/2; }

function percentFromText(text='') {
  const src=String(text||'').replace(',', '.');
  const matches=[...src.matchAll(/(?:^|\D)(100|\d{1,2})\s*%/g)];
  if(!matches.length) return null;
  const value=Number(matches.at(-1)[1]);
  return Number.isFinite(value)&&value>=0&&value<=100?value:null;
}

function fallbackPercent(text='') {
  const src=String(text||'').replace(',', '.');
  const nums=[...src.matchAll(/(?:^|\D)(100|\d{1,2})(?:\D|$)/g)].map(m=>Number(m[1]));
  if(nums.length!==1) return null;
  return nums[0]>=0&&nums[0]<=100?nums[0]:null;
}

function machineNumber(machine='') { return String(Number(String(machine).replace(/\D/g,''))); }

function expectedColumnCenter(columnIndex){
  const x0=.055, x1=.982;
  return x0+(x1-x0)*((Number(columnIndex)+.5)/14);
}

function collectLines(blocks=[]){
  return blocks.filter(b=>b.BlockType==='LINE'&&String(b.Text||'').trim()).map(b=>({
    text:String(b.Text||'').trim(), confidence:Number(b.Confidence||0), x:centerX(b), y:centerY(b), box:boxOf(b)
  }));
}

function detectMachineAnchors(lines=[], machines=[]){
  const anchors=new Map();
  const wanted=new Map(machines.map(m=>[machineNumber(m),normalizeMachineCode(m)]));
  for(const line of lines){
    if(line.x>.13) continue;
    const clean=line.text.replace(/[^0-9]/g,'');
    if(!clean) continue;
    const normalized=String(Number(clean));
    const machine=wanted.get(normalized);
    if(!machine) continue;
    const existing=anchors.get(machine);
    if(!existing||line.confidence>existing.confidence) anchors.set(machine,{y:line.y,confidence:line.confidence,text:line.text});
  }
  return anchors;
}

function interpolatedY(machine,index,anchors,machines){
  if(anchors.has(machine)) return anchors.get(machine).y;
  const known=[];
  machines.forEach((m,i)=>{ if(anchors.has(m)) known.push([i,anchors.get(m).y]); });
  const before=[...known].reverse().find(([i])=>i<index);
  const after=known.find(([i])=>i>index);
  if(before&&after){
    const t=(index-before[0])/(after[0]-before[0]);
    return before[1]+(after[1]-before[1])*t;
  }
  if(before&&known.length>=2){
    const p2=known[known.length-2], p1=known[known.length-1];
    return p1[1]+(index-p1[0])*((p1[1]-p2[1])/(p1[0]-p2[0]));
  }
  if(after&&known.length>=2){
    const p0=known[0], p1=known[1];
    return p0[1]+(index-p0[0])*((p1[1]-p0[1])/(p1[0]-p0[0]));
  }
  return .215+(index+.5)*(.705/machines.length);
}

function buildRows(blocks=[],machines=[],columnIndex=0){
  const normalized=machines.map(normalizeMachineCode).filter(Boolean);
  const lines=collectLines(blocks);
  const anchors=detectMachineAnchors(lines,normalized);
  const targetX=expectedColumnCenter(columnIndex);
  const colWidth=(.982-.055)/14;

  const rows=normalized.map((machine,index)=>{
    const y=interpolatedY(machine,index,anchors,normalized);
    const candidates=lines.filter(line=>
      Math.abs(line.x-targetX)<=colWidth*.60 &&
      Math.abs(line.y-y)<=Math.max(.012,.70*(.705/normalized.length))
    ).map(line=>({
      ...line,
      explicit:percentFromText(line.text),
      fallback:fallbackPercent(line.text),
      distance:Math.abs(line.x-targetX)+Math.abs(line.y-y)*1.8
    }));

    const explicit=candidates.filter(c=>c.explicit!==null)
      .sort((a,b)=>a.distance-b.distance||b.confidence-a.confidence)[0];
    if(explicit){
      return {machine,oee:explicit.explicit,confidence:Math.round(Math.min(99,explicit.confidence)),source:'Textract',evidence:`${explicit.text} | linha ancorada no quadro inteiro`};
    }

    const fallback=candidates.filter(c=>c.fallback!==null&&c.confidence>=94)
      .sort((a,b)=>a.distance-b.distance||b.confidence-a.confidence)[0];
    if(fallback){
      return {machine,oee:fallback.fallback,confidence:Math.round(Math.min(88,fallback.confidence-6)),source:'Textract',evidence:`${fallback.text} | número sem %; exige conferência`};
    }

    return {machine,oee:'',confidence:0,source:'Textract',evidence:anchors.has(machine)?'Linha localizada; percentual não seguro.':'Linha não ancorada com segurança.'};
  });

  return {rows,anchorCount:anchors.size,targetX};
}

function buildRowsFromLabeledSheet(blocks=[], machines=[]){
  const normalized=machines.map(normalizeMachineCode).filter(Boolean);
  const lines=collectLines(blocks);
  const rowCount=Math.max(1,normalized.length);

  const rows=normalized.map((machine,index)=>{
    const y0=index/rowCount;
    const y1=(index+1)/rowCount;
    const candidates=lines
      .filter(line=>line.y>=y0&&line.y<y1&&line.x>.18)
      .map(line=>({
        ...line,
        explicit:percentFromText(line.text),
        fallback:fallbackPercent(line.text)
      }));

    const explicit=candidates
      .filter(c=>c.explicit!==null)
      .sort((a,b)=>b.confidence-a.confidence||b.x-a.x)[0];

    if(explicit){
      return {
        machine,
        oee:explicit.explicit,
        confidence:Math.round(Math.min(99,explicit.confidence)),
        source:'Textract célula',
        evidence:`${explicit.text} | célula ${machine}`
      };
    }

    const fallback=candidates
      .filter(c=>c.fallback!==null&&c.confidence>=96)
      .sort((a,b)=>b.confidence-a.confidence||b.x-a.x)[0];

    if(fallback){
      return {
        machine,
        oee:fallback.fallback,
        confidence:Math.round(Math.min(86,fallback.confidence-8)),
        source:'Textract célula',
        evidence:`${fallback.text} | número sem % na célula ${machine}; exige conferência`
      };
    }

    return {
      machine,
      oee:'',
      confidence:0,
      source:'Textract célula',
      evidence:`Sem percentual seguro na célula ${machine}.`
    };
  });

  return {rows,anchorCount:normalized.length,targetX:null};
}

module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Método não permitido.'});
  const region=process.env.AWS_REGION||process.env.AWS_DEFAULT_REGION;
  const accessKeyId=process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey=process.env.AWS_SECRET_ACCESS_KEY;
  if(!region||!accessKeyId||!secretAccessKey){
    return res.status(503).json({ok:false,error:'Amazon Textract não configurado. Defina AWS_REGION, AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY na Vercel.'});
  }
  try{
    const imageDataUrl=req.body?.imageDataUrl;
    const machines=Array.isArray(req.body?.machines)?req.body.machines:[];
    const columnIndex=Number.isInteger(req.body?.columnIndex)?req.body.columnIndex:0;
    const sheetMode=Boolean(req.body?.sheetMode);
    if(!imageDataUrl||!machines.length) throw new Error('Imagem ou lista de máquinas ausente.');
    if(!sheetMode && (columnIndex<0||columnIndex>13)) throw new Error('Coluna do turno inválida.');

    const client=new TextractClient({region,credentials:{accessKeyId,secretAccessKey}});
    const result=await client.send(new AnalyzeDocumentCommand({
      Document:{Bytes:parseDataUrl(imageDataUrl)},
      FeatureTypes:['TABLES','LAYOUT']
    }));
    const built=sheetMode
      ? buildRowsFromLabeledSheet(result.Blocks||[],machines)
      : buildRows(result.Blocks||[],machines,columnIndex);
    return res.status(200).json({
      ok:true,
      provider:sheetMode?'Amazon Textract — células rotuladas':'Amazon Textract — quadro inteiro',
      rows:built.rows,
      detected:built.rows.filter(r=>r.oee!=='').length,
      machineAnchors:built.anchorCount,
      columnIndex,
      targetX:built.targetX,
      sheetMode
    });
  }catch(error){
    console.error('Textract OEE:',error);
    return res.status(500).json({ok:false,error:error.message||'Falha no Amazon Textract.'});
  }
};
