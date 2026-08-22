
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


// =========================================================
// V5.2 — MOTOR DE LEITURA RESTAURADO DA V91
// OCR LOCAL + FOTO INTEIRA + COLUNA DINÂMICA + LINHA DA MK
// =========================================================
const V91_OEE_MACHINES=[
  'MK-138','MK-105','MK-108','MK-223','MK-192','MK-69','MK-172','MK-173',
  'MK-178','MK-179','MK-212','MK-214','MK-217','MK-220','MK-159','MK-222',
  'MK-170','MK-176','MK-188','MK-149'
];

function v91ClampByte(value){
  return Math.max(0,Math.min(255,Math.round(value)));
}

function v91NumericOeeFromWord(text=''){
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

function v91BoardColumnIndex(dateStr,shift){
  const [y,m,d]=String(dateStr).split('-').map(Number);
  const date=new Date(y,m-1,d,12,0,0,0);
  const jsDay=date.getDay();
  const mondayIndex=jsDay===0?6:jsDay-1;
  const shiftOffset=String(shift||'A').toUpperCase()==='B'?1:0;
  return mondayIndex*2+shiftOffset;
}

function v91Geometry(image,dateStr,shift){
  return {
    boardLeftRatio:0.035,
    boardRightRatio:0.995,
    rowsTopRatio:0.155,
    rowsBottomRatio:0.97,
    targetColumnIndex:v91BoardColumnIndex(dateStr,shift),
    expectedColumnCount:14
  };
}

async function v91LoadImage(dataUrl){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=reject;
    img.src=dataUrl;
  });
}

function v91Preprocess(image,dateStr,shift){
  const geometry=v91Geometry(image,dateStr,shift);
  const naturalWidth=image.naturalWidth||image.width;
  const naturalHeight=image.naturalHeight||image.height;

  const desiredWidth=Math.max(1800,Math.min(2800,naturalWidth*1.35));
  const scale=desiredWidth/Math.max(1,naturalWidth);
  const width=Math.max(1,Math.round(naturalWidth*scale));
  const height=Math.max(1,Math.round(naturalHeight*scale));

  const canvas=document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,width,height);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(image,0,0,naturalWidth,naturalHeight,0,0,width,height);

  const imageData=ctx.getImageData(0,0,width,height);
  const px=imageData.data;

  for(let i=0;i<px.length;i+=4){
    const r=px[i],g=px[i+1],b=px[i+2];
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    const saturation=max-min;
    const lum=.299*r+.587*g+.114*b;
    let value;

    if(saturation<15&&lum>155)value=255;
    else if(saturation>=18)value=v91ClampByte(lum*.62-saturation*.48+38);
    else value=v91ClampByte((lum-105)*1.5+105);

    px[i]=value;px[i+1]=value;px[i+2]=value;px[i+3]=255;
  }
  ctx.putImageData(imageData,0,0);

  return {canvas,geometry,ocrDataUrl:canvas.toDataURL('image/png')};
}

