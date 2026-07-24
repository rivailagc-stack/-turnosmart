module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '41.0.0',
    manager_dashboard_enabled: true,
    virtual_mechanic_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
