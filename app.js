
const $=id=>document.getElementById(id);
const state={imageDataUrl:null,analysis:null,selected:new Set(),sgman:{ok:false,orders:[],summary:null,byMachine:{}},history:{production:[],powerbi:[]},staff:{team:'',members:[],present:[]}};

function todayISO(){
  const d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${m}-${day}`;
}
$('reportDate').value=todayISO();
setTimeout(renderTeamScale,0);

function go(id){
  document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  document.querySelectorAll('.bottom button').forEach(b=>b.classList.toggle('active',b.dataset.go===id));
}
document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.go)));

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file);
  });
}
async function compressImage(file){
  const data=await fileToDataUrl(file);
  const img=new Image(); img.src=data; await img.decode();
  const maxW=1800, scale=Math.min(1,maxW/img.width);
  const c=document.createElement('canvas'); c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',0.82);
}

$('powerBiFileInput')?.addEventListener('change',async e=>{
  const f=e.target.files?.[0];
  if(!f)return;
  $('status').textContent='Importando histórico do Power BI...';
  try{
    const r=await importPowerBiFile(f);
    await loadHistories();
    renderHistorySummary();
    $('status').textContent=`Power BI: ${r.count} registro(s) importado(s).`;
  }catch(err){
    $('status').textContent=`Erro ao importar Power BI: ${err.message}`;
  }
});

async function handleOeeImageFile(file){
  if(!file)return;
  $('status').textContent='Preparando foto...';
  state.imageDataUrl=await compressImage(file);
  $('preview').src=state.imageDataUrl;
  $('preview').classList.remove('hidden');
  $('status').textContent='Foto pronta para análise.';
}
$('oeeGalleryInput')?.addEventListener('change',e=>handleOeeImageFile(e.target.files?.[0]));
$('oeeCameraInput')?.addEventListener('change',e=>handleOeeImageFile(e.target.files?.[0]));


const SCALE_REFERENCE_DATE='2026-07-20'; // A1/A2 working day reference.

const LEGACY_SGMAN_USERS=[
  {username:'aleilson.almeida',name:'Aleilson Almeida',role:'Mantenedor'},
  {username:'allan.teodorak',name:'Allan Teodorak',role:'Líder Mantenedor'},
  {username:'CAIO.AUGUSTO',name:'Caio Augusto',role:'Mecânico'},
  {username:'carlos.silva',name:'Carlos Matos',role:'Mantenedor'},
  {username:'Danilo',name:'Danilo Nepomuceno',role:'Líder Mantenedor'},
  {username:'emerson.nunes',name:'Emerson Nunes',role:'Líder Mantenedor'},
  {username:'ezequielSantos',name:'Ezequiel Santos',role:'Mecânico'},
  {username:'fiderlânio.reis',name:'Fiderlânio Reis',role:'Líder Mantenedor'},
  {username:'gabriel.henrique',name:'Gabriel Bretas',role:'Ferramenteiro'},
  {username:'gustavo.yano',name:'Gustavo Yano',role:'Aprendiz de manutenção'},
  {username:'igor.henrique',name:'Igor Henrique',role:'Manutenção'},
  {username:'jean.mendes',name:'Jean Mendes',role:'Usuário SGMan'},
  {username:'jeanderson.costa',name:'Jeanderson Costa',role:'Mantenedor'},
  {username:'JOÃO.SOUZA',name:'João Aparecido de Souza',role:'Mecânico'},
  {username:'Lucas.eletricista',name:'Lucas Eletricista',role:'Eletricista'},
  {username:'luiz.afonso',name:'Luiz Afonso',role:'Líder Mantenedor'},
  {username:'marcelo.souza',name:'Marcelo Souza',role:'Mantenedor'},
  {username:'marcos.roberto',name:'Marcos Roberto',role:'Mantenedor'},
  {username:'ricardo.serafim',name:'Ricardo Serafim',role:'Líder Mantenedor'},
  {username:'Rosental.Lima',name:'Rosental Lima',role:'Líder Mantenedor'},
  {username:'roberto.beraldo',name:'Roberto Beraldo',role:'Mantenedor'},
  {username:'rogger.sampaio',name:'Rogger Sampaio',role:'Mantenedor'},
  {username:'thiago.nascimento',name:'Thiago Nascimento',role:'Mantenedor'}
];
const DEFAULT_CREW_LEADERS={A1:'Ricardo Serafim',A2:'Luiz Afonso',B1:'Danilo Nepomuceno',B2:'Fiderlânio Reis'};

function crewRosterKey(crew){return `turnosmart_roster_${crew}`;}
function getCrewRoster(crew){
  let saved=[];
  try{saved=JSON.parse(localStorage.getItem(crewRosterKey(crew))||'[]')}catch{}
  const leader=DEFAULT_CREW_LEADERS[crew];
  if(Array.isArray(saved)&&saved.length)return [...new Set([leader,...saved].filter(Boolean))];
  return leader?[leader]:[];
}
function saveCrewRoster(crew,names){
  localStorage.setItem(crewRosterKey(crew),JSON.stringify([...new Set(names.filter(Boolean))]));
}


function daysBetween(a,b){
  const [ya,ma,da]=a.split('-').map(Number),[yb,mb,db]=b.split('-').map(Number);
  const A=Date.UTC(ya,ma-1,da),B=Date.UTC(yb,mb-1,db);
  return Math.floor((B-A)/86400000);
}
function activeScaleTeams(dateStr){
  const d=daysBetween(SCALE_REFERENCE_DATE,dateStr);
  const even=((d%2)+2)%2===0;
  return even?['A1','A2']:['B1','B2'];
}
function teamForSelectedShift(dateStr,shift){
  const teams=activeScaleTeams(dateStr);
  return shift==='A'?teams[0]:teams[1];
}
function renderTeamScale(){
  const date=$('reportDate').value||todayISO();
  const shift=$('reportShift').value||'A';
  const team=teamForSelectedShift(date,shift);
  let members=getCrewRoster(team);
  const allNames=LEGACY_SGMAN_USERS.map(x=>x.name);
  const leader=DEFAULT_CREW_LEADERS[team]||'';
  if(!members.length && leader) members=[leader];
  state.staff.team=team;
  state.staff.members=members;

  const storedKey=`turnosmart_staff_${date}_${team}`;
  let present;
  try{present=JSON.parse(localStorage.getItem(storedKey)||'null')}catch{present=null}
  if(!Array.isArray(present))present=[...members];
  state.staff.present=present;

  $('teamScaleSummary').innerHTML=
    `<b>Equipe ${team}</b> • ${shift==='A'?'06:00–18:00':'18:00–06:00'}<br>`+
    `Previstos: ${members.length} • Presentes marcados: ${present.length}`;

  $('teamMembers').innerHTML=
    members.map(name=>{
      const checked=present.includes(name);
      return `<label class="team-person"><input type="checkbox" data-name="${name.replace(/"/g,'&quot;')}" ${checked?'checked':''}><span>${name}</span></label>`;
    }).join('')+
    `<details class="roster-config"><summary>⚙️ Configurar equipe ${team}</summary>
      <p class="muted">Marque quem pertence a esta equipe. O TurnoSmart salva a configuração e reutiliza nos próximos dias desta escala.</p>
      <div class="roster-options">${allNames.map(name=>`<label><input type="checkbox" class="roster-member" data-roster-name="${name.replace(/"/g,'&quot;')}" ${members.includes(name)?'checked':''}> ${name}</label>`).join('')}</div>
      <button type="button" id="saveRosterBtn" class="secondary">Salvar equipe ${team}</button>
    </details>`;

  document.querySelectorAll('#teamMembers .team-person input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change',()=>{
      const name=cb.dataset.name;
      if(cb.checked){
        if(!state.staff.present.includes(name))state.staff.present.push(name);
      }else{
        state.staff.present=state.staff.present.filter(x=>x!==name);
      }
      localStorage.setItem(storedKey,JSON.stringify(state.staff.present));
      $('teamScaleSummary').innerHTML=
        `<b>Equipe ${team}</b> • ${shift==='A'?'06:00–18:00':'18:00–06:00'}<br>`+
        `Previstos: ${members.length} • Presentes marcados: ${state.staff.present.length}`;
    });
  });
  $('saveRosterBtn')?.addEventListener('click',()=>{
    const chosen=[...document.querySelectorAll('.roster-member:checked')].map(x=>x.dataset.rosterName);
    const leader=DEFAULT_CREW_LEADERS[team];
    saveCrewRoster(team,[leader,...chosen].filter(Boolean));
    renderTeamScale();
  });
}
function weekdayPt(dateStr){
  const [y,m,d]=dateStr.split('-').map(Number);
  const names=['DOMINGO','SEGUNDA','TERÇA','QUARTA','QUINTA','SEXTA','SÁBADO'];
  return names[new Date(y,m-1,d).getDay()];
}
function scopeLabel(){return `${weekdayPt($('reportDate').value)} ${$('reportShift').value}`;}
$('reportDate')?.addEventListener('change',renderTeamScale);
$('reportShift')?.addEventListener('change',renderTeamScale);

function isoDaysAgo(days){
  const d=new Date(); d.setDate(d.getDate()-days);
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
}
function normalizeMk(v){
  const n=String(v||'').match(/\d{1,3}/)?.[0];
  return n?`MK-${Number(n)}`:'';
}
function sgmanMachineText(o){
  return `${o.machine||''} ${o.tag||''} ${o.local||''} ${o.description||''} ${o.comment||''} ${o.solution||''}`;
}
function buildSgmanIndex(orders){
  const by={};
  for(const mk of ['MK-138','MK-105','MK-108','MK-223','MK-192','MK-69','MK-172','MK-173','MK-178','MK-179','MK-212','MK-214','MK-217','MK-220','MK-159','MK-222','MK-170','MK-176','MK-188','MK-149'])by[mk]=[];
  for(const o of orders||[]){
    const explicit=normalizeMk(o.machine);
    if(explicit&&by[explicit]){by[explicit].push(o);continue;}
    const text=sgmanMachineText(o);
    for(const mk of Object.keys(by)){
      const n=mk.replace('MK-','');
      if(new RegExp(`\\bMK\\s*[-:]?\\s*0*${n}\\b`,'i').test(text)){by[mk].push(o);break;}
    }
  }
  return by;
}
async function loadSgman(){
  try{
    const r=await fetch('/api/sgman-list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      data_inicio:isoDaysAgo(90),data_fim:todayISO(),limit:500,calc_custos:0
    })});
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok)throw new Error(d.error||`HTTP ${r.status}`);
    state.sgman={ok:true,orders:d.orders||[],summary:d.summary||null,byMachine:buildSgmanIndex(d.orders||[])};
    return true;
  }catch(e){
    state.sgman={ok:false,orders:[],summary:null,byMachine:{}};
    console.warn('SGMan indisponível:',e);
    return false;
  }
}

async function historyApi(action,payload={}){
  try{
    const r=await fetch('/api/history',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action,...payload})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok)throw new Error(d.error||`HTTP ${r.status}`);
    return d;
  }catch(e){
    console.warn('Histórico remoto indisponível:',e);
    return {ok:false,error:String(e?.message||e)};
  }
}

function localHistoryKey(type){
  return `turnosmart_history_${type}_v3`;
}
function localHistoryRead(type){
  try{return JSON.parse(localStorage.getItem(localHistoryKey(type))||'[]')}catch{return []}
}
function localHistoryWrite(type,rows){
  try{localStorage.setItem(localHistoryKey(type),JSON.stringify(rows.slice(-3000)))}catch{}
}
function localHistoryAppend(type,row){
  const rows=localHistoryRead(type);
  rows.push(row);
  localHistoryWrite(type,rows);
}
function productionMachineMentions(text=''){
  const machines=[];
  const seen=new Set();
  const re=/\bMK\s*[-:]?\s*0*(\d{1,3})\b/gi;
  let m;
  while((m=re.exec(text))){
    const mk=`MK-${Number(m[1])}`;
    if(!seen.has(mk)){seen.add(mk);machines.push(mk);}
  }
  return machines;
}
async function saveProductionHistory(){
  const text=String($('productionReportInput')?.value||'').trim();
  if(!text)return {saved:false};

  const row={
    date:$('reportDate').value,
    shift:$('reportShift').value,
    scope:scopeLabel(),
    team:state.staff.team,
    present:state.staff.present,
    report:text,
    machines:productionMachineMentions(text),
    savedAt:new Date().toISOString()
  };

  localHistoryAppend('production',row);
  const remote=await historyApi('save_production',{row});
  return {saved:true,remote:remote.ok};
}
function parseCsv(text){
  const lines=String(text||'').split(/\r?\n/).filter(x=>x.trim());
  if(!lines.length)return [];
  const sep=lines[0].includes(';')?';':',';
  const headers=lines[0].split(sep).map(x=>x.trim().replace(/^"|"$/g,''));
  return lines.slice(1).map(line=>{
    const vals=line.split(sep).map(x=>x.trim().replace(/^"|"$/g,''));
    const obj={};
    headers.forEach((h,i)=>obj[h]=vals[i]??'');
    return obj;
  });
}
function normalizePowerBiRow(raw){
  const keys=Object.keys(raw||{});
  const get=(cands)=>{
    for(const c of cands){
      const k=keys.find(k=>String(k).toLowerCase().replace(/[^a-z0-9]/g,'')===c);
      if(k!==undefined)return raw[k];
    }
    return '';
  };
  const machine=normalizeMk(get(['maquina','machine','mk','equipamento']))||normalizeMk(JSON.stringify(raw));
  const date=String(get(['data','date','dia'])||'').slice(0,10);
  const shift=String(get(['turno','shift'])||'');
  const product=String(get(['produto','product'])||'');
  const rawOee=get(['oee','eficiencia','efficiency','percentual']);
  const oee=Number(String(rawOee).replace('%','').replace(',','.'));
  if(!machine||!Number.isFinite(oee))return null;
  return {machine,date,shift,product,oee,savedAt:new Date().toISOString(),raw};
}
async function importPowerBiFile(file){
  if(!file)return {count:0};
  const text=await file.text();
  let rawRows=[];
  if(file.name.toLowerCase().endsWith('.json')){
    const data=JSON.parse(text);
    rawRows=Array.isArray(data)?data:(data.rows||data.data||[]);
  }else{
    rawRows=parseCsv(text);
  }
  const rows=rawRows.map(normalizePowerBiRow).filter(Boolean);
  if(!rows.length)return {count:0};

  const local=localHistoryRead('powerbi');
  const map=new Map();
  for(const row of [...local,...rows]){
    const key=[row.date,row.shift,row.machine,row.product,row.oee].join('|');
    map.set(key,row);
  }
  localHistoryWrite('powerbi',[...map.values()]);

  // Send in chunks to avoid large payloads.
  let remoteSaved=0;
  for(let i=0;i<rows.length;i+=200){
    const d=await historyApi('save_powerbi',{rows:rows.slice(i,i+200)});
    if(d.ok)remoteSaved+=Number(d.saved||0);
  }
  return {count:rows.length,remoteSaved};
}
async function loadHistories(){
  state.history.production=localHistoryRead('production');
  state.history.powerbi=localHistoryRead('powerbi');

  const remote=await historyApi('list',{
    dateFrom:isoDaysAgo(365),
    dateTo:todayISO()
  });

  if(remote.ok){
    if(Array.isArray(remote.production))state.history.production=remote.production;
    if(Array.isArray(remote.powerbi))state.history.powerbi=remote.powerbi;
  }
}
function productionHistoryFor(machine){
  const mk=normalizeMk(machine);
  return (state.history.production||[])
    .filter(r=>(r.machines||productionMachineMentions(r.report||'')).includes(mk))
    .sort((a,b)=>String(b.savedAt||b.date).localeCompare(String(a.savedAt||a.date)));
}
function powerBiHistoryFor(machine){
  const mk=normalizeMk(machine);
  return (state.history.powerbi||[])
    .filter(r=>normalizeMk(r.machine)===mk)
    .sort((a,b)=>String(b.date||b.savedAt).localeCompare(String(a.date||a.savedAt)));
}
function historyInsight(machine){
  const prod=productionHistoryFor(machine);
  const pbi=powerBiHistoryFor(machine);
  const oees=pbi.map(r=>Number(r.oee)).filter(Number.isFinite);
  const avg=oees.length?oees.reduce((a,b)=>a+b,0)/oees.length:null;
  return {
    productionCount:prod.length,
    powerBiCount:pbi.length,
    powerBiAverage:avg,
    lastProduction:prod[0]||null,
    lastPowerBi:pbi[0]||null
  };
}
function renderHistorySummary(){
  const el=$('historySummary');
  if(!el)return;
  el.innerHTML=
    `<b>Históricos salvos</b><br>`+
    `Produção: ${state.history.production.length} relatório(s)<br>`+
    `Power BI: ${state.history.powerbi.length} registro(s)<br>`+
    `SGMan: ${state.sgman.ok?state.sgman.orders.length+' OS consultadas':'indisponível'}`;
}
function sgmanInsight(machine){
  const os=state.sgman.byMachine?.[machine]||[];
  const completed=os.filter(o=>o.statusKey==='completed').length;
  const open=os.filter(o=>o.statusKey==='open'||o.statusKey==='overdue').length;
  const recent=os.slice(0,3);
  return {count:os.length,completed,open,recent};
}
function cleanProblemText(v){
  return String(v||'').replace(/\s+/g,' ').trim().slice(0,150);
}


// ==========================================================
// V5.3 — LEITOR OEE ADAPTADO DA V70
// RECORTA SOMENTE A COLUNA DO TURNO E DIVIDE EM 22 LINHAS
// ==========================================================
const V70_OEE_BOARD_MACHINES=[
  'MK-02','MK-08','MK-138','MK-105','MK-108','MK-223',
  'MK-192','MK-69','MK-172','MK-173','MK-178','MK-179',
  'MK-212','MK-214','MK-217','MK-220','MK-159','MK-222',
  'MK-170','MK-176','MK-188','MK-149'
];

function v70LoadImage(dataUrl){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=reject;
    image.src=dataUrl;
  });
}

function v70BoardColumnIndex(dateStr,shiftLetter){
  const [y,m,d]=String(dateStr||todayISO()).split('-').map(Number);
  const date=new Date(y,m-1,d,12,0,0,0);
  const jsDay=date.getDay();
  const mondayIndex=jsDay===0?6:jsDay-1;
  const shiftOffset=String(shiftLetter||'A').toUpperCase()==='B'?1:0;
  return mondayIndex*2+shiftOffset;
}

function v70GetCropSettings(image,dateStr,shiftLetter){
  // Medidas originais da V70.
  const boardStart=0.085;
  const boardEnd=0.995;
  const totalColumns=14;
  const columnWidth=(boardEnd-boardStart)/totalColumns;
  const index=v70BoardColumnIndex(dateStr,shiftLetter);

  // Folga lateral para compensar perspectiva.
  const xRatio=Math.max(0,boardStart+index*columnWidth-columnWidth*0.13);
  const widthRatio=Math.min(1-xRatio,columnWidth*1.26);

  // Remove cabeçalho / produção total e pega somente linhas das MKs.
  const yRatio=0.175;
  const heightRatio=0.79;

  return {
    sx:Math.round(image.naturalWidth*xRatio),
    sy:Math.round(image.naturalHeight*yRatio),
    sw:Math.round(image.naturalWidth*widthRatio),
    sh:Math.round(image.naturalHeight*heightRatio)
  };
}

function v70ClampByte(value){
  return Math.max(0,Math.min(255,Math.round(value)));
}

function v70CreateRowPreviews(previewCanvas){
  const rowCount=V70_OEE_BOARD_MACHINES.length;
  const rowHeight=previewCanvas.height/rowCount;
  const previews=[];

  for(let index=0;index<rowCount;index++){
    const sourceY=Math.max(0,index*rowHeight-rowHeight*0.08);
    const sourceHeight=Math.min(previewCanvas.height-sourceY,rowHeight*1.16);

    const canvas=document.createElement('canvas');
    canvas.width=520;
    canvas.height=96;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(
      previewCanvas,
      0,sourceY,previewCanvas.width,sourceHeight,
      0,0,canvas.width,canvas.height
    );
    previews.push(canvas.toDataURL('image/jpeg',0.9));
  }
  return previews;
}

function v70PreprocessColumn(image,dateStr,shiftLetter){
  const crop=v70GetCropSettings(image,dateStr,shiftLetter);

  // Prévia colorida.
  const previewCanvas=document.createElement('canvas');
  const previewCtx=previewCanvas.getContext('2d');
  const previewWidth=Math.max(520,Math.min(900,crop.sw*3.5));
  const previewHeight=Math.round(previewWidth*(crop.sh/crop.sw));
  previewCanvas.width=previewWidth;
  previewCanvas.height=previewHeight;
  previewCtx.fillStyle='#fff';
  previewCtx.fillRect(0,0,previewWidth,previewHeight);
  previewCtx.imageSmoothingEnabled=true;
  previewCtx.imageSmoothingQuality='high';
  previewCtx.drawImage(
    image,
    crop.sx,crop.sy,crop.sw,crop.sh,
    0,0,previewWidth,previewHeight
  );

  // Canvas separado para OCR, ampliado como na V70.
  const ocrCanvas=document.createElement('canvas');
  const ocrCtx=ocrCanvas.getContext('2d',{willReadFrequently:true});
  const ocrWidth=Math.max(1200,Math.min(1800,crop.sw*6));
  const ocrHeight=Math.round(ocrWidth*(crop.sh/crop.sw));
  ocrCanvas.width=ocrWidth;
  ocrCanvas.height=ocrHeight;
  ocrCtx.fillStyle='#fff';
  ocrCtx.fillRect(0,0,ocrWidth,ocrHeight);
  ocrCtx.imageSmoothingEnabled=true;
  ocrCtx.imageSmoothingQuality='high';
  ocrCtx.drawImage(
    image,
    crop.sx,crop.sy,crop.sw,crop.sh,
    0,0,ocrWidth,ocrHeight
  );

  const imageData=ocrCtx.getImageData(0,0,ocrWidth,ocrHeight);
  const pixels=imageData.data;

  // Tratamento original V70: preserva caneta e clareia grade.
  for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    const saturation=max-min;
    const luminance=0.299*r+0.587*g+0.114*b;
    let value;

    if(saturation<15&&luminance>118){
      value=255;
    }else if(saturation>=18){
      value=v70ClampByte(luminance*0.58-saturation*0.55+42);
    }else{
      value=v70ClampByte((luminance-105)*1.65+105);
    }

    pixels[i]=value;
    pixels[i+1]=value;
    pixels[i+2]=value;
    pixels[i+3]=255;
  }
  ocrCtx.putImageData(imageData,0,0);

  return {
    crop,
    canvas:ocrCanvas,
    previewCanvas,
    previewDataUrl:previewCanvas.toDataURL('image/jpeg',0.94),
    ocrDataUrl:ocrCanvas.toDataURL('image/png'),
    rowPreviews:v70CreateRowPreviews(previewCanvas)
  };
}

function v70NumericOeeFromWord(text=''){
  const cleaned=String(text)
    .replace(/[Oo]/g,'0')
    .replace(/[^0-9.,%]/g,'');
  const match=cleaned.match(/(\d{1,3})(?:[.,](\d))?/);
  if(!match)return null;
  const integer=Number(match[1]);
  const value=Number(match[2]?`${integer}.${match[2]}`:integer);
  if(!Number.isFinite(value)||value<10||value>100)return null;
  return {value,hasPercent:cleaned.includes('%')};
}

function v70MapWordsToRows(words=[],canvasHeight=1){
  const rowCount=V70_OEE_BOARD_MACHINES.length;
  const rowBuckets=Array.from({length:rowCount},()=>[]);

  for(const word of words){
    const parsed=v70NumericOeeFromWord(word.text);
    if(!parsed)continue;

    const bbox=word.bbox||{};
    const y0=Number(bbox.y0??bbox.top??0);
    const y1=Number(bbox.y1??bbox.bottom??y0);
    const centerY=(y0+y1)/2;
    const normalizedY=Math.min(.999,Math.max(0,centerY/Math.max(1,canvasHeight)));
    const rowIndex=Math.min(rowCount-1,Math.floor(normalizedY*rowCount));

    rowBuckets[rowIndex].push({
      value:parsed.value,
      hasPercent:parsed.hasPercent,
      confidence:Number(word.confidence||0),
      x:Number(bbox.x0??bbox.left??0),
      y:centerY,
      raw:String(word.text||'')
    });
  }

  return V70_OEE_BOARD_MACHINES.map((machine,index)=>{
    const candidates=rowBuckets[index];
    if(!candidates.length){
      return {
        machine,oee:null,confirmed:false,confidence:0,
        reason:'Nenhum percentual encontrado nesta linha.'
      };
    }

    // Regra V70: % explícito primeiro; depois último número mais abaixo/direita.
    candidates.sort((a,b)=>{
      if(a.hasPercent!==b.hasPercent)return a.hasPercent?-1:1;
      if(a.y!==b.y)return b.y-a.y;
      return b.x-a.x;
    });

    const chosen=candidates[0];

    // No app limpo, leitura V70 já alimenta Top10.
    // Só rejeita valor absurdo; não exige 90% de confiança.
    return {
      machine,
      oee:Number(chosen.value),
      confirmed:true,
      confidence:Number(chosen.confidence||0),
      evidence:chosen.raw,
      reason:`${chosen.raw} lido no recorte da linha ${machine}.`
    };
  });
}

async function v70ReadBoard(dataUrl,dateStr,shiftLetter,statusEl){
  if(!window.Tesseract)throw new Error('OCR local não carregou.');

  const image=await v70LoadImage(dataUrl);
  const processed=v70PreprocessColumn(image,dateStr,shiftLetter);

  // Guarda previews para inspeção futura.
  state.oeeCropDataUrl=processed.previewDataUrl;
  state.oeeRowPreviews=processed.rowPreviews;

  const result=await window.Tesseract.recognize(
    processed.ocrDataUrl,
    'eng',
    {
      logger:info=>{
        if(info.status==='recognizing text'&&typeof info.progress==='number'){
          statusEl.textContent=
            `Lendo somente ${scopeLabel()}... ${Math.round(info.progress*100)}%`;
        }
      }
    },
    {
      tessedit_char_whitelist:'0123456789%.,',
      tessedit_pageseg_mode:'6',
      preserve_interword_spaces:'1'
    }
  );

  const words=result?.data?.words||[];
  const rows=v70MapWordsToRows(words,processed.canvas.height);

  return {
    ok:true,
    scope:scopeLabel(),
    rows,
    confirmedCount:rows.filter(r=>r.confirmed&&r.oee!==null).length,
    currentTurnOee:null,
    previousTurnOee:null,
    source:'ocr_v70_column_crop'
  };
}
async function callVisionReader(){
  const response=await fetch('/api/oee-analyze',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      imageDataUrl:state.imageDataUrl,
      scope:{label:scopeLabel(),date:$('reportDate').value,shift:$('reportShift').value}
    })
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload?.ok)throw new Error(payload?.error||`IA HTTP ${response.status}`);
  return payload;
}

function normalizeVisionRows(ai){
  const map=new Map((ai?.rows||[]).map(r=>[String(r.machine||'').toUpperCase(),r]));
  return V70_OEE_BOARD_MACHINES.map(machine=>{
    const r=map.get(machine);
    const n=Number(r?.oee);
    const valid=Number.isFinite(n)&&n>=10&&n<=100;
    return valid?{
      machine,oee:n,confirmed:true,
      confidence:Number(r?.confidence||95),
      evidence:String(r?.evidence||''),
      reason:String(r?.reason||'IA visual — célula da coluna selecionada.')
    }:{machine,oee:null,confirmed:false,confidence:0,reason:'Sem OEE legível nesta célula.'};
  });
}

$('analyzeBtn').addEventListener('click',async()=>{
  renderTeamScale();
  if(!state.imageDataUrl){$('status').textContent='Escolha a foto primeiro.';return;}
  const btn=$('analyzeBtn'); btn.disabled=true;
  try{
    $('status').textContent=`IA visual lendo o quadro inteiro e isolando ${scopeLabel()}...`;
    let data=null, aiError=null;
    try{
      const ai=await callVisionReader();
      const rows=normalizeVisionRows(ai);
      const count=rows.filter(r=>r.confirmed).length;
      if(count<1)throw new Error('A IA respondeu, mas não confirmou nenhuma MK.');
      data={
        ok:true,scope:scopeLabel(),rows,confirmedCount:count,
        currentTurnOee:Number.isFinite(Number(ai.currentTurnOee))?Number(ai.currentTurnOee):null,
        previousTurnOee:Number.isFinite(Number(ai.previousTurnOee))?Number(ai.previousTurnOee):null,
        source:'openai_vision_primary'
      };
    }catch(e){
      aiError=e;
      console.warn('IA visual falhou; iniciando OCR V70:',e);
      $('status').textContent=`IA indisponível (${e.message||e}). Tentando OCR V70 em ${scopeLabel()}...`;
      data=await v70ReadBoard(state.imageDataUrl,$('reportDate').value,$('reportShift').value,$('status'));
      data.source='ocr_v70_fallback';
    }

    state.analysis=data; state.selected.clear();
    await Promise.allSettled([loadSgman(),saveProductionHistory(),loadHistories()]);
    renderAnalysis(); renderTop10(); buildReport();
    $('status').textContent=`${data.source==='openai_vision_primary'?'IA visual':'OCR reserva'}: ${data.confirmedCount}/22 MK lidas em ${scopeLabel()}${aiError?' • IA: '+(aiError.message||aiError):''}.`;
    go('analise');
  }catch(e){
    console.error(e);
    $('status').textContent=`Falha na leitura: ${e.message||e}`;
  }finally{btn.disabled=false;}
});

function renderAnalysis(){
  const d=state.analysis;
  const trend=(
    d.currentTurnOee!==null&&d.currentTurnOee!==undefined&&d.currentTurnOee!==''&&
    d.previousTurnOee!==null&&d.previousTurnOee!==undefined&&d.previousTurnOee!==''&&
    Number.isFinite(Number(d.currentTurnOee))&&Number.isFinite(Number(d.previousTurnOee))
  )
    ? `${Number(d.previousTurnOee)}% → ${Number(d.currentTurnOee)}% (${(Number(d.currentTurnOee)-Number(d.previousTurnOee))>=0?'+':''}${(Number(d.currentTurnOee)-Number(d.previousTurnOee)).toFixed(1)} p.p.)`
    : 'turno anterior não confirmado';
  const ss=state.sgman.summary;
  const sg=state.sgman.ok
    ?`Conectado • ${state.sgman.orders.length} OS consultadas nos últimos 90 dias${ss?` • abertas ${ss.open||0} • atrasadas ${ss.overdue||0}`:''}`
    :'Indisponível nesta análise';
  $('summary').innerHTML=`<b>Quadro:</b> ${d.scope}<br><b>Confirmadas:</b> ${d.confirmedCount}/20<br><b>OEE do turno:</b> ${d.currentTurnOee??'—'}%<br><b>Turno anterior:</b> ${trend}<br><b>SGMan:</b> ${sg}`;
  renderHistorySummary();
  $('readings').innerHTML=d.rows.map(r=>`
    <div class="reading ${r.confirmed?'ok':'bad'}">
      <h3>${r.machine}</h3>
      <div class="pct">${r.confirmed?r.oee+'%':'—'}</div>
      <div class="reason">${r.confirmed?'Confirmado':'Não confirmado'} • ${r.reason||''}</div>
    </div>`).join('');
}
function topRows(){
  return (state.analysis?.rows||[])
    .filter(r=>r.confirmed&&Number.isFinite(Number(r.oee))&&Number(r.oee)<65)
    .sort((a,b)=>Number(a.oee)-Number(b.oee))
    .slice(0,10);
}
function renderTop10(){
  const rows=topRows();
  $('counter').textContent=`${state.selected.size}/3 selecionada(s)`;
  $('top10').innerHTML=rows.length?rows.map((r,i)=>{
    const max=Number(r.oee)<=50;
    const loss=((100-Number(r.oee))/100*12).toFixed(1).replace('.',',');
    const sg=sgmanInsight(r.machine);
    const hi=historyInsight(r.machine);
    const sgText=state.sgman.ok
      ?`<div class="sgline">SGMan 90 dias: <b>${sg.count} OS</b> • ${sg.open} aberta(s)/atrasada(s)</div>`
      :`<div class="sgline muted">SGMan indisponível</div>`;
    const histText=`<div class="sgline">Histórico: Produção <b>${hi.productionCount}</b> relatório(s) • Power BI <b>${hi.powerBiCount}</b> registro(s)${hi.powerBiAverage!=null?` • OEE médio ${hi.powerBiAverage.toFixed(1).replace('.',',')}%`:''}</div>`;
    return `<label class="priority ${max?'max':'high'}">
      <span class="rank">${i+1}</span>
      <span><h3>${max?'🔴 PRIORIDADE MÁXIMA':'🟠 PRIORIDADE ALTA'} — ${r.machine}</h3><div class="pct">OEE ${Number(r.oee).toFixed(1).replace('.',',')}%</div><p>Perda estimada: ${loss} h</p>${sgText}${histText}</span>
      <input type="checkbox" data-machine="${r.machine}" ${state.selected.has(r.machine)?'checked':''}>
    </label>`;
  }).join(''):'<p>Nenhuma máquina abaixo de 65% com leitura confirmada.</p>';
  document.querySelectorAll('#top10 input[type=checkbox]').forEach(cb=>cb.addEventListener('change',e=>{
    const m=e.target.dataset.machine;
    if(e.target.checked){
      if(state.selected.size>=3){e.target.checked=false;alert('Escolha somente 3 máquinas.');return;}
      state.selected.add(m);
    }else state.selected.delete(m);
    renderTop10(); buildReport();
  }));
}
function buildReport(){
  const d=state.analysis;
  if(!d){$('reportText').value='';return;}
  const selected=[...state.selected].map(m=>d.rows.find(r=>r.machine===m)).filter(Boolean);
  const diff=(
    d.currentTurnOee!==null&&d.currentTurnOee!==undefined&&d.currentTurnOee!==''&&
    d.previousTurnOee!==null&&d.previousTurnOee!==undefined&&d.previousTurnOee!==''&&
    Number.isFinite(Number(d.currentTurnOee))&&Number.isFinite(Number(d.previousTurnOee))
  )?Number(d.currentTurnOee)-Number(d.previousTurnOee):null;
  const trend=diff==null?'Turno anterior ainda não disponível para comparação.'
    :diff>0?`Melhora de ${diff.toFixed(1).replace('.',',')} p.p. (${d.previousTurnOee}% → ${d.currentTurnOee}%).`
    :diff<0?`Queda de ${Math.abs(diff).toFixed(1).replace('.',',')} p.p. (${d.previousTurnOee}% → ${d.currentTurnOee}%).`
    :`Estável (${d.previousTurnOee}% → ${d.currentTurnOee}%).`;

  let t=`*AÇÕES DA MANUTENÇÃO*\nOEE do turno: ${d.currentTurnOee??'—'}%.\nTendência da eficiência: ${trend}\nQuadro OEE: ${d.scope}.\n\n*OEE LIDO DA FOTO*\n`;
  const confirmed=d.rows.filter(r=>r.confirmed).sort((a,b)=>a.oee-b.oee);
  t+=confirmed.length?confirmed.map(r=>`• ${r.machine}: ${Number(r.oee).toFixed(1).replace('.',',')}%.`).join('\n'):'• Nenhum OEE confirmado.';
  t+=`\n\n*AÇÕES PARA CORREÇÃO*\n`;
  if(selected.length!==3){
    t+=`Escolha exatamente 3 máquinas no Top 10 antes de compartilhar o relatório.`;
  }else{
    selected.forEach((r,i)=>{
      const sg=sgmanInsight(r.machine);
      const latest=sg.recent.map(o=>cleanProblemText(o.description||o.comment||o.solution)).filter(Boolean);
      t+=`${i+1}. ${r.machine} — OEE ${Number(r.oee).toFixed(1).replace('.',',')}%.\n`;
      if(state.sgman.ok){
        t+=`   Histórico SGMan 90 dias: ${sg.count} OS • ${sg.open} aberta(s)/atrasada(s).${latest[0]?` Última referência: ${latest[0]}`:''}\n`;
      }
      const hi=historyInsight(r.machine);
      if(hi.productionCount){
        const last=cleanProblemText(hi.lastProduction?.report||'');
        t+=`   Histórico produção: ${hi.productionCount} ocorrência(s) registrada(s).${last?` Última: ${last}`:''}\n`;
      }
      if(hi.powerBiCount){
        t+=`   Histórico Power BI: ${hi.powerBiCount} registro(s)${hi.powerBiAverage!=null?` • OEE médio ${hi.powerBiAverage.toFixed(1).replace('.',',')}%`:''}.\n`;
      }
      t+=`   • Analisar e resolver no turno.\n   • Apontar tudo no SGMan.\n   • Evitar retrabalho.\n`;
    });
  }
  $('reportText').value=t;
}
$('copyBtn').addEventListener('click',async()=>{
  await navigator.clipboard.writeText($('reportText').value);
  $('copyBtn').textContent='Copiado ✓'; setTimeout(()=>$('copyBtn').textContent='Copiar relatório',1400);
});
loadHistories().then(renderHistorySummary);
go('painel');
