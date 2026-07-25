module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '46.0.0',
    turn_intelligence_enabled: true,
    oee_photo_history_enabled: true,
    group_history_seed_enabled: true,
    sgman_cross_analysis_enabled: true,
    preventive_plan_enabled: true,
    mechanic_development_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
