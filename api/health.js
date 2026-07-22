module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '33.0.0',
    sgman_configured: Boolean(process.env.SGMAN_TOKEN),
    sgman_list_enabled: true,
    machine_specific_history_enabled: true,
    non_blocking_report_analysis: true
  });
};