function v91MapWords(words=[],canvasHeight=1,canvasWidth=1,geometry){
  const rowCount=V91_OEE_MACHINES.length;
  const rowsTop=canvasHeight*geometry.rowsTopRatio;
  const rowsBottom=canvasHeight*geometry.rowsBottomRatio;
  const rowHeight=Math.max(1,rowsBottom-rowsTop)/rowCount;
  const boardLeft=canvasWidth*geometry.boardLeftRatio;
  const boardRight=canvasWidth*geometry.boardRightRatio;

  const candidates=[];

  for(const word of words){
    const parsed=v91NumericOeeFromWord(word.text);
    if(!parsed)continue;
    const value=Number(parsed.value);
    if(!Number.isFinite(value)||value<20||value>100)continue;

    const box=word.bbox||{};
    const x0=Number(box.x0??box.left??0),x1=Number(box.x1??box.right??x0);
    const y0=Number(box.y0??box.top??0),y1=Number(box.y1??box.bottom??y0);
    const x=(x0+x1)/2,y=(y0+y1)/2;

    if(x<boardLeft||x>boardRight||y<rowsTop||y>rowsBottom)continue;

    candidates.push({
      value,
      hasPercent:parsed.hasPercent,
      confidence:Number(word.confidence||0),
      x,y,
      raw:String(word.text||'').trim()
    });
  }

  // Igual à V91: descobre as colunas pelos próprios números reconhecidos.
  const sorted=[...candidates].sort((a,b)=>a.x-b.x);
  const tolerance=Math.max(20,canvasWidth*.032);
  const clusters=[];

  for(const item of sorted){
    let cluster=clusters.find(c=>Math.abs(c.centerX-item.x)<=tolerance);
    if(!cluster){
      cluster={centerX:item.x,items:[]};
      clusters.push(cluster);
    }
    cluster.items.push(item);
    cluster.centerX=cluster.items.reduce((s,x)=>s+x.x,0)/cluster.items.length;
  }

  const useful=clusters
    .filter(c=>c.items.length>=2)
    .sort((a,b)=>a.centerX-b.centerX);

  let target=null;
  if(useful.length===1){
    target=useful[0];
  }else if(useful.length>1){
    const expected=geometry.expectedColumnCount||14;
    const idx=Math.max(0,Math.min(expected-1,geometry.targetColumnIndex||0));

    if(useful.length>=10&&idx<useful.length){
      target=useful[idx];
    }else{
      const ratio=idx/Math.max(1,expected-1);
      const first=useful[0].centerX,last=useful[useful.length-1].centerX;
      const expectedX=first+(last-first)*ratio;
      target=[...useful].sort((a,b)=>
        Math.abs(a.centerX-expectedX)-Math.abs(b.centerX-expectedX)
      )[0];
    }
  }

  let selected=candidates;
  if(target){
    const selectedTolerance=Math.max(32,canvasWidth*.047);
    selected=candidates.filter(x=>Math.abs(x.x-target.centerX)<=selectedTolerance);
  }

  const buckets=Array.from({length:rowCount},()=>[]);
  for(const item of selected){
    const row=Math.floor((item.y-rowsTop)/rowHeight);
    if(row<0||row>=rowCount)continue;
    const rowTop=rowsTop+row*rowHeight;
    const inside=(item.y-rowTop)/rowHeight;
    if(inside<.03||inside>.97)continue;
    buckets[row].push(item);
  }

  return V91_OEE_MACHINES.map((machine,index)=>{
    const list=buckets[index];
    if(!list.length){
      return {machine,oee:null,confirmed:false,confidence:0,reason:'Não identificado pelo OCR local.'};
    }

    list.sort((a,b)=>{
      if(a.hasPercent!==b.hasPercent)return a.hasPercent?-1:1;
      if(a.confidence!==b.confidence)return b.confidence-a.confidence;
      return b.x-a.x;
    });

    const chosen=list[0];
    const conflict=list.some(x=>
      Math.abs(Number(x.value)-Number(chosen.value))>5 &&
      (x.hasPercent||x.confidence>=55)
    );

    // V91 mostrava o valor provável mesmo quando a confiança era moderada.
    // Aqui confirmamos automaticamente somente leitura razoável,
    // mas NÃO apagamos o valor provável.
    const confirmed=!conflict && (
      chosen.hasPercent ||
      Number(chosen.confidence)>=42
    );

    return {
      machine,
      oee:Number(chosen.value),
      confirmed,
      confidence:Number(chosen.confidence||0),
      candidate:true,
      reason:confirmed
        ?`${chosen.raw} lido pelo OCR local na coluna selecionada.`
        :`${chosen.raw} provável — conferir.`
    };
  });
}

function v91DetectHeaderOee(words=[],canvasWidth=1,canvasHeight=1,geometry){
  // Usa apenas região superior e a coluna alvo estimada.
  const topLimit=canvasHeight*.17;
  const numeric=[];

  for(const word of words){
    const p=v91NumericOeeFromWord(word.text);
    if(!p)continue;
    const box=word.bbox||{};
    const x=(Number(box.x0??0)+Number(box.x1??box.x0??0))/2;
    const y=(Number(box.y0??0)+Number(box.y1??box.y0??0))/2;
    if(y>topLimit)continue;
    if(p.value<20||p.value>100)continue;
    numeric.push({x,y,value:Number(p.value),hasPercent:p.hasPercent,confidence:Number(word.confidence||0)});
  }

  if(!numeric.length)return null;

  // Posição esperada da coluna dentro do quadro.
  const left=canvasWidth*geometry.boardLeftRatio;
  const right=canvasWidth*geometry.boardRightRatio;
  const ratio=(geometry.targetColumnIndex+.5)/geometry.expectedColumnCount;
  const expectedX=left+(right-left)*ratio;

  const near=numeric
    .filter(x=>Math.abs(x.x-expectedX)<canvasWidth*.055)
    .sort((a,b)=>{
      if(a.hasPercent!==b.hasPercent)return a.hasPercent?-1:1;
      return b.confidence-a.confidence;
    });

  return near[0]?.value??null;
}

