module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '37.0.0',
    sgman_configured: Boolean(process.env.SGMAN_TOKEN),
    sgman_list_enabled: true,
    machine_tree_metrics_enabled: true,
    stopped_orders_only_enabled: true,
    current_shift_completed_enabled: true,
    efficiency_trend_enabled: true,
    daily_plan_enabled: true
  });
};
