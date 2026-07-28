module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '51.0.0',
    morning_shift: '06:00-18:20',
    night_shift: '18:00-06:20',
    full_shift_label_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
