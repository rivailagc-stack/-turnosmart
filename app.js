'use strict';

const STORAGE = {
  history: 'turnosmart_history_v1',
  scale: 'turnosmart_scale_v1',
  draft: 'turnosmart_draft_v1',
  config: 'turnosmart_config_v3',
  sgmanConfirmed: 'turnosmart_sgman_confirmed_v1',
  sgmanLastResult: 'turnosmart_sgman_last_result_v1',
  sgmanHistory: 'turnosmart_sgman_history_v1'
};

const DEFAULT_PRODUCTION_LEADERS = {
  A1: 'Maria',
  A2: 'Reginaldo',
  B1: 'Wilma',
  B2: 'Marisa'
};

const DEFAULT_MAINTENANCE_TEAMS = {
  A1: {
    maintenanceLeader: 'Ricardo Serafim',
    sgmanExecutante: 'ricardo.serafim'
  },
  A2: {
    maintenanceLeader: 'Luiz Afonso',
    sgmanExecutante: 'luiz.afonso'
  },
  B1: {
    maintenanceLeader: 'Danilo Nepomuceno',
    sgmanExecutante: 'Danilo'
  },
  B2: {
    maintenanceLeader: 'Fiderlânio Reis',
    sgmanExecutante: 'fiderlânio.reis'
  }
};

const SGMAN_MAINTENANCE_USERS = [
  { username: 'aleilson.almeida', name: 'Aleilson Almeida', role: 'Mantenedor', aliases: ['aleilson'] },
  { username: 'allan.teodorak', name: 'Allan Teodorak', role: 'Líder Mantenedor', aliases: ['allan'] },
  { username: 'CAIO.AUGUSTO', name: 'Caio Augusto', role: 'Mecânico', aliases: ['caio'] },
  { username: 'carlos.silva', name: 'Carlos Matos', role: 'Mantenedor', aliases: ['carlos', 'carlos matos'] },
  { username: 'Danilo', name: 'Danilo Nepomuceno', role: 'Líder Mantenedor', aliases: ['danilo'] },
  { username: 'emerson.nunes', name: 'Emerson Nunes', role: 'Líder Mantenedor', aliases: ['emerson nunes'] },
  { username: 'ezequielSantos', name: 'Ezequiel Santos', role: 'Mecânico', aliases: ['ezequiel'] },
  { username: 'fiderlânio.reis', name: 'Fiderlânio Reis', role: 'Líder Mantenedor', aliases: ['fider', 'fiderlanio', 'fiderlânio'] },
  { username: 'gabriel.henrique', name: 'Gabriel Bretas', role: 'Ferramenteiro', aliases: ['gabriel', 'gabriel bretas'] },
  { username: 'gustavo.yano', name: 'Gustavo Yano', role: 'Aprendiz de manutenção', aliases: ['gustavo'] },
  { username: 'igor.henrique', name: 'Igor Henrique', role: 'Manutenção', aliases: ['igor'] },
  { username: 'jean.mendes', name: 'Jean Mendes', role: 'Usuário SGMan', aliases: ['jean', 'jean mendes'] },
  { username: 'jeanderson.costa', name: 'Jeanderson Costa', role: 'Mantenedor', aliases: ['jeanderson'] },
  { username: 'JOÃO.SOUZA', name: 'João Aparecido de Souza', role: 'Mecânico', aliases: ['joao', 'joão', 'joao souza'] },
  { username: 'Lucas.eletricista', name: 'Lucas Eletricista', role: 'Eletricista', aliases: ['lucas', 'lucas eletricista'] },
  { username: 'luiz.afonso', name: 'Luiz Afonso', role: 'Líder Mantenedor', aliases: ['luiz', 'luiz afonso'] },
  { username: 'marcelo.souza', name: 'Marcelo Souza', role: 'Mantenedor', aliases: ['marcelo'] },
  { username: 'marcos.roberto', name: 'Marcos Roberto', role: 'Mantenedor', aliases: ['marcos'] },
  { username: 'ricardo.serafim', name: 'Ricardo Serafim', role: 'Líder Mantenedor', aliases: ['ricardo'] },
  { username: 'roberto.beraldo', name: 'Roberto Beraldo', role: 'Mantenedor', aliases: ['roberto'] },
  { username: 'rogger.sampaio', name: 'Rogger Sampaio', role: 'Mantenedor', aliases: ['rogger', 'roger'] },
  { username: 'thiago.nascimento', name: 'Thiago Nascimento', role: 'Mantenedor', aliases: ['thiago'] }
];

function uniqueStrings(values = []) {
  return [...new Set(
    values
      .map(value => String(value || '').trim())
      .filter(Boolean)
  )];
}

function sgmanUserKey(value = '') {
  return normalizeKey(String(value))
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveSgmanUsername(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const exactUsername = SGMAN_MAINTENANCE_USERS.find(user =>
    user.username.toLocaleLowerCase('pt-BR') ===
      raw.toLocaleLowerCase('pt-BR')
  );
  if (exactUsername) return exactUsername.username;

  const key = sgmanUserKey(raw);

  const match = SGMAN_MAINTENANCE_USERS.find(user => {
    const candidates = [
      user.username,
      user.name,
      ...(user.aliases || [])
    ].map(sgmanUserKey);

    return candidates.includes(key);
  });

  return match?.username || '';
}

function sgmanUserLabel(username = '') {
  const user = SGMAN_MAINTENANCE_USERS.find(item =>
    item.username.toLocaleLowerCase('pt-BR') ===
      String(username).toLocaleLowerCase('pt-BR')
  );

  return user
    ? `${user.name} — ${user.username}`
    : String(username || '');
}

function parseLegacyTeamSgmanUsers(teamText = '') {
  const parts = String(teamText)
    .replace(/\s+e\s+/gi, ',')
    .split(/[\n,;|/]+/)
    .map(value => value.trim())
    .filter(Boolean);

  return uniqueStrings(
    parts.map(resolveSgmanUsername).filter(Boolean)
  );
}

function populateSgmanUserSelect(selectId, selectedValue = '') {
  const select = $(selectId);
  if (!select) return;

  const selected = String(selectedValue || '').trim();
  const known = SGMAN_MAINTENANCE_USERS.some(user =>
    user.username.toLocaleLowerCase('pt-BR') ===
      selected.toLocaleLowerCase('pt-BR')
  );

  const customOption = selected && !known
    ? `<option value="${escapeHtml(selected)}">${escapeHtml(selected)} — usuário personalizado</option>`
    : '';

  select.innerHTML = `
    <option value="">Não definido</option>
    ${customOption}
    ${SGMAN_MAINTENANCE_USERS.map(user => `
      <option value="${escapeHtml(user.username)}">
        ${escapeHtml(user.name)} — ${escapeHtml(user.username)}
      </option>
    `).join('')}
  `;

  select.value = selected;
}

const state = {
  analysis: null,
  actions: [],
  deferredPrompt: null,
  manualSchedule: false,
  oeeImageDataUrl: '',
  oeeOcrText: '',
  oeeMachineEditorData: [],
  oeeCropDataUrl: '',
  oeeRowPreviews: [],
  sgmanSending: false,
  sgmanHistoryLoading: false,
  sgmanHistory: {
    loadedAt: '',
    orders: [],
    summary: {
      completedToday: 0,
      completedPeriod: 0,
      overdue: 0,
      open: 0,
      hasCompletionDates: false
    },
    diagnostic: {},
    queryStart: ''
  },
  reliability3Days: {
    periodHours: 72,
    missionHours: 12,
    mttrMinutes: null,
    mttfMinutes: null,
    mtbfMinutes: null,
    reliabilityPercent: null,
    reliabilityBasis: '',
    failureCount: 0,
    completedRepairs: 0,
    repairIntervals: 0,
    uptimeIntervals: 0,
    failureIntervals: 0,
    recurrentMachines: 0,
    rows: [],
    note: 'Aguardando dados exclusivamente do SGMan.'
  }
};

const $ = id => document.getElementById(id);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}


function toLocalDateTimeInput(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateToISO(date) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseISODateAtNoon(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDaysISO(value, amount) {
  const date = parseISODateAtNoon(value);
  date.setDate(date.getDate() + amount);
  return dateToISO(date);
}

function dayDifference(fromISO, toISO) {
  const from = parseISODateAtNoon(fromISO);
  const to = parseISODateAtNoon(toISO);
  return Math.round((to - from) / 86400000);
}

const WEEKDAYS_PT = ['DOMINGO','SEGUNDA','TERÇA','QUARTA','QUINTA','SEXTA','SÁBADO'];

function boardScopeForReport(operationalDate, shift) {
  const date = parseISODateAtNoon(operationalDate || todayISO());
  const weekday = WEEKDAYS_PT[date.getDay()];
  const column = String(shift || '1') === '2' ? 'B' : 'A';
  return { weekday, column, label: `${weekday} ${column}` };
}

function getConfig() {
  const defaults = {
    referenceDate: '2026-07-20',
    referenceLetter: 'A',
    sgmanExecutante: '',
    sgmanTipoServico: 'AUTOMÁTICO',
    sgmanTipoManutencao: 'AUTOMÁTICO',
    sgmanQtdExecutantes: 1,
    sgmanDuracaoEstimada: '01:00',
    sgmanTagMap: {}
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE.config)) || {};
    return {
      ...defaults,
      ...saved,
      sgmanTagMap: { ...defaults.sgmanTagMap, ...(saved.sgmanTagMap || {}) }
    };
  }
  catch { return defaults; }
}

function saveConfig(config) {
  localStorage.setItem(STORAGE.config, JSON.stringify(config));
}

function migrateSgmanConfig() {
  const config = getConfig();
  let changed = false;

  // Migra o valor antigo inválido para o modo automático.
  if (
    !config.sgmanTipoServico ||
    normalizeKey(config.sgmanTipoServico) === 'mecanica'
  ) {
    config.sgmanTipoServico = 'AUTOMÁTICO';
    changed = true;
  }

  // Agora os nomes exatos dos tipos de manutenção foram confirmados.
  // Migra valor antigo vazio/Corretiva para a classificação automática.
  if (
    !config.sgmanTipoManutencao ||
    normalizeKey(config.sgmanTipoManutencao) === 'corretiva'
  ) {
    config.sgmanTipoManutencao = 'AUTOMÁTICO';
    changed = true;
  }

  if (changed) saveConfig(config);
  return config;
}

function crewLetterForDate(operationalDate) {
  const config = getConfig();
  const difference = dayDifference(config.referenceDate, operationalDate);
  const sameParity = Math.abs(difference) % 2 === 0;
  if (sameParity) return config.referenceLetter;
  return config.referenceLetter === 'A' ? 'B' : 'A';
}

function getIncomingResponsibility(operationalDate, deliveredShift) {
  const shift = String(deliveredShift || '1');
  const date = shift === '1' ? operationalDate : addDaysISO(operationalDate, 1);
  const incomingShift = shift === '1' ? '2' : '1';
  const crew = `${crewLetterForDate(date)}${incomingShift}`;
  const schedule = incomingShift === '1' ? '06:00 às 18:00' : '18:00 às 06:00';
  return { date, shift: incomingShift, crew, schedule };
}

function detectOperationalShift(receivedAtValue, manualDate = '', manualShift = '', forceManual = false) {
  const receivedAt = receivedAtValue ? new Date(receivedAtValue) : new Date();
  if (Number.isNaN(receivedAt.getTime())) return { automatic: false, reason: 'Horário de recebimento inválido.' };

  const hour = receivedAt.getHours();
  const receivedDate = dateToISO(receivedAt);
  let date;
  let shift;
  let automatic = true;
  let reason = '';

  if (forceManual) {
    automatic = false;
    date = manualDate || receivedDate;
    shift = manualShift || '1';
    reason = 'Data e turno corrigidos manualmente.';
  } else if (hour <= 7) {
    date = addDaysISO(receivedDate, -1);
    shift = '2';
    reason = 'Recebido até 07:59: pertence ao turno noturno iniciado no dia anterior.';
  } else if (hour >= 17) {
    date = receivedDate;
    shift = '1';
    reason = 'Recebido no fim do dia: pertence ao turno diurno do próprio dia.';
  } else {
    automatic = false;
    date = manualDate || receivedDate;
    shift = manualShift || '1';
    reason = 'Mensagem recebida fora dos horários normais de fechamento. Confirme a data e o turno.';
  }

  const letter = crewLetterForDate(date);
  const crew = `${letter}${shift}`;
  const schedule = shift === '1' ? '06:00 às 18:00' : '18:00 às 06:00';
  const incoming = getIncomingResponsibility(date, shift);
  const boardScope = boardScopeForReport(date, shift);
  return {
    automatic,
    date,
    shift,
    crew,
    schedule,
    incomingDate: incoming.date,
    incomingShift: incoming.shift,
    incomingCrew: incoming.crew,
    incomingSchedule: incoming.schedule,
    boardScope,
    reason,
    receivedAt: receivedAt.toISOString()
  };
}

function updateOeeScopeHint() {
  const date = $('reportDate')?.value || todayISO();
  const shift = $('reportShift')?.value || '1';
  const scope = boardScopeForReport(date, shift);
  const el = $('oeeScopeHint');
  if (el) el.textContent = `Use somente a coluna ${scope.label} do quadro semanal. Essa é a referência das últimas 12 horas.`;
}

