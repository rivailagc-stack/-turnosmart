module.exports=(req,res)=>res.status(200).json({ok:true,app:'TurnoSmart',version:'55.0.0',visual_training:true,live_sgman_dashboard:true,sgman_configured:Boolean(process.env.SGMAN_TOKEN)});
