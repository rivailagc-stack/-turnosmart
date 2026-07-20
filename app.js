'use strict';

const STORAGE = {
  history: 'turnosmart_history_v1',
  scale: 'turnosmart_scale_v1',
  draft: 'turnosmart_draft_v1',
  config: 'turnosmart_config_v3'
};

const DEFAULT_PRODUCTION_LEADERS = {
  A1: 'Maria',
  A2: 'Reginaldo',
  B1: 'Wilma',
  B2: 'Marisa'
};

const state = {
  analysis: null,
  actions: [],
  deferredPrompt: null,
  manualSchedule: false
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

function getConfig() {
  const defaults = { referenceDate: '2026-07-20', referenceLetter: 'A' };
  try { return { ...defaults, ...(JSON.parse(localStorage.getItem(STORAGE.config)) || {}) }; }
  catch { return defaults; }
}

function saveConfig(config) {
  localStorage.setItem(STORAGE.config, JSON.stringify(config));
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
    reason,
    receivedAt: receivedAt.toISOString()
  };
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
        <p>${escapeHtml(result.reason)}</p>
      </div>
      <span class="crew-pill">${result.crew} → ${result.incomingCrew}</span>
    </div>`;
  if (!result.automatic) $('manualFields').classList.remove('hidden');
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

  actions.forEach(action => {
    action.status = action.status || 'Pendente';
    action.deadline = action.deadline || deadlineForAction(action.priority, action.department, analysis.responsibleShift);
  });

  const order = { Alta: 0, Média: 1, Baixa: 2 };
  return actions.sort((a, b) => order[a.priority] - order[b.priority] || b.recordedMinutes - a.recordedMinutes || a.department.localeCompare(b.department));
}

function getScale() {
  try { return JSON.parse(localStorage.getItem(STORAGE.scale)) || []; }
  catch { return []; }
}

function saveScale(items) {
  localStorage.setItem(STORAGE.scale, JSON.stringify(items));
}

function getScaleRecord(crew) {
  const saved = getScale().find(row => row.crew === crew) || {};
  return {
    ...saved,
    crew,
    maintenanceLeader: saved.maintenanceLeader || saved.leader || '',
    productionLeader: saved.productionLeader || DEFAULT_PRODUCTION_LEADERS[crew] || '',
    team: saved.team || ''
  };
}

function findMaintenanceResponsible(date, shift, crew = '') {
  const record = crew ? getScaleRecord(crew) : null;
  if (record?.maintenanceLeader) return record.maintenanceLeader;
  const legacy = getScale().find(row => row.date === date && String(row.shift) === String(shift));
  return legacy?.maintenanceLeader || legacy?.leader || `Líder da manutenção ${crew || '-'} não definido`;
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
  const lines = ['*AÇÕES DA MANUTENÇÃO*'];

  if (!shown.length) {
    lines.push('Sem ação técnica pendente.');
  } else {
    shown.forEach((action, index) => {
      lines.push(`${index + 1}. *${action.machine}* — ${directMaintenanceAction(action)}`);
    });
    if (approved.length > shown.length) lines.push(`+${approved.length - shown.length} ação(ões) pendente(s).`);
  }

  lines.push('');
  lines.push('*Resolver durante o turno.*');
  lines.push('*SGMan:* apontar todas as OS e informar no grupo ao concluir.');
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
  const rework = approved.find(action => action.machine === 'RETRABALHO');
  const lines = [`*AÇÕES DA PRODUÇÃO — ${responsible}*`];

  let step = 1;
  if (labor) lines.push(`${step++}. Redistribuir mão de obra: ${analysis.laborShortageMachines.join(', ')}.`);
  if (paperMachines.length) lines.push(`${step++}. Corrigir passagem de papel e bobinas: ${paperMachines.join(', ')}. Não transferir rotina operacional para a manutenção.`);
  if (qualityMachines.length || rework) lines.push(`${step++}. Fazer autocontrole no início, meio e fim${qualityMachines.length ? `: ${qualityMachines.join(', ')}` : ''}. Parar no primeiro defeito.`);
  if (setupMachines.length) lines.push(`${step++}. Conferir setup e molde antes de liberar: ${setupMachines.join(', ')}.`);
  if (step === 1) lines.push('1. Atuar nas perdas para recuperar o OEE e reduzir retrabalho.');
  lines.push(`${step}. Defeito técnico: abrir solicitação no *SGMan* com máquina, sintoma e horário antes de chamar a manutenção.`);
  lines.push('*Resolver durante o turno.*');
  lines.push('Informar no grupo o que foi corrigido.');
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
    ['OEE informado', analysis.reportedOee ? `${analysis.reportedOee}%` : '-', `Meta ${analysis.targetOee}%`],
    ['Atingimento', analysis.attainment != null ? `${analysis.attainment}%` : '-', analysis.gap != null ? `${formatNumber(analysis.gap)} abaixo do plano` : 'Sem comparação'],
    ['Faltas', analysis.absenceCount, analysis.absences.join(', ') || 'Sem nomes identificados'],
    ['Presentes', analysis.present || '-', 'Incluindo liderança, conforme relatório'],
    ['Retrabalho', analysis.reworkCount || 0, 'Foco em reduzir repetição e perdas'],
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
  notes.push(`<li><strong>Separação:</strong> falhas técnicas seguem para manutenção. Passagem de papel, bobinas, limpeza, mão de obra, treinamento e autocontrole seguem para a produção.</li>`);
  if (analysis.scheduleMismatch) notes.push(`<li><strong>Conferência de escala:</strong> o texto informa ${escapeHtml(analysis.expectedCrew)}, mas pelo horário e pela escala automática foi identificado ${escapeHtml(analysis.crew)}.</li>`);
  if (analysis.reportedShift && analysis.reportedShift !== analysis.shift) notes.push(`<li><strong>Turno do relatório:</strong> o texto informa ${escapeHtml(analysis.reportedShift)}º turno. Para a escala 12x36, o aplicativo classificou como equipe ${escapeHtml(analysis.crew)} (${escapeHtml(analysis.schedule)}).</li>`);

  $('managementSummary').innerHTML = `
    <p><strong>${escapeHtml(analysis.productionLeader)}</strong> registrou ${formatNumber(analysis.realized)} unidades no turno. O resultado atingiu <strong>${analysis.attainment ?? '-'}%</strong> do plano informado.</p>
    <p>Foram identificadas <strong>${analysis.machines.length} máquinas</strong> com apontamentos e uma soma de <strong>${formatMinutes(analysis.totalRecordedMinutes)}</strong> em tempos registrados. Essa soma não representa necessariamente parada total do setor, pois as máquinas podem ter parado ao mesmo tempo.</p>
    ${notes.length ? `<ul>${notes.join('')}</ul>` : '<p>Nenhuma divergência principal foi identificada nos campos gerais.</p>'}
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
  $('scaleCrew').value = crew;
  $('scaleMaintenanceLeader').value = item.maintenanceLeader || '';
  $('scaleProductionLeader').value = item.productionLeader || DEFAULT_PRODUCTION_LEADERS[crew] || '';
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
    switchView('analise');
  }));
  $$('.delete-history').forEach(btn => btn.addEventListener('click', () => {
    saveHistory(getHistory().filter(item => item.id !== btn.dataset.id));
    renderHistory();
    showToast('Relatório excluído.');
  }));
}

