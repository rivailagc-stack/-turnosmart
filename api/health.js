module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '27.0.0',
    sgman_configured: Boolean(process.env.SGMAN_TOKEN),
    sgman_list_enabled: true,
    reliability_metrics_enabled: true,
    metrics_source: 'SGMan only'
  });
};
