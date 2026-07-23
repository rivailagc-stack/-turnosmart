module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '36.0.0',
    sgman_configured: Boolean(process.env.SGMAN_TOKEN),
    sgman_list_enabled: true,
    machine_tree_analysis_enabled: true,
    precise_history_analysis_enabled: true,
    limited_actions_enabled: true
  });
};
