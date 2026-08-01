module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '60.0.0',
    ios_library_button_fix: true,
    full_button_file_input_overlay: true,
    pointer_events_enabled: true,
    same_file_reselection_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