function updateDetectedShift() {
  const result = detectOperationalShift($('reportReceivedAt').value, $('reportDate').value, $('reportShift').value, state.manualSchedule);
  if (result.date) $('reportDate').value = result.date;
  if (result.shift) $('reportShift').value = result.shift;
  const card = $('autoDetection');
  if (!card) return result;
  card.className = `detection-card${result.automatic ? '' : ' warning'}`;
  if (!result.date) {
    card.innerHTML = '<strong>Não foi possível identificar o turno.</strong>';
    return result;
  }
  card.innerHTML = `
    <div class="detection-main">
      <div>
        <strong>${result.automatic ? 'Identificação automática' : 'Confirmação necessária'}</strong>
        <p><b>Relatório entregue:</b> ${formatDate(result.date)} • Equipe ${result.crew} • ${result.schedule}</p>
        <p><b>Responsabilidade das ações:</b> ${formatDate(result.incomingDate)} • Equipe ${result.incomingCrew} • ${result.incomingSchedule}</p>
        <p><b>Quadro de OEE a usar:</b> ${escapeHtml(result.boardScope?.label || '-')} (últimas 12 horas)</p>
        <p>${escapeHtml(result.reason)}</p>
      </div>
      <span class="crew-pill">${result.crew} → ${result.incomingCrew}</span>
    </div>`;
  if (!result.automatic) $('manualFields').classList.remove('hidden');
  updateOeeScopeHint();
  return result;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value = '') {
  return value
    .replace(/\r/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function cleanLine(line = '') {
  return line
    .replace(/^\s*[•·]\s*/, '')
    .replace(/\*/g, '')
    .replace(/_+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(value = '') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseBrazilianNumber(value) {
  if (value == null) return null;
  const digits = String(value).replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function formatMinutes(minutes) {
  if (!minutes) return 'Sem tempo';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function extractDurationMinutes(text) {
  let total = 0;
  const usedRanges = [];
  const add = (start, end, minutes) => {
    if (usedRanges.some(([a, b]) => start < b && end > a)) return;
    usedRanges.push([start, end]);
    total += minutes;
  };

  const clock = /(\d{1,2})\s*[:h]\s*(\d{2})(?!\d)/gi;
  let match;
  while ((match = clock.exec(text))) {
    add(match.index, clock.lastIndex, Number(match[1]) * 60 + Number(match[2]));
  }

  const hours = /(\d{1,2})\s*(?:hora|horas|hr|hrs)\b/gi;
  while ((match = hours.exec(text))) add(match.index, hours.lastIndex, Number(match[1]) * 60);

  const mins = /(\d{1,3})\s*(?:min|minuto|minutos)\b/gi;
  while ((match = mins.exec(text))) add(match.index, mins.lastIndex, Number(match[1]));

  if (total === 0) {
    const trailing = text.match(/(?:^|\s)(\d{1,3})(?:\s*\([^)]*\))?\s*$/);
    if (trailing) total = Number(trailing[1]);
  }

  return total;
}

function linesBetween(lines, startPattern, endPatterns) {
  const start = lines.findIndex(line => startPattern.test(cleanLine(line)));
  if (start < 0) return [];
  const result = [];
  for (let i = start + 1; i < lines.length; i++) {
    const cleaned = cleanLine(lines[i]);
    if (endPatterns.some(pattern => pattern.test(cleaned))) break;
    if (cleaned && !/^o que\??/i.test(cleaned)) result.push(cleaned);
  }
  return result;
}

function extractPeople(lines, startRegex, endRegexes, declaredCount = null) {
  const candidates = linesBetween(lines, startRegex, endRegexes)
    .map(v => v.replace(/^[-\d.)\s]+/, '').trim())
    .filter(v => v && v.length < 45 && !/:/.test(v));
  return declaredCount != null ? candidates.slice(0, declaredCount) : candidates;
}

function findLargeNumberInLine(lines, predicate) {
  const line = lines.find(predicate);
  if (!line) return null;
  const matches = cleanLine(line).match(/\d[\d.]{3,}/g) || [];
  if (!matches.length) return null;
  return parseBrazilianNumber(matches[matches.length - 1]);
}

function parseMachines(lines) {
  const machines = [];
  let current = null;

  const stopHeader = /^(SL|OBS|DDE|Qualidade|Segurança|Entrega|Perdas|Previsto|Férias|Faltas|Hora-Extra|Retrabalho|Pagando dia|Total Presente|Treinamento)\b/i;

  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;

    const header = line.match(/^MK\s*[-:]?\s*(\d{1,3})\s*:??\s*$/i);
    if (header) {
      current = {
        code: `MK-${header[1].padStart(2, '0')}`,
        rawCode: header[1],
        incidents: [],
        totalMinutes: 0
      };
      machines.push(current);
      continue;
    }

    if (stopHeader.test(line)) {
      current = null;
      continue;
    }

    if (!current) continue;
    if (/^\d+[)]/.test(line) || /^\d+[.]\s*/.test(line) || /^[a-záàâãéêíóôõúç]/i.test(line)) {
      const description = line.replace(/^\d+\s*[).:-]\s*/, '').trim();
      if (!description) continue;
      const minutes = extractDurationMinutes(description);
      current.incidents.push({ description, minutes });
      current.totalMinutes += minutes;
    }
  }

  return machines.filter(m => m.incidents.length);
}

function parseReport(rawText, scheduleInfo) {
  const text = normalizeText(rawText);
  const lines = text.split('\n');
  const cleanedLines = lines.map(cleanLine);

  const turnoMatch = text.match(/Turno\s*:\s*([123])\s*[º°]?/i);
  const expectedCrewMatch = text.match(/Previsto\s+Escala\s*\(([AB][12])\)/i);
  const leaderLine = cleanedLines.find(line => /^L[ií]der(?:es)?\s*:/i.test(line));
  const leader = leaderLine ? leaderLine.split(':').slice(1).join(':').trim() : '';

  const absenceLine = cleanedLines.find(line => /^Faltas\b/i.test(line)) || '';
  const absenceCount = Number((absenceLine.match(/(\d+)\s*$/) || absenceLine.match(/:\s*(\d+)/) || [])[1] || 0);
  const absences = extractPeople(lines, /^Faltas\b/i, [/^Hora-Extra\b/i, /^Retrabalho\b/i, /^Pagando dia\b/i, /^Total Presente\b/i], absenceCount || null);

  const overtimeLine = cleanedLines.find(line => /^Hora-Extra\b/i.test(line)) || '';
  const overtimeCount = Number((overtimeLine.match(/(\d+)\s*$/) || overtimeLine.match(/:\s*(\d+)/) || [])[1] || 0);
  const overtimePeople = extractPeople(lines, /^Hora-Extra\b/i, [/^Retrabalho\b/i, /^Pagando dia\b/i, /^Total Presente\b/i], overtimeCount || null);

  const presentLine = cleanedLines.find(line => /^Total Presente\b/i.test(line)) || '';
  const present = Number((presentLine.match(/(\d+)/) || [])[1] || 0);

  const trainingLine = cleanedLines.find(line => /^Treinamento\b/i.test(line)) || '';
  const trainingCount = Number((trainingLine.match(/(\d+)/) || [])[1] || 0);
  const trainingPeople = extractPeople(lines, /^Treinamento\b/i, [/^DDE\b/i, /^Qualidade\b/i, /^Entrega\b/i], trainingCount || null);

  const reworkLine = cleanedLines.find(line => /^Retrabalho\b/i.test(line)) || '';
  const reworkCount = Number((reworkLine.match(/:\s*(\d+)/) || reworkLine.match(/(\d+)\s*$/) || [])[1] || 0);
  const ddeItems = linesBetween(lines, /^DDE\b/i, [/^Qualidade\b/i, /^Entrega\b/i, /^Perdas\b/i])
    .map(item => item.replace(/^\d+\s*[).:-]?\s*/, '').trim())
    .filter(Boolean);

  const plan = findLargeNumberInLine(cleanedLines, line => /Plano.*OEE/i.test(line) || /meta.*OEE/i.test(line));
  const realizedIndex = cleanedLines.findIndex(line => /^Realizado\b/i.test(line));
  let realizedLine = realizedIndex >= 0 ? cleanedLines[realizedIndex] : '';
  if (!/\d[\d.]{3,}/.test(realizedLine) && realizedIndex >= 0) {
    realizedLine = cleanedLines.slice(realizedIndex + 1, realizedIndex + 4).find(line => /\d[\d.]{3,}/.test(line)) || realizedLine;
  }
  const realizedNumbers = realizedLine.match(/\d[\d.]{3,}/g) || [];
  const realized = realizedNumbers.length ? parseBrazilianNumber(realizedNumbers[0]) : null;
  const reportedOee = Number((realizedLine.match(/(\d{1,3})\s*%/) || [])[1] || 0);
  const targetOee = Number(((cleanedLines.find(line => /Plano.*OEE/i.test(line)) || '').match(/(\d{1,3})\s*%/) || [])[1] || 75);
  const attainment = plan && realized ? Number(((realized / plan) * 100).toFixed(1)) : null;
  const gap = plan && realized ? plan - realized : null;

  const safetyStart = cleanedLines.findIndex(line => /^Segurança\b/i.test(line));
  const safetySlice = safetyStart >= 0 ? cleanedLines.slice(safetyStart + 1, safetyStart + 5) : [];
  const safetyOccurrenceLine = safetySlice.find(line => /^Ocorrência\b/i.test(line)) || '';
  const safetyOccurrence = safetyOccurrenceLine.split(':').slice(1).join(':').trim() || 'Não informado';

  const qualityStart = cleanedLines.findIndex(line => /^Qualidade\b/i.test(line));
  const qualitySlice = qualityStart >= 0 ? cleanedLines.slice(qualityStart + 1, qualityStart + 5) : [];
  const qualityOccurrenceLine = qualitySlice.find(line => /^Ocorrência\b/i.test(line)) || '';
  const qualityOccurrence = qualityOccurrenceLine.split(':').slice(1).join(':').trim() || 'Não informado';

  const machines = parseMachines(lines);
  const totalRecordedMinutes = machines.reduce((sum, machine) => sum + machine.totalMinutes, 0);
  const laborShortageMachines = machines
    .filter(machine => machine.incidents.some(i => /falta\s*(?:de\s*)?(?:m[.]?o|m[aã]o de obra)/i.test(i.description)))
    .map(machine => machine.code);

  const expectedCrew = expectedCrewMatch ? expectedCrewMatch[1].toUpperCase() : '';
  return {
    id: uid(),
    createdAt: scheduleInfo.receivedAt || new Date().toISOString(),
    receivedAt: scheduleInfo.receivedAt || new Date().toISOString(),
    date: scheduleInfo.date || todayISO(),
    shift: String(scheduleInfo.shift || '1'),
    crew: scheduleInfo.crew || `${crewLetterForDate(scheduleInfo.date || todayISO())}${scheduleInfo.shift || '1'}`,
    schedule: scheduleInfo.schedule || (String(scheduleInfo.shift) === '2' ? '18:00 às 06:00' : '06:00 às 18:00'),
    responsibleDate: scheduleInfo.incomingDate || getIncomingResponsibility(scheduleInfo.date || todayISO(), scheduleInfo.shift || '1').date,
    responsibleShift: String(scheduleInfo.incomingShift || getIncomingResponsibility(scheduleInfo.date || todayISO(), scheduleInfo.shift || '1').shift),
    responsibleCrew: scheduleInfo.incomingCrew || getIncomingResponsibility(scheduleInfo.date || todayISO(), scheduleInfo.shift || '1').crew,
    responsibleSchedule: scheduleInfo.incomingSchedule || getIncomingResponsibility(scheduleInfo.date || todayISO(), scheduleInfo.shift || '1').schedule,
    boardScope: scheduleInfo.boardScope || boardScopeForReport(scheduleInfo.date || todayISO(), scheduleInfo.shift || '1'),
    detectedAutomatically: !!scheduleInfo.automatic,
    detectionReason: scheduleInfo.reason || '',
    reportedShift: turnoMatch ? turnoMatch[1] : '',
    expectedCrew,
    scheduleMismatch: !!expectedCrew && expectedCrew !== scheduleInfo.crew,
    productionLeader: leader || 'Não informado',
    safetyOccurrence,
    qualityOccurrence,
    absenceCount: absenceCount || absences.length,
    absences,
    overtimeCount: overtimeCount || overtimePeople.length,
    overtimePeople,
    present,
    trainingCount,
    trainingPeople,
    reworkCount,
    ddeItems,
    plan,
    realized,
    reportedOee,
    targetOee,
    attainment,
    gap,
    machines,
    totalRecordedMinutes,
    laborShortageMachines,
    machineOee: [],
    lowOeeMachines: [],
    oeeOcrText: '',
    rawText: text
  };
}

function classifyIncident(description) {
  const key = normalizeKey(description);

  if (/falta (de )?(m\.o|mao de obra)/.test(key)) return 'labor';
  if (/treinamento/.test(key)) return 'training';
  if (/limpeza|organizacao|refilo/.test(key)) return 'cleaning';
  if (/preventiva/.test(key)) return 'planned-maintenance';
  if (/amostra|troca.*molde|preparad[ao].*amostra|setup/.test(key)) return 'production-setup';

  const mechanicalTerms = /faca|contrafaca|sensor|eixo|motor|rolo|rotolatriz|mola|tampao|garra|estrela|saida|patino|guia|alinhador|freio|correia|mangueira|reservatorio|lubrificacao|vedacao|parafuso/;
  const paperHandling = /passagem.*papel|passar.*papel|troca.*bobina|bobina.*troca|bobina.*fora.*posicao|bobina.*descolad|troca.*faixa|troca.*fundo/;

  if (paperHandling.test(key) && !mechanicalTerms.test(key)) return 'paper-handling';
  if (/(bobina|faixa|fundo|papel).*(enrosc|estour|volt|retorn)|(?:enrosc|estour|volt|retorn).*(bobina|faixa|fundo|papel)/.test(key) && !mechanicalTerms.test(key)) return 'paper-handling';
  if (/falta faixa|falta fundo/.test(key) && !mechanicalTerms.test(key)) return 'paper-handling';
  if (/impressao.*ruim|bordas? danific|produto.*danific|qualidade/.test(key) && !mechanicalTerms.test(key)) return 'production-quality';

  if (/quebra|quebrou|mangueira|romp/.test(key)) return 'breakdown';
  if (/vazando|vazamento|vedacao|vedando/.test(key)) return 'leak';
  if (/variacao/.test(key)) return 'variation';
  if (/alarme|lubrificacao/.test(key)) return 'alarm';
  if (/marcas.*parafuso|impressao.*ruim|danific/.test(key) && mechanicalTerms.test(key)) return 'maintenance-quality';
  if (/estourando|enroscando|voltando|retornando|peca voltando/.test(key)) return 'instability';
  if (/falta faixa|falta fundo/.test(key)) return 'missing';
  if (/ajuste|calco|faca|tampao|garra|estrela|saida|patino|mola|eixo|motor|sensor|rolo|rotolatriz/.test(key)) return 'adjustment';

  return 'production-review';
}

function maintenanceSuggestedAction(machine, categories) {
  const joined = machine.incidents.map(i => normalizeKey(i.description)).join(' | ');
  const suggestions = [];

  if (categories.includes('breakdown')) suggestions.push('Reparar ou trocar o componente e testar a máquina.');
  if (categories.includes('leak')) suggestions.push('Eliminar o vazamento e validar sem reincidência.');
  if (categories.includes('variation')) suggestions.push('Eliminar a variação e acompanhar a estabilidade por 30 minutos.');
  if (categories.includes('alarm')) suggestions.push('Eliminar a causa do alarme e testar o funcionamento.');
  if (categories.includes('maintenance-quality')) suggestions.push('Corrigir a causa mecânica e liberar após amostras aprovadas.');
  if (categories.includes('instability')) suggestions.push('Eliminar a instabilidade e validar o ciclo da máquina.');
  if (categories.includes('missing')) suggestions.push('Revisar sensor, alimentação e sincronismo e eliminar a falha.');
  if (categories.includes('adjustment')) suggestions.push('Corrigir a regulagem e verificar desgaste ou folga.');

  if (/faca fundo/.test(joined)) suggestions.push('Conferir faca e contrafaca do fundo.');
  if (/altura/.test(joined)) suggestions.push('Medir e registrar o resultado.');
  if (/reservatorio de cola|cola faixa/.test(joined)) suggestions.push('Revisar mangueira, conexões e fixação da cola.');
  if (/tampao/.test(joined)) suggestions.push('Revisar tampão, base e vedação.');

  return [...new Set(suggestions)].slice(0, 2).join(' ');
}

function productionSuggestedAction(machine, categories) {
  const suggestions = [];
  if (categories.includes('paper-handling')) suggestions.push('Corrigir passagem de papel e troca de bobina conforme o padrão.');
  if (categories.includes('production-quality')) suggestions.push('Parar no primeiro defeito, conter o material e reforçar o autocontrole.');
  if (categories.includes('production-setup')) suggestions.push('Conferir molde, setup e preparação antes de produzir.');
  if (categories.includes('cleaning')) suggestions.push('Executar limpeza e organização dentro do padrão.');
  if (categories.includes('production-review')) suggestions.push('Definir se a causa é operação, material ou equipamento e agir.');
  suggestions.push('Se for defeito técnico, abrir solicitação no SGMan.');
  return [...new Set(suggestions)].slice(0, 2).join(' ');
}

function deadlineForAction() {
  return 'Durante o turno';
}

function compactIssue(text = '') {
  return String(text)
    .split(';')
    .slice(0, 2)
    .join('; ')
    .replace(/\b\d{1,2}\s*[:h]\s*\d{2}\b/gi, '')
    .replace(/\b\d{1,3}\s*(?:min|minuto|minutos)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .trim()
    .replace(/[.;]+$/, '');
}

function directMaintenanceAction(action) {
  const key = normalizeKey(`${action.description || ''} ${action.action || ''}`);

  if (/mangueira|reservatorio.*cola|cola.*faixa/.test(key)) {
    return 'Trocar a mangueira da cola, conferir as conexões e testar.';
  }
  if (/variacao.*altura|altura.*variacao/.test(key)) {
    return 'Eliminar a variação de altura e acompanhar a estabilidade.';
  }
  if (/tampao.*vaz|vaz.*tampao/.test(key)) {
    return 'Eliminar o vazamento do tampão e testar sem reincidência.';
  }
  if (/faca/.test(key) && /estrela|saida/.test(key)) {
    return 'Corrigir faca, estrela e saída e testar a máquina.';
  }
  if (/alarme.*lubrificacao|lubrificacao.*alarme/.test(key)) {
    return 'Eliminar o alarme de lubrificação e testar.';
  }
  if (/faca.*fundo/.test(key)) {
    return 'Corrigir faca e contrafaca do fundo e testar.';
  }
  if (/faca.*faixa/.test(key)) {
    return 'Corrigir a faca da faixa e testar.';
  }
  if (/bobina.*estour|estour.*bobina/.test(key)) {
    return 'Eliminar a causa da bobina estourando e acompanhar.';
  }
  if (/peca.*volt|volt.*peca|faixa.*volt|volt.*faixa/.test(key)) {
    return 'Eliminar o retorno da peça ou faixa e acompanhar.';
  }
  if (/marcas.*parafuso/.test(key)) {
    return 'Eliminar as marcas de parafuso e liberar após amostra aprovada.';
  }
  if (/garra/.test(key)) {
    return 'Corrigir a garra e testar o ciclo da máquina.';
  }

  const first = firstSentence(action.action || 'Corrigir a falha e testar a máquina.');
  return first.endsWith('.') ? first : `${first}.`;
}

function messageHtml(text = '') {
  return `<div class="short-message">${escapeHtml(text)}</div>`;
}


function dataUrlFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


const OEE_BOARD_MACHINES = [
  'MK-02', 'MK-08', 'MK-138', 'MK-105', 'MK-108', 'MK-223',
  'MK-192', 'MK-69', 'MK-172', 'MK-173', 'MK-178', 'MK-179',
  'MK-212', 'MK-214', 'MK-217', 'MK-220', 'MK-159', 'MK-222',
  'MK-170', 'MK-176', 'MK-188', 'MK-149'
];

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function boardColumnIndex(operationalDate, shift) {
  const date = parseISODateAtNoon(operationalDate || todayISO());
  const jsDay = date.getDay(); // domingo = 0
  const mondayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const shiftOffset = String(shift || '1') === '2' ? 1 : 0;
  return mondayIndex * 2 + shiftOffset;
}

function getOeeCropSettings(image, operationalDate, shift) {
  // O quadro tem uma coluna fixa das máquinas à esquerda e 14 colunas de turno.
  const boardStart = 0.085;
  const boardEnd = 0.995;
  const totalColumns = 14;
  const columnWidth = (boardEnd - boardStart) / totalColumns;
  const index = boardColumnIndex(operationalDate, shift);

  // Leve folga lateral para compensar perspectiva da foto.
  const xRatio = Math.max(0, boardStart + index * columnWidth - columnWidth * 0.13);
  const widthRatio = Math.min(1 - xRatio, columnWidth * 1.26);

  // Começa onde iniciam as linhas das máquinas, removendo cabeçalho/produção total.
  const yRatio = 0.175;
  const heightRatio = 0.79;

  return {
    sx: Math.round(image.naturalWidth * xRatio),
    sy: Math.round(image.naturalHeight * yRatio),
    sw: Math.round(image.naturalWidth * widthRatio),
    sh: Math.round(image.naturalHeight * heightRatio)
  };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function createOeeRowPreviews(previewCanvas) {
  const rowCount = OEE_BOARD_MACHINES.length;
  const rowHeight = previewCanvas.height / rowCount;
  const previews = [];

  for (let index = 0; index < rowCount; index++) {
    const sourceY = Math.max(0, index * rowHeight - rowHeight * 0.08);
    const sourceHeight = Math.min(
      previewCanvas.height - sourceY,
      rowHeight * 1.16
    );

    const canvas = document.createElement('canvas');
    const width = 520;
    const height = 96;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      previewCanvas,
      0,
      sourceY,
      previewCanvas.width,
      sourceHeight,
      0,
      0,
      width,
      height
    );

    previews.push(canvas.toDataURL('image/jpeg', 0.9));
  }

  return previews;
}

function preprocessOeeColumn(image, operationalDate, shift) {
  const crop = getOeeCropSettings(image, operationalDate, shift);

  // Prévia colorida e legível para o usuário.
  const previewCanvas = document.createElement('canvas');
  const previewCtx = previewCanvas.getContext('2d');
  const previewWidth = Math.max(520, Math.min(900, crop.sw * 3.5));
  const previewHeight = Math.round(previewWidth * (crop.sh / crop.sw));

  previewCanvas.width = previewWidth;
  previewCanvas.height = previewHeight;
  previewCtx.fillStyle = '#ffffff';
  previewCtx.fillRect(0, 0, previewWidth, previewHeight);
  previewCtx.imageSmoothingEnabled = true;
  previewCtx.imageSmoothingQuality = 'high';
  previewCtx.drawImage(
    image,
    crop.sx, crop.sy, crop.sw, crop.sh,
    0, 0, previewWidth, previewHeight
  );

  // Imagem separada para o OCR. Ela não é mais usada como prévia principal.
  const ocrCanvas = document.createElement('canvas');
  const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true });
  const ocrWidth = Math.max(1200, Math.min(1800, crop.sw * 6));
  const ocrHeight = Math.round(ocrWidth * (crop.sh / crop.sw));

  ocrCanvas.width = ocrWidth;
  ocrCanvas.height = ocrHeight;
  ocrCtx.fillStyle = '#ffffff';
  ocrCtx.fillRect(0, 0, ocrWidth, ocrHeight);
  ocrCtx.imageSmoothingEnabled = true;
  ocrCtx.imageSmoothingQuality = 'high';
  ocrCtx.drawImage(
    image,
    crop.sx, crop.sy, crop.sw, crop.sh,
    0, 0, ocrWidth, ocrHeight
  );

  const imageData = ocrCtx.getImageData(0, 0, ocrWidth, ocrHeight);
  const pixels = imageData.data;

  // Tratamento suave:
  // - mantém os traços da caneta;
  // - clareia grade e fundo;
  // - não dilata nem transforma a escrita em blocos pretos.
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    let value;

    if (saturation < 15 && luminance > 118) {
      // Fundo branco e linhas claras da grade.
      value = 255;
    } else if (saturation >= 18) {
      // Caneta colorida: aumenta contraste sem engrossar o traço.
      value = clampByte(luminance * 0.58 - saturation * 0.55 + 42);
    } else {
      // Escrita escura ou partes mais fortes da grade.
      value = clampByte((luminance - 105) * 1.65 + 105);
    }

    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }

  ocrCtx.putImageData(imageData, 0, 0);

  return {
    crop,
    canvas: ocrCanvas,
    previewCanvas,
    previewDataUrl: previewCanvas.toDataURL('image/jpeg', 0.94),
    ocrDataUrl: ocrCanvas.toDataURL('image/png'),
    rowPreviews: createOeeRowPreviews(previewCanvas)
  };
}

