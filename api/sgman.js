module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  return res.status(501).json({
    integrated: false,
    message: 'Conector SGMan preparado para a próxima etapa. É necessário receber a URL, autenticação e documentação da API usada pela empresa.',
    received: req.body || null
  });
};