function buildSgmanPayload() {
  if (!state.analysis) return [];
  return state.actions.filter(a => a.approved && a.type === 'OS' && a.department === 'maintenance').map(action => ({
    origem: 'TurnoSmart',
    data_relatorio: state.analysis.date,
    turno_relatorio: state.analysis.shift,
    equipe_que_entregou: state.analysis.crew,
    horario_trabalhado: state.analysis.schedule,
    data_responsabilidade: state.analysis.responsibleDate,
    turno_responsavel: state.analysis.responsibleShift,
    equipe_que_esta_entrando: state.analysis.responsibleCrew,
    horario_responsavel: state.analysis.responsibleSchedule,
    recebido_em: state.analysis.receivedAt,
    ativo: action.machine,
    tipo: 'Corretiva planejada',
    prioridade: action.priority,
    descricao: action.description,
    acao_sugerida: action.action,
    responsavel: action.responsible,
    prazo_plano: 'Durante o turno',
    status_plano: action.status,
    tempo_registrado_minutos: action.recordedMinutes,
    status_integracao: 'AGUARDANDO_CONFIGURACAO_SGMAN'
  }));
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

function analyzeCurrentReport() {
  const text = $('reportText').value.trim();
  if (!text) {
    showToast('Cole o relatório antes de analisar.');
    return;
  }
  const scheduleInfo = detectOperationalShift($('reportReceivedAt').value, $('reportDate').value, $('reportShift').value, state.manualSchedule);
  const analysis = parseReport(text, scheduleInfo);
  state.analysis = analysis;
  state.actions = generateActions(analysis);

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
  switchView('analise');
  showToast('Relatório analisado e salvo.');
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
  const config = getConfig();
  $('referenceDate').value = config.referenceDate;
  $('referenceLetter').value = config.referenceLetter;
  updateDetectedShift();
  fillScaleForm('A1');

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
    saveConfig({ referenceDate, referenceLetter });
    updateDetectedShift();
    showToast('Referência da escala salva.');
  });
  $('analyzeBtn').addEventListener('click', analyzeCurrentReport);
  $('sampleBtn').addEventListener('click', () => { $('reportText').value = SAMPLE_REPORT; localStorage.setItem(STORAGE.draft, SAMPLE_REPORT); showToast('Exemplo carregado.'); });
  $('clearBtn').addEventListener('click', () => { $('reportText').value = ''; localStorage.removeItem(STORAGE.draft); });
  $('reportText').addEventListener('input', e => localStorage.setItem(STORAGE.draft, e.target.value));

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
    const payload = buildSgmanPayload();
    $('sgmanJson').textContent = JSON.stringify(payload, null, 2);
    $('sgmanPreview').classList.remove('hidden');
    $('sgmanPreview').scrollIntoView({ behavior: 'smooth', block: 'start' });
    showToast(`${payload.length} OS simulada(s).`);
  });
  $('downloadPayloadBtn').addEventListener('click', () => downloadJson(`sgman-${state.analysis?.date || todayISO()}.json`, buildSgmanPayload()));

  $('scaleCrew').addEventListener('change', e => fillScaleForm(e.target.value));
  $('saveScaleBtn').addEventListener('click', () => {
    const crew = $('scaleCrew').value;
    const maintenanceLeader = $('scaleMaintenanceLeader').value.trim();
    const productionLeader = $('scaleProductionLeader').value.trim();
    const team = $('scaleTeam').value.trim();
    if (!crew || (!maintenanceLeader && !productionLeader)) return showToast('Informe pelo menos um líder.');
    const items = getScale();
    const existing = items.find(item => item.crew === crew);
    const record = { id: existing?.id || uid(), crew, maintenanceLeader, productionLeader: productionLeader || DEFAULT_PRODUCTION_LEADERS[crew] || '', team };
    const updated = existing ? items.map(item => item.crew === crew ? record : item) : [record, ...items];
    saveScale(updated);
    renderScale();
    if (state.analysis && state.analysis.responsibleCrew === crew) {
      const maintenanceResponsible = findMaintenanceResponsible(state.analysis.responsibleDate, state.analysis.responsibleShift, crew);
      const productionResponsible = findProductionResponsible(crew);
      state.actions.forEach(action => {
        action.responsible = action.department === 'maintenance' ? maintenanceResponsible : productionResponsible;
      });
      renderActions();
    }
    showToast('Líderes da equipe salvos.');
  });

  $('exportHistoryBtn').addEventListener('click', () => downloadJson(`turnosmart-historico-${todayISO()}.json`, getHistory()));
  $('resetAppBtn').addEventListener('click', () => {
    const confirmed = window.confirm('Apagar escala, histórico e rascunhos deste aparelho?');
    if (!confirmed) return;
    Object.values(STORAGE).forEach(key => localStorage.removeItem(key));
    state.analysis = null;
    state.actions = [];
    $('reportText').value = '';
    renderAnalysis();
    renderActions();
    renderScale();
    renderHistory();
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
        const registration = await navigator.serviceWorker.register('/sw.js?v=7.0.1');
        registration.update();
      } catch {}
    });
  }

  renderAnalysis();
  renderActions();
  renderScale();
  renderHistory();
}

document.addEventListener('DOMContentLoaded', init);