function numericOeeFromWord(text = '') {
  const cleaned = String(text).replace(/[Oo]/g, '0').replace(/[^0-9.,%]/g, '');
  const match = cleaned.match(/(\d{1,3})(?:[.,](\d))?/);
  if (!match) return null;
  const integer = Number(match[1]);
  const value = Number(match[2] ? `${integer}.${match[2]}` : integer);
  if (!Number.isFinite(value) || value < 10 || value > 100) return null;
  return {
    value,
    hasPercent: cleaned.includes('%')
  };
}

function mapOcrWordsToMachineRows(words = [], canvasHeight = 1) {
  const rowCount = OEE_BOARD_MACHINES.length;
  const rowBuckets = Array.from({ length: rowCount }, () => []);

  for (const word of words) {
    const parsed = numericOeeFromWord(word.text);
    if (!parsed) continue;
    const bbox = word.bbox || {};
    const y0 = Number(bbox.y0 ?? bbox.top ?? 0);
    const y1 = Number(bbox.y1 ?? bbox.bottom ?? y0);
    const centerY = (y0 + y1) / 2;
    const normalizedY = Math.min(0.999, Math.max(0, centerY / Math.max(1, canvasHeight)));
    const rowIndex = Math.min(rowCount - 1, Math.floor(normalizedY * rowCount));

    rowBuckets[rowIndex].push({
      value: parsed.value,
      hasPercent: parsed.hasPercent,
      confidence: Number(word.confidence || 0),
      x: Number(bbox.x0 ?? bbox.left ?? 0),
      y: centerY,
      raw: word.text
    });
  }

  return OEE_BOARD_MACHINES.map((machine, index) => {
    const candidates = rowBuckets[index];
    if (!candidates.length) {
      return { machine, oee: '', confidence: 0, source: 'Não identificado' };
    }

    // Percentual explícito ganha prioridade; caso contrário usa o último número da linha.
    candidates.sort((a, b) => {
      if (a.hasPercent !== b.hasPercent) return a.hasPercent ? -1 : 1;
      if (a.y !== b.y) return b.y - a.y;
      return b.x - a.x;
    });

    const chosen = candidates[0];
    return {
      machine,
      oee: chosen.value,
      confidence: chosen.confidence,
      source: chosen.raw
    };
  });
}

function renderOeeMachineEditor(rows = state.oeeMachineEditorData) {
  const wrap = $('oeeMachineEditor');
  if (!wrap) return;

  state.oeeMachineEditorData = rows.length
    ? rows
    : OEE_BOARD_MACHINES.map(machine => ({ machine, oee: '', confidence: 0, source: '' }));

  wrap.innerHTML = `
    <div class="oee-editor-head">
      <strong>Confirme os valores antes de analisar</strong>
      <span class="muted">Deixe vazio quando a máquina não trabalhou.</span>
    </div>
    <div class="oee-editor-grid">
      ${state.oeeMachineEditorData.map((row, index) => {
        const confidenceClass = row.oee === ''
          ? 'confidence-empty'
          : row.confidence >= 70
            ? 'confidence-good'
            : row.confidence >= 40
              ? 'confidence-warning'
              : 'confidence-low';

        return `
          <label class="oee-editor-row ${confidenceClass}">
            <span class="oee-machine-name">${escapeHtml(row.machine)}</span>
            ${state.oeeRowPreviews[index]
              ? `<img class="oee-row-preview" src="${state.oeeRowPreviews[index]}" alt="Linha de ${escapeHtml(row.machine)} no quadro" />`
              : '<span class="oee-row-placeholder">Sem recorte</span>'}
            <input
              class="oee-editor-input"
              data-index="${index}"
              type="number"
              min="0"
              max="100"
              step="0.1"
              inputmode="decimal"
              value="${row.oee === '' ? '' : escapeHtml(String(row.oee))}"
              placeholder="-"
            />
            <small>${row.oee === '' ? 'Confira a linha e digite o OEE' : `${Math.round(row.confidence || 0)}% confiança — confirme`}</small>
          </label>`;
      }).join('')}
    </div>
  `;

  $$('.oee-editor-input').forEach(input => {
    input.addEventListener('input', event => {
      const index = Number(event.target.dataset.index);
      const raw = event.target.value.trim();
      const value = raw === '' ? '' : Number(raw.replace(',', '.'));
      state.oeeMachineEditorData[index].oee = Number.isFinite(value) ? value : '';
      state.oeeMachineEditorData[index].confidence = 100;
      event.target.closest('.oee-editor-row')?.classList.remove('confidence-low', 'confidence-warning', 'confidence-empty');
      event.target.closest('.oee-editor-row')?.classList.add('confidence-good');
      const small = event.target.closest('.oee-editor-row')?.querySelector('small');
      if (small) small.textContent = raw === '' ? 'Revisar' : 'Confirmado';
    });
  });

  wrap.classList.remove('hidden');
}

function machineOeeFromEditor() {
  return state.oeeMachineEditorData
    .map(row => ({
      machine: row.machine,
      oee: row.oee === '' ? null : Number(row.oee),
      line: `${row.machine} ${row.oee}%`
    }))
    .filter(row => Number.isFinite(row.oee) && row.oee >= 0 && row.oee <= 100);
}

function editorOeeText() {
  return machineOeeFromEditor()
    .map(row => `${row.machine.replace('MK-', '')} ${String(row.oee).replace('.', ',')}%`)
    .join('\n');
}

async function processOeeColumnPhoto() {
  const file = $('oeeImageInput')?.files?.[0];
  if (!file) {
    showToast('Escolha a foto do quadro primeiro.');
    return [];
  }

  const statusEl = $('oeeStatus');
  const operationalDate = $('reportDate').value || todayISO();
  const shift = $('reportShift').value || '1';
  const scope = boardScopeForReport(operationalDate, shift);

  try {
    statusEl.textContent = `Recortando somente ${scope.label}...`;
    const fullDataUrl = state.oeeImageDataUrl || await dataUrlFromFile(file);
    state.oeeImageDataUrl = fullDataUrl;

    const image = await loadImageElement(fullDataUrl);
    const processed = preprocessOeeColumn(image, operationalDate, shift);
    state.oeeCropDataUrl = processed.previewDataUrl;
    state.oeeRowPreviews = processed.rowPreviews || [];

    $('oeeCropPreview').src = processed.previewDataUrl;
    $('oeeOcrPreview').src = processed.ocrDataUrl;
    $('oeeCropPreviewWrap').classList.remove('hidden');

    if (!window.Tesseract) throw new Error('OCR não carregado.');
    statusEl.textContent = `Lendo somente ${scope.label}...`;

    const result = await window.Tesseract.recognize(
      processed.ocrDataUrl,
      'eng',
      {
        logger: info => {
          if (info.status === 'recognizing text' && typeof info.progress === 'number') {
            statusEl.textContent = `Lendo ${scope.label}... ${Math.round(info.progress * 100)}%`;
          }
        }
      },
      {
        tessedit_char_whitelist: '0123456789%.,',
        tessedit_pageseg_mode: '6',
        preserve_interword_spaces: '1'
      }
    );

    const words = result?.data?.words || [];
    const rows = mapOcrWordsToMachineRows(words, processed.canvas.height);
    state.oeeMachineEditorData = rows;
    renderOeeMachineEditor(rows);

    const detected = rows.filter(row => row.oee !== '').length;
    statusEl.textContent = `${detected} valor(es) sugerido(s) em ${scope.label}. Como o quadro é escrito à mão, confirme cada linha antes de analisar.`;

    // Mantém compatibilidade com histórico e painel.
    $('oeeOcrText').value = editorOeeText();
    state.oeeOcrText = $('oeeOcrText').value;
    return rows;
  } catch (error) {
    console.error(error);
    statusEl.textContent = 'Não consegui ler automaticamente. Preencha a tabela manualmente usando a foto recortada.';
    renderOeeMachineEditor([]);
    showToast('Leitura automática incompleta. Confirme os valores manualmente.');
    return [];
  }
}

async function recognizeOeeImage(dataUrl) {
  if (!dataUrl) return '';
  // Mantido apenas como compatibilidade. A V11 usa processOeeColumnPhoto().
  return '';
}

function parseOeeCandidates(segment = '') {
  const values = [];
  const regex = /(\d{1,3})(?:[.,](\d))?\s*%?/g;
  let match;
  while ((match = regex.exec(segment))) {
    const integer = Number(match[1]);
    if (integer > 100) continue;
    const value = Number(match[2] ? `${integer}.${match[2]}` : integer);
    if (value >= 0 && value <= 100) values.push(value);
  }
  return values;
}

function extractAllMachineOeeFromText(raw = '') {
  const seen = new Map();
  const lines = String(raw || '').split(/\n+/).map(v => cleanLine(v)).filter(Boolean);

  for (const rawLine of lines) {
    const line = normalizeKey(rawLine).replace(/,/g, '.');
    const machineMatch = line.match(/(?:^|\s)(?:mk\s*[-:]?\s*)?(\d{2,3})(?:\s|$)/);
    if (!machineMatch) continue;
    const code = Number(machineMatch[1]);
    if (code < 2 || code > 399) continue;

    const values = parseOeeCandidates(line);
    if (!values.length) continue;

    // O primeiro número normalmente é o código da máquina; usa o último percentual da linha.
    const oee = values[values.length - 1];
    const machine = `MK-${String(code).padStart(2, '0')}`;
    const current = seen.get(machine);

    if (!current || oee < current.oee) {
      seen.set(machine, { machine, oee, line: rawLine });
    }
  }

  return [...seen.values()].sort((a, b) => a.machine.localeCompare(b.machine, 'pt-BR', { numeric: true }));
}

function extractMachineOeeFromText(raw = '') {
  return extractAllMachineOeeFromText(raw)
    .filter(item => item.oee < 65)
    .sort((a, b) => a.oee - b.oee);
}

function deriveRecurrenceMachines(analysis) {
  const reported = new Set();
  for (const action of state.actions.filter(a => a.department === 'maintenance')) {
    const key = normalizeKey(`${action.description} ${action.action}`);
    const repeated = /(2x|duas vezes|novo ajuste|novamente|reincid)/.test(key);
    if (repeated) reported.add(action.machine);
  }
  const lowOeeMachines = (analysis?.lowOeeMachines || []).map(item => item.machine);
  const maintenanceMachines = new Set(state.actions.filter(a => a.department === 'maintenance').map(a => a.machine));
  lowOeeMachines.forEach(machine => { if (maintenanceMachines.has(machine)) reported.add(machine); });
  return [...reported];
}

function oeeLowListText(items = [], limit = 6) {
  if (!items.length) return '';
  return items.slice(0, limit).map(item => `${item.machine} ${String(item.oee).replace('.', ',')}%`).join(', ');
}


function getAnalysisMachineOee(analysis) {
  if (!analysis) return [];
  if (Array.isArray(analysis.machineOee) && analysis.machineOee.length) return analysis.machineOee;
  if (analysis.oeeOcrText) return extractAllMachineOeeFromText(analysis.oeeOcrText);
  return [];
}

