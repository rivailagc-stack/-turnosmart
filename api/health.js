module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '59.0.0',
    ios_change_event_fix: true,
    premature_input_event_removed: true,
    heic_detection_enabled: true,
    media_preview_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
