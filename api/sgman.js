const DEFAULT_ENDPOINT = 'https://api.sgman.com.br/os/criar';

const ALLOWED_FIELDS = new Set([
  'regiao',
  'local',
  'tag',
  'data_programada',
  'data_inicio',
  'data_fim',
  'duracao_estimada',
  'qtd_executantes',
  'tipo_servico',
  'tipo_manutencao',
  'executante',
  'prioridade',
  'id_ext',
  'pendente',
  'descricao',
  'comentario',
  'maquina_parada',
  'parametros',
  'fotos'
]);

function sanitizeOrder(input) {
  const output = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (value === undefined || value === null || value === '') continue;
    output[key] = value;
  }
  return output;
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try { return JSON.parse(body); }
  catch { return {}; }
}

module.exports = async function handler(req, res) {
  const token = process.env.SGMAN_TOKEN;
  const endpoint = process.env.SGMAN_API_URL || DEFAULT_ENDPOINT;

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      configured: Boolean(token),
      endpoint: endpoint.replace(/\/os\/criar.*$/i, '/os/criar')
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  if (!token) {
    return res.status(503).json({
      ok: false,
      error: 'SGMAN_TOKEN não configurado na Vercel.'
    });
  }

  const body = parseBody(req.body);
  const incomingOrders = Array.isArray(body.orders) ? body.orders : [];

  if (!incomingOrders.length) {
    return res.status(400).json({
      ok: false,
      error: 'Nenhuma ordem recebida.'
    });
  }

  if (incomingOrders.length > 30) {
    return res.status(400).json({
      ok: false,
      error: 'Limite de 30 ordens por envio.'
    });
  }

  const orders = incomingOrders.map(sanitizeOrder);

  for (const order of orders) {
    if (!order.tag && !order.local) {
      return res.status(400).json({
        ok: false,
        error: 'Cada OS precisa ter tag ou local.'
      });
    }
    if (!order.descricao) {
      return res.status(400).json({
        ok: false,
        error: 'Cada OS precisa ter descrição.'
      });
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        token,
        os: orders
      }),
      signal: controller.signal
    });

    const raw = await upstream.text();
    let data;
    try { data = raw ? JSON.parse(raw) : null; }
    catch { data = raw; }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        ok: false,
        error: 'O SGMan recusou a criação das ordens.',
        sgman_status: upstream.status,
        sgman_response: data
      });
    }

    return res.status(200).json({
      ok: true,
      sent: orders.length,
      sgman_status: upstream.status,
      sgman_response: data
    });
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return res.status(aborted ? 504 : 502).json({
      ok: false,
      error: aborted
        ? 'Tempo limite ao conectar com o SGMan.'
        : `Falha de comunicação com o SGMan: ${error.message}`
    });
  } finally {
    clearTimeout(timeout);
  }
};
