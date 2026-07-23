module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '38.0.0',
    mttf_removed: true,
    completed_orders_window_hours: 12,
    cache_busting_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
};
