module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '64.0.0',
    immediate_explanation_generation_enabled: true,
    deferred_media_conversion_enabled: true,
    visible_error_messages_enabled: true,
    native_ios_file_input_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
