module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '57.0.0',
    persistent_media_selection_enabled: true,
    media_preview_enabled: true,
    media_library_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
