module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '48.0.0',
    isolated_navigation_enabled: true,
    lazy_intelligence_initialization: true,
    runtime_error_guard_enabled: true,
    original_pages_enabled: true,
    turn_intelligence_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
