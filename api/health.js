module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '58.0.0',
    ios_media_input_fix: true,
    input_and_change_events_enabled: true,
    image_optimization_enabled: true,
    image_limit_mb: 25,
    video_limit_mb: 40,
    media_preview_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
