function parseBody(body){
  if(!body)return {};
  if(typeof body==='object')return body;
  try{return JSON.parse(body)}catch{return {}}
}
function cfg(){
  return {
    url:String(process.env.SUPABASE_URL||'').replace(/\/$/,''),
    key:String(process.env.SUPABASE_SERVICE_ROLE_KEY||'')
  };
}
async function sb(path,options={}){
  const {url,key}=cfg();
  if(!url||!key)throw new Error('Supabase não configurado.');
  const r=await fetch(`${url}/rest/v1/${path}`,{
    ...options,
    headers:{
      'Content-Type':'application/json',
      'apikey':key,
      'Authorization':`Bearer ${key}`,
      ...(options.headers||{})
    }
  });
  const text=await r.text();
  let data;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok)throw new Error(typeof data==='string'?data:JSON.stringify(data));
  return data;
}
module.exports=async(req,res)=>{
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Use POST.'});
  const body=parseBody(req.body), action=String(body.action||'');
  const {url,key}=cfg();

  // The browser has localStorage fallback; API reports not configured rather than breaking app.
  if(!url||!key){
    return res.status(200).json({ok:false,configured:false,error:'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY não configurados.'});
  }

  try{
    if(action==='save_production'){
      const r=body.row||{};
      const payload={
        report_date:r.date||null,
        shift:r.shift||'',
        scope:r.scope||'',
        report_text:r.report||'',
        machines:Array.isArray(r.machines)?r.machines:[],
        saved_at:r.savedAt||new Date().toISOString()
      };
      await sb('turnosmart_production_history',{
        method:'POST',
        headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(payload)
      });
      return res.status(200).json({ok:true,saved:1});
    }

    if(action==='save_powerbi'){
      const rows=(body.rows||[]).slice(0,200).map(r=>({
        report_date:r.date||null,
        shift:r.shift||'',
        machine:r.machine||'',
        product:r.product||'',
        oee:Number(r.oee),
        raw_data:r.raw||r,
        saved_at:r.savedAt||new Date().toISOString()
      }));
      if(rows.length){
        await sb('turnosmart_powerbi_history',{
          method:'POST',
          headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
          body:JSON.stringify(rows)
        });
      }
      return res.status(200).json({ok:true,saved:rows.length});
    }

    if(action==='list'){
      const start=encodeURIComponent(body.dateFrom||'2026-01-01');
      const end=encodeURIComponent(body.dateTo||'2099-12-31');

      const [production,powerbi]=await Promise.all([
        sb(`turnosmart_production_history?select=*&report_date=gte.${start}&report_date=lte.${end}&order=report_date.asc`),
        sb(`turnosmart_powerbi_history?select=*&report_date=gte.${start}&report_date=lte.${end}&order=report_date.asc`)
      ]);

      return res.status(200).json({
        ok:true,
        production:(production||[]).map(r=>({
          date:r.report_date,shift:r.shift,scope:r.scope,report:r.report_text,
          machines:r.machines||[],savedAt:r.saved_at
        })),
        powerbi:(powerbi||[]).map(r=>({
          date:r.report_date,shift:r.shift,machine:r.machine,product:r.product,
          oee:Number(r.oee),raw:r.raw_data,savedAt:r.saved_at
        }))
      });
    }

    return res.status(400).json({ok:false,error:'Ação inválida.'});
  }catch(e){
    return res.status(200).json({ok:false,error:String(e?.message||e)});
  }
};
