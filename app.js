'use strict';

const STORAGE = {
  history: 'turnosmart_history_v1',
  scale: 'turnosmart_scale_v1',
  draft: 'turnosmart_draft_v1'
};

const state = {
  analysis: null,
  actions: [],
  deferredPrompt: null
};

const $ = id => document.getElementById(id);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
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

function parseReport(rawText, selectedDate, selectedShift) {
  const text = normalizeText(rawText);
  const lines = text.split('\n');
  const cleanedLines = lines.map(cleanLine);

  const turnoMatch = text.match(/Turno\s*:\s*([123])\s*[º°]?/i);
  const leaderLine = cleanedLines.find(line => /^L[ií]der(?:es)?\s*:/i.test(line));
  const leader = leaderLine ? leaderLine.split(':').slice(1).join(':').trim() : '';

  const absenceLine = cleanedLines.find(line => /^Faltas\b/i.test(line)) || '';
  const absenceCount = Number((absenceLine.match(/(\d+)\s*$/) || absenceLine.match(/:\s*(\d+)/) || [])[1] || 0);
  const absences = extractPeople(
    lines,
    /^Faltas\b/i,
    [/^Hora-Extra\b/i, /^Retrabalho\b/i, /^Pagando dia\b/i, /^Total Presente\b/i],
    absenceCount || null
  );

  const overtimeLine = cleanedLines.find(line => /^Hora-Extra\b/i.test(line)) || '';
  const overtimeCount = Number((overtimeLine.match(/(\d+)\s*$/) || overtimeLine.match(/:\s*(\d+)/) || [])[1] || 0);
  const overtimePeople = extractPeople(
    lines,
    /^Hora-Extra\b/i,
    [/^Retrabalho\b/i, /^Pagando dia\b/i, /^Total Presente\b/i],
    overtimeCount || null
  );

  const presentLine = cleanedLines.find(line => /^Total Presente\b/i.test(line)) || '';
  const present = Number((presentLine.match(/(\d+)/) || [])[1] || 0);

  const trainingLine = cleanedLines.find(line => /^Treinamento\b/i.test(line)) || '';
  const trainingCount = Number((trainingLine.match(/(\d+)/) || [])[1] || 0);
  const trainingPeople = extractPeople(
    lines,
    /^Treinamento\b/i,
    [/^DDE\b/i, /^Qualidade\b/i, /^Entrega\b/i],
    trainingCount || null
  );

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

  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    date: selectedDate || todayISO(),
    shift: turnoMatch ? turnoMatch[1] : selectedShift,
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
  if (/limpeza|troca.*bobina|bobina.*troca|preventiva|treinamento|maquina preparada para amostras/.test(key)) return 'routine';
  if (/falta (de )?(m\.o|mao de obra)/.test(key)) return 'labor';
  if (/quebra|quebrou|mangueira|romp/.test(key)) return 'breakdown';
  if (/vazando|vazamento|vedacao|vedando/.test(key)) return 'leak';
  if (/variacao/.test(key)) return 'variation';
  if (/alarme|lubrificacao/.test(key)) return 'alarm';
  if (/danific|impressao.*ruim|marcas/.test(key)) return 'quality';
  if (/estourando|enroscando|voltando|retornando/.test(key)) return 'instability';
  if (/falta faixa|falta fundo/.test(key)) return 'missing';
  if (/ajuste|calco|faca|tampao|garra|saida|patino|mola/.test(key)) return 'adjustment';
  return 'other';
}