function formatOee(value) {
  if (value == null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(1).replace('.0', '').replace('.', ',')}%`;
}

function average(values = []) {
  const valid = values.map(Number).filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function getRecentOeeDashboard() {
  const analyses = getHistory()
    .map(item => item.analysis)
    .filter(Boolean)
    .map(analysis => ({
      ...analysis,
      machineOee: getAnalysisMachineOee(analysis)
    }))
    .filter(analysis => analysis.machineOee.length || analysis.reportedOee)
    .sort((a, b) => {
      const keyA = `${a.date || ''}-${String(a.shift || '1')}`;
      const keyB = `${b.date || ''}-${String(b.shift || '1')}`;
      return keyA.localeCompare(keyB);
    });

  if (!analyses.length) {
    return {
      dates: [],
      shifts: [],
      companyAverage: null,
      dailyCompany: [],
      machines: [],
      priorityMachines: [],
      fallingMachines: []
    };
  }

  const distinctDates = [...new Set(analyses.map(item => item.date).filter(Boolean))]
    .sort()
    .slice(-3);

  const recent = analyses.filter(item => distinctDates.includes(item.date));
  const shifts = recent.map(item => ({
    date: item.date,
    shift: String(item.shift || '1'),
    label: `${formatDate(item.date)} ${String(item.shift) === '2' ? 'B' : 'A'}`,
    reportedOee: item.reportedOee || null,
    machineOee: item.machineOee
  }));

  const dailyCompany = distinctDates.map(date => {
    const values = recent
      .filter(item => item.date === date)
      .map(item => Number(item.reportedOee))
      .filter(Number.isFinite)
      .filter(value => value > 0);
    return { date, average: average(values), shifts: values.length };
  });

  const companyAverage = average(dailyCompany.map(item => item.average).filter(value => value != null));

  const machineMap = new Map();
  for (const analysis of recent) {
    for (const item of analysis.machineOee) {
      if (!machineMap.has(item.machine)) {
        machineMap.set(item.machine, {
          machine: item.machine,
          byDate: {},
          readings: [],
          below65Count: 0
        });
      }
      const row = machineMap.get(item.machine);
      if (!row.byDate[analysis.date]) row.byDate[analysis.date] = [];
      row.byDate[analysis.date].push({
        shift: String(analysis.shift || '1'),
        oee: Number(item.oee)
      });
      row.readings.push({
        date: analysis.date,
        shift: String(analysis.shift || '1'),
        oee: Number(item.oee)
      });
      if (Number(item.oee) < 65) row.below65Count += 1;
    }
  }

  const machines = [...machineMap.values()].map(row => {
    const dayValues = {};
    distinctDates.forEach(date => {
      const readings = row.byDate[date] || [];
      dayValues[date] = {
        average: average(readings.map(item => item.oee)),
        readings: readings.sort((a, b) => a.shift.localeCompare(b.shift))
      };
    });

    const sortedReadings = row.readings
      .slice()
      .sort((a, b) => `${a.date}-${a.shift}`.localeCompare(`${b.date}-${b.shift}`));

    const first = sortedReadings[0]?.oee;
    const last = sortedReadings[sortedReadings.length - 1]?.oee;
    const trend = first == null || last == null
      ? 'stable'
      : last < first - 2
        ? 'down'
        : last > first + 2
          ? 'up'
          : 'stable';

    return {
      ...row,
      dayValues,
      average: average(row.readings.map(item => item.oee)),
      trend,
      first,
      last
    };
  }).sort((a, b) => {
    const avA = a.average == null ? 999 : a.average;
    const avB = b.average == null ? 999 : b.average;
    return avA - avB;
  });

  const priorityMachines = machines.filter(machine =>
    (machine.average != null && machine.average < 65) ||
    machine.below65Count >= 2 ||
    machine.trend === 'down'
  );

  const fallingMachines = machines.filter(machine => machine.trend === 'down');

  return {
    dates: distinctDates,
    shifts,
    companyAverage,
    dailyCompany,
    machines,
    priorityMachines,
    fallingMachines
  };
}

function machineTrendLabel(machine) {
  if (machine.trend === 'down') return '↓ Piorando';
  if (machine.trend === 'up') return '↑ Melhorando';
  return '→ Estável';
}

function machineTrendClass(machine) {
  if (machine.trend === 'down') return 'trend-down';
  if (machine.trend === 'up') return 'trend-up';
  return 'trend-stable';
}

function dashboardPriorityText(limit = 5) {
  const dashboard = getRecentOeeDashboard();
  return dashboard.priorityMachines
    .slice(0, limit)
    .map(machine => `${machine.machine} ${formatOee(machine.average)}`)
    .join(', ');
}

function renderOeeDashboard() {
  const empty = $('emptyOeeDashboard');
  const content = $('oeeDashboardContent');
  if (!empty || !content) return;

  const dashboard = getRecentOeeDashboard();
  const hasData = dashboard.dates.length > 0;

  empty.classList.toggle('hidden', hasData);
  content.classList.toggle('hidden', !hasData);
  if (!hasData) return;

  const dayCards = dashboard.dailyCompany.map(item => `
    <div class="metric">
      <span>${escapeHtml(formatDate(item.date))}</span>
      <strong>${escapeHtml(formatOee(item.average))}</strong>
      <small>${item.shifts} turno(s) registrado(s)</small>
    </div>
  `).join('');

  $('oeeDashboardCards').innerHTML = `
    <div class="metric">
      <span>OEE geral — 3 dias</span>
      <strong>${escapeHtml(formatOee(dashboard.companyAverage))}</strong>
      <small>Média do OEE geral informado nos relatórios</small>
    </div>
    <div class="metric">
      <span>Máquinas analisadas</span>
      <strong>${dashboard.machines.length}</strong>
      <small>Com leitura de OEE armazenada</small>
    </div>
    <div class="metric">
      <span>Prioridades</span>
      <strong>${dashboard.priorityMachines.length}</strong>
      <small>Abaixo de 65%, reincidentes ou piorando</small>
    </div>
    ${dayCards}
  `;

  const priorityHtml = dashboard.priorityMachines.length
    ? dashboard.priorityMachines.slice(0, 10).map((machine, index) => `
        <div class="priority-oee-item">
          <span class="priority-number">${index + 1}</span>
          <div>
            <strong>${escapeHtml(machine.machine)}</strong>
            <p>Média ${escapeHtml(formatOee(machine.average))} • abaixo de 65 em ${machine.below65Count} leitura(s)</p>
          </div>
          <span class="trend-pill ${machineTrendClass(machine)}">${escapeHtml(machineTrendLabel(machine))}</span>
        </div>
      `).join('')
    : '<p class="muted">Nenhuma máquina crítica nos últimos três dias.</p>';
  $('oeePriorityList').innerHTML = priorityHtml;

  const headerDates = dashboard.dates.map(date => `<th>${escapeHtml(formatDate(date))}</th>`).join('');
  const rows = dashboard.machines.map(machine => {
    const cells = dashboard.dates.map(date => {
      const info = machine.dayValues[date];
      if (!info || info.average == null) return '<td class="muted">-</td>';
      const detail = info.readings
        .map(item => `${item.shift === '2' ? 'B' : 'A'} ${formatOee(item.oee)}`)
        .join(' / ');
      const lowClass = info.average < 65 ? 'oee-low' : info.average < 70 ? 'oee-warning' : 'oee-good';
      return `<td class="${lowClass}"><strong>${escapeHtml(formatOee(info.average))}</strong><small>${escapeHtml(detail)}</small></td>`;
    }).join('');

    const avgClass = machine.average < 65 ? 'oee-low' : machine.average < 70 ? 'oee-warning' : 'oee-good';

    return `<tr>
      <td><strong>${escapeHtml(machine.machine)}</strong></td>
      ${cells}
      <td class="${avgClass}"><strong>${escapeHtml(formatOee(machine.average))}</strong></td>
      <td><span class="trend-pill ${machineTrendClass(machine)}">${escapeHtml(machineTrendLabel(machine))}</span></td>
    </tr>`;
  }).join('');

  $('oeeMachineTable').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Máquina</th>
          ${headerDates}
          <th>Média 3 dias</th>
          <th>Tendência</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function generateActions(analysis) {
  const actions = [];
  const maintenanceCategories = new Set(['breakdown', 'leak', 'variation', 'alarm', 'maintenance-quality', 'instability', 'missing', 'adjustment']);
  const productionCategories = new Set(['paper-handling', 'production-quality', 'production-setup', 'cleaning', 'production-review']);
  const maintenanceResponsible = findMaintenanceResponsible(analysis.responsibleDate, analysis.responsibleShift, analysis.responsibleCrew);
  const productionResponsible = findProductionResponsible(analysis.responsibleCrew);

  for (const machine of analysis.machines) {
    const classified = machine.incidents.map(incident => ({ ...incident, category: classifyIncident(incident.description) }));

    const maintenanceIncidents = classified.filter(incident => maintenanceCategories.has(incident.category));
    if (maintenanceIncidents.length) {
      const categories = [...new Set(maintenanceIncidents.map(incident => incident.category))];
      const relevantMinutes = maintenanceIncidents.reduce((sum, incident) => sum + incident.minutes, 0);
      const high = relevantMinutes >= 90 || categories.includes('breakdown') || categories.includes('variation') || (categories.includes('leak') && relevantMinutes >= 45);
      const medium = relevantMinutes >= 20 || categories.some(c => ['alarm', 'maintenance-quality', 'instability', 'missing', 'adjustment'].includes(c));
      const priority = high ? 'Alta' : medium ? 'Média' : 'Baixa';

      actions.push({
        id: uid(),
        department: 'maintenance',
        approved: priority !== 'Baixa',
        machine: machine.code,
        priority,
        type: 'OS',
        responsible: maintenanceResponsible,
        description: maintenanceIncidents.map(i => i.description).join('; '),
        action: maintenanceSuggestedAction(machine, categories),
        recordedMinutes: relevantMinutes,
        categories
      });
    }

    const productionIncidents = classified.filter(incident => productionCategories.has(incident.category));
    const meaningfulProduction = productionIncidents.filter(incident => incident.category !== 'cleaning' || productionIncidents.length > 1);
    if (meaningfulProduction.length) {
      const categories = [...new Set(meaningfulProduction.map(incident => incident.category))];
      const relevantMinutes = meaningfulProduction.reduce((sum, incident) => sum + incident.minutes, 0);
      const qualityRisk = categories.includes('production-quality');
      const priority = qualityRisk || relevantMinutes >= 45 ? 'Alta' : 'Média';

      actions.push({
        id: uid(),
        department: 'production',
        approved: true,
        machine: machine.code,
        priority,
        type: 'Produção',
        responsible: productionResponsible,
        description: meaningfulProduction.map(i => i.description).join('; '),
        action: productionSuggestedAction(machine, categories),
        recordedMinutes: relevantMinutes,
        categories
      });
    }
  }

  if (analysis.reportedOee && analysis.reportedOee < analysis.targetOee) {
    actions.push({
      id: uid(),
      department: 'production',
      approved: true,
      machine: 'OEE',
      priority: analysis.reportedOee < analysis.targetOee - 10 ? 'Alta' : 'Média',
      type: 'Gestão',
      responsible: productionResponsible,
      description: `OEE informado em ${analysis.reportedOee}%, abaixo da meta de ${analysis.targetOee}%.${analysis.gap != null ? ` Diferença de ${formatNumber(analysis.gap)} unidades para o plano.` : ''}`,
      action: 'Priorizar as máquinas de maior impacto, garantir operador nas máquinas definidas, cobrar ritmo, autocontrole e reação rápida às perdas do turno.',
      recordedMinutes: 0,
      categories: ['oee']
    });
  }

  if (analysis.laborShortageMachines.length) {
    actions.push({
      id: uid(),
      department: 'production',
      approved: true,
      machine: 'MÃO DE OBRA',
      priority: analysis.laborShortageMachines.length >= 3 ? 'Alta' : 'Média',
      type: 'Gestão',
      responsible: productionResponsible,
      description: `${analysis.laborShortageMachines.length} máquinas sem mão de obra: ${analysis.laborShortageMachines.join(', ')}.`,
      action: 'Reorganizar o efetivo conforme prioridade e impacto no OEE. Registrar claramente quais máquinas ficarão paradas por decisão de produção.',
      recordedMinutes: 0,
      categories: ['labor']
    });
  }

  if (analysis.trainingPeople.length) {
    actions.push({
      id: uid(),
      department: 'production',
      approved: true,
      machine: 'TREINAMENTO',
      priority: 'Média',
      type: 'Gestão',
      responsible: productionResponsible,
      description: `${analysis.trainingPeople.length} colaborador(es) relacionado(s): ${analysis.trainingPeople.join(', ')}.${analysis.trainingCount === 0 ? ' O campo do relatório foi informado como zero.' : ''}`,
      action: 'Definir tutor, máquina e objetivo do treinamento. Cobrar passagem de papel, troca de bobina, limpeza, autocontrole e reação às perdas conforme o padrão.',
      recordedMinutes: 0,
      categories: ['training']
    });
  }

  if (analysis.ddeItems?.length) {
    actions.push({
      id: uid(),
      department: 'production',
      approved: true,
      machine: 'DDE',
      priority: 'Média',
      type: 'Gestão',
      responsible: productionResponsible,
      description: analysis.ddeItems.join('; '),
      action: 'Reforçar os temas no início do turno e verificar no chão de fábrica se o padrão está sendo cumprido.',
      recordedMinutes: 0,
      categories: ['dde']
    });
  }

  if (analysis.reworkCount > 0) {
    actions.push({
      id: uid(),
      department: 'production',
      approved: true,
      machine: 'RETRABALHO',
      priority: 'Alta',
      type: 'Qualidade',
      responsible: productionResponsible,
      description: `${analysis.reworkCount} registro(s) de retrabalho no turno.`,
      action: 'Identificar máquina e causa, conter o produto, corrigir o processo e acompanhar para evitar repetição.',
      recordedMinutes: 0,
      categories: ['rework']
    });
  }

  if (analysis.lowOeeMachines?.length) {
    analysis.lowOeeMachines.forEach(item => {
      actions.push({
        id: uid(),
        department: 'maintenance',
        approved: true,
        machine: item.machine,
        priority: item.oee < 55 ? 'Alta' : 'Média',
        type: 'OEE',
        responsible: maintenanceResponsible,
        description: `OEE de ${String(item.oee).replace('.', ',')}% no quadro semanal, abaixo de 65%.`,
        action: 'Analisar a causa do OEE baixo, atacar a principal perda e estabilizar a máquina.',
        recordedMinutes: 0,
        categories: ['oee-machine']
      });
    });
  }

  actions.forEach(action => {
    action.status = action.status || 'Pendente';
    action.deadline = action.deadline || deadlineForAction(action.priority, action.department, analysis.responsibleShift);
  });

  const deduped = [];
  const byDeptMachine = new Map();
  for (const action of actions) {
    const key = `${action.department}::${action.machine}`;
    if (action.department === 'maintenance' && byDeptMachine.has(key)) {
      const current = byDeptMachine.get(key);
      current.description = [current.description, action.description].filter(Boolean).join(' | ');
      current.action = directMaintenanceAction({ description: current.description, action: `${current.action} ${action.action}` });
      current.priority = current.priority === 'Alta' || action.priority === 'Alta' ? 'Alta' : (current.priority === 'Média' || action.priority === 'Média' ? 'Média' : 'Baixa');
      current.categories = [...new Set([...(current.categories || []), ...(action.categories || [])])];
      current.recordedMinutes = Math.max(current.recordedMinutes || 0, action.recordedMinutes || 0);
    } else {
      byDeptMachine.set(key, action);
      deduped.push(action);
    }
  }

  const order = { Alta: 0, Média: 1, Baixa: 2 };
  return deduped.sort((a, b) => order[a.priority] - order[b.priority] || b.recordedMinutes - a.recordedMinutes || a.department.localeCompare(b.department));
}

function getScale() {
  try { return JSON.parse(localStorage.getItem(STORAGE.scale)) || []; }
  catch { return []; }
}

function saveScale(items) {
  localStorage.setItem(STORAGE.scale, JSON.stringify(items));
}

function migrateConfirmedSgmanUsers() {
  const current = getScale();
  const byCrew = new Map(current.map(item => [item.crew, item]));
  let changed = false;

  Object.entries(DEFAULT_MAINTENANCE_TEAMS).forEach(([crew, defaults]) => {
    const existing = byCrew.get(crew);

    if (!existing) {
      byCrew.set(crew, {
        id: uid(),
        crew,
        maintenanceLeader: defaults.maintenanceLeader,
        sgmanExecutante: defaults.sgmanExecutante,
        sgmanMechanics: [],
        productionLeader: DEFAULT_PRODUCTION_LEADERS[crew] || '',
        team: ''
      });
      changed = true;
      return;
    }

    const savedMechanics = Array.isArray(existing.sgmanMechanics)
      ? existing.sgmanMechanics
      : [
          existing.sgmanMechanic1,
          existing.sgmanMechanic2,
          existing.sgmanMechanic3
        ].filter(Boolean);

    const derivedMechanics = savedMechanics.length
      ? savedMechanics
      : parseLegacyTeamSgmanUsers(existing.team || '');

    const leader = defaults.sgmanExecutante;
    const mechanics = uniqueStrings(
      derivedMechanics
        .map(value => resolveSgmanUsername(value) || String(value).trim())
        .filter(value =>
          value &&
          value.toLocaleLowerCase('pt-BR') !==
            leader.toLocaleLowerCase('pt-BR')
        )
    ).slice(0, 3);

    const next = {
      ...existing,
      maintenanceLeader: defaults.maintenanceLeader,
      sgmanExecutante: leader,
      sgmanMechanics: mechanics,
      productionLeader:
        existing.productionLeader ||
        DEFAULT_PRODUCTION_LEADERS[crew] ||
        ''
    };

    if (
      existing.maintenanceLeader !== next.maintenanceLeader ||
      existing.sgmanExecutante !== next.sgmanExecutante ||
      JSON.stringify(existing.sgmanMechanics || []) !==
        JSON.stringify(next.sgmanMechanics)
    ) {
      byCrew.set(crew, next);
      changed = true;
    }
  });

  if (changed) {
    saveScale([...byCrew.values()]);
  }

  return [...byCrew.values()];
}

function getScaleRecord(crew) {
  const saved = getScale().find(row => row.crew === crew) || {};
  const defaults = DEFAULT_MAINTENANCE_TEAMS[crew] || {};

  const leader =
    saved.sgmanExecutante ||
    saved.sgmanUser ||
    defaults.sgmanExecutante ||
    '';

  const savedMechanics = Array.isArray(saved.sgmanMechanics)
    ? saved.sgmanMechanics
    : [
        saved.sgmanMechanic1,
        saved.sgmanMechanic2,
        saved.sgmanMechanic3
      ].filter(Boolean);

  const derivedMechanics = savedMechanics.length
    ? savedMechanics
    : parseLegacyTeamSgmanUsers(saved.team || '');

  const sgmanMechanics = uniqueStrings(
    derivedMechanics
      .map(value => resolveSgmanUsername(value) || String(value).trim())
      .filter(value =>
        value &&
        value.toLocaleLowerCase('pt-BR') !==
          String(leader).toLocaleLowerCase('pt-BR')
      )
  ).slice(0, 3);

  return {
    ...saved,
    crew,
    maintenanceLeader:
      saved.maintenanceLeader ||
      saved.leader ||
      defaults.maintenanceLeader ||
      '',
    sgmanExecutante: leader,
    sgmanMechanics,
    productionLeader:
      saved.productionLeader ||
      DEFAULT_PRODUCTION_LEADERS[crew] ||
      '',
    team: saved.team || ''
  };
}

function findMaintenanceResponsible(date, shift, crew = '') {
  const record = crew ? getScaleRecord(crew) : null;
  if (record?.maintenanceLeader) return record.maintenanceLeader;
  const legacy = getScale().find(row => row.date === date && String(row.shift) === String(shift));
  return legacy?.maintenanceLeader || legacy?.leader || `Líder da manutenção ${crew || '-'} não definido`;
}

function findSgmanExecutante(crew = '') {
  return findSgmanTeamExecutantes(crew)[0] || '';
}

function findSgmanTeamExecutantes(crew = '') {
  const record = crew ? getScaleRecord(crew) : null;
  if (!record) return [];

  const leader = resolveSgmanUsername(record.sgmanExecutante) ||
    String(record.sgmanExecutante || '').trim();

  const mechanics = (record.sgmanMechanics || [])
    .map(value => resolveSgmanUsername(value) || String(value).trim())
    .filter(Boolean);

  return uniqueStrings([leader, ...mechanics]);
}

function distributeSgmanOrders(sourceActions, executantes) {
  const roster = uniqueStrings(executantes);
  if (!roster.length) return [];

  return sourceActions.map((action, index) => ({
    action,
    executante: roster[index % roster.length]
  }));
}

function summarizeSgmanDistribution(assignments = []) {
  const counts = {};

  assignments.forEach(item => {
    counts[item.executante] = (counts[item.executante] || 0) + 1;
  });

  return Object.entries(counts).map(([username, count]) => ({
    username,
    label: sgmanUserLabel(username),
    count
  }));
}

function findProductionResponsible(crew = '') {
  const record = crew ? getScaleRecord(crew) : null;
  return record?.productionLeader || DEFAULT_PRODUCTION_LEADERS[crew] || `Líder da produção ${crew || '-'} não definido`;
}

function findResponsible(date, shift, crew = '') {
  return findMaintenanceResponsible(date, shift, crew);
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE.history)) || []; }
  catch { return []; }
}

function saveHistory(items) {
  localStorage.setItem(STORAGE.history, JSON.stringify(items.slice(0, 100)));
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function switchView(name) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function managementSummaryText(analysis) {
  const maintenanceActions = state.actions.filter(a => a.department === 'maintenance');
  const productionActions = state.actions.filter(a => a.department === 'production');
  const lines = [];
  lines.push(`RELATÓRIO GERENCIAL - ENTREGUE PELA EQUIPE ${analysis.crew}`);
  lines.push(`Data do relatório: ${formatDate(analysis.date)} | Horário trabalhado: ${analysis.schedule}`);
  lines.push(`Responsabilidade das ações: equipe ${analysis.responsibleCrew} | ${formatDate(analysis.responsibleDate)} | ${analysis.responsibleSchedule}`);
  lines.push(`Recebido em: ${new Date(analysis.receivedAt).toLocaleString('pt-BR')}`);
  lines.push(`Líder da produção que entregou: ${analysis.productionLeader}`);
  lines.push(`Líder da produção que está entrando: ${findProductionResponsible(analysis.responsibleCrew)}`);
  lines.push(`Líder da manutenção que está entrando: ${findMaintenanceResponsible(analysis.responsibleDate, analysis.responsibleShift, analysis.responsibleCrew)}`);
  if (analysis.realized) lines.push(`Produção realizada: ${formatNumber(analysis.realized)} unidades.`);
  if (analysis.plan) lines.push(`Plano: ${formatNumber(analysis.plan)} unidades | Atingimento: ${analysis.attainment}% | Diferença: ${formatNumber(analysis.gap)} unidades.`);
  if (analysis.reportedOee) lines.push(`OEE informado: ${analysis.reportedOee}% | Meta: ${analysis.targetOee}%.`);
  lines.push(`Retrabalho: ${analysis.reworkCount || 0} | Presentes: ${analysis.present || 'não informado'} | Faltas: ${analysis.absenceCount} | Hora extra: ${analysis.overtimeCount}.`);
  lines.push(`Máquinas com ocorrência: ${analysis.machines.length} | Tempo somado registrado: ${formatMinutes(analysis.totalRecordedMinutes)}.`);
  if (analysis.sgmanSummary) lines.push(`SGMan: ${sgmanDailySummaryText(analysis.sgmanSummary)}.`);
  if (analysis.reliability3Days) lines.push(`Confiabilidade: ${reliabilitySummaryText(analysis.reliability3Days)}.`);
  lines.push(`Ações separadas: ${maintenanceActions.length} para manutenção e ${productionActions.length} para produção.`);
  if (analysis.laborShortageMachines.length) lines.push(`Sem mão de obra: ${analysis.laborShortageMachines.join(', ')}.`);
  const criticalMaintenance = maintenanceActions.filter(a => a.priority === 'Alta');
  if (criticalMaintenance.length) lines.push(`Prioridades da manutenção: ${criticalMaintenance.map(a => `${a.machine} - ${a.description}`).join(' | ')}`);
  return lines.join('\n');
}

function firstSentence(text = '') {
  const value = String(text).trim();
  const index = value.indexOf('. ');
  return index >= 0 ? value.slice(0, index + 1) : value;
}

function uniqueMachines(actions, category) {
  return [...new Set(actions.filter(action => action.categories?.includes(category) && /^MK-/.test(action.machine)).map(action => action.machine))];
}

function maintenanceMessage() {
  if (!state.analysis) return '';
  const approved = state.actions
    .filter(a => a.approved && a.department === 'maintenance' && a.status !== 'Concluída')
    .sort((a, b) => (({ Alta: 0, Média: 1, Baixa: 2 })[a.priority] - ({ Alta: 0, Média: 1, Baixa: 2 })[b.priority]) || b.recordedMinutes - a.recordedMinutes);
  const shown = approved.slice(0, 5);
  const lowOee = state.analysis.lowOeeMachines || [];
  const recurrence = deriveRecurrenceMachines(state.analysis);
  const lines = ['*AÇÕES DA MANUTENÇÃO*'];

  if (state.analysis.reportedOee) lines.push(`OEE do turno: ${String(state.analysis.reportedOee).replace('.', ',')}%.`);
  if (state.analysis.sgmanSummary) lines.push(`SGMan: ${sgmanDailySummaryText(state.analysis.sgmanSummary)}.`);
  if (state.analysis.reliability3Days) lines.push(`SGMan 3 dias — MTTR: ${formatReliabilityTime(state.analysis.reliability3Days.mttrMinutes)} | MTTF: ${formatReliabilityTime(state.analysis.reliability3Days.mttfMinutes)} | MTBF: ${formatReliabilityTime(state.analysis.reliability3Days.mtbfMinutes)} | Confiabilidade 12h: ${formatReliabilityPercent(state.analysis.reliability3Days.reliabilityPercent)}.`);
  if (state.analysis.boardScope?.label) lines.push(`Quadro OEE: ${state.analysis.boardScope.label}.`);
  const dashboard = getRecentOeeDashboard();
  if (dashboard.companyAverage != null) lines.push(`OEE geral 3 dias: ${formatOee(dashboard.companyAverage)}.`);

  if (!shown.length) {
    lines.push('Sem ação técnica pendente.');
  } else {
    shown.forEach((action, index) => {
      lines.push(`${index + 1}. *${action.machine}* — ${action.sgmanSuggestedResolution || suggestedResolutionFromHistory(action)}`);
    });
  }

  if (lowOee.length) lines.push(`OEE abaixo de 65: ${oeeLowListText(lowOee)}.`);
  if (recurrence.length) lines.push(`Reincidência: ${recurrence.join(', ')}.`);
  const priority3Days = dashboardPriorityText(4);
  if (priority3Days) lines.push(`Prioridades 3 dias: ${priority3Days}.`);
  lines.push('*Resolver durante o turno.*');
  lines.push('*SGMan:* apontar OS, causa e conclusão.');
  return lines.join('\n');
}

function productionMessage() {
  if (!state.analysis) return '';
  const analysis = state.analysis;
  const approved = state.actions.filter(a => a.approved && a.department === 'production' && a.status !== 'Concluída');
  const responsible = findProductionResponsible(analysis.responsibleCrew);
  const labor = approved.find(action => action.machine === 'MÃO DE OBRA');
  const paperMachines = uniqueMachines(approved, 'paper-handling');
  const qualityMachines = [...new Set([
    ...uniqueMachines(approved, 'production-quality'),
    ...uniqueMachines(approved, 'production-review')
  ])];
  const setupMachines = uniqueMachines(approved, 'production-setup');
  const lowOee = analysis.lowOeeMachines || [];
  const lines = [`*AÇÕES DA PRODUÇÃO — ${responsible}*`];

  if (analysis.reportedOee) lines.push(`OEE do turno: ${String(analysis.reportedOee).replace('.', ',')}%.`);
  if (analysis.sgmanSummary) lines.push(`SGMan: ${sgmanDailySummaryText(analysis.sgmanSummary)}.`);
  if (analysis.reliability3Days) lines.push(`SGMan 3 dias — MTTR: ${formatReliabilityTime(analysis.reliability3Days.mttrMinutes)} | MTTF: ${formatReliabilityTime(analysis.reliability3Days.mttfMinutes)} | MTBF: ${formatReliabilityTime(analysis.reliability3Days.mtbfMinutes)} | Confiabilidade 12h: ${formatReliabilityPercent(analysis.reliability3Days.reliabilityPercent)}.`);
  if (analysis.boardScope?.label) lines.push(`Quadro OEE: ${analysis.boardScope.label}.`);
  const dashboard3Days = getRecentOeeDashboard();
  if (dashboard3Days.companyAverage != null) lines.push(`OEE geral 3 dias: ${formatOee(dashboard3Days.companyAverage)}.`);
  if (analysis.reworkCount > 0) lines.push(`Retrabalho: ${analysis.reworkCount}.`);

  let step = 1;
  if (lowOee.length) lines.push(`${step++}. Priorizar as máquinas com OEE abaixo de 65: ${oeeLowListText(lowOee)}.`);
  if (labor) lines.push(`${step++}. Redistribuir mão de obra: ${analysis.laborShortageMachines.join(', ')}.`);
  if (paperMachines.length) lines.push(`${step++}. Corrigir passagem de papel e bobinas: ${paperMachines.join(', ')}.`);
  if (qualityMachines.length) lines.push(`${step++}. Fazer autocontrole e conter defeito: ${qualityMachines.join(', ')}.`);
  if (setupMachines.length) lines.push(`${step++}. Conferir setup e molde: ${setupMachines.join(', ')}.`);
  if (step === 1) lines.push('1. Recuperar OEE e reduzir retrabalho.');
  lines.push(`${step}. Defeito técnico: abrir solicitação no *SGMan* antes de chamar a manutenção.`);
  lines.push('*Resolver durante o turno.*');
  return lines.join('\n');
}

function formatDate(date) {
  if (!date) return '-';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

function renderAnalysis() {
  const analysis = state.analysis;
  $('emptyAnalysis').classList.toggle('hidden', !!analysis);
  $('analysisContent').classList.toggle('hidden', !analysis);
  if (!analysis) return;

  $('analysisTitle').textContent = `Relatório ${analysis.crew} → ações ${analysis.responsibleCrew}`;
  const metrics = [
    ['Relatório entregue', analysis.crew || '-', `${formatDate(analysis.date)} • ${analysis.schedule || '-'}`],
    ['Responsabilidade', analysis.responsibleCrew || '-', `${formatDate(analysis.responsibleDate)} • ${analysis.responsibleSchedule || '-'}`],
    ['Produção', analysis.realized ? formatNumber(analysis.realized) : '-', analysis.plan ? `Plano ${formatNumber(analysis.plan)}` : 'Plano não identificado'],
    ['Quadro OEE', analysis.boardScope?.label || '-', 'Últimas 12 horas'],
    ['OEE informado', analysis.reportedOee ? `${analysis.reportedOee}%` : '-', `Meta ${analysis.targetOee}%`],
    ['Atingimento', analysis.attainment != null ? `${analysis.attainment}%` : '-', analysis.gap != null ? `${formatNumber(analysis.gap)} abaixo do plano` : 'Sem comparação'],
    ['Faltas', analysis.absenceCount, analysis.absences.join(', ') || 'Sem nomes identificados'],
    ['Presentes', analysis.present || '-', 'Incluindo liderança, conforme relatório'],
    ['Retrabalho', analysis.reworkCount || 0, 'Foco em reduzir repetição e perdas'],
    ['OS concluídas', analysis.sgmanSummary?.hasCompletionDates ? Number(analysis.sgmanSummary.completedToday || 0) : Number(analysis.sgmanSummary?.completedPeriod || 0), analysis.sgmanSummary?.hasCompletionDates ? 'Concluídas hoje no SGMan' : 'Concluídas no período consultado'],
    ['OS em atraso', Number(analysis.sgmanSummary?.overdue || 0), 'Pendências atuais no SGMan'],
    ['MTTR SGMan', formatReliabilityTime(analysis.reliability3Days?.mttrMinutes), `${Number(analysis.reliability3Days?.repairIntervals || 0)} reparo(s) válido(s)`],
    ['MTTF SGMan', formatReliabilityTime(analysis.reliability3Days?.mttfMinutes), `${Number(analysis.reliability3Days?.uptimeIntervals || 0)} intervalo(s) até nova falha`],
    ['MTBF SGMan', formatReliabilityTime(analysis.reliability3Days?.mtbfMinutes), `${Number(analysis.reliability3Days?.failureIntervals || 0)} intervalo(s) entre falhas`],
    ['Confiabilidade 12h', formatReliabilityPercent(analysis.reliability3Days?.reliabilityPercent), 'Estimativa baseada somente no MTBF do SGMan'],
    ['Máquinas', analysis.machines.length, 'Com registros no relatório'],
    ['Tempo somado', formatMinutes(analysis.totalRecordedMinutes), 'Ocorrências podem ser simultâneas'],
    ['Manutenção', state.actions.filter(a => a.department === 'maintenance').length, `${state.actions.filter(a => a.department === 'maintenance' && a.priority === 'Alta').length} de prioridade alta`],
    ['Produção', state.actions.filter(a => a.department === 'production').length, `${state.actions.filter(a => a.department === 'production' && a.priority === 'Alta').length} de prioridade alta`]
  ];
  $('summaryCards').innerHTML = metrics.map(([label, value, note]) => `<div class="metric"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(String(note))}</small></div>`).join('');

  const notes = [];
  if (analysis.trainingCount === 0 && analysis.trainingPeople.length) notes.push(`<li><strong>Divergência:</strong> treinamento informado como zero, mas há ${analysis.trainingPeople.length} nomes relacionados.</li>`);
  if (analysis.plan && analysis.attainment != null && analysis.reportedOee && Math.abs(analysis.attainment - analysis.reportedOee) > 5) notes.push(`<li><strong>Conferência:</strong> o volume representa ${analysis.attainment}% do plano, enquanto o OEE informado foi ${analysis.reportedOee}%.</li>`);
  if (analysis.laborShortageMachines.length) notes.push(`<li><strong>Mão de obra:</strong> ${analysis.laborShortageMachines.length} máquinas registradas sem operador.</li>`);
  notes.push(`<li><strong>Passagem de turno:</strong> o relatório permanece vinculado à equipe ${escapeHtml(analysis.crew)} que entregou. As ações ficam sob responsabilidade da equipe ${escapeHtml(analysis.responsibleCrew)} que está entrando.</li>`);
  notes.push(`<li><strong>Foto do quadro:</strong> considerar somente a coluna ${escapeHtml(analysis.boardScope?.label || '-')} referente às últimas 12 horas.</li>`);
  if (analysis.lowOeeMachines?.length) notes.push(`<li><strong>OEE do quadro:</strong> ${escapeHtml(oeeLowListText(analysis.lowOeeMachines, 10))}.</li>`);
  if (analysis.sgmanSummary) notes.push(`<li><strong>SGMan:</strong> ${escapeHtml(sgmanDailySummaryText(analysis.sgmanSummary))}.</li>`);
  if (analysis.reliability3Days) notes.push(`<li><strong>Confiabilidade 3 dias:</strong> ${escapeHtml(reliabilitySummaryText(analysis.reliability3Days))}.</li>`);
  notes.push(`<li><strong>Separação:</strong> falhas técnicas seguem para manutenção. Passagem de papel, bobinas, limpeza, mão de obra, treinamento e autocontrole seguem para a produção.</li>`);
  if (analysis.scheduleMismatch) notes.push(`<li><strong>Conferência de escala:</strong> o texto informa ${escapeHtml(analysis.expectedCrew)}, mas pelo horário e pela escala automática foi identificado ${escapeHtml(analysis.crew)}.</li>`);
  if (analysis.reportedShift && analysis.reportedShift !== analysis.shift) notes.push(`<li><strong>Turno do relatório:</strong> o texto informa ${escapeHtml(analysis.reportedShift)}º turno. Para a escala 12x36, o aplicativo classificou como equipe ${escapeHtml(analysis.crew)} (${escapeHtml(analysis.schedule)}).</li>`);

  $('managementSummary').innerHTML = `
    <p><strong>${escapeHtml(analysis.productionLeader)}</strong> registrou ${formatNumber(analysis.realized)} unidades no turno. O resultado atingiu <strong>${analysis.attainment ?? '-'}%</strong> do plano informado.</p>
    <p>Foram identificadas <strong>${analysis.machines.length} máquinas</strong> com apontamentos e uma soma de <strong>${formatMinutes(analysis.totalRecordedMinutes)}</strong> em tempos registrados. Essa soma não representa necessariamente parada total do setor, pois as máquinas podem ter parado ao mesmo tempo.</p>
    ${notes.length ? `<ul>${notes.join('')}</ul>` : '<p>Nenhuma divergência principal foi identificada nos campos gerais.</p>'}
    ${analysis.oeeOcrText ? `<p><strong>Foto do quadro de OEE:</strong> utilizada na análise conjunta.</p>` : ''}
  `;

  const rows = analysis.machines
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .map(machine => `<tr>
      <td><strong>${escapeHtml(machine.code)}</strong></td>
      <td>${escapeHtml(formatMinutes(machine.totalMinutes))}</td>
      <td>${machine.incidents.map(i => escapeHtml(i.description)).join('<br>')}</td>
      <td>${state.actions.filter(a => a.machine === machine.code).map(a => `<span class="badge ${priorityClass(a.priority)}">${a.department === 'maintenance' ? 'MANUT.' : 'PROD.'} ${a.priority}</span>`).join(' ') || '<span class="muted">Rotina/sem ação</span>'}</td>
    </tr>`).join('');
  $('machineTableWrap').innerHTML = `<table><thead><tr><th>Máquina</th><th>Tempo</th><th>Apontamentos</th><th>Classificação</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function priorityClass(priority) {
  return priority === 'Alta' ? 'high' : priority === 'Média' ? 'medium' : 'low';
}

