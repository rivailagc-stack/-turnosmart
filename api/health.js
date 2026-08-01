module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '63.0.0',
    visible_native_file_inputs_enabled: true,
    javascript_file_picker_removed: true,
    ios_library_compatibility_mode: true,
    media_preview_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