function suggestedAction(machine, categories) {
  const joined = machine.incidents.map(i => normalizeKey(i.description)).join(' | ');
  const suggestions = [];

  if (categories.includes('breakdown')) suggestions.push('Inspecionar o componente quebrado, eliminar a causa e substituir o item danificado.');
  if (categories.includes('leak')) suggestions.push('Verificar vedação, assentamento, folgas e condição do tampão/conexões; confirmar ausência de novo vazamento.');
  if (categories.includes('variation')) suggestions.push('Executar análise de causa da variação, conferindo referências, folgas, sincronismo e padrão de regulagem.');
  if (categories.includes('alarm')) suggestions.push('Diagnosticar o circuito do alarme, confirmar lubrificação e registrar a causa encontrada.');
  if (categories.includes('quality')) suggestions.push('Verificar origem do defeito de qualidade e validar amostras após a correção.');
  if (categories.includes('instability')) suggestions.push('Investigar recorrência de enroscamento, retorno ou estouro, verificando alinhamento, tensão e passagem do material.');
  if (categories.includes('missing')) suggestions.push('Revisar sensores, alimentação, sincronismo e regulagem responsáveis por falta de faixa ou fundo.');
  if (categories.includes('adjustment')) suggestions.push('Padronizar a regulagem e verificar desgaste de faca, contrafaca, garra, estrela, saída e componentes relacionados.');

  if (/faca fundo/.test(joined)) suggestions.push('Conferir faca do fundo e contrafaca, registrando medida e posição final do ajuste.');
  if (/altura/.test(joined)) suggestions.push('Medir a altura antes e depois da intervenção para confirmar estabilidade.');
  if (/reservatorio de cola|cola faixa/.test(joined)) suggestions.push('Inspecionar mangueira, conexões e fixação do circuito de cola da faixa.');

  return [...new Set(suggestions)].join(' ');
}

function generateActions(analysis) {
  const actions = [];

  for (const machine of analysis.machines) {
    const relevant = machine.incidents.filter(incident => !['routine', 'labor'].includes(classifyIncident(incident.description)));
    if (!relevant.length) continue;

    const categories = [...new Set(relevant.map(incident => classifyIncident(incident.description)))];
    const significant = relevant.filter(incident => incident.minutes >= 20 || !['other'].includes(classifyIncident(incident.description)));
    if (!significant.length) continue;

    const relevantMinutes = relevant.reduce((sum, incident) => sum + incident.minutes, 0);
    const criticalCategory = categories.some(c => ['breakdown', 'leak', 'variation', 'alarm'].includes(c));
    const high = relevantMinutes >= 90 || categories.includes('breakdown') || (criticalCategory && relevantMinutes >= 45);
    const medium = relevantMinutes >= 20 || categories.some(c => ['quality', 'instability', 'missing', 'adjustment'].includes(c));
    const priority = high ? 'Alta' : medium ? 'Média' : 'Baixa';
    const type = categories.some(c => ['breakdown', 'leak', 'variation', 'alarm', 'quality'].includes(c)) || relevantMinutes >= 60 ? 'OS' : 'Ação';

    actions.push({
      id: uid(),
      approved: priority === 'Alta' || priority === 'Média',
      machine: machine.code,
      priority,
      type,
      responsible: findResponsible(analysis.date, analysis.shift),
      description: significant.map(i => i.description).join('; '),
      action: suggestedAction(machine, categories),
      recordedMinutes: relevantMinutes,
      categories
    });
  }

  if (analysis.laborShortageMachines.length >= 2) {
    actions.push({
      id: uid(),
      approved: true,
      machine: 'GESTÃO',
      priority: 'Alta',
      type: 'Gestão',
      responsible: 'Supervisor / Produção',
      description: `${analysis.laborShortageMachines.length} máquinas registradas sem mão de obra: ${analysis.laborShortageMachines.join(', ')}.`,
      action: 'Revisar distribuição do efetivo, prioridade das máquinas e necessidade de cobertura ou treinamento antes do próximo turno.',
      recordedMinutes: 0,
      categories: ['labor']
    });
  }

  if (analysis.trainingCount === 0 && analysis.trainingPeople.length) {
    actions.push({
      id: uid(),
      approved: true,
      machine: 'TREINAMENTO',
      priority: 'Média',
      type: 'Gestão',
      responsible: analysis.productionLeader,
      description: `O relatório informa treinamento 0, mas relaciona: ${analysis.trainingPeople.join(', ')}.`,
      action: 'Confirmar se os colaboradores estavam em treinamento e corrigir o apontamento para evitar divergência no efetivo.',
      recordedMinutes: 0,
      categories: ['data-quality']
    });
  }

  return actions.sort((a, b) => ({ Alta: 0, Média: 1, Baixa: 2 }[a.priority] - { Alta: 0, Média: 1, Baixa: 2 }[b.priority]));
}

