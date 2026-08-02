module.exports=(req,res)=>res.status(200).json({
  ok:true,
  app:'TurnoSmart',
  version:'65.0.0',
  training_machine_options_fixed:true,
  visual_ai_training_enabled:Boolean(process.env.OPENAI_API_KEY),
  visual_training_cloud_enabled:Boolean(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ),
  sgman_problem_reference_enabled:true,
  machine_type_filters_enabled:true,
  problem_type_filters_enabled:true,
  sgman_configured:Boolean(process.env.SGMAN_TOKEN)
});