function actionCardsHtml(actions) {
  if (!actions.length) return '<div class="empty-state compact-empty"><p>Nenhuma ação identificada para este relatório.</p></div>';
  return actions.map(action => `
    <div class="action-card" data-action-id="${action.id}">
      <div class="action-top">
        <input class="action-approved" type="checkbox" ${action.approved ? 'checked' : ''} aria-label="Aprovar ação" />
        <div class="action-body">
          <div class="action-title">
            <strong>${escapeHtml(action.machine)}</strong>
            <span class="badge ${priorityClass(action.priority)}">${escapeHtml(action.priority)}</span>
            <span class="badge type">${escapeHtml(action.type)}</span>
            ${action.recordedMinutes ? `<span class="muted">${formatMinutes(action.recordedMinutes)}</span>` : ''}
          </div>
          <div class="muted">${escapeHtml(action.description)}</div>
          <textarea class="action-text" aria-label="Ação recomendada">${escapeHtml(action.action)}</textarea>
          <div class="action-meta">
            <label>Prioridade
              <select class="action-priority">
                ${['Alta','Média','Baixa'].map(v => `<option ${v === action.priority ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </label>
            <label>Responsável
              <input class="action-responsible" value="${escapeHtml(action.responsible)}" />
            </label>
            <label>Status
              <select class="action-status">
                ${['Pendente','Em andamento','Concluída','Bloqueada'].map(v => `<option ${v === (action.status || 'Pendente') ? 'selected' : ''}>${v}</option>`).join('')}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function bindActionCards() {
  $$('.action-card').forEach(card => {
    const action = state.actions.find(a => a.id === card.dataset.actionId);
    if (!action) return;
    card.querySelector('.action-approved').addEventListener('change', e => action.approved = e.target.checked);
    card.querySelector('.action-text').addEventListener('input', e => action.action = e.target.value);
    card.querySelector('.action-priority').addEventListener('change', e => {
      action.priority = e.target.value;
      renderActions();
      renderAnalysis();
    });
    card.querySelector('.action-responsible').addEventListener('input', e => action.responsible = e.target.value);
    card.querySelector('.action-status').addEventListener('change', e => action.status = e.target.value);
  });
}

function renderActions() {
  const has = !!state.analysis;
  $('emptyActions').classList.toggle('hidden', has);
  $('actionsContent').classList.toggle('hidden', !has);
  if (!has) return;

  const maintenanceResponsible = findMaintenanceResponsible(
    state.analysis.responsibleDate,
    state.analysis.responsibleShift,
    state.analysis.responsibleCrew
  );
  const productionResponsible = findProductionResponsible(state.analysis.responsibleCrew);

  $('responsibleBadge').textContent = maintenanceResponsible;
  $('productionResponsibleBadge').textContent = productionResponsible;

  $('maintenanceActionsList').innerHTML = messageHtml(maintenanceMessage());
  $('productionActionsList').innerHTML = messageHtml(productionMessage());
}

function fillScaleForm(crew) {
  const item = getScaleRecord(crew);
  const mechanics = item.sgmanMechanics || [];

  $('scaleCrew').value = crew;
  $('scaleMaintenanceLeader').value = item.maintenanceLeader || '';
  $('scaleSgmanExecutante').value = item.sgmanExecutante || '';

  populateSgmanUserSelect('scaleSgmanMechanic1', mechanics[0] || '');
  populateSgmanUserSelect('scaleSgmanMechanic2', mechanics[1] || '');
  populateSgmanUserSelect('scaleSgmanMechanic3', mechanics[2] || '');

  $('scaleProductionLeader').value =
    item.productionLeader ||
    DEFAULT_PRODUCTION_LEADERS[crew] ||
    '';

  $('scaleTeam').value = item.team || '';
}

function renderScale() {
  const crews = ['A1', 'A2', 'B1', 'B2'];
  const savedCrews = new Set(getScale().map(item => item.crew));
  const items = crews.map(getScaleRecord);
  $('scaleList').innerHTML = items.map(item => `
    <div class="list-item">
      <div>
        <h3>Equipe ${escapeHtml(item.crew)}</h3>
        <p><strong>Manutenção:</strong> ${escapeHtml(item.maintenanceLeader || 'não definido')}${item.team ? ` — ${escapeHtml(item.team)}` : ''}</p>
        <p><strong>Líder SGMan:</strong> ${escapeHtml(sgmanUserLabel(item.sgmanExecutante) || 'não definido')}</p>
        <p><strong>Mecânicos SGMan:</strong> ${
          item.sgmanMechanics?.length
            ? item.sgmanMechanics.map(user => escapeHtml(sgmanUserLabel(user))).join(' • ')
            : 'não definidos'
        }</p>
        <p><strong>Distribuição:</strong> rodízio entre ${1 + Number(item.sgmanMechanics?.length || 0)} executante(s)</p>
        <p><strong>Produção:</strong> ${escapeHtml(item.productionLeader || 'não definido')}</p>
      </div>
      <div class="list-actions">
        <button class="ghost edit-scale" data-crew="${item.crew}">Editar</button>
        ${savedCrews.has(item.crew) ? `<button class="danger delete-scale" data-crew="${item.crew}">Restaurar</button>` : ''}
      </div>
    </div>
  `).join('');

  $$('.delete-scale').forEach(btn => btn.addEventListener('click', () => {
    saveScale(getScale().filter(item => item.crew !== btn.dataset.crew));
    fillScaleForm(btn.dataset.crew);
    renderScale();
    showToast('Equipe restaurada para o padrão.');
  }));

  $$('.edit-scale').forEach(btn => btn.addEventListener('click', () => {
    fillScaleForm(btn.dataset.crew);
    switchView('escala');
  }));
}

function renderHistory() {
  const history = getHistory();
  $('historyList').innerHTML = history.length ? history.map(item => `
    <div class="list-item">
      <div>
        <h3>${formatDate(item.date)} • Relatório ${escapeHtml(item.crew || String(item.shift))} → ações ${escapeHtml(item.responsibleCrew || '-')}</h3>
        <p>${formatNumber(item.realized)} unidades | OEE ${item.reportedOee || '-'}% | ${item.actions?.length || 0} ações</p>
      </div>
      <div class="list-actions">
        <button class="secondary open-history" data-id="${item.id}">Abrir</button>
        <button class="danger delete-history" data-id="${item.id}">Excluir</button>
      </div>
    </div>
  `).join('') : '<div class="empty-state"><h2>Sem histórico</h2><p>As análises salvas aparecerão aqui.</p></div>';

  $$('.open-history').forEach(btn => btn.addEventListener('click', () => {
    const item = getHistory().find(row => row.id === btn.dataset.id);
    if (!item) return;
    state.analysis = item.analysis;
    state.actions = item.actions || [];
    renderAnalysis();
    renderActions();
    renderOeeDashboard();
    switchView('analise');
  }));
  $$('.delete-history').forEach(btn => btn.addEventListener('click', () => {
    saveHistory(getHistory().filter(item => item.id !== btn.dataset.id));
    renderHistory();
    showToast('Relatório excluído.');
  }));
}

function buildSgmanPayload() {
  return buildSgmanOrders().orders;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


function parseSgmanTagMap(text = '') {
  const map = {};

  String(text)
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .forEach(line => {
      const hasMapping = line.includes('=');
      const parts = hasMapping ? line.split('=') : [line, line];

      const machineRaw = parts.shift().trim();
      const tag = parts.join('=').trim();
      const digits = machineRaw.match(/\d{1,3}/)?.[0];

      if (!digits || !tag) return;

      const machine = `MK-${String(Number(digits)).padStart(2, '0')}`;
      map[machine] = tag;
    });

  return map;
}

function stringifySgmanTagMap(map = {}) {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map(([machine, tag]) => `${machine}=${tag}`)
    .join('\n');
}

function formatSgmanDateTime(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}


function machineKeyFromText(value = '') {
  const digits = String(value).match(/(?:mk\s*[-:]?\s*)?(\d{1,3})/i)?.[1];
  return digits ? `MK-${String(Number(digits)).padStart(2, '0')}` : '';
}

function getCachedSgmanHistory() {
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE.sgmanHistory)) || null;
    if (cached?.orders && cached?.summary) return cached;
  } catch {}
  return state.sgmanHistory;
}

function saveSgmanHistory(history) {
  state.sgmanHistory = history;
  localStorage.setItem(STORAGE.sgmanHistory, JSON.stringify(history));
}

function sgmanDailySummaryText(summary = state.sgmanHistory?.summary || {}) {
  const completedLabel = summary.hasCompletionDates
    ? `Concluídas hoje: ${Number(summary.completedToday || 0)}`
    : `Concluídas no período: ${Number(summary.completedPeriod || 0)}`;

  return `${completedLabel} | Em atraso: ${Number(summary.overdue || 0)} | Abertas: ${Number(summary.open || 0)}`;
}


function parseSgmanDateTime(value = '') {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(value || '').trim();
  if (!text) return null;

  const iso = text.match(
    /(\d{4})[-/](\d{2})[-/](\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (iso) {
    const date = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4] || 0),
      Number(iso[5] || 0),
      Number(iso[6] || 0)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const brazilian = text.match(
    /(\d{2})\/(\d{2})\/(\d{4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );

  if (brazilian) {
    const date = new Date(
      Number(brazilian[3]),
      Number(brazilian[2]) - 1,
      Number(brazilian[1]),
      Number(brazilian[4] || 0),
      Number(brazilian[5] || 0),
      Number(brazilian[6] || 0)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const nativeDate = new Date(text);
  return Number.isNaN(nativeDate.getTime()) ? null : nativeDate;
}

function parseDurationMinutes(value = '') {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    // A API costuma retornar minutos em campos numéricos de duração.
    return value >= 0 && value <= 10080 ? value : null;
  }

  const text = String(value).trim();
  if (!text) return null;

  const clock = text.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = Number(clock[3] || 0);
    return hours * 60 + minutes + seconds / 60;
  }

  const hoursText = text.match(/(\d+(?:[.,]\d+)?)\s*h/i);
  const minutesText = text.match(/(\d+(?:[.,]\d+)?)\s*min/i);

  if (hoursText || minutesText) {
    const hours = hoursText
      ? Number(hoursText[1].replace(',', '.'))
      : 0;
    const minutes = minutesText
      ? Number(minutesText[1].replace(',', '.'))
      : 0;
    const total = hours * 60 + minutes;
    return Number.isFinite(total) ? total : null;
  }

  const numeric = Number(text.replace(',', '.'));
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 10080
    ? numeric
    : null;
}

function averageNumbers(values = []) {
  const valid = values
    .map(Number)
    .filter(value => Number.isFinite(value));

  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function formatReliabilityTime(minutes, emptyText = 'Dados insuficientes') {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) return emptyText;

  if (value < 60) return `${Math.round(value)} min`;

  const hours = Math.floor(value / 60);
  const remainingMinutes = Math.round(value % 60);

  return remainingMinutes
    ? `${hours}h ${String(remainingMinutes).padStart(2, '0')}min`
    : `${hours}h`;
}

function isCorrectiveSgmanOrder(order = {}) {
  const maintenanceType = normalizeKey(order.typeMaintenance || '');
  const text = normalizeKey(
    `${order.description || ''} ${order.comment || ''} ${order.solution || ''}`
  );

  if (maintenanceType) {
    return maintenanceType.includes('corretiva');
  }

  if (
    /preventiva|melhoria|programacao|qualidade|seguranca|teste|troca de molde|troca de altura|rotina lider/.test(text)
  ) {
    return false;
  }

  return Boolean(
    machineKeyFromText(
      `${order.machine || ''} ${order.tag || ''} ${order.description || ''}`
    )
  );
}

function orderMachineForReliability(order = {}) {
  return (
    machineKeyFromText(order.machine || '') ||
    machineKeyFromText(order.tag || '') ||
    machineKeyFromText(order.description || '') ||
    ''
  );
}

function repairDurationInsideWindow(order, cutoff, now) {
  const start = parseSgmanDateTime(order.startDate);
  const end = parseSgmanDateTime(order.endDate);

  if (start && end && end > start) {
    const overlapStart = new Date(Math.max(start.getTime(), cutoff.getTime()));
    const overlapEnd = new Date(Math.min(end.getTime(), now.getTime()));

    if (overlapEnd > overlapStart) {
      const minutes = (overlapEnd - overlapStart) / 60000;
      if (minutes > 0 && minutes <= 72 * 60) return minutes;
    }
  }

  const fallback = parseDurationMinutes(order.duration);
  return fallback !== null && fallback <= 72 * 60 ? fallback : null;
}

function validIntervalMinutes(start, end, maximumMinutes = 72 * 60) {
  if (!(start instanceof Date) || !(end instanceof Date)) return null;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= start) return null;

  const minutes = (end.getTime() - start.getTime()) / 60000;

  return minutes > 0 && minutes <= maximumMinutes
    ? minutes
    : null;
}

function sgmanRepairDuration(order) {
  const start = parseSgmanDateTime(order.startDate);
  const end = parseSgmanDateTime(order.endDate);

  const dateDuration = validIntervalMinutes(start, end);
  if (dateDuration !== null) return dateDuration;

  const duration = parseDurationMinutes(order.duration);
  return duration !== null && duration > 0 && duration <= 72 * 60
    ? duration
    : null;
}

function reliabilityPercentForMission(mtbfMinutes, missionHours = 12) {
  const mtbf = Number(mtbfMinutes);
  const missionMinutes = Number(missionHours) * 60;

  if (!Number.isFinite(mtbf) || mtbf <= 0) return null;
  if (!Number.isFinite(missionMinutes) || missionMinutes <= 0) return null;

  return Math.exp(-missionMinutes / mtbf) * 100;
}

function formatReliabilityPercent(value, emptyText = 'Dados insuficientes') {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0 || number > 100) {
    return emptyText;
  }

  return `${number.toFixed(1).replace('.', ',')}%`;
}

function calculateMachineSgmanMetrics(machine, orders) {
  const sortedOrders = [...orders]
    .filter(order => order.reliabilityStart)
    .sort((a, b) =>
      a.reliabilityStart.getTime() - b.reliabilityStart.getTime()
    );

  const repairDurations = [];
  const uptimeIntervals = [];
  const failureIntervals = [];

  for (const order of sortedOrders) {
    if (order.statusKey !== 'completed') continue;

    const duration = sgmanRepairDuration(order);
    if (duration !== null) repairDurations.push(duration);
  }

  for (let index = 1; index < sortedOrders.length; index++) {
    const previous = sortedOrders[index - 1];
    const current = sortedOrders[index];

    const failureInterval = validIntervalMinutes(
      previous.reliabilityStart,
      current.reliabilityStart
    );

    if (failureInterval !== null) {
      failureIntervals.push(failureInterval);
    }

    if (
      previous.statusKey === 'completed' &&
      previous.reliabilityEnd
    ) {
      const uptime = validIntervalMinutes(
        previous.reliabilityEnd,
        current.reliabilityStart
      );

      if (uptime !== null) uptimeIntervals.push(uptime);
    }
  }

  const mttrMinutes = averageNumbers(repairDurations);
  const mttfMinutes = averageNumbers(uptimeIntervals);
  const mtbfMinutes = averageNumbers(failureIntervals);
  const reliabilityPercent = reliabilityPercentForMission(mtbfMinutes, 12);

  return {
    machine,
    failureCount: sortedOrders.length,
    completedRepairs: repairDurations.length,
    repairIntervals: repairDurations.length,
    uptimeIntervals: uptimeIntervals.length,
    failureIntervals: failureIntervals.length,
    mttrMinutes,
    mttfMinutes,
    mtbfMinutes,
    reliabilityPercent,
    recurrent: sortedOrders.length >= 2
  };
}

function calculateReliability3Days() {
  const now = new Date();
  const periodMinutes = 72 * 60;
  const cutoff = new Date(now.getTime() - periodMinutes * 60000);

  // Fonte única: ordens retornadas pelo endpoint /os/listar do SGMan.
  const correctiveOrders = (state.sgmanHistory?.orders || [])
    .filter(isCorrectiveSgmanOrder)
    .map(order => ({
      ...order,
      reliabilityMachine: orderMachineForReliability(order),
      reliabilityStart: parseSgmanDateTime(order.startDate),
      reliabilityEnd: parseSgmanDateTime(order.endDate)
    }))
    .filter(order =>
      order.reliabilityMachine &&
      order.reliabilityStart &&
      order.reliabilityStart >= cutoff &&
      order.reliabilityStart <= now
    );

  const machineMap = new Map();

  for (const order of correctiveOrders) {
    if (!machineMap.has(order.reliabilityMachine)) {
      machineMap.set(order.reliabilityMachine, []);
    }

    machineMap.get(order.reliabilityMachine).push(order);
  }

  const rows = [...machineMap.entries()]
    .map(([machine, orders]) =>
      calculateMachineSgmanMetrics(machine, orders)
    )
    .sort((a, b) =>
      b.failureCount - a.failureCount ||
      (a.mtbfMinutes ?? Number.POSITIVE_INFINITY) -
        (b.mtbfMinutes ?? Number.POSITIVE_INFINITY) ||
      a.machine.localeCompare(b.machine, 'pt-BR', { numeric: true })
    );

  const allRepairDurations = [];
  const allUptimeIntervals = [];
  const allFailureIntervals = [];

  for (const [machine, orders] of machineMap.entries()) {
    const sortedOrders = [...orders]
      .filter(order => order.reliabilityStart)
      .sort((a, b) =>
        a.reliabilityStart.getTime() - b.reliabilityStart.getTime()
      );

    for (const order of sortedOrders) {
      if (order.statusKey !== 'completed') continue;

      const duration = sgmanRepairDuration(order);
      if (duration !== null) allRepairDurations.push(duration);
    }

    for (let index = 1; index < sortedOrders.length; index++) {
      const previous = sortedOrders[index - 1];
      const current = sortedOrders[index];

      const failureInterval = validIntervalMinutes(
        previous.reliabilityStart,
        current.reliabilityStart
      );

      if (failureInterval !== null) {
        allFailureIntervals.push(failureInterval);
      }

      if (
        previous.statusKey === 'completed' &&
        previous.reliabilityEnd
      ) {
        const uptime = validIntervalMinutes(
          previous.reliabilityEnd,
          current.reliabilityStart
        );

        if (uptime !== null) allUptimeIntervals.push(uptime);
      }
    }
  }

  const mttrMinutes = averageNumbers(allRepairDurations);
  const mttfMinutes = averageNumbers(allUptimeIntervals);
  const mtbfMinutes = averageNumbers(allFailureIntervals);
  const reliabilityPercent = reliabilityPercentForMission(mtbfMinutes, 12);

  const failureCount = correctiveOrders.length;
  const recurrentMachines = rows.filter(row => row.recurrent).length;

  let note;

  if (!failureCount) {
    note = 'Nenhuma OS corretiva com data de início foi encontrada no SGMan nas últimas 72 horas.';
  } else {
    const missing = [];

    if (mttrMinutes === null) {
      missing.push('MTTR: faltam OS concluídas com início, fim ou duração válida');
    }

    if (mttfMinutes === null) {
      missing.push('MTTF: é necessário ter uma conclusão e uma falha posterior na mesma máquina');
    }

    if (mtbfMinutes === null) {
      missing.push('MTBF: são necessárias pelo menos duas falhas na mesma máquina');
    }

    if (missing.length) {
      note = `${missing.join('. ')}.`;
    } else {
      note = 'Todos os indicadores foram calculados somente com horários e ordens corretivas retornados pelo SGMan.';
    }
  }

  return {
    periodHours: 72,
    missionHours: 12,
    mttrMinutes,
    mttfMinutes,
    mtbfMinutes,
    reliabilityPercent,
    reliabilityBasis: mtbfMinutes !== null ? 'MTBF do SGMan' : '',
    failureCount,
    completedRepairs: allRepairDurations.length,
    repairIntervals: allRepairDurations.length,
    uptimeIntervals: allUptimeIntervals.length,
    failureIntervals: allFailureIntervals.length,
    recurrentMachines,
    rows,
    note
  };
}

function reliabilitySummaryText(metrics = state.reliability3Days) {
  return [
    `MTTR SGMan: ${formatReliabilityTime(metrics?.mttrMinutes)}`,
    `MTTF SGMan: ${formatReliabilityTime(metrics?.mttfMinutes)}`,
    `MTBF SGMan: ${formatReliabilityTime(metrics?.mtbfMinutes)}`,
    `Confiabilidade 12h: ${formatReliabilityPercent(metrics?.reliabilityPercent)}`,
    `Falhas: ${Number(metrics?.failureCount || 0)}`
  ].join(' | ');
}

function renderReliability3Days() {
  const metrics = calculateReliability3Days();
  state.reliability3Days = metrics;

  const cards = $('reliabilityCards');
  const table = $('reliabilityTable');
  const note = $('reliabilityNote');

  if (cards) {
    cards.innerHTML = `
      <div class="metric">
        <span>MTTR SGMan — 3 dias</span>
        <strong>${escapeHtml(formatReliabilityTime(metrics.mttrMinutes))}</strong>
        <small>${metrics.repairIntervals} intervalo(s) de reparo válido(s)</small>
      </div>
      <div class="metric">
        <span>MTTF SGMan — 3 dias</span>
        <strong>${escapeHtml(formatReliabilityTime(metrics.mttfMinutes))}</strong>
        <small>${metrics.uptimeIntervals} intervalo(s) entre reparo e nova falha</small>
      </div>
      <div class="metric">
        <span>MTBF SGMan — 3 dias</span>
        <strong>${escapeHtml(formatReliabilityTime(metrics.mtbfMinutes))}</strong>
        <small>${metrics.failureIntervals} intervalo(s) entre falhas</small>
      </div>
      <div class="metric">
        <span>Confiabilidade — próximo turno</span>
        <strong>${escapeHtml(formatReliabilityPercent(metrics.reliabilityPercent))}</strong>
        <small>Probabilidade estimada de operar 12h sem falha, baseada no MTBF do SGMan</small>
      </div>
      <div class="metric">
        <span>Falhas corretivas</span>
        <strong>${metrics.failureCount}</strong>
        <small>${metrics.rows.length} máquina(s) com OS corretiva</small>
      </div>
      <div class="metric">
        <span>Reincidência</span>
        <strong>${metrics.recurrentMachines}</strong>
        <small>Máquinas com duas ou mais falhas no SGMan</small>
      </div>`;
  }

  if (note) {
    note.textContent = metrics.note;
  }

  if (table) {
    if (!metrics.rows.length) {
      table.innerHTML =
        '<p class="muted">O SGMan ainda não possui dados corretivos suficientes nas últimas 72 horas.</p>';
    } else {
      table.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Máquina</th>
              <th>Falhas</th>
              <th>MTTR</th>
              <th>MTTF</th>
              <th>MTBF</th>
              <th>Confiabilidade 12h</th>
            </tr>
          </thead>
          <tbody>
            ${metrics.rows.map(row => `
              <tr class="${row.recurrent ? 'reliability-recurrent' : ''}">
                <td>
                  <strong>${escapeHtml(row.machine)}</strong>
                  ${row.recurrent ? '<small>Reincidente</small>' : ''}
                </td>
                <td>${row.failureCount}</td>
                <td>${escapeHtml(formatReliabilityTime(row.mttrMinutes, '-'))}</td>
                <td>${escapeHtml(formatReliabilityTime(row.mttfMinutes, '-'))}</td>
                <td>${escapeHtml(formatReliabilityTime(row.mtbfMinutes, '-'))}</td>
                <td>${escapeHtml(formatReliabilityPercent(row.reliabilityPercent, '-'))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
    }
  }

  if (state.analysis) {
    state.analysis.reliability3Days = { ...metrics };
  }

  return metrics;
}

function renderSgmanDailyStatus() {
  const summary = state.sgmanHistory?.summary || {};
  const cards = $('sgmanDailyCards');
  const detail = $('sgmanHistoryDetail');
  const status = $('sgmanHistoryStatus');

  if (cards) {
    cards.innerHTML = `
      <div class="metric">
        <span>${summary.hasCompletionDates ? 'Concluídas hoje' : 'Concluídas no período'}</span>
        <strong>${summary.hasCompletionDates ? Number(summary.completedToday || 0) : Number(summary.completedPeriod || 0)}</strong>
        <small>Dados consultados no SGMan</small>
      </div>
      <div class="metric">
        <span>Em atraso</span>
        <strong>${Number(summary.overdue || 0)}</strong>
        <small>Ordens que exigem acompanhamento</small>
      </div>
      <div class="metric">
        <span>Abertas</span>
        <strong>${Number(summary.open || 0)}</strong>
        <small>Aguardando execução ou conclusão</small>
      </div>`;
  }

  if (detail) {
    const completed = (state.sgmanHistory?.orders || [])
      .filter(order => order.statusKey === 'completed')
      .slice(0, 5);

    detail.innerHTML = completed.length
      ? `<strong>Últimas OS concluídas usadas como referência:</strong><ul>${
          completed.map(order => `<li>${escapeHtml(order.machine || order.tag || 'Máquina não identificada')} — ${escapeHtml(order.solution || order.description || 'Serviço concluído')}</li>`).join('')
        }</ul>`
      : (() => {
          const diagnostic = state.sgmanHistory?.diagnostic || {};
          const largestArray = Number(diagnostic.largestArrayLength || 0);

          if (largestArray > 0) {
            return `<span class="muted">A API devolveu ${largestArray} item(ns), mas nenhum foi classificado como OS concluída. A V24 mostra o diagnóstico acima para ajuste.</span>`;
          }

          return '<span class="muted">O SGMan não devolveu ordens no período consultado.</span>';
        })();
  }

  if (status) {
    const loaded = state.sgmanHistory?.loadedAt
      ? new Date(state.sgmanHistory.loadedAt).toLocaleString('pt-BR')
      : 'ainda não atualizado';

    const diagnostic = state.sgmanHistory?.diagnostic || {};
    const interpreted = Number(diagnostic.interpretedCount || 0);
    const candidates = Number(diagnostic.candidateCount || 0);
    const largestArray = Number(diagnostic.largestArrayLength || 0);
    const mode = diagnostic.queryMode || '';

    const detailText = diagnostic.queryMode
      ? ` • API: ${largestArray} item(ns) em lista • reconhecidos: ${interpreted} • modo: ${mode}`
      : '';

    status.textContent = `Última consulta: ${loaded}${detailText}`;
  }

  renderReliability3Days();
}

async function refreshSgmanHistory(showMessage = true) {
  if (state.sgmanHistoryLoading) return state.sgmanHistory;

  state.sgmanHistoryLoading = true;
  const button = $('refreshSgmanHistoryBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Atualizando...';
  }

  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 90);

    const response = await fetch('/api/sgman-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data_inicio: formatSgmanDateTime(start),
        data_fim: formatSgmanDateTime(end),
        calc_custos: 1
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Erro HTTP ${response.status}`);
    }

    saveSgmanHistory({
      loadedAt: new Date().toISOString(),
      orders: Array.isArray(data.orders) ? data.orders : [],
      summary: data.summary || {},
      diagnostic: data.diagnostic || {},
      queryStart: data.queryStart || ''
    });
    renderSgmanDailyStatus();

    if (showMessage) showToast('Histórico do SGMan atualizado.');
    return state.sgmanHistory;
  } catch (error) {
    const cached = getCachedSgmanHistory();
    state.sgmanHistory = cached;
    renderSgmanDailyStatus();
    if (showMessage) showToast(`Não foi possível atualizar o SGMan: ${error.message}`);
    return cached;
  } finally {
    state.sgmanHistoryLoading = false;
    if (button) {
      button.disabled = false;
      button.textContent = 'Atualizar SGMan';
    }
  }
}

function completedOrdersForAction(action) {
  const machine = machineKeyFromText(action.machine);
  const tag = normalizeKey(getConfig().sgmanTagMap?.[action.machine] || '');

  return (state.sgmanHistory?.orders || [])
    .filter(order => order.statusKey === 'completed')
    .filter(order => {
      const orderMachine = machineKeyFromText(order.machine || order.tag || order.description);
      const orderTag = normalizeKey(order.tag || '');
      return (machine && orderMachine === machine) || (tag && orderTag === tag);
    })
    .slice(0, 8);
}

function actionableHistorySnippet(text = '') {
  const cleaned = String(text)
    .replace(/problema\s*:/gi, '')
    .replace(/poss[ií]vel resolu[cç][aã]o\s*:/gi, '')
    .replace(/aten[cç][aã]o\s*:/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const sentences = cleaned
    .split(/[.;]\s*/)
    .map(item => item.trim())
    .filter(Boolean);

  const actionable = sentences.find(sentence =>
    /(trocar|verificar|ajustar|regular|alinhar|substituir|apertar|limpar|cal[cç]ar|reposicionar|revisar|corrigir)/i.test(sentence)
  );

  return String(actionable || sentences[0] || '').slice(0, 170);
}

function ruleBasedResolutionChecks(action) {
  const key = normalizeKey(`${action.description || ''} ${action.action || ''}`);
  const checks = [];

  if (/variacao.*altura|altura.*variacao/.test(key)) {
    checks.push(
      'verificar a mola do conjunto',
      'verificar condição, posição e aperto da faca',
      'conferir contrafaca, calços e fixações',
      'acompanhar a altura após o ajuste'
    );
  }

  if (/faca/.test(key)) {
    checks.push('verificar afiação, posição, aperto e alinhamento da faca e contrafaca');
  }

  if (/tampao|vazamento/.test(key)) {
    checks.push('verificar vedação, desgaste, aperto e alinhamento do tampão');
  }

  if (/peca.*volt|faixa.*volt|retorno/.test(key)) {
    checks.push('verificar guias, sincronismo, garra e saída da peça');
  }

  if (/bobina.*estour|estour.*bobina/.test(key)) {
    checks.push('verificar alinhamento, tensão, freio e roletes da bobina');
  }

  if (/lubrific/.test(key)) {
    checks.push('verificar nível, bomba, sensor e possíveis obstruções da lubrificação');
  }

  return [...new Set(checks)];
}

function suggestedResolutionFromHistory(action) {
  const base = String(action.baseAction || directMaintenanceAction(action))
    .replace(/\.$/, '')
    .trim();

  const ruleChecks = ruleBasedResolutionChecks(action);
  const historyChecks = completedOrdersForAction(action)
    .map(order => actionableHistorySnippet(order.solution || order.comment || order.description))
    .filter(Boolean)
    .slice(0, 2);

  const parts = [base, ...ruleChecks, ...historyChecks]
    .map(value => String(value).trim().replace(/[.;]+$/, ''))
    .filter(Boolean);

  const unique = [];
  const seen = new Set();

  for (const part of parts) {
    const key = normalizeKey(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }

  return unique.join('; ').slice(0, 480) + '.';
}

function applySgmanHistoryToActions() {
  state.actions.forEach(action => {
    if (action.department !== 'maintenance') return;
    action.baseAction = action.baseAction || action.action;
    action.sgmanHistoryCount = completedOrdersForAction(action).length;
    action.sgmanSuggestedResolution = suggestedResolutionFromHistory(action);
    action.action = action.sgmanSuggestedResolution;
  });
}

function isMachineStopped(action) {
  const key = normalizeKey(`${action.description || ''} ${action.action || ''}`);
  return /maquina parada|parada|nao funciona|sem funcionar|quebra|quebrou|rompimento/.test(key) ? 1 : 0;
}


const SGMAN_SERVICE_TYPES = {
  GENERAL_MECHANIC: '003 MECÂNICO',
  ELECTRICAL: '007 ELETRICA',
  LUBRICATION: '009 LUBRIFICAR',
  PROGRAMMING: '010 PROGRAMAÇÃO',
  REPLACEMENT: '011 TROCA',
  MECHANICAL_ADJUSTMENT: '014 REGULAGEM MECÂNICA',
  PNEUMATIC: '015 PNEUMÁTICA',
  SHIM: '016 COLOCAR CALÇO'
};

function automaticSgmanServiceType(action) {
  const key = normalizeKey(
    `${action.machine || ''} ${action.description || ''} ${action.action || ''}`
  );

  if (/lubrific|oleo|graxa/.test(key)) {
    return SGMAN_SERVICE_TYPES.LUBRICATION;
  }

  if (/programacao|programar|clp|software|ihm/.test(key)) {
    return SGMAN_SERVICE_TYPES.PROGRAMMING;
  }

  if (/eletric|sensor|encoder|termopar|resistencia|drive|motor eletr|cabo|fusivel|rele/.test(key)) {
    return SGMAN_SERVICE_TYPES.ELECTRICAL;
  }

  if (/pneumat|mangueira|valvula|cilindro|ar comprimido|vazamento de ar/.test(key)) {
    return SGMAN_SERVICE_TYPES.PNEUMATIC;
  }

  if (/calco|calçar|calcar/.test(key)) {
    return SGMAN_SERVICE_TYPES.SHIM;
  }

  if (/trocar|troca|substituir|quebra|quebrou|rompeu|mola|patino/.test(key)) {
    return SGMAN_SERVICE_TYPES.REPLACEMENT;
  }

  if (/ajuste|regulagem|variacao|altura|faca|tampao|garra|estrela|saida|sincronismo/.test(key)) {
    return SGMAN_SERVICE_TYPES.MECHANICAL_ADJUSTMENT;
  }

  return SGMAN_SERVICE_TYPES.GENERAL_MECHANIC;
}


const SGMAN_MAINTENANCE_TYPES = {
  CORRECTIVE: 'CORRETIVA',
  IMPROVEMENT: 'MELHORIA',
  PREVENTIVE: 'PREVENTIVA',
  PROGRAMMING: 'PROGRAMAÇÃO',
  QUALITY: 'QUALIDADE',
  PRODUCTION_LEADER_ROUTINE: 'ROTINA LIDER PRODUÇÃO',
  SAFETY: 'SEGURANÇA',
  TEST: 'TESTE',
  HEIGHT_CHANGE: 'TROCA DE ALTURA',
  MOLD_CHANGE: 'TROCA DE MOLDE'
};

function automaticSgmanMaintenanceType(action) {
  const key = normalizeKey(
    `${action.machine || ''} ${action.description || ''} ${action.action || ''}`
  );

  if (/troca de molde|trocar molde|mudanca de molde|mudança de molde/.test(key)) {
    return SGMAN_MAINTENANCE_TYPES.MOLD_CHANGE;
  }

  if (/troca de altura|trocar altura|mudanca de altura|mudança de altura/.test(key)) {
    return SGMAN_MAINTENANCE_TYPES.HEIGHT_CHANGE;
  }

  if (/preventiva|preventivo|inspecao programada|inspeção programada/.test(key)) {
    return SGMAN_MAINTENANCE_TYPES.PREVENTIVE;
  }

  if (/melhoria|melhorar|modificacao|modificação|retrofit|upgrade/.test(key)) {
    return SGMAN_MAINTENANCE_TYPES.IMPROVEMENT;
  }

  if (/programacao|programar|clp|software|ihm/.test(key)) {
    return SGMAN_MAINTENANCE_TYPES.PROGRAMMING;
  }

  if (/qualidade|retrabalho|defeito de qualidade|autocontrole/.test(key)) {
    return SGMAN_MAINTENANCE_TYPES.QUALITY;
  }

  if (/seguranca|segurança|nr12|protecao|proteção|intertravamento/.test(key)) {
    return SGMAN_MAINTENANCE_TYPES.SAFETY;
  }

  if (/teste|testar|amostra/.test(key) && !/corrigir|eliminar|quebra|falha/.test(key)) {
    return SGMAN_MAINTENANCE_TYPES.TEST;
  }

  // Falhas, ajustes e quebras provenientes do relatório diário são corretivas.
  return SGMAN_MAINTENANCE_TYPES.CORRECTIVE;
}

function sgmanComment(action) {
  const problem = compactIssue(action.description || '') ||
    'Falha técnica identificada na máquina';

  const resolution = String(
    action.sgmanSuggestedResolution ||
    suggestedResolutionFromHistory(action)
  ).replace(/\.$/, '');

  return [
    `Problema: ${problem}.`,
    `Possível resolução: ${resolution}.`,
    'Atenção: testar a máquina, confirmar estabilidade e liberar somente após verificar que o defeito não voltou, evitando retrabalho.'
  ].join(' ');
}

function buildSgmanOrders() {
  if (!state.analysis) {
    return {
      orders: [],
      missingTags: [],
      missingExecutante: true,
      executantes: [],
      distribution: [],
      teamIncomplete: true
    };
  }

  const config = getConfig();
  const executantes = findSgmanTeamExecutantes(
    state.analysis.responsibleCrew
  );

  const sourceActions = state.actions.filter(action =>
    action.approved &&
    action.department === 'maintenance' &&
    action.type === 'OS' &&
    action.status !== 'Concluída'
  );

  const assignments = distributeSgmanOrders(
    sourceActions,
    executantes
  );

  const missingTags = [];
  const orders = [];

  assignments.forEach(({ action, executante }) => {
    const tag = config.sgmanTagMap?.[action.machine];

    if (!tag) {
      missingTags.push(action.machine);
      return;
    }

    const order = {
      data_programada: formatSgmanDateTime(new Date()),
      qtd_executantes: 1,
      tag,
      prioridade: action.priority || 'Média',
      id_ext: `turnosmart-${state.analysis.id}-${action.machine}`.slice(0, 100),
      pendente: 1,
      duracao_estimada: String(config.sgmanDuracaoEstimada || '01:00'),
      descricao: `${action.machine} - ${action.sgmanSuggestedResolution || suggestedResolutionFromHistory(action)}`.slice(0, 500),
      comentario: sgmanComment(action).slice(0, 2000),
      maquina_parada: isMachineStopped(action),
      executante
    };

    const tipoServicoConfig = String(
      config.sgmanTipoServico || 'AUTOMÁTICO'
    ).trim();

    const tipoManutencaoConfig = String(
      config.sgmanTipoManutencao || 'AUTOMÁTICO'
    ).trim();

    order.tipo_servico =
      normalizeKey(tipoServicoConfig) === 'automatico'
        ? automaticSgmanServiceType(action)
        : tipoServicoConfig;

    order.tipo_manutencao =
      normalizeKey(tipoManutencaoConfig) === 'automatico'
        ? automaticSgmanMaintenanceType(action)
        : tipoManutencaoConfig;

    action.sgmanExecutante = executante;
    orders.push(order);
  });

  return {
    orders,
    missingTags: [...new Set(missingTags)],
    missingExecutante: !executantes.length,
    executantes,
    distribution: summarizeSgmanDistribution(assignments),
    teamIncomplete: executantes.length < 4
  };
}

async function getSgmanConnectorStatus() {
  const statusEl = $('sgmanConnectorStatus');
  try {
    if (statusEl) statusEl.textContent = 'Verificando...';
    const response = await fetch('/api/sgman', { method: 'GET' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Falha ao verificar conector.');

    if (statusEl) {
      statusEl.textContent = data.configured
        ? 'Conector pronto. Token protegido na Vercel.'
        : 'Conector ainda sem SGMAN_TOKEN na Vercel.';
      statusEl.className = data.configured ? 'integration-status success' : 'integration-status warning';
    }
    return data;
  } catch (error) {
    if (statusEl) {
      statusEl.textContent = `Não foi possível verificar: ${error.message}`;
      statusEl.className = 'integration-status error';
    }
    return { configured: false };
  }
}

function getConfirmedSgmanIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE.sgmanConfirmed)) || []);
  } catch {
    return new Set();
  }
}

function saveConfirmedSgmanIds(ids) {
  localStorage.setItem(STORAGE.sgmanConfirmed, JSON.stringify([...new Set(ids)]));
}

function storeSgmanResult(data) {
  localStorage.setItem(STORAGE.sgmanLastResult, JSON.stringify({
    savedAt: new Date().toISOString(),
    data
  }));
}

function resultStatusLabel(status) {
  if (status === 'confirmed') return '✅ ABERTA';
  if (status === 'failed') return '❌ RECUSADA';
  return '⚠️ NÃO CONFIRMADA';
}


function sgmanFailureGuidance(result) {
  const text = normalizeKey(`${result.reason || ''} ${JSON.stringify(result.response || '')}`);

  if (/executante.*nao existe|executante.*não existe/.test(text)) {
    return 'Abra Escala e corrija o login do SGMan da equipe responsável. Use exatamente o usuário cadastrado no SGMan.';
  }

  if (/tipo de servico.*nao existe|tipo de serviço.*não existe/.test(text)) {
    return 'Confira o tipo de serviço configurado. Use o nome exato cadastrado no SGMan.';
  }

  if (/tag.*nao existe|tag.*não existe|local.*nao existe|local.*não existe/.test(text)) {
    return 'Confira a TAG da máquina na tela Config.';
  }

  if (
    /requisicoes simultaneas/.test(text) ||
    /requisições simultâneas/.test(text) ||
    /2 requisicoes por segundo/.test(text) ||
    /2 requisições por segundo/.test(text)
  ) {
    return 'A V21 envia em fila, espera entre as OS e tenta novamente automaticamente.';
  }

  return '';
}

function renderSgmanResults(data) {
  const resultEl = $('sgmanSendResult');
  const results = Array.isArray(data?.results) ? data.results : [];

  if (!results.length) {
    resultEl.textContent = JSON.stringify(data, null, 2);
    return;
  }

  resultEl.innerHTML = results.map(result => {
    const orderNumber = result.order_number || result.order_id || '';
    const extra = orderNumber ? ` • OS ${escapeHtml(String(orderNumber))}` : '';
    const responseText = typeof result.response === 'string'
      ? result.response
      : JSON.stringify(result.response, null, 2);

    const guidance = sgmanFailureGuidance(result);

    return `
      <div class="sgman-result-row ${escapeHtml(result.status)}">
        <strong>${resultStatusLabel(result.status)} — ${escapeHtml(result.machine || result.tag || '-')}</strong>${extra}
        ${result.executante ? `<span><strong>Executante:</strong> ${escapeHtml(result.executante)}</span>` : ''}
        <span>${escapeHtml(result.reason || '')}</span>
        ${Number(result.attempts || 1) > 1
          ? `<small>Tentativas automáticas: ${Number(result.attempts)}</small>`
          : ''}
        ${guidance ? `<p class="sgman-guidance">${escapeHtml(guidance)}</p>` : ''}
        <details>
          <summary>Ver resposta do SGMan</summary>
          <pre>${escapeHtml(responseText || 'Resposta vazia')}</pre>
        </details>
      </div>`;
  }).join('');

  const summary = document.createElement('div');
  summary.className = 'sgman-result-summary';
  summary.innerHTML = `
    <strong>Confirmadas: ${Number(data.confirmed || 0)}</strong>
    <span>Recusadas: ${Number(data.failed || 0)}</span>
    <span>Não confirmadas: ${Number(data.unknown || 0)}</span>`;
  resultEl.prepend(summary);
}

async function sendOrdersToSgman(mode = 'test') {
  if (state.sgmanSending) {
    showToast('A fila do SGMan ainda está sendo enviada.');
    return;
  }

  const {
    orders,
    missingTags,
    missingExecutante,
    executantes,
    distribution,
    teamIncomplete
  } = buildSgmanOrders();

  if (missingExecutante) {
    showToast(`Cadastre o login exato do SGMan para a equipe ${state.analysis?.responsibleCrew || '-'}.`);
    $('sgmanSendResult').textContent =
      `Nenhum executante foi definido para a equipe ${state.analysis?.responsibleCrew || '-'}. ` +
      'Abra Escala e cadastre o líder e os mecânicos da equipe.';
    return;
  }

  if (missingTags.length) {
    showToast(`Cadastre a TAG SGMan: ${missingTags.join(', ')}.`);
    $('sgmanSendResult').textContent = `TAGs não cadastradas: ${missingTags.join(', ')}`;
    return;
  }

  if (!orders.length) {
    showToast('Nenhuma OS pronta para enviar.');
    return;
  }

  const confirmedIds = getConfirmedSgmanIds();
  const pendingOrders = orders.filter(order => !confirmedIds.has(order.id_ext));

  if (!pendingOrders.length) {
    showToast('Todas as ordens deste relatório já foram confirmadas.');
    return;
  }

  const selected = mode === 'test' ? pendingOrders.slice(0, 1) : pendingOrders;
  const title = mode === 'test'
    ? 'Enviar somente 1 OS de teste?'
    : `Enviar as ${selected.length} OS restantes?`;

  const confirmed = window.confirm(
    `${title}\n\n` +
    selected.map(order =>
      `${order.tag} — ${order.descricao}\nResponsável: ${order.executante}`
    ).join('\n\n') +
    '\n\nO aplicativo só marcará como aberta se o SGMan confirmar.'
  );
  if (!confirmed) return;

  const testButton = $('testOneSgmanBtn');
  const allButton = $('sendSgmanBtn');
  const resultEl = $('sgmanSendResult');

  try {
    state.sgmanSending = true;
    testButton.disabled = true;
    allButton.disabled = true;
    resultEl.textContent = mode === 'test'
      ? 'Enviando uma OS para teste...'
      : `Enviando ${selected.length} OS em fila segura. Não feche esta tela...`;

    const response = await fetch('/api/sgman', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders: selected })
    });

    const data = await response.json().catch(async () => ({
      ok: false,
      error: 'Resposta inválida do conector.',
      raw: await response.text().catch(() => '')
    }));

    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP ${response.status}`);
    }

    storeSgmanResult(data);
    renderSgmanResults(data);

    const newlyConfirmed = (data.results || [])
      .filter(result => result.status === 'confirmed')
      .map(result => result.id_ext)
      .filter(Boolean);

    const updatedIds = new Set([...confirmedIds, ...newlyConfirmed]);
    saveConfirmedSgmanIds([...updatedIds]);

    state.actions.forEach(action => {
      const id = selected.find(order => order.id_ext?.endsWith(`-${action.machine}`))?.id_ext;
      if (id && updatedIds.has(id)) action.status = 'Em andamento';
    });

    renderActions();

    if (data.confirmed > 0 && data.failed === 0 && data.unknown === 0) {
      showToast(`${data.confirmed} OS confirmada(s) pelo SGMan.`);
      allButton.disabled = false;
    } else if (data.failed > 0) {
      showToast('O SGMan recusou a OS. Veja o motivo.');
    } else {
      showToast('O envio não foi confirmado. Veja a resposta do SGMan.');
    }
  } catch (error) {
    resultEl.textContent = `Falha no envio: ${error.message}`;
    showToast('Falha ao criar OS no SGMan.');
  } finally {
    state.sgmanSending = false;
    testButton.disabled = false;
    const last = JSON.parse(localStorage.getItem(STORAGE.sgmanLastResult) || 'null');
    const lastData = last?.data;
    allButton.disabled = !(lastData?.confirmed > 0 && lastData?.failed === 0 && lastData?.unknown === 0);
  }
}

async function copyText(text, success = 'Copiado.') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(success);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    showToast(success);
  }
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

async function analyzeCurrentReport() {
  const text = $('reportText').value.trim();
  if (!text) {
    showToast('Cole o relatório antes de analisar.');
    return;
  }

  let editorValues = machineOeeFromEditor();
  const file = $('oeeImageInput')?.files?.[0];

  if (!editorValues.length && file) {
    await processOeeColumnPhoto();
    editorValues = machineOeeFromEditor();
  }

  let oeeText = editorValues.length
    ? editorOeeText()
    : ($('oeeOcrText')?.value.trim() || '');

  $('oeeOcrText').value = oeeText;
  state.oeeOcrText = oeeText;

  await refreshSgmanHistory(false);

  const scheduleInfo = detectOperationalShift($('reportReceivedAt').value, $('reportDate').value, $('reportShift').value, state.manualSchedule);
  const analysis = parseReport(text, scheduleInfo);
  analysis.oeeOcrText = oeeText;
  analysis.machineOee = editorValues.length
    ? editorValues
    : extractAllMachineOeeFromText(oeeText);
  analysis.lowOeeMachines = analysis.machineOee
    .filter(item => item.oee < 65)
    .sort((a, b) => a.oee - b.oee);
  analysis.sgmanSummary = { ...(state.sgmanHistory?.summary || {}) };
  analysis.reliability3Days = { ...calculateReliability3Days() };
  state.analysis = analysis;
  state.actions = generateActions(analysis);
  applySgmanHistoryToActions();

  const history = getHistory();
  history.unshift({
    id: analysis.id,
    date: analysis.date,
    shift: analysis.shift,
    crew: analysis.crew,
    responsibleCrew: analysis.responsibleCrew,
    realized: analysis.realized,
    reportedOee: analysis.reportedOee,
    analysis,
    actions: state.actions
  });
  saveHistory(history);
  localStorage.removeItem(STORAGE.draft);
  renderAnalysis();
  renderActions();
  renderHistory();
  renderOeeDashboard();
  switchView('analise');
  showToast('Relatório e foto analisados.');
}

const SAMPLE_REPORT = `*Relatório de produção diária*
- Turno: 3°
*Lideres* : Adriana 

*Segurança*
Ocorrência: Não 
O que? 

*Previsto Escala (B2)*

*Férias (-)*: 

*Faltas (-)*:  05
Barbara 
Samanta 
Rayane
Wesley 
Elisângela 

*Hora-Extra* *(+)* 1
Alexandre

*Retrabalho* *(+)* 0

*Pagando dia (+)*: 0

*Total Presente*: 16 com a lider

*Treinamento*: 0
Jair
Cauã 
Luis Henrique 
Daiane
Ana Lígia 

 *DDE*
 1)organização e limpeza 
