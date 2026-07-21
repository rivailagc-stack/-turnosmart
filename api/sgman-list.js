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
    /too many requests/.test(text) ||
    /rate limit/.test(text)
  );
}

function parseEmbeddedJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();

  if (!trimmed || !['{', '['].includes(trimmed[0])) return value;

  try { return JSON.parse(trimmed); }
  catch { return value; }
}

function expandEmbeddedJson(value) {
  if (Array.isArray(value)) {
    return value.map(item => expandEmbeddedJson(parseEmbeddedJson(item)));
  }

  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = expandEmbeddedJson(parseEmbeddedJson(item));
    }
    return output;
  }

  return parseEmbeddedJson(value);
}

function primitiveCount(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return 0;
  return Object.values(object).filter(value =>
    value === null ||
    ['string', 'number', 'boolean'].includes(typeof value)
  ).length;
}

function normalizedKeys(object) {
  return Object.keys(object || {}).map(key =>
    String(key)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  );
}

function looksLikeOrder(object, insideArray = false) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return false;

  const keys = normalizedKeys(object);
  const joined = keys.join(' ');

  const patterns = [
    /(^| )(id|idos|ordem|numeroos|codigoos)( |$)/,
    /status|situacao|estado/,
    /descricao|problema|atividade|servico|solicitacao/,
    /tag|maquina|equipamento|ativo|local/,
    /datainicio|datafim|dataconclusao|dataprogramada|dtinicio|dtfim/,
    /executante|usuario|responsavel/,
    /tiposervico|tipomanutencao/,
    /comentario|observacao|solucao|conclusao/
  ];

  const evidence = patterns.filter(pattern => pattern.test(joined)).length;

  if (evidence >= 2) return true;

  // Algumas respostas do SGMan usam nomes abreviados. Objetos de uma lista,
  // com ID e mais campos primitivos, também são tratados como uma OS.
  const hasIdLike = keys.some(key =>
    /^(id|idos|osid|numero|numeroos|codigo|codigos)$/.test(key)
  );

  return insideArray && hasIdLike && primitiveCount(object) >= 3;
}

function collectOrderObjects(value, output = [], seen = new Set(), insideArray = false) {
  const expanded = parseEmbeddedJson(value);

  if (Array.isArray(expanded)) {
    expanded.forEach(item => collectOrderObjects(item, output, seen, true));
    return output;
  }

  if (!expanded || typeof expanded !== 'object') return output;

  if (looksLikeOrder(expanded, insideArray)) {
    const signature = textOf(expanded);
    if (!seen.has(signature)) {
      seen.add(signature);
      output.push(expanded);
    }
  }

  Object.values(expanded).forEach(item =>
    collectOrderObjects(item, output, seen, Array.isArray(item))
  );

  return output;
}

function flattenObject(value, prefix = '', output = []) {
  const expanded = parseEmbeddedJson(value);

  if (Array.isArray(expanded)) {
    expanded.forEach((item, index) =>
      flattenObject(item, `${prefix}[${index}]`, output)
    );
    return output;
  }

  if (expanded && typeof expanded === 'object') {
    Object.entries(expanded).forEach(([key, item]) => {
      const normalizedKey = String(key)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      const path = prefix ? `${prefix}.${key}` : key;
      output.push({ key: normalizedKey, originalKey: key, path, value: item });
      flattenObject(item, path, output);
    });
  }

  return output;
}

function valueToText(value) {
  if (value === null || value === undefined) return '';
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value);

  if (Array.isArray(value)) {
    return value.map(valueToText).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    const preferred = [
      'nome', 'descricao', 'descrição', 'status', 'situacao',
      'situação', 'usuario', 'usuário', 'tag', 'codigo', 'id'
    ];

    for (const key of preferred) {
      if (value[key] !== undefined && value[key] !== null) {
        const result = valueToText(value[key]);
        if (result) return result;
      }
    }

    return textOf(value);
  }

  return String(value);
}

function pickValue(object, candidates) {
  const entries = flattenObject(object);
  const normalizedCandidates = candidates.map(candidate =>
    String(candidate)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
  );

  for (const candidate of normalizedCandidates) {
    const exact = entries.find(entry => entry.key === candidate);
    if (exact && exact.value !== null && exact.value !== '') {
      return valueToText(exact.value);
    }
  }

  // Fallback para nomes com prefixos/sufixos, como nm_status ou ds_descricao.
  for (const candidate of normalizedCandidates) {
    const partial = entries.find(entry =>
      entry.key.endsWith(candidate) || entry.key.startsWith(candidate)
    );
    if (partial && partial.value !== null && partial.value !== '') {
      return valueToText(partial.value);
    }
  }

  return '';
}