function getScale() {
  try { return JSON.parse(localStorage.getItem(STORAGE.scale)) || []; }
  catch { return []; }
}

function saveScale(items) {
  localStorage.setItem(STORAGE.scale, JSON.stringify(items));
}

function findResponsible(date, shift) {
  const item = getScale().find(row => row.date === date && String(row.shift) === String(shift));
  return item?.leader || 'Líder da manutenção não definido';
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
  const lines = [];
  lines.push(`RELATÓRIO GERENCIAL - ${formatDate(analysis.date)} - ${analysis.shift}º TURNO`);
  lines.push(`Líder da produção: ${analysis.productionLeader}`);
  if (analysis.realized) lines.push(`Produção realizada: ${formatNumber(analysis.realized)} unidades.`);
  if (analysis.plan) lines.push(`Plano: ${formatNumber(analysis.plan)} unidades | Atingimento: ${analysis.attainment}% | Diferença: ${formatNumber(analysis.gap)} unidades.`);
  if (analysis.reportedOee) lines.push(`OEE informado: ${analysis.reportedOee}%.`);
  lines.push(`Presentes: ${analysis.present || 'não informado'} | Faltas: ${analysis.absenceCount} | Hora extra: ${analysis.overtimeCount}.`);
  lines.push(`Máquinas com ocorrência: ${analysis.machines.length} | Tempo somado registrado: ${formatMinutes(analysis.totalRecordedMinutes)}.`);
  if (analysis.laborShortageMachines.length) lines.push(`Sem mão de obra: ${analysis.laborShortageMachines.join(', ')}.`);
  const critical = state.actions.filter(a => a.priority === 'Alta' && a.machine !== 'GESTÃO');
  if (critical.length) lines.push(`Prioridades: ${critical.map(a => `${a.machine} - ${a.description}`).join(' | ')}`);
  return lines.join('\n');
}

