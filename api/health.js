module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '40.0.0',
    mttf_removed: true,
    completed_orders_mode: 'current_operational_shift',
    day_shift: '06:00-18:20',
    night_shift: '18:20-06:00',
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
};
