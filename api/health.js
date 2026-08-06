module.exports=(req,res)=>res.status(200).json({
  ok:true,
  app:'TurnoSmart',
  version:'71.0.0',
  normalize_machine_code_fixed:true,
  visual_training_save_fixed:true,
  industrial_knowledge_center_enabled:true,
  mechanic_ai_enabled:Boolean(process.env.OPENAI_API_KEY),
  knowledge_gap_dashboard_enabled:true,
  real_shift_priority_enabled:true,
  oee_board_rows_fixed:true,
  horizontal_row_validation_enabled:true,
  monthly_management_evolution_enabled:true,
  visual_ai_training_enabled:Boolean(process.env.OPENAI_API_KEY),
  visual_training_cloud_enabled:Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  sgman_configured:Boolean(process.env.SGMAN_TOKEN)
});
