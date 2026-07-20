module.exports = function handler(req, res) {
  res.status(200).json({ ok: true, app: 'TurnoSmart', version: '1.0.0' });
};
