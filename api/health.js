module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '47.0.0',
    original_pages_restored: true,
    new_report_enabled: true,
    quick_os_enabled: true,
    virtual_mechanic_enabled: true,
    analysis_enabled: true,
    actions_enabled: true,
    oee_dashboard_enabled: true,
    turn_intelligence_enabled: true,
    scale_enabled: true,
    history_enabled: true,
    configuration_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