async function v91ReadOeeBoard(dataUrl,dateStr,shift,statusEl){
  if(!window.Tesseract)throw new Error('OCR local não carregou.');

  const image=await v91LoadImage(dataUrl);
  const processed=v91Preprocess(image,dateStr,shift);

  const result=await window.Tesseract.recognize(
    processed.ocrDataUrl,
    'eng',
    {
      logger:info=>{
        if(info.status==='recognizing text'&&typeof info.progress==='number'){
          statusEl.textContent=`Lendo quadro localmente... ${Math.round(info.progress*100)}%`;
        }
      }
    },
    {
      tessedit_char_whitelist:'0123456789%.,',
      tessedit_pageseg_mode:'11',
      preserve_interword_spaces:'1'
    }
  );

  const words=result?.data?.words||[];
  const rows=v91MapWords(
    words,
    processed.canvas.height,
    processed.canvas.width,
    processed.geometry
  );

  const currentTurnOee=v91DetectHeaderOee(
    words,
    processed.canvas.width,
    processed.canvas.height,
    processed.geometry
  );

  return {
    ok:true,
    scope:scopeLabel(),
    rows,
    confirmedCount:rows.filter(r=>r.confirmed).length,
    currentTurnOee,
    previousTurnOee:null,
    source:'ocr_local_v91'
  };
}

$('analyzeBtn').addEventListener('click',async()=>{
  renderTeamScale();

  if(!state.imageDataUrl){
    $('status').textContent='Escolha a foto primeiro.';
    return;
  }

  const btn=$('analyzeBtn');
  btn.disabled=true;
  $('status').textContent=`Lendo ${scopeLabel()} com OCR local...`;

  try{
    // 1) MOTOR V91 LOCAL — não depende da API.
    let data=await v91ReadOeeBoard(
      state.imageDataUrl,
      $('reportDate').value,
      $('reportShift').value,
      $('status')
    );

    // 2) Se o OCR local leu menos de 3 MKs, tenta IA apenas como reserva.
    if(data.confirmedCount<3){
      $('status').textContent='OCR local encontrou poucos valores. Tentando IA como reserva...';

      try{
        const r=await fetch('/api/oee-analyze',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            imageDataUrl:state.imageDataUrl,
            scope:{
              label:scopeLabel(),
              date:$('reportDate').value,
              shift:$('reportShift').value
            }
          })
        });
        const ai=await r.json().catch(()=>null);

        if(r.ok&&ai?.ok&&Number(ai.confirmedCount||0)>data.confirmedCount){
          data=ai;
        }
      }catch(e){
        console.warn('IA reserva indisponível; mantendo OCR V91.',e);
      }
    }

    state.analysis=data;
    state.selected.clear();

    // Dados auxiliares nunca bloqueiam a leitura.
    await Promise.allSettled([
      loadSgman(),
      saveProductionHistory(),
      loadHistories()
    ]);

    renderAnalysis();
    renderTop10();
    buildReport();

    $('status').textContent=
      `Leitura concluída: ${data.confirmedCount}/20 MK identificadas.`;

    go('analise');

  }catch(e){
    console.error(e);
    $('status').textContent=`Erro na leitura local: ${e.message||e}`;
  }finally{
    btn.disabled=false;
  }
});

function renderAnalysis(){
  const d=state.analysis;
  const trend=Number.isFinite(Number(d.currentTurnOee))&&
    d.previousTurnOee!==null&&d.previousTurnOee!==undefined&&d.previousTurnOee!==''&&
    Number.isFinite(Number(d.previousTurnOee))
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