2)fazer auto controle começo meio e fim das caixas

*Qualidade*
Ocorrência: 
O que? 

*Entrega – Produtividade PA*
*_Plano 75% OEE =  *792.000 turno_(mínimo)_*
*Realizado*: 
581.330 - 60%

*Perdas (Causas)*
*_1º M – Mão de obra_*

*2º M – Material*
 
*3º M – Método*

*4º M – Máquina*

*MK-223*
1) Limpeza 50 (treinamento)
2)troca bobina da faixa 10min
3) peça voltando 

*MK-222*
1)Limpeza 
2) bobina do descolada 15min
3) impressão faixa ruim 10min
4) ajuste faca fundo 01:10
5)novo ajuste na faca fundo 30min

*Mk-220*: 
1)Limpeza 30min
2)troca mola da rotolatriz 15min
3)bobina do fundo enroscando 30min

*MK:  214*
1)Limpeza 20min
2) troca faca fundo 40min
3)falta faixa e falta fundo ajuste 45min
4) ajuste na saída 35min

 **MK:217*
1)Limpeza 20min
2) bobina fundo troca 20min
3)troca bobina faixa 10min
4) ajuste faca faixa 15min
5) marcas de parafuso ajuste 20min
6)bobina fundo estourando 20min

*MK:* *179*
1)Limpeza 40min (treinamento)
2) tampão vazando (2x) 01:08
3) vedando tampão 01:10