function normalizeMachine(value = '') {
  const explicit = String(value).match(/\bmk\s*[-:]?\s*(\d{1,3})\b/i)?.[1];
  if (explicit) return `MK-${String(Number(explicit)).padStart(2, '0')}`;

  return '';
}

function normalizeStatus(value = '') {
  const text = String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/conclu|finaliz|fechad|encerrad|executad/.test(text)) return 'completed';
  if (/atras|vencid/.test(text)) return 'overdue';
  if (/abert|pendente|aguard|programad|andamento|execucao/.test(text)) return 'open';

  return 'other';
}

function normalizeDate(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';

  const iso = text.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const brazilian = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (brazilian) return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`;

  return '';
}

function normalizeOrder(order) {
  const id = pickValue(order, [
    'id', 'id_os', 'idos', 'os_id', 'osid', 'numero_os',
    'numeroos', 'numero', 'codigo_os', 'codigoos', 'codigo'
  ]);

  const status = pickValue(order, [
    'status', 'status_os', 'statusos', 'situacao', 'situacao_os',
    'situacaoos', 'estado', 'nome_status', 'nomestatus'
  ]);

  const tag = pickValue(order, [
    'tag', 'tag_nome', 'tagnome', 'nome_tag', 'nometag',
    'tag_codigo', 'tagcodigo', 'equipamento', 'ativo', 'maquina'
  ]);

  const local = pickValue(order, [
    'local', 'local_nome', 'localnome', 'nome_local', 'nomelocal'
  ]);

  const description = pickValue(order, [
    'descricao', 'descricao_os', 'descricaoos', 'ds_descricao',
    'dsdescricao', 'titulo', 'servico', 'servico_solicitado',
    'servicosolicitado', 'solicitacao', 'atividade', 'problema'
  ]);

  const comment = pickValue(order, [
    'comentario', 'comentario_os', 'comentarioos', 'observacao',
    'observacao_os', 'observacaoos', 'obs'
  ]);

  const solution = pickValue(order, [
    'solucao', 'servico_realizado', 'servicorealizado',
    'descricao_conclusao', 'descricaoconclusao',
    'comentario_conclusao', 'comentarioconclusao',
    'observacao_conclusao', 'observacaoconclusao',
    'acao_realizada', 'acaorealizada',
    'resolucao', 'resolucao_os', 'resolucaoos'
  ]);

  const startDate = pickValue(order, [
    'data_inicio', 'datainicio', 'dt_inicio', 'dtinicio',
    'data_abertura', 'dataabertura', 'criado_em', 'criadoem',
    'data_programada', 'dataprogramada'
  ]);

  const endDate = pickValue(order, [
    'data_fim', 'datafim', 'dt_fim', 'dtfim',
    'data_conclusao', 'dataconclusao', 'dt_conclusao', 'dtconclusao',
    'concluido_em', 'concluidoem', 'finalizado_em', 'finalizadoem',
    'data_encerramento', 'dataencerramento'
  ]);

  const combined = `${tag} ${local} ${description} ${comment}`;

  return {
    id: String(id || ''),
    status: String(status || ''),
    statusKey: normalizeStatus(status),
    tag: String(tag || ''),
    local: String(local || ''),
    machine: normalizeMachine(combined),
    description: String(description || ''),
    comment: String(comment || ''),
    solution: String(solution || ''),
    startDate: String(startDate || ''),
    endDate: String(endDate || ''),
    endDateISO: normalizeDate(endDate),
    executante: String(pickValue(order, [
      'executante', 'executante_nome', 'executantenome',
      'usuario', 'usuario_nome', 'usuarionome', 'responsavel'
    ]) || ''),
    typeService: String(pickValue(order, [
      'tipo_servico', 'tiposervico', 'servico_tipo', 'servicotipo'
    ]) || ''),
    typeMaintenance: String(pickValue(order, [
      'tipo_manutencao', 'tipomanutencao',
      'manutencao_tipo', 'manutencaotipo'
    ]) || '')
  };
}

function summarize(orders) {
  const now = new Date();
  const localToday = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');

  const completed = orders.filter(order => order.statusKey === 'completed');
  const datedCompleted = completed.filter(order => order.endDateISO);

  return {
    completedToday: datedCompleted.filter(order => order.endDateISO === localToday).length,
    completedPeriod: completed.length,
    overdue: orders.filter(order => order.statusKey === 'overdue').length,
    open: orders.filter(order => order.statusKey === 'open').length,
    other: orders.filter(order => order.statusKey === 'other').length,
    total: orders.length,
    hasCompletionDates: datedCompleted.length > 0
  };
}

function collectArrays(value, output = []) {
  const expanded = parseEmbeddedJson(value);

  if (Array.isArray(expanded)) {
    output.push(expanded);
    expanded.forEach(item => collectArrays(item, output));
    return output;
  }

  if (expanded && typeof expanded === 'object') {
    Object.values(expanded).forEach(item => collectArrays(item, output));
  }

  return output;
}

function diagnosticOf(raw, candidates, orders, queryMode) {
  const expanded = expandEmbeddedJson(raw);
  const arrays = collectArrays(expanded);
  const firstCandidate = candidates[0] || null;

  return {
    queryMode,
    responseType: Array.isArray(expanded) ? 'array' : typeof expanded,
    topLevelKeys:
      expanded && typeof expanded === 'object' && !Array.isArray(expanded)
        ? Object.keys(expanded).slice(0, 20)
        : [],
    arrayCount: arrays.length,
    largestArrayLength: arrays.reduce(
      (max, array) => Math.max(max, array.length),
      0
    ),
    candidateCount: candidates.length,
    interpretedCount: orders.length,
    firstCandidateKeys:
      firstCandidate && typeof firstCandidate === 'object'
        ? Object.keys(firstCandidate).slice(0, 30)
        : []
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

    const rawText = await response.text();
    let data;

    try { data = rawText ? JSON.parse(rawText) : null; }
    catch { data = rawText; }

    if (isRateLimited(data, rawText, response.status) && attempt < maxAttempts) {
      await sleep(700 + attempt * 1000);
      continue;
    }

    if (!response.ok) {
      throw new Error(
        `SGMan respondeu HTTP ${response.status}: ${textOf(data).slice(0, 500)}`
      );
    }

    const errorText = textOf(data).toLowerCase();
    if (
      /"status"\s*:\s*"erro"/.test(errorText) ||
      /"resultado"\s*:\s*"erro"/.test(errorText)
    ) {
      throw new Error(textOf(data).slice(0, 600));
    }

    return expandEmbeddedJson(data);
  }

  throw new Error('Limite de requisições do SGMan não liberado.');
}

async function fetchAndInterpret(token, filters, queryMode) {
  const raw = await requestList(token, filters);
  const candidates = collectOrderObjects(raw);
  const orders = candidates
    .map(normalizeOrder)
    .filter(order =>
      order.id ||
      order.status ||
      order.tag ||
      order.description ||
      order.startDate ||
      order.endDate
    )
    .sort((a, b) =>
      String(b.endDate || b.startDate)
        .localeCompare(String(a.endDate || a.startDate))
    );

  return {
    raw,
    orders,
    diagnostic: diagnosticOf(raw, candidates, orders, queryMode)
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Método não permitido.'
    });
  }

  const token = process.env.SGMAN_TOKEN;

  if (!token) {
    return res.status(503).json({
      ok: false,
      error: 'SGMAN_TOKEN não configurado na Vercel.'
    });
  }

  const body = parseBody(req.body);

  if (!body.data_inicio) {
    return res.status(400).json({
      ok: false,
      error: 'data_inicio é obrigatório.'
    });
  }

  try {
    // Primeira consulta: sem filtro de status, para não esconder registros
    // caso os nomes dos status sejam diferentes no cadastro da empresa.
    const primaryFilters = {
      data_inicio: body.data_inicio,
      calc_custos: Number(body.calc_custos ?? 1)
    };

    if (body.data_fim) primaryFilters.data_fim = body.data_fim;
    if (body.tipo_servico) primaryFilters.tipo_servico = body.tipo_servico;
    if (body.tipo_manutencao) primaryFilters.tipo_manutencao = body.tipo_manutencao;
    if (body.executante) primaryFilters.executante = body.executante;
    if (body.tag) primaryFilters.tag = body.tag;

    let result = await fetchAndInterpret(
      token,
      primaryFilters,
      'periodo-sem-filtro-status'
    );

    // Segunda tentativa: formato simples, somente data de início.
    // Algumas versões da API ignoram ou rejeitam data_fim/calc_custos.
    if (!result.orders.length) {
      await sleep(900);

      const dateOnly = String(body.data_inicio).slice(0, 10);
      result = await fetchAndInterpret(
        token,
        { data_inicio: dateOnly },
        'somente-data-inicio'
      );
    }

    return res.status(200).json({
      ok: true,
      orders: result.orders,
      summary: summarize(result.orders),
      diagnostic: result.diagnostic,
      queryStart: body.data_inicio
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: `Falha ao listar OS no SGMan: ${error.message}`
    });
  }
};