function maintenanceMessage() {
  if (!state.analysis) return '';
  const analysis = state.analysis;
  const approved = state.actions.filter(a => a.approved);
  const responsible = findResponsible(analysis.date, analysis.shift);
  const lines = [
    `*AÇÕES DA MANUTENÇÃO - ${analysis.shift}º TURNO*`,
    `Data: ${formatDate(analysis.date)}`,
    `Produção: ${formatNumber(analysis.realized)} | OEE informado: ${analysis.reportedOee || '-'}%`,
    `Atingimento do plano: ${analysis.attainment ?? '-'}%`,
    `Responsável do turno: ${responsible}`,
    ''
  ];

  if (!approved.length) lines.push('Nenhuma ação aprovada.');
  approved.forEach(action => {
    const icon = action.priority === 'Alta' ? '🔴' : action.priority === 'Média' ? '🟡' : '🟢';
    lines.push(`${icon} *${action.machine}* - ${action.description}`);
    lines.push(`Ação: ${action.action}`);
    lines.push(`Responsável: ${action.responsible}`);
    lines.push('');
  });
  lines.push('_Mensagem gerada pelo TurnoSmart. Abertura no SGMan sujeita à aprovação._');
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

  $('analysisTitle').textContent = `${analysis.shift}º turno • ${formatDate(analysis.date)}`;
  const metrics = [
    ['Produção', analysis.realized ? formatNumber(analysis.realized) : '-', analysis.plan ? `Plano ${formatNumber(analysis.plan)}` : 'Plano não identificado'],
    ['OEE informado', analysis.reportedOee ? `${analysis.reportedOee}%` : '-', `Meta ${analysis.targetOee}%`],
    ['Atingimento', analysis.attainment != null ? `${analysis.attainment}%` : '-', analysis.gap != null ? `${formatNumber(analysis.gap)} abaixo do plano` : 'Sem comparação'],
    ['Faltas', analysis.absenceCount, analysis.absences.join(', ') || 'Sem nomes identificados'],
    ['Presentes', analysis.present || '-', 'Incluindo liderança, conforme relatório'],
    ['Máquinas', analysis.machines.length, 'Com registros no relatório'],
    ['Tempo somado', formatMinutes(analysis.totalRecordedMinutes), 'Ocorrências podem ser simultâneas'],
    ['Ações', state.actions.length, `${state.actions.filter(a => a.priority === 'Alta').length} de prioridade alta`]
  ];
  $('summaryCards').innerHTML = metrics.map(([label, value, note]) => `<div class="metric"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(String(note))}</small></div>`).join('');

  const notes = [];
  if (analysis.trainingCount === 0 && analysis.trainingPeople.length) notes.push(`<li><strong>Divergência:</strong> treinamento informado como zero, mas há ${analysis.trainingPeople.length} nomes relacionados.</li>`);
  if (analysis.plan && analysis.attainment != null && analysis.reportedOee && Math.abs(analysis.attainment - analysis.reportedOee) > 5) notes.push(`<li><strong>Conferência:</strong> o volume representa ${analysis.attainment}% do plano, enquanto o OEE informado foi ${analysis.reportedOee}%.</li>`);
  if (analysis.laborShortageMachines.length) notes.push(`<li><strong>Mão de obra:</strong> ${analysis.laborShortageMachines.length} máquinas registradas sem operador.</li>`);

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
      <td>${state.actions.filter(a => a.machine === machine.code).map(a => `<span class="badge ${priorityClass(a.priority)}">${a.priority}</span>`).join(' ') || '<span class="muted">Rotina/sem ação</span>'}</td>
    </tr>`).join('');
  $('machineTableWrap').innerHTML = `<table><thead><tr><th>Máquina</th><th>Tempo</th><th>Apontamentos</th><th>Classificação</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function priorityClass(priority) {
  return priority === 'Alta' ? 'high' : priority === 'Média' ? 'medium' : 'low';
}

function renderActions() {
  const has = !!state.analysis;
  $('emptyActions').classList.toggle('hidden', has);
  $('actionsContent').classList.toggle('hidden', !has);
  if (!has) return;

  const responsible = findResponsible(state.analysis.date, state.analysis.shift);
  $('responsibleBadge').textContent = responsible;
  $('actionsList').innerHTML = state.actions.map((action, index) => `
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
          </div>
        </div>
      </div>
    </div>
  `).join('');

  $$('.action-card').forEach(card => {
    const action = state.actions.find(a => a.id === card.dataset.actionId);
    card.querySelector('.action-approved').addEventListener('change', e => action.approved = e.target.checked);
    card.querySelector('.action-text').addEventListener('input', e => action.action = e.target.value);
    card.querySelector('.action-priority').addEventListener('change', e => { action.priority = e.target.value; renderActions(); renderAnalysis(); });
    card.querySelector('.action-responsible').addEventListener('input', e => action.responsible = e.target.value);
  });
}

function renderScale() {
  const items = getScale().sort((a, b) => `${b.date}${b.shift}`.localeCompare(`${a.date}${a.shift}`));
  $('scaleList').innerHTML = items.length ? items.map(item => `
    <div class="list-item">
      <div>
        <h3>${formatDate(item.date)} • ${escapeHtml(String(item.shift))}º turno</h3>
        <p><strong>${escapeHtml(item.leader)}</strong>${item.team ? ` — ${escapeHtml(item.team)}` : ''}</p>
      </div>
      <div class="list-actions">
        <button class="ghost edit-scale" data-id="${item.id}">Editar</button>
        <button class="danger delete-scale" data-id="${item.id}">Excluir</button>
      </div>
    </div>
  `).join('') : '<div class="empty-state"><h2>Nenhuma escala cadastrada</h2><p>Cadastre o líder do próximo turno para atribuir as ações automaticamente.</p></div>';

  $$('.delete-scale').forEach(btn => btn.addEventListener('click', () => {
    saveScale(getScale().filter(item => item.id !== btn.dataset.id));
    renderScale();
    showToast('Escala excluída.');
  }));

  $$('.edit-scale').forEach(btn => btn.addEventListener('click', () => {
    const item = getScale().find(row => row.id === btn.dataset.id);
    if (!item) return;
    $('scaleDate').value = item.date;
    $('scaleShift').value = item.shift;
    $('scaleLeader').value = item.leader;
    $('scaleTeam').value = item.team || '';
    $('saveScaleBtn').dataset.editId = item.id;
    switchView('escala');
  }));
}

function renderHistory() {
  const history = getHistory();
  $('historyList').innerHTML = history.length ? history.map(item => `
    <div class="list-item">
      <div>
        <h3>${formatDate(item.date)} • ${escapeHtml(String(item.shift))}º turno</h3>
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
  return state.actions.filter(a => a.approved && a.type === 'OS').map(action => ({
    origem: 'TurnoSmart',
    data_relatorio: state.analysis.date,
    turno: state.analysis.shift,
    ativo: action.machine,
    tipo: 'Corretiva planejada',
    prioridade: action.priority,
    descricao: action.description,
    acao_sugerida: action.action,
    responsavel: action.responsible,
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
  const analysis = parseReport(text, $('reportDate').value, $('reportShift').value);
  state.analysis = analysis;
  state.actions = generateActions(analysis);

  const history = getHistory();
  history.unshift({
    id: analysis.id,
    date: analysis.date,
    shift: analysis.shift,
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
  $('reportDate').value = todayISO();
  $('scaleDate').value = todayISO();

  const draft = localStorage.getItem(STORAGE.draft);
  if (draft) $('reportText').value = draft;

  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
  $('analyzeBtn').addEventListener('click', analyzeCurrentReport);
  $('sampleBtn').addEventListener('click', () => { $('reportText').value = SAMPLE_REPORT; localStorage.setItem(STORAGE.draft, SAMPLE_REPORT); showToast('Exemplo carregado.'); });
  $('clearBtn').addEventListener('click', () => { $('reportText').value = ''; localStorage.removeItem(STORAGE.draft); });
  $('reportText').addEventListener('input', e => localStorage.setItem(STORAGE.draft, e.target.value));

  $('copySummaryBtn').addEventListener('click', () => copyText(managementSummaryText(state.analysis), 'Resumo copiado.'));
  $('copyActionsBtn').addEventListener('click', () => copyText(maintenanceMessage(), 'Mensagem da manutenção copiada.'));
  $('shareActionsBtn').addEventListener('click', async () => {
    const text = maintenanceMessage();
    if (navigator.share) {
      try { await navigator.share({ title: 'Ações da manutenção', text }); }
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

  $('saveScaleBtn').addEventListener('click', () => {
    const date = $('scaleDate').value;
    const shift = $('scaleShift').value;
    const leader = $('scaleLeader').value.trim();
    const team = $('scaleTeam').value.trim();
    if (!date || !leader) return showToast('Informe a data e o líder.');
    const items = getScale();
    const editId = $('saveScaleBtn').dataset.editId;
    const duplicateIndex = items.findIndex(item => item.date === date && item.shift === shift && item.id !== editId);
    const record = { id: editId || uid(), date, shift, leader, team };
    let updated;
    if (editId) updated = items.map(item => item.id === editId ? record : item);
    else if (duplicateIndex >= 0) updated = items.map((item, index) => index === duplicateIndex ? { ...record, id: item.id } : item);
    else updated = [record, ...items];
    saveScale(updated);
    delete $('saveScaleBtn').dataset.editId;
    $('scaleLeader').value = '';
    $('scaleTeam').value = '';
    renderScale();
    if (state.analysis) {
      const newResponsible = findResponsible(state.analysis.date, state.analysis.shift);
      state.actions.forEach(action => { if (action.machine !== 'GESTÃO' && action.machine !== 'TREINAMENTO') action.responsible = newResponsible; });
      renderActions();
    }
    showToast('Escala salva.');
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

  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

  renderAnalysis();
  renderActions();
  renderScale();
  renderHistory();
}

document.addEventListener('DOMContentLoaded', init);
