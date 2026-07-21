module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '30.0.0',
    sgman_configured: Boolean(process.env.SGMAN_TOKEN),
    sgman_list_enabled: true,
    reliability_metrics_enabled: true,
    team_distribution_enabled: true,
    quick_os_enabled: true
  });
};
