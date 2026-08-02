const https=require('https');
const crypto=require('crypto');

function send(res,status,body){
  res.status(status).json(body);
}

function supabaseConfig(){
  return {
    base:String(process.env.SUPABASE_URL||'').replace(/\/$/,''),
    key:process.env.SUPABASE_SERVICE_ROLE_KEY||''
  };
}

function request(method,urlString,body=null,headers={}){
  const url=new URL(urlString);
  const payload=body==null
    ? null
    : Buffer.isBuffer(body)
      ? body
      : Buffer.from(JSON.stringify(body));

  return new Promise((resolve,reject)=>{
    const req=https.request({
      method,
      hostname:url.hostname,
      path:`${url.pathname}${url.search}`,
      headers:{
        ...headers,
        ...(payload?{'Content-Length':payload.length}:{})
      }
    },response=>{
      let chunks=[];

      response.on('data',chunk=>chunks.push(chunk));

      response.on('end',()=>{
        const buffer=Buffer.concat(chunks);
        const text=buffer.toString('utf8');
        let data=text;

        try{
          data=text?JSON.parse(text):null;
        }catch{}

        if(response.statusCode<200||response.statusCode>=300){
          return reject(new Error(
            typeof data==='object'
              ? JSON.stringify(data)
              : String(data||`HTTP ${response.statusCode}`)
          ));
        }

        resolve(data);
      });
    });

    req.on('error',reject);

    if(payload)req.write(payload);
    req.end();
  });
}

function mapRow(row){
  return {
    id:row.id,
    type:row.media_type,
    title:row.title,
    machine:row.machine||'',
    machineType:row.machine_type||'outros',
    problemType:row.problem_type||'',
    category:row.category||'Geral',
    description:row.description||'',
    steps:row.steps||'',
    safety:row.safety||'',
    validation:row.validation||'',
    keywords:Array.isArray(row.keywords)?row.keywords:[],
    mediaUrl:row.media_url,
    aiUsed:Boolean(row.ai_used),
    cloud:true,
    createdAt:row.created_at,
    updatedAt:row.updated_at
  };
}

module.exports=async(req,res)=>{
  try{
    const {base,key}=supabaseConfig();

    if(!base||!key){
      return send(res,200,{
        ok:true,
        cloud:false,
        items:[]
      });
    }

    const commonHeaders={
      apikey:key,
      Authorization:`Bearer ${key}`
    };

    if(req.method==='GET'){
      const rows=await request(
        'GET',
        `${base}/rest/v1/maintenance_visual_training?select=*&order=updated_at.desc`,
        null,
        commonHeaders
      );

      return send(res,200,{
        ok:true,
        cloud:true,
        items:(rows||[]).map(mapRow)
      });
    }

    if(req.method==='POST'){
      const action=req.body?.action;

      if(action!=='upsert'){
        return send(res,400,{
          ok:false,
          error:'Ação inválida.'
        });
      }

      const item=req.body?.item||{};
      const dataUrl=item.mediaDataUrl||'';

      const match=dataUrl.match(
        /^data:([^;]+);base64,(.+)$/
      );

      if(!match){
        return send(res,400,{
          ok:false,
          error:'Mídia inválida.'
        });
      }

      const mime=match[1];
      const bytes=Buffer.from(match[2],'base64');
      const extension=(
        item.mediaName?.split('.').pop()||
        mime.split('/').pop()||
        'jpg'
      ).replace(/[^a-zA-Z0-9]/g,'');

      const safeId=String(item.id||crypto.randomUUID())
        .replace(/[^a-zA-Z0-9_-]/g,'_');

      const objectPath=
        `visual-training/${safeId}-${Date.now()}.${extension}`;

      await request(
        'POST',
        `${base}/storage/v1/object/training-media/${objectPath}`,
        bytes,
        {
          ...commonHeaders,
          'Content-Type':mime,
          'x-upsert':'true'
        }
      );

      const mediaUrl=
        `${base}/storage/v1/object/public/training-media/${objectPath}`;

      const row={
        id:item.id,
        media_type:item.type||'image',
        title:item.title,
        machine:item.machine||null,
        machine_type:item.machineType||'outros',
        problem_type:item.problemType||'',
        category:item.category||'Geral',
        description:item.description||'',
        steps:item.steps||'',
        safety:item.safety||'',
        validation:item.validation||'',
        keywords:item.keywords||[],
        media_url:mediaUrl,
        ai_used:Boolean(item.aiUsed),
        created_at:item.createdAt||new Date().toISOString(),
        updated_at:new Date().toISOString()
      };

      const saved=await request(
        'POST',
        `${base}/rest/v1/maintenance_visual_training?on_conflict=id`,
        row,
        {
          ...commonHeaders,
          'Content-Type':'application/json',
          Prefer:'resolution=merge-duplicates,return=representation'
        }
      );

      const result=Array.isArray(saved)?saved[0]:row;

      return send(res,200,{
        ok:true,
        cloud:true,
        item:mapRow(result)
      });
    }

    res.setHeader('Allow','GET, POST');
    return send(res,405,{
      ok:false,
      error:'Método não permitido.'
    });
  }catch(error){
    return send(res,500,{
      ok:false,
      error:error.message
    });
  }
};
