const LIST_ENDPOINT = 'https://api.sgman.com.br/os/listar';

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'object') return body;
  try { return JSON.parse(body); }
  catch { return {}; }
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function textOf(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); }
  catch { return String(value ?? ''); }
}

function isRateLimited(data, raw = '', status = 0) {
  const text = `${textOf(data)} ${raw}`.toLowerCase();
  return (
    status === 429 ||
    /requisi[cç][oõ]es simult[aâ]neas/.test(text) ||
    /2 requisi[cç][oõ]es por segundo/.test(text) ||
    /too many requests/.test(text)
  );
}

function flattenObject(value, prefix = '', output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flattenObject(item, `${prefix}[${index}]`, output));
    return output;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      output.push({ key: String(key).toLowerCase(), path, value: item });
      flattenObject(item, path, output);
    });
  }

  return output;
}

function pickValue(object, candidates) {
  const entries = flattenObject(object);
  for (const candidate of candidates) {
    const found = entries.find(entry => entry.key === candidate.toLowerCase());
    if (found && found.value !== null && found.value !== '') return found.value;
  }
  return '';
}

function looksLikeOrder(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false;
  const keys = Object.keys(object).map(key => key.toLowerCase());
  const evidence = [
    'status', 'situacao', 'situação', 'descricao', 'descrição',
    'tag', 'executante', 'tipo_servico', 'tipo_manutencao',
    'data_inicio', 'data_fim', 'comentario', 'comentário'
  ];
  const score = evidence.filter(key => keys.includes(key)).length;
  return score >= 2;
}

function collectOrderObjects(value, output = [], seen = new Set()) {
  if (Array.isArray(value)) {
    value.forEach(item => collectOrderObjects(item, output, seen));
    return output;
  }

  if (!value || typeof value !== 'object') return output;

  if (looksLikeOrder(value)) {
    const signature = textOf(value);
    if (!seen.has(signature)) {
      seen.add(signature);
      output.push(value);
    }
  }

  Object.values(value).forEach(item => collectOrderObjects(item, output, seen));
  return output;
}

function normalizeMachine(value = '') {
  const digits = String(value).match(/(?:mk\s*[-:]?\s*)?(\d{1,3})/i)?.[1];
  return digits ? `MK-${String(Number(digits)).padStart(2, '0')}` : '';
}

function normalizeStatus(value = '') {
  const text = String(value).toLowerCase();
  if (text.includes('conclu')) return 'completed';
  if (text.includes('atras')) return 'overdue';
  if (text.includes('abert')) return 'open';
  return 'other';
}

function normalizeDate(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function normalizeOrder(order) {
  const status = pickValue(order, ['status', 'situacao', 'situação', 'status_os']);
  const tag = pickValue(order, ['tag', 'tag_nome', 'tagname']);
  const description = pickValue(order, ['descricao', 'descrição', 'titulo', 'servico', 'serviço', 'solicitacao']);
  const comment = pickValue(order, ['comentario', 'comentário', 'observacao', 'observação']);
  const solution = pickValue(order, [
    'solucao', 'solução', 'servico_realizado', 'serviço_realizado',
    'descricao_conclusao', 'descrição_conclusão', 'comentario_conclusao',
    'observacao_conclusao', 'ação_realizada', 'acao_realizada'
  ]);
  const endDate = pickValue(order, [
    'data_fim', 'data_conclusao', 'data_conclusão',
    'concluido_em', 'concluída_em', 'finalizado_em'
  ]);
  const startDate = pickValue(order, ['data_inicio', 'data_abertura', 'criado_em', 'data_programada']);
  const id = pickValue(order, ['id', 'id_os', 'os_id', 'numero_os', 'numero', 'codigo']);

  const combined = `${tag} ${description} ${comment}`;
  return {
    id: String(id || ''),
    status: String(status || ''),
    statusKey: normalizeStatus(status),
    tag: String(tag || ''),
    machine: normalizeMachine(combined),
    description: String(description || ''),
    comment: String(comment || ''),
    solution: String(solution || ''),
    startDate: String(startDate || ''),
    endDate: String(endDate || ''),
    endDateISO: normalizeDate(endDate),
    executante: String(pickValue(order, ['executante', 'usuario', 'usuário']) || ''),
    typeService: String(pickValue(order, ['tipo_servico', 'tipo de serviço']) || ''),
    typeMaintenance: String(pickValue(order, ['tipo_manutencao', 'tipo de manutenção']) || '')
  };
}

function summarize(orders) {
  const today = new Date().toISOString().slice(0, 10);
  const completed = orders.filter(order => order.statusKey === 'completed');
  const datedCompleted = completed.filter(order => order.endDateISO);

  return {
    completedToday: datedCompleted.filter(order => order.endDateISO === today).length,
    completedPeriod: completed.length,
    overdue: orders.filter(order => order.statusKey === 'overdue').length,
    open: orders.filter(order => order.statusKey === 'open').length,
    total: orders.length,
    hasCompletionDates: datedCompleted.length > 0
  };
}

async function requestList(token, filters) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(LIST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ token, ...filters })
    });

    const raw = await response.text();
    let data;
    try { data = raw ? JSON.parse(raw) : null; }
    catch { data = raw; }

    if (isRateLimited(data, raw, response.status) && attempt < maxAttempts) {
      await sleep(600 + attempt * 1000);
      continue;
    }

    if (!response.ok) {
      throw new Error(`SGMan respondeu HTTP ${response.status}: ${textOf(data).slice(0, 400)}`);
    }

    const errorText = textOf(data).toLowerCase();
    if (/\b(status|resultado)\b/.test(errorText) && /\berro\b/.test(errorText)) {
      throw new Error(textOf(data).slice(0, 500));
    }

    return data;
  }

  throw new Error('Limite de requisições do SGMan não liberado.');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  const token = process.env.SGMAN_TOKEN;
  if (!token) {
    return res.status(503).json({ ok: false, error: 'SGMAN_TOKEN não configurado na Vercel.' });
  }

  const body = parseBody(req.body);
  if (!body.data_inicio) {
    return res.status(400).json({ ok: false, error: 'data_inicio é obrigatório.' });
  }

  const filters = {
    data_inicio: body.data_inicio,
    calc_custos: Number(body.calc_custos || 0)
  };

  if (body.data_fim) filters.data_fim = body.data_fim;
  if (Array.isArray(body.status) && body.status.length) filters.status = body.status;
  if (body.tipo_servico) filters.tipo_servico = body.tipo_servico;
  if (body.tipo_manutencao) filters.tipo_manutencao = body.tipo_manutencao;
  if (body.executante) filters.executante = body.executante;
  if (body.tag) filters.tag = body.tag;

  try {
    const raw = await requestList(token, filters);
    const candidates = collectOrderObjects(raw);
    const orders = candidates
      .map(normalizeOrder)
      .sort((a, b) => String(b.endDate || b.startDate).localeCompare(String(a.endDate || a.startDate)));

    return res.status(200).json({
      ok: true,
      orders,
      summary: summarize(orders),
      rawCount: candidates.length
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: `Falha ao listar OS no SGMan: ${error.message}`
    });
  }
};
