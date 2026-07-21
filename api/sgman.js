const DEFAULT_ENDPOINT = 'https://api.sgman.com.br/os/criar';

const ALLOWED_FIELDS = new Set([
  'regiao', 'local', 'tag', 'data_programada', 'data_inicio', 'data_fim',
  'duracao_estimada', 'qtd_executantes', 'tipo_servico',
  'tipo_manutencao', 'executante', 'prioridade', 'id_ext', 'pendente',
  'descricao', 'comentario', 'maquina_parada', 'parametros', 'fotos'
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

function flattenEntries(value, path = '', entries = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenEntries(item, `${path}[${index}]`, entries));
    return entries;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      const nextPath = path ? `${path}.${key}` : key;
      entries.push({ key, path: nextPath, value: item });
      flattenEntries(item, nextPath, entries);
    });
  }

  return entries;
}

function textOf(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); }
  catch { return String(value ?? ''); }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function isRateLimitResponse(data, raw = '', status = 0) {
  const text = `${textOf(data)} ${raw || ''}`.toLowerCase();

  return (
    status === 429 ||
    /requisi[cç][oõ]es simult[aâ]neas/.test(text) ||
    /m[aá]ximo de 2 requisi[cç][oõ]es por segundo/.test(text) ||
    /too many requests/.test(text) ||
    /rate limit/.test(text)
  );
}

function inspectSgmanResponse(data, raw, httpOk) {
  const entries = flattenEntries(data);
  const allText = `${textOf(data)} ${raw || ''}`.toLowerCase();

  const negativeBoolean = entries.some(entry =>
    /^(ok|success|sucesso|status)$/i.test(entry.key) && entry.value === false
  );

  const positiveBoolean = entries.some(entry =>
    /^(ok|success|sucesso|status)$/i.test(entry.key) && entry.value === true
  );

  const errorField = entries.find(entry =>
    /^(erro|error|errors|erros|falha|failure)$/i.test(entry.key) &&
    entry.value &&
    textOf(entry.value).trim() !== ''
  );

  const failureText = /\b(erro|falha|recusad|inv[aá]lid|n[aã]o encontrado|não encontrado|token incorreto|token inv[aá]lido)\b/i.test(allText);
  const successText = /\b(sucesso|criad[ao]|cadastrad[ao]|inserid[ao]|ordem criada|os criada)\b/i.test(allText);

  const idEntry = entries.find(entry => {
    if (/id_ext/i.test(entry.key)) return false;
    return /^(id|id_os|os_id|numero|numero_os|n_os|codigo|cod_os)$/i.test(entry.key) &&
      ['string', 'number'].includes(typeof entry.value) &&
      String(entry.value).trim() !== '';
  });

  const orderNumber = idEntry ? idEntry.value : null;

  if (!httpOk || negativeBoolean || errorField || failureText) {
    return {
      status: 'failed',
      reason: errorField
        ? textOf(errorField.value)
        : (!httpOk ? 'O endpoint respondeu com erro HTTP.' : 'A resposta do SGMan indica erro.')
    };
  }

  if (orderNumber != null) {
    return {
      status: 'confirmed',
      reason: 'O SGMan retornou um identificador de ordem.',
      orderNumber
    };
  }

  if (positiveBoolean || successText) {
    return {
      status: 'confirmed',
      reason: 'O SGMan confirmou a criação na resposta.',
      orderNumber: null
    };
  }

  return {
    status: 'unknown',
    reason: 'A requisição chegou ao SGMan, mas a resposta não confirmou que a OS foi criada.',
    orderNumber: null
  };
}

async function sendSingleOrder(endpoint, token, order) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
          os: [order]
        }),
        signal: controller.signal
      });

      const raw = await upstream.text();
      let data;

      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = raw;
      }

      const rateLimited = isRateLimitResponse(data, raw, upstream.status);

      if (rateLimited && attempt < maxAttempts) {
        await sleep(500 + attempt * 1000);
        continue;
      }

      const inspection = inspectSgmanResponse(data, raw, upstream.ok);

      return {
        id_ext: order.id_ext || '',
        machine: String(order.descricao || '').split(' - ')[0] || '',
        tag: order.tag || order.local || '',
        executante: order.executante || '',
        http_status: upstream.status,
        status: rateLimited ? 'failed' : inspection.status,
        reason: rateLimited
          ? 'O SGMan manteve o bloqueio por limite de requisições após novas tentativas.'
          : inspection.reason,
        order_number: inspection.orderNumber || null,
        attempts: attempt,
        response: data
      };
    } catch (error) {
      if (attempt < maxAttempts && error?.name !== 'AbortError') {
        await sleep(500 + attempt * 1000);
        continue;
      }

      return {
        id_ext: order.id_ext || '',
        machine: String(order.descricao || '').split(' - ')[0] || '',
        tag: order.tag || order.local || '',
        executante: order.executante || '',
        http_status: 0,
        status: 'failed',
        reason: error?.name === 'AbortError'
          ? 'Tempo limite ao conectar com o SGMan.'
          : `Falha de comunicação: ${error.message}`,
        order_number: null,
        attempts: attempt,
        response: null
      };
    } finally {
      clearTimeout(timeout);
    }
  }
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
    return res.status(400).json({ ok: false, error: 'Nenhuma ordem recebida.' });
  }

  if (incomingOrders.length > 30) {
    return res.status(400).json({ ok: false, error: 'Limite de 30 ordens por envio.' });
  }

  const orders = incomingOrders.map(sanitizeOrder);

  for (const order of orders) {
    if (!order.tag && !order.local) {
      return res.status(400).json({ ok: false, error: 'Cada OS precisa ter tag ou local.' });
    }
    if (!order.descricao) {
      return res.status(400).json({ ok: false, error: 'Cada OS precisa ter descrição.' });
    }
  }

  const results = [];

  for (let index = 0; index < orders.length; index++) {
    const order = orders[index];

    // A API aceita no máximo duas solicitações por segundo.
    // O intervalo de 900 ms cria uma margem segura.
    if (index > 0) await sleep(900);

    results.push(await sendSingleOrder(endpoint, token, order));
  }

  const confirmed = results.filter(result => result.status === 'confirmed').length;
  const failed = results.filter(result => result.status === 'failed').length;
  const unknown = results.filter(result => result.status === 'unknown').length;

  return res.status(200).json({
    ok: failed === 0 && unknown === 0 && confirmed === results.length,
    requested: orders.length,
    confirmed,
    failed,
    unknown,
    results
  });
};