*Mk: 212* 
1)Limpeza 40min
2)troca bobina faixa 10min
3) calço na faca e inverteu lado contra faca 20min
4) falta faixa

*MK: 173*
1)Limpeza 30min
2) troca mola rotolatriz 10min
3) calço na faca (2x) 20min
5)troca bobina faixa 05min

 *MK:*149* 
1)Limpeza 30min
2) preventiva 02:00
3)bobina fora da posição 15min
4) ajuste na base do tampão 20min
5)quebra da mangueira reservatório de cola faixa 01:10

*Mk 178*
1)Limpeza 35min
2)troca bobina da faixa 07min
3) falta faixa
4) troca patinos 10min

*MK 172*
1)Limpeza 30min
2) ajuste no tampão 50min
3) variação de altura ajuste 02:10

*Mk:69*
1)Limpeza 30min
2)faixa voltando 
3) alarme de lubrificação 10min

*MK 176*
1)Limpeza 25min
2) faixa enroscando na faca 
3) limpeza de refilo na esteira 25min
4) calço na faca e ajunta garra 02:05

 **MK170*
1)Limpeza 20min
2) ajuste geral calço na faca Estela saída 03:04

*MK 188*
1)falta m.o

*MK:192*
1)falta de mão de obra 

*MK*159*
1)bordas danificadas 
Aguardando 

