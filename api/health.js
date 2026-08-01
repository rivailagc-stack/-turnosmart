module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '62.0.0',
    universal_view_initialization_enabled: true,
    training_shortcut_initialization_fixed: true,
    native_ios_picker_enabled: true,
    media_preview_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
