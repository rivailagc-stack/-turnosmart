module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: 'TurnoSmart',
    version: '12.0.0',
    sgman_configured: Boolean(process.env.SGMAN_TOKEN)
  });
};