*MK: 105*: 
1)falta de mão de obra 

 *MK 108*
1)falta de mão de obra 

*MK* *138*
1)falta m.o

 *MK 08* 
1)falta de mão de obra 

 *MK 02* 
1)falta de mão de obra e máquina preparada para amostras`;

function init() {
  $('reportReceivedAt').value = toLocalDateTimeInput(new Date());
  migrateConfirmedSgmanUsers();
  populateSgmanUserSelect('scaleSgmanMechanic1');
  populateSgmanUserSelect('scaleSgmanMechanic2');
  populateSgmanUserSelect('scaleSgmanMechanic3');
  const config = migrateSgmanConfig();
  $('referenceDate').value = config.referenceDate;
  $('referenceLetter').value = config.referenceLetter;
  $('sgmanExecutante').value = config.sgmanExecutante || '';
  $('sgmanTipoServico').value = config.sgmanTipoServico || 'AUTOMÁTICO';
  $('sgmanTipoManutencao').value = config.sgmanTipoManutencao || 'AUTOMÁTICO';
  $('sgmanQtdExecutantes').value = config.sgmanQtdExecutantes || 1;
  $('sgmanDuracaoEstimada').value = config.sgmanDuracaoEstimada || '01:00';
  $('sgmanTagMap').value = stringifySgmanTagMap(config.sgmanTagMap || {});
  $('sgmanTagCount').textContent = `${Object.keys(config.sgmanTagMap || {}).length} TAG(s) reconhecida(s).`;
  updateDetectedShift();
  updateOeeScopeHint();
  fillScaleForm('A1');

  state.sgmanHistory = getCachedSgmanHistory();
  renderSgmanDailyStatus();
  refreshSgmanHistory(false);

  const draft = localStorage.getItem(STORAGE.draft);
  if (draft) $('reportText').value = draft;

  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  $('reportReceivedAt').addEventListener('change', () => {
    state.manualSchedule = false;
    $('manualFields').classList.add('hidden');
    updateDetectedShift();
  });
  $('reportDate').addEventListener('change', () => { state.manualSchedule = true; updateDetectedShift(); });
  $('reportShift').addEventListener('change', () => { state.manualSchedule = true; updateDetectedShift(); });
  $('manualToggleBtn').addEventListener('click', () => {
    const willShow = $('manualFields').classList.contains('hidden');
    $('manualFields').classList.toggle('hidden');
    state.manualSchedule = willShow;
    updateDetectedShift();
  });
  $('saveReferenceBtn').addEventListener('click', () => {
    const referenceDate = $('referenceDate').value;
    const referenceLetter = $('referenceLetter').value;
    if (!referenceDate) return showToast('Informe a data de referência.');
    saveConfig({
      ...getConfig(),
      referenceDate,
      referenceLetter
    });
    updateDetectedShift();
    showToast('Referência da escala salva.');
  });
  $('refreshSgmanHistoryBtn').addEventListener('click', () => refreshSgmanHistory(true));
  $('refreshReliabilityBtn').addEventListener('click', async () => {
    await refreshSgmanHistory(true);
    renderReliability3Days();
  });
  $('analyzeBtn').addEventListener('click', analyzeCurrentReport);
  $('sampleBtn').addEventListener('click', () => {
    $('reportText').value = SAMPLE_REPORT;
    localStorage.setItem(STORAGE.draft, SAMPLE_REPORT);
    const sampleValues = new Map([
      ['MK-223', 56], ['MK-172', 54], ['MK-170', 64],
      ['MK-149', 63], ['MK-176', 33]
    ]);
    renderOeeMachineEditor(
      OEE_BOARD_MACHINES.map(machine => ({
        machine,
        oee: sampleValues.has(machine) ? sampleValues.get(machine) : '',
        confidence: sampleValues.has(machine) ? 100 : 0,
        source: 'Exemplo'
      }))
    );
    $('oeeOcrText').value = editorOeeText();
    showToast('Exemplo carregado.');
  });
  $('clearBtn').addEventListener('click', () => {
    $('reportText').value = '';
    $('oeeOcrText').value = '';
    $('oeeStatus').textContent = '';
    $('oeeImageInput').value = '';
    $('oeePreview').src = '';
    $('oeePreviewWrap').classList.add('hidden');
    $('oeeCropPreview').src = '';
    $('oeeOcrPreview').src = '';
    $('oeeCropPreviewWrap').classList.add('hidden');
    $('oeeMachineEditor').innerHTML = '';
    $('oeeMachineEditor').classList.add('hidden');
    state.oeeMachineEditorData = [];
    state.oeeRowPreviews = [];
    state.oeeImageDataUrl = '';
    state.oeeCropDataUrl = '';
    localStorage.removeItem(STORAGE.draft);
  });
  $('reportText').addEventListener('input', e => localStorage.setItem(STORAGE.draft, e.target.value));
  $('oeeOcrText').addEventListener('input', e => { state.oeeOcrText = e.target.value; });
  $('oeeImageInput').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await dataUrlFromFile(file);
    state.oeeImageDataUrl = dataUrl;
    state.oeeMachineEditorData = [];
    state.oeeRowPreviews = [];
    $('oeePreview').src = dataUrl;
    $('oeePreviewWrap').classList.remove('hidden');
    $('oeeCropPreviewWrap').classList.add('hidden');
    $('oeeMachineEditor').classList.add('hidden');
    $('oeeStatus').textContent = 'Foto carregada. Toque em “Recortar e ler coluna”.';
  });
  $('processOeePhotoBtn').addEventListener('click', processOeeColumnPhoto);
  $('emptyOeeTableBtn').addEventListener('click', () => {
    renderOeeMachineEditor([]);
    $('oeeStatus').textContent = 'Tabela vazia aberta para preenchimento manual.';
  });

  $('copySummaryBtn').addEventListener('click', () => copyText(managementSummaryText(state.analysis), 'Resumo copiado.'));
  $('copyMaintenanceBtn').addEventListener('click', () => copyText(maintenanceMessage(), 'Mensagem da manutenção copiada.'));
  $('copyProductionBtn').addEventListener('click', () => copyText(productionMessage(), 'Mensagem da produção copiada.'));
  $('shareMaintenanceBtn').addEventListener('click', async () => {
    const text = maintenanceMessage();
    if (navigator.share) {
      try { await navigator.share({ title: 'Relatório da manutenção', text }); }
      catch (error) { if (error.name !== 'AbortError') copyText(text); }
    } else copyText(text);
  });
  $('shareProductionBtn').addEventListener('click', async () => {
    const text = productionMessage();
    if (navigator.share) {
      try { await navigator.share({ title: 'Relatório da produção', text }); }
      catch (error) { if (error.name !== 'AbortError') copyText(text); }
    } else copyText(text);
  });

  $('sgmanPreviewBtn').addEventListener('click', () => {
    const {
      orders,
      missingTags,
      missingExecutante,
      executantes,
      distribution,
      teamIncomplete
    } = buildSgmanOrders();

    $('sgmanJson').textContent = JSON.stringify({
      equipe_responsavel: state.analysis?.responsibleCrew || '',
      executantes_da_equipe: executantes,
      distribuicao: distribution,
      orders,
      missingTags,
      missingExecutante,
      teamIncomplete
    }, null, 2);

    $('sgmanPreview').classList.remove('hidden');
    $('sgmanPreview').scrollIntoView({ behavior: 'smooth', block: 'start' });

    const blocked = !orders.length || !!missingTags.length || missingExecutante;
    $('testOneSgmanBtn').disabled = blocked;
    $('sendSgmanBtn').disabled = true;

    if (missingExecutante) {
      $('sgmanSendResult').textContent =
        `Cadastre na Escala o líder e os mecânicos da equipe ${state.analysis?.responsibleCrew || '-'}.`;
    } else if (missingTags.length) {
      $('sgmanSendResult').textContent =
        `Cadastre as TAGs antes de enviar: ${missingTags.join(', ')}`;
    } else {
      const serviceSummary = [...new Set(
        orders.map(order => order.tipo_servico).filter(Boolean)
      )].join(', ');

      const maintenanceSummary = [...new Set(
        orders.map(order => order.tipo_manutencao).filter(Boolean)
      )].join(', ');

      const optionalFields = [
        `tipo de serviço: ${serviceSummary || 'não definido'}`,
        `tipo de manutenção: ${maintenanceSummary || 'não definido'}`
      ].join(' • ');

      const distributionText = distribution
        .map(item => `${item.username}: ${item.count}`)
        .join(' • ');

      const teamWarning = teamIncomplete
        ? ` A equipe possui ${executantes.length} executante(s); para usar o líder e três mecânicos, cadastre os quatro.`
        : '';

      $('sgmanSendResult').textContent =
        `${orders.length} OS distribuída(s) entre ${executantes.length} pessoa(s). ` +
        `${distributionText}. ${optionalFields}.${teamWarning} Primeiro envie apenas 1 OS de teste.`;
    }

    showToast(`${orders.length} OS distribuída(s) entre ${executantes.length} executante(s).`);
  });
  $('testOneSgmanBtn').addEventListener('click', () => sendOrdersToSgman('test'));
  $('sendSgmanBtn').addEventListener('click', () => sendOrdersToSgman('all'));
  $('downloadPayloadBtn').addEventListener('click', () => downloadJson(`sgman-${state.analysis?.date || todayISO()}.json`, buildSgmanOrders()));

  $('scaleCrew').addEventListener('change', e => fillScaleForm(e.target.value));
  $('saveScaleBtn').addEventListener('click', () => {
    const crew = $('scaleCrew').value;
    const maintenanceLeader = $('scaleMaintenanceLeader').value.trim();
    const sgmanExecutante = $('scaleSgmanExecutante').value.trim();
    const sgmanMechanics = uniqueStrings([
      $('scaleSgmanMechanic1').value,
      $('scaleSgmanMechanic2').value,
      $('scaleSgmanMechanic3').value
    ]).filter(value =>
      value.toLocaleLowerCase('pt-BR') !==
        sgmanExecutante.toLocaleLowerCase('pt-BR')
    );
    const productionLeader = $('scaleProductionLeader').value.trim();
    const team = $('scaleTeam').value.trim();

    if (!crew || (!maintenanceLeader && !productionLeader)) {
      return showToast('Informe pelo menos um líder.');
    }

    const items = getScale();
    const existing = items.find(item => item.crew === crew);
    const record = {
      id: existing?.id || uid(),
      crew,
      maintenanceLeader,
      sgmanExecutante,
      sgmanMechanics,
      productionLeader: productionLeader || DEFAULT_PRODUCTION_LEADERS[crew] || '',
      team
    };

    const updated = existing
      ? items.map(item => item.crew === crew ? record : item)
      : [record, ...items];

    saveScale(updated);
    renderScale();

    if (state.analysis && state.analysis.responsibleCrew === crew) {
      const maintenanceResponsible = findMaintenanceResponsible(
        state.analysis.responsibleDate,
        state.analysis.responsibleShift,
        crew
      );
      const productionResponsible = findProductionResponsible(crew);

      state.actions.forEach(action => {
        action.responsible = action.department === 'maintenance'
          ? maintenanceResponsible
          : productionResponsible;
      });

      renderActions();
    }

    const rosterSize = 1 + sgmanMechanics.length;

    if (!sgmanExecutante) {
      showToast(`Equipe ${crew} salva, mas falta o líder do SGMan.`);
    } else if (rosterSize < 4) {
      showToast(`Equipe ${crew} salva com ${rosterSize} executante(s). Cadastre os três mecânicos para completar.`);
    } else {
      showToast(`Equipe ${crew} salva com líder e três mecânicos.`);
    }
  });

  $('saveSgmanConfigBtn').addEventListener('click', () => {
    const current = getConfig();
    const tagMap = parseSgmanTagMap($('sgmanTagMap').value);

    saveConfig({
      ...current,
      sgmanExecutante: $('sgmanExecutante').value.trim(),
      sgmanTipoServico: $('sgmanTipoServico').value.trim() || 'AUTOMÁTICO',
      sgmanTipoManutencao: $('sgmanTipoManutencao').value.trim() || 'AUTOMÁTICO',
      sgmanQtdExecutantes: Math.max(1, Number($('sgmanQtdExecutantes').value || 1)),
      sgmanDuracaoEstimada: $('sgmanDuracaoEstimada').value.trim() || '01:00',
      sgmanTagMap: tagMap
    });

    $('sgmanTagMap').value = stringifySgmanTagMap(tagMap);
    $('sgmanTagCount').textContent = `${Object.keys(tagMap).length} TAG(s) reconhecida(s).`;
    showToast(`${Object.keys(tagMap).length} TAG(s) do SGMan salva(s).`);
  });
  $('testSgmanBtn').addEventListener('click', getSgmanConnectorStatus);
  getSgmanConnectorStatus();

  $('exportHistoryBtn').addEventListener('click', () => downloadJson(`turnosmart-historico-${todayISO()}.json`, getHistory()));
  $('resetAppBtn').addEventListener('click', () => {
    const confirmed = window.confirm('Apagar escala, histórico e rascunhos deste aparelho?');
    if (!confirmed) return;
    Object.values(STORAGE).forEach(key => localStorage.removeItem(key));
    state.analysis = null;
    state.actions = [];
    $('reportText').value = '';
    $('oeeOcrText').value = '';
    $('oeeStatus').textContent = '';
    $('oeeImageInput').value = '';
    $('oeePreview').src = '';
    $('oeePreviewWrap').classList.add('hidden');
    $('oeeCropPreview').src = '';
    $('oeeOcrPreview').src = '';
    $('oeeCropPreviewWrap').classList.add('hidden');
    $('oeeMachineEditor').innerHTML = '';
    $('oeeMachineEditor').classList.add('hidden');
    state.oeeMachineEditorData = [];
    state.oeeRowPreviews = [];
    renderAnalysis();
    renderActions();
    renderScale();
    renderHistory();
    renderOeeDashboard();
    showToast('Dados apagados.');
  });

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    state.deferredPrompt = event;
    $('installBtn').classList.remove('hidden');
  });
  $('installBtn').addEventListener('click', async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    $('installBtn').classList.add('hidden');
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js?v=28.0.0');
        registration.update();
      } catch {}
    });
  }

  renderAnalysis();
  renderActions();
  renderScale();
  renderHistory();
  renderOeeDashboard();
}

document.addEventListener('DOMContentLoaded', init);
