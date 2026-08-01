module.exports = (req, res) =>
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '56.0.0',
    camera_photo_enabled: true,
    media_library_enabled: true,
    camera_video_enabled: true,
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
