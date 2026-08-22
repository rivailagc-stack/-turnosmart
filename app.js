
const $=id=>document.getElementById(id);
const state={imageDataUrl:null,analysis:null,selected:new Set(),sgman:{ok:false,orders:[],summary:null,byMachine:{}},history:{production:[],powerbi:[]}};

function todayISO(){
  const d=new Date(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
  return `${d.getFullYear()}-${m}-${day}`;
}
$('reportDate').value=todayISO();

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

$('oeeImageInput').addEventListener('change',async e=>{
  const f=e.target.files?.[0]; if(!f)return;
  $('status').textContent='Preparando foto...';
  state.imageDataUrl=await compressImage(f);
  $('preview').src=state.imageDataUrl; $('preview').classList.remove('hidden');
  $('status').textContent='Foto pronta para análise.';
});

function weekdayPt(dateStr){
  const [y,m,d]=dateStr.split('-').map(Number);
  const names=['DOMINGO','SEGUNDA','TERÇA','QUARTA','QUINTA','SEXTA','SÁBADO'];
  return names[new Date(y,m-1,d).getDay()];
}
function scopeLabel(){return `${weekdayPt($('reportDate').value)} ${$('reportShift').value}`;}

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

$('analyzeBtn').addEventListener('click',async()=>{
  if(!state.imageDataUrl){$('status').textContent='Escolha a foto primeiro.';return;}
  $('status').textContent=`Analisando ${scopeLabel()}...`;
  $('analyzeBtn').disabled=true;
  try{
    const [r]=await Promise.all([
      fetch('/api/oee-analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        imageDataUrl:state.imageDataUrl,
        scope:{label:scopeLabel(),date:$('reportDate').value,shift:$('reportShift').value}
      })}),
      loadSgman(),
      saveProductionHistory()
    ]);
    await loadHistories();
    const d=await r.json();
    if(!r.ok||!d.ok)throw new Error(d.error||`HTTP ${r.status}`);
    state.analysis=d;
    state.selected.clear();
    renderAnalysis();
    renderTop10();
    buildReport();
    $('status').textContent=`Leitura concluída: ${d.confirmedCount}/20 MK confirmadas.`;
    go('analise');
  }catch(e){
    $('status').textContent=`Erro: ${e.message}`;
  }finally{$('analyzeBtn').disabled=false;}
});

function renderAnalysis(){
  const d=state.analysis;
  const trend=d.currentTurnOee!=null&&d.previousTurnOee!=null
    ? `${d.previousTurnOee}% → ${d.currentTurnOee}% (${(d.currentTurnOee-d.previousTurnOee)>=0?'+':''}${(d.currentTurnOee-d.previousTurnOee).toFixed(1)} p.p.)`
    : 'comparação não disponível';
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
  const diff=(d.currentTurnOee!=null&&d.previousTurnOee!=null)?d.currentTurnOee-d.previousTurnOee:null;
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
