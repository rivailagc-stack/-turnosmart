'use strict';

const STORAGE = {
  history: 'turnosmart_history_v1',
  scale: 'turnosmart_scale_v1',
  draft: 'turnosmart_draft_v1',
  config: 'turnosmart_config_v3',
  sgmanConfirmed: 'turnosmart_sgman_confirmed_v1',
  sgmanLastResult: 'turnosmart_sgman_last_result_v1',
  sgmanHistory: 'turnosmart_sgman_history_v1',
  sgmanMachineHistory: 'turnosmart_sgman_machine_history_v1',
  training: 'turnosmart_training_v1',
  trainingProgress: 'turnosmart_training_progress_v1',
  trainingMedia: 'turnosmart_training_media_v1',
  liveDashboardHistory: 'turnosmart_live_dashboard_history_v1'
};


const STORAGE_HISTORY_LIMIT = 25;
const MAX_MAINTENANCE_ACTIONS = 5;
const MAX_PRODUCTION_ACTIONS = 3;
const MIN_HISTORY_SIMILARITY_SCORE = 25;
const MIN_SIMILAR_ORDERS_FOR_CONFIDENT_RESOLUTION = 2;

function isStorageQuotaError(error) {
  return Boolean(
    error &&
    (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014 ||
      /quota|storage.*full|exceeded/i.test(String(error.message || error))
    )
  );
}

function storageByteEstimate(value = '') {
  return String(value || '').length * 2;
}

function clearLargeLegacyCaches() {
  try {
    // A V31/V32 guardava até 100 OS completas de cada máquina no
    // localStorage. Esse conteúdo pode ultrapassar o limite do iPhone.
    localStorage.removeItem(STORAGE.sgmanMachineHistory);
  } catch {
    // Não interrompe o aplicativo caso o navegador bloqueie o storage.
  }

  try {
    const history = JSON.parse(
      localStorage.getItem(STORAGE.history) || '[]'
    );

    if (Array.isArray(history) && history.length > STORAGE_HISTORY_LIMIT) {
      localStorage.setItem(
        STORAGE.history,
        JSON.stringify(history.slice(0, STORAGE_HISTORY_LIMIT))
      );
    }
  } catch {
    try {
      localStorage.removeItem(STORAGE.history);
    } catch {
      // Sem ação.
    }
  }

  try {
    const lastResult = localStorage.getItem(STORAGE.sgmanLastResult);
    if (storageByteEstimate(lastResult) > 400000) {
      localStorage.removeItem(STORAGE.sgmanLastResult);
    }
  } catch {
    // Sem ação.
  }
}

function safeStorageSet(key, value, options = {}) {
  const serialized =
    typeof value === 'string'
      ? value
      : JSON.stringify(value);

  try {
    localStorage.setItem(key, serialized);
    return true;
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      console.warn(`Falha ao salvar ${key}:`, error);
      return false;
    }

    clearLargeLegacyCaches();

    try {
      localStorage.setItem(key, serialized);
      return true;
    } catch (retryError) {
      if (options.removeOnFailure) {
        try {
          localStorage.removeItem(key);
        } catch {
          // Sem ação.
        }
      }

      console.warn(
        `Espaço local insuficiente para salvar ${key}. ` +
        'O aplicativo continuará funcionando sem esse cache.',
        retryError
      );
      return false;
    }
  }
}

function compactTextForStorage(value = '', maximumLength = 12000) {
  const text = String(value || '');
  return text.length > maximumLength
    ? `${text.slice(0, maximumLength)}…`
    : text;
}

function compactAnalysisForStorage(analysis = {}) {
  const copy = {
    ...analysis,
    rawText: compactTextForStorage(analysis.rawText || '', 12000),
    oeeOcrText: compactTextForStorage(analysis.oeeOcrText || '', 8000)
  };

  // Evita que dados temporários ou imagens futuras sejam gravados no histórico.
  delete copy.imageDataUrl;
  delete copy.photoDataUrl;
  delete copy.oeeImageDataUrl;
  delete copy.rowPreviews;

  return copy;
}

function compactActionForStorage(action = {}) {
  const copy = {
    ...action,
    description: compactTextForStorage(action.description || '', 1000),
    action: compactTextForStorage(action.action || '', 1000),
    sgmanSuggestedResolution: compactTextForStorage(
      action.sgmanSuggestedResolution || '',
      1000
    )
  };

  // A análise resumida é útil; as 100 OS completas não são armazenadas aqui.
  if (copy.sgmanHistoryAnalysis) {
    copy.sgmanHistoryAnalysis = {
      machine: copy.sgmanHistoryAnalysis.machine || '',
      rootTag: copy.sgmanHistoryAnalysis.rootTag || '',
      treeMode: Boolean(copy.sgmanHistoryAnalysis.treeMode),
      treeTagCount: Number(copy.sgmanHistoryAnalysis.treeTagCount || 0),
      childTags: Array.isArray(copy.sgmanHistoryAnalysis.childTags)
        ? copy.sgmanHistoryAnalysis.childTags.slice(0, 20)
        : [],
      totalMachineOrders: Number(
        copy.sgmanHistoryAnalysis.totalMachineOrders || 0
      ),
      completedMachineOrders: Number(
        copy.sgmanHistoryAnalysis.completedMachineOrders || 0
      ),
      similarOrders: Number(
        copy.sgmanHistoryAnalysis.similarOrders || 0
      ),
      patterns: Array.isArray(copy.sgmanHistoryAnalysis.patterns)
        ? copy.sgmanHistoryAnalysis.patterns.slice(0, 5).map(pattern => ({
            key: pattern.key || '',
            label: compactTextForStorage(pattern.label || '', 200),
            shortLabel: compactTextForStorage(
              pattern.shortLabel || '',
              100
            ),
            count: Number(pattern.count || 0)
          }))
        : [],
      summary: compactTextForStorage(
        copy.sgmanHistoryAnalysis.summary || '',
        600
      ),
      resolution: compactTextForStorage(
        copy.sgmanHistoryAnalysis.resolution || '',
        600
      )
    };
  }

  delete copy.photoDataUrl;
  delete copy.imageDataUrl;
  delete copy.fotos;

  return copy;
}

const APP_VERSION = '98.5.0';

async function forceCurrentAppVersion() {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name.startsWith('turnosmart-') && name !== 'turnosmart-v98.5.0')
        .map(name => caches.delete(name))
    );
  } catch {
    // O navegador pode não disponibilizar CacheStorage.
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();

    if (registration) {
      await registration.update();
    }
  } catch {
    // A aplicação continua normalmente.
  }

  const badge = document.getElementById('appVersionBadge');
  if (badge) badge.textContent = `V${APP_VERSION}`;
}

function cleanupStorageOnStartup() {
  clearLargeLegacyCaches();

  try {
    const history = JSON.parse(
      localStorage.getItem(STORAGE.history) || '[]'
    );

    if (Array.isArray(history)) {
      const compact = history
        .slice(0, STORAGE_HISTORY_LIMIT)
        .map(record => ({
          ...record,
          analysis: compactAnalysisForStorage(record.analysis || {}),
          actions: Array.isArray(record.actions)
            ? record.actions.map(compactActionForStorage)
            : []
        }));

      safeStorageSet(
        STORAGE.history,
        JSON.stringify(compact),
        { removeOnFailure: true }
      );
    }
  } catch {
    try {
      localStorage.removeItem(STORAGE.history);
    } catch {
      // Sem ação.
    }
  }
}

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
  { username: 'Rosental.Lima', name: 'Rosental Lima', role: 'Líder Mantenedor', aliases: ['rosental', 'rosental lima'] },
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
    mtbfMinutes: null,
    reliabilityPercent: null,
    reliabilityBasis: '',
    failureCount: 0,
    completedRepairs: 0,
    repairIntervals: 0,
    failureIntervals: 0,
    recurrentMachines: 0,
    rows: [],
    note: 'Aguardando dados exclusivamente do SGMan.'
  },
  quickOsPhotoDataUrl: '',
  quickOsRecognition: null,
  quickOsListening: false,
  quickOsSending: false,
  quickOsContext: null,
  sgmanMachineHistory: {},
  sgmanMachineHistoryLoading: false,
  reportAnalyzing: false,
  backgroundAnalysisId: '',
  quickOsVoiceTranscript: '',
  quickOsVoiceParsed: null,
  teamPerformance: [],
  preventivePlan: [],
  visualTrainingDraft: null,
  liveTimer: null,
  improvementPlan: [],
  intelligenceOeeRows: [],
  intelligencePhotoName: '',
  intelligenceSeed: null,
  intelligenceReport: null,
  trainingItems: [],
  trainingProgress: [],
  trainingCloudAvailable: false,
  trainingEditingId: '',
  visualTrainingCloudItems: [],
  visualTrainingCloudAvailable: false
};

const $ = id => document.getElementById(id);

let intelligenceModuleInitialized = false;

function safeSwitchView(name) {
  const target = document.getElementById(`view-${name}`);

  if (!target) {
    console.warn(`Tela não encontrada: ${name}`);
    return false;
  }

  document.querySelectorAll('.view').forEach(view => {
    view.classList.toggle('active', view === target);
  });

  document.querySelectorAll('.nav-btn').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.view === name
    );
  });

  window.scrollTo({ top: 0, behavior: 'auto' });
  return true;
}

async function initializeIntelligenceOnlyWhenNeeded() {
  if (intelligenceModuleInitialized) return;

  intelligenceModuleInitialized = true;

  try {
    initFocusedManagementPage();
  } catch (error) {
    intelligenceModuleInitialized = false;
    console.error('Falha ao iniciar Inteligência:', error);

    const status = document.getElementById('focusedPlanStatus');
    if (status) {
      status.textContent =
        `A aba Inteligência não iniciou: ${error.message}. As demais páginas continuam disponíveis.`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Delegação independente: funciona mesmo se qualquer outro módulo falhar.
  document.addEventListener('click', event => {
    const button = event.target.closest('.nav-btn[data-view]');
    if (!button) return;

    event.preventDefault();

    const viewName = button.dataset.view;
    switchView(viewName);
  });

  // A aplicação sempre começa no relatório original.
  safeSwitchView('painel');
}, { once: true });

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
  const date=new Date(`${operationalDate}T12:00:00`);
  const names=['DOMINGO','SEGUNDA','TERÇA','QUARTA','QUINTA','SEXTA','SÁBADO'];
  const dayName=names[date.getDay()]||'DIA';
  const shiftLabel=String(shift)==='2'?'B':'A';
  return {
    dayName,
    shiftLabel,
    label:`${dayName} ${shiftLabel}`,
    columnIndex:boardColumnIndex(operationalDate,shift)
  };
}

function getConfig() {
  const defaults = {
    organization: {
      companyName: 'Ecopack Brasil',
      unitName: 'Indaiatuba',
      departmentName: 'Manutenção',
      sectorName: 'Produção',
      timezone: 'America/Sao_Paulo',
      productMode: 'ecopack'
    },
    targets: {
      oee: 70,
      mttrMinutes: 60,
      mtbfHours: 12,
      reliabilityPercent: 55,
      maxOverdueOrders: 20,
      maxRecurrenceMachines: 2
    },
    reportModules: {
      efficiencyTrend: true,
      sgmanSummary: true,
      reliability: true,
      priorities: true,
      accountability: true,
      people: true,
      preventive: true,
      oeeSupport: true
    },
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
      organization: {
        ...defaults.organization,
        ...(saved.organization || {})
      },
      targets: {
        ...defaults.targets,
        ...(saved.targets || {})
      },
      reportModules: {
        ...defaults.reportModules,
        ...(saved.reportModules || {})
      },
      sgmanTagMap: {
        ...defaults.sgmanTagMap,
        ...(saved.sgmanTagMap || {})
      }
    };
  }
  catch { return defaults; }
}

function saveConfig(config) {
  safeStorageSet(STORAGE.config, JSON.stringify(config));
}


function organizationProfile() {
  return getConfig().organization || {};
}

function companyDisplayName() {
  return organizationProfile().companyName || 'Ecopack Brasil';
}

function organizationContextText() {
  const profile = organizationProfile();

  return uniqueStrings([
    profile.companyName,
    profile.unitName,
    profile.departmentName
  ]).join(' • ');
}

function updateOrganizationBrand() {
  const profile = organizationProfile();

  const company = $('organizationBrandCompany');
  const context = $('organizationBrandContext');

  if (company) {
    company.textContent = profile.companyName || 'Ecopack Brasil';
  }

  if (context) {
    context.textContent = uniqueStrings([
      profile.unitName,
      profile.departmentName
    ]).join(' • ');
  }

  document.title =
    `${profile.companyName || 'Ecopack Brasil'} — TurnoSmart`;
}

function reportModuleEnabled(name) {
  return getConfig().reportModules?.[name] !== false;
}

function maintenanceTargets() {
  return getConfig().targets || {};
}

function exportOrganizationProfile() {
  const config = getConfig();

  downloadJson(
    `turnosmart-config-${normalizeKey(
      config.organization?.companyName || 'empresa'
    ).replace(/\s+/g, '-')}-${todayISO()}.json`,
    {
      format: 'turnosmart-company-profile',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      organization: config.organization,
      targets: config.targets,
      reportModules: config.reportModules,
      referenceDate: config.referenceDate,
      referenceLetter: config.referenceLetter,
      sgmanTipoServico: config.sgmanTipoServico,
      sgmanTipoManutencao: config.sgmanTipoManutencao,
      sgmanDuracaoEstimada: config.sgmanDuracaoEstimada,
      sgmanTagMap: config.sgmanTagMap,
      scale: getScale()
    }
  );
}

async function importOrganizationProfileFile(file) {
  const text = await file.text();
  const imported = JSON.parse(text);

  if (
    imported.format !== 'turnosmart-company-profile' ||
    !imported.organization
  ) {
    throw new Error('Arquivo de configuração inválido.');
  }

  const current = getConfig();

  saveConfig({
    ...current,
    organization: {
      ...current.organization,
      ...imported.organization
    },
    targets: {
      ...current.targets,
      ...(imported.targets || {})
    },
    reportModules: {
      ...current.reportModules,
      ...(imported.reportModules || {})
    },
    referenceDate:
      imported.referenceDate || current.referenceDate,
    referenceLetter:
      imported.referenceLetter || current.referenceLetter,
    sgmanTipoServico:
      imported.sgmanTipoServico || current.sgmanTipoServico,
    sgmanTipoManutencao:
      imported.sgmanTipoManutencao || current.sgmanTipoManutencao,
    sgmanDuracaoEstimada:
      imported.sgmanDuracaoEstimada || current.sgmanDuracaoEstimada,
    sgmanTagMap: {
      ...current.sgmanTagMap,
      ...(imported.sgmanTagMap || {})
    }
  });

  if (Array.isArray(imported.scale)) {
    saveScale(imported.scale);
  }

  return getConfig();
}

function fillOrganizationForm() {
  const config = getConfig();
  const profile = config.organization || {};
  const targets = config.targets || {};
  const modules = config.reportModules || {};

  const values = {
    organizationCompanyName: profile.companyName,
    organizationUnitName: profile.unitName,
    organizationDepartmentName: profile.departmentName,
    organizationSectorName: profile.sectorName,
    organizationTimezone: profile.timezone,
    targetOee: targets.oee,
    targetMttrMinutes: targets.mttrMinutes,
    targetMtbfHours: targets.mtbfHours,
    targetReliability: targets.reliabilityPercent,
    targetMaxOverdue: targets.maxOverdueOrders,
    targetMaxRecurrence: targets.maxRecurrenceMachines
  };

  Object.entries(values).forEach(([id, value]) => {
    const element = $(id);
    if (element) element.value = value ?? '';
  });

  Object.entries(modules).forEach(([name, checked]) => {
    const input = $(`reportModule-${name}`);
    if (input) input.checked = checked !== false;
  });

  updateOrganizationBrand();
}

function saveOrganizationSettings() {
  const current = getConfig();

  const moduleNames = [
    'efficiencyTrend',
    'sgmanSummary',
    'reliability',
    'priorities',
    'accountability',
    'people',
    'preventive',
    'oeeSupport'
  ];

  const reportModules = {};
  moduleNames.forEach(name => {
    const input = $(`reportModule-${name}`);
    reportModules[name] = input ? input.checked : true;
  });

  saveConfig({
    ...current,
    organization: {
      ...current.organization,
      companyName:
        $('organizationCompanyName')?.value.trim() ||
        'Ecopack Brasil',
      unitName:
        $('organizationUnitName')?.value.trim() ||
        'Indaiatuba',
      departmentName:
        $('organizationDepartmentName')?.value.trim() ||
        'Manutenção',
      sectorName:
        $('organizationSectorName')?.value.trim() ||
        'Produção',
      timezone:
        $('organizationTimezone')?.value ||
        'America/Sao_Paulo',
      productMode: 'ecopack'
    },
    targets: {
      oee: Number($('targetOee')?.value || 70),
      mttrMinutes: Number($('targetMttrMinutes')?.value || 60),
      mtbfHours: Number($('targetMtbfHours')?.value || 12),
      reliabilityPercent: Number(
        $('targetReliability')?.value || 55
      ),
      maxOverdueOrders: Number(
        $('targetMaxOverdue')?.value || 20
      ),
      maxRecurrenceMachines: Number(
        $('targetMaxRecurrence')?.value || 2
      )
    },
    reportModules
  });

  fillOrganizationForm();
  renderMaintenanceAccountabilityPanel();
  showToast('Empresa, metas e relatório salvos.');
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

function detectWorkingCrew(dateTimeValue = '') {
  const date = dateTimeValue ? new Date(dateTimeValue) : new Date();

  if (Number.isNaN(date.getTime())) {
    return {
      valid: false,
      reason: 'Data ou horário inválido.'
    };
  }

  const hour = date.getHours();
  let operationalDate = dateToISO(date);
  let shift;
  let schedule;

  if (hour < 6) {
    operationalDate = addDaysISO(operationalDate, -1);
    shift = '2';
    schedule = '18:00 às 06:00';
  } else if (hour < 18) {
    shift = '1';
    schedule = '06:00 às 18:00';
  } else {
    shift = '2';
    schedule = '18:00 às 06:00';
  }

  const letter = crewLetterForDate(operationalDate);
  const crew = `${letter}${shift}`;
  const scale = getScaleRecord(crew);
  const roster = findSgmanTeamExecutantes(crew);
  const leader = resolveSgmanUsername(scale.sgmanExecutante) ||
    String(scale.sgmanExecutante || '').trim();

  return {
    valid: true,
    date,
    operationalDate,
    shift,
    schedule,
    crew,
    leader,
    leaderName: scale.maintenanceLeader || '',
    roster,
    scale
  };
}

function populateQuickOsMachineSelect(selectedValue = '') {
  const select = $('quickOsMachine');
  if (!select) return;

  const config = getConfig();
  const machines = uniqueStrings([
    ...Object.keys(config.sgmanTagMap || {}),
    ...OEE_BOARD_MACHINES
  ]).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { numeric: true })
  );

  select.innerHTML = `
    <option value="">Selecione a máquina</option>
    ${machines.map(machine => {
      const hasTag = Boolean(config.sgmanTagMap?.[machine]);
      return `
        <option value="${escapeHtml(machine)}">
          ${escapeHtml(machine)}${hasTag ? '' : ' — TAG não cadastrada'}
        </option>`;
    }).join('')}
  `;

  if (selectedValue && machines.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

function updateQuickOsContext() {
  const context = detectWorkingCrew(
    $('quickOsDateTime')?.value || toLocalDateTimeInput(new Date())
  );

  state.quickOsContext = context;

  const card = $('quickOsDetection');
  const executanteSelect = $('quickOsExecutante');

  if (!context.valid) {
    if (card) {
      card.innerHTML = '<strong>Não foi possível identificar a equipe.</strong>';
    }
    if (executanteSelect) {
      executanteSelect.innerHTML = '<option value="">Não definido</option>';
    }
    return;
  }

  if (card) {
    card.innerHTML = `
      <strong>Equipe trabalhando: ${escapeHtml(context.crew)}</strong>
      <span>${escapeHtml(context.schedule)} • Data operacional ${escapeHtml(formatDate(context.operationalDate))}</span>
      <span>Líder automático: ${escapeHtml(
        context.leader
          ? sgmanUserLabel(context.leader)
          : 'não cadastrado'
      )}</span>`;
  }

  if (executanteSelect) {
    const roster = context.roster || [];
    executanteSelect.innerHTML = roster.length
      ? roster.map((username, index) => `
          <option value="${escapeHtml(username)}" ${index === 0 ? 'selected' : ''}>
            ${index === 0 ? 'Líder automático — ' : ''}${escapeHtml(sgmanUserLabel(username))}
          </option>
        `).join('')
      : '<option value="">Cadastre a equipe na Escala</option>';
  }
}

function detectQuickMachineFromText(text = '') {
  const machine = machineKeyFromText(text);
  if (!machine) return;

  populateQuickOsMachineSelect(machine);

  if ($('quickOsMachine')) {
    $('quickOsMachine').value = machine;
  }

  updateQuickOsTagStatus();
}

function updateQuickOsTagStatus() {
  const machine = $('quickOsMachine')?.value || '';
  const tag = getConfig().sgmanTagMap?.[machine] || '';
  const status = $('quickOsTagStatus');

  if (!status) return;

  if (!machine) {
    status.textContent = 'Escolha a máquina ou fale o código, por exemplo: “MK 172”.';
    status.className = 'integration-status';
  } else if (!tag) {
    status.textContent = `${machine}: TAG ainda não cadastrada na Configuração.`;
    status.className = 'integration-status error';
  } else {
    status.textContent = `${machine}: TAG SGMan ${tag}.`;
    status.className = 'integration-status success';
  }
}

async function compressQuickOsPhoto(file) {
  const original = await dataUrlFromFile(file);
  const image = await loadImageElement(original);

  const maxDimension = 1280;
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.width, image.height)
  );

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', 0.76);
}

function quickOsAutomaticResolution(problem = '') {
  const action = {
    description: problem,
    action: 'Verificar a causa, corrigir a falha e testar a máquina.'
  };

  return directMaintenanceAction(action)
    .replace(/\.$/, '')
    .trim();
}

function buildQuickSgmanOrder() {
  const dateTime = $('quickOsDateTime')?.value || '';
  const context = detectWorkingCrew(dateTime);
  const machine = $('quickOsMachine')?.value || '';
  const location = compactIssue($('quickOsLocation')?.value || '');
  const problem = compactIssue($('quickOsProblem')?.value || '');
  const manualResolution = compactIssue(
    $('quickOsResolution')?.value || ''
  );
  const executante = $('quickOsExecutante')?.value || context.leader || '';
  const priority = $('quickOsPriority')?.value || 'Média';
  const machineStopped = $('quickOsMachineStopped')?.checked ? 1 : 0;
  const tag = getConfig().sgmanTagMap?.[machine] || '';

  if (!context.valid) {
    return { error: 'Data ou horário inválido.' };
  }

  if (!machine) {
    return { error: 'Selecione a máquina.' };
  }

  if (!tag) {
    return {
      error: `Cadastre a TAG da ${machine} na tela Config.`
    };
  }

  if (!problem) {
    return {
      error: 'Escreva ou fale o problema encontrado.'
    };
  }

  if (!executante) {
    return {
      error: `Cadastre o líder da equipe ${context.crew} na Escala.`
    };
  }

  const resolution = manualResolution ||
    quickOsAutomaticResolution(problem);

  const serviceAction = {
    machine,
    description: problem,
    action: resolution
  };

  const config = getConfig();
  const tipoServicoConfig = String(
    config.sgmanTipoServico || 'AUTOMÁTICO'
  ).trim();

  const tipoManutencaoConfig = String(
    config.sgmanTipoManutencao || 'AUTOMÁTICO'
  ).trim();

  const timestamp = Date.now();

  const order = {
    data_programada: formatSgmanDateTime(
      dateTime ? new Date(dateTime) : new Date()
    ),
    qtd_executantes: 1,
    tag,
    prioridade: priority,
    id_ext: `turnosmart-rapida-${timestamp}-${machine}`.slice(0, 100),
    pendente: 1,
    duracao_estimada: String(
      config.sgmanDuracaoEstimada || '01:00'
    ),
    descricao: `${machine}${location ? ` - ${location}` : ''} - ${problem}`.slice(0, 500),
    comentario: `Lembretes: ${compactSgmanReminders(resolution)}.`.slice(0, 260),
    maquina_parada: machineStopped,
    executante,
    tipo_servico:
      normalizeKey(tipoServicoConfig) === 'automatico'
        ? automaticSgmanServiceType(serviceAction)
        : tipoServicoConfig,
    tipo_manutencao:
      normalizeKey(tipoManutencaoConfig) === 'automatico'
        ? automaticSgmanMaintenanceType(serviceAction)
        : tipoManutencaoConfig
  };

  if (state.quickOsPhotoDataUrl) {
    order.fotos = [
      {
        base64: state.quickOsPhotoDataUrl
      }
    ];
  }

  return {
    order,
    context,
    machine,
    location,
    problem,
    resolution
  };
}

function renderQuickOsResult(data) {
  const target = $('quickOsResult');
  if (!target) return;

  const result = Array.isArray(data?.results)
    ? data.results[0]
    : null;

  if (!result) {
    target.textContent = JSON.stringify(data, null, 2);
    return;
  }

  const orderNumber = result.order_number || result.order_id || '';
  const label = resultStatusLabel(result.status);
  const responseText = typeof result.response === 'string'
    ? result.response
    : JSON.stringify(result.response, null, 2);

  target.innerHTML = `
    <div class="sgman-result-row ${escapeHtml(result.status)}">
      <strong>${label} — ${escapeHtml(result.machine || result.tag || '-')}</strong>
      ${orderNumber ? `<span>OS: ${escapeHtml(String(orderNumber))}</span>` : ''}
      <span><strong>Executante:</strong> ${escapeHtml(result.executante || '-')}</span>
      <span>${escapeHtml(result.reason || '')}</span>
      <details>
        <summary>Ver resposta do SGMan</summary>
        <pre>${escapeHtml(responseText || 'Resposta vazia')}</pre>
      </details>
    </div>`;
}

function clearQuickOsForm(keepContext = true) {
  $('quickOsProblem').value = '';
  $('quickOsLocation').value = '';
  $('quickOsResolution').value = '';
  $('quickOsVoiceReview').innerHTML = '';
  $('quickOsPhotoInput').value = '';
  $('quickOsPhotoPreview').src = '';
  $('quickOsPhotoWrap').classList.add('hidden');
  $('quickOsSpeechStatus').textContent = '';
  state.quickOsPhotoDataUrl = '';

  if (!keepContext) {
    $('quickOsMachine').value = '';
  }

  updateQuickOsTagStatus();
}

async function sendQuickOsToSgman() {
  if (state.quickOsSending) {
    showToast('A OS já está sendo enviada.');
    return;
  }

  const built = buildQuickSgmanOrder();

  if (built.error) {
    showToast(built.error);
    $('quickOsResult').textContent = built.error;
    return;
  }

  const { order, context, resolution } = built;

  const confirmed = window.confirm(
    `Criar esta OS no SGMan?\n\n` +
    `Equipe: ${context.crew}\n` +
    `Executante: ${order.executante}\n` +
    `Máquina: ${order.tag}\n` +
    `Descrição: ${order.descricao}\n` +
    `Comentário: ${order.comentario}\n` +
    `Foto: ${order.fotos?.length ? 'sim' : 'não'}`
  );

  if (!confirmed) return;

  const button = $('quickOsSendBtn');

  try {
    state.quickOsSending = true;
    button.disabled = true;
    button.textContent = 'Enviando...';
    $('quickOsResult').textContent =
      'Enviando uma OS ao SGMan...';

    const response = await fetch('/api/sgman', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orders: [order]
      })
    });

    const data = await response.json().catch(() => ({
      ok: false,
      error: 'Resposta inválida do conector.'
    }));

    if (!response.ok) {
      throw new Error(data.error || `Erro HTTP ${response.status}`);
    }

    renderQuickOsResult(data);

    const confirmedResult = (data.results || []).some(
      result => result.status === 'confirmed'
    );

    if (confirmedResult) {
      showToast('OS aberta e confirmada pelo SGMan.');
      clearQuickOsForm(true);
      await refreshSgmanHistory(false);
    } else {
      showToast('O SGMan não confirmou a abertura. Veja a resposta.');
    }
  } catch (error) {
    $('quickOsResult').textContent =
      `Falha ao abrir a OS: ${error.message}`;
    showToast('Falha ao abrir a OS.');
  } finally {
    state.quickOsSending = false;
    button.disabled = false;
    button.textContent = 'Criar OS no SGMan';
  }
}

function findAssigneeInSpeech(text = '') {
  const key = normalizeKey(text);
  for (const user of SGMAN_MAINTENANCE_USERS) {
    for (const candidate of [user.name, user.username, ...(user.aliases || [])]) {
      const c = normalizeKey(candidate);
      if (c && (key.includes(`para ${c}`) || key.includes(`pro ${c}`) || key.includes(`mandar ${c}`) || key.includes(`enviar ${c}`) || key.includes(`responsavel ${c}`))) return user.username;
    }
  }
  return '';
}

function extractQuickOsLocation(text = '') {
  const raw=String(text||'');
  const patterns=[
    /(?:onde|local|aplica[cç][aã]o|aplicado|aplicar|no conjunto|na parte|no setor)\s*(?:é|será|vai ser|:)?\s*([^,.]+?)(?=\s+(?:problema|defeito|falha|mandar|enviar|respons[aá]vel|para|pro)\b|[,.]|$)/i,
    /(?:mk\s*[-:]?\s*\d+)\s+([^,.]+?)(?=\s+(?:problema|defeito|falha|mandar|enviar|respons[aá]vel|para|pro)\b|[,.]|$)/i
  ];
  for (const p of patterns) { const v=raw.match(p)?.[1]?.trim(); if(v&&v.length>=3) return v; }
  return '';
}

function extractQuickOsProblem(text = '') {
  const raw=String(text||'');
  const explicit=raw.match(/(?:problema|defeito|falha)\s*(?:é|:)?\s*([\s\S]*?)(?=\s+(?:mandar|enviar|respons[aá]vel|para|pro)\b|$)/i)?.[1]?.trim();
  if(explicit) return explicit;
  return raw.replace(/\b(?:abrir|criar|fazer)\s+(?:uma\s+)?(?:ordem|os|ordem de servi[cç]o)\b/gi,'')
    .replace(/\bmk\s*[-:]?\s*\d+\b/gi,'')
    .replace(/\b(?:mandar|enviar|respons[aá]vel)\s+(?:para|pro)?\s*[\p{L}._-]+(?:\s+[\p{L}._-]+)?/giu,'')
    .replace(/\s+/g,' ').replace(/^[,.;\s-]+|[,.;\s-]+$/g,'').trim();
}

function parseQuickOsVoiceCommand(text='') {
  return { transcript:String(text||'').trim(), machine:machineKeyFromText(text), location:extractQuickOsLocation(text), problem:extractQuickOsProblem(text), executante:findAssigneeInSpeech(text) };
}

function applyQuickOsVoiceCommand(parsed) {
  if (!parsed) return;
  state.quickOsVoiceParsed=parsed; state.quickOsVoiceTranscript=parsed.transcript||'';
  if(parsed.machine){ populateQuickOsMachineSelect(parsed.machine); $('quickOsMachine').value=parsed.machine; }
  $('quickOsLocation').value=parsed.location||'';
  if(parsed.problem) $('quickOsProblem').value=parsed.problem;
  updateQuickOsContext();
  if(parsed.executante){
    const select=$('quickOsExecutante');
    if(![...select.options].some(o=>o.value===parsed.executante)){
      const o=document.createElement('option'); o.value=parsed.executante; o.textContent=sgmanUserLabel(parsed.executante); select.appendChild(o);
    }
    select.value=parsed.executante;
  }
  updateQuickOsTagStatus();
  $('quickOsVoiceReview').innerHTML=`<strong>Entendido pelo áudio</strong><span>Máquina: ${escapeHtml(parsed.machine||'não identificada')}</span><span>Local: ${escapeHtml(parsed.location||'não informado')}</span><span>Problema: ${escapeHtml(parsed.problem||'não identificado')}</span><span>Responsável: ${escapeHtml(parsed.executante?sgmanUserLabel(parsed.executante):'líder automático do turno')}</span>`;
}

function startQuickOsSpeech() {
  const Recognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!Recognition) {
    $('quickOsSpeechStatus').textContent =
      'O reconhecimento de voz não está disponível neste navegador. Digite o problema no campo abaixo.';
    showToast('Ditado por voz não disponível.');
    return;
  }

  if (state.quickOsListening && state.quickOsRecognition) {
    state.quickOsRecognition.stop();
    return;
  }

  const recognition = new Recognition();
  state.quickOsRecognition = recognition;
  recognition.lang = 'pt-BR';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';

  recognition.onstart = () => {
    state.quickOsListening = true;
    $('quickOsSpeechBtn').textContent = 'Parar áudio';
    $('quickOsSpeechStatus').textContent =
      'Ouvindo... fale máquina, local, problema e responsável.';
  };

  recognition.onresult = event => {
    let interimTranscript = '';
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalTranscript += `${transcript} `;
      else interimTranscript += transcript;
    }
    const combined=`${finalTranscript || interimTranscript}`.replace(/\s+/g,' ').trim();
    applyQuickOsVoiceCommand(parseQuickOsVoiceCommand(combined));
    $('quickOsSpeechStatus').textContent='Ouvindo... fale máquina, local, problema e responsável.';
  };

  recognition.onerror = event => {
    const messages = {
      'not-allowed': 'Permissão do microfone negada.',
      'no-speech': 'Nenhuma fala foi detectada.',
      'audio-capture': 'Microfone não encontrado.',
      network: 'Falha de rede durante o reconhecimento.'
    };

    $('quickOsSpeechStatus').textContent =
      messages[event.error] ||
      `Não foi possível reconhecer o áudio: ${event.error}.`;
  };

  recognition.onend = () => {
    state.quickOsListening = false;
    $('quickOsSpeechBtn').textContent = 'Falar ordem completa';
    $('quickOsProblem').dataset.beforeSpeech = '';
    $('quickOsSpeechStatus').textContent =
      state.quickOsVoiceTranscript
        ? 'Áudio interpretado. Confira os campos e envie a OS.'
        : 'O áudio terminou sem texto reconhecido.';
  };

  $('quickOsProblem').dataset.beforeSpeech =
    $('quickOsProblem').value.trim();

  recognition.start();
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
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeMachineCode(value = '') {
  const raw = normalizeKey(String(value ?? ''))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) return '';

  // Usa primeiro o identificador já reconhecido pelo restante do app.
  try {
    const detected = machineKeyFromText(raw);
    if (detected) return String(detected).toUpperCase();
  } catch {
    // Continua com a extração direta abaixo.
  }

  // Reconhece formatos como MK179, MK-179, M.179, máquina 179 e tags da árvore.
  const explicit = raw.match(/\b(?:mk|m|maquina|máquina)\s*[.:-]?\s*(\d{1,4})\b/i);
  if (explicit) return `MK-${Number(explicit[1])}`;

  // Em tags como “alimentação faixa 179”, utiliza o número final.
  const numbers = [...raw.matchAll(/\b(\d{1,4})\b/g)];
  if (numbers.length) {
    return `MK-${Number(numbers[numbers.length - 1][1])}`;
  }

  return raw.toUpperCase();
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


// ORDEM FIXA DAS LINHAS DO QUADRO DA ECOPACK.
// A primeira linha visível é MK-138.
// MK-02 e MK-08 ficam no cabeçalho/área superior e NÃO pertencem
// à grade usada para associar OEE por máquina.
const OEE_BOARD_MACHINES = [
  'MK-138', 'MK-105', 'MK-108', 'MK-223', 'MK-192',
  'MK-69', 'MK-172', 'MK-173', 'MK-178', 'MK-179',
  'MK-212', 'MK-214', 'MK-217', 'MK-220', 'MK-159',
  'MK-222', 'MK-170', 'MK-176', 'MK-188', 'MK-149'
];

// ==========================================================
// REGRA OFICIAL DE PRIORIDADE DO TURNO — V80
// A prioridade atual vem SOMENTE do OEE confirmado da foto.
// Relatório da produção explica o problema.
// SGMan orienta o que verificar.
// Power BI serve como tendência/histórico.
// ==========================================================
const OEE_SHIFT_HOURS = 12;
const OEE_PRIORITY_LIMIT = 65;
const OEE_MAX_PRIORITY_LIMIT = 50;
const OEE_AUTO_CONFIDENCE_MIN = 60;

function oeeLostHours(oee){
  const value=Number(oee);
  if(!Number.isFinite(value))return null;
  const bounded=Math.max(0,Math.min(100,value));
  return OEE_SHIFT_HOURS*(1-bounded/100);
}

function formatOeeLostHours(oee){
  const hours=oeeLostHours(oee);
  return hours===null
    ? '—'
    : `${hours.toFixed(1).replace('.', ',')} h`;
}

function oeePriorityMeta(oee){
  const value=Number(oee);

  if(!Number.isFinite(value) || value>=OEE_PRIORITY_LIMIT){
    return {
      eligible:false,
      key:'none',
      label:'Sem prioridade',
      icon:'🟢'
    };
  }

  if(value<=OEE_MAX_PRIORITY_LIMIT){
    return {
      eligible:true,
      key:'max',
      label:'PRIORIDADE MÁXIMA',
      icon:'🔴'
    };
  }

  return {
    eligible:true,
    key:'high',
    label:'PRIORIDADE ALTA',
    icon:'🟠'
  };
}

function oeeObjectiveActions(specificActions=[],oee=null){
  const meta=oeePriorityMeta(oee);

  const base=meta.key==='max'
    ? [
        'Atuar imediatamente e resolver durante o turno.',
        'Não deixar o problema continuar para o próximo turno.'
      ]
    : [
        'Analisar e resolver durante o turno.',
        'Não deixar o problema continuar para o próximo turno.'
      ];

  return uniqueStrings([
    ...base,
    ...specificActions.slice(0,2),
    'Testar em produção, confirmar estabilidade e registrar a causa real no SGMan.'
  ]).slice(0,5);
}


function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function boardColumnIndex(operationalDate, shift) {
  const date=new Date(`${operationalDate}T12:00:00`);
  const day=date.getDay();
  const weekdayIndex=Math.max(0,Math.min(5,day-1));
  const shiftOffset=String(shift)==='2'?1:0;
  return weekdayIndex*2+shiftOffset;
}

function getOeeBoardGeometry(image, operationalDate, shift) {
  return {
    imageWidth: image.naturalWidth || image.width,
    imageHeight: image.naturalHeight || image.height,

    // Foto inteira. Estes limites são apenas coordenadas de análise.
    boardLeftRatio: 0.035,
    boardRightRatio: 0.995,
    rowsTopRatio: 0.155,
    rowsBottomRatio: 0.97,

    // Monday A/B ... Friday A/B = 10 posições esperadas.
    targetColumnIndex: boardColumnIndex(operationalDate, shift),
    expectedColumnCount: 10,

    scope: boardScopeForReport(operationalDate, shift)
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
  const geometry = getOeeBoardGeometry(image, operationalDate, shift);

  // PRÉVIA: foto inteira, sem nenhum corte.
  const previewCanvas = document.createElement('canvas');
  const previewCtx = previewCanvas.getContext('2d');

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const previewScale = Math.min(1, 1400 / Math.max(1, naturalWidth));

  const previewWidth = Math.max(1, Math.round(naturalWidth * previewScale));
  const previewHeight = Math.max(1, Math.round(naturalHeight * previewScale));

  previewCanvas.width = previewWidth;
  previewCanvas.height = previewHeight;
  previewCtx.fillStyle = '#ffffff';
  previewCtx.fillRect(0, 0, previewWidth, previewHeight);
  previewCtx.imageSmoothingEnabled = true;
  previewCtx.imageSmoothingQuality = 'high';
  previewCtx.drawImage(
    image,
    0, 0, naturalWidth, naturalHeight,
    0, 0, previewWidth, previewHeight
  );

  // OCR: também usa a foto inteira.
  // Apenas aumenta/reduz a resolução para melhorar desempenho.
  const desiredWidth = Math.max(
    1800,
    Math.min(2800, naturalWidth * 1.35)
  );
  const ocrScale = desiredWidth / Math.max(1, naturalWidth);
  const ocrWidth = Math.max(1, Math.round(naturalWidth * ocrScale));
  const ocrHeight = Math.max(1, Math.round(naturalHeight * ocrScale));

  const ocrCanvas = document.createElement('canvas');
  const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true });
  ocrCanvas.width = ocrWidth;
  ocrCanvas.height = ocrHeight;

  ocrCtx.fillStyle = '#ffffff';
  ocrCtx.fillRect(0, 0, ocrWidth, ocrHeight);
  ocrCtx.imageSmoothingEnabled = true;
  ocrCtx.imageSmoothingQuality = 'high';
  ocrCtx.drawImage(
    image,
    0, 0, naturalWidth, naturalHeight,
    0, 0, ocrWidth, ocrHeight
  );

  const imageData = ocrCtx.getImageData(0, 0, ocrWidth, ocrHeight);
  const pixels = imageData.data;

  // Tratamento leve em TODA a foto.
  // Não remove cabeçalho, bordas ou colunas.
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    let value;

    if (saturation < 15 && luminance > 155) {
      value = 255;
    } else if (saturation >= 18) {
      value = clampByte(luminance * 0.62 - saturation * 0.48 + 38);
    } else {
      value = clampByte((luminance - 105) * 1.5 + 105);
    }

    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }

  ocrCtx.putImageData(imageData, 0, 0);

  return {
    geometry,
    canvas: ocrCanvas,
    previewCanvas,
    previewDataUrl: previewCanvas.toDataURL('image/jpeg', 0.94),
    ocrDataUrl: ocrCanvas.toDataURL('image/png'),
    // V81: não cria mais recortes por linha.
    rowPreviews: []
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

function mapOcrWordsToMachineRows(
  words = [],
  canvasHeight = 1,
  canvasWidth = 1,
  geometry = null
) {
  const rowCount = OEE_BOARD_MACHINES.length;

  const safeGeometry = geometry || {
    boardLeftRatio: 0.035,
    boardRightRatio: 0.995,
    rowsTopRatio: 0.155,
    rowsBottomRatio: 0.97,
    targetColumnIndex: 0,
    expectedColumnCount: 10
  };

  const rowsTop = canvasHeight * safeGeometry.rowsTopRatio;
  const rowsBottom = canvasHeight * safeGeometry.rowsBottomRatio;
  const rowsHeight = Math.max(1, rowsBottom - rowsTop);
  const rowHeight = rowsHeight / rowCount;

  const boardLeft = canvasWidth * safeGeometry.boardLeftRatio;
  const boardRight = canvasWidth * safeGeometry.boardRightRatio;

  const allCandidates = [];

  for (const word of words) {
    const parsed = numericOeeFromWord(word.text);
    if (!parsed) continue;

    const value = Number(parsed.value);
    if (!Number.isFinite(value) || value < 20 || value > 100) continue;

    const bbox = word.bbox || {};
    const x0 = Number(bbox.x0 ?? bbox.left ?? 0);
    const x1 = Number(bbox.x1 ?? bbox.right ?? x0);
    const y0 = Number(bbox.y0 ?? bbox.top ?? 0);
    const y1 = Number(bbox.y1 ?? bbox.bottom ?? y0);

    const centerX = (x0 + x1) / 2;
    const centerY = (y0 + y1) / 2;

    if (centerX < boardLeft || centerX > boardRight) continue;
    if (centerY < rowsTop || centerY > rowsBottom) continue;

    allCandidates.push({
      value,
      hasPercent: parsed.hasPercent,
      confidence: Number(word.confidence || 0),
      x: centerX,
      y: centerY,
      raw: String(word.text || '').trim()
    });
  }

  // Descobre as colunas do quadro usando a posição X dos próprios OEE.
  const sortedByX = [...allCandidates].sort((a, b) => a.x - b.x);
  const xTolerance = Math.max(20, canvasWidth * 0.032);
  const clusters = [];

  for (const item of sortedByX) {
    let cluster = clusters.find(entry =>
      Math.abs(entry.centerX - item.x) <= xTolerance
    );

    if (!cluster) {
      cluster = { centerX: item.x, items: [] };
      clusters.push(cluster);
    }

    cluster.items.push(item);
    cluster.centerX =
      cluster.items.reduce((sum, candidate) => sum + candidate.x, 0) /
      cluster.items.length;
  }

  const usefulClusters = clusters
    .filter(cluster => cluster.items.length >= 3)
    .sort((a, b) => a.centerX - b.centerX);

  let targetCluster = null;

  if (usefulClusters.length === 1) {
    targetCluster = usefulClusters[0];
  } else if (usefulClusters.length > 1) {
    const expectedCount = Number(safeGeometry.expectedColumnCount || 10);
    const targetIndex = Math.max(
      0,
      Math.min(
        expectedCount - 1,
        Number(safeGeometry.targetColumnIndex || 0)
      )
    );

    // Se o OCR encontrou quase todas as colunas, usa o índice diretamente.
    if (
      usefulClusters.length >= 8 &&
      targetIndex < usefulClusters.length
    ) {
      targetCluster = usefulClusters[targetIndex];
    } else {
      // Se faltaram colunas, estima a posição dentro da faixa detectada.
      const ratio =
        targetIndex / Math.max(1, expectedCount - 1);

      const firstX = usefulClusters[0].centerX;
      const lastX = usefulClusters[usefulClusters.length - 1].centerX;
      const expectedX = firstX + (lastX - firstX) * ratio;

      targetCluster = [...usefulClusters].sort(
        (a, b) =>
          Math.abs(a.centerX - expectedX) -
          Math.abs(b.centerX - expectedX)
      )[0];
    }
  }

  let selectedCandidates = allCandidates;

  if (targetCluster) {
    const selectedTolerance = Math.max(
      32,
      canvasWidth * 0.047
    );

    selectedCandidates = allCandidates.filter(item =>
      Math.abs(item.x - targetCluster.centerX) <= selectedTolerance
    );
  }

  const rowBuckets = Array.from(
    { length: rowCount },
    () => []
  );

  for (const item of selectedCandidates) {
    const relativeY = item.y - rowsTop;
    const rowIndex = Math.floor(relativeY / rowHeight);

    if (rowIndex < 0 || rowIndex >= rowCount) continue;

    const rowTop = rowsTop + rowIndex * rowHeight;
    const positionInsideRow = (item.y - rowTop) / rowHeight;

    // Margem pequena apenas para não pegar número sobre divisória.
    if (positionInsideRow < 0.03 || positionInsideRow > 0.97) continue;

    rowBuckets[rowIndex].push(item);
  }

  return OEE_BOARD_MACHINES.map((machine, index) => {
    const candidates = rowBuckets[index];

    if (!candidates.length) {
      return {
        machine,
        oee: '',
        candidateOee: '',
        confidence: 0,
        source: 'Não identificado',
        needsConfirmation: false,
        ambiguous: false
      };
    }

    candidates.sort((a, b) => {
      // Percentual explícito é melhor, mas manuscrito sem % também vale.
      if (a.hasPercent !== b.hasPercent) {
        return a.hasPercent ? -1 : 1;
      }
      if (a.confidence !== b.confidence) {
        return b.confidence - a.confidence;
      }
      return b.x - a.x;
    });

    const chosen = candidates[0];

    const conflicting = candidates.filter(item =>
      Math.abs(Number(item.value) - Number(chosen.value)) > 5
    );

    const ambiguous = conflicting.some(item =>
      item.hasPercent ||
      Number(item.confidence || 0) >= 55
    );

    const highConfidence =
      Number(chosen.confidence || 0) >= OEE_AUTO_CONFIDENCE_MIN;

    // IMPORTANTÍSSIMO:
    // o número provável aparece no campo mesmo quando precisa revisão.
    return {
      machine,
      oee: chosen.value,
      candidateOee: chosen.value,
      confidence: chosen.confidence,
      source: chosen.raw,
      needsConfirmation: ambiguous || !highConfidence,
      ambiguous
    };
  });
}

function renderOeeMachineEditor(rows=state.oeeMachineEditorData){
  const wrap=$('oeeMachineEditor');
  if(!wrap)return;

  state.oeeMachineEditorData=
    OEE_BOARD_MACHINES.map(machine=>{
      return (rows||[]).find(row=>row.machine===machine)||{
        machine,
        oee:'',
        candidateOee:'',
        confidence:0,
        source:'',
        needsConfirmation:false,
        description:'Sem leitura.'
      };
    });

  wrap.innerHTML=`
    <div class="oee-editor-head">
      <strong>OEE lido da foto</strong>
      <span class="muted">
        Preenche apenas quando as leituras locais concordam. Sem consenso = vazio.
      </span>
    </div>

    <div class="oee-editor-grid">
      ${state.oeeMachineEditorData.map((row,index)=>{
        const n=Number(row.oee);

        const displayed=
          row.oee!=='' &&
          Number.isFinite(n)
            ?n
            :'';

        const css=
          displayed===''
            ?'confidence-empty'
            :'confidence-good';

        const preview=
          state.oeeRowPreviews?.[index]||'';

        return `
          <label class="oee-editor-row ${css}">
            <span class="oee-machine-name">
              ${escapeHtml(row.machine)}
            </span>

            ${
              preview
                ?`<img
                    class="oee-row-preview"
                    src="${preview}"
                    alt="${escapeHtml(row.machine)}"
                  />`
                :''
            }

            <input
              class="oee-editor-input"
              data-index="${index}"
              type="number"
              min="0"
              max="100"
              step="0.1"
              inputmode="decimal"
              value="${displayed===''?'':escapeHtml(String(displayed))}"
              placeholder="-"
            />

            <small class="oee-read-status">
              ${
                displayed===''
                  ?'Não confirmado'
                  :`${String(displayed).replace('.',',')}% — consenso local`
              }
            </small>

            <div class="oee-read-description">
              ${escapeHtml(
                row.description||
                row.source||
                'Sem descrição.'
              )}
            </div>
          </label>
        `;
      }).join('')}
    </div>
  `;

  $$('.oee-editor-input').forEach(input=>{
    const confirm=event=>{
      const index=Number(event.target.dataset.index);

      if(
        !Number.isInteger(index) ||
        !state.oeeMachineEditorData[index]
      )return;

      const raw=String(event.target.value||'')
        .trim()
        .replace(',','.');

      const value=raw===''?'':Number(raw);
      const row=state.oeeMachineEditorData[index];

      row.oee=
        Number.isFinite(value)
          ?value
          :'';

      if(Number.isFinite(value)){
        row.candidateOee=value;
        row.confidence=100;
        row.needsConfirmation=false;
        row.ambiguous=false;
        row.source='Confirmado manualmente';
        row.description='Valor confirmado manualmente.';
      }
    };

    input.addEventListener('input',confirm);
    input.addEventListener('change',confirm);
    input.addEventListener('blur',confirm);
  });

  wrap.classList.remove('hidden');
}

function machineOeeFromEditor(){
  return (state.oeeMachineEditorData||[])
    .map(row=>{
      const value=Number(row.oee);

      return {
        machine:row.machine,
        oee:value,
        confidence:Number(row.confidence||0),
        source:row.source||''
      };
    })
    .filter(row=>
      Number.isFinite(row.oee) &&
      row.oee>=0 &&
      row.oee<=100 &&
      row.confidence>=67
    );
}

function editorOeeText() {
  return machineOeeFromEditor()
    .map(row => `${row.machine.replace('MK-', '')} ${String(row.oee).replace('.', ',')}%`)
    .join('\n');
}



async function visionReadyFullImageDataUrl(image){
  const naturalWidth=image.naturalWidth||image.width;
  const naturalHeight=image.naturalHeight||image.height;

  // Mantém a imagem inteira. Só reduz dimensões para transporte.
  let targetWidth=Math.min(2400,naturalWidth);
  let quality=0.9;

  for(let attempt=0;attempt<5;attempt++){
    const scale=targetWidth/Math.max(1,naturalWidth);
    const width=Math.max(1,Math.round(naturalWidth*scale));
    const height=Math.max(1,Math.round(naturalHeight*scale));

    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');

    canvas.width=width;
    canvas.height=height;

    ctx.fillStyle='#ffffff';
    ctx.fillRect(0,0,width,height);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';

    ctx.drawImage(
      image,
      0,0,naturalWidth,naturalHeight,
      0,0,width,height
    );

    const dataUrl=canvas.toDataURL('image/jpeg',quality);

    // Mantemos ampla folga abaixo do limite de payload da função.
    if(dataUrl.length<3_400_000){
      return dataUrl;
    }

    targetWidth=Math.max(1400,Math.round(targetWidth*0.82));
    quality=Math.max(0.72,quality-0.06);
  }

  const scale=Math.min(1,1400/Math.max(1,naturalWidth));
  const width=Math.max(1,Math.round(naturalWidth*scale));
  const height=Math.max(1,Math.round(naturalHeight*scale));
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');

  canvas.width=width;
  canvas.height=height;
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,width,height);
  ctx.drawImage(image,0,0,naturalWidth,naturalHeight,0,0,width,height);

  return canvas.toDataURL('image/jpeg',0.75);
}


function buildGeminiOeeComposite(image, operationalDate, shift){
  const scope=boardScopeForReport(operationalDate,shift);

  // Usa o recorte da coluna que já está funcionando corretamente.
  const processed=preprocessLegacyOeeColumn(
    image,
    operationalDate,
    shift
  );

  const columnCanvas=processed.previewCanvas;
  const ranges=machineRowRangesFromCanvas(columnCanvas);

  const rowImages=[];

  OEE_BOARD_MACHINES.forEach((machine,index)=>{
    const range=ranges[index]||{
      top:index*(columnCanvas.height/20),
      bottom:(index+1)*(columnCanvas.height/20)
    };

    const sourceY=Math.max(0,range.top);
    const sourceHeight=Math.max(
      1,
      Math.min(
        columnCanvas.height-sourceY,
        range.bottom-range.top
      )
    );

    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');

    // Alta resolução apenas para uma única linha.
    canvas.width=1100;
    canvas.height=190;

    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // Rótulo digital grande e inequívoco.
    ctx.fillStyle='#111827';
    ctx.font='bold 42px Arial';
    ctx.fillText(machine,18,62);

    ctx.fillStyle='#475467';
    ctx.font='bold 24px Arial';
    ctx.fillText(scope.label,18,108);

    ctx.fillStyle='#d0d5dd';
    ctx.fillRect(235,0,4,canvas.height);

    // Conteúdo real da linha.
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';

    ctx.drawImage(
      columnCanvas,
      0,
      sourceY,
      columnCanvas.width,
      sourceHeight,
      250,
      8,
      835,
      174
    );

    rowImages.push({
      machine,
      dataUrl:canvas.toDataURL('image/jpeg',0.94)
    });
  });

  // Folha visual apenas para o usuário conferir.
  const preview=document.createElement('canvas');
  const pctx=preview.getContext('2d');

  const pw=900;
  const ph=OEE_BOARD_MACHINES.length*115+60;

  preview.width=pw;
  preview.height=ph;

  pctx.fillStyle='#fff';
  pctx.fillRect(0,0,pw,ph);

  pctx.fillStyle='#111827';
  pctx.font='bold 30px Arial';
  pctx.fillText(
    `Gemini — ${scope.label} — linha por linha`,
    16,
    40
  );

  OEE_BOARD_MACHINES.forEach((machine,index)=>{
    const y=60+index*115;
    const row=rowImages[index];

    const img=new Image();
    img.src=row.dataUrl;

    // Como dataURL já está em memória, desenhamos assim que carregado.
    img.onload=()=>{
      pctx.drawImage(img,0,0,img.width,img.height,0,y,pw,108);
    };
  });

  return {
    canvas:preview,
    dataUrl:preview.toDataURL('image/jpeg',0.90),
    rowImages,
    selectedCrop:processed.crop,
    scope
  };
}

async function analyzeOeeWithVision(
  imageDataUrl,
  operationalDate,
  shift,
  scope,
  compositeDataUrl='',
  rowImages=[]
){
  const response=await fetch('/api/oee-vision',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      imageDataUrl,
      compositeDataUrl,
      rowImages,
      date:operationalDate,
      shift,
      scope
    })
  });

  const data=await response.json().catch(()=>({}));

  if(!response.ok || data.ok===false){
    throw new Error(
      data.error||
      `Falha Gemini HTTP ${response.status}`
    );
  }

  const byMachine=new Map(
    (data.rows||[]).map(row=>[
      normalizeMachineCode(row.machine),
      row
    ])
  );

  const normalized=OEE_BOARD_MACHINES.map(machine=>{
    const found=byMachine.get(machine)||{};

    const oee=Number(found.oee);

    const valid=
      found.oee!==null &&
      found.oee!==undefined &&
      found.oee!=='' &&
      Number.isFinite(oee) &&
      oee>=0 &&
      oee<=100;

    const confidence=Number(found.confidence||0);

    return {
      machine,
      oee:valid?oee:'',
      candidateOee:valid?oee:'',
      confidence,
      source:found.evidence||'Gemini linha por linha',
      needsConfirmation:valid && confidence<60,
      ambiguous:false,
      visionSource:true,
      description:String(
        found.description||
        (
          valid
            ?`${oee}% identificado nesta linha.`
            :'Sem percentual legível nesta linha.'
        )
      )
    };
  });

  normalized._diagnostic={
    provider:data.provider||'gemini',
    model:data.model||'',
    returned:Number(data.returned||0),
    nonNull:Number(data.nonNull||0)
  };

  return normalized;
}

function usefulOeeReadCount(rows=[]){
  return rows.filter(row=>
    row.oee!=='' &&
    Number.isFinite(Number(row.oee)) &&
    Number(row.oee)>=0 &&
    Number(row.oee)<=100
  ).length;
}


function normalizePrintedMachineDigits(text){
  const digits=String(text||'').replace(/\D/g,'');
  if(!digits)return '';
  const n=Number(digits);
  if(!Number.isFinite(n))return '';
  return `MK-${n}`;
}

function oeeMachineNumber(machine){
  return Number(String(machine||'').replace(/\D/g,''));
}

function bboxCenter(word){
  const bbox=word?.bbox||{};
  const x0=Number(bbox.x0??bbox.left??0);
  const x1=Number(bbox.x1??bbox.right??x0);
  const y0=Number(bbox.y0??bbox.top??0);
  const y1=Number(bbox.y1??bbox.bottom??y0);
  return {
    x:(x0+x1)/2,
    y:(y0+y1)/2,
    width:Math.max(1,x1-x0),
    height:Math.max(1,y1-y0)
  };
}

function findMachineAnchorsFromPrintedOcr(words=[],canvasWidth=1,canvasHeight=1){
  const allowed=new Map(
    OEE_BOARD_MACHINES.map(machine=>[
      oeeMachineNumber(machine),
      machine
    ])
  );

  const leftLimit=canvasWidth*0.33;
  const candidates=[];

  for(const word of words){
    const center=bboxCenter(word);
    if(center.x>leftLimit)continue;

    const raw=String(word.text||'').trim();
    const groups=raw.match(/\d{2,3}/g)||[];

    for(const group of groups){
      const value=Number(group);
      if(!allowed.has(value))continue;

      candidates.push({
        machine:allowed.get(value),
        value,
        x:center.x,
        y:center.y,
        confidence:Number(word.confidence||0),
        raw
      });
    }
  }

  const byMachine=new Map();

  for(const item of candidates){
    const existing=byMachine.get(item.machine);
    if(
      !existing ||
      item.confidence>existing.confidence
    ){
      byMachine.set(item.machine,item);
    }
  }

  // Se faltaram algumas âncoras, usa interpolação pelas máquinas vizinhas
  // para manter a associação correta das linhas.
  const ordered=OEE_BOARD_MACHINES.map((machine,index)=>({
    machine,
    index,
    anchor:byMachine.get(machine)||null
  }));

  const known=ordered.filter(item=>item.anchor);

  if(known.length>=2){
    for(const item of ordered){
      if(item.anchor)continue;

      const before=[...known]
        .filter(k=>k.index<item.index)
        .sort((a,b)=>b.index-a.index)[0];

      const after=[...known]
        .filter(k=>k.index>item.index)
        .sort((a,b)=>a.index-b.index)[0];

      if(before&&after){
        const ratio=
          (item.index-before.index)/
          (after.index-before.index);

        item.anchor={
          machine:item.machine,
          value:oeeMachineNumber(item.machine),
          x:(before.anchor.x+after.anchor.x)/2,
          y:before.anchor.y+
            (after.anchor.y-before.anchor.y)*ratio,
          confidence:45,
          raw:'interpolado',
          interpolated:true
        };
      }else if(before){
        const spacing=canvasHeight*0.034;
        item.anchor={
          machine:item.machine,
          value:oeeMachineNumber(item.machine),
          x:before.anchor.x,
          y:before.anchor.y+
            spacing*(item.index-before.index),
          confidence:35,
          raw:'interpolado',
          interpolated:true
        };
      }else if(after){
        const spacing=canvasHeight*0.034;
        item.anchor={
          machine:item.machine,
          value:oeeMachineNumber(item.machine),
          x:after.anchor.x,
          y:after.anchor.y-
            spacing*(after.index-item.index),
          confidence:35,
          raw:'interpolado',
          interpolated:true
        };
      }
    }
  }

  return ordered.map(item=>({
    machine:item.machine,
    ...(item.anchor||{
      x:canvasWidth*0.17,
      y:null,
      confidence:0,
      raw:'não localizado',
      interpolated:true
    })
  }));
}

function detectBoardVerticalLines(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const width=canvas.width;
  const height=canvas.height;

  const image=ctx.getImageData(0,0,width,height).data;
  const scores=[];

  const yStart=Math.floor(height*0.08);
  const yEnd=Math.floor(height*0.97);
  const stepY=Math.max(2,Math.floor(height/700));

  for(let x=Math.floor(width*0.04);x<Math.floor(width*0.995);x+=2){
    let dark=0;
    let samples=0;

    for(let y=yStart;y<yEnd;y+=stepY){
      const i=(y*width+x)*4;
      const lum=
        0.299*image[i]+
        0.587*image[i+1]+
        0.114*image[i+2];

      if(lum<145)dark++;
      samples++;
    }

    scores.push({
      x,
      score:samples?dark/samples:0
    });
  }

  const threshold=0.34;
  const raw=scores.filter(item=>item.score>=threshold);
  const clustered=[];

  for(const item of raw){
    const last=clustered[clustered.length-1];

    if(last && item.x-last.endX<=8){
      last.items.push(item);
      last.endX=item.x;
      if(item.score>last.best.score)last.best=item;
    }else{
      clustered.push({
        items:[item],
        endX:item.x,
        best:item
      });
    }
  }

  return clustered
    .map(group=>group.best.x)
    .filter(x=>x>width*0.08)
    .sort((a,b)=>a-b);
}

function chooseOeeColumnBounds(canvas,anchors,operationalDate,shift){
  const lines=detectBoardVerticalLines(canvas);
  const width=canvas.width;

  // A primeira divisória forte após a coluna MK define o começo dos dados.
  let dataStart=lines.find(x=>x>width*0.18) || width*0.27;

  const dataLines=lines.filter(x=>x>=dataStart);

  const expectedIndex=boardColumnIndex(operationalDate,shift);

  if(dataLines.length>=3){
    const boundaries=[dataStart,...dataLines.filter(x=>x>dataStart+10)];

    // Se o quadro inteiro estiver visível, tenta usar as divisórias detectadas.
    if(boundaries.length>=expectedIndex+2){
      return {
        left:boundaries[expectedIndex],
        right:boundaries[expectedIndex+1],
        source:'grid'
      };
    }

    // Foto estreita: primeiro turno visível.
    if(expectedIndex===0 && boundaries.length>=2){
      return {
        left:boundaries[0],
        right:boundaries[1],
        source:'grid'
      };
    }
  }

  // Fallback geométrico; não corta a foto original,
  // apenas define a célula usada pelo OCR.
  const boardStart=Math.max(dataStart,width*0.25);
  const boardEnd=width*0.99;
  const expectedColumns=10;
  const colWidth=(boardEnd-boardStart)/expectedColumns;

  return {
    left:boardStart+expectedIndex*colWidth,
    right:boardStart+(expectedIndex+1)*colWidth,
    source:'estimated'
  };
}

function makeOeeRowCanvas(fullCanvas,anchor,bounds,rowHeight){
  const width=fullCanvas.width;
  const height=fullCanvas.height;

  if(!Number.isFinite(anchor.y))return null;

  const marginX=Math.max(8,width*0.008);
  const left=Math.max(0,Math.floor(bounds.left-marginX));
  const right=Math.min(width,Math.ceil(bounds.right+marginX));

  const halfHeight=Math.max(
    18,
    Math.round(rowHeight*0.43)
  );

  const top=Math.max(
    0,
    Math.round(anchor.y-halfHeight)
  );

  const bottom=Math.min(
    height,
    Math.round(anchor.y+halfHeight)
  );

  const cropWidth=Math.max(1,right-left);
  const cropHeight=Math.max(1,bottom-top);

  const scale=Math.max(
    2.0,
    Math.min(4.0,1000/cropWidth)
  );

  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});

  canvas.width=Math.round(cropWidth*scale);
  canvas.height=Math.round(cropHeight*scale);

  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';

  ctx.drawImage(
    fullCanvas,
    left,top,cropWidth,cropHeight,
    0,0,canvas.width,canvas.height
  );

  // Contraste + grayscale para escrita colorida.
  const img=ctx.getImageData(0,0,canvas.width,canvas.height);
  const p=img.data;

  for(let i=0;i<p.length;i+=4){
    const r=p[i],g=p[i+1],b=p[i+2];
    const max=Math.max(r,g,b);
    const min=Math.min(r,g,b);
    const saturation=max-min;
    const lum=0.299*r+0.587*g+0.114*b;

    let value;

    if(saturation>24){
      // escrita vermelha/verde/azul vira escura
      value=Math.max(
        0,
        Math.min(255,lum*0.52-saturation*0.58+42)
      );
    }else{
      value=Math.max(
        0,
        Math.min(255,(lum-120)*1.65+120)
      );
    }

    p[i]=p[i+1]=p[i+2]=value;
    p[i+3]=255;
  }

  ctx.putImageData(img,0,0);

  return canvas;
}

function parsePercentCandidatesFromOcr(data){
  const words=data?.words||[];
  const candidates=[];

  for(const word of words){
    const text=String(word.text||'').trim();
    if(!text)continue;

    // prioridade para valores com %
    const matches=text.match(/\d{1,3}(?:[.,]\d+)?\s*%?/g)||[];

    for(const raw of matches){
      const hasPercent=raw.includes('%');
      const value=Number(
        raw.replace('%','').replace(',','.').trim()
      );

      if(
        !Number.isFinite(value) ||
        value<20 ||
        value>100
      ) continue;

      candidates.push({
        value,
        hasPercent,
        confidence:Number(word.confidence||0),
        raw:text
      });
    }
  }

  candidates.sort((a,b)=>{
    if(a.hasPercent!==b.hasPercent){
      return a.hasPercent?-1:1;
    }
    return b.confidence-a.confidence;
  });

  return candidates;
}

async function recognizeOeeInRowCanvas(canvas,workerProgress=null){
  const result=await window.Tesseract.recognize(
    canvas.toDataURL('image/png'),
    'eng',
    {
      logger:workerProgress||(()=>{})
    },
    {
      tessedit_char_whitelist:'0123456789%.,',
      tessedit_pageseg_mode:'11',
      preserve_interword_spaces:'1'
    }
  );

  return parsePercentCandidatesFromOcr(result?.data);
}


function percentCandidatesFromFullOcr(words=[],bounds,anchors,rowHeight){
  const results=new Map();

  const left=Number(bounds?.left||0);
  const right=Number(bounds?.right||Infinity);
  const toleranceY=Math.max(12,rowHeight*0.44);

  for(const anchor of anchors){
    if(!Number.isFinite(anchor.y))continue;

    const candidates=[];

    for(const word of words){
      const center=bboxCenter(word);

      if(center.x<left || center.x>right)continue;
      if(Math.abs(center.y-anchor.y)>toleranceY)continue;

      const text=String(word.text||'').trim();
      const parts=text.match(/\d{1,3}(?:[.,]\d+)?\s*%?/g)||[];

      for(const raw of parts){
        const value=Number(
          raw.replace('%','').replace(',','.').trim()
        );

        if(!Number.isFinite(value) || value<20 || value>100)continue;

        const hasPercent=raw.includes('%');
        const confidence=Number(word.confidence||0);

        candidates.push({
          value,
          hasPercent,
          confidence,
          raw:text,
          x:center.x,
          y:center.y,
          verticalDistance:Math.abs(center.y-anchor.y)
        });
      }
    }

    candidates.sort((a,b)=>{
      if(a.hasPercent!==b.hasPercent)return a.hasPercent?-1:1;
      if(a.verticalDistance!==b.verticalDistance){
        return a.verticalDistance-b.verticalDistance;
      }
      return b.confidence-a.confidence;
    });

    results.set(anchor.machine,candidates);
  }

  return results;
}

function buildFastOeeRows(anchors=[],candidateMap=new Map()){
  return OEE_BOARD_MACHINES.map(machine=>{
    const anchor=anchors.find(item=>item.machine===machine);
    const candidates=candidateMap.get(machine)||[];
    const chosen=candidates[0]||null;

    if(!chosen){
      return {
        machine,
        oee:'',
        candidateOee:'',
        confidence:0,
        source:'Sem percentual reconhecido na mesma linha',
        needsConfirmation:false,
        ambiguous:false,
        ocrSource:true,
        anchorConfidence:Number(anchor?.confidence||0)
      };
    }

    const competing=candidates.filter(item=>
      Math.abs(Number(item.value)-Number(chosen.value))>5 &&
      item.verticalDistance<=chosen.verticalDistance+8
    );

    const ambiguous=competing.some(item=>
      item.hasPercent || Number(item.confidence||0)>=55
    );

    const needsConfirmation=
      ambiguous ||
      !chosen.hasPercent ||
      Number(chosen.confidence||0)<60 ||
      Boolean(anchor?.interpolated);

    return {
      machine,
      oee:chosen.value,
      candidateOee:chosen.value,
      confidence:Number(chosen.confidence||0),
      source:
        `${chosen.raw} | âncora ${anchor?.raw||machine}`+
        `${anchor?.interpolated?' (linha estimada)':''}`,
      needsConfirmation,
      ambiguous,
      ocrSource:true,
      anchorConfidence:Number(anchor?.confidence||0)
    };
  });
}


function cropCanvasRegion(sourceCanvas,left,top,right,bottom,scale=2.5){
  const sw=Math.max(1,Math.round(right-left));
  const sh=Math.max(1,Math.round(bottom-top));

  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});

  canvas.width=Math.max(1,Math.round(sw*scale));
  canvas.height=Math.max(1,Math.round(sh*scale));

  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';

  ctx.drawImage(
    sourceCanvas,
    left,top,sw,sh,
    0,0,canvas.width,canvas.height
  );

  return canvas;
}

function enhanceOeeCropCanvas(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const img=ctx.getImageData(0,0,canvas.width,canvas.height);
  const p=img.data;

  for(let i=0;i<p.length;i+=4){
    const r=p[i];
    const g=p[i+1];
    const b=p[i+2];

    const max=Math.max(r,g,b);
    const min=Math.min(r,g,b);
    const saturation=max-min;
    const lum=0.299*r+0.587*g+0.114*b;

    let value;

    // Escrita colorida (vermelho, verde, azul) fica bem escura.
    if(saturation>20){
      value=lum*0.48-saturation*0.62+48;
    }else{
      // Grade e fundo claro ficam mais claros.
      value=(lum-125)*1.55+130;
    }

    value=Math.max(0,Math.min(255,value));

    p[i]=value;
    p[i+1]=value;
    p[i+2]=value;
    p[i+3]=255;
  }

  ctx.putImageData(img,0,0);
  return canvas;
}

function boardInternalRegions(canvas,operationalDate,shift){
  const width=canvas.width;
  const height=canvas.height;

  // Detecta linhas verticais reais do quadro.
  const verticalLines=detectBoardVerticalLines(canvas);

  // Na foto típica:
  // 0.. primeira divisória = cabeçalho/coluna de máquina.
  // A primeira área de dados começa depois da coluna MK.
  const likelyMachineDivider=
    verticalLines.find(x=>x>width*0.17 && x<width*0.42) ||
    width*0.285;

  const machineLeft=Math.max(0,width*0.035);
  const machineRight=Math.min(width,likelyMachineDivider+width*0.018);

  const afterMachine=verticalLines
    .filter(x=>x>likelyMachineDivider+width*0.025)
    .sort((a,b)=>a-b);

  const expectedIndex=boardColumnIndex(operationalDate,shift);

  let dataLeft;
  let dataRight;

  if(afterMachine.length>=expectedIndex+1){
    dataLeft=
      expectedIndex===0
        ? likelyMachineDivider
        : afterMachine[expectedIndex-1];

    dataRight=afterMachine[expectedIndex]||width*0.99;
  }else{
    // Fallback baseado na largura útil do quadro.
    const start=likelyMachineDivider;
    const end=width*0.99;
    const cols=10;
    const colWidth=(end-start)/cols;

    dataLeft=start+expectedIndex*colWidth;
    dataRight=start+(expectedIndex+1)*colWidth;
  }

  // O quadro da foto pode mostrar só a primeira coluna com conteúdo.
  // Se a coluna calculada estiver praticamente vazia ou muito estreita,
  // para segunda A usamos a primeira coluna após MK.
  if(expectedIndex===0){
    dataLeft=likelyMachineDivider;
    if(afterMachine.length){
      dataRight=afterMachine[0];
    }else{
      dataRight=Math.min(width,width*0.60);
    }
  }

  // Faixa vertical das máquinas; mantém folga.
  const top=height*0.22;
  const bottom=height*0.965;

  return {
    machine:{
      left:machineLeft,
      right:machineRight,
      top,
      bottom
    },
    oee:{
      left:Math.max(0,dataLeft-width*0.012),
      right:Math.min(width,dataRight+width*0.012),
      top,
      bottom
    }
  };
}

function machineAnchorsFromCroppedOcr(words=[],cropInfo,scale,fullHeight){
  const allowed=new Map(
    OEE_BOARD_MACHINES.map(machine=>[
      oeeMachineNumber(machine),
      machine
    ])
  );

  const found=new Map();

  for(const word of words){
    const raw=String(word.text||'').trim();
    const groups=raw.match(/\d{2,3}/g)||[];

    for(const group of groups){
      const number=Number(group);
      const machine=allowed.get(number);
      if(!machine)continue;

      const center=bboxCenter(word);

      // converte coordenada do recorte para a foto cheia
      const fullY=cropInfo.top+(center.y/scale);
      const confidence=Number(word.confidence||0);

      const current=found.get(machine);
      if(!current || confidence>current.confidence){
        found.set(machine,{
          machine,
          y:fullY,
          confidence,
          raw
        });
      }
    }
  }

  const ordered=OEE_BOARD_MACHINES.map((machine,index)=>({
    machine,
    index,
    anchor:found.get(machine)||null
  }));

  const known=ordered.filter(item=>item.anchor);

  // Interpola somente posição vertical das máquinas faltantes.
  if(known.length>=2){
    for(const item of ordered){
      if(item.anchor)continue;

      const before=[...known]
        .filter(k=>k.index<item.index)
        .sort((a,b)=>b.index-a.index)[0];

      const after=[...known]
        .filter(k=>k.index>item.index)
        .sort((a,b)=>a.index-b.index)[0];

      if(before&&after){
        const ratio=
          (item.index-before.index)/
          (after.index-before.index);

        item.anchor={
          machine:item.machine,
          y:
            before.anchor.y+
            (after.anchor.y-before.anchor.y)*ratio,
          confidence:35,
          raw:'linha estimada',
          interpolated:true
        };
      }
    }
  }

  // Se poucas máquinas foram lidas, usa distribuição vertical baseada
  // nas âncoras conhecidas para completar o mapa sem trocar a ordem.
  const completed=ordered.map(item=>item.anchor).filter(Boolean);

  if(completed.length>=2){
    const firstKnown=ordered.find(item=>item.anchor);
    const lastKnown=[...ordered].reverse().find(item=>item.anchor);

    const step=
      (lastKnown.anchor.y-firstKnown.anchor.y)/
      Math.max(1,lastKnown.index-firstKnown.index);

    for(const item of ordered){
      if(item.anchor)continue;

      item.anchor={
        machine:item.machine,
        y:firstKnown.anchor.y+(item.index-firstKnown.index)*step,
        confidence:25,
        raw:'linha estimada',
        interpolated:true
      };
    }
  }

  return ordered.map(item=>(
    item.anchor || {
      machine:item.machine,
      y:null,
      confidence:0,
      raw:'não localizado',
      interpolated:true
    }
  ));
}

function percentWordsFromColumnOcr(words=[],oeeRegion,scale){
  const out=[];

  for(const word of words){
    const center=bboxCenter(word);
    const text=String(word.text||'').trim();

    const matches=text.match(/\d{1,3}(?:[.,]\d+)?\s*%?/g)||[];

    for(const raw of matches){
      const value=Number(
        raw.replace('%','').replace(',','.').trim()
      );

      if(!Number.isFinite(value) || value<20 || value>100)continue;

      out.push({
        value,
        hasPercent:raw.includes('%'),
        confidence:Number(word.confidence||0),
        raw:text,
        fullY:oeeRegion.top+(center.y/scale),
        x:center.x
      });
    }
  }

  return out;
}

function associatePercentToMachineRows(anchors=[],percentWords=[],fullHeight=1){
  const validAnchors=anchors.filter(a=>Number.isFinite(a.y));

  const gaps=[];
  const ys=validAnchors.map(a=>a.y).sort((a,b)=>a-b);

  for(let i=1;i<ys.length;i++){
    const gap=ys[i]-ys[i-1];
    if(gap>4)gaps.push(gap);
  }

  gaps.sort((a,b)=>a-b);

  const typicalGap=
    gaps.length
      ? gaps[Math.floor(gaps.length/2)]
      : fullHeight*0.034;

  const tolerance=Math.max(10,typicalGap*0.48);

  return OEE_BOARD_MACHINES.map(machine=>{
    const anchor=anchors.find(a=>a.machine===machine);

    if(!anchor || !Number.isFinite(anchor.y)){
      return {
        machine,
        oee:'',
        candidateOee:'',
        confidence:0,
        source:'Linha da máquina não localizada',
        needsConfirmation:false,
        ambiguous:false,
        ocrSource:true
      };
    }

    const candidates=percentWords
      .map(word=>({
        ...word,
        distance:Math.abs(word.fullY-anchor.y)
      }))
      .filter(word=>word.distance<=tolerance)
      .sort((a,b)=>{
        if(a.hasPercent!==b.hasPercent)return a.hasPercent?-1:1;
        if(a.distance!==b.distance)return a.distance-b.distance;
        return b.confidence-a.confidence;
      });

    const chosen=candidates[0];

    if(!chosen){
      return {
        machine,
        oee:'',
        candidateOee:'',
        confidence:0,
        source:'Sem percentual na mesma linha',
        needsConfirmation:false,
        ambiguous:false,
        ocrSource:true,
        anchorConfidence:anchor.confidence
      };
    }

    const conflicts=candidates.filter(item=>
      Math.abs(item.value-chosen.value)>5 &&
      item.distance<=chosen.distance+6
    );

    const ambiguous=conflicts.some(item=>
      item.hasPercent || item.confidence>=55
    );

    const needsConfirmation=
      ambiguous ||
      !chosen.hasPercent ||
      chosen.confidence<55 ||
      Boolean(anchor.interpolated);

    return {
      machine,
      oee:chosen.value,
      candidateOee:chosen.value,
      confidence:chosen.confidence,
      source:
        `${chosen.raw} | ${anchor.raw}`+
        `${anchor.interpolated?' (linha estimada)':''}`,
      needsConfirmation,
      ambiguous,
      ocrSource:true,
      anchorConfidence:anchor.confidence
    };
  });
}


function getLegacyOeeCropSettings(image, operationalDate, shift) {
  const naturalWidth=image.naturalWidth||image.width;
  const naturalHeight=image.naturalHeight||image.height;

  const temp=document.createElement('canvas');
  const ctx=temp.getContext('2d',{willReadFrequently:true});

  const scale=Math.min(1,1600/Math.max(1,naturalWidth));
  temp.width=Math.max(1,Math.round(naturalWidth*scale));
  temp.height=Math.max(1,Math.round(naturalHeight*scale));

  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,temp.width,temp.height);
  ctx.drawImage(image,0,0,naturalWidth,naturalHeight,0,0,temp.width,temp.height);

  const verticalLines=detectBoardVerticalLines(temp)
    .filter(x=>x>temp.width*0.08 && x<temp.width*0.995)
    .sort((a,b)=>a-b);

  const clean=[];
  for(const x of verticalLines){
    if(!clean.length || x-clean[clean.length-1]>temp.width*0.012){
      clean.push(x);
    }
  }

  let machineDivider=clean.find(x=>x>temp.width*0.10 && x<temp.width*0.24);
  if(!Number.isFinite(machineDivider)) machineDivider=temp.width*0.145;

  const dataBoundaries=clean
    .filter(x=>x>machineDivider+temp.width*0.018)
    .sort((a,b)=>a-b);

  const index=boardColumnIndex(operationalDate,shift);

  let left,right;

  if(dataBoundaries.length>=12){
    left=index===0?machineDivider:(dataBoundaries[index-1]||machineDivider);
    right=dataBoundaries[index]||temp.width*0.995;
  }else{
    const boardStart=machineDivider;
    const boardEnd=temp.width*0.995;
    const totalColumns=12;
    const colWidth=(boardEnd-boardStart)/totalColumns;
    left=boardStart+index*colWidth;
    right=boardStart+(index+1)*colWidth;
  }

  const topRatio=0.285;
  const bottomRatio=0.935;

  const sx=Math.max(0,Math.round((left/temp.width)*naturalWidth));
  const ex=Math.min(naturalWidth,Math.round((right/temp.width)*naturalWidth));
  const sy=Math.round(naturalHeight*topRatio);
  const ey=Math.round(naturalHeight*bottomRatio);

  return {
    sx,
    sy,
    sw:Math.max(1,ex-sx),
    sh:Math.max(1,ey-sy),
    debug:{
      scope:boardScopeForReport(operationalDate,shift).label,
      index,
      detectedVerticalLines:clean.length,
      machineDividerRatio:machineDivider/temp.width,
      leftRatio:left/temp.width,
      rightRatio:right/temp.width
    }
  };
}


function detectHorizontalGridLines(canvas){
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const width=canvas.width;
  const height=canvas.height;
  const image=ctx.getImageData(0,0,width,height).data;

  const scores=[];
  const xStart=Math.floor(width*0.04);
  const xEnd=Math.floor(width*0.96);
  const stepX=Math.max(2,Math.floor(width/450));

  for(let y=1;y<height-1;y+=2){
    let dark=0;
    let samples=0;

    for(let x=xStart;x<xEnd;x+=stepX){
      const i=(y*width+x)*4;
      const lum=
        0.299*image[i]+
        0.587*image[i+1]+
        0.114*image[i+2];

      if(lum<145)dark++;
      samples++;
    }

    scores.push({
      y,
      score:samples?dark/samples:0
    });
  }

  const raw=scores.filter(item=>item.score>=0.28);
  const groups=[];

  for(const item of raw){
    const last=groups[groups.length-1];

    if(last && item.y-last.endY<=8){
      last.items.push(item);
      last.endY=item.y;
      if(item.score>last.best.score)last.best=item;
    }else{
      groups.push({
        items:[item],
        endY:item.y,
        best:item
      });
    }
  }

  return groups
    .map(group=>group.best.y)
    .filter(y=>y>height*0.01 && y<height*0.99)
    .sort((a,b)=>a-b);
}

function normalizeMachineRowBoundaries(canvas){
  const height=canvas.height;
  let lines=detectHorizontalGridLines(canvas);

  const cleaned=[];
  for(const y of lines){
    if(
      !cleaned.length ||
      y-cleaned[cleaned.length-1]>height*0.010
    ){
      cleaned.push(y);
    }
  }

  lines=cleaned;

  // Procuramos 21 limites para 20 máquinas.
  if(lines.length>=21){
    let best=null;

    for(let start=0;start<=lines.length-21;start++){
      const seq=lines.slice(start,start+21);
      const gaps=[];

      for(let i=1;i<seq.length;i++){
        gaps.push(seq[i]-seq[i-1]);
      }

      const avg=gaps.reduce((a,b)=>a+b,0)/gaps.length;
      const variance=
        gaps.reduce((sum,g)=>sum+(g-avg)**2,0)/gaps.length;

      const score=variance/((avg*avg)||1);

      if(!best || score<best.score){
        best={seq,score};
      }
    }

    if(best){
      return best.seq;
    }
  }

  // Se detectou muitas linhas mas não exatamente 21,
  // usa a primeira e a última como referência e interpola.
  if(lines.length>=8){
    const first=lines[0];
    const last=lines[lines.length-1];
    const step=(last-first)/20;

    return Array.from({length:21},(_,i)=>first+i*step);
  }

  // Fallback seguro.
  return Array.from(
    {length:21},
    (_,i)=>i*(height/20)
  );
}

function machineRowRangesFromCanvas(canvas){
  const boundaries=normalizeMachineRowBoundaries(canvas);

  return OEE_BOARD_MACHINES.map((machine,index)=>{
    const rawTop=boundaries[index];
    const rawBottom=boundaries[index+1];

    const height=Math.max(1,rawBottom-rawTop);
    const pad=Math.max(2,height*0.09);

    return {
      machine,
      index,
      rawTop,
      rawBottom,
      top:Math.max(0,rawTop+pad),
      bottom:Math.min(canvas.height,rawBottom-pad)
    };
  });
}

function createLegacyOeeRowPreviews(previewCanvas) {
  const ranges=machineRowRangesFromCanvas(previewCanvas);

  return ranges.map(range=>{
    const sourceY=range.top;
    const sourceHeight=Math.max(1,range.bottom-range.top);

    const canvas=document.createElement('canvas');
    canvas.width=520;
    canvas.height=96;

    const ctx=canvas.getContext('2d');

    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';

    ctx.drawImage(
      previewCanvas,
      0,
      sourceY,
      previewCanvas.width,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL('image/jpeg',0.94);
  });
}

function preprocessLegacyOeeColumn(image, operationalDate, shift) {
  const crop = getLegacyOeeCropSettings(
    image,
    operationalDate,
    shift
  );

  // Recorte colorido para conferência.
  const previewCanvas = document.createElement('canvas');
  const previewCtx = previewCanvas.getContext('2d');

  const previewWidth = Math.max(
    520,
    Math.min(900,crop.sw*3.5)
  );

  const previewHeight = Math.round(
    previewWidth*(crop.sh/crop.sw)
  );

  previewCanvas.width = previewWidth;
  previewCanvas.height = previewHeight;

  previewCtx.fillStyle = '#fff';
  previewCtx.fillRect(0,0,previewWidth,previewHeight);
  previewCtx.imageSmoothingEnabled = true;
  previewCtx.imageSmoothingQuality = 'high';

  previewCtx.drawImage(
    image,
    crop.sx,crop.sy,crop.sw,crop.sh,
    0,0,previewWidth,previewHeight
  );

  // Imagem ampliada para o OCR.
  const ocrCanvas = document.createElement('canvas');
  const ocrCtx = ocrCanvas.getContext(
    '2d',
    {willReadFrequently:true}
  );

  const ocrWidth = Math.max(
    1200,
    Math.min(1800,crop.sw*6)
  );

  const ocrHeight = Math.round(
    ocrWidth*(crop.sh/crop.sw)
  );

  ocrCanvas.width = ocrWidth;
  ocrCanvas.height = ocrHeight;

  ocrCtx.fillStyle = '#fff';
  ocrCtx.fillRect(0,0,ocrWidth,ocrHeight);
  ocrCtx.imageSmoothingEnabled = true;
  ocrCtx.imageSmoothingQuality = 'high';

  ocrCtx.drawImage(
    image,
    crop.sx,crop.sy,crop.sw,crop.sh,
    0,0,ocrWidth,ocrHeight
  );

  const imageData = ocrCtx.getImageData(
    0,0,ocrWidth,ocrHeight
  );

  const pixels = imageData.data;

  for(let i=0;i<pixels.length;i+=4){
    const r=pixels[i];
    const g=pixels[i+1];
    const b=pixels[i+2];

    const max=Math.max(r,g,b);
    const min=Math.min(r,g,b);
    const saturation=max-min;
    const luminance=
      0.299*r+
      0.587*g+
      0.114*b;

    let value;

    if(saturation<15 && luminance>118){
      value=255;
    }else if(saturation>=18){
      value=clampByte(
        luminance*0.58 -
        saturation*0.55 +
        42
      );
    }else{
      value=clampByte(
        (luminance-105)*1.65+105
      );
    }

    pixels[i]=value;
    pixels[i+1]=value;
    pixels[i+2]=value;
    pixels[i+3]=255;
  }

  ocrCtx.putImageData(imageData,0,0);

  return {
    crop,
    canvas:ocrCanvas,
    previewCanvas,
    previewDataUrl:previewCanvas.toDataURL(
      'image/jpeg',0.94
    ),
    ocrDataUrl:ocrCanvas.toDataURL('image/png'),
    rowPreviews:createLegacyOeeRowPreviews(
      previewCanvas
    )
  };
}

function mapLegacyOcrWordsToMachineRows(words=[],canvasHeight=1,canvas=null){
  const ranges=canvas
    ?machineRowRangesFromCanvas(canvas)
    :OEE_BOARD_MACHINES.map((machine,index)=>({
        machine,
        index,
        top:index*(canvasHeight/20),
        bottom:(index+1)*(canvasHeight/20)
      }));

  const buckets=Array.from(
    {length:OEE_BOARD_MACHINES.length},
    ()=>[]
  );

  for(const word of words){
    const parsed=numericOeeFromWord(word.text);
    if(!parsed)continue;

    const bbox=word.bbox||{};
    const y0=Number(bbox.y0??bbox.top??0);
    const y1=Number(bbox.y1??bbox.bottom??y0);
    const x0=Number(bbox.x0??bbox.left??0);
    const centerY=(y0+y1)/2;

    const rowIndex=ranges.findIndex(range=>
      centerY>=range.top &&
      centerY<=range.bottom
    );

    if(rowIndex<0)continue;

    buckets[rowIndex].push({
      value:parsed.value,
      hasPercent:parsed.hasPercent,
      confidence:Number(word.confidence||0),
      x:x0,
      y:centerY,
      raw:String(word.text||'')
    });
  }

  return OEE_BOARD_MACHINES.map((machine,index)=>{
    const candidates=buckets[index];

    if(!candidates.length){
      return {
        machine,
        oee:'',
        candidateOee:'',
        confidence:0,
        source:'Não identificado',
        needsConfirmation:false,
        ambiguous:false,
        legacyCrop:true
      };
    }

    candidates.sort((a,b)=>{
      if(a.hasPercent!==b.hasPercent){
        return a.hasPercent?-1:1;
      }

      if(a.confidence!==b.confidence){
        return b.confidence-a.confidence;
      }

      return b.x-a.x;
    });

    const chosen=candidates[0];

    const conflicts=candidates.filter(item=>
      Math.abs(Number(item.value)-Number(chosen.value))>5
    );

    const ambiguous=conflicts.some(item=>
      item.hasPercent &&
      Number(item.confidence||0)>=35
    );

    const autoAccepted=
      chosen.hasPercent &&
      Number(chosen.confidence||0)>=35 &&
      !ambiguous;

    return {
      machine,
      oee:chosen.value,
      candidateOee:chosen.value,
      confidence:chosen.confidence,
      source:chosen.raw,
      needsConfirmation:!autoAccepted,
      ambiguous,
      legacyCrop:true
    };
  });
}

async function processOeeColumnPhotoLocalOcr() {
  const file=$('oeeImageInput')?.files?.[0];

  if(!file){
    showToast('Escolha a foto do quadro primeiro.');
    return [];
  }

  if(!window.Tesseract){
    showToast('OCR ainda não carregou.');
    return [];
  }

  const statusEl=$('oeeStatus');
  const operationalDate=$('reportDate').value||todayISO();
  const shift=$('reportShift').value||'1';
  const scope=boardScopeForReport(
    operationalDate,
    shift
  );

  try{
    statusEl.textContent=
      `Localizando automaticamente a coluna ${scope.label} e as linhas MK138–MK149...`;

    const fullDataUrl=
      state.oeeImageDataUrl||
      await dataUrlFromFile(file);

    state.oeeImageDataUrl=fullDataUrl;

    const image=await loadImageElement(
      fullDataUrl
    );

    const processed=preprocessLegacyOeeColumn(
      image,
      operationalDate,
      shift
    );

    console.log(
      'V92 Gemini/OCR OEE',
      processed.crop?.debug||processed.crop
    );

    // V89 volta a mostrar o recorte que realmente foi usado.
    state.oeeCropDataUrl=processed.previewDataUrl;
    state.oeeRowPreviews=processed.rowPreviews||[];

    $('oeeCropPreview').src=
      processed.previewDataUrl;

    $('oeeOcrPreview').src=
      processed.ocrDataUrl;

    $('oeeCropPreviewWrap')
      .classList.remove('hidden');

    statusEl.textContent=
      `Lendo ${scope.label}...`;

    const result=await window.Tesseract.recognize(
      processed.ocrDataUrl,
      'eng',
      {
        logger:info=>{
          if(
            info.status==='recognizing text' &&
            typeof info.progress==='number'
          ){
            statusEl.textContent=
              `Lendo ${scope.label}... `+
              `${Math.round(info.progress*100)}%`;
          }
        }
      },
      {
        tessedit_char_whitelist:
          '0123456789%.,',
        tessedit_pageseg_mode:'6',
        preserve_interword_spaces:'1'
      }
    );

    const words=result?.data?.words||[];

    const rows=mapLegacyOcrWordsToMachineRows(
      words,
      processed.canvas.height,
      processed.canvas
    );

    state.oeeMachineEditorData=rows;
    renderOeeMachineEditor(rows);

    const detected=rows.filter(
      row=>row.oee!==''
    ).length;

    const accepted=rows.filter(
      row=>
        row.oee!=='' &&
        row.needsConfirmation!==true
    ).length;

    statusEl.textContent=
      `${detected} OEE encontrado(s) em ${scope.label}; `+
      `${accepted} aceito(s) automaticamente. `+
      `Confira as linhas amarelas.`;

    $('oeeOcrText').value=editorOeeText();
    state.oeeOcrText=$('oeeOcrText').value;

    return rows;
  }catch(error){
    console.error(error);

    statusEl.textContent=
      `Não consegui ler automaticamente: ${error.message}.`;

    renderOeeMachineEditor([]);

    showToast(
      'Leitura automática falhou; confira o recorte.'
    );

    return [];
  }
}



function makeOcrVariant(sourceCanvas, mode='normal'){
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d',{willReadFrequently:true});

  // A V98.3 já recebe imagem grande; não precisa exagerar escala.
  const scale=Math.max(
    1,
    Math.min(
      1.35,
      1800/Math.max(1,sourceCanvas.width)
    )
  );

  canvas.width=Math.max(
    1,
    Math.round(sourceCanvas.width*scale)
  );

  canvas.height=Math.max(
    1,
    Math.round(sourceCanvas.height*scale)
  );

  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.imageSmoothingEnabled=false;

  ctx.drawImage(
    sourceCanvas,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const img=ctx.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const d=img.data;

  for(let i=0;i<d.length;i+=4){
    const r=d[i];
    const g=d[i+1];
    const b=d[i+2];

    const gray=
      0.299*r+
      0.587*g+
      0.114*b;

    let v=gray;

    if(mode==='contrast'){
      v=(gray-128)*1.22+128;

    }else if(mode==='threshold'){
      v=gray<186?48:248;

    }else if(mode==='color'){
      const max=Math.max(r,g,b);
      const min=Math.min(r,g,b);
      const saturation=max-min;

      if(
        saturation>16 &&
        gray<240
      ){
        v=gray-32;
      }else{
        v=gray+18;
      }
    }

    v=Math.max(
      0,
      Math.min(255,v)
    );

    d[i]=v;
    d[i+1]=v;
    d[i+2]=v;
  }

  ctx.putImageData(img,0,0);
  return canvas;
}

function extractLikelyOeeCandidates(text=''){
  const normalized=String(text||'')
    .replace(/,/g,'.')
    .replace(/[Oo]/g,'0')
    .replace(/[Il|]/g,'1');

  const percentMatches=[
    ...normalized.matchAll(/(^|[^0-9])([0-9]{1,3}(?:\.[0-9])?)\s*%/g)
  ].map(m=>Number(m[2]));

  const plainMatches=[
    ...normalized.matchAll(/(^|[^0-9])([0-9]{2,3})(?![0-9])/g)
  ].map(m=>Number(m[2]));

  const validPercent=percentMatches.filter(n=>n>=0&&n<=100);
  const validPlain=plainMatches.filter(n=>n>=20&&n<=100);

  return {
    withPercent:validPercent,
    plain:validPlain
  };
}

function chooseConsensusOee(readings){
  const candidates=[];

  readings.forEach((reading,readingIndex)=>{
    for(const value of reading.withPercent||[]){
      candidates.push({
        value,
        weight:4,
        source:'percent',
        readingIndex
      });
    }

    for(const value of reading.plain||[]){
      candidates.push({
        value,
        weight:1,
        source:'plain',
        readingIndex
      });
    }
  });

  if(!candidates.length){
    return {
      value:null,
      confidence:0,
      reason:'Nenhum percentual encontrado.'
    };
  }

  const groups=[];

  for(const cand of candidates){
    let group=groups.find(
      g=>Math.abs(g.center-cand.value)<=1
    );

    if(!group){
      group={
        center:cand.value,
        items:[],
        score:0
      };
      groups.push(group);
    }

    group.items.push(cand);
    group.score+=cand.weight;

    group.center=
      group.items.reduce(
        (sum,item)=>sum+item.value,
        0
      )/
      group.items.length;
  }

  groups.sort(
    (a,b)=>b.score-a.score
  );

  const best=groups[0];
  const second=groups[1];

  const percentHits=
    best.items.filter(
      x=>x.source==='percent'
    );

  const distinctReadings=
    new Set(
      best.items.map(
        x=>x.readingIndex
      )
    ).size;

  // Regras conservadoras:
  // A) pelo menos 1 leitura com símbolo % + confirmação em outra passagem,
  // OU
  // B) pelo menos 2 leituras independentes contendo %.
  const accepted=
    (
      percentHits.length>=1 &&
      distinctReadings>=2
    ) ||
    percentHits.length>=2;

  const clearlyBetter=
    !second ||
    best.score>=second.score+3;

  if(
    !accepted ||
    !clearlyBetter
  ){
    return {
      value:null,
      confidence:0,
      reason:'Leituras locais sem consenso suficiente.'
    };
  }

  const rounded=
    Math.round(
      best.center*10
    )/10;

  return {
    value:rounded,
    confidence:Math.min(
      99,
      70+
      percentHits.length*8+
      distinctReadings*4
    ),
    reason:
      'Percentual confirmado em múltiplas leituras locais.'
  };
}

async function localOcrTextForCanvas(canvas, psm=7){
  if(
    !window.Tesseract ||
    typeof window.Tesseract.recognize!=='function'
  ){
    throw new Error('Tesseract OCR não carregado.');
  }

  const result=await window.Tesseract.recognize(
    canvas.toDataURL('image/png'),
    'eng',
    {
      logger:()=>{}
    },
    {
      tessedit_char_whitelist:'0123456789%.,',
      tessedit_pageseg_mode:String(psm),
      preserve_interword_spaces:'1',
      user_defined_dpi:'300'
    }
  );

  return String(
    result?.data?.text||
    ''
  ).trim();
}


// ================================
// V98.4 — LEITURA HÍBRIDA OCR + IA
// ================================

// Nunca aceita um valor de IA fora de faixa e nunca transforma produção em OEE.
function normalizeHybridOee(value){
  const n = Number(String(value ?? '').replace(',', '.').replace(/[^\d.]/g,''));
  if(!Number.isFinite(n)) return null;
  const v = Math.round(n);
  if(v < 1 || v > 100) return null;
  return v;
}

function parseAiOeeJson(raw){
  if(!raw) return {oee:null, status:'unreadable', confidence:0, evidence:''};

  let text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  text = text.replace(/```json/gi,'').replace(/```/g,'').trim();

  let obj = null;
  try{
    obj = JSON.parse(text);
  }catch(_){
    const m = text.match(/\{[\s\S]*\}/);
    if(m){
      try{ obj = JSON.parse(m[0]); }catch(__){}
    }
  }

  if(!obj) return {oee:null, status:'unreadable', confidence:0, evidence:''};

  const status = String(obj.status || '').toLowerCase();
  const oee = normalizeHybridOee(obj.oee);
  const confidence = Math.max(0, Math.min(1, Number(obj.confidence || 0)));
  const evidence = String(obj.evidence || '').slice(0,120);

  if(status === 'not_running' || status === 'blank' || status === 'unreadable'){
    return {oee:null, status, confidence, evidence};
  }

  // IA só pode devolver OEE quando afirma ter visto explicitamente percentual.
  if(oee === null || !/%/.test(evidence)){
    return {oee:null, status:'unreadable', confidence, evidence};
  }

  return {oee, status:'oee', confidence, evidence};
}

async function readSingleOeeRowWithAI(machine, rowCanvas){
  // Usa a mesma infraestrutura de IA que o TurnoSmart já possui.
  // O endpoint /api/gemini é tentado primeiro; se o projeto tiver outro
  // endpoint configurado, window.TURNOSMART_AI_ENDPOINT pode sobrescrever.
  const endpoint = window.TURNOSMART_AI_ENDPOINT || '/api/gemini';

  const image = rowCanvas.toDataURL('image/jpeg', 0.98);

  const prompt = `
Você é um leitor industrial de quadro OEE.
Analise SOMENTE a célula da máquina ${machine} mostrada na imagem.

REGRAS OBRIGATÓRIAS:
1. Procure apenas o OEE percentual manuscrito da célula.
2. NÃO use número de produção como OEE.
3. NÃO use número de máquina como OEE.
4. NÃO use números de outra linha.
5. Se a máquina não rodou, célula vazia, traço ou sem percentual legível: não invente.
6. O OEE válido deve estar entre 1% e 100% e o símbolo % precisa estar visualmente associado ao número.
7. Escrita pode ser vermelha, azul, verde ou preta.
8. Se houver dúvida, retorne unreadable.

Responda SOMENTE JSON:
{"status":"oee|not_running|blank|unreadable","oee":null,"confidence":0.0,"evidence":""}

Quando status="oee", evidence deve conter exatamente a pequena evidência visual, por exemplo "61%".
`;

  try{
    const response = await fetch(endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        task:'oee_cell_read',
        machine,
        prompt,
        image,
        responseFormat:'json'
      })
    });

    if(!response.ok){
      return {oee:null,status:'unavailable',confidence:0,evidence:'',error:`HTTP ${response.status}`};
    }

    const data = await response.json();
    const raw =
      data?.text ??
      data?.result ??
      data?.output ??
      data?.response ??
      data;

    return parseAiOeeJson(raw);
  }catch(error){
    return {oee:null,status:'unavailable',confidence:0,evidence:'',error:String(error?.message||error)};
  }
}

async function readSingleOeeRowHybrid(machine, rowCanvas){
  const local = await readSingleOeeRowLocally(rowCanvas);

  // Se OCR local já tem consenso forte, preserva.
  const localValue = normalizeHybridOee(local?.oee ?? local?.value);
  const localConfidence = Number(local?.confidence || 0);

  // IA sempre faz a segunda leitura quando disponível.
  const ai = await readSingleOeeRowWithAI(machine, rowCanvas);

  // Caso 1: OCR + IA concordam.
  if(localValue !== null && ai.oee !== null && Math.abs(localValue-ai.oee) <= 1){
    return {
      oee: ai.oee,
      value: ai.oee,
      confirmed:true,
      source:'OCR + IA',
      confidence:Math.max(0.95, ai.confidence),
      reason:`OCR e IA confirmaram ${ai.oee}%`,
      local,
      ai
    };
  }

  // Caso 2: IA vê claramente percentual e OCR não conseguiu ler.
  // Exige confiança alta + evidence contendo exatamente o percentual.
  if(localValue === null && ai.oee !== null && ai.confidence >= 0.90){
    const ev = String(ai.evidence||'');
    const evNumber = normalizeHybridOee(ev);
    if(evNumber === ai.oee && ev.includes('%')){
      return {
        oee:ai.oee,
        value:ai.oee,
        confirmed:true,
        source:'IA validada pela evidência',
        confidence:ai.confidence,
        reason:`IA confirmou visualmente ${ai.oee}%`,
        local,
        ai
      };
    }
  }

  // Caso 3: OCR local forte e IA indisponível.
  if(localValue !== null && localConfidence >= 0.92 && ai.status === 'unavailable'){
    return {
      ...local,
      oee:localValue,
      value:localValue,
      confirmed:true,
      source:'OCR local',
      reason:`OCR local confirmou ${localValue}%; IA indisponível`,
      ai
    };
  }

  // Divergência = NÃO entra no relatório.
  return {
    oee:null,
    value:null,
    confirmed:false,
    source:'não confirmado',
    confidence:0,
    reason:
      ai.status === 'not_running' ? 'IA indicou máquina sem produção/OEE.' :
      ai.status === 'blank' ? 'Célula vazia.' :
      (localValue !== null && ai.oee !== null) ? `Divergência: OCR ${localValue}% x IA ${ai.oee}%.` :
      ai.status === 'unavailable' ? 'IA indisponível e OCR sem confiança suficiente.' :
      'OCR e IA não confirmaram o percentual.',
    local,
    ai
  };
}

async function readSingleOeeRowLocally(rowCanvas){
  const variants=[
    makeOcrVariant(rowCanvas,'normal'),
    makeOcrVariant(rowCanvas,'contrast'),
    makeOcrVariant(rowCanvas,'color'),
    makeOcrVariant(rowCanvas,'threshold')
  ];

  const texts=[];

  for(const variant of variants){
    let text=await localOcrTextForCanvas(
      variant,
      7
    );

    let candidates=
      extractLikelyOeeCandidates(text);

    if(
      !candidates.withPercent.length
    ){
      const psm6=
        await localOcrTextForCanvas(
          variant,
          6
        );

      text=
        `${text} ${psm6}`
          .trim();

      candidates=
        extractLikelyOeeCandidates(text);
    }

    if(
      !candidates.withPercent.length
    ){
      const psm11=
        await localOcrTextForCanvas(
          variant,
          11
        );

      text=
        `${text} ${psm11}`
          .trim();
    }

    texts.push(text);
  }

  const readings=
    texts.map(
      extractLikelyOeeCandidates
    );

  const consensus=
    chooseConsensusOee(
      readings
    );

  return {
    ...consensus,
    texts
  };
}

function buildReliableRowCanvases(image, operationalDate, shift){
  const naturalWidth=image.naturalWidth||image.width;
  const naturalHeight=image.naturalHeight||image.height;

  // Detecta a coluna correta na foto original.
  const crop=getLegacyOeeCropSettings(
    image,
    operationalDate,
    shift
  );

  // Cria uma cópia de referência da coluna apenas para detectar linhas.
  // IMPORTANTE: essa cópia não é usada como fonte final do OCR.
  const ref=document.createElement('canvas');
  const rctx=ref.getContext('2d',{willReadFrequently:true});

  ref.width=Math.max(
    500,
    Math.min(1000,crop.sw)
  );

  ref.height=Math.max(
    1200,
    Math.round(
      crop.sh*
      (ref.width/Math.max(1,crop.sw))
    )
  );

  rctx.fillStyle='#fff';
  rctx.fillRect(0,0,ref.width,ref.height);

  rctx.imageSmoothingEnabled=true;
  rctx.imageSmoothingQuality='high';

  rctx.drawImage(
    image,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    ref.width,
    ref.height
  );

  const ranges=machineRowRangesFromCanvas(ref);

  return OEE_BOARD_MACHINES.map((machine,index)=>{
    const range=ranges[index]||{
      top:index*(ref.height/20),
      bottom:(index+1)*(ref.height/20)
    };

    // Converte coordenadas da imagem de referência
    // de volta para coordenadas da FOTO ORIGINAL.
    const topRatio=
      Math.max(
        0,
        Math.min(1,range.top/ref.height)
      );

    const bottomRatio=
      Math.max(
        0,
        Math.min(1,range.bottom/ref.height)
      );

    const sourceY=
      crop.sy+
      Math.round(
        crop.sh*topRatio
      );

    const sourceBottom=
      crop.sy+
      Math.round(
        crop.sh*bottomRatio
      );

    const rawHeight=
      Math.max(
        1,
        sourceBottom-sourceY
      );

    // Margem pequena na foto original para não cortar traços.
    const padY=
      Math.min(
        Math.round(rawHeight*0.10),
        Math.max(2,Math.round(naturalHeight*0.004))
      );

    const y=
      Math.max(
        0,
        sourceY-padY
      );

    const bottom=
      Math.min(
        naturalHeight,
        sourceBottom+padY
      );

    const h=
      Math.max(
        1,
        bottom-y
      );

    // Também abre levemente a coluna na horizontal,
    // pois às vezes o % fica encostado na borda.
    const padX=
      Math.min(
        Math.round(crop.sw*0.08),
        Math.max(4,Math.round(naturalWidth*0.01))
      );

    const x=
      Math.max(
        0,
        crop.sx-padX
      );

    const right=
      Math.min(
        naturalWidth,
        crop.sx+crop.sw+padX
      );

    const w=
      Math.max(
        1,
        right-x
      );

    // Canvas OCR preserva detalhe da foto original.
    const targetWidth=
      Math.max(
        1200,
        Math.min(
          2000,
          Math.round(w*2.2)
        )
      );

    const sourceAspect=
      h/Math.max(1,w);

    const targetHeight=
      Math.max(
        220,
        Math.min(
          520,
          Math.round(
            targetWidth*
            sourceAspect*
            1.25
          )
        )
      );

    const canvas=document.createElement('canvas');
    const ctx=canvas.getContext('2d');

    canvas.width=targetWidth;
    canvas.height=targetHeight;

    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';

    const marginX=24;
    const marginY=18;

    // AQUI é a mudança principal da V98.3:
    // recorta diretamente da foto ORIGINAL.
    ctx.drawImage(
      image,
      x,
      y,
      w,
      h,
      marginX,
      marginY,
      canvas.width-marginX*2,
      canvas.height-marginY*2
    );

    return {
      machine,
      canvas,
      dataUrl:canvas.toDataURL('image/jpeg',0.98),
      debug:{
        source:'original-highres',
        x,
        y,
        w,
        h,
        crop,
        rowTopRatio:topRatio,
        rowBottomRatio:bottomRatio
      }
    };
  });
}
// V98.5 — pré-processamento visual + Gemini do servidor + validação conservadora.
function buildVisionComposite(sourceCanvas){
  const modes=['normal','contrast','color','threshold'];
  const variants=modes.map(mode=>makeOcrVariant(sourceCanvas,mode));
  const width=Math.max(...variants.map(c=>c.width));
  const bandH=Math.max(...variants.map(c=>c.height));
  const out=document.createElement('canvas');
  const ctx=out.getContext('2d');
  out.width=width;
  out.height=bandH*variants.length;
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,out.width,out.height);
  variants.forEach((c,i)=>{
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality='high';
    ctx.drawImage(c,0,i*bandH,width,bandH);
  });
  return out;
}

async function readOeeRowsWithServerAI(rowsPrepared,scope){
  const rowImages=rowsPrepared.map(item=>{
    const enhanced=buildVisionComposite(item.canvas);
    return {machine:item.machine,dataUrl:enhanced.toDataURL('image/jpeg',0.96)};
  });
  const response=await fetch('/api/oee-vision',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({rowImages,scope})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok || !data?.ok){
    throw new Error(data?.error||`IA OEE HTTP ${response.status}`);
  }
  return new Map((data.rows||[]).map(r=>[normalizeMachineCode(r.machine),r]));
}

async function processOeeColumnPhoto() {
  const file=$('oeeImageInput')?.files?.[0];
  if(!file){ showToast('Escolha a foto do quadro primeiro.'); return []; }

  const statusEl=$('oeeStatus');
  const operationalDate=$('reportDate').value||todayISO();
  const shift=$('reportShift').value||'1';
  const scope=boardScopeForReport(operationalDate,shift);

  try{
    statusEl.textContent=`V98.5: corrigindo e melhorando a foto do quadro — ${scope.label}...`;
    const fullDataUrl=state.oeeImageDataUrl||await dataUrlFromFile(file);
    state.oeeImageDataUrl=fullDataUrl;
    const image=await loadImageElement(fullDataUrl);
    const rowsPrepared=buildReliableRowCanvases(image,operationalDate,shift);

    // A prévia agora mostra a célula original em alta resolução. A IA recebe
    // um composto com 4 tratamentos diferentes da MESMA célula.
    state.oeeRowPreviews=rowsPrepared.map(row=>row.dataUrl);

    statusEl.textContent=`V98.5: IA lendo 20 células melhoradas — ${scope.label}...`;
    let aiMap=new Map();
    let aiError='';
    try{ aiMap=await readOeeRowsWithServerAI(rowsPrepared,scope); }
    catch(e){ aiError=String(e?.message||e); console.error('IA OEE:',e); }

    const rows=[];
    for(let i=0;i<rowsPrepared.length;i++){
      const item=rowsPrepared[i];
      statusEl.textContent=`V98.5 validando ${i+1}/20 — ${item.machine}...`;

      // OCR local é uma segunda opinião, nunca a única fonte fraca.
      let local={value:null,confidence:0,reason:'OCR local indisponível',texts:[]};
      try{ local=await readSingleOeeRowLocally(item.canvas); }catch(e){ console.warn(e); }

      const ai=aiMap.get(normalizeMachineCode(item.machine))||{};
      const aiValue=normalizeHybridOee(ai.oee);
      const aiConfidence=Math.max(0,Math.min(100,Number(ai.confidence||0)));
      const localValue=normalizeHybridOee(local.value);
      const localConfidence=Number(local.confidence||0);

      let accepted=null, confidence=0, source='', description='';
      const agree=aiValue!==null && localValue!==null && Math.abs(aiValue-localValue)<=1;

      if(agree && aiConfidence>=70 && localConfidence>=78){
        accepted=Math.round((aiValue+localValue)/2);
        confidence=Math.min(99,Math.round((aiConfidence+localConfidence)/2+5));
        source='IA + OCR confirmados';
        description=`IA e OCR concordaram em ${accepted}%. ${String(ai.description||ai.evidence||'').slice(0,130)}`;
      }else if(aiValue!==null && aiConfidence>=92){
        // IA sozinha só entra com confiança MUITO alta. O prompt do servidor
        // exige símbolo % e proíbe usar produção/máquina como OEE.
        accepted=aiValue;
        confidence=aiConfidence;
        source='IA visual alta confiança';
        description=`IA confirmou ${accepted}% com ${aiConfidence}% de confiança. ${String(ai.description||ai.evidence||'').slice(0,130)}`;
      }else if(localValue!==null && localConfidence>=96 && !aiValue && aiError){
        // Fallback apenas se IA estiver realmente indisponível e OCR tiver
        // consenso excepcionalmente forte.
        accepted=localValue;
        confidence=localConfidence;
        source='OCR local excepcional';
        description=`OCR local confirmou ${accepted}%; IA indisponível (${aiError}).`;
      }else{
        source='Não confirmado';
        if(aiError) description=`IA indisponível: ${aiError}. O valor não entra no relatório.`;
        else if(aiValue!==null && localValue!==null) description=`Divergência: IA ${aiValue}% x OCR ${localValue}%. Conferir.`;
        else if(aiValue!==null) description=`IA sugeriu ${aiValue}% (${aiConfidence}%), abaixo da confiança exigida. Conferir.`;
        else description=String(ai.description||ai.evidence||local.reason||'Nenhum percentual confirmado.');
      }

      rows.push({
        machine:item.machine,
        oee:accepted===null?'':accepted,
        candidateOee:accepted===null?'':accepted,
        confidence,
        source,
        needsConfirmation:accepted===null,
        ambiguous:accepted===null,
        description
      });
    }

    state.oeeMachineEditorData=rows;
    renderOeeMachineEditor(rows);
    $('oeeOcrText').value=editorOeeText();
    state.oeeOcrText=$('oeeOcrText').value;

    const found=rows.filter(r=>r.oee!=='').length;
    const rate=Math.round(found/rows.length*100);
    statusEl.textContent=`V98.5 ${scope.label}: ${found}/20 OEE confirmados (${rate}%). Valores duvidosos NÃO entram no relatório nem nas prioridades.`;
    return rows;
  }catch(error){
    console.error('Leitor OEE V98.5 falhou:',error);
    statusEl.textContent=`Erro na leitura V98.5: ${error.message}`;
    showToast(`Leitor OEE: ${error.message}`);
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

  // OEE baixo sozinho não abre OS. Ele apenas aumenta a prioridade
  // quando a máquina também possui um problema técnico descrito.

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

  const sorted = deduped.sort((a, b) =>
    order[a.priority] - order[b.priority] ||
    b.recordedMinutes - a.recordedMinutes ||
    a.department.localeCompare(b.department)
  );

  const maintenance = sorted
    .filter(action => action.department === 'maintenance')
    .filter(action =>
      action.priority !== 'Baixa' ||
      action.recordedMinutes >= 20
    )
    .slice(0, MAX_MAINTENANCE_ACTIONS);

  const production = sorted
    .filter(action => action.department === 'production')
    .slice(0, MAX_PRODUCTION_ACTIONS);

  return [...maintenance, ...production]
    .sort((a, b) =>
      order[a.priority] - order[b.priority] ||
      b.recordedMinutes - a.recordedMinutes
    );
}

function getScale() {
  try { return JSON.parse(localStorage.getItem(STORAGE.scale)) || []; }
  catch { return []; }
}

function saveScale(items) {
  safeStorageSet(STORAGE.scale, JSON.stringify(items));
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
  const compactItems = (Array.isArray(items) ? items : [])
    .slice(0, STORAGE_HISTORY_LIMIT)
    .map(record => ({
      ...record,
      analysis: compactAnalysisForStorage(record.analysis || {}),
      actions: Array.isArray(record.actions)
        ? record.actions.map(compactActionForStorage)
        : []
    }));

  const saved = safeStorageSet(
    STORAGE.history,
    JSON.stringify(compactItems),
    { removeOnFailure: true }
  );

  if (!saved) {
    console.warn(
      'O relatório foi analisado, mas o histórico local não pôde ser salvo.'
    );
  }

  return saved;
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function initializeViewModule(name) {
  if (name === 'treinamentos') {
    const root = $('view-treinamentos');

    if (root && root.dataset.initialized !== 'true') {
      root.dataset.initialized = 'true';

      initTrainingModule().catch(error => {
        root.dataset.initialized = 'false';
        console.error('Falha no módulo Treinamentos:', error);
        showToast(`Falha ao iniciar treinamentos: ${error.message}`);
      });
    }
  }

  if (name === 'aovivo') {
    const root = $('view-aovivo');

    if (root && root.dataset.initialized !== 'true') {
      root.dataset.initialized = 'true';

      try {
        initLiveDashboard();
      } catch (error) {
        root.dataset.initialized = 'false';
        console.error('Falha no painel ao vivo:', error);
        showToast(`Falha ao iniciar painel ao vivo: ${error.message}`);
      }
    }
  }

  if (name === 'inteligencia') {
    initializeIntelligenceOnlyWhenNeeded();
    setTimeout(async()=>{
      initializeDynamicSgmanDates();
      renderDynamicSgmanManagement();
      await loadEmbeddedPowerBiOee();
      renderPowerBiSgmanDashboard();
    },100);
  }

  if (name === 'mecanico') {
    populateVirtualMechanicMachines(
      $('virtualMechanicMachine')?.value||''
    );
    renderKnowledgeGapDashboard();
  }
  if(name==='acoes'){
    setTimeout(renderSupervisorFusionPanel,100);
  }

}

function switchView(name) {
  const opened = safeSwitchView(name);

  if (opened) {
    initializeViewModule(name);
  }

  return opened;
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

function efficiencyTrendMessage() {
  const trend = calculateEfficiencyTrend();

  if (
    trend.current == null ||
    trend.previous == null ||
    trend.delta == null
  ) {
    return {
      line: `Tendência da eficiência: ${trend.arrow || '➜'} sem comparação anterior.`,
      guidance: trend.phrase ||
        'Registre o OEE do próximo turno para acompanhar a evolução.'
    };
  }

  const current = formatOee(trend.current);
  const previous = formatOee(trend.previous);
  const delta = Math.abs(trend.delta)
    .toFixed(1)
    .replace('.', ',');

  let movement;

  if (trend.direction === 'up') {
    movement = `melhora de ${delta} ponto(s)`;
  } else if (trend.direction === 'down') {
    movement = `piora de ${delta} ponto(s)`;
  } else {
    movement = 'estável';
  }

  return {
    line: `Tendência da eficiência: ${trend.arrow} ${movement} (${previous} → ${current}).`,
    guidance: trend.phrase
  };
}

function conciseMaintenanceRepairActions(action) {
  const analysis =
    action.sgmanHistoryAnalysis ||
    analyzeMachineHistoryForAction(action);

  const actions = [];

  if (analysis?.enoughEvidence) {
    (analysis.patterns || []).slice(0, 3).forEach(pattern => {
      const text = String(pattern.label || '')
        .replace(/\s*\(\d+x\)\s*$/i, '')
        .replace(/[.;]+$/, '')
        .trim();

      if (text) actions.push(text);
    });

    if (actions.length < 3) {
      (analysis.rankedTexts || []).slice(0, 3).forEach(item => {
        const text = cleanHistoricalResolution(item.text || '')
          .replace(/[.;]+$/, '')
          .trim();

        if (
          text &&
          !actions.some(existing =>
            normalizeKey(existing) === normalizeKey(text)
          )
        ) {
          actions.push(text);
        }
      });
    }
  }

  if (!actions.length) {
    const suggested = compactSgmanReminders(
      action.sgmanSuggestedResolution ||
      suggestedResolutionFromHistory(action),
      3,
      210
    );

    suggested
      .split(';')
      .map(item => item.trim())
      .filter(Boolean)
      .forEach(item => actions.push(item));
  }

  const genericHistoryMessage = actions.some(item =>
    /historico insuficiente|diagnostico no local antes de trocar/i.test(
      normalizeKey(item)
    )
  );

  if (genericHistoryMessage || !actions.length) {
    return 'analisar e resolver o problema durante o turno; registrar a causa e a solução no SGMan.';
  }

  return uniqueStrings(actions)
    .slice(0, 3)
    .map(item => item.replace(/[.;]+$/, ''))
    .join('; ') + '.';
}

function maintenanceEfficiencyLevel(metrics = state.reliability3Days || {}) {
  const mttr = Number(metrics.mttrMinutes);
  const mtbf = Number(metrics.mtbfMinutes);
  const reliability = Number(metrics.reliabilityPercent);
  const overdue = Number(state.sgmanHistory?.summary?.overdue || 0);
  const open = Number(state.sgmanHistory?.summary?.open || 0);
  const recurrence = Number(metrics.recurrentMachines || 0);
  let score = 100;
  if (Number.isFinite(mttr)) score -= mttr > 180 ? 30 : mttr > 120 ? 20 : mttr > 60 ? 10 : 0;
  if (Number.isFinite(mtbf)) score -= mtbf < 360 ? 30 : mtbf < 600 ? 20 : mtbf < 960 ? 10 : 0;
  if (Number.isFinite(reliability)) score -= reliability < 35 ? 20 : reliability < 55 ? 10 : 0;
  score -= overdue >= 50 ? 15 : overdue >= 20 ? 10 : overdue > 0 ? 5 : 0;
  score -= open >= 400 ? 10 : open >= 200 ? 5 : 0;
  score -= recurrence >= 5 ? 15 : recurrence >= 3 ? 10 : recurrence > 0 ? 5 : 0;
  score = Math.max(0, Math.min(100, score));
  if (score < 55) return { score, level: 'Crítico', status: 'red' };
  if (score < 75) return { score, level: 'Atenção', status: 'orange' };
  if (score < 90) return { score, level: 'Controlado', status: 'yellow' };
  return { score, level: 'Alto', status: 'green' };
}

function maintenanceDemandItems(metrics = state.reliability3Days || {}) {
  const demands = [];
  const summary = state.sgmanHistory?.summary || {};
  const trend = calculateEfficiencyTrend();
  if (trend.direction === 'down') demands.push('A eficiência caiu. O líder deve apresentar recuperação ainda durante o turno.');
  if (Number(metrics.mttrMinutes || 0) > 90) demands.push(`Reduzir o MTTR atual de ${formatReliabilityTime(metrics.mttrMinutes)} com diagnóstico, peças e ferramentas preparados antes da intervenção.`);
  if (Number.isFinite(Number(metrics.mtbfMinutes)) && Number(metrics.mtbfMinutes) < 720) demands.push(`O MTBF está em ${formatReliabilityTime(metrics.mtbfMinutes)}. Eliminar as falhas repetitivas das máquinas prioritárias.`);
  if (Number(summary.overdue || 0) > 0) demands.push(`Retirar OS do atraso: existem ${Number(summary.overdue || 0)} ordem(ns) atrasada(s). Cada líder deve definir responsável e prazo.`);
  if (Number(metrics.recurrentMachines || 0) > 0) demands.push(`Existem ${Number(metrics.recurrentMachines || 0)} máquina(s) reincidente(s). Não aceitar regulagem temporária sem causa raiz.`);
  if (Number(metrics.completedCurrentShift || 0) === 0) demands.push('Nenhuma OS foi concluída no turno. Cobrar atualização e encerramento das intervenções executadas.');
  demands.push('Nenhuma máquina deve ser liberada sem teste, acompanhamento e confirmação de estabilidade.');
  demands.push('Toda OS deve conter problema, causa real, serviço executado e resultado do teste.');
  return uniqueStrings(demands).slice(0, 6);
}

function maintenanceShiftCommitments(metrics = state.reliability3Days || {}) {
  return (metrics.dailyPlan || []).slice(0, 3).map((row, index) => ({
    priority: index + 1,
    machine: row.machine,
    target: row.mttrMinutes && row.mttrMinutes > 90 ? `reduzir MTTR abaixo de ${formatReliabilityTime(row.mttrMinutes * 0.75)}` : 'eliminar reincidência e manter estabilidade',
    validation: 'testar, acompanhar produção e registrar a conclusão no SGMan'
  }));
}

function maintenancePeopleAccountability() {
  const metrics = state.reliability3Days || calculateReliability3Days();
  const team = calculateTeamPerformance();
  const working = detectWorkingCrew(new Date());
  const active = new Set((working.roster || []).map(user => String(user).toLocaleLowerCase('pt-BR')));
  return team.filter(row => !active.size || active.has(String(row.executante).toLocaleLowerCase('pt-BR'))).slice(0, 8).map(row => {
    const accountability = [];
    if (row.needsTraining) accountability.push(`executar treinamento prático em ${row.trainingCategory || 'diagnóstico e apontamento'}`);
    if (!row.bestCategory) accountability.push('melhorar o preenchimento das conclusões para permitir avaliação técnica');
    if (Number.isFinite(Number(row.mttrMinutes)) && Number.isFinite(Number(metrics.mttrMinutes)) && row.mttrMinutes > metrics.mttrMinutes * 1.25) accountability.push('acompanhar intervenção com referência técnica para reduzir tempo de diagnóstico');
    if (!accountability.length) accountability.push('manter padrão de execução, teste e registro da solução');
    return { ...row, accountability: accountability.slice(0, 2) };
  });
}

function renderMaintenanceAccountabilityPanel() {
  const target = $('maintenanceAccountabilityPanel');
  if (!target) return;
  const metrics = state.reliability3Days || calculateReliability3Days();
  const level = maintenanceEfficiencyLevel(metrics);
  const demands = maintenanceDemandItems(metrics);
  const commitments = maintenanceShiftCommitments(metrics);
  const people = maintenancePeopleAccountability();
  target.innerHTML = `
    <div class="maintenance-level maintenance-level-${escapeHtml(level.status)}"><div><span>Índice de gestão</span><strong>${escapeHtml(level.level)}</strong></div><b>${level.score}/100</b></div>
    <div class="maintenance-accountability-grid">
      <section><h3>Cobranças do turno</h3><ol>${demands.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></section>
      <section><h3>Compromissos das máquinas prioritárias</h3>${commitments.length ? commitments.map(item => `<article class="maintenance-commitment"><strong>${item.priority}. ${escapeHtml(item.machine)}</strong><span>Meta: ${escapeHtml(item.target)}</span><small>Validação: ${escapeHtml(item.validation)}</small></article>`).join('') : '<p class="muted">Atualize o SGMan para definir compromissos por máquina.</p>'}</section>
    </div>
    <section class="maintenance-people-accountability"><h3>Acompanhamento da equipe do turno</h3>${people.length ? people.map(row => `<article><div><strong>${escapeHtml(row.label || row.executante)}</strong><span>${row.completed} OS • MTTR ${escapeHtml(formatReliabilityTime(row.mttrMinutes, '-'))}</span></div><ul>${row.accountability.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>`).join('') : '<p class="muted">Sem dados suficientes dos mecânicos da escala.</p>'}</section>`;
}

function maintenanceAccountabilityReport() {
  const metrics =
    state.reliability3Days || calculateReliability3Days();

  const trend = efficiencyTrendMessage();
  const level = maintenanceEfficiencyLevel(metrics);
  const demands = maintenanceDemandItems(metrics);
  const commitments = maintenanceShiftCommitments(metrics);
  const people = maintenancePeopleAccountability();
  const targets = maintenanceTargets();
  const summary = state.sgmanHistory?.summary || {};

  const currentOee =
    calculateEfficiencyTrend()?.current ??
    getRecentOeeDashboard()?.companyAverage ??
    null;

  const goalLines = [
    {
      label: 'OEE',
      target: `≥ ${Number(targets.oee || 70).toFixed(0)}%`,
      current: currentOee == null ? '-' : formatOee(currentOee),
      ok: currentOee != null && currentOee >= Number(targets.oee || 70)
    },
    {
      label: 'MTTR',
      target: `≤ ${formatReliabilityTime(Number(targets.mttrMinutes || 60))}`,
      current: formatReliabilityTime(metrics.mttrMinutes),
      ok: Number.isFinite(Number(metrics.mttrMinutes)) &&
        Number(metrics.mttrMinutes) <= Number(targets.mttrMinutes || 60)
    },
    {
      label: 'MTBF',
      target: `≥ ${formatReliabilityTime(Number(targets.mtbfHours || 12) * 60)}`,
      current: formatReliabilityTime(metrics.mtbfMinutes),
      ok: Number.isFinite(Number(metrics.mtbfMinutes)) &&
        Number(metrics.mtbfMinutes) >= Number(targets.mtbfHours || 12) * 60
    },
    {
      label: 'Confiabilidade',
      target: `≥ ${Number(targets.reliabilityPercent || 55).toFixed(0)}%`,
      current: formatReliabilityPercent(metrics.reliabilityPercent),
      ok: Number.isFinite(Number(metrics.reliabilityPercent)) &&
        Number(metrics.reliabilityPercent) >= Number(targets.reliabilityPercent || 55)
    },
    {
      label: 'OS atrasadas',
      target: `≤ ${Number(targets.maxOverdueOrders || 20)}`,
      current: String(Number(summary.overdue || 0)),
      ok: Number(summary.overdue || 0) <= Number(targets.maxOverdueOrders || 20)
    },
    {
      label: 'Reincidências',
      target: `≤ ${Number(targets.maxRecurrenceMachines || 2)}`,
      current: String(Number(metrics.recurrentMachines || 0)),
      ok: Number(metrics.recurrentMachines || 0) <= Number(targets.maxRecurrenceMachines || 2)
    }
  ];

  const lines = [
    '*RELATÓRIO DIÁRIO*',
    organizationContextText(),
    '',
    `Índice de gestão: *${level.level}* — ${level.score}/100.`
  ];

  if (reportModuleEnabled('efficiencyTrend')) {
    lines.push(trend.line);
    lines.push(`Situação: ${trend.guidance}`);
  }

  if (reportModuleEnabled('reliability')) {
    lines.push('');
    lines.push('*INDICADORES*');
    lines.push(`OEE: ${currentOee == null ? '-' : formatOee(currentOee)}`);
    lines.push(`MTTR: ${formatReliabilityTime(metrics.mttrMinutes)}`);
    lines.push(`MTBF: ${formatReliabilityTime(metrics.mtbfMinutes)}`);
    lines.push(`Confiabilidade 12h: ${formatReliabilityPercent(metrics.reliabilityPercent)}`);
    lines.push(`OS concluídas no turno: ${Number(metrics.completedCurrentShift || 0)}`);
    lines.push(`OS em atraso: ${Number(summary.overdue || 0)}`);
    lines.push(`Reincidências: ${Number(metrics.recurrentMachines || 0)}`);

    lines.push('');
    lines.push('*METAS DO TURNO*');
    goalLines.forEach(goal => {
      lines.push(`${goal.ok ? '✅' : '❌'} ${goal.label}: meta ${goal.target} | atual ${goal.current}`);
    });
  }

  if (reportModuleEnabled('priorities')) {
    lines.push('');
    lines.push('*PRIORIDADES DO TURNO*');
    if (commitments.length) {
      commitments.forEach(item => {
        lines.push(`${item.priority}. *${item.machine}* — ${item.target}; ${item.validation}.`);
      });
    } else {
      lines.push('Atualizar o SGMan e definir três máquinas prioritárias.');
    }
  }

  if (reportModuleEnabled('accountability')) {
    lines.push('');
    lines.push('*COBRANÇAS DO TURNO*');
    demands.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
  }

  if (reportModuleEnabled('people') && people.length) {
    lines.push('');
    lines.push('*ACOMPANHAMENTO DA EQUIPE*');
    people.slice(0, 5).forEach(row => {
      lines.push(`• *${row.label || row.executante}* — ${row.accountability.join('; ')}.`);
    });
  }

  lines.push('');
  lines.push('*Objetivo do turno:* entregar máquinas estáveis, reduzir reincidências, concluir as ordens e manter alto nível de eficiência.');

  return lines.join('\\n');
}

function maintenanceMessage() {
  if (!state.analysis) return '';

  // A lista final vem da Inteligência do Supervisor.
  // Quadro OEE + relatório da produção escolhem as máquinas.
  // SGMan entra somente para sugerir verificações técnicas.
  let fusionRows=(state.supervisorFusionRows?.length
    ? state.supervisorFusionRows
    : supervisorFusionRanking(5)
  );

  if(!fusionRows.length){
    fusionRows=fallbackCurrentShiftPriorities(3);
  }

  let supervisorRows=fusionRows.filter(row=>row.selected).slice(0,3);

  if(!supervisorRows.length){
    fusionRows=applyAutomaticSupervisorSelection(fusionRows);
    state.supervisorFusionRows=fusionRows;
    supervisorRows=fusionRows.filter(row=>row.selected).slice(0,3);
  }

  if(!supervisorRows.length){
    supervisorRows=fallbackCurrentShiftPriorities(3);
    fusionRows=supervisorRows;
  }

  state.supervisorFusionRows=fusionRows;

  // Segunda barreira absoluta:
  // apenas OEE atual confirmado abaixo de 65%.
  supervisorRows=supervisorRows
    .filter(row=>row.oee!==null && row.oee<OEE_PRIORITY_LIMIT)
    .sort((a,b)=>a.oee-b.oee)
    .slice(0,3);

  const lowOee=supervisorRows
    .filter(row=>row.oee!==null && row.oee<OEE_PRIORITY_LIMIT)
    .map(row=>({machine:row.machine,oee:row.oee}));

  const recurrence=deriveRecurrenceMachines(state.analysis)
    .filter(machine=>supervisorRows.some(row=>row.machine===normalizeMachineCode(machine)));

  const trend=efficiencyTrendMessage();
  const lines=['*AÇÕES DA MANUTENÇÃO*'];

  if(state.analysis.reportedOee){
    lines.push(`OEE do turno: ${String(state.analysis.reportedOee).replace('.', ',')}%.`);
  }

  lines.push(trend.line);
  lines.push(`Direção do turno: ${trend.guidance}`);

  if(state.analysis.sgmanSummary){
    lines.push(`SGMan: ${sgmanDailySummaryText(state.analysis.sgmanSummary)}.`);
  }

  if(state.analysis.reliability3Days){
    lines.push(
      `SGMan 3 dias — MTTR: ${formatReliabilityTime(state.analysis.reliability3Days.mttrMinutes)} | `+
      `MTBF: ${formatReliabilityTime(state.analysis.reliability3Days.mtbfMinutes)} | `+
      `Confiabilidade 12h: ${formatReliabilityPercent(state.analysis.reliability3Days.reliabilityPercent)} | `+
      `OS concluídas no turno atual: ${Number(state.analysis.reliability3Days.completedCurrentShift||0)}.`
    );
  }

  if(state.analysis.boardScope?.label){
    lines.push(`Quadro OEE: ${state.analysis.boardScope.label}.`);
  }

  const dashboard=getRecentOeeDashboard();
  if(dashboard.companyAverage!=null){
    lines.push(`OEE geral 3 dias: ${formatOee(dashboard.companyAverage)}.`);
  }

  const photoOeeRows=(state.oeeMachineEditorData||[])
    .map(row=>({
      machine:row.machine,
      oee:row.oee===''?null:Number(row.oee),
      uncertain:row.needsConfirmation===true,
      description:String(row.description||row.source||'')
    }))
    .filter(row=>
      Number.isFinite(row.oee) &&
      row.oee>=0 &&
      row.oee<=100
    )
    .sort((a,b)=>a.oee-b.oee);

  if(photoOeeRows.length){
    lines.push('');
    lines.push('*OEE LIDO DA FOTO*');

    photoOeeRows.forEach(row=>{
      const lost=
        row.oee<OEE_PRIORITY_LIMIT
          ?` — perda estimada ${formatOeeLostHours(row.oee)}`
          :'';

      lines.push(
        `• ${row.machine}: ${row.oee.toFixed(1).replace('.', ',')}%`+
        `${row.uncertain?' *(a confirmar)*':''}`+
        lost+
        `${row.description?` — ${row.description}`:''}`
      );
    });

    const confirmed=
      photoOeeRows.filter(row=>!row.uncertain).length;

    const uncertain=
      photoOeeRows.filter(row=>row.uncertain).length;

    lines.push(
      `Leitura da foto: ${confirmed} confirmado(s)`+
      `${uncertain?` | ${uncertain} a confirmar`:''}.`
    );
  }

  lines.push('');
  lines.push('*AÇÕES PARA CORREÇÃO*');

  if(!supervisorRows.length){
    lines.push('Nenhuma máquina abaixo de 65% foi identificada no quadro atual. Confira os valores do OEE.');
  }else{
    supervisorRows.forEach((row,index)=>{
      const priority=oeePriorityMeta(row.oee);
      const actions=oeeObjectiveActions(
        (row.actions||[]).filter(action=>
          !normalizeKey(action).includes('durante o turno') &&
          !normalizeKey(action).includes('problema continuar')
        ),
        row.oee
      ).slice(0,5);

      lines.push(
        `${index+1}. ${priority.icon} *${priority.label} — ${row.machine}* — `+
        `OEE ${row.oee.toFixed(1).replace('.', ',')}% — `+
        `perda estimada ${formatOeeLostHours(row.oee)}.`
      );
      actions.forEach(action=>lines.push(`   • ${action}`));
      lines.push(`   Histórico técnico: ${row.historyCount||0} OS semelhante(s) no SGMan.`);
    });
  }

  if(lowOee.length){
    lines.push(`OEE abaixo de 65: ${lowOee.map(row=>`${row.machine} ${row.oee.toFixed(1).replace('.', ',')}%`).join(' | ')}.`);
  }

  if(recurrence.length){
    lines.push(`Reincidência entre as prioridades atuais: ${recurrence.join(', ')}.`);
  }

  lines.push('*Foco:* atacar primeiro o menor OEE, resolver durante o turno, não deixar o problema continuar e confirmar estabilidade antes da liberação.');

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
  const productionTrend = efficiencyTrendMessage();
  lines.push(productionTrend.line);
  lines.push(`Direção do turno: ${productionTrend.guidance}`);
  if (analysis.sgmanSummary) lines.push(`SGMan: ${sgmanDailySummaryText(analysis.sgmanSummary)}.`);
  if (analysis.reliability3Days) lines.push(`SGMan 3 dias — MTTR: ${formatReliabilityTime(analysis.reliability3Days.mttrMinutes)} | MTBF: ${formatReliabilityTime(analysis.reliability3Days.mtbfMinutes)} | Confiabilidade 12h: ${formatReliabilityPercent(analysis.reliability3Days.reliabilityPercent)} | OS concluídas no turno atual: ${Number(analysis.reliability3Days.completedCurrentShift || 0)}.`);
  if (analysis.boardScope?.label) lines.push(`Quadro OEE: ${analysis.boardScope.label}.`);
  const dashboard3Days = getRecentOeeDashboard();
  if (dashboard3Days.companyAverage != null) lines.push(`OEE geral 3 dias: ${formatOee(dashboard3Days.companyAverage)}.`);
  if (analysis.reworkCount > 0) lines.push(`Retrabalho: ${analysis.reworkCount}.`);

  let step = 1;
  if (lowOee.length) lines.push(`${step++}. Priorizar exclusivamente as máquinas com OEE abaixo de 65: ${oeeLowListText(lowOee)}.`);
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
    ['OS concluídas no turno atual', Number(analysis.reliability3Days?.completedCurrentShift || 0), `${analysis.reliability3Days?.currentShiftName || 'Turno'} • ${analysis.reliability3Days?.currentShiftLabel || ''}`],
    ['OS em atraso', Number(analysis.sgmanSummary?.overdue || 0), 'Pendências atuais no SGMan'],
    ['MTTR SGMan', formatReliabilityTime(analysis.reliability3Days?.mttrMinutes), `${Number(analysis.reliability3Days?.repairIntervals || 0)} reparo(s) válido(s)`],
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
  renderSgmanMachineAnalysis();
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
  safeStorageSet(
    STORAGE.sgmanHistory,
    JSON.stringify(history),
    { removeOnFailure: true }
  );
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
    const milliseconds = value < 100000000000
      ? value * 1000
      : value;

    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(value || '').trim();
  if (!text) return null;

  const dotNet = text.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//i);
  if (dotNet) {
    const date = new Date(Number(dotNet[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{10,13}$/.test(text)) {
    const numeric = Number(text);
    const milliseconds = text.length === 10
      ? numeric * 1000
      : numeric;

    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const iso = text.match(
    /(\d{4})[-/](\d{2})[-/](\d{2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/
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

function configuredMachineCodes() {
  const configured = Object.keys(getConfig().sgmanTagMap || {});
  const board = Array.isArray(OEE_BOARD_MACHINES)
    ? OEE_BOARD_MACHINES
    : [];

  return uniqueStrings([...configured, ...board])
    .filter(machine => /^MK-\d+$/i.test(machine))
    .sort((a, b) =>
      Number(b.replace(/\D/g, '')) -
      Number(a.replace(/\D/g, ''))
    );
}

function orderMachineForReliability(order = {}) {
  const explicit = (
    machineKeyFromText(order.machine || '') ||
    machineKeyFromText(order.tag || '') ||
    machineKeyFromText(order.local || '') ||
    machineKeyFromText(order.description || '')
  );

  if (explicit) return explicit;

  const source = normalizeKey(
    [
      order.tag,
      order.local,
      order.description,
      order.comment
    ].filter(Boolean).join(' ')
  );

  for (const machine of configuredMachineCodes()) {
    const number = machine.replace(/\D/g, '');
    const pattern = new RegExp(`(^|[^0-9])0*${number}([^0-9]|$)`);

    if (pattern.test(source)) {
      return machine;
    }
  }

  return '';
}

function isStoppedSgmanOrder(order = {}) {
  const raw = order.machineStopped;

  if (raw === true || raw === 1 || raw === '1') return true;

  const value = normalizeKey(String(raw || ''));

  return [
    'sim',
    'true',
    'parada',
    'maquina parada',
    'equipamento parado'
  ].includes(value);
}

function currentOperationalShiftWindow(reference = new Date()) {
  const now = new Date(reference);

  if (Number.isNaN(now.getTime())) {
    const fallback = new Date();
    return {
      start: fallback,
      end: fallback,
      effectiveEnd: fallback,
      label: 'Horário inválido',
      shiftName: 'Turno'
    };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const morningStartMinutes = 6 * 60;
  const nightStartMinutes = 18 * 60;
  const nightEndMinutes = 6 * 60 + 20;

  let start;
  let scheduledEnd;
  let shiftName;

  if (currentMinutes >= morningStartMinutes && currentMinutes < nightStartMinutes) {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0, 0);
    scheduledEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 20, 0, 0);
    shiftName = 'Turno da manhã';
  } else if (currentMinutes >= nightStartMinutes) {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0, 0);
    scheduledEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 6, 20, 0, 0);
    shiftName = 'Turno da noite';
  } else if (currentMinutes < nightEndMinutes) {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 18, 0, 0, 0);
    scheduledEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 20, 0, 0);
    shiftName = 'Turno da noite';
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0, 0);
    scheduledEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 20, 0, 0);
    shiftName = 'Turno da manhã';
  }

  const timeLabel = date => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateLabel = date => date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const crossesDate = start.getFullYear() !== scheduledEnd.getFullYear() || start.getMonth() !== scheduledEnd.getMonth() || start.getDate() !== scheduledEnd.getDate();
  const label = crossesDate
    ? `${dateLabel(start)} ${timeLabel(start)} até ${dateLabel(scheduledEnd)} ${timeLabel(scheduledEnd)}`
    : `${timeLabel(start)} até ${timeLabel(scheduledEnd)}`;

  return {
    start,
    end: scheduledEnd,
    effectiveEnd: new Date(Math.min(now.getTime(), scheduledEnd.getTime())),
    label,
    shiftName
  };
}

function completedOrdersInCurrentOperationalShift(orders = []) {
  const window = currentOperationalShiftWindow();

  const completed = orders.filter(order => {
    if (order.statusKey !== 'completed') return false;

    const completionDate = parseSgmanDateTime(order.endDate);
    if (!completionDate) return false;

    return (
      completionDate >= window.start &&
      completionDate <= window.effectiveEnd
    );
  });

  return {
    count: completed.length,
    orders: completed,
    ...window
  };
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
  }

  const mttrMinutes = averageNumbers(repairDurations);
  const mtbfMinutes = averageNumbers(failureIntervals);
  const reliabilityPercent = reliabilityPercentForMission(mtbfMinutes, 12);

  return {
    machine,
    failureCount: sortedOrders.length,
    completedRepairs: repairDurations.length,
    repairIntervals: repairDurations.length,
    failureIntervals: failureIntervals.length,
    mttrMinutes,
    mtbfMinutes,
    reliabilityPercent,
    recurrent: sortedOrders.length >= 2
  };
}

function calculateEfficiencyTrend() {
  const dashboard = getRecentOeeDashboard();
  const values = (dashboard.shifts || [])
    .map(item => ({
      label: item.label,
      value: Number(item.reportedOee)
    }))
    .filter(item => Number.isFinite(item.value) && item.value > 0);

  const currentAnalysisValue = Number(state.analysis?.reportedOee);

  if (
    Number.isFinite(currentAnalysisValue) &&
    currentAnalysisValue > 0 &&
    !values.some(item =>
      item.label === `${formatDate(state.analysis?.date)} ${
        String(state.analysis?.shift) === '2' ? 'B' : 'A'
      }`
    )
  ) {
    values.push({
      label: 'Turno atual',
      value: currentAnalysisValue
    });
  }

  if (!values.length) {
    return {
      direction: 'unknown',
      arrow: '➜',
      current: null,
      previous: null,
      delta: null,
      phrase: 'Registre o OEE do turno para acompanhar a evolução da eficiência.'
    };
  }

  const current = values[values.length - 1].value;
  const previous = values.length >= 2
    ? values[values.length - 2].value
    : null;

  const delta = previous === null
    ? null
    : current - previous;

  let direction = 'stable';
  let arrow = '➜';

  if (delta !== null && delta >= 0.5) {
    direction = 'up';
    arrow = '⬆';
  } else if (delta !== null && delta <= -0.5) {
    direction = 'down';
    arrow = '⬇';
  }

  let phrase;

  if (current >= 70 && direction === 'up') {
    phrase = 'Boa evolução. Mantenha o ritmo e elimine as pequenas paradas para fechar o turno ainda melhor.';
  } else if (current >= 70) {
    phrase = 'Resultado positivo. O próximo passo é estabilizar as máquinas críticas e evitar reincidências.';
  } else if (current >= 65 && direction === 'up') {
    phrase = 'A recuperação começou. Continue atacando as maiores perdas para ultrapassar a meta.';
  } else if (current >= 65) {
    phrase = 'Estamos perto. Reaja nas três máquinas prioritárias e transforme pequenas melhorias em ganho de eficiência.';
  } else if (direction === 'up') {
    phrase = 'A eficiência ainda está baixa, mas a tendência virou. Mantenha o foco nas causas de maior impacto.';
  } else {
    phrase = 'O turno ainda pode reagir. Reduza o MTTR, elimine reincidências e recupere uma máquina crítica de cada vez.';
  }

  return {
    direction,
    arrow,
    current,
    previous,
    delta,
    phrase
  };
}

function calculateReliability3Days() {
  const now = new Date();
  const periodMinutes = 72 * 60;
  const cutoff = new Date(now.getTime() - periodMinutes * 60000);

  // Somente corretivas que realmente marcaram máquina parada.
  const correctiveOrders = (state.sgmanHistory?.orders || [])
    .filter(isCorrectiveSgmanOrder)
    .filter(isStoppedSgmanOrder)
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
      (b.mttrMinutes ?? 0) - (a.mttrMinutes ?? 0) ||
      a.machine.localeCompare(b.machine, 'pt-BR', { numeric: true })
    );

  const allRepairDurations = [];
  const allFailureIntervals = [];

  for (const orders of machineMap.values()) {
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
      const interval = validIntervalMinutes(
        sortedOrders[index - 1].reliabilityStart,
        sortedOrders[index].reliabilityStart
      );

      if (interval !== null) allFailureIntervals.push(interval);
    }
  }

  const mttrMinutes = averageNumbers(allRepairDurations);
  const mtbfMinutes = averageNumbers(allFailureIntervals);
  const reliabilityPercent = reliabilityPercentForMission(mtbfMinutes, 12);
  const failureCount = correctiveOrders.length;
  const recurrentMachines = rows.filter(row => row.recurrent).length;

  const currentShift = completedOrdersInCurrentOperationalShift(
    state.sgmanHistory?.orders || []
  );

  const dailyPlan = rows
    .map(row => {
      const mttrPenalty = Number(row.mttrMinutes || 0) / 30;
      const mtbfPenalty = row.mtbfMinutes
        ? Math.max(0, (24 * 60 - row.mtbfMinutes) / 60)
        : 8;
      const score =
        row.failureCount * 10 +
        mttrPenalty +
        mtbfPenalty +
        (row.recurrent ? 8 : 0);

      return {
        ...row,
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  let note;

  if (!failureCount) {
    note = 'Nenhuma OS corretiva com máquina parada = sim foi encontrada nas últimas 72 horas.';
  } else {
    const missing = [];

    if (mttrMinutes === null) {
      missing.push('MTTR: faltam conclusões com início e fim válidos');
    }

    if (mtbfMinutes === null) {
      missing.push('MTBF: são necessárias duas falhas da mesma máquina');
    }

    note = missing.length
      ? `${missing.join('. ')}.`
      : 'Indicadores calculados apenas com corretivas que marcaram a máquina como parada, agrupando todas as TAGs filhas na máquina principal.';
  }

  return {
    periodHours: 72,
    missionHours: 12,
    mttrMinutes,
    mtbfMinutes,
    reliabilityPercent,
    failureCount,
    completedRepairs: allRepairDurations.length,
    repairIntervals: allRepairDurations.length,
    failureIntervals: allFailureIntervals.length,
    recurrentMachines,
    rows,
    dailyPlan,
    completedCurrentShift: currentShift.count,
    currentShiftLabel: currentShift.label,
    currentShiftName: currentShift.shiftName,
    currentShiftStart: currentShift.start.toISOString(),
    currentShiftEnd: currentShift.effectiveEnd.toISOString(),
    efficiencyTrend: calculateEfficiencyTrend(),
    note
  };
}

function reliabilitySummaryText(metrics = state.reliability3Days) {
  return [
    `MTTR SGMan: ${formatReliabilityTime(metrics?.mttrMinutes)}`,
    `MTBF SGMan: ${formatReliabilityTime(metrics?.mtbfMinutes)}`,
    `Confiabilidade 12h: ${formatReliabilityPercent(metrics?.reliabilityPercent)}`,
    `OS concluídas no turno atual: ${Number(metrics?.completedCurrentShift || 0)}`,
    `Falhas com máquina parada: ${Number(metrics?.failureCount || 0)}`
  ].join(' | ');
}


function managerGuidance(metrics = {}) {
  const trend = metrics.efficiencyTrend || {};
  const top = metrics.dailyPlan?.[0];
  const overdue = Number(state.sgmanHistory?.summary?.overdue || 0);

  if (!top) return 'Atualize o SGMan e registre o OEE para montar o plano do turno.';
  if (trend.direction === 'down' && overdue > 0) return `A eficiência está caindo. Comece pela ${top.machine}, retire as OS críticas do atraso e acompanhe até a conclusão.`;
  if (trend.direction === 'down') return `A eficiência está caindo. Direcione o melhor recurso para ${top.machine} e ataque primeiro a falha reincidente.`;
  if (Number(metrics.mttrMinutes || 0) >= 120) return `O MTTR está alto. Antecipe peças e ferramentas antes de iniciar a intervenção na ${top.machine}.`;
  if (Number(metrics.recurrentMachines || 0) >= 3) return `Há ${metrics.recurrentMachines} máquinas reincidentes. O foco deve ser eliminar causa raiz, não apenas restaurar a produção.`;
  return `Mantenha o ritmo. Proteja a disponibilidade da ${top.machine} e acompanhe as três prioridades até o fim do turno.`;
}


function orderExecutanteKey(order = {}) {
  return String(order.executante || order.executor || '').trim();
}

function orderTechnicalCategory(order = {}) {
  const text = normalizeKey([
    order.description, order.comment, order.solution, order.typeService
  ].filter(Boolean).join(' '));
  const categories = [
    ['faca', /faca|contra ?faca|corte/],
    ['camme', /camme|came|leva|sincronismo/],
    ['altura', /altura|desnivel|varia/],
    ['cola', /cola|hhs|colagem/],
    ['pneumática', /pneumat|mangueira|valvula|cilindro/],
    ['elétrica', /sensor|encoder|drive|eletric|rele|fusivel|cabo/],
    ['bobina', /bobina|desbobin|freio|tensao/],
    ['rolamento', /rolamento|eixo|folga/],
    ['limpeza', /limpeza|residuo|sujeira|refilo/]
  ];
  return categories.find(([, regex]) => regex.test(text))?.[0] || 'geral';
}

function calculateTeamPerformance() {
  const orders = (state.sgmanHistory?.orders || [])
    .filter(order => order.statusKey === 'completed')
    .filter(order => orderExecutanteKey(order));
  const map = new Map();
  orders.forEach(order => {
    const name = orderExecutanteKey(order);
    const duration = sgmanRepairDuration(order);
    const category = orderTechnicalCategory(order);
    if (!map.has(name)) map.set(name, { executante:name, completed:0, durations:[], categories:{} });
    const row=map.get(name); row.completed++;
    if (duration !== null) row.durations.push(duration);
    row.categories[category] ||= {count:0,durations:[]};
    row.categories[category].count++;
    if (duration !== null) row.categories[category].durations.push(duration);
  });
  const rows=[...map.values()].map(row=>{
    const categoryRows=Object.entries(row.categories).map(([category,data])=>({category,count:data.count,mttrMinutes:averageNumbers(data.durations)}));
    const bestCategory=categoryRows.filter(x=>x.count>=2&&x.mttrMinutes!==null).sort((a,b)=>a.mttrMinutes-b.mttrMinutes)[0]||null;
    return {executante:row.executante,label:sgmanUserLabel(row.executante),completed:row.completed,mttrMinutes:averageNumbers(row.durations),categoryRows,bestCategory};
  });
  const teamAverage=averageNumbers(rows.map(r=>r.mttrMinutes).filter(v=>v!==null));
  rows.forEach(row=>{
    row.needsTraining=row.mttrMinutes!==null&&teamAverage!==null&&row.mttrMinutes>teamAverage*1.35;
    row.trainingCategory=row.categoryRows.filter(x=>x.count>=2&&x.mttrMinutes!==null).sort((a,b)=>(b.mttrMinutes||0)-(a.mttrMinutes||0))[0]?.category||'';
  });
  rows.sort((a,b)=>(a.mttrMinutes??Infinity)-(b.mttrMinutes??Infinity)||b.completed-a.completed);
  state.teamPerformance=rows; return rows;
}

function findMentorForCategory(category, rows=state.teamPerformance) {
  return rows.map(row=>{ const item=row.categoryRows.find(x=>x.category===category); return item?{label:row.label,executante:row.executante,count:item.count,mttrMinutes:item.mttrMinutes}:null; })
    .filter(x=>x&&x.count>=2&&x.mttrMinutes!==null).sort((a,b)=>a.mttrMinutes-b.mttrMinutes||b.count-a.count)[0]||null;
}

function buildPreventivePlan(metrics = state.reliability3Days || {}) {
  const plan=(metrics.rows||[]).map(row=>{
    const orders=state.sgmanMachineHistory?.[row.machine]?.orders||[];
    const patterns=countHistorySolutionPatterns(orders.filter(o=>o.statusKey==='completed')).slice(0,3);
    const actions=patterns.length?patterns.map(p=>p.label):['inspecionar o conjunto com maior reincidência','verificar folgas, alinhamento e desgaste','registrar causa e solução no SGMan'];
    let frequency='Semanal';
    if(row.failureCount>=5||(row.mtbfMinutes&&row.mtbfMinutes<480)) frequency='Diária';
    else if(row.failureCount>=3||row.recurrent) frequency='A cada 3 dias';
    return {machine:row.machine,frequency,actions:actions.slice(0,3),failureCount:row.failureCount,mttrMinutes:row.mttrMinutes,mtbfMinutes:row.mtbfMinutes,score:row.failureCount*10+(row.recurrent?15:0)+(row.mttrMinutes||0)/20};
  }).sort((a,b)=>b.score-a.score).slice(0,10);
  state.preventivePlan=plan; return plan;
}

function buildImprovementPlan(metrics = state.reliability3Days || {}) {
  const plan=(metrics.dailyPlan||[]).slice(0,3).map((row,index)=>({
    priority:index+1,machine:row.machine,
    objective:`Reduzir reincidência e elevar a disponibilidade da ${row.machine}.`,
    targetMttr:row.mttrMinutes?row.mttrMinutes*0.75:null,
    targetMtbf:row.mtbfMinutes?row.mtbfMinutes*1.30:null,
    actions:['eliminar a causa mais recorrente da árvore da máquina','padronizar inspeção, regulagem e teste de liberação','confirmar causa e solução em todas as conclusões do SGMan']
  })); state.improvementPlan=plan; return plan;
}

function renderPeopleAndPreventivePanels(metrics = state.reliability3Days || {}) {
  const team=calculateTeamPerformance(); const preventive=buildPreventivePlan(metrics); const improvements=buildImprovementPlan(metrics);
  const teamTarget=$('teamPerformanceList'), trainingTarget=$('trainingRecommendations'), preventiveTarget=$('preventivePlanList'), improvementTarget=$('improvementPlanList');
  if(teamTarget) teamTarget.innerHTML=team.length?team.slice(0,12).map((row,i)=>`<div class="people-performance-row"><span class="priority-number">${i+1}</span><div><strong>${escapeHtml(row.label||row.executante)}</strong><p>${row.completed} OS • MTTR ${escapeHtml(formatReliabilityTime(row.mttrMinutes,'-'))}${row.bestCategory?` • referência em ${escapeHtml(row.bestCategory)}`:''}</p></div><span class="${row.needsTraining?'training-badge':'specialist-badge'}">${row.needsTraining?'Treinamento':'Referência'}</span></div>`).join(''):'<p class="muted">Sem dados suficientes por executante.</p>';
  if(trainingTarget){ const t=team.filter(r=>r.needsTraining); trainingTarget.innerHTML=t.length?t.slice(0,8).map(row=>{const mentor=findMentorForCategory(row.trainingCategory,team);return `<div class="training-row"><strong>${escapeHtml(row.label||row.executante)}</strong><span>Treinar: ${escapeHtml(row.trainingCategory||'diagnóstico')}</span><small>Mentor sugerido: ${escapeHtml(mentor?.label||'líder da equipe')}</small></div>`}).join(''):'<p class="muted">Nenhum treinamento prioritário identificado.</p>'; }
  if(preventiveTarget) preventiveTarget.innerHTML=preventive.length?preventive.map(item=>`<div class="preventive-row"><div><strong>${escapeHtml(item.machine)}</strong><span>${escapeHtml(item.frequency)}</span></div><ul>${item.actions.map(a=>`<li>${escapeHtml(a)}</li>`).join('')}</ul><small>${item.failureCount} falha(s) • MTTR ${escapeHtml(formatReliabilityTime(item.mttrMinutes,'-'))} • MTBF ${escapeHtml(formatReliabilityTime(item.mtbfMinutes,'-'))}</small></div>`).join(''):'<p class="muted">Sem dados suficientes para preventivas.</p>';
  if(improvementTarget) improvementTarget.innerHTML=improvements.length?improvements.map(p=>`<div class="improvement-row"><span class="priority-number">${p.priority}</span><div><strong>${escapeHtml(p.machine)}</strong><p>${escapeHtml(p.objective)}</p><ul>${p.actions.map(a=>`<li>${escapeHtml(a)}</li>`).join('')}</ul><small>Meta MTTR: ${escapeHtml(formatReliabilityTime(p.targetMttr,'-'))} • Meta MTBF: ${escapeHtml(formatReliabilityTime(p.targetMtbf,'-'))}</small></div></div>`).join(''):'<p class="muted">Sem dados suficientes para plano de melhoria.</p>';
}

function renderManagerDashboard(metrics = {}) {
  const target = $('managerDashboard');
  if (!target) return;
  const trend = metrics.efficiencyTrend || {};
  const summary = state.sgmanHistory?.summary || {};
  target.innerHTML = `
    <div class="manager-kpi"><span>Eficiência</span><strong>${trend.current == null ? '-' : escapeHtml(formatOee(trend.current))}</strong><small>${escapeHtml(trend.arrow || '➜')} tendência</small></div>
    <div class="manager-kpi"><span>OS concluídas no turno</span><strong>${Number(metrics.completedCurrentShift || 0)}</strong><small>${escapeHtml(metrics.currentShiftLabel || '')}</small></div>
    <div class="manager-kpi"><span>OS em atraso</span><strong>${Number(summary.overdue || 0)}</strong><small>Exigem acompanhamento</small></div>
    <div class="manager-kpi"><span>Reincidências</span><strong>${Number(metrics.recurrentMachines || 0)}</strong><small>Máquinas com 2+ falhas</small></div>`;

  const guidance = $('managerGuidance');
  if (guidance) guidance.textContent = managerGuidance(metrics);

  const plan = $('managerPlan');
  if (plan) {
    const roster = detectWorkingCrew(new Date()).roster || [];
    plan.innerHTML = (metrics.dailyPlan || []).slice(0,3).map((row,index)=>`
      <div class="manager-plan-item">
        <span class="priority-number">${index+1}</span>
        <div><strong>${escapeHtml(row.machine)}</strong><p>${row.failureCount} falha(s) • MTTR ${escapeHtml(formatReliabilityTime(row.mttrMinutes,'-'))} • MTBF ${escapeHtml(formatReliabilityTime(row.mtbfMinutes,'-'))}</p></div>
        <span>${escapeHtml(roster[index % Math.max(roster.length,1)] ? sgmanUserLabel(roster[index % roster.length]) : 'Definir responsável')}</span>
      </div>`).join('') || '<p class="muted">Sem dados suficientes para montar o plano.</p>';
  }
}


function populateVirtualMechanicMachines(selected='') {
  const select=$('virtualMechanicMachine');
  if(!select)return;

  const machines=configuredMachineCodes()
    .sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));

  select.innerHTML=
    '<option value="">Geral / selecione a máquina</option>'+
    machines.map(machine=>
      `<option value="${escapeHtml(machine)}">${escapeHtml(machine)}</option>`
    ).join('');

  if(selected && machines.includes(selected)){
    select.value=selected;
  }

  const componentList=$('mechanicComponentList');
  if(componentList && typeof industrialComponentOptions==='function'){
    componentList.innerHTML=industrialComponentOptions()
      .map(component=>`<option value="${escapeHtml(component)}"></option>`)
      .join('');
  }
}

function virtualInspectionSequence(analysis={}) {
  const sequence=[];

  (analysis.rankedTexts||[]).slice(0,3).forEach(item=>{
    const text=cleanHistoricalResolution(item.text);
    if(text)sequence.push(text);
  });

  (analysis.patterns||[]).forEach(pattern=>{
    if(
      sequence.length<5 &&
      !sequence.some(text=>
        normalizeKey(text).includes(normalizeKey(pattern.shortLabel))
      )
    ){
      sequence.push(pattern.label);
    }
  });

  if(!sequence.length){
    sequence.push(
      'Confirmar o sintoma e as condições em que ele ocorre.',
      'Aplicar bloqueio e eliminar energias residuais.',
      'Separar alimentação, comando, componente e carga.',
      'Medir antes de regular ou substituir.',
      'Testar, acompanhar e registrar a causa no SGMan.'
    );
  }

  return uniqueStrings(sequence).slice(0,6);
}

function mechanicModeLabel(mode='diagnosis'){
  return ({
    diagnosis:'Diagnóstico de falha',
    test:'Teste do componente',
    operation:'Princípio de funcionamento',
    preventive:'Plano preventivo',
    procedure:'Procedimento técnico'
  })[mode]||'Diagnóstico de falha';
}

function mechanicLocalGuidance(component='',problem='',mode='diagnosis'){
  const selected=component||problem||'Componente industrial';
  const guide=typeof industrialTechnicalGuide==='function'
    ? industrialTechnicalGuide(selected)
    : null;

  if(!guide)return null;

  const steps=(guide.steps||[])
    .map((text,index)=>`${index+1}. ${text}`)
    .join('\n');

  const faults=(guide.faults||[])
    .map((text,index)=>`${index+1}. ${text}`)
    .join('\n');

  return {
    title:`${mechanicModeLabel(mode)} — ${selected}`,
    summary:guide.principle||'Orientação técnica baseada no componente informado.',
    immediateActions:(guide.steps||[]).slice(0,5),
    tests:steps,
    probableCauses:faults,
    safety:'Aplicar bloqueio e etiquetagem, eliminar energias residuais e nunca anular proteções.',
    releaseCriteria:'Testar sem carga quando aplicável, testar em condição real, repetir o ciclo e acompanhar estabilidade.',
    sgmanRecord:'Registrar problema, causa confirmada, medições, serviço executado e resultado do teste.',
    confidence:'modelo técnico local'
  };
}

async function mechanicAiRequest(payload){
  const response=await fetch('/api/mechanic-ai',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });

  const data=await response.json().catch(()=>({}));

  if(!response.ok || data.ok===false){
    throw new Error(
      data.error||
      `Falha na análise (${response.status}).`
    );
  }

  return data;
}

function renderMechanicAiResult(result={},meta={}){
  const output=$('virtualMechanicResult');
  if(!output)return;

  const actions=Array.isArray(result.immediateActions)
    ? result.immediateActions
    : String(result.immediateActions||'')
        .split('\n')
        .map(item=>item.replace(/^\d+[.)]\s*/,'').trim())
        .filter(Boolean);

  output.innerHTML=`
    <article class="mechanic-ai-answer">
      <div class="mechanic-ai-heading">
        <div>
          <span class="eyebrow">${escapeHtml(mechanicModeLabel(meta.mode))}</span>
          <h3>${escapeHtml(result.title||'Orientação técnica')}</h3>
        </div>
        <span class="confidence confidence-${escapeHtml(
          String(result.confidence||'média').toLowerCase()
            .replace('alta','alta')
            .replace('media','media')
            .replace('média','media')
            .replace('baixa','baixa')
        )}">${escapeHtml(result.confidence||'Análise técnica')}</span>
      </div>

      <div class="mechanic-ai-summary">
        <strong>Entendimento da situação</strong>
        <p>${escapeHtml(result.summary||'')}</p>
      </div>

      <div class="mechanic-ai-grid">
        <section>
          <h4>Primeiras ações</h4>
          <ol>${actions.map(action=>`<li>${escapeHtml(action)}</li>`).join('')}</ol>
        </section>

        <section>
          <h4>Testes ponto a ponto</h4>
          <pre>${escapeHtml(result.tests||'')}</pre>
        </section>

        <section>
          <h4>Causas prováveis</h4>
          <pre>${escapeHtml(result.probableCauses||'')}</pre>
        </section>

        <section>
          <h4>Segurança</h4>
          <p>${escapeHtml(result.safety||'')}</p>
        </section>

        <section>
          <h4>Critério de liberação</h4>
          <p>${escapeHtml(result.releaseCriteria||'')}</p>
        </section>

        <section>
          <h4>Registro no SGMan</h4>
          <p>${escapeHtml(result.sgmanRecord||'')}</p>
        </section>
      </div>

      <div class="reference-box">
        <strong>Base utilizada</strong>
        <p>${escapeHtml(meta.referenceText||'Conhecimento técnico industrial.')}</p>
      </div>
    </article>
  `;
}

async function runVirtualMechanic() {
  const machine=$('virtualMechanicMachine')?.value||'';
  const component=$('virtualMechanicComponent')?.value.trim()||'';
  const problem=compactIssue($('virtualMechanicProblem')?.value||'');
  const mode=$('virtualMechanicMode')?.value||'diagnosis';
  const priority=$('virtualMechanicPriority')?.value||'normal';

  if(!problem && !component){
    showToast('Informe o componente ou descreva a situação.');
    return;
  }

  const button=$('virtualMechanicRunBtn');
  const status=$('virtualMechanicStatus');

  button.disabled=true;
  button.textContent='Consultando SGMan e IA...';
  status.textContent=machine
    ? `Consultando a árvore completa da ${machine}...`
    : 'Preparando orientação técnica geral...';

  try{
    let historyAnalysis=null;
    let references=[];

    if(machine){
      try{
        await fetchSgmanMachineHistory(machine,true);
        historyAnalysis=analyzeMachineHistoryForAction({
          machine,
          description:problem||component,
          department:'maintenance',
          action:'',
          baseAction:''
        });

        references=[
          ...(historyAnalysis.rankedTexts||[])
            .slice(0,8)
            .map(item=>cleanHistoricalResolution(item.text))
            .filter(Boolean),
          ...(historyAnalysis.patterns||[])
            .slice(0,8)
            .map(item=>item.label)
            .filter(Boolean)
        ];
      }catch(historyError){
        console.warn('Histórico do SGMan indisponível:',historyError);
      }
    }

    let result;
    let usedAi=false;

    try{
      const response=await mechanicAiRequest({
        machine,
        component,
        problem,
        mode,
        priority,
        organization:typeof organizationProfile==='function'
          ? organizationProfile()
          : {},
        sgmanReferences:references.slice(0,20),
        historySummary:historyAnalysis
          ? {
              similarOrders:historyAnalysis.similarOrders,
              totalMachineOrders:historyAnalysis.totalMachineOrders,
              confidence:historyAnalysis.confidence,
              summary:historyAnalysis.summary
            }
          : null
      });

      result=response.answer;
      usedAi=true;
    }catch(aiError){
      console.warn('IA indisponível, usando guia local:',aiError);
      result=mechanicLocalGuidance(component,problem,mode);

      if(historyAnalysis){
        const sequence=virtualInspectionSequence(historyAnalysis);
        result.immediateActions=uniqueStrings([
          ...sequence,
          ...(result.immediateActions||[])
        ]).slice(0,7);

        result.summary=
          `${historyAnalysis.summary} ${result.summary||''}`.trim();

        result.confidence=
          `SGMan ${historyAnalysis.confidence||'baixa'} + modelo local`;
      }
    }

    renderMechanicAiResult(result,{
      mode,
      referenceText:machine
        ? `${historyAnalysis?.similarOrders||0} OS semelhante(s) entre ${
            historyAnalysis?.totalMachineOrders||0
          } registros da árvore da ${machine}. ${
            usedAi?'Resposta enriquecida pela IA.':'Resposta local.'
          }`
        : usedAi
          ? 'Conhecimento industrial enriquecido pela IA.'
          : 'Modelo técnico local.'
    });

    status.textContent=usedAi
      ? 'Análise concluída pela IA.'
      : 'IA indisponível. Orientação criada pelo modelo técnico local.';
  }catch(error){
    $('virtualMechanicResult').innerHTML=
      `<p class="error-text">Falha: ${escapeHtml(error.message)}</p>`;

    status.textContent='Não foi possível concluir a análise.';
  }finally{
    button.disabled=false;
    button.textContent='Analisar com IA';
  }
}

function startVirtualMechanicSpeech(){
  const Recognition=
    window.SpeechRecognition||
    window.webkitSpeechRecognition;

  if(!Recognition){
    showToast('Reconhecimento de voz não disponível neste navegador.');
    return;
  }

  const button=$('virtualMechanicSpeechBtn');
  const recognition=new Recognition();

  recognition.lang='pt-BR';
  recognition.interimResults=false;
  recognition.maxAlternatives=1;

  button.disabled=true;
  button.textContent='🎙️ Ouvindo...';

  recognition.onresult=event=>{
    const text=event.results?.[0]?.[0]?.transcript||'';
    if(text){
      const field=$('virtualMechanicProblem');
      field.value=`${field.value.trim()} ${text}`.trim();

      const machine=machineKeyFromText(text);
      if(machine){
        populateVirtualMechanicMachines(machine);
        $('virtualMechanicMachine').value=machine;
      }
    }
  };

  recognition.onerror=event=>{
    showToast(`Não foi possível ouvir: ${event.error||'erro desconhecido'}`);
  };

  recognition.onend=()=>{
    button.disabled=false;
    button.textContent='🎙️ Falar';
  };

  recognition.start();
}

function clearVirtualMechanic(){
  $('virtualMechanicMachine').value='';
  $('virtualMechanicComponent').value='';
  $('virtualMechanicProblem').value='';
  $('virtualMechanicMode').value='diagnosis';
  $('virtualMechanicPriority').value='normal';
  $('virtualMechanicStatus').textContent='';
  $('virtualMechanicResult').innerHTML='';
}

function knowledgeCoverageKey(item={}){
  return normalizeKey([
    item.machine,
    item.problemType,
    item.component,
    item.category,
    item.title,
    item.description,
    ...(item.keywords||[])
  ].filter(Boolean).join(' '));
}

function buildKnowledgeGapAnalysis(){
  const trainingItems=typeof visualTrainingItems==='function'
    ? visualTrainingItems()
    : [];

  const trainingKeys=trainingItems.map(knowledgeCoverageKey);
  const orders=state.sgmanHistory?.items||state.sgmanHistory?.orders||[];

  const groups=new Map();

  orders.slice(0,3000).forEach(order=>{
    const machine=normalizeMachineCode(
      order.machine||order.tag||order.equipment||''
    );

    const problem=compactIssue(
      order.description||
      order.descricao||
      order.problem||
      order.problema||
      ''
    );

    if(!machine || !problem)return;

    const key=`${machine}|${normalizeKey(problem).slice(0,80)}`;

    if(!groups.has(key)){
      groups.set(key,{
        machine,
        problem,
        count:0,
        stoppedCount:0
      });
    }

    const row=groups.get(key);
    row.count+=1;

    if(
      order.machineStopped===true ||
      order.maquinaParada===true ||
      normalizeKey(order.stop||order.parada||'').includes('sim')
    ){
      row.stoppedCount+=1;
    }
  });

  return [...groups.values()]
    .map(row=>{
      const searchKey=normalizeKey(`${row.machine} ${row.problem}`);
      const covered=trainingKeys.some(key=>{
        const machineMatch=key.includes(normalizeKey(row.machine));
        const problemWords=normalizeKey(row.problem)
          .split(/\s+/)
          .filter(word=>word.length>3)
          .slice(0,5);

        const wordMatches=problemWords
          .filter(word=>key.includes(word))
          .length;

        return machineMatch && wordMatches>=Math.min(2,problemWords.length);
      });

      return {
        ...row,
        covered,
        score:
          row.count*10+
          row.stoppedCount*8+
          (covered?0:30)
      };
    })
    .sort((a,b)=>b.score-a.score);
}

function renderKnowledgeGapDashboard(){
  const target=$('knowledgeGapDashboard');
  if(!target)return;

  const gaps=buildKnowledgeGapAnalysis();
  const uncovered=gaps.filter(item=>!item.covered);
  const recurrent=gaps.filter(item=>item.count>=2);
  const coveredCount=gaps.filter(item=>item.covered).length;
  const coverage=gaps.length
    ? Math.round((coveredCount/gaps.length)*100)
    : 0;

  const top=uncovered.slice(0,8);

  target.innerHTML=`
    <div class="knowledge-gap-kpis">
      <div class="manager-kpi">
        <span>Cobertura técnica</span>
        <strong>${coverage}%</strong>
        <small>Falhas com conteúdo relacionado</small>
      </div>
      <div class="manager-kpi">
        <span>Sem procedimento</span>
        <strong>${uncovered.length}</strong>
        <small>Oportunidades de documentação</small>
      </div>
      <div class="manager-kpi">
        <span>Reincidências</span>
        <strong>${recurrent.length}</strong>
        <small>Ocorrências repetidas</small>
      </div>
      <div class="manager-kpi">
        <span>Conteúdos existentes</span>
        <strong>${typeof visualTrainingItems==='function'
          ? visualTrainingItems().length
          : 0}</strong>
        <small>Biblioteca visual</small>
      </div>
    </div>

    <div class="knowledge-gap-list">
      ${top.length
        ? top.map((item,index)=>`
          <article class="knowledge-gap-item">
            <span class="priority-number">${index+1}</span>
            <div>
              <strong>${escapeHtml(item.machine)} — ${escapeHtml(item.problem)}</strong>
              <p>${item.count} ocorrência(s)${
                item.stoppedCount
                  ? ` • ${item.stoppedCount} com máquina parada`
                  : ''
              }</p>
            </div>
            <button class="secondary knowledge-create-training"
              data-machine="${escapeHtml(item.machine)}"
              data-problem="${escapeHtml(item.problem)}"
              type="button">
              Criar treinamento
            </button>
          </article>
        `).join('')
        : '<p class="muted">Nenhuma lacuna crítica identificada com os dados disponíveis.</p>'
      }
    </div>
  `;

  $$('.knowledge-create-training').forEach(button=>{
    button.addEventListener('click',()=>{
      switchView('treinamentos');

      setTimeout(()=>{
        if($('visualTrainingMachine')){
          $('visualTrainingMachine').value=button.dataset.machine||'';
        }

        if($('visualTrainingTitle')){
          $('visualTrainingTitle').value=
            `${button.dataset.problem||'Treinamento'} — ${button.dataset.machine||''}`;
        }

        if($('visualTrainingComponent')){
          $('visualTrainingComponent').value=
            button.dataset.problem||'';
        }

        if($('visualTrainingNotes')){
          $('visualTrainingNotes').value=
            `Criar treinamento para eliminar reincidência identificada no SGMan: ${button.dataset.problem||''}.`;
        }

        $('view-treinamentos')?.scrollIntoView({
          behavior:'smooth',
          block:'start'
        });
      },250);
    });
  });
}



function powerBiOeeState(){
  state.powerBiOee ||= {loaded:false,source:'',range:{start:'',end:''},rows:[]};
  return state.powerBiOee;
}

async function loadEmbeddedPowerBiOee(force=false){
  const store=powerBiOeeState();
  if(store.loaded&&!force)return store;

  const status=$('powerBiOeeStatus');
  if(status)status.textContent='Carregando histórico OEE do Power BI...';

  try{
    const response=await fetch('/oee-powerbi-2026.json?v=98.5.0',{cache:force?'reload':'default'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);

    const data=await response.json();
    store.loaded=true;
    store.source=data.source||'Power BI OEE';
    store.range=data.range||{};
    store.rows=Array.isArray(data.rows)?data.rows:[];

    populatePowerBiOeeFilters();
    renderPowerBiSgmanDashboard();
    return store;
  }catch(error){
    if(status)status.textContent=`Falha ao carregar OEE: ${error.message}`;
    return store;
  }
}

function powerBiOeeRows(){ return powerBiOeeState().rows||[]; }

function populatePowerBiOeeFilters(){
  const rows=powerBiOeeRows();

  const machines=uniqueStrings(
    rows.map(row=>normalizeMachineCode(row.machine)).filter(Boolean)
  ).sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));

  const products=uniqueStrings(
    rows.map(row=>String(row.productCode||'').trim()).filter(Boolean)
  ).sort((a,b)=>a.localeCompare(b,'pt-BR'));

  const machineEl=$('powerBiOeeMachine');
  if(machineEl){
    const current=machineEl.value;
    machineEl.innerHTML='<option value="">Todas as máquinas</option>'+
      machines.map(machine=>`<option value="${escapeHtml(machine)}">${escapeHtml(machine)}</option>`).join('');
    if(machines.includes(current))machineEl.value=current;
  }

  const productEl=$('powerBiOeeProduct');
  if(productEl){
    const current=productEl.value;
    productEl.innerHTML='<option value="">Todos os produtos</option>'+
      products.map(product=>`<option value="${escapeHtml(product)}">${escapeHtml(product)}</option>`).join('');
    if(products.includes(current))productEl.value=current;
  }
}

function powerBiOeeFilters(){
  const store=powerBiOeeState();
  return {
    start:$('powerBiOeeStart')?.value||store.range.start||'',
    end:$('powerBiOeeEnd')?.value||store.range.end||'',
    machine:normalizeMachineCode($('powerBiOeeMachine')?.value||''),
    product:String($('powerBiOeeProduct')?.value||'').trim(),
    op:normalizeKey($('powerBiOeeOp')?.value||'')
  };
}

function filteredPowerBiOeeRows(){
  const f=powerBiOeeFilters();

  return powerBiOeeRows().filter(row=>{
    if(f.start&&row.date<f.start)return false;
    if(f.end&&row.date>f.end)return false;
    if(f.machine&&normalizeMachineCode(row.machine)!==f.machine)return false;
    if(f.product&&String(row.productCode||'')!==f.product)return false;
    if(f.op&&!normalizeKey(row.productionOrder||'').includes(f.op))return false;
    return true;
  });
}

function weightedPowerBiAverage(rows,valueKey,weightKey='plannedHours'){
  let total=0,weight=0;

  for(const row of rows){
    const value=Number(row[valueKey]);
    if(!Number.isFinite(value))continue;
    const rawWeight=Number(row[weightKey]);
    const w=Number.isFinite(rawWeight)&&rawWeight>0?rawWeight:1;
    total+=value*w;
    weight+=w;
  }

  return weight?total/weight:null;
}

function aggregatePowerBiMachines(rows=[]){
  const groups=new Map();

  rows.forEach(row=>{
    const machine=normalizeMachineCode(row.machine);
    if(!machine)return;
    if(!groups.has(machine))groups.set(machine,[]);
    groups.get(machine).push(row);
  });

  const sgmanOrders=sgmanManagementOrdersSource();

  return [...groups.entries()].map(([machine,items])=>{
    const dates=new Set(items.map(item=>item.date));

    const related=sgmanOrders.filter(order=>{
      if(sgmanManagementMachine(order)!==machine)return false;
      const d=sgmanManagementOrderDate(order);
      return d&&dates.has(sgmanManagementDateKey(d));
    });

    const durations=related
      .filter(order=>order.statusKey==='completed')
      .map(order=>typeof sgmanRepairDuration==='function'
        ? sgmanRepairDuration(order)
        : smartRepairMinutes(order))
      .filter(value=>value!==null&&Number.isFinite(value)&&value>=0&&value<4320);

    return {
      machine,
      oee:weightedPowerBiAverage(items,'oee'),
      produced:items.reduce((s,r)=>s+Number(r.producedQuantity||0),0),
      effectiveHours:items.reduce((s,r)=>s+Number(r.effectiveHours||0),0),
      maintenanceHours:items.reduce((s,r)=>s+Number(r.maintenanceHours||0),0),
      sgmanOrders:related.length,
      corrective:related.filter(smartCorrective).length,
      mttr:durations.length?averageNumbers(durations):null,
      cost:related.reduce((s,o)=>s+sgmanOrderCost(o).total,0),
      laborCost:laborCostState().unlocked?laborCostForMachineOrders(related):0
    };
  }).sort((a,b)=>(a.oee??999)-(b.oee??999));
}

function aggregatePowerBiProducts(rows=[]){
  const groups=new Map();

  rows.forEach(row=>{
    const product=String(row.productCode||'').trim();
    if(!product)return;
    if(!groups.has(product))groups.set(product,[]);
    groups.get(product).push(row);
  });

  return [...groups.entries()].map(([product,items])=>({
    product,
    oee:weightedPowerBiAverage(items,'oee'),
    produced:items.reduce((s,r)=>s+Number(r.producedQuantity||0),0),
    maintenanceHours:items.reduce((s,r)=>s+Number(r.maintenanceHours||0),0),
    machines:uniqueStrings(items.map(r=>normalizeMachineCode(r.machine)).filter(Boolean)).length
  })).sort((a,b)=>(a.oee??999)-(b.oee??999));
}

function dailyPowerBiRows(rows=[]){
  const groups=new Map();

  rows.forEach(row=>{
    if(!groups.has(row.date))groups.set(row.date,[]);
    groups.get(row.date).push(row);
  });

  return [...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([key,items])=>({
    key,
    oee:weightedPowerBiAverage(items,'oee'),
    maintenanceHours:items.reduce((s,r)=>s+Number(r.maintenanceHours||0),0)
  }));
}

function latestPowerBiMachineHistoryRows(){
  const groups=new Map();

  powerBiOeeRows().forEach(row=>{
    const machine=normalizeMachineCode(row.machine);
    if(!machine)return;
    if(!groups.has(machine))groups.set(machine,[]);
    groups.get(machine).push(row);
  });

  return [...groups.entries()].map(([machine,items])=>{
    const dates=uniqueStrings(items.map(item=>item.date)).sort();
    const latestDate=dates[dates.length-1];
    const previousDate=dates.length>1?dates[dates.length-2]:null;

    const latest=items.filter(item=>item.date===latestDate);
    const previous=previousDate?items.filter(item=>item.date===previousDate):[];

    const oee=weightedPowerBiAverage(latest,'oee');
    const previousOee=previous.length?weightedPowerBiAverage(previous,'oee'):null;

    return {
      machine,
      oee,
      previousOee,
      previous:previousOee,
      stoppedMinutes:latest.reduce((s,r)=>s+Number(r.maintenanceHours||0)*60,0),
      failures:0,
      raw:{source:'powerbi-history',date:latestDate}
    };
  });
}

function renderPowerBiSgmanDashboard(){
  const rows=filteredPowerBiOeeRows();
  const machines=aggregatePowerBiMachines(rows);
  const products=aggregatePowerBiProducts(rows);

  const avgOee=weightedPowerBiAverage(rows,'oee');
  const produced=rows.reduce((s,r)=>s+Number(r.producedQuantity||0),0);
  const effective=rows.reduce((s,r)=>s+Number(r.effectiveHours||0),0);
  const maintenance=rows.reduce((s,r)=>s+Number(r.maintenanceHours||0),0);
  const sgmanCount=machines.reduce((s,r)=>s+r.sgmanOrders,0);
  const sgmanCost=machines.reduce((s,r)=>s+r.cost,0);
  const laborCost=machines.reduce((s,r)=>s+Number(r.laborCost||0),0);

  const kpis=$('powerBiSgmanKpis');
  if(kpis){
    kpis.innerHTML=`
      <div class="manager-kpi"><span>OEE médio</span><strong>${avgOee===null?'—':`${avgOee.toFixed(1)}%`}</strong><small>Ponderado por horas planejadas</small></div>
      <div class="manager-kpi"><span>Produção</span><strong>${Math.round(produced).toLocaleString('pt-BR')}</strong><small>Peças</small></div>
      <div class="manager-kpi"><span>Horas efetivas</span><strong>${effective.toFixed(1)} h</strong><small>Power BI</small></div>
      <div class="manager-kpi"><span>Perda manutenção</span><strong>${maintenance.toFixed(1)} h</strong><small>Power BI</small></div>
      <div class="manager-kpi"><span>OS SGMan cruzadas</span><strong>${sgmanCount}</strong><small>Mesma máquina + data</small></div>
      <div class="manager-kpi cost-kpi"><span>Custo SGMan</span><strong>${escapeHtml(sgmanFormatMoney(sgmanCost))}</strong><small>Quando disponível</small></div>
      <div class="manager-kpi cost-kpi"><span>Mão de obra calculada</span><strong>${laborCostState().unlocked?escapeHtml(sgmanFormatMoney(laborCost)):'🔒'}</strong><small>${laborCostState().unlocked?'Tempo SGMan × custo/h':'Desbloqueie Gestão SGMan'}</small></div>
    `;
  }

  const machineTarget=$('powerBiMachineCrossRanking');
  if(machineTarget){
    machineTarget.innerHTML=machines.length
      ? machines.slice(0,10).map((row,index)=>`
        <article class="sgman-ranking-row">
          <span class="priority-number">${index+1}</span>
          <div>
            <strong>${escapeHtml(row.machine)} — ${row.oee===null?'—':`${row.oee.toFixed(1)}%`}</strong>
            <p>${row.sgmanOrders} OS • ${row.corrective} corretiva(s) • ${row.maintenanceHours.toFixed(1)} h manutenção</p>
            <small>MTTR ${escapeHtml(smartFmtMinutes(row.mttr))} • Custo SGMan ${escapeHtml(sgmanFormatMoney(row.cost))}${
              laborCostState().unlocked
                ? ` • Mão de obra ${escapeHtml(sgmanFormatMoney(row.laborCost))}`
                : ''
            }</small>
          </div>
        </article>
      `).join('')
      : '<p class="muted">Sem máquinas.</p>';
  }

  const productTarget=$('powerBiProductRanking');
  if(productTarget){
    productTarget.innerHTML=products.length
      ? products.slice(0,10).map((row,index)=>`
        <article class="sgman-ranking-row">
          <span class="priority-number">${index+1}</span>
          <div>
            <strong>${escapeHtml(row.product)} — ${row.oee===null?'—':`${row.oee.toFixed(1)}%`}</strong>
            <p>${row.machines} máquina(s) • ${Math.round(row.produced).toLocaleString('pt-BR')} peças</p>
            <small>${row.maintenanceHours.toFixed(1)} h de manutenção</small>
          </div>
        </article>
      `).join('')
      : '<p class="muted">Sem produtos.</p>';
  }

  const insights=$('powerBiSgmanInsights');
  if(insights){
    const items=[];
    if(machines[0]){
      items.push(`${machines[0].machine} tem o menor OEE do filtro (${(machines[0].oee??0).toFixed(1)}%) e ${machines[0].sgmanOrders} OS SGMan nas mesmas datas.`);
    }
    if(avgOee!==null)items.push(`OEE médio ponderado do recorte: ${avgOee.toFixed(1)}%.`);
    const highMaint=[...machines].sort((a,b)=>b.maintenanceHours-a.maintenanceHours)[0];
    if(highMaint&&highMaint.maintenanceHours>0){
      items.push(`${highMaint.machine} concentra mais horas classificadas como manutenção no Power BI: ${highMaint.maintenanceHours.toFixed(1)} h.`);
    }
    const expensive=[...machines].sort((a,b)=>b.cost-a.cost)[0];
    if(expensive&&expensive.cost>0){
      items.push(`${expensive.machine} tem o maior custo SGMan do recorte: ${sgmanFormatMoney(expensive.cost)}.`);
    }

    insights.innerHTML=(items.length?items:['Sem dados suficientes.'])
      .map(text=>`<div class="management-insight">${escapeHtml(text)}</div>`)
      .join('');
  }

  const tbody=$('powerBiCrossTableBody');
  if(tbody){
    tbody.innerHTML=machines.map(row=>`
      <tr>
        <td>${escapeHtml(row.machine)}</td>
        <td>${row.oee===null?'—':`${row.oee.toFixed(1)}%`}</td>
        <td>${Math.round(row.produced).toLocaleString('pt-BR')}</td>
        <td>${row.effectiveHours.toFixed(1)} h</td>
        <td>${row.maintenanceHours.toFixed(1)} h</td>
        <td>${row.sgmanOrders}</td>
        <td>${row.corrective}</td>
        <td>${escapeHtml(smartFmtMinutes(row.mttr))}</td>
        <td>${escapeHtml(sgmanFormatMoney(row.cost))}</td>
        <td>${laborCostState().unlocked?escapeHtml(sgmanFormatMoney(row.laborCost)):'🔒'}</td>
      </tr>
    `).join('');
  }

  const count=$('powerBiFilteredCount');
  if(count)count.textContent=`${rows.length} registros`;

  const status=$('powerBiOeeStatus');
  if(status&&powerBiOeeState().loaded){
    status.textContent=`Power BI: ${powerBiOeeState().range.start||'—'} até ${powerBiOeeState().range.end||'—'} • ${rows.length} registros no filtro • SGMan cruzado por máquina e data.`;
  }

  const daily=dailyPowerBiRows(rows);
  drawDynamicLineChart('powerBiOeeChart',daily,'oee',v=>`${v.toFixed(1)}%`);
  drawDynamicLineChart('powerBiMaintenanceChart',daily,'maintenanceHours',v=>`${v.toFixed(1)} h`);
}

function clearPowerBiOeeFilters(){
  const store=powerBiOeeState();
  if($('powerBiOeeStart'))$('powerBiOeeStart').value=store.range.start||'';
  if($('powerBiOeeEnd'))$('powerBiOeeEnd').value=store.range.end||'';
  if($('powerBiOeeMachine'))$('powerBiOeeMachine').value='';
  if($('powerBiOeeProduct'))$('powerBiOeeProduct').value='';
  if($('powerBiOeeOp'))$('powerBiOeeOp').value='';
  renderPowerBiSgmanDashboard();
}


function laborCostState(){
  state.laborCost ||= {
    unlocked:false,
    rates:[],
    hoursPerMonth:220,
    employerMultiplier:1
  };
  return state.laborCost;
}

function laborNormalize(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'');
}

function findLaborRate(mechanic){
  const key=laborNormalize(mechanic);
  if(!key)return null;

  const rates=laborCostState().rates||[];

  let match=rates.find(rate=>
    laborNormalize(rate.name)===key ||
    (rate.aliases||[]).some(alias=>laborNormalize(alias)===key)
  );

  if(match)return match;

  // SGMan commonly uses first name only.
  match=rates.find(rate=>{
    const aliases=(rate.aliases||[]).map(laborNormalize);
    return aliases.some(alias=>
      alias && (
        key.startsWith(alias) ||
        alias.startsWith(key)
      )
    );
  });

  return match||null;
}

function laborOrderMinutes(order){
  const duration=typeof sgmanRepairDuration==='function'
    ? sgmanRepairDuration(order)
    : smartRepairMinutes(order);

  return duration!==null && Number.isFinite(duration) && duration>=0 && duration<4320
    ? duration
    : 0;
}

function laborCostForOrder(order){
  const mechanic=sgmanManagementMechanic(order);
  const rate=findLaborRate(mechanic);
  const minutes=laborOrderMinutes(order);

  if(!rate || minutes<=0){
    return {
      mechanic,
      rate:null,
      minutes,
      hours:minutes/60,
      cost:0,
      matched:false
    };
  }

  const hours=minutes/60;

  return {
    mechanic,
    rate,
    minutes,
    hours,
    cost:hours*Number(rate.hourlyCost||0),
    matched:true
  };
}

async function unlockLaborCosts(){
  const pin=$('laborManagementPin')?.value||'';
  const hoursPerMonth=Number($('laborHoursPerMonth')?.value||220);
  const employerMultiplier=Number($('laborEmployerMultiplier')?.value||1);
  const button=$('unlockLaborCostBtn');

  if(!pin){
    showToast('Informe o PIN de gestão.');
    return;
  }

  if(button){
    button.disabled=true;
    button.textContent='Validando...';
  }

  try{
    const response=await fetch('/api/management-cost',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        pin,
        hoursPerMonth,
        employerMultiplier
      })
    });

    const data=await response.json().catch(()=>({}));

    if(!response.ok || data.ok===false){
      throw new Error(data.error||`HTTP ${response.status}`);
    }

    const store=laborCostState();
    store.unlocked=true;
    store.rates=Array.isArray(data.rates)?data.rates:[];
    store.hoursPerMonth=Number(data.hoursPerMonth||hoursPerMonth);
    store.employerMultiplier=Number(data.employerMultiplier||employerMultiplier);

    if($('laborManagementPin'))$('laborManagementPin').value='';
    if($('laborCostDashboard'))$('laborCostDashboard').classList.remove('hidden');
    if($('laborCostSecurityBadge')){
      $('laborCostSecurityBadge').textContent='🔓 Gestão desbloqueada';
      $('laborCostSecurityBadge').classList.add('is-unlocked');
    }

    renderDynamicSgmanManagement();
    renderPowerBiSgmanDashboard();
    renderLaborCostManagement();

    showToast('Custos de mão de obra desbloqueados.');
  }catch(error){
    showToast(error.message);
  }finally{
    if(button){
      button.disabled=false;
      button.textContent='Desbloquear custos';
    }
  }
}

function laborFilteredOrders(){
  return filteredDynamicSgmanOrders();
}

function laborAggregates(orders=[]){
  const mechanicMachine=new Map();
  const mechanics=new Map();
  const machines=new Map();
  let totalCost=0;
  let totalHours=0;
  let matchedOrders=0;

  for(const order of orders){
    const calc=laborCostForOrder(order);
    const mechanic=sgmanUserLabel(calc.mechanic)||calc.mechanic||'Sem executante';
    const machine=sgmanManagementMachine(order)||'Sem máquina';

    if(calc.matched)matchedOrders++;
    totalCost+=calc.cost;
    totalHours+=calc.hours;

    const pairKey=`${mechanic}||${machine}`;
    if(!mechanicMachine.has(pairKey)){
      mechanicMachine.set(pairKey,{
        mechanic,
        machine,
        orders:0,
        hours:0,
        cost:0,
        hourlyCost:calc.rate?.hourlyCost||0,
        matched:calc.matched
      });
    }
    const pair=mechanicMachine.get(pairKey);
    pair.orders++;
    pair.hours+=calc.hours;
    pair.cost+=calc.cost;
    if(calc.rate?.hourlyCost)pair.hourlyCost=calc.rate.hourlyCost;
    pair.matched=pair.matched||calc.matched;

    if(!mechanics.has(mechanic)){
      mechanics.set(mechanic,{
        mechanic,
        orders:0,
        hours:0,
        cost:0,
        hourlyCost:calc.rate?.hourlyCost||0,
        matched:calc.matched
      });
    }
    const mech=mechanics.get(mechanic);
    mech.orders++;
    mech.hours+=calc.hours;
    mech.cost+=calc.cost;
    if(calc.rate?.hourlyCost)mech.hourlyCost=calc.rate.hourlyCost;
    mech.matched=mech.matched||calc.matched;

    if(!machines.has(machine)){
      machines.set(machine,{
        machine,
        orders:0,
        hours:0,
        cost:0
      });
    }
    const mk=machines.get(machine);
    mk.orders++;
    mk.hours+=calc.hours;
    mk.cost+=calc.cost;
  }

  return {
    totalCost,
    totalHours,
    matchedOrders,
    totalOrders:orders.length,
    mechanicMachine:[...mechanicMachine.values()]
      .sort((a,b)=>b.cost-a.cost),
    mechanics:[...mechanics.values()]
      .sort((a,b)=>b.cost-a.cost),
    machines:[...machines.values()]
      .sort((a,b)=>b.cost-a.cost)
  };
}

function renderLaborCostManagement(){
  const store=laborCostState();
  const dashboard=$('laborCostDashboard');

  if(!store.unlocked){
    if(dashboard)dashboard.classList.add('hidden');
    return;
  }

  if(dashboard)dashboard.classList.remove('hidden');

  const orders=laborFilteredOrders();
  const agg=laborAggregates(orders);

  const kpis=$('laborCostKpis');
  if(kpis){
    kpis.innerHTML=`
      <div class="manager-kpi cost-kpi">
        <span>Custo mão de obra</span>
        <strong>${escapeHtml(sgmanFormatMoney(agg.totalCost))}</strong>
        <small>OS filtradas</small>
      </div>
      <div class="manager-kpi">
        <span>Horas da equipe</span>
        <strong>${agg.totalHours.toFixed(1)} h</strong>
        <small>Tempo das OS</small>
      </div>
      <div class="manager-kpi">
        <span>OS com custo calculado</span>
        <strong>${agg.matchedOrders}/${agg.totalOrders}</strong>
        <small>Executante identificado</small>
      </div>
      <div class="manager-kpi">
        <span>Fator custo empresa</span>
        <strong>${store.employerMultiplier.toFixed(2)}×</strong>
        <small>${store.hoursPerMonth} h/mês</small>
      </div>
    `;
  }

  const machineTarget=$('laborMachineRanking');
  if(machineTarget){
    machineTarget.innerHTML=agg.machines.length
      ? agg.machines.slice(0,12).map((row,index)=>`
        <article class="sgman-ranking-row">
          <span class="priority-number">${index+1}</span>
          <div>
            <strong>${escapeHtml(row.machine)}</strong>
            <p>${row.orders} OS • ${row.hours.toFixed(1)} h</p>
            <small>Custo de mão de obra: ${escapeHtml(sgmanFormatMoney(row.cost))}</small>
          </div>
        </article>
      `).join('')
      : '<p class="muted">Sem dados no filtro.</p>';
  }

  const mechanicTarget=$('laborMechanicRanking');
  if(mechanicTarget){
    mechanicTarget.innerHTML=agg.mechanics.length
      ? agg.mechanics.slice(0,20).map((row,index)=>`
        <article class="sgman-ranking-row">
          <span class="priority-number">${index+1}</span>
          <div>
            <strong>${escapeHtml(row.mechanic)}</strong>
            <p>${row.orders} OS • ${row.hours.toFixed(1)} h</p>
            <small>${
              row.matched
                ? `Custo/h ${escapeHtml(sgmanFormatMoney(row.hourlyCost))} • Período ${escapeHtml(sgmanFormatMoney(row.cost))}`
                : 'Salário não localizado na base'
            }</small>
          </div>
        </article>
      `).join('')
      : '<p class="muted">Sem mecânicos no filtro.</p>';
  }

  const tbody=$('laborMechanicMachineBody');
  if(tbody){
    tbody.innerHTML=agg.mechanicMachine.map(row=>`
      <tr>
        <td>${escapeHtml(row.mechanic)}</td>
        <td>${escapeHtml(row.machine)}</td>
        <td>${row.orders}</td>
        <td>${row.hours.toFixed(2)} h</td>
        <td>${row.matched?escapeHtml(sgmanFormatMoney(row.hourlyCost)):'—'}</td>
        <td>${row.matched?escapeHtml(sgmanFormatMoney(row.cost)):'—'}</td>
      </tr>
    `).join('');
  }
}

function laborCostForMachineOrders(orders=[]){
  return orders.reduce((sum,order)=>sum+laborCostForOrder(order).cost,0);
}

function sgmanManagementState(){
  state.sgmanManagement ||= { loadedAt:'', queryStart:'', queryEnd:'', orders:[] };
  return state.sgmanManagement;
}
function sgmanMoneyNumber(value){
  if(value===null||value===undefined||value==='')return 0;
  if(typeof value==='number')return Number.isFinite(value)?value:0;
  let text=String(value).trim().replace(/[R$\s]/g,'').replace(/[^\d,.-]/g,'');
  if(!text)return 0;
  if(text.includes(',')&&text.includes('.')){
    if(text.lastIndexOf(',')>text.lastIndexOf('.')) text=text.replace(/\./g,'').replace(',','.');
    else text=text.replace(/,/g,'');
  }else if(text.includes(',')) text=text.replace(/\./g,'').replace(',','.');
  const n=Number(text); return Number.isFinite(n)?n:0;
}
function sgmanFormatMoney(value){ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0)); }
function sgmanOrderCost(order={}){
  const material=sgmanMoneyNumber(order.materialCost), labor=sgmanMoneyNumber(order.laborCost), thirdParty=sgmanMoneyNumber(order.thirdPartyCost), explicit=sgmanMoneyNumber(order.totalCost);
  return {material,labor,thirdParty,total:explicit>0?explicit:material+labor+thirdParty};
}
function sgmanManagementOrderDate(order={}){
  const values=[order.endDate,order.endDateISO,order.startDate,order.data,order.date].filter(Boolean);
  for(const value of values){
    const text=String(value).trim(); let date=null;
    const br=text.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
    if(br) date=new Date(Number(br[3]),Number(br[2])-1,Number(br[1]),Number(br[4]||0),Number(br[5]||0));
    else date=new Date(text);
    if(date&&!Number.isNaN(date.getTime()))return date;
  }
  return null;
}
function sgmanManagementDateKey(date){ if(!date)return ''; return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); }
function sgmanManagementMechanic(order={}){ return String(order.executante||order.executor||order.responsavel||'').trim(); }
function sgmanManagementMachine(order={}){ return normalizeMachineCode(order.machine||machineKeyFromText([order.tag,order.local,order.description].filter(Boolean).join(' '))||''); }
function sgmanManagementMaintenanceType(order={}){ return String(order.typeMaintenance||order.tipoManutencao||order.typeService||order.tipoServico||'').trim(); }
function sgmanManagementOrdersSource(){ const m=sgmanManagementState(); return m.orders?.length?m.orders:(state.sgmanHistory?.orders||[]); }
function sgmanMonthRange(monthValue){ if(!monthValue)return null; const [year,month]=monthValue.split('-').map(Number); if(!year||!month)return null; return {start:new Date(year,month-1,1,0,0,0,0),end:new Date(year,month,0,23,59,59,999)}; }
function sgmanDateInputValue(date){ return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); }
function initializeDynamicSgmanDates(){
  const month=$('sgmanManagementMonth'),start=$('sgmanManagementStart'),end=$('sgmanManagementEnd'); if(!month||!start||!end)return;
  if(!month.value){ const now=new Date(); month.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`; }
  const range=sgmanMonthRange(month.value); if(range){ if(!start.value)start.value=sgmanDateInputValue(range.start); if(!end.value)end.value=sgmanDateInputValue(range.end); }
}
function populateDynamicSgmanFilters(){
  const orders=sgmanManagementOrdersSource();
  const machines=uniqueStrings(orders.map(sgmanManagementMachine).filter(Boolean)).sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  const mechanics=uniqueStrings(orders.map(sgmanManagementMechanic).filter(Boolean)).sort((a,b)=>sgmanUserLabel(a).localeCompare(sgmanUserLabel(b),'pt-BR'));
  const types=uniqueStrings(orders.map(sgmanManagementMaintenanceType).filter(Boolean)).sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const fill=(id,items,labelFn,emptyLabel)=>{ const el=$(id); if(!el)return; const current=el.value; el.innerHTML=`<option value="">${emptyLabel}</option>`+items.map(item=>`<option value="${escapeHtml(item)}">${escapeHtml(labelFn(item))}</option>`).join(''); if(items.includes(current))el.value=current; };
  fill('sgmanManagementMachine',machines,x=>x,'Todas as máquinas'); fill('sgmanManagementMechanic',mechanics,x=>sgmanUserLabel(x),'Todos os mecânicos'); fill('sgmanManagementType',types,x=>x,'Todos os tipos');
}
function dynamicSgmanFilters(){ const day=$('sgmanManagementDay')?.value||'',start=$('sgmanManagementStart')?.value||'',end=$('sgmanManagementEnd')?.value||''; return {day,start:day||start,end:day||end,machine:$('sgmanManagementMachine')?.value||'',mechanic:$('sgmanManagementMechanic')?.value||'',maintenanceType:$('sgmanManagementType')?.value||'',status:$('sgmanManagementStatus')?.value||''}; }
function filteredDynamicSgmanOrders(){
  const f=dynamicSgmanFilters(); return sgmanManagementOrdersSource().filter(order=>{ const date=sgmanManagementOrderDate(order),key=sgmanManagementDateKey(date); if(f.start&&(!key||key<f.start))return false; if(f.end&&(!key||key>f.end))return false; if(f.machine&&sgmanManagementMachine(order)!==f.machine)return false; if(f.mechanic&&normalizeKey(sgmanManagementMechanic(order))!==normalizeKey(f.mechanic))return false; if(f.maintenanceType&&normalizeKey(sgmanManagementMaintenanceType(order))!==normalizeKey(f.maintenanceType))return false; if(f.status&&order.statusKey!==f.status)return false; return true; });
}
function dynamicMttr(orders=[]){ const durations=orders.filter(o=>o.statusKey==='completed').map(o=>typeof sgmanRepairDuration==='function'?sgmanRepairDuration(o):smartRepairMinutes(o)).filter(v=>v!==null&&Number.isFinite(v)&&v>=0&&v<4320); return durations.length?averageNumbers(durations):null; }
function dynamicMtbf(orders=[]){
  const grouped=new Map(); orders.filter(o=>smartCorrective(o)&&smartStopped(o)).forEach(o=>{ const m=sgmanManagementMachine(o),d=sgmanManagementOrderDate(o); if(!m||!d)return; if(!grouped.has(m))grouped.set(m,[]); grouped.get(m).push(d); }); const intervals=[];
  for(const dates of grouped.values()){ dates.sort((a,b)=>a-b); for(let i=1;i<dates.length;i++){ const h=(dates[i]-dates[i-1])/3600000; if(h>0&&h<2160)intervals.push(h); }} return intervals.length?averageNumbers(intervals):null;
}
function dynamicSgmanSummary(orders=[]){
  const corrective=orders.filter(smartCorrective); const counts={}; corrective.forEach(o=>{const m=sgmanManagementMachine(o);if(m)counts[m]=(counts[m]||0)+1});
  return {total:orders.length,completed:orders.filter(o=>o.statusKey==='completed').length,open:orders.filter(o=>o.statusKey==='open').length,overdue:orders.filter(o=>o.statusKey==='overdue').length,corrective:corrective.length,stopped:orders.filter(smartStopped).length,recurrence:Object.values(counts).filter(c=>c>=2).length,mttr:dynamicMttr(orders),mtbf:dynamicMtbf(orders),totalCost:orders.reduce((s,o)=>s+sgmanOrderCost(o).total,0),materialCost:orders.reduce((s,o)=>s+sgmanOrderCost(o).material,0),laborCost:orders.reduce((s,o)=>s+sgmanOrderCost(o).labor,0)};
}
function dynamicDailyRows(orders=[]){ const map=new Map(); for(const o of orders){ const d=sgmanManagementOrderDate(o),key=sgmanManagementDateKey(d); if(!key)continue; if(!map.has(key))map.set(key,{key,durations:[],cost:0}); const row=map.get(key),duration=typeof sgmanRepairDuration==='function'?sgmanRepairDuration(o):smartRepairMinutes(o); if(duration!==null&&Number.isFinite(duration)&&duration>=0&&duration<4320)row.durations.push(duration); row.cost+=sgmanOrderCost(o).total; } return [...map.values()].sort((a,b)=>a.key.localeCompare(b.key)).map(r=>({...r,mttr:r.durations.length?averageNumbers(r.durations):null})); }
function drawDynamicLineChart(canvasId,rows,valueKey,formatter){
  const canvas=$(canvasId); if(!canvas)return; const ctx=canvas.getContext('2d'),width=Math.max(680,canvas.parentElement?.clientWidth||680),height=220,ratio=window.devicePixelRatio||1; canvas.width=width*ratio; canvas.height=height*ratio; canvas.style.width=`${width}px`; canvas.style.height=`${height}px`; ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,width,height);
  const valid=rows.filter(r=>r[valueKey]!==null&&Number.isFinite(r[valueKey])); if(!valid.length){ctx.fillStyle='#667085';ctx.font='14px sans-serif';ctx.fillText('Sem dados suficientes para este gráfico.',18,40);return;}
  const p={left:48,right:18,top:22,bottom:48},cw=width-p.left-p.right,ch=height-p.top-p.bottom,max=Math.max(1,...valid.map(r=>r[valueKey])); ctx.strokeStyle='#e1e5ea'; for(let i=0;i<=4;i++){const y=p.top+(ch/4)*i;ctx.beginPath();ctx.moveTo(p.left,y);ctx.lineTo(width-p.right,y);ctx.stroke();}
  const x=i=>valid.length===1?p.left+cw/2:p.left+(cw/(valid.length-1))*i,y=v=>p.top+ch-(v/max)*ch; ctx.strokeStyle='#f28c00';ctx.fillStyle='#f28c00';ctx.lineWidth=3;ctx.beginPath();valid.forEach((r,i)=>{const px=x(i),py=y(r[valueKey]);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)});ctx.stroke();valid.forEach((r,i)=>{ctx.beginPath();ctx.arc(x(i),y(r[valueKey]),4,0,Math.PI*2);ctx.fill()}); ctx.fillStyle='#667085';ctx.font='11px sans-serif';valid.forEach((r,i)=>{if(valid.length>12&&i%Math.ceil(valid.length/10)!==0&&i!==valid.length-1)return;ctx.save();ctx.translate(x(i),height-18);ctx.rotate(-.45);ctx.fillText(r.key.slice(5),0,0);ctx.restore()});ctx.fillStyle='#222831';ctx.font='12px sans-serif';ctx.fillText(formatter(max),6,p.top+5);
}
function dynamicMachineRanking(orders=[]){ const map=new Map(); for(const o of orders){const m=sgmanManagementMachine(o);if(!m)continue;if(!map.has(m))map.set(m,{machine:m,orders:0,corrective:0,stopped:0,durations:[],cost:0});const r=map.get(m);r.orders++;if(smartCorrective(o))r.corrective++;if(smartStopped(o))r.stopped++;const d=typeof sgmanRepairDuration==='function'?sgmanRepairDuration(o):smartRepairMinutes(o);if(d!==null&&Number.isFinite(d)&&d>=0&&d<4320)r.durations.push(d);r.cost+=sgmanOrderCost(o).total;} return [...map.values()].map(r=>({...r,mttr:r.durations.length?averageNumbers(r.durations):null,score:r.stopped*15+r.corrective*8+r.orders+r.cost/1000})).sort((a,b)=>b.score-a.score); }
function dynamicMechanicRanking(orders=[]){ const map=new Map(); for(const o of orders){const m=sgmanManagementMechanic(o);if(!m)continue;if(!map.has(m))map.set(m,{mechanic:m,completed:0,total:0,durations:[],cost:0});const r=map.get(m);r.total++;if(o.statusKey==='completed')r.completed++;const d=typeof sgmanRepairDuration==='function'?sgmanRepairDuration(o):smartRepairMinutes(o);if(o.statusKey==='completed'&&d!==null&&Number.isFinite(d)&&d>=0&&d<4320)r.durations.push(d);r.cost+=sgmanOrderCost(o).total;} return [...map.values()].map(r=>({...r,label:sgmanUserLabel(r.mechanic),mttr:r.durations.length?averageNumbers(r.durations):null})).sort((a,b)=>(a.mttr??Infinity)-(b.mttr??Infinity)||b.completed-a.completed); }
function dynamicManagementInsights(orders=[],summary={}){ if(!orders.length)return ['Sem ordens para os filtros selecionados.']; const machines=dynamicMachineRanking(orders),mechanics=dynamicMechanicRanking(orders),ins=[]; if(machines[0])ins.push(`${machines[0].machine} concentra o maior impacto no período: ${machines[0].orders} OS, ${machines[0].stopped} com parada e custo ${sgmanFormatMoney(machines[0].cost)}.`); const quickest=mechanics.find(r=>r.completed>=2&&r.mttr!==null); if(quickest)ins.push(`${quickest.label} apresenta MTTR médio de ${smartFmtMinutes(quickest.mttr)} em ${quickest.completed} OS concluídas no filtro atual.`); if(summary.overdue>0)ins.push(`Existem ${summary.overdue} OS em atraso no recorte selecionado; priorize responsável e prazo.`); ins.push(summary.totalCost>0?`Custo acumulado das ordens filtradas: ${sgmanFormatMoney(summary.totalCost)}.`:'O SGMan não retornou valores de custo para estas ordens; os demais indicadores continuam válidos.'); return ins; }
function renderDynamicSgmanManagement(){
  initializeDynamicSgmanDates(); populateDynamicSgmanFilters(); const orders=filteredDynamicSgmanOrders(),summary=dynamicSgmanSummary(orders),kpis=$('sgmanManagementKpis'),machineTarget=$('sgmanMachineRanking'),mechanicTarget=$('sgmanMechanicRanking'),insights=$('sgmanManagementInsights'),tbody=$('sgmanManagementOrdersBody'),count=$('sgmanFilteredCount'),status=$('sgmanManagementStatusText');
  if(kpis)kpis.innerHTML=`<div class="manager-kpi"><span>OS no filtro</span><strong>${summary.total}</strong><small>${summary.completed} concluídas</small></div><div class="manager-kpi"><span>MTTR</span><strong>${escapeHtml(smartFmtMinutes(summary.mttr))}</strong><small>Tempo médio de reparo</small></div><div class="manager-kpi"><span>MTBF</span><strong>${escapeHtml(smartFmtHours(summary.mtbf))}</strong><small>Entre falhas com parada</small></div><div class="manager-kpi"><span>Em atraso</span><strong>${summary.overdue}</strong><small>${summary.open} abertas</small></div><div class="manager-kpi"><span>Reincidências</span><strong>${summary.recurrence}</strong><small>Máquinas com 2+ corretivas</small></div><div class="manager-kpi cost-kpi"><span>Custo total</span><strong>${escapeHtml(sgmanFormatMoney(summary.totalCost))}</strong><small>Ordens filtradas</small></div><div class="manager-kpi"><span>Materiais / peças</span><strong>${escapeHtml(sgmanFormatMoney(summary.materialCost))}</strong><small>Quando informado</small></div><div class="manager-kpi"><span>Mão de obra</span><strong>${escapeHtml(sgmanFormatMoney(summary.laborCost))}</strong><small>Quando informado</small></div>`;
  const mr=dynamicMachineRanking(orders); if(machineTarget)machineTarget.innerHTML=mr.length?mr.slice(0,10).map((r,i)=>`<article class="sgman-ranking-row"><span class="priority-number">${i+1}</span><div><strong>${escapeHtml(r.machine)}</strong><p>${r.orders} OS • ${r.corrective} corretiva(s) • ${r.stopped} parada(s)</p><small>MTTR ${escapeHtml(smartFmtMinutes(r.mttr))} • Custo ${escapeHtml(sgmanFormatMoney(r.cost))}</small></div></article>`).join(''):'<p class="muted">Sem máquinas no filtro.</p>';
  const pr=dynamicMechanicRanking(orders); if(mechanicTarget)mechanicTarget.innerHTML=pr.length?pr.slice(0,10).map((r,i)=>`<article class="sgman-ranking-row"><span class="priority-number">${i+1}</span><div><strong>${escapeHtml(r.label)}</strong><p>${r.completed} concluída(s) de ${r.total} OS</p><small>MTTR ${escapeHtml(smartFmtMinutes(r.mttr))} • Custo associado ${escapeHtml(sgmanFormatMoney(r.cost))}</small></div></article>`).join(''):'<p class="muted">Sem executantes no filtro.</p>';
  if(insights)insights.innerHTML=dynamicManagementInsights(orders,summary).map(t=>`<div class="management-insight">${escapeHtml(t)}</div>`).join('');
  if(tbody)tbody.innerHTML=orders.slice().sort((a,b)=>(sgmanManagementOrderDate(b)?.getTime()||0)-(sgmanManagementOrderDate(a)?.getTime()||0)).slice(0,250).map(o=>{const date=sgmanManagementOrderDate(o),repair=typeof sgmanRepairDuration==='function'?sgmanRepairDuration(o):smartRepairMinutes(o),cost=sgmanOrderCost(o),description=compactIssue(o.description||o.comment||o.solution||'');return `<tr><td>${date?escapeHtml(date.toLocaleDateString('pt-BR')):'—'}</td><td>${escapeHtml(o.id||'—')}</td><td>${escapeHtml(sgmanManagementMachine(o)||'—')}</td><td>${escapeHtml(sgmanUserLabel(sgmanManagementMechanic(o))||'—')}</td><td>${escapeHtml(o.status||o.statusKey||'—')}</td><td>${escapeHtml(sgmanManagementMaintenanceType(o)||'—')}</td><td>${escapeHtml(smartFmtMinutes(repair))}</td><td>${escapeHtml(sgmanFormatMoney(cost.total))}</td><td class="sgman-description-cell">${escapeHtml(description||'—')}</td></tr>`}).join('');
  if(count)count.textContent=`${orders.length} OS`; const m=sgmanManagementState(); if(status)status.textContent=m.loadedAt?`Base de gestão atualizada em ${new Date(m.loadedAt).toLocaleString('pt-BR')} • período carregado: ${m.queryStart||'—'} até ${m.queryEnd||'—'}`:'Usando os dados SGMan já carregados no aplicativo. Escolha um período e atualize.'; const daily=dynamicDailyRows(orders); drawDynamicLineChart('sgmanMttrChart',daily,'mttr',v=>smartFmtMinutes(v)); drawDynamicLineChart('sgmanCostChart',daily,'cost',v=>sgmanFormatMoney(v));

  if(laborCostState().unlocked){
    renderLaborCostManagement();
  }
}
function sgmanMonthChunks(startDate,endDate){ const chunks=[]; let cursor=new Date(startDate.getFullYear(),startDate.getMonth(),1); while(cursor<=endDate){const ms=new Date(cursor),me=new Date(cursor.getFullYear(),cursor.getMonth()+1,0,23,59,59,999);chunks.push({start:ms<startDate?new Date(startDate):ms,end:me>endDate?new Date(endDate):me});cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1);} return chunks; }
function dedupeManagementOrders(orders=[]){ const seen=new Set(); return orders.filter(o=>{const key=[o.id,o.tag,o.startDate,o.endDate,o.description].join('|');if(seen.has(key))return false;seen.add(key);return true;}); }
async function fetchDynamicSgmanRange(startDate,endDate){
  const chunks=sgmanMonthChunks(startDate,endDate),all=[],button=$('refreshDynamicSgmanBtn'),status=$('sgmanManagementStatusText'); if(button){button.disabled=true;button.textContent='Buscando SGMan...';}
  try{for(let i=0;i<chunks.length;i++){const c=chunks[i];if(status)status.textContent=`Consultando SGMan: mês ${i+1} de ${chunks.length}...`;const response=await fetch('/api/sgman-list',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data_inicio:formatSgmanDateTime(c.start),data_fim:formatSgmanDateTime(c.end),calc_custos:1,limit:500})});const data=await response.json().catch(()=>({}));if(!response.ok||data.ok===false)throw new Error(data.error||`Erro HTTP ${response.status}`);all.push(...(Array.isArray(data.orders)?data.orders:[]));if(i<chunks.length-1)await waitMilliseconds(700);} const m=sgmanManagementState();m.orders=dedupeManagementOrders(all);m.loadedAt=new Date().toISOString();m.queryStart=sgmanDateInputValue(startDate);m.queryEnd=sgmanDateInputValue(endDate);populateDynamicSgmanFilters();renderDynamicSgmanManagement();renderPowerBiSgmanDashboard();showToast(`${m.orders.length} OS carregadas para a gestão.`);return m.orders;}finally{if(button){button.disabled=false;button.textContent='Atualizar período no SGMan';}}
}
async function refreshDynamicSgmanManagement(){ initializeDynamicSgmanDates(); const sv=$('sgmanManagementStart')?.value,ev=$('sgmanManagementEnd')?.value;if(!sv||!ev){showToast('Informe a data inicial e final.');return;}const start=new Date(`${sv}T00:00:00`),end=new Date(`${ev}T23:59:59`);if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<start){showToast('Período inválido.');return;}try{await fetchDynamicSgmanRange(start,end)}catch(error){showToast(`Falha na gestão SGMan: ${error.message}`)} }
async function loadAllDynamicSgmanHistory(){ const start=new Date('2025-09-01T00:00:00'),end=new Date();$('sgmanManagementMonth').value='';$('sgmanManagementStart').value=sgmanDateInputValue(start);$('sgmanManagementEnd').value=sgmanDateInputValue(end);$('sgmanManagementDay').value='';try{await fetchDynamicSgmanRange(start,end)}catch(error){showToast(`Não foi possível carregar o histórico completo: ${error.message}`)} }
function clearDynamicSgmanFilters(){ $('sgmanManagementDay').value='';$('sgmanManagementMachine').value='';$('sgmanManagementMechanic').value='';$('sgmanManagementType').value='';$('sgmanManagementStatus').value='';renderDynamicSgmanManagement(); }

function smartDate(order={}){
  const values=[
    order.completedAt,order.concludedAt,order.dataConclusao,
    order.endDate,order.dataFim,order.closedAt,
    order.createdAt,order.openedAt,order.dataAbertura,
    order.date,order.data
  ].filter(Boolean);

  for(const value of values){
    const date=new Date(value);
    if(!Number.isNaN(date.getTime()))return date;
  }
  return null;
}

function smartCompleted(order={}){
  const status=normalizeKey(order.status||order.situacao||order.state||'');
  return order.completed===true ||
    order.concluded===true ||
    status.includes('conclu') ||
    status.includes('finaliz') ||
    status.includes('fechad');
}

function smartCorrective(order={}){
  const text=normalizeKey([
    order.type,order.tipo,order.maintenanceType,
    order.tipoManutencao,order.serviceType,order.tipoServico
  ].filter(Boolean).join(' '));
  return text.includes('corret')||text.includes('quebra')||text.includes('emerg');
}

function smartStopped(order={}){
  if(order.machineStopped===true||order.maquinaParada===true)return true;
  const minutes=Number(
    order.downtimeMinutes||order.stopMinutes||order.tempoParadaMinutos||0
  );
  return Number.isFinite(minutes)&&minutes>0;
}

function smartRepairMinutes(order={}){
  const direct=Number(
    order.repairMinutes||order.mttrMinutes||
    order.durationMinutes||order.tempoReparoMinutos
  );
  if(Number.isFinite(direct)&&direct>=0)return direct;

  const start=new Date(
    order.startedAt||order.executionStart||
    order.dataInicio||order.openedAt||order.createdAt||''
  );
  const end=new Date(
    order.completedAt||order.concludedAt||
    order.dataConclusao||order.endDate||''
  );

  if(!Number.isNaN(start.getTime())&&!Number.isNaN(end.getTime())&&end>=start){
    return (end-start)/60000;
  }
  return null;
}

function smartMonthKey(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}

function smartMonthLabel(key){
  const [year,month]=key.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR',{
    month:'short',year:'2-digit'
  }).format(new Date(year,month-1,1));
}

function smartMonthlyEvolution(startMonth='2025-09'){
  const groups=new Map();

  for(const order of smartSgmanItems()){
    const date=smartDate(order);
    if(!date)continue;
    const key=smartMonthKey(date);
    if(key<startMonth)continue;

    if(!groups.has(key)){
      groups.set(key,{
        key,opened:0,completed:0,corrective:0,
        stopped:0,repairs:[],machines:new Map(),dates:[]
      });
    }

    const row=groups.get(key);
    row.opened++;
    if(smartCompleted(order))row.completed++;
    if(smartCorrective(order))row.corrective++;
    if(smartStopped(order))row.stopped++;

    const repair=smartRepairMinutes(order);
    if(repair!==null&&repair<4320)row.repairs.push(repair);

    const machine=normalizeMachineCode(
      order.machine||order.tag||order.equipment||order.maquina||''
    );
    if(machine)row.machines.set(machine,(row.machines.get(machine)||0)+1);

    if(smartStopped(order))row.dates.push(date);
  }

  return [...groups.values()]
    .sort((a,b)=>a.key.localeCompare(b.key))
    .map(row=>{
      row.mttr=row.repairs.length
        ? row.repairs.reduce((a,b)=>a+b,0)/row.repairs.length
        : null;
      row.recurrences=[...row.machines.values()].filter(count=>count>=2).length;

      row.dates.sort((a,b)=>a-b);
      const intervals=[];
      for(let i=1;i<row.dates.length;i++){
        intervals.push((row.dates[i]-row.dates[i-1])/3600000);
      }
      row.mtbf=intervals.length
        ? intervals.reduce((a,b)=>a+b,0)/intervals.length
        : null;

      return row;
    });
}

function smartFmtMinutes(value){
  if(value===null||!Number.isFinite(value))return '—';
  const total=Math.round(value);
  return `${Math.floor(total/60)}h ${String(total%60).padStart(2,'0')}min`;
}

function smartFmtHours(value){
  if(value===null||!Number.isFinite(value))return '—';
  const h=Math.floor(value);
  const m=Math.round((value-h)*60);
  return `${h}h ${String(m).padStart(2,'0')}min`;
}

function renderManagementHistory(){
  const start=$('managementHistoryStart')?.value||'2025-09';
  const rows=smartMonthlyEvolution(start);
  const summary=$('managementHistorySummary');
  const table=$('managementMonthlyTable');
  const insights=$('managementMonthlyInsights');

  if(summary){
    const totals=rows.reduce((acc,row)=>{
      acc.opened+=row.opened;
      acc.completed+=row.completed;
      acc.stopped+=row.stopped;
      return acc;
    },{opened:0,completed:0,stopped:0});

    summary.innerHTML=`
      <div class="manager-kpi"><span>Período</span><strong>${rows.length} mês(es)</strong><small>${rows.length?`${smartMonthLabel(rows[0].key)} até ${smartMonthLabel(rows[rows.length-1].key)}`:'Sem dados'}</small></div>
      <div class="manager-kpi"><span>OS abertas</span><strong>${totals.opened}</strong><small>Histórico</small></div>
      <div class="manager-kpi"><span>Concluídas</span><strong>${totals.completed}</strong><small>${totals.opened?Math.round(totals.completed/totals.opened*100):0}%</small></div>
      <div class="manager-kpi"><span>Com parada</span><strong>${totals.stopped}</strong><small>Impacto na produção</small></div>
    `;
  }

  if(table){
    table.innerHTML=rows.map(row=>`
      <tr>
        <td>${smartMonthLabel(row.key)}</td>
        <td>${row.opened}</td>
        <td>${row.completed}</td>
        <td>${row.corrective}</td>
        <td>${row.stopped}</td>
        <td>${row.recurrences}</td>
        <td>${smartFmtMinutes(row.mttr)}</td>
        <td>${smartFmtHours(row.mtbf)}</td>
      </tr>
    `).join('');
  }

  if(insights){
    if(rows.length<2){
      insights.innerHTML='<div class="management-insight">Ainda não há meses suficientes para comparar a evolução.</div>';
    }else{
      const first=rows[0],last=rows[rows.length-1];
      const firstRate=first.opened?first.completed/first.opened*100:0;
      const lastRate=last.opened?last.completed/last.opened*100:0;
      const delta=lastRate-firstRate;
      insights.innerHTML=`
        <div class="management-insight">${
          delta>=0
            ? `A taxa de conclusão evoluiu ${delta.toFixed(1)} ponto(s).`
            : `A taxa de conclusão caiu ${Math.abs(delta).toFixed(1)} ponto(s).`
        }</div>
        <div class="management-insight">Use os meses com mais OS com parada para definir planos de causa raiz e preventiva.</div>
      `;
    }
  }
}

function smartNumeric(value){
  const n=parseFloat(String(value??'').replace('%','').replace(',','.'));
  return Number.isFinite(n)?n:null;
}

function smartMachineRows(){
  const sources=[
    state.oeeLast12Hours,
    state.oeeCurrent,
    state.oeeData,
    state.oeeMachines,
    state.analysis?.machines,
    state.reportAnalysis?.machines,
    latestPowerBiMachineHistoryRows()
  ];

  const result=[];

  for(const source of sources){
    const rows=Array.isArray(source)
      ? source
      : Array.isArray(source?.items)
        ? source.items
        : Array.isArray(source?.machines)
          ? source.machines
          : [];

    for(const row of rows){
      const machine=normalizeMachineCode(
        row.machine||row.macchina||row.code||row.name||row.tag||''
      );
      const oee=smartNumeric(
        row.oee??row.efficiency??row.eficiencia??row.value??row.current
      );
      if(!machine || oee===null)continue;

      const previous=smartNumeric(
        row.previousOee??row.previous??row.oeePrevious??row.lastShift
      );

      result.push({
        machine,
        oee,
        previous,
        trend:previous===null?null:oee-previous,
        stoppedMinutes:Number(
          row.stoppedMinutes??row.downtimeMinutes??row.downtime??0
        )||0,
        failures:Number(
          row.failures??row.stops??row.failureCount??0
        )||0,
        raw:row
      });
    }
  }

  const map=new Map();
  result.forEach(item=>map.set(item.machine,item));
  return [...map.values()];
}

function smartPriorityScore(item){
  let score=0;
  const reasons=[];

  if(item.oee<50){score+=60;reasons.push(`OEE crítico ${item.oee.toFixed(1)}%`);}
  else if(item.oee<60){score+=45;reasons.push(`OEE muito baixo ${item.oee.toFixed(1)}%`);}
  else if(item.oee<65){score+=32;reasons.push(`OEE abaixo de 65%`);}
  else if(item.oee<70){score+=12;reasons.push(`OEE abaixo da meta`);}
  else score-=25;

  if(item.trend!==null){
    if(item.trend<=-10){score+=30;reasons.push(`queda de ${Math.abs(item.trend).toFixed(1)} pontos`);}
    else if(item.trend<=-5){score+=20;reasons.push(`queda de ${Math.abs(item.trend).toFixed(1)} pontos`);}
    else if(item.trend<0){score+=8;reasons.push('tendência de piora');}
    else if(item.trend>=5)score-=12;
  }

  if(item.stoppedMinutes>=60){score+=25;reasons.push(`${Math.round(item.stoppedMinutes)} min parados`);}
  else if(item.stoppedMinutes>=20){score+=14;reasons.push(`${Math.round(item.stoppedMinutes)} min parados`);}

  if(item.failures>=3){score+=18;reasons.push(`${item.failures} falhas`);}
  else score+=item.failures*4;

  return {...item,score:Math.max(0,Math.round(score)),reasons};
}

function smartPriorityRanking(limit=3){
  return smartMachineRows()
    .map(smartPriorityScore)
    .filter(item=>{
      // Máquina acima de 65%, sem queda, sem parada e sem falha recente
      // não pode entrar no plano do próximo turno por histórico antigo.
      const stableAbove65=
        item.oee>65 &&
        (item.trend===null || item.trend>=0) &&
        item.stoppedMinutes===0 &&
        item.failures===0;

      if(stableAbove65)return false;

      return (
        item.oee<70 ||
        (item.trend!==null && item.trend<0) ||
        item.stoppedMinutes>0 ||
        item.failures>0
      );
    })
    .sort((a,b)=>b.score-a.score || a.oee-b.oee)
    .slice(0,limit);
}

function smartSgmanItems(){
  return state.sgmanHistory?.items||
    state.sgmanHistory?.orders||
    state.sgmanOrders||
    [];
}

function smartOrderText(order={}){
  return normalizeKey([
    order.description,order.descricao,order.problem,order.problema,
    order.cause,order.causa,order.service,order.servico,
    order.conclusion,order.conclusao,order.comment,order.comentario
  ].filter(Boolean).join(' '));
}

function smartHistoryFor(machine,issue=''){
  const machineCode=normalizeMachineCode(machine);
  const words=normalizeKey(issue)
    .split(/\s+/)
    .filter(word=>word.length>=4);

  return smartSgmanItems()
    .filter(order=>
      normalizeMachineCode(
        order.machine||order.tag||order.equipment||order.maquina||''
      )===machineCode
    )
    .map(order=>{
      const text=smartOrderText(order);
      const matches=words.filter(word=>text.includes(word)).length;
      return {order,text,score:matches*10};
    })
    .filter(item=>item.score>0 || !words.length)
    .sort((a,b)=>b.score-a.score)
    .slice(0,250)
    .map(item=>item.order);
}

function smartActionsFromHistory(orders,issue=''){
  const text=normalizeKey(orders.map(smartOrderText).join(' '));
  const catalog=[
    ['mola','Conferir tensão, deformação e quebra da mola da rotulatriz.'],
    ['posicao faca','Conferir posição, alinhamento e aperto da faca.'],
    ['faca','Verificar corte, desgaste, folga e condição da contrafaca.'],
    ['calco','Conferir calços e nivelamento do conjunto.'],
    ['sensor','Verificar posição, leitura, fixação e repetibilidade dos sensores.'],
    ['vacuo','Medir vácuo e verificar mangueiras, ventosas, válvulas e vazamentos.'],
    ['bobina','Conferir alinhamento, tensão, freio e roletes da bobina.'],
    ['came','Inspecionar came, leva, sincronismo, folga e fixação.'],
    ['carrinho','Conferir alinhamento, folga, curso e sincronismo do carrinho.'],
    ['rolamento','Inspecionar rolamentos, folgas, ruído, temperatura e lubrificação.']
  ];

  const actions=catalog
    .filter(([word])=>text.includes(normalizeKey(word)))
    .map(([,action])=>action);

  const issueKey=normalizeKey(issue);
  if(issueKey.includes('variacao') && issueKey.includes('altura')){
    actions.push(
      'Conferir mola e sincronismo da rotulatriz.',
      'Conferir posição, alinhamento e corte da faca.',
      'Verificar calços, sensores e estabilidade do vácuo.'
    );
  }

  return uniqueStrings(actions).slice(0,4);
}


function productionReportMachineMentions(){
  const texts=[
    state.productionReportText,
    state.productionReport,
    state.latestProductionReport,
    state.analysisInput,
    state.rawReportText,
    state.analysis?.rawText,
    $('reportText')?.value,
    $('productionReportInput')?.value,
    $('reportInput')?.value,
    $('analysisInput')?.value
  ].filter(Boolean).join('\n');

  const machines=new Map();

  for(const machine of OEE_BOARD_MACHINES){
    const normalized=normalizeMachineCode(machine);
    const variants=[
      normalized,
      normalized.replace('-',''),
      normalized.replace('MK-','MK '),
      normalized.replace('MK-','MAQUINA ')
    ];

    const present=variants.some(variant=>
      normalizeKey(texts).includes(normalizeKey(variant))
    );

    if(!present)continue;

    const lines=String(texts).split(/\n+/)
      .filter(line=>
        variants.some(variant=>
          normalizeKey(line).includes(normalizeKey(variant))
        )
      );

    machines.set(normalized,{
      machine:normalized,
      mentioned:true,
      lines,
      problem:compactIssue(lines.join(' '))
    });
  }

  return machines;
}

function currentBoardMap(){
  const map=new Map();

  for(const item of smartMachineRows()){
    map.set(item.machine,item);
  }

  // Ordem da menor para a maior confiança.
  // Os dados confirmados no editor/análise ficam por último
  // e sempre prevalecem sobre histórico ou OCR bruto.
  const boardRows=[
    ...(state.boardAnalysis?.machines||[]),
    ...(state.ocrOeeRows||[]),
    ...(state.oeeBoardRows||[]),
    ...(state.oeeMachineEditorData||[])
      .filter(row=>row.needsConfirmation!==true),
    ...(state.analysis?.lowOeeMachines||[]),
    ...(state.analysis?.machineOee||[])
  ];

  for(const row of boardRows){
    const machine=normalizeMachineCode(
      row.machine||row.maquina||row.code||''
    );
    const oee=smartNumeric(row.oee??row.value??row.efficiency);

    if(machine && oee!==null){
      const previous=map.get(machine);
      map.set(machine,{
        ...(previous||{}),
        machine,
        oee,
        previous:previous?.previous??null,
        trend:previous?.trend??null,
        stoppedMinutes:previous?.stoppedMinutes??0,
        failures:previous?.failures??0,
        raw:{...(previous?.raw||{}),...row},
        boardConfirmed:true
      });
    }
  }

  return map;
}


function supervisorPriorityStorageKey(){
  return 'turnosmart_supervisor_priorities_v74';
}

function loadSavedSupervisorPriorities(){
  try{
    const raw=localStorage.getItem(supervisorPriorityStorageKey());
    const parsed=raw?JSON.parse(raw):[];
    return Array.isArray(parsed)
      ? parsed.map(normalizeMachineCode).filter(Boolean).slice(0,3)
      : [];
  }catch{
    return [];
  }
}

function saveSupervisorPriorities(machines=[]){
  try{
    localStorage.setItem(
      supervisorPriorityStorageKey(),
      JSON.stringify(
        uniqueStrings(
          machines.map(normalizeMachineCode).filter(Boolean)
        ).slice(0,3)
      )
    );
  }catch(error){
    console.warn('Não foi possível salvar prioridades:',error);
  }
}

function applyAutomaticSupervisorSelection(rows=[]){
  const available=new Set(rows.map(row=>row.machine));
  const saved=loadSavedSupervisorPriorities()
    .filter(machine=>available.has(machine));

  const automatic=rows.slice(0,3).map(row=>row.machine);
  const selected=saved.length
    ? uniqueStrings([...saved,...automatic]).slice(0,3)
    : automatic;

  saveSupervisorPriorities(selected);

  return rows.map(row=>({
    ...row,
    selected:selected.includes(row.machine)
  }));
}


function fallbackCurrentShiftPriorities(limit=3){
  const machineOee=[
    ...(state.analysis?.machineOee||[]),
    ...(machineOeeFromEditor?.()||[])
  ];

  const map=new Map();

  for(const item of machineOee){
    const machine=normalizeMachineCode(item.machine||item.maquina||'');
    const oee=smartNumeric(item.oee??item.value);
    if(!machine || oee===null)continue;
    map.set(machine,{machine,oee});
  }

  const report=productionReportMachineMentions();

  return [...map.values()]
    .filter(item=>item.oee<OEE_PRIORITY_LIMIT)
    .sort((a,b)=>a.oee-b.oee)
    .slice(0,limit)
    .map(item=>{
      const reportRow=report.get(item.machine);
      const issue=compactIssue(reportRow?.problem||'');
      const history=smartHistoryFor(item.machine,issue);
      const specific=smartActionsFromHistory(history,issue);
      const priority=oeePriorityMeta(item.oee);
      const lostHours=oeeLostHours(item.oee);

      return {
        machine:item.machine,
        oee:item.oee,
        lostHours,
        priorityKey:priority.key,
        priorityLabel:priority.label,
        trend:null,
        score:Math.round((100-item.oee)*10 + Math.min(history.length,100)),
        reasons:uniqueStrings([
          `OEE ${item.oee.toFixed(1)}%`,
          `${formatOeeLostHours(item.oee)} de perda estimada pelo OEE`,
          reportRow?.mentioned?'problema citado no relatório da produção':''
        ].filter(Boolean)),
        issue,
        actions:oeeObjectiveActions(specific,item.oee),
        historyCount:history.length,
        sources:uniqueStrings([
          'board',
          reportRow?.mentioned?'production':'',
          history.length?'sgman':''
        ].filter(Boolean)),
        selected:true
      };
    });
}

function supervisorFusionRanking(limit=5){
  const report=productionReportMachineMentions();
  const board=currentBoardMap();
  const rows=[];

  for(const [machine,boardRow] of board.entries()){
    const oee=smartNumeric(boardRow?.oee);

    // REGRA ABSOLUTA:
    // sem OEE atual confirmado = não prioriza.
    // OEE >=65 = não aparece.
    if(oee===null || oee>=OEE_PRIORITY_LIMIT)continue;

    const reportRow=report.get(machine);
    const issue=compactIssue(
      reportRow?.problem||
      boardRow.raw?.problem||
      boardRow.raw?.issue||
      boardRow.raw?.mainLoss||
      boardRow.raw?.cause||
      boardRow.raw?.causale_standard||
      ''
    );

    const history=smartHistoryFor(machine,issue);
    const specific=smartActionsFromHistory(history,issue);
    const priority=oeePriorityMeta(oee);
    const lostHours=oeeLostHours(oee);

    const sources=['board'];
    if(reportRow?.mentioned)sources.push('production');
    if(history.length)sources.push('sgman');

    rows.push({
      machine,
      oee,
      lostHours,
      priorityKey:priority.key,
      priorityLabel:priority.label,
      score:Math.round((100-oee)*10 + Math.min(history.length,100)),
      trend:boardRow.trend??null,
      reasons:uniqueStrings([
        `${priority.icon} ${priority.label}`,
        `OEE ${oee.toFixed(1)}%`,
        `${formatOeeLostHours(oee)} de perda estimada pelo OEE`,
        reportRow?.mentioned?'problema citado no relatório da produção':''
      ].filter(Boolean)),
      issue,
      actions:oeeObjectiveActions(specific,oee),
      historyCount:history.length,
      sources:uniqueStrings(sources),
      selected:false
    });
  }

  // A ordem é SEMPRE do pior OEE para o melhor.
  const ranked=rows
    .sort((a,b)=>
      a.oee-b.oee ||
      b.historyCount-a.historyCount
    )
    .slice(0,limit);

  return applyAutomaticSupervisorSelection(ranked);
}

function sourceBadge(source){
  const labels={
    board:'Quadro OEE',
    production:'Relatório produção',
    sgman:'Histórico SGMan',
    manual:'Confirmação manual'
  };

  return `<span class="ecopack-source-badge source-${escapeHtml(source)}">${
    escapeHtml(labels[source]||source)
  }</span>`;
}

function renderSupervisorFusionPanel(){
  const target=$('supervisorFusionPanel');
  if(!target)return;

  let rows=supervisorFusionRanking(5);
  if(!rows.length){
    rows=fallbackCurrentShiftPriorities(5);
  }
  rows=applyAutomaticSupervisorSelection(rows);
  state.supervisorFusionRows=rows;

  target.innerHTML=`
    <div class="supervisor-confirm-box">
      <strong>Prioridade definida pelo OEE da foto</strong>
      <p>Somente máquinas abaixo de 65% entram. Até 50% = prioridade máxima. Relatório da produção explica o problema e o SGMan orienta o que verificar.</p>
    </div>

    <div class="supervisor-fusion-panel">
      ${rows.length?rows.map((row,index)=>`
        <article class="supervisor-fusion-row ${row.selected?'is-selected':''} priority-${escapeHtml(row.priorityKey||'high')}">
          <span class="supervisor-fusion-rank">${index+1}</span>
          <div>
            <strong>${
              row.priorityKey==='max'?'🔴':'🟠'
            } ${escapeHtml(row.priorityLabel||'PRIORIDADE ALTA')} — ${escapeHtml(row.machine)}${
              row.oee!==null?` — OEE ${row.oee.toFixed(1)}%`:''
            }</strong>
            <p><b>Perda estimada:</b> ${escapeHtml(formatOeeLostHours(row.oee))} calculada pelo OEE do turno.</p>
            <p>${escapeHtml(row.reasons.filter(reason=>!reason.includes('perda estimada')).join(' | ')||'Revisar prioridade')}</p>
            <div class="supervisor-fusion-meta">
              ${row.sources.map(sourceBadge).join('')}
            </div>
          </div>
          <label>
            <input class="supervisor-priority-check"
              data-machine="${escapeHtml(row.machine)}"
              type="checkbox" ${row.selected?'checked':''}>
            Prioridade
          </label>
        </article>
      `).join(''):'<p class="muted">Nenhuma prioridade atual identificada.</p>'}
    </div>
  `;

  $$('.supervisor-priority-check').forEach(input=>{
    input.addEventListener('change',()=>{
      const selected=$$('.supervisor-priority-check:checked');

      if(selected.length>3){
        input.checked=false;
        showToast('Escolha no máximo três prioridades.');
        return;
      }

      const selectedMachines=[...selected]
        .map(item=>normalizeMachineCode(item.dataset.machine))
        .filter(Boolean);

      state.supervisorFusionRows=state.supervisorFusionRows.map(row=>({
        ...row,
        selected:selectedMachines.includes(row.machine)
      }));

      saveSupervisorPriorities(selectedMachines);

      input.closest('.supervisor-fusion-row')
        ?.classList.toggle('is-selected',input.checked);
    });
  });
}

function confirmedSupervisorPlan(){
  let rows=(state.supervisorFusionRows?.length
    ? state.supervisorFusionRows
    : supervisorFusionRanking(5)
  );

  if(!rows.length){
    rows=fallbackCurrentShiftPriorities(3);
  }

  let selected=rows.filter(row=>row.selected).slice(0,3);

  if(!selected.length){
    rows=applyAutomaticSupervisorSelection(rows);
    state.supervisorFusionRows=rows;
    selected=rows.filter(row=>row.selected).slice(0,3);
  }

  return selected.map((row,index)=>{
    const actions=row.actions
      .map(action=>`   • ${action}`)
      .join('\n');

    const sourceText=row.sources.map(source=>({
      board:'quadro OEE',
      production:'relatório da produção',
      sgman:'histórico SGMan'
    })[source]||source).join(' + ');

    const priority=oeePriorityMeta(row.oee);

    return `${index+1}. ${priority.icon} *${priority.label} — ${row.machine}*${
      row.oee!==null?` — OEE ${row.oee.toFixed(1)}%`:''
    } — perda estimada ${formatOeeLostHours(row.oee)}.
${actions}
   Fonte atual: ${sourceText||'confirmação do supervisor'}.
   Histórico técnico: ${row.historyCount} OS semelhante(s).`;
  }).join('\n');
}
function smartNextShiftPlan(){
  return smartPriorityRanking(3).map(item=>{
    const issue=compactIssue(
      item.raw.problem||
      item.raw.issue||
      item.raw.mainLoss||
      item.raw.cause||
      item.raw.causale_standard||
      ''
    );

    const history=smartHistoryFor(item.machine,issue);
    const actions=smartActionsFromHistory(history,issue);

    return {
      ...item,
      issue,
      historyCount:history.length,
      actions:actions.length
        ? actions
        : [
            'Analisar e resolver o problema durante o turno.',
            'Testar, acompanhar a produção e confirmar estabilidade.',
            'Registrar causa, serviço e resultado no SGMan.'
          ]
    };
  });
}

function smartFormatNextShiftPlan(){
  const confirmed=confirmedSupervisorPlan();
  if(confirmed)return confirmed;

  const plan=smartNextShiftPlan();
  if(!plan.length){
    return 'Sem leitura atual suficiente. Analisar e resolver os problemas do turno.';
  }

  return plan.map((item,index)=>{
    const reason=item.reasons.length
      ? item.reasons.join(' | ')
      : `OEE ${item.oee.toFixed(1)}%`;

    return `${index+1}. *${item.machine}* — ${reason}.
${item.actions.map(action=>`   • ${action}`).join('\n')}
   Base SGMan: ${item.historyCount} OS semelhante(s) usadas apenas como histórico técnico.`;
  }).join('\n');
}
function renderEfficiencyTrendAndPlan(metrics) {
  state.realNextShiftPlanText=smartFormatNextShiftPlan();

  const trend = metrics.efficiencyTrend || {};
  const trendTarget = $('efficiencyTrendCard');
  const planTarget = $('dailyPlanList');

  if (trendTarget) {
    const deltaText = trend.delta === null
      ? 'Sem comparação anterior'
      : `${trend.delta >= 0 ? '+' : ''}${trend.delta.toFixed(1).replace('.', ',')} ponto(s)`;

    trendTarget.className = `efficiency-trend-card trend-${trend.direction || 'unknown'}`;
    trendTarget.innerHTML = `
      <div class="efficiency-trend-main">
        <span class="efficiency-arrow">${escapeHtml(trend.arrow || '➜')}</span>
        <div>
          <span>Tendência da eficiência</span>
          <strong>${trend.current == null ? '-' : escapeHtml(formatOee(trend.current))}</strong>
          <small>${escapeHtml(deltaText)}</small>
        </div>
      </div>
      <p>${escapeHtml(trend.phrase || '')}</p>`;
  }

  if (planTarget) {
    if (!metrics.dailyPlan?.length) {
      planTarget.innerHTML =
        '<p class="muted">Não há falhas com máquina parada suficientes para montar o plano do dia.</p>';
    } else {
      planTarget.innerHTML = metrics.dailyPlan.map((row, index) => `
        <div class="daily-plan-item">
          <span class="priority-number">${index + 1}</span>
          <div>
            <strong>${escapeHtml(row.machine)}</strong>
            <p>${row.failureCount} falha(s) • MTTR ${escapeHtml(formatReliabilityTime(row.mttrMinutes, '-'))} • MTBF ${escapeHtml(formatReliabilityTime(row.mtbfMinutes, '-'))}</p>
          </div>
          <span class="trend-pill ${row.recurrent ? 'trend-down' : 'trend-stable'}">${row.recurrent ? 'Reincidente' : 'Acompanhar'}</span>
        </div>
      `).join('');
    }
  }
}

function renderReliability3Days() {
  const metrics = calculateReliability3Days();
  state.reliability3Days = metrics;

  const cards = $('reliabilityCards');
  const table = $('reliabilityTable');
  const note = $('reliabilityNote');

  renderEfficiencyTrendAndPlan(metrics);
  renderManagerDashboard(metrics);
  renderPeopleAndPreventivePanels(metrics);
  renderMaintenanceAccountabilityPanel();

  if (cards) {
    cards.innerHTML = `
      <div class="metric">
        <span>OS concluídas no turno atual</span>
        <strong>${metrics.completedCurrentShift}</strong>
        <small>${escapeHtml(metrics.currentShiftName)} • ${escapeHtml(metrics.currentShiftLabel)} • ${Number(state.sgmanHistory?.summary?.completedWithDate || 0)} concluída(s) com data reconhecida</small>
      </div>
      <div class="metric">
        <span>MTTR SGMan — 3 dias</span>
        <strong>${escapeHtml(formatReliabilityTime(metrics.mttrMinutes))}</strong>
        <small>${metrics.repairIntervals} reparo(s) com máquina parada</small>
      </div>
      <div class="metric">
        <span>MTBF SGMan — 3 dias</span>
        <strong>${escapeHtml(formatReliabilityTime(metrics.mtbfMinutes))}</strong>
        <small>${metrics.failureIntervals} intervalo(s) entre falhas da máquina completa</small>
      </div>
      <div class="metric">
        <span>Confiabilidade — próximo turno</span>
        <strong>${escapeHtml(formatReliabilityPercent(metrics.reliabilityPercent))}</strong>
        <small>Probabilidade estimada de operar 12h sem falha</small>
      </div>
      <div class="metric">
        <span>Falhas com máquina parada</span>
        <strong>${metrics.failureCount}</strong>
        <small>${metrics.rows.length} máquina(s), incluindo TAGs filhas</small>
      </div>
      <div class="metric">
        <span>Reincidência</span>
        <strong>${metrics.recurrentMachines}</strong>
        <small>Máquinas com duas ou mais falhas reais</small>
      </div>`;
  }

  if (note) note.textContent = metrics.note;

  if (table) {
    if (!metrics.rows.length) {
      table.innerHTML =
        '<p class="muted">Sem dados suficientes de corretivas com máquina parada nas últimas 72 horas.</p>';
    } else {
      table.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Máquina completa</th>
              <th>Falhas</th>
              <th>MTTR</th>
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
    detail.innerHTML = `
      <strong>Referência técnica por máquina</strong>
      <p class="muted">
        As possíveis resoluções não usam mais as últimas OS gerais.
        Para cada apontamento, o aplicativo consulta até 100 OS da própria máquina
        e compara somente problemas semelhantes.
      </p>`;
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

    const completedWithDate = Number(
      state.sgmanHistory?.summary?.completedWithDate || 0
    );
    const completedWithoutDate = Number(
      state.sgmanHistory?.summary?.completedWithoutDate || 0
    );

    const detailText = diagnostic.queryMode
      ? ` • API: ${largestArray} item(ns) • reconhecidos: ${interpreted} • concluídas com data: ${completedWithDate} • sem data: ${completedWithoutDate} • modo: ${mode}`
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

function waitMilliseconds(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function getCachedSgmanMachineHistory() {
  // As 100 OS de cada máquina ficam somente na memória da sessão.
  // Remove automaticamente o cache grande criado pelas versões antigas.
  try {
    localStorage.removeItem(STORAGE.sgmanMachineHistory);
  } catch {
    // Sem ação.
  }

  return {};
}

function saveSgmanMachineHistory() {
  // Não grava as OS completas no localStorage.
  // O navegador do iPhone possui limite pequeno e esse cache causava
  // “The quota has been exceeded”.
  try {
    localStorage.removeItem(STORAGE.sgmanMachineHistory);
  } catch {
    // Sem ação.
  }

  return true;
}

function machineHistoryCacheIsFresh(entry, tag) {
  if (!entry?.loadedAt || entry.tag !== tag) return false;

  const loadedAt = new Date(entry.loadedAt);
  if (Number.isNaN(loadedAt.getTime())) return false;

  const sixHours = 6 * 60 * 60 * 1000;
  return Date.now() - loadedAt.getTime() < sixHours;
}

function machineHistoryForMachine(machine = '') {
  return state.sgmanMachineHistory?.[machine]?.orders || [];
}


function normalizeSgmanTagTreeValue(value = '') {
  return normalizeKey(value)
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function orderBelongsToMachineTree(order = {}, rootMachine = '', rootTag = '') {
  const machineFromOrder = machineKeyFromText(
    [
      order.machine,
      order.tag,
      order.local,
      order.description,
      order.comment,
      order.solution
    ].filter(Boolean).join(' ')
  );

  if (machineFromOrder === rootMachine) return true;

  const rootTagKey = normalizeSgmanTagTreeValue(rootTag);
  const orderTagKey = normalizeSgmanTagTreeValue(order.tag || '');
  const localKey = normalizeSgmanTagTreeValue(order.local || '');

  if (rootTagKey) {
    if (
      orderTagKey === rootTagKey ||
      orderTagKey.startsWith(rootTagKey) ||
      orderTagKey.endsWith(rootTagKey) ||
      orderTagKey.includes(rootTagKey) ||
      localKey.startsWith(rootTagKey) ||
      localKey.includes(rootTagKey)
    ) {
      return true;
    }
  }

  return Boolean(order._returnedFromTreeQuery);
}

function machineTreeLabel(order = {}) {
  const tag = String(order.tag || '').trim();
  const local = String(order.local || '').trim();

  if (tag && local && normalizeKey(tag) !== normalizeKey(local)) {
    return `${tag} — ${local}`;
  }

  return tag || local || 'TAG filha não identificada';
}

async function fetchSgmanMachineHistory(machine, force = false) {
  const config = getConfig();
  const tag = config.sgmanTagMap?.[machine] || '';
  if (!tag) return { machine, tag: '', orders: [], error: `TAG não cadastrada para ${machine}.` };

  const cached = state.sgmanMachineHistory?.[machine];
  if (!force && machineHistoryCacheIsFresh(cached, tag)) return cached;

  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 2);

  const requestList = async body => {
    const response = await fetch('/api/sgman-list', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Erro HTTP ${response.status}`);
    return data;
  };

  const collected = [];
  const diagnostics = [];
  const add = (orders, source) => (orders || []).forEach(order => collected.push({
    ...order, _historySource: source, _returnedFromTreeQuery: source === 'tag',
    rootMachine: machine, rootTag: tag
  }));

  try {
    const byTag = await requestList({
      data_inicio: formatSgmanDateTime(start), data_fim: formatSgmanDateTime(end),
      tag, calc_custos: 1, limit: 300
    });
    add(byTag.orders, 'tag');
    diagnostics.push({ mode: 'tag', count: Number(byTag.orders?.length || 0) });
  } catch (error) { diagnostics.push({ mode: 'tag', count: 0, error: error.message }); }

  if (collected.length < 20) {
    await waitMilliseconds(900);
    try {
      const general = await requestList({
        data_inicio: formatSgmanDateTime(start), data_fim: formatSgmanDateTime(end),
        calc_custos: 0, limit: 500
      });
      add(general.orders, 'general');
      diagnostics.push({ mode: 'general', count: Number(general.orders?.length || 0) });
    } catch (error) { diagnostics.push({ mode: 'general', count: 0, error: error.message }); }
  }

  const number = machine.replace(/\D/g, '');
  const numberPattern = new RegExp(`(^|[^0-9])0*${number}([^0-9]|$)`);
  const rootTagKey = normalizeSgmanTagTreeValue(tag);
  const filtered = collected.filter(order => {
    if (orderBelongsToMachineTree(order, machine, tag)) return true;
    const text = normalizeKey([order.machine,order.tag,order.local,order.description,order.comment,order.solution].filter(Boolean).join(' '));
    const tagKey = normalizeSgmanTagTreeValue(order.tag || '');
    const localKey = normalizeSgmanTagTreeValue(order.local || '');
    return numberPattern.test(text) || (rootTagKey && tagKey.includes(rootTagKey)) || (rootTagKey && localKey.includes(rootTagKey));
  });

  const seen = new Set();
  const orders = filtered.sort((a,b)=>String(b.endDate||b.startDate).localeCompare(String(a.endDate||a.startDate)))
    .filter(order => {
      const key=[order.id,order.tag,order.startDate,order.endDate,order.description].join('|');
      if (seen.has(key)) return false; seen.add(key); return true;
    }).slice(0,100);

  const entry = {
    machine, tag, loadedAt: new Date().toISOString(), orders,
    childTags: uniqueStrings(orders.map(machineTreeLabel)).slice(0,50), treeMode: true,
    diagnostic: { diagnostics, totalReceived: collected.length, totalMatched: filtered.length, totalUsed: orders.length },
    returnedCount: orders.length
  };
  state.sgmanMachineHistory[machine] = entry;
  saveSgmanMachineHistory();
  return entry;
}

async function loadSgmanMachineHistories(actions = [], force = false) {
  if (state.sgmanMachineHistoryLoading) return;

  const machines = uniqueStrings(
    actions
      .filter(action =>
        action.department === 'maintenance' &&
        /^MK-/.test(action.machine)
      )
      .map(action => action.machine)
  );

  if (!machines.length) return;

  state.sgmanMachineHistoryLoading = true;

  const status = $('sgmanMachineAnalysisStatus');
  const button = $('refreshMachineHistoryBtn');

  if (button) {
    button.disabled = true;
    button.textContent = 'Analisando...';
  }

  try {
    for (let index = 0; index < machines.length; index++) {
      const machine = machines[index];

      if (status) {
        status.textContent =
          `Consultando até 100 OS da ${machine} — ${index + 1} de ${machines.length}...`;
      }

      try {
        await fetchSgmanMachineHistory(machine, force);
      } catch (error) {
        state.sgmanMachineHistory[machine] = {
          machine,
          tag: getConfig().sgmanTagMap?.[machine] || '',
          loadedAt: new Date().toISOString(),
          orders: [],
          error: error.message
        };
      }

      if (index < machines.length - 1) {
        await waitMilliseconds(900);
      }
    }

    saveSgmanMachineHistory();

    if (status) {
      status.textContent =
        `Análise concluída para ${machines.length} máquina(s).`;
    }
  } finally {
    state.sgmanMachineHistoryLoading = false;

    if (button) {
      button.disabled = false;
      button.textContent = 'Atualizar análise';
    }
  }
}

const HISTORY_STOP_WORDS = new Set([
  'para', 'com', 'sem', 'uma', 'uns', 'das', 'dos', 'de', 'da', 'do',
  'em', 'na', 'no', 'nas', 'nos', 'por', 'que', 'foi', 'esta', 'está',
  'ficou', 'fazer', 'feito', 'maquina', 'máquina', 'ajuste', 'ajustar',
  'verificar', 'problema', 'possivel', 'possível', 'resolucao', 'resolução',
  'troca', 'trocar', 'servico', 'serviço', 'mk'
]);

function historyMeaningfulTokens(value = '') {
  return normalizeKey(value)
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token =>
      token.length >= 4 &&
      !HISTORY_STOP_WORDS.has(token) &&
      !/^\d+$/.test(token)
    );
}

const HISTORY_ISSUE_CATEGORIES = [
  {
    key: 'altura',
    label: 'variação de altura',
    regex: /variacao.{0,20}altura|altura.{0,20}vari|desnivel|altura irregular|alto.{0,10}baixo/
  },
  {
    key: 'faca',
    label: 'faca ou corte',
    regex: /faca|contra ?faca|corte|cortando/
  },
  {
    key: 'tampao',
    label: 'tampão ou vedação',
    regex: /tampao|vedacao|vazamento/
  },
  {
    key: 'bobina',
    label: 'bobina',
    regex: /bobina|desbobin/
  },
  {
    key: 'faixa',
    label: 'faixa',
    regex: /faixa/
  },
  {
    key: 'fundo',
    label: 'fundo',
    regex: /fundo/
  },
  {
    key: 'retorno',
    label: 'peça voltando',
    regex: /peca.{0,15}volt|voltando|retorno/
  },
  {
    key: 'lubrificacao',
    label: 'lubrificação',
    regex: /lubrific|oleo|graxa/
  },
  {
    key: 'cola',
    label: 'cola',
    regex: /cola|colagem/
  },
  {
    key: 'sensor',
    label: 'sensor ou elétrica',
    regex: /sensor|encoder|drive|eletric|rele|fusivel|cabo/
  },
  {
    key: 'pneumatica',
    label: 'pneumática',
    regex: /pneumat|mangueira|cilindro|valvula|ar comprimido/
  },
  {
    key: 'saida',
    label: 'saída',
    regex: /saida|esteira|estrela|garra/
  }
];

function historyIssueCategories(value = '') {
  const key = normalizeKey(value);

  return HISTORY_ISSUE_CATEGORIES
    .filter(category => category.regex.test(key))
    .map(category => category.key);
}

function extractHistorySection(text = '', section = 'problema') {
  const value = String(text || '');

  const patterns = {
    problema: /problema\s*:\s*([\s\S]*?)(?=poss[ií]vel resolu[cç][aã]o\s*:|aten[cç][aã]o\s*:|$)/i,
    resolucao: /poss[ií]vel resolu[cç][aã]o\s*:\s*([\s\S]*?)(?=aten[cç][aã]o\s*:|$)/i
  };

  return value.match(patterns[section])?.[1]?.trim() || '';
}

function historicalProblemText(order = {}) {
  return [
    order.description || '',
    extractHistorySection(order.comment || '', 'problema')
  ].join(' ').trim();
}

function historicalResolutionText(order = {}) {
  return [
    order.solution || '',
    extractHistorySection(order.comment || '', 'resolucao'),
    order.comment || '',
    order.description || ''
  ].join(' ').trim();
}

function historySimilarityScore(currentProblem, order) {
  const currentKey = normalizeKey(currentProblem);
  const historicalProblem = historicalProblemText(order);
  const historicalKey = normalizeKey(historicalProblem);

  if (!historicalKey) return 0;

  const currentCategories = historyIssueCategories(currentKey);
  const historicalCategories = historyIssueCategories(historicalKey);

  const matchedCategories = currentCategories.filter(category =>
    historicalCategories.includes(category)
  );

  const currentTokens = new Set(historyMeaningfulTokens(currentKey));
  const historicalTokens = new Set(historyMeaningfulTokens(historicalKey));

  const matchedTokens = [...currentTokens].filter(token =>
    historicalTokens.has(token)
  );

  // Sem categoria técnica igual e sem ao menos duas palavras importantes
  // iguais, a OS não é considerada referência confiável.
  if (!matchedCategories.length && matchedTokens.length < 2) {
    return 0;
  }

  let score = matchedCategories.length * 30;
  score += matchedTokens.length * 8;

  if (
    currentKey.length >= 8 &&
    (
      historicalKey.includes(currentKey) ||
      currentKey.includes(historicalKey)
    )
  ) {
    score += 25;
  }

  // Quanto maior a cobertura das palavras do problema atual, melhor.
  if (currentTokens.size) {
    score += Math.round(
      (matchedTokens.length / currentTokens.size) * 20
    );
  }

  return score;
}

const HISTORY_SOLUTION_PATTERNS = [
  {
    key: 'mola',
    label: 'verificar mola quebrada, cansada ou fora de posição',
    shortLabel: 'mola',
    regex: /mola/
  },
  {
    key: 'posicao_faca',
    label: 'conferir posição, alinhamento e aperto da faca',
    shortLabel: 'posição da faca',
    regex: /(posi|reposi|alinh|regul|ajust).{0,35}faca|faca.{0,35}(posi|reposi|alinh|regul|ajust)/
  },
  {
    key: 'troca_faca',
    label: 'verificar desgaste, quebra e necessidade de troca da faca',
    shortLabel: 'troca da faca',
    regex: /(troca|trocad|substitu|nova).{0,30}faca|faca.{0,30}(quebrad|desgast|danific|substitu|trocad)/
  },
  {
    key: 'contrafaca',
    label: 'verificar contrafaca, folga e alinhamento',
    shortLabel: 'contrafaca',
    regex: /contra ?faca/
  },
  {
    key: 'calco',
    label: 'conferir calços e nivelamento do conjunto',
    shortLabel: 'calços',
    regex: /calco|cal[cç]ar/
  },
  {
    key: 'fixacao',
    label: 'reapertar fixações, suportes e parafusos',
    shortLabel: 'fixações',
    regex: /apert|fixa[cç][aã]o|parafuso|suporte solto/
  },
  {
    key: 'came',
    label: 'verificar came, leva e sincronismo',
    shortLabel: 'came/sincronismo',
    regex: /came|leva|sincronismo/
  },
  {
    key: 'garra',
    label: 'verificar garra, guia e passagem da peça',
    shortLabel: 'garra/guia',
    regex: /garra|guia/
  },
  {
    key: 'rolamento',
    label: 'verificar rolamentos, eixos e folgas',
    shortLabel: 'rolamentos/eixos',
    regex: /rolament|eixo|folga/
  },
  {
    key: 'vedacao',
    label: 'verificar vedação, desgaste e alinhamento do tampão',
    shortLabel: 'vedação',
    regex: /vedacao|vazamento|anel|borracha/
  },
  {
    key: 'bobina',
    label: 'verificar alinhamento, tensão, freio e roletes da bobina',
    shortLabel: 'alinhamento da bobina',
    regex: /bobina|tensao|freio|rolete/
  },
  {
    key: 'sensor',
    label: 'verificar sensor, cabo, ajuste e sinal elétrico',
    shortLabel: 'sensor/elétrica',
    regex: /sensor|encoder|cabo|rele|fusivel|drive/
  },
  {
    key: 'pneumatica',
    label: 'verificar mangueira, válvula, cilindro e pressão de ar',
    shortLabel: 'pneumática',
    regex: /mangueira|valvula|cilindro|pneumat|pressao de ar/
  },
  {
    key: 'limpeza',
    label: 'limpar o conjunto e remover resíduos que impedem o movimento',
    shortLabel: 'limpeza',
    regex: /limp|residuo|refilo|sujeira/
  }
];

function cleanHistoricalResolution(value = '') {
  return String(value || '')
    .replace(/problema\s*:[\s\S]*?(?=poss[ií]vel resolu[cç][aã]o\s*:|$)/gi, '')
    .replace(/poss[ií]vel resolu[cç][aã]o\s*:/gi, '')
    .replace(/aten[cç][aã]o\s*:[\s\S]*$/gi, '')
    .replace(/\b(verificar|analisar|avaliar)\s+a\s+causa\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;.-]+|[\s,;.-]+$/g, '')
    .trim();
}

function historicalResolutionCandidates(orders = []) {
  const candidates = [];

  orders.forEach(order => {
    const sources = [
      order.solution,
      extractHistorySection(order.comment || '', 'resolucao'),
      order.comment
    ];

    for (const source of sources) {
      const cleaned = cleanHistoricalResolution(source);

      if (
        cleaned.length >= 8 &&
        !/^(sem solu[cç][aã]o|n[aã]o informado|n[aã]o definido)$/i.test(cleaned)
      ) {
        candidates.push(cleaned);
        break;
      }
    }
  });

  return candidates;
}

function normalizeResolutionSignature(value = '') {
  return normalizeKey(value)
    .replace(/\b(foi|foram|realizado|realizada|efetuado|efetuada)\b/g, '')
    .replace(/\b(verificar|conferir|avaliar)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rankHistoricalResolutionTexts(orders = []) {
  const grouped = new Map();

  historicalResolutionCandidates(orders).forEach(text => {
    const signature = normalizeResolutionSignature(text);
    if (!signature) return;

    const existing = grouped.get(signature);

    if (existing) {
      existing.count += 1;
      if (text.length < existing.text.length) existing.text = text;
    } else {
      grouped.set(signature, {
        signature,
        text,
        count: 1
      });
    }
  });

  return [...grouped.values()]
    .sort((a, b) =>
      b.count - a.count ||
      a.text.length - b.text.length
    )
    .slice(0, 5);
}

function countHistorySolutionPatterns(orders = []) {
  const counts = new Map();

  orders.forEach(order => {
    const text = normalizeKey(historicalResolutionText(order));

    HISTORY_SOLUTION_PATTERNS.forEach(pattern => {
      if (!pattern.regex.test(text)) return;

      counts.set(pattern.key, {
        ...pattern,
        count: (counts.get(pattern.key)?.count || 0) + 1
      });
    });
  });

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 5);
}

function analyzeMachineHistoryForAction(action) {
  const machineHistoryEntry =
    state.sgmanMachineHistory?.[action.machine] || {};

  const machineOrders = (machineHistoryEntry.orders || [])
    .filter(order =>
      orderBelongsToMachineTree(
        order,
        action.machine,
        machineHistoryEntry.tag || ''
      )
    )
    .slice(0, 100);

  const childTags = Array.isArray(machineHistoryEntry.childTags)
    ? machineHistoryEntry.childTags
    : uniqueStrings(
        machineOrders.map(order => machineTreeLabel(order))
      );

  const completedOrders = machineOrders
    .filter(order => order.statusKey === 'completed');

  const currentProblem = action.description || '';

  const scored = completedOrders
    .map(order => ({
      order,
      score: historySimilarityScore(currentProblem, order)
    }))
    .filter(item => item.score >= MIN_HISTORY_SIMILARITY_SCORE)
    .sort((a, b) =>
      b.score - a.score ||
      String(b.order.endDate || b.order.startDate)
        .localeCompare(String(a.order.endDate || a.order.startDate))
    );

  // Usa somente as melhores referências. Incluir dezenas de OS pouco
  // parecidas torna a resposta genérica.
  const bestScore = scored[0]?.score || 0;
  const acceptedScored = scored.filter(item =>
    item.score >= Math.max(
      MIN_HISTORY_SIMILARITY_SCORE,
      bestScore - 20
    )
  );

  const similarOrders = acceptedScored
    .slice(0, 20)
    .map(item => item.order);

  const patterns = countHistorySolutionPatterns(similarOrders);
  const rankedTexts = rankHistoricalResolutionTexts(similarOrders);

  const strongPatterns = patterns.filter(pattern =>
    pattern.count >= 2 ||
    (
      similarOrders.length <= 3 &&
      pattern.count === 1
    )
  );

  const strongTexts = rankedTexts.filter(item =>
    item.count >= 2 ||
    (
      similarOrders.length <= 3 &&
      item.count === 1
    )
  );

  const confidence =
    similarOrders.length >= 5 && bestScore >= 50
      ? 'alta'
      : similarOrders.length >= MIN_SIMILAR_ORDERS_FOR_CONFIDENT_RESOLUTION
        ? 'média'
        : 'baixa';

  let resolutionParts = [];

  // Primeiro usa os textos reais mais repetidos das conclusões.
  strongTexts.slice(0, 2).forEach(item => {
    resolutionParts.push(
      item.count > 1
        ? `${item.text} (${item.count}x)`
        : item.text
    );
  });

  // Completa apenas com padrões técnicos recorrentes ainda não citados.
  strongPatterns.forEach(pattern => {
    const alreadyCovered = resolutionParts.some(text =>
      normalizeKey(text).includes(normalizeKey(pattern.shortLabel)) ||
      pattern.regex.test(normalizeKey(text))
    );

    if (!alreadyCovered && resolutionParts.length < 3) {
      resolutionParts.push(
        `${pattern.label}${pattern.count > 1 ? ` (${pattern.count}x)` : ''}`
      );
    }
  });

  const enoughEvidence =
    similarOrders.length >= MIN_SIMILAR_ORDERS_FOR_CONFIDENT_RESOLUTION &&
    resolutionParts.length > 0;

  let resolution;

  if (enoughEvidence) {
    resolution = resolutionParts
      .slice(0, 3)
      .map(value =>
        String(value).trim().replace(/[.;]+$/, '')
      )
      .join('; ');
  } else {
    resolution =
      'Analisar e resolver o problema durante o turno. Registrar a causa e a solução no SGMan.';
  }

  const compactPatterns = strongPatterns
    .slice(0, 3)
    .map(pattern => `${pattern.shortLabel} ${pattern.count}x`)
    .join(', ');

  let summary;

  if (!machineOrders.length) {
    summary =
      `${action.machine}: nenhuma OS da própria máquina foi retornada pelo SGMan.`;
  } else if (!completedOrders.length) {
    summary =
      `${action.machine}: ${machineOrders.length} OS consultada(s), sem conclusão técnica disponível.`;
  } else if (!similarOrders.length) {
    summary =
      `${action.machine}: ${machineOrders.length} OS analisadas; nenhuma ocorrência realmente semelhante ao problema atual.`;
  } else {
    const treeText = childTags.length > 1
      ? ` em ${childTags.length} TAGs da árvore`
      : ' na árvore da máquina';

    summary =
      `${action.machine}: ${similarOrders.length} referência(s) realmente semelhante(s) entre ${machineOrders.length} OS${treeText}, confiança ${confidence}` +
      (compactPatterns ? ` — ${compactPatterns}.` : '.');
  }

  return {
    machine: action.machine,
    rootTag: machineHistoryEntry.tag || '',
    treeMode: true,
    childTags,
    treeTagCount: childTags.length,
    totalMachineOrders: machineOrders.length,
    completedMachineOrders: completedOrders.length,
    similarOrders: similarOrders.length,
    bestSimilarityScore: bestScore,
    confidence,
    enoughEvidence,
    patterns: strongPatterns,
    rankedTexts: strongTexts,
    summary,
    resolution: resolution.endsWith('.') ? resolution : `${resolution}.`
  };
}

function renderSgmanMachineAnalysis() {
  const target = $('sgmanMachineAnalysisList');
  const status = $('sgmanMachineAnalysisStatus');

  if (!target) return;

  const maintenanceActions = state.actions.filter(action =>
    action.department === 'maintenance' &&
    /^MK-/.test(action.machine)
  );

  if (!maintenanceActions.length) {
    target.innerHTML =
      '<p class="muted">Nenhuma máquina com ação de manutenção neste relatório.</p>';
    return;
  }

  target.innerHTML = maintenanceActions.map(action => {
    const analysis = action.sgmanHistoryAnalysis;

    if (!analysis) {
      return `
        <div class="machine-history-card">
          <strong>${escapeHtml(action.machine)}</strong>
          <p class="muted">Aguardando análise das OS da própria máquina.</p>
        </div>`;
    }

    const patternHtml = analysis.patterns?.length
      ? `<div class="machine-history-patterns">${
          analysis.patterns.slice(0, 5).map(pattern => `
            <span>${escapeHtml(pattern.shortLabel)} <strong>${pattern.count}x</strong></span>
          `).join('')
        }</div>`
      : '';

    return `
      <div class="machine-history-card">
        <div class="machine-history-title">
          <strong>${escapeHtml(action.machine)}</strong>
          <span>${analysis.similarOrders}/${analysis.totalMachineOrders} semelhantes • confiança ${escapeHtml(analysis.confidence || 'baixa')}</span>
        </div>
        <p><strong>Problema atual:</strong> ${escapeHtml(action.description)}</p>
        <p><strong>Escopo:</strong> árvore completa da ${escapeHtml(action.machine)}${analysis.rootTag ? ` • TAG raiz ${escapeHtml(analysis.rootTag)}` : ''}${analysis.treeTagCount ? ` • ${analysis.treeTagCount} TAG(s) encontradas` : ''}</p>
        <p>${escapeHtml(analysis.summary)}</p>
        ${patternHtml}
        <p><strong>Possível resolução:</strong> ${escapeHtml(analysis.resolution)}</p>
      </div>`;
  }).join('');

  if (status && !state.sgmanMachineHistoryLoading) {
    status.textContent =
      'Referência feita com toda a árvore da máquina no SGMan e somente problemas semelhantes.';
  }
}

function completedOrdersForAction(action) {
  return machineHistoryForMachine(action.machine)
    .filter(order => order.statusKey === 'completed')
    .slice(0, 100);
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
  const analysis =
    action.sgmanHistoryAnalysis ||
    analyzeMachineHistoryForAction(action);

  return analysis.resolution;
}

function applySgmanHistoryToActions() {
  state.actions.forEach(action => {
    if (
      action.department !== 'maintenance' ||
      !/^MK-/.test(action.machine)
    ) {
      return;
    }

    action.baseAction = action.baseAction || action.action;
    action.sgmanHistoryAnalysis =
      analyzeMachineHistoryForAction(action);

    action.sgmanHistoryCount =
      action.sgmanHistoryAnalysis.totalMachineOrders;

    action.sgmanSimilarHistoryCount =
      action.sgmanHistoryAnalysis.similarOrders;

    action.sgmanSuggestedResolution =
      action.sgmanHistoryAnalysis.resolution;

    action.action = action.sgmanSuggestedResolution;
  });

  renderSgmanMachineAnalysis();
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

function compactSgmanReminders(value = '', maximumItems = 3, maximumLength = 220) {
  const raw = String(value || '')
    .replace(/\(\s*\d+\s+registros?\s*\)/gi, '')
    .replace(/\(\s*\d+\s+ocorr[eê]ncias?\s*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) {
    return 'verificar a causa; corrigir a falha; testar o funcionamento';
  }

  const parts = raw
    .split(/[;\n•]+/)
    .map(part => part
      .replace(/^[\s,.-]+|[\s,.;-]+$/g, '')
      .replace(/^(poss[ií]vel resolu[cç][aã]o|lembretes?)\s*:\s*/i, '')
      .trim()
    )
    .filter(Boolean);

  const unique = [];
  const seen = new Set();

  for (const part of parts) {
    const key = normalizeKey(part);

    if (!key || seen.has(key)) continue;

    seen.add(key);
    unique.push(part);

    if (unique.length >= maximumItems) break;
  }

  if (!unique.length) {
    unique.push('verificar a causa', 'corrigir a falha', 'testar o funcionamento');
  }

  let result = unique.join('; ');

  if (result.length > maximumLength) {
    result = result.slice(0, maximumLength);
    result = result.replace(/\s+\S*$/, '').replace(/[;,.\s]+$/, '');
  }

  return result;
}

function sgmanComment(action) {
  const analysis =
    action.sgmanHistoryAnalysis ||
    analyzeMachineHistoryForAction(action);

  if (!analysis.enoughEvidence) {
    return 'Lembrete: diagnosticar no local antes de trocar componentes.';
  }

  return `Lembretes: ${compactSgmanReminders(
    analysis.resolution,
    3,
    220
  )}.`;
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
      descricao: `${action.machine} - ${
        compactIssue(action.description || '') ||
        'Falha técnica identificada'
      }`.slice(0, 500),
      comentario: sgmanComment(action).slice(0, 260),
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
  safeStorageSet(
    STORAGE.sgmanConfirmed,
    JSON.stringify([...new Set(ids)].slice(-500))
  );
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

function setAnalysisRunStatus(message = '', type = '') {
  const target = $('analysisRunStatus');
  if (!target) return;

  target.textContent = message;
  target.className = `analysis-run-status${type ? ` ${type}` : ''}`;
}

function saveOrUpdateAnalysisHistory(analysis, actions) {
  const history = getHistory();
  const record = {
    id: analysis.id,
    date: analysis.date,
    shift: analysis.shift,
    crew: analysis.crew,
    responsibleCrew: analysis.responsibleCrew,
    realized: analysis.realized,
    reportedOee: analysis.reportedOee,
    analysis: compactAnalysisForStorage(analysis),
    actions: Array.isArray(actions)
      ? actions.map(compactActionForStorage)
      : []
  };

  const existingIndex = history.findIndex(item => item.id === analysis.id);

  if (existingIndex >= 0) {
    history[existingIndex] = record;
  } else {
    history.unshift(record);
  }

  saveHistory(history);
}

async function updateCurrentAnalysisWithSgman(analysisId) {
  if (!analysisId) return;

  state.backgroundAnalysisId = analysisId;
  setAnalysisRunStatus(
    'Relatório analisado. Atualizando SGMan e histórico das máquinas em segundo plano...',
    'loading'
  );

  try {
    await refreshSgmanHistory(false);

    if (!state.analysis || state.analysis.id !== analysisId) return;

    state.analysis.sgmanSummary = {
      ...(state.sgmanHistory?.summary || {})
    };
    state.analysis.reliability3Days = {
      ...calculateReliability3Days()
    };

    await loadSgmanMachineHistories(state.actions, false);

    if (!state.analysis || state.analysis.id !== analysisId) return;

    applySgmanHistoryToActions();

    try {
      saveOrUpdateAnalysisHistory(state.analysis, state.actions);
    } catch (storageError) {
      console.warn(
        'Referências atualizadas sem salvar o histórico local:',
        storageError
      );
    }

    renderAnalysis();
    renderActions();
    renderHistory();
    renderOeeDashboard();

    setAnalysisRunStatus(
      'Análise concluída e referências do SGMan atualizadas.',
      'success'
    );
  } catch (error) {
    if (!state.analysis || state.analysis.id !== analysisId) return;

    try {
      saveOrUpdateAnalysisHistory(state.analysis, state.actions);
    } catch (storageError) {
      console.warn(
        'Relatório mantido aberto sem salvar o histórico local:',
        storageError
      );
    }

    renderAnalysis();
    renderActions();
    renderHistory();

    setAnalysisRunStatus(
      `O relatório foi analisado, mas o SGMan não atualizou: ${error.message}`,
      'warning'
    );
  } finally {
    if (state.backgroundAnalysisId === analysisId) {
      state.backgroundAnalysisId = '';
    }
  }
}

async function analyzeCurrentReport() {
  if (state.reportAnalyzing) {
    showToast('A análise já está em andamento.');
    return;
  }

  const button = $('analyzeBtn');
  const originalButtonText = button?.textContent || 'Analisar relatório';

  try {
    state.reportAnalyzing = true;

    if (button) {
      button.disabled = true;
      button.textContent = 'Analisando...';
    }

    setAnalysisRunStatus('Lendo o relatório...', 'loading');

    const text = $('reportText').value.trim();

    const hasOeeInput=
      machineOeeFromEditor().length>0 ||
      Boolean($('oeeImageInput')?.files?.[0]) ||
      Boolean($('oeeOcrText')?.value.trim());

    if (!text && !hasOeeInput) {
      setAnalysisRunStatus(
        'Informe o relatório da produção ou carregue a foto do OEE.',
        'error'
      );
      showToast('Informe o relatório ou carregue a foto do OEE.');
      return;
    }

    let editorValues = machineOeeFromEditor();
    const file = $('oeeImageInput')?.files?.[0];

    const pendingOeeConfirmation=()=>(
      state.oeeMachineEditorData||[]
    ).filter(row=>
      row.needsConfirmation===true &&
      row.candidateOee!==undefined &&
      row.candidateOee!==''
    );

    if (!editorValues.length && file) {
      setAnalysisRunStatus('Lendo a foto do quadro de OEE...', 'loading');
      await processOeeColumnPhoto();
      editorValues = machineOeeFromEditor();
    }

    const pendingRows=pendingOeeConfirmation();

    // V87: OCR nunca bloqueia o relatório.
    // Valores duvidosos são simplesmente ignorados até confirmação.
    if(pendingRows.length){
      console.warn(
        `${pendingRows.length} OEE duvidoso(s) foram ignorados na prioridade automática.`
      );
    }

    const oeeText = editorValues.length
      ? editorOeeText()
      : ($('oeeOcrText')?.value.trim() || '');

    $('oeeOcrText').value = oeeText;
    state.oeeOcrText = oeeText;

    setAnalysisRunStatus('Montando a análise do turno...', 'loading');

    const scheduleInfo = detectOperationalShift(
      $('reportReceivedAt').value,
      $('reportDate').value,
      $('reportShift').value,
      state.manualSchedule
    );

    const analysis = parseReport(
      text || 'Relatório de produção não informado. Análise baseada no OEE disponível.',
      scheduleInfo
    );
    analysis.oeeOcrText = oeeText;
    analysis.machineOee = editorValues.length
      ? editorValues
      : extractAllMachineOeeFromText(oeeText);
    analysis.lowOeeMachines = analysis.machineOee
      .filter(item => item.oee < 65)
      .sort((a, b) => a.oee - b.oee);

    // Usa imediatamente o último cache disponível. A atualização online
    // acontece depois, sem impedir o relatório de abrir.
    analysis.sgmanSummary = {
      ...(state.sgmanHistory?.summary || {})
    };
    analysis.reliability3Days = {
      ...calculateReliability3Days()
    };

    state.analysis = analysis;
    state.actions = generateActions(analysis);

    // Novo turno/análise: recalcula as prioridades com o quadro atual
    // e o relatório da produção. Não reutiliza máquina do turno anterior.
    try{
      localStorage.removeItem(supervisorPriorityStorageKey());
    }catch{}
    state.supervisorFusionRows=supervisorFusionRanking(5);
    if(!state.supervisorFusionRows.length){
      state.supervisorFusionRows=fallbackCurrentShiftPriorities(3);
    }
    state.supervisorFusionRows=applyAutomaticSupervisorSelection(
      state.supervisorFusionRows
    );

    // Aplica histórico já armazenado no aparelho, quando existir.
    applySgmanHistoryToActions();

    try {
      saveOrUpdateAnalysisHistory(analysis, state.actions);
    } catch (storageError) {
      console.warn(
        'A análise continuará sem salvar o histórico local:',
        storageError
      );
    }

    try {
      localStorage.removeItem(STORAGE.draft);
    } catch {
      // Sem ação.
    }

    renderAnalysis();
    renderActions();
    renderHistory();
    renderOeeDashboard();
    switchView('analise');

    setAnalysisRunStatus(
      'Relatório analisado. Atualizando as referências do SGMan...',
      'success'
    );
    showToast('Relatório analisado.');

    // Não usa await: o botão e a tela não ficam presos nas consultas.
    updateCurrentAnalysisWithSgman(analysis.id);
  } catch (error) {
    console.error('Falha ao analisar relatório:', error);
    const quotaFailure = isStorageQuotaError(error);

    if (quotaFailure) {
      clearLargeLegacyCaches();
    }

    setAnalysisRunStatus(
      quotaFailure
        ? 'O armazenamento antigo foi limpo. Toque novamente em Analisar relatório.'
        : `Não foi possível analisar: ${error.message}`,
      'error'
    );
    showToast('Falha ao analisar o relatório.');
  } finally {
    state.reportAnalyzing = false;

    if (button) {
      button.disabled = false;
      button.textContent = originalButtonText;
    }
  }
}


function scaleExecutantesOnly() {
  const users = [];

  ['A1', 'A2', 'B1', 'B2'].forEach(crew => {
    const record = getScaleRecord(crew);
    findSgmanTeamExecutantes(crew).forEach(username => {
      users.push({
        username,
        label: sgmanUserLabel(username),
        crew,
        leader: username === record.sgmanExecutante
      });
    });
  });

  const seen = new Set();

  return users.filter(user => {
    const key = String(user.username || '').toLocaleLowerCase('pt-BR');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function populateFocusedFilters() {
  const machineSelect = $('focusedMachineFilter');
  const mechanicSelect = $('focusedMechanicFilter');

  if (machineSelect) {
    const current = machineSelect.value;
    const machines = configuredMachineCodes()
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

    machineSelect.innerHTML = `
      <option value="">Todas as máquinas</option>
      ${machines.map(machine => `
        <option value="${escapeHtml(machine)}">${escapeHtml(machine)}</option>
      `).join('')}
    `;

    if (machines.includes(current)) machineSelect.value = current;
  }

  if (mechanicSelect) {
    const current = mechanicSelect.value;
    const users = scaleExecutantesOnly();

    mechanicSelect.innerHTML = `
      <option value="">Todos os mecânicos da escala</option>
      ${users.map(user => `
        <option value="${escapeHtml(user.username)}">
          ${escapeHtml(user.label)} — ${escapeHtml(user.crew)}
        </option>
      `).join('')}
    `;

    if (users.some(user => user.username === current)) {
      mechanicSelect.value = current;
    }
  }
}

function focusedConversationMachines(text = '') {
  return uniqueStrings(
    String(text || '')
      .split(/\n+/)
      .map(line => machineKeyFromText(line))
      .filter(Boolean)
  );
}

function focusedConversationSummary() {
  const actions = (state.actions || [])
    .filter(action =>
      action.department === 'maintenance' &&
      action.status !== 'Concluída'
    )
    .slice(0, 10);

  if (!actions.length) {
    return '<p class="muted">Cole as conversas do grupo e toque em “Analisar e atualizar planos”.</p>';
  }

  return actions.map(action => `
    <div class="focused-conversation-item">
      <strong>${escapeHtml(action.machine)}</strong>
      <span>${escapeHtml(action.description || 'Ocorrência registrada no grupo')}</span>
      <small>${escapeHtml(
        conciseMaintenanceRepairActions
          ? conciseMaintenanceRepairActions(action)
          : 'Analisar e resolver o problema durante o turno.'
      )}</small>
    </div>
  `).join('');
}

function mechanicDevelopmentFor(username = '') {
  const team = state.teamPerformance?.length
    ? state.teamPerformance
    : calculateTeamPerformance();

  return team.find(row =>
    String(row.executante).toLocaleLowerCase('pt-BR') ===
    String(username).toLocaleLowerCase('pt-BR')
  ) || null;
}

function renderFocusedPreventivePlan() {
  const machineFilter = $('focusedMachineFilter')?.value || '';
  const mechanicFilter = $('focusedMechanicFilter')?.value || '';

  const metrics = state.reliability3Days || calculateReliability3Days();
  const preventive = buildPreventivePlan(metrics);
  const improvements = buildImprovementPlan(metrics);
  const team = calculateTeamPerformance();

  const preventiveTarget = $('focusedPreventiveList');
  const mechanicTarget = $('focusedMechanicPlan');
  const conversationTarget = $('focusedConversationAnalysis');
  const status = $('focusedPlanStatus');

  let preventiveRows = preventive;

  if (machineFilter) {
    preventiveRows = preventiveRows.filter(item =>
      item.machine === machineFilter
    );
  }

  if (preventiveTarget) {
    preventiveTarget.innerHTML = preventiveRows.length
      ? preventiveRows.map(item => `
          <article class="focused-plan-card">
            <div class="focused-plan-head">
              <div>
                <strong>${escapeHtml(item.machine)}</strong>
                <span>${escapeHtml(item.frequency)}</span>
              </div>
              <span class="focused-risk">
                ${item.failureCount >= 5 ? 'Risco alto' :
                  item.failureCount >= 3 ? 'Risco médio' : 'Acompanhar'}
              </span>
            </div>
            <p>
              ${item.failureCount} falha(s) •
              MTTR ${escapeHtml(formatReliabilityTime(item.mttrMinutes, '-'))} •
              MTBF ${escapeHtml(formatReliabilityTime(item.mtbfMinutes, '-'))}
            </p>
            <h4>Preventiva sugerida</h4>
            <ol>
              ${item.actions.map(action => `<li>${escapeHtml(action)}</li>`).join('')}
            </ol>
          </article>
        `).join('')
      : '<p class="muted">Nenhum plano preventivo encontrado para o filtro selecionado.</p>';
  }

  const scaleUsers = scaleExecutantesOnly();
  const filteredUsers = mechanicFilter
    ? scaleUsers.filter(user => user.username === mechanicFilter)
    : scaleUsers;

  if (mechanicTarget) {
    mechanicTarget.innerHTML = filteredUsers.length
      ? filteredUsers.map(user => {
          const row = mechanicDevelopmentFor(user.username);
          const mentor = row?.trainingCategory
            ? findMentorForCategory(row.trainingCategory, team)
            : null;

          const machinePlan = improvements.find(plan =>
            !machineFilter || plan.machine === machineFilter
          );

          return `
            <article class="focused-mechanic-card">
              <div class="focused-plan-head">
                <div>
                  <strong>${escapeHtml(user.label)}</strong>
                  <span>Equipe ${escapeHtml(user.crew)}${user.leader ? ' • líder' : ''}</span>
                </div>
                <span class="${row?.needsTraining ? 'training-badge' : 'specialist-badge'}">
                  ${row?.needsTraining ? 'Desenvolver' : 'Acompanhar'}
                </span>
              </div>

              <p>
                OS concluídas: ${Number(row?.completed || 0)} •
                MTTR: ${escapeHtml(formatReliabilityTime(row?.mttrMinutes, '-'))}
              </p>

              <h4>Plano de melhoria do mecânico</h4>
              <ol>
                <li>
                  ${row?.trainingCategory
                    ? `Treinamento prático em ${escapeHtml(row.trainingCategory)}`
                    : 'Melhorar o preenchimento da causa e da solução no SGMan'}
                </li>
                <li>
                  ${mentor && mentor.executante !== user.username
                    ? `Acompanhar uma intervenção com ${escapeHtml(mentor.label)}`
                    : 'Realizar intervenção acompanhada pelo líder da equipe'}
                </li>
                <li>
                  ${machinePlan
                    ? `Atuar no plano da ${escapeHtml(machinePlan.machine)} e comparar MTTR antes/depois`
                    : 'Selecionar uma máquina crítica e acompanhar a evolução do MTTR'}
                </li>
                <li>Registrar testes realizados e confirmar que a falha não voltou.</li>
              </ol>

              <small>
                ${row?.bestCategory
                  ? `Ponto forte identificado: ${escapeHtml(row.bestCategory)}.`
                  : 'Ainda não há dados suficientes para definir especialidade.'}
              </small>
            </article>
          `;
        }).join('')
      : '<p class="muted">Nenhum mecânico da escala corresponde ao filtro.</p>';
  }

  if (conversationTarget) {
    conversationTarget.innerHTML = focusedConversationSummary();
  }

  if (status) {
    const conversationText = $('focusedGroupConversation')?.value || '';
    const machines = focusedConversationMachines(conversationText);

    status.textContent =
      `Planos atualizados • ${preventiveRows.length} máquina(s) • ` +
      `${filteredUsers.length} mecânico(s) da escala` +
      (machines.length ? ` • Conversa citou: ${machines.join(', ')}` : '');
  }
}

async function analyzeFocusedManagementPage() {
  const button = $('focusedAnalyzeBtn');
  const text = $('focusedGroupConversation')?.value.trim() || '';

  if (!text) {
    showToast('Cole as conversas do grupo.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Analisando...';
  $('focusedPlanStatus').textContent =
    'Lendo as conversas e consultando os dados do SGMan...';

  try {
    $('reportText').value = text;
    safeStorageSet(STORAGE.draft, text);
    $('reportReceivedAt').value = toLocalDateTimeInput(new Date());

    await analyzeCurrentReport();
    await refreshSgmanHistory(true);

    if (state.actions?.length) {
      await loadSgmanMachineHistories(state.actions, true);
      applySgmanHistoryToActions();
    }

    state.reliability3Days = calculateReliability3Days();
    populateFocusedFilters();
    renderFocusedPreventivePlan();

      switchView('planos');
    showToast('Planos atualizados.');
  } catch (error) {
    $('focusedPlanStatus').textContent =
      `Não foi possível atualizar os planos: ${error.message}`;
    showToast('Falha ao atualizar os planos.');
  } finally {
    button.disabled = false;
    button.textContent = 'Analisar e atualizar planos';
  }
}

function initFocusedManagementPage() {
  const root = $('view-inteligencia');
  if (!root) return;

  if (root.dataset.initialized === 'true') {
    renderFocusedPreventivePlan();
    renderIntelligenceReport();
    return;
  }

  root.dataset.initialized = 'true';

  try {

  populateFocusedFilters();

  const conversation = $('focusedGroupConversation');
  const saved = localStorage.getItem('turnosmart_group_conversation_v1');
  if (conversation && saved) conversation.value = saved;

  $('focusedAnalyzeBtn')?.addEventListener(
    'click',
    analyzeFocusedManagementPage
  );

  $('focusedGroupConversation')?.addEventListener('input', event => {
    safeStorageSet(
      'turnosmart_group_conversation_v1',
      compactTextForStorage(event.target.value, 50000)
    );
  });

  $('focusedMachineFilter')?.addEventListener(
    'change',
    renderFocusedPreventivePlan
  );

  $('focusedMechanicFilter')?.addEventListener(
    'change',
    renderFocusedPreventivePlan
  );

  $('focusedRefreshBtn')?.addEventListener('click', async () => {
    const button = $('focusedRefreshBtn');
    button.disabled = true;
    button.textContent = 'Atualizando...';

    try {
      await refreshSgmanHistory(true);
      state.reliability3Days = calculateReliability3Days();
      populateFocusedFilters();
      renderFocusedPreventivePlan();
      showToast('Dados do SGMan atualizados.');
    } finally {
      button.disabled = false;
      button.textContent = 'Atualizar SGMan';
    }
  });

  renderFocusedPreventivePlan();

    initTurnIntelligence().catch(error => {
      console.error('Falha no módulo Inteligência:', error);
      const status = $('focusedPlanStatus');
      if (status) {
        status.textContent =
          `Falha parcial na Inteligência: ${error.message}.`;
      }
    });
  } catch (error) {
    root.dataset.initialized = 'false';
    throw error;
  }
}


const INTELLIGENCE_HISTORY_KEY = 'turnosmart_intelligence_history_v1';

function getIntelligenceHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(INTELLIGENCE_HISTORY_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveIntelligenceHistory(items = []) {
  const compact = items.slice(0, 180).map(item => ({
    id: item.id,
    date: item.date,
    shift: item.shift,
    reportedOee: item.reportedOee,
    machineOee: Array.isArray(item.machineOee)
      ? item.machineOee.slice(0, 40)
      : [],
    machinesFromConversation: Array.isArray(item.machinesFromConversation)
      ? item.machinesFromConversation.slice(0, 30)
      : [],
    conversationSummary: compactTextForStorage(item.conversationSummary || '', 5000),
    createdAt: item.createdAt
  }));

  safeStorageSet(
    INTELLIGENCE_HISTORY_KEY,
    JSON.stringify(compact),
    { removeOnFailure: true }
  );
}

async function loadHistoricGroupSeed() {
  if (state.intelligenceSeed) return state.intelligenceSeed;

  try {
    const response = await fetch('/historico-grupo.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.intelligenceSeed = await response.json();
  } catch {
    state.intelligenceSeed = {
      messageCount: 0,
      reportCount: 0,
      oeeCount: 0,
      oeeAverage: null,
      machineOccurrences: [],
      problemOccurrences: []
    };
  }

  return state.intelligenceSeed;
}

function renderIntelligenceHistoricSeed() {
  const target = $('intelligenceHistoricSummary');
  if (!target) return;

  const seed = state.intelligenceSeed || {};
  const machines = (seed.machineOccurrences || []).slice(0, 8);
  const problems = (seed.problemOccurrences || []).slice(0, 8);

  target.innerHTML = `
    <div class="intelligence-seed-metrics">
      <div class="metric">
        <span>Mensagens processadas</span>
        <strong>${Number(seed.messageCount || 0).toLocaleString('pt-BR')}</strong>
        <small>Histórico do grupo enviado</small>
      </div>
      <div class="metric">
        <span>Relatórios encontrados</span>
        <strong>${Number(seed.reportCount || 0).toLocaleString('pt-BR')}</strong>
        <small>Relatórios de produção identificados</small>
      </div>
      <div class="metric">
        <span>OEE histórico médio</span>
        <strong>${seed.oeeAverage == null ? '-' : `${String(seed.oeeAverage).replace('.', ',')}%`}</strong>
        <small>${Number(seed.oeeCount || 0).toLocaleString('pt-BR')} leituras reconhecidas</small>
      </div>
    </div>

    <div class="grid two">
      <div>
        <h4>Máquinas mais citadas no grupo</h4>
        <div class="intelligence-ranking">
          ${machines.map((item, index) => `
            <div><span>${index + 1}. ${escapeHtml(item.machine)}</span><strong>${item.count}</strong></div>
          `).join('') || '<p class="muted">Sem dados.</p>'}
        </div>
      </div>
      <div>
        <h4>Problemas mais citados</h4>
        <div class="intelligence-ranking">
          ${problems.map((item, index) => `
            <div><span>${index + 1}. ${escapeHtml(item.problem)}</span><strong>${item.count}</strong></div>
          `).join('') || '<p class="muted">Sem dados.</p>'}
        </div>
      </div>
    </div>`;
}

function renderIntelligenceOeeEditor(rows = []) {
  const target = $('intelligenceOeeEditor');
  if (!target) return;

  state.intelligenceOeeRows = rows.length
    ? rows
    : OEE_BOARD_MACHINES.map(machine => ({
        machine,
        oee: '',
        confidence: 0
      }));

  target.innerHTML = `
    <div class="oee-editor-head">
      <strong>Confirme os valores do quadro</strong>
      <span class="muted">Deixe vazio quando a máquina não trabalhou.</span>
    </div>
    <div class="intelligence-oee-grid">
      ${state.intelligenceOeeRows.map((row, index) => `
        <label class="intelligence-oee-row">
          <span>${escapeHtml(row.machine)}</span>
          <input
            data-intelligence-oee="${index}"
            type="number"
            min="0"
            max="100"
            step="0.1"
            inputmode="decimal"
            value="${row.oee === '' ? '' : escapeHtml(String(row.oee))}"
            placeholder="-"
          />
          <small>${row.oee === '' ? 'Revisar' : `${Math.round(row.confidence || 0)}% confiança`}</small>
        </label>
      `).join('')}
    </div>`;

  $$('[data-intelligence-oee]').forEach(input => {
    input.addEventListener('input', event => {
      const index = Number(event.target.dataset.intelligenceOee);
      const raw = event.target.value.trim().replace(',', '.');
      const value = raw === '' ? '' : Number(raw);

      state.intelligenceOeeRows[index].oee =
        Number.isFinite(value) && value >= 0 && value <= 100
          ? value
          : '';

      state.intelligenceOeeRows[index].confidence = 100;
    });
  });
}

async function analyzeIntelligenceOeePhoto() {
  const input = $('intelligenceOeePhotos');
  const file = input?.files?.[0];

  if (!file) {
    showToast('Escolha uma foto do quadro de OEE.');
    return;
  }

  const status = $('intelligencePhotoStatus');
  const date = $('intelligenceDate')?.value || todayISO();
  const shift = $('intelligenceShift')?.value || '1';

  status.textContent = 'Preparando e lendo a foto do quadro...';

  try {
    const dataUrl = await dataUrlFromFile(file);
    state.intelligencePhotoName = file.name;

    const image = await loadImageElement(dataUrl);
    const processed = preprocessOeeColumn(image, date, shift);

    $('intelligencePhotoPreview').src = processed.previewDataUrl;
    $('intelligencePhotoPreviewWrap').classList.remove('hidden');

    state.oeeRowPreviews = processed.rowPreviews || [];

    if (!window.Tesseract) {
      throw new Error('Leitor OCR não carregado.');
    }

    const result = await window.Tesseract.recognize(
      processed.ocrDataUrl,
      'eng',
      {
        logger: info => {
          if (
            info.status === 'recognizing text' &&
            typeof info.progress === 'number'
          ) {
            status.textContent =
              `Lendo a coluna do quadro... ${Math.round(info.progress * 100)}%`;
          }
        }
      },
      {
        tessedit_char_whitelist: '0123456789%.,',
        tessedit_pageseg_mode: '11',
        preserve_interword_spaces: '1'
      }
    );

    const rows = mapOcrWordsToMachineRows(
      result?.data?.words || [],
      processed.canvas.height
    );

    renderIntelligenceOeeEditor(rows);

    const detected = rows.filter(row => row.oee !== '').length;
    status.textContent =
      `${detected} valor(es) sugerido(s). Confira a tabela antes de salvar.`;
  } catch (error) {
    console.warn(error);
    renderIntelligenceOeeEditor([]);
    status.textContent =
      'A leitura automática ficou incompleta. Preencha os valores manualmente usando a foto.';
  }
}

function currentIntelligenceMachineOee() {
  return (state.intelligenceOeeRows || [])
    .map(row => ({
      machine: row.machine,
      oee: row.oee === '' ? null : Number(row.oee)
    }))
    .filter(row =>
      Number.isFinite(row.oee) &&
      row.oee >= 0 &&
      row.oee <= 100
    );
}

function intelligenceTrendFromHistory(history = []) {
  const values = history
    .map(item => Number(item.reportedOee))
    .filter(value => Number.isFinite(value) && value > 0);

  if (!values.length) {
    return {
      direction: 'unknown',
      arrow: '➜',
      delta: null,
      current: null,
      previous: null
    };
  }

  const current = values[0];
  const previous = values[1] ?? null;
  const delta = previous == null ? null : current - previous;

  return {
    current,
    previous,
    delta,
    direction:
      delta == null ? 'unknown' :
      delta >= 0.5 ? 'up' :
      delta <= -0.5 ? 'down' : 'stable',
    arrow:
      delta == null ? '➜' :
      delta >= 0.5 ? '⬆' :
      delta <= -0.5 ? '⬇' : '➜'
  };
}

function buildIntelligenceReport() {
  const history = getIntelligenceHistory();
  const trend = intelligenceTrendFromHistory(history);
  const metrics = state.reliability3Days || calculateReliability3Days();
  const dashboard = getRecentOeeDashboard();
  const conversationText = $('focusedGroupConversation')?.value || '';
  const conversationMachines = focusedConversationMachines(conversationText);
  const preventive = buildPreventivePlan(metrics);
  const seed = state.intelligenceSeed || {};

  const currentMachineOee = currentIntelligenceMachineOee();
  const below65 = currentMachineOee
    .filter(item => item.oee < 65)
    .sort((a, b) => a.oee - b.oee);

  const historicalTopMachines = (seed.machineOccurrences || [])
    .slice(0, 10)
    .map(item => item.machine);

  const priorityPool = uniqueStrings([
    ...below65.map(item => item.machine),
    ...conversationMachines,
    ...(metrics.dailyPlan || []).map(item => item.machine),
    ...(dashboard.priorityMachines || []).map(item => item.machine),
    ...historicalTopMachines
  ]);

  const priorities = priorityPool.slice(0, 5).map(machine => {
    const preventiveItem = preventive.find(item => item.machine === machine);
    const currentOee = currentMachineOee.find(item => item.machine === machine);
    const metric = (metrics.rows || []).find(item => item.machine === machine);

    return {
      machine,
      oee: currentOee?.oee ?? null,
      mttrMinutes: metric?.mttrMinutes ?? null,
      mtbfMinutes: metric?.mtbfMinutes ?? null,
      failures: metric?.failureCount ?? 0,
      actions: preventiveItem?.actions?.slice(0, 3) || [
        'analisar e resolver o problema durante o turno',
        'registrar a causa e a solução no SGMan',
        'confirmar estabilidade antes da liberação'
      ]
    };
  });

  let directionText = 'Sem comparação anterior.';
  if (trend.delta != null) {
    const delta = Math.abs(trend.delta).toFixed(1).replace('.', ',');
    directionText =
      trend.direction === 'up'
        ? `Melhora de ${delta} ponto(s).`
        : trend.direction === 'down'
          ? `Piora de ${delta} ponto(s).`
          : 'Eficiência estável.';
  }

  return {
    generatedAt: new Date().toISOString(),
    trend,
    directionText,
    priorities,
    below65,
    conversationMachines,
    historicAverage: seed.oeeAverage ?? null,
    historicReports: seed.reportCount ?? 0,
    currentShiftCompleted: metrics.completedCurrentShift || 0,
    mttrMinutes: metrics.mttrMinutes,
    mtbfMinutes: metrics.mtbfMinutes,
    reliabilityPercent: metrics.reliabilityPercent,
    preventive
  };
}

function renderIntelligenceReport() {
  const target = $('intelligenceReport');
  if (!target) return;

  const report = buildIntelligenceReport();
  state.intelligenceReport = report;

  target.innerHTML = `
    <div class="intelligence-report-header">
      <div>
        <span class="eyebrow">RELATÓRIO INTELIGÊNCIA DO TURNO</span>
        <h3>${escapeHtml(report.trend.arrow)} ${escapeHtml(report.directionText)}</h3>
      </div>
      <span>${new Date(report.generatedAt).toLocaleString('pt-BR')}</span>
    </div>

    <div class="intelligence-report-metrics">
      <div class="metric">
        <span>MTTR</span>
        <strong>${escapeHtml(formatReliabilityTime(report.mttrMinutes, '-'))}</strong>
        <small>SGMan — paradas reais</small>
      </div>
      <div class="metric">
        <span>MTBF</span>
        <strong>${escapeHtml(formatReliabilityTime(report.mtbfMinutes, '-'))}</strong>
        <small>Máquina completa</small>
      </div>
      <div class="metric">
        <span>Confiabilidade 12h</span>
        <strong>${escapeHtml(formatReliabilityPercent(report.reliabilityPercent, '-'))}</strong>
        <small>Estimativa do próximo turno</small>
      </div>
      <div class="metric">
        <span>OS concluídas no turno</span>
        <strong>${Number(report.currentShiftCompleted || 0)}</strong>
        <small>Até o horário atual</small>
      </div>
    </div>

    <h4>Prioridades do próximo turno</h4>
    <div class="intelligence-priority-list">
      ${report.priorities.length
        ? report.priorities.map((item, index) => `
            <article>
              <span class="priority-number">${index + 1}</span>
              <div>
                <strong>${escapeHtml(item.machine)}</strong>
                <p>
                  OEE ${item.oee == null ? '-' : escapeHtml(formatOee(item.oee))}
                  • ${item.failures} falha(s)
                  • MTTR ${escapeHtml(formatReliabilityTime(item.mttrMinutes, '-'))}
                  • MTBF ${escapeHtml(formatReliabilityTime(item.mtbfMinutes, '-'))}
                </p>
                <ol>
                  ${item.actions.map(action => `<li>${escapeHtml(action)}</li>`).join('')}
                </ol>
              </div>
            </article>
          `).join('')
        : '<p class="muted">Sem prioridades suficientes. Atualize foto, conversa e SGMan.</p>'}
    </div>

    <div class="reference-box">
      <strong>Base utilizada</strong>
      <p>
        Foto do quadro e lançamentos diários, conversas do grupo,
        ${Number(report.historicReports || 0).toLocaleString('pt-BR')} relatórios históricos identificados
        e dados atuais do SGMan.
      </p>
    </div>`;
}

function saveCurrentIntelligenceReading() {
  const date = $('intelligenceDate')?.value || todayISO();
  const shift = $('intelligenceShift')?.value || '1';
  const reportedOeeRaw = $('intelligenceGeneralOee')?.value || '';
  const reportedOee = Number(String(reportedOeeRaw).replace(',', '.'));
  const machineOee = currentIntelligenceMachineOee();
  const conversationText = $('focusedGroupConversation')?.value || '';

  if (
    !Number.isFinite(reportedOee) &&
    !machineOee.length &&
    !conversationText.trim()
  ) {
    showToast('Informe o OEE, confirme máquinas ou cole o relatório do grupo.');
    return;
  }

  const item = {
    id: `intelligence-${date}-${shift}-${Date.now()}`,
    date,
    shift,
    reportedOee: Number.isFinite(reportedOee) ? reportedOee : null,
    machineOee,
    machinesFromConversation: focusedConversationMachines(conversationText),
    conversationSummary: conversationText,
    createdAt: new Date().toISOString()
  };

  const history = getIntelligenceHistory();
  history.unshift(item);
  saveIntelligenceHistory(history);

  // Também alimenta o histórico padrão usado pelo painel de OEE.
  const analysis = {
    id: `oee-${date}-${shift}`,
    date,
    shift,
    crew: crewForReport(date, shift),
    responsibleCrew: responsibleCrewForReport(date, shift),
    realized: null,
    reportedOee: item.reportedOee,
    machineOee: item.machineOee,
    rawText: conversationText
  };

  saveOrUpdateAnalysisHistory(analysis, []);
  renderOeeDashboard();
  renderIntelligenceHistory();
  renderIntelligenceReport();
  showToast('Leitura diária salva no histórico.');
}

function renderIntelligenceHistory() {
  const target = $('intelligenceDailyHistory');
  if (!target) return;

  const history = getIntelligenceHistory();

  target.innerHTML = history.length
    ? history.slice(0, 20).map(item => `
        <div class="intelligence-history-row">
          <div>
            <strong>${escapeHtml(formatDate(item.date))} • Turno ${String(item.shift) === '2' ? 'B' : 'A'}</strong>
            <span>OEE geral: ${item.reportedOee == null ? '-' : escapeHtml(formatOee(item.reportedOee))}</span>
          </div>
          <small>${item.machineOee?.length || 0} máquina(s) • ${item.machinesFromConversation?.length || 0} citada(s) no grupo</small>
        </div>
      `).join('')
    : '<p class="muted">Nenhuma leitura diária salva ainda.</p>';
}

async function initTurnIntelligence() {
  $('intelligenceDate').value = todayISO();

  await loadHistoricGroupSeed();
  renderIntelligenceHistoricSeed();
  renderIntelligenceOeeEditor([]);
  renderIntelligenceHistory();
  renderIntelligenceReport();

  $('intelligenceReadPhotoBtn')?.addEventListener(
    'click',
    analyzeIntelligenceOeePhoto
  );

  $('intelligenceSaveBtn')?.addEventListener(
    'click',
    saveCurrentIntelligenceReading
  );

  $('intelligenceGenerateReportBtn')?.addEventListener('click', async () => {
    const button = $('intelligenceGenerateReportBtn');
    button.disabled = true;
    button.textContent = 'Atualizando...';

    try {
      await refreshSgmanHistory(true);
      state.reliability3Days = calculateReliability3Days();
      renderFocusedPreventivePlan();
      renderIntelligenceReport();
      showToast('Relatório inteligente atualizado.');
    } finally {
      button.disabled = false;
      button.textContent = 'Gerar relatório inteligente';
    }
  });
}


function trainingLocalItems(){try{return JSON.parse(localStorage.getItem(STORAGE.training)||'[]')||[]}catch{return[]}}
function trainingLocalProgress(){try{return JSON.parse(localStorage.getItem(STORAGE.trainingProgress)||'[]')||[]}catch{return[]}}
function saveTrainingLocal(){safeStorageSet(STORAGE.training,JSON.stringify(state.trainingItems.slice(0,500)),{removeOnFailure:true})}
function saveTrainingProgressLocal(){safeStorageSet(STORAGE.trainingProgress,JSON.stringify(state.trainingProgress.slice(0,2000)),{removeOnFailure:true})}
async function trainingApiRequest(method='GET',payload=null){const options={method,headers:{'Content-Type':'application/json'}};if(payload!==null)options.body=JSON.stringify(payload);const response=await fetch('/api/training',options);const data=await response.json().catch(()=>({}));if(!response.ok||data.ok===false)throw new Error(data.error||`Erro HTTP ${response.status}`);return data}
function trainingStatusLabel(status=''){return({draft:'Rascunho',active:'Ativo',review:'Em revisão',archived:'Arquivado'})[status]||status||'Ativo'}
function trainingProgressFor(id){return state.trainingProgress.filter(x=>String(x.trainingId)===String(id)&&x.status==='completed')}

function trainingMachines(){
  return configuredMachineCodes()
    .sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
}

function trainingMachineOptions(){
  return trainingMachines();
}

function trainingMachineType(machine=''){
  const code=normalizeMachineCode(machine);
  const numeric=Number(String(code).replace(/\D/g,''));

  const groups={
    bolo:[170,176,214,217,221,222],
    panetone:[69,138,149,172,173,178,179,188,192,212,220,223],
    pirotine:[2,8,105,108,112,160],
    pie:[159],
    tulip:[302,306],
    semi_acabado:[570,801]
  };

  for(const [type,codes] of Object.entries(groups)){
    if(codes.includes(numeric))return type;
  }

  return 'outros';
}

function trainingMachineTypeLabel(value=''){
  return ({
    bolo:'Bolo',
    panetone:'Panetone',
    pirotine:'Pirotine',
    pie:'PIE',
    tulip:'Tulip',
    semi_acabado:'Semiacabado',
    outros:'Outros'
  })[value]||value||'Outros';
}


function industrialComponentCatalog(){
  return {
    'Pneumática':[
      'Válvula direcional 3/2','Válvula direcional 5/2',
      'Válvula direcional 5/3','Bobina de válvula pneumática',
      'Cilindro pneumático','Cilindro guiado','Unidade FRL',
      'Filtro regulador','Pressostato','Vacuostato',
      'Gerador de vácuo','Ventosa','Regulador de fluxo',
      'Sensor magnético de cilindro'
    ],
    'Elétrica':[
      'Motor trifásico','Motor monofásico','Motor com freio',
      'Servomotor','Motor de passo','Contator','Relé auxiliar',
      'Relé térmico','Relé de segurança','Disjuntor motor',
      'Fusível','Fonte 24 VCC','Transformador',
      'Inversor de frequência','Soft starter','Encoder',
      'Resistência elétrica','Termopar','PT100'
    ],
    'Automação':[
      'CLP','IHM','Módulo de entrada digital',
      'Módulo de saída digital','Módulo analógico',
      'Sensor indutivo','Sensor capacitivo',
      'Sensor fotoelétrico','Sensor ultrassônico',
      'Sensor PNP','Sensor NPN','Chave de segurança',
      'Cortina de luz','Botão de emergência',
      'Rede Profinet','Rede Ethernet/IP','IO-Link'
    ],
    'Mecânica':[
      'Rolamento','Mancal de rolamento','Eixo','Bucha',
      'Retentor','Acoplamento','Correia','Polia','Corrente',
      'Pinhão','Engrenagem','Redutor','Guia linear',
      'Patim linear','Fuso','Porca de fuso','Came','Leva',
      'Mola','Faca','Contrafaca'
    ],
    'Hidráulica':[
      'Bomba hidráulica','Válvula direcional hidráulica',
      'Válvula de alívio','Cilindro hidráulico',
      'Filtro hidráulico','Acumulador hidráulico',
      'Trocador de calor'
    ],
    'Instrumentação':[
      'Manômetro','Multímetro','Alicate amperímetro',
      'Megômetro','Relógio comparador','Paquímetro',
      'Micrômetro','Tacômetro','Termômetro infravermelho',
      'Analisador de vibração'
    ]
  };
}

function industrialComponentOptions(){
  return Object.values(industrialComponentCatalog())
    .flat()
    .sort((a,b)=>a.localeCompare(b,'pt-BR'));
}

function industrialComponentGroup(component=''){
  const key=normalizeKey(component);
  for(const [group,items] of Object.entries(industrialComponentCatalog())){
    if(items.some(item=>normalizeKey(item)===key))return group;
  }
  return 'Geral';
}

function industrialTechnicalGuide(component=''){
  const key=normalizeKey(component);

  const generic={
    principle:'Identifique a função do componente no sistema e separe alimentação, comando, carga, montagem e condição física.',
    tools:'Multímetro, ferramentas adequadas, instrumentos de medição e documentação técnica.',
    steps:[
      'Ler placa, código, símbolo e identificação.',
      'Localizar o componente no diagrama e entender sua função.',
      'Aplicar bloqueio e eliminar energias residuais.',
      'Inspecionar conexões, fixações, desgaste, sujeira e vazamentos.',
      'Confirmar alimentação e comando.',
      'Testar o componente isolado quando for seguro.',
      'Testar novamente instalado e sob carga.',
      'Acompanhar estabilidade antes de liberar.'
    ],
    faults:[
      'Alimentação incorreta ou ausente.',
      'Mau contato.',
      'Desgaste ou contaminação.',
      'Desalinhamento.',
      'Montagem ou regulagem incorreta.'
    ]
  };

  if(key.includes('valvula direcional 5 3')){
    return {
      principle:'Válvula com cinco vias e três posições. P alimenta; A e B vão ao atuador; R e S são escapes. O centro depende do símbolo do modelo.',
      tools:'Multímetro, manômetro, fonte/comando compatível, spray detector de vazamento e chaves.',
      steps:[
        'Ler tensão e potência da bobina.',
        'Identificar P, A, B, R e S.',
        'Comparar a posição central com o símbolo pneumático.',
        'Medir resistência da bobina desenergizada.',
        'Confirmar tensão nominal durante o comando.',
        'Acionar o comando manual para separar defeito elétrico de travamento.',
        'Medir pressão na entrada P.',
        'Confirmar passagem alternada para A e B.',
        'Verificar escapes R e S e silenciadores.',
        'Confirmar avanço, centro e retorno do cilindro.',
        'Verificar vazamento e retorno do carretel.'
      ],
      faults:[
        'Bobina aberta, em curto ou com tensão incorreta.',
        'Conector sem alimentação ou com mau contato.',
        'Carretel travado por sujeira ou água.',
        'Pressão insuficiente.',
        'Escape obstruído.',
        'Vazamento interno ou externo.',
        'Centro incompatível com a aplicação.'
      ]
    };
  }

  if(key.includes('motor')){
    return {
      principle:'O motor converte energia elétrica em rotação. O diagnóstico deve separar alimentação, enrolamentos, carga mecânica, ventilação e rolamentos.',
      tools:'Multímetro, alicate amperímetro, megômetro, tacômetro, termômetro e analisador de vibração quando disponível.',
      steps:[
        'Ler placa: tensão, corrente, potência, frequência, rotação e ligação.',
        'Verificar caixa de ligação, aterramento, ventilação e fixação.',
        'Conferir ligação estrela/triângulo conforme placa e rede.',
        'Medir resistência entre fases e comparar equilíbrio.',
        'Medir isolamento fase-terra conforme procedimento.',
        'Medir tensão entre fases durante a partida.',
        'Medir corrente nas três fases e comparar com a placa.',
        'Confirmar sentido de rotação.',
        'Verificar temperatura, ruído e vibração.',
        'Verificar rolamentos, alinhamento, acoplamento e carga.',
        'Desacoplar a carga quando necessário para separar motor e máquina.'
      ],
      faults:[
        'Falta ou desequilíbrio de fase.',
        'Ligação incorreta.',
        'Sobrecarga mecânica.',
        'Rolamento danificado.',
        'Ventilação obstruída.',
        'Baixo isolamento.',
        'Desalinhamento.'
      ]
    };
  }

  if(key==='clp'){
    return {
      principle:'O CLP lê entradas, executa a lógica do programa e comanda saídas.',
      tools:'Multímetro, notebook autorizado, software correto, cabo de programação e diagrama elétrico.',
      steps:[
        'Verificar LEDs de alimentação, RUN, STOP, ERROR e comunicação.',
        'Confirmar fonte, aterramento e conectores.',
        'Ler diagnóstico antes de reiniciar ou trocar módulos.',
        'Verificar a entrada física e o bit online.',
        'Verificar intertravamentos da lógica.',
        'Verificar comando e bit da saída.',
        'Medir a saída no borne com a carga conectada.',
        'Confirmar comunicação com IHM, inversores e remotas.',
        'Comparar backup e versão do programa.',
        'Nunca forçar saída sem avaliação de risco e autorização.'
      ],
      faults:[
        'Fonte 24 VCC instável.',
        'CPU em STOP.',
        'Falha de módulo.',
        'Entrada sem sinal.',
        'Saída sem comum ou danificada.',
        'Falha de rede.',
        'Intertravamento ativo.',
        'Programa ou parâmetro incorreto.'
      ]
    };
  }

  if(key.includes('rele de seguranca')){
    return {
      principle:'Monitora dispositivos de segurança e só libera as saídas quando canais, reset e realimentação estão corretos.',
      tools:'Multímetro, diagrama de segurança e documentação do fabricante.',
      steps:[
        'Identificar alimentação, canais, reset, realimentação e saídas.',
        'Verificar LEDs e códigos de diagnóstico.',
        'Confirmar alimentação nominal.',
        'Testar cada canal do botão de emergência ou chave.',
        'Verificar discrepância entre canais.',
        'Confirmar realimentação dos contatores.',
        'Testar reset manual.',
        'Confirmar que não ocorre rearme automático indevido.',
        'Executar teste funcional de cada proteção antes de liberar.',
        'Nunca jumpear ou anular o circuito de segurança.'
      ],
      faults:[
        'Canal aberto ou cruzado.',
        'Reset permanentemente acionado.',
        'Contator colado.',
        'Realimentação aberta.',
        'Tensão baixa.',
        'Dispositivo desalinhado.',
        'Ligação fora do diagrama.'
      ]
    };
  }

  if(key.includes('rolamento')){
    return {
      principle:'O rolamento suporta e guia o eixo. A seleção depende de código, dimensões, carga, rotação, vedação, folga e ambiente.',
      tools:'Paquímetro, micrômetro, relógio comparador, termômetro e analisador de vibração quando disponível.',
      steps:[
        'Ler o código gravado.',
        'Confirmar diâmetro interno, externo e largura.',
        'Verificar vedação e folga interna.',
        'Inspecionar pistas, elementos rolantes, gaiola e coloração.',
        'Girar manualmente e sentir aspereza ou travamento.',
        'Medir folga radial e axial conforme a montagem.',
        'Verificar temperatura, ruído e vibração.',
        'Conferir ajuste no eixo e alojamento.',
        'Verificar lubrificação, contaminação e excesso de graxa.',
        'Confirmar alinhamento e carga aplicada.'
      ],
      faults:[
        'Falta ou excesso de lubrificação.',
        'Contaminação.',
        'Montagem pela pista errada.',
        'Ajuste solto ou apertado.',
        'Desalinhamento.',
        'Corrente elétrica.',
        'Sobrecarga ou fadiga.'
      ]
    };
  }

  if(key.includes('mancal')){
    return {
      principle:'O mancal aloja o rolamento e sustenta o eixo, garantindo alinhamento, fixação e lubrificação.',
      tools:'Relógio comparador, paquímetro, torquímetro quando especificado e instrumento de alinhamento.',
      steps:[
        'Identificar mancal e rolamento.',
        'Verificar base, parafusos, trincas e vedação.',
        'Conferir aperto da base.',
        'Medir alinhamento do eixo.',
        'Verificar folga no alojamento.',
        'Inspecionar entrada de contaminantes.',
        'Confirmar caminho de lubrificação.',
        'Acompanhar temperatura, ruído e vibração.'
      ],
      faults:[
        'Base frouxa.',
        'Alojamento desgastado.',
        'Desalinhamento.',
        'Vedação danificada.',
        'Lubrificação inadequada.',
        'Rolamento incorreto.'
      ]
    };
  }

  if(key.includes('sensor')){
    return {
      principle:'O sensor detecta presença, posição ou condição e envia um sinal ao sistema de controle.',
      tools:'Multímetro, alvo de teste, diagrama e notebook quando necessário.',
      steps:[
        'Identificar tensão, PNP/NPN, NA/NF e alcance.',
        'Verificar LED, cabo, conector, sujeira e alinhamento.',
        'Confirmar alimentação.',
        'Acionar com o alvo correto.',
        'Medir a comutação da saída.',
        'Confirmar mudança na entrada do CLP.',
        'Regular distância ou sensibilidade.',
        'Testar repetibilidade.',
        'Verificar interferência, reflexo ou metal próximo.'
      ],
      faults:[
        'Sem alimentação.',
        'PNP/NPN incompatível.',
        'Saída em curto.',
        'Alinhamento incorreto.',
        'Distância excessiva.',
        'Cabo rompido.',
        'Entrada do CLP defeituosa.'
      ]
    };
  }

  return generic;
}

function defaultTrainingProblems(){
  return uniqueStrings([
    ...industrialComponentOptions(),
    'Variação de altura',
    'Calço na faca',
    'Troca de mola da rotulatriz',
    'Posição e alinhamento da faca',
    'Faca quebrada ou desgastada',
    'Contrafaca e folga',
    'Fundo enroscando',
    'Faixa enroscando',
    'Falta de fundo',
    'Falta de faixa',
    'Bobina estourando',
    'Alinhamento da bobina',
    'Falha de cola',
    'Vazamento pneumático',
    'Falha de sensor',
    'Falha elétrica',
    'Falha de resistência',
    'Falha de termopar',
    'Vácuo baixo',
    'Carrinho móvel',
    'Carrinho fixo',
    'Came ou leva',
    'Preventiva geral',
    'Regulagem operacional'
  ]);
}

function trainingProblemOptions(machine=''){
  const defaults=defaultTrainingProblems();
  const history=state.sgmanHistory?.items||state.sgmanHistory?.orders||[];
  const machineKey=normalizeMachineCode(machine);

  const phrases=[];

  history
    .filter(order=>{
      if(!machineKey)return true;
      const tag=normalizeMachineCode(
        order.machine||
        order.tag||
        order.equipment||
        ''
      );
      return tag===machineKey ||
        String(order.tag||'').includes(
          String(machineKey).replace(/\D/g,'')
        );
    })
    .slice(0,300)
    .forEach(order=>{
      const text=String(
        order.description||
        order.descricao||
        order.problem||
        order.problema||
        ''
      ).trim();

      if(text.length>=5 && text.length<=90){
        phrases.push(text);
      }
    });

  return uniqueStrings([...defaults,...phrases]).slice(0,100);
}

function populateTrainingSelectors(){const machines=trainingMachines();for(const id of ['trainingMachine','trainingFilterMachine']){const el=$(id);if(!el)continue;const current=el.value;el.innerHTML=`<option value="">${id==='trainingMachine'?'Geral / todas as máquinas':'Todas as máquinas'}</option>${machines.map(m=>`<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('')}`;if(machines.includes(current))el.value=current}const mechanic=$('trainingProgressMechanic');if(mechanic){const current=mechanic.value;const users=typeof scaleExecutantesOnly==='function'?scaleExecutantesOnly():[];mechanic.innerHTML=`<option value="">Selecione o colaborador</option>${users.map(u=>`<option value="${escapeHtml(u.username)}">${escapeHtml(u.label)} — ${escapeHtml(u.crew)}</option>`).join('')}`;if([...mechanic.options].some(o=>o.value===current))mechanic.value=current}}
function filteredTrainingItems(){const search=normalizeKey($('trainingSearch')?.value||'');const type=$('trainingFilterType')?.value||'';const machine=$('trainingFilterMachine')?.value||'';const status=$('trainingFilterStatus')?.value||'';return state.trainingItems.filter(x=>!type||x.type===type).filter(x=>!machine||x.machine===machine).filter(x=>!status||x.status===status).filter(x=>!search||normalizeKey([x.title,x.description,x.machine,x.category,x.audience,x.steps,x.responsible].filter(Boolean).join(' ')).includes(search)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))}
function renderTrainingDashboard(){const t=$('trainingDashboard');if(!t)return;const active=state.trainingItems.filter(x=>x.status==='active').length;const procedures=state.trainingItems.filter(x=>x.type==='procedure').length;const completed=state.trainingProgress.filter(x=>x.status==='completed').length;const people=uniqueStrings(state.trainingProgress.filter(x=>x.status==='completed').map(x=>x.mechanic)).length;t.innerHTML=`<div class="metric"><span>Conteúdos ativos</span><strong>${active}</strong><small>Treinamentos e procedimentos</small></div><div class="metric"><span>Procedimentos</span><strong>${procedures}</strong><small>Padrões documentados</small></div><div class="metric"><span>Conclusões</span><strong>${completed}</strong><small>Capacitações registradas</small></div><div class="metric"><span>Pessoas treinadas</span><strong>${people}</strong><small>Colaboradores diferentes</small></div>`}
function renderTrainingPage(){renderTrainingDashboard();const cloud=$('trainingCloudStatus');if(cloud){cloud.textContent=state.trainingCloudAvailable?'Nuvem conectada':'Modo local — configure Supabase';cloud.className=`training-cloud-status ${state.trainingCloudAvailable?'connected':'local'}`}const items=filteredTrainingItems();if($('trainingCount'))$('trainingCount').textContent=`${items.length} conteúdo(s)`;const target=$('trainingList');if(!target)return;if(!items.length){target.innerHTML='<div class="empty-state"><strong>Nenhum conteúdo encontrado.</strong><p>Cadastre o primeiro procedimento da manutenção.</p></div>';return}target.innerHTML=items.map(item=>{const steps=String(item.steps||'').split(/\n+/).map(x=>x.replace(/^\s*\d+[.)-]?\s*/,'').trim()).filter(Boolean);const progress=trainingProgressFor(item.id);return `<article class="training-card"><div class="training-card-head"><div><span class="training-type">${item.type==='procedure'?'Procedimento':item.type==='checklist'?'Checklist':'Treinamento'}</span><h3>${escapeHtml(item.title)}</h3></div><span class="training-status training-status-${escapeHtml(item.status||'active')}">${escapeHtml(trainingStatusLabel(item.status))}</span></div><div class="training-meta"><span>Máquina: <strong>${escapeHtml(item.machine||'Geral')}</strong></span><span>Categoria: <strong>${escapeHtml(item.category||'Geral')}</strong></span><span>Público: <strong>${escapeHtml(item.audience||'Manutenção')}</strong></span><span>Periodicidade: <strong>${escapeHtml(item.frequency||'Quando necessário')}</strong></span></div><p>${escapeHtml(item.description||'Sem descrição.')}</p>${steps.length?`<details><summary>Ver passos</summary><ol>${steps.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ol></details>`:''}${item.materialUrl?`<a class="training-material-link" href="${escapeHtml(item.materialUrl)}" target="_blank" rel="noopener noreferrer">Abrir material / vídeo</a>`:''}<div class="training-progress-line"><span>${progress.length} conclusão(ões)</span><small>Responsável: ${escapeHtml(item.responsible||'Não informado')}</small></div><div class="button-row compact-buttons"><button class="secondary training-edit-btn" data-training-id="${escapeHtml(String(item.id))}" type="button">Editar</button><button class="primary training-complete-btn" data-training-id="${escapeHtml(String(item.id))}" type="button">Registrar conclusão</button><button class="danger training-delete-btn" data-training-id="${escapeHtml(String(item.id))}" type="button">Excluir</button></div></article>`}).join('');$$('.training-edit-btn').forEach(b=>b.addEventListener('click',()=>editTrainingItem(b.dataset.trainingId)));$$('.training-complete-btn').forEach(b=>b.addEventListener('click',()=>openTrainingCompletion(b.dataset.trainingId)));$$('.training-delete-btn').forEach(b=>b.addEventListener('click',()=>deleteTrainingItem(b.dataset.trainingId)))}
async function loadTrainingData(force=false){if(!force&&state.trainingItems.length){renderTrainingPage();return}state.trainingItems=trainingLocalItems();state.trainingProgress=trainingLocalProgress();state.trainingCloudAvailable=false;try{const data=await trainingApiRequest('GET');if(Array.isArray(data.items)&&data.items.length){state.trainingItems=data.items;saveTrainingLocal()}if(Array.isArray(data.progress)){state.trainingProgress=data.progress;saveTrainingProgressLocal()}state.trainingCloudAvailable=Boolean(data.cloud)}catch(e){console.warn('Treinamento local:',e.message)}renderTrainingPage()}
function trainingPayload(){const title=$('trainingTitle')?.value.trim()||'';if(!title)throw new Error('Informe o título.');const existing=state.trainingItems.find(x=>String(x.id)===String(state.trainingEditingId));return{id:state.trainingEditingId||`training-${Date.now()}`,type:$('trainingType')?.value||'training',title,description:$('trainingDescription')?.value.trim()||'',machine:$('trainingMachine')?.value||'',category:$('trainingCategory')?.value.trim()||'Geral',audience:$('trainingAudience')?.value||'Todos da manutenção',frequency:$('trainingFrequency')?.value.trim()||'Quando necessário',responsible:$('trainingResponsible')?.value.trim()||'',materialUrl:$('trainingMaterialUrl')?.value.trim()||'',steps:$('trainingSteps')?.value.trim()||'',status:$('trainingStatus')?.value||'active',createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()}}
async function saveTrainingItem(){const btn=$('saveTrainingBtn');btn.disabled=true;btn.textContent='Salvando...';try{const item=trainingPayload();const i=state.trainingItems.findIndex(x=>String(x.id)===String(item.id));if(i>=0)state.trainingItems[i]=item;else state.trainingItems.unshift(item);saveTrainingLocal();try{const data=await trainingApiRequest('POST',{action:'upsert',item});state.trainingCloudAvailable=Boolean(data.cloud)}catch(e){console.warn(e.message)}clearTrainingForm();renderTrainingPage();showToast('Conteúdo salvo.')}catch(e){showToast(e.message)}finally{btn.disabled=false;btn.textContent='Salvar conteúdo'}}
function editTrainingItem(id){const item=state.trainingItems.find(x=>String(x.id)===String(id));if(!item)return;state.trainingEditingId=String(id);for(const [field,value] of Object.entries({trainingType:item.type,trainingTitle:item.title,trainingDescription:item.description,trainingMachine:item.machine,trainingCategory:item.category,trainingAudience:item.audience,trainingFrequency:item.frequency,trainingResponsible:item.responsible,trainingMaterialUrl:item.materialUrl,trainingSteps:item.steps,trainingStatus:item.status})){if($(field))$(field).value=value||''}$('saveTrainingBtn').textContent='Atualizar conteúdo';$('cancelTrainingEditBtn').classList.remove('hidden');$('trainingFormCard').scrollIntoView({behavior:'smooth',block:'start'})}
function clearTrainingForm(){state.trainingEditingId='';for(const id of ['trainingTitle','trainingDescription','trainingCategory','trainingFrequency','trainingResponsible','trainingMaterialUrl','trainingSteps'])if($(id))$(id).value='';if($('trainingType'))$('trainingType').value='training';if($('trainingMachine'))$('trainingMachine').value='';if($('trainingAudience'))$('trainingAudience').value='Todos da manutenção';if($('trainingStatus'))$('trainingStatus').value='active';$('saveTrainingBtn').textContent='Salvar conteúdo';$('cancelTrainingEditBtn')?.classList.add('hidden')}
async function deleteTrainingItem(id){const item=state.trainingItems.find(x=>String(x.id)===String(id));if(!item||!confirm(`Excluir "${item.title}"?`))return;state.trainingItems=state.trainingItems.filter(x=>String(x.id)!==String(id));state.trainingProgress=state.trainingProgress.filter(x=>String(x.trainingId)!==String(id));saveTrainingLocal();saveTrainingProgressLocal();renderTrainingPage();try{await trainingApiRequest('DELETE',{id})}catch(e){console.warn(e.message)}showToast('Conteúdo excluído.')}
function openTrainingCompletion(id){const item=state.trainingItems.find(x=>String(x.id)===String(id));if(!item)return;$('trainingCompletionId').value=String(id);$('trainingCompletionTitle').textContent=item.title;$('trainingCompletionPanel').classList.remove('hidden');$('trainingCompletionPanel').scrollIntoView({behavior:'smooth',block:'center'})}
async function saveTrainingCompletion(){const trainingId=$('trainingCompletionId')?.value||'';const mechanic=$('trainingProgressMechanic')?.value||'';if(!trainingId||!mechanic){showToast('Selecione o colaborador.');return}const record={id:`progress-${Date.now()}`,trainingId,mechanic,mechanicLabel:sgmanUserLabel(mechanic),status:'completed',score:Number($('trainingProgressScore')?.value||0),notes:$('trainingProgressNotes')?.value.trim()||'',completedAt:new Date().toISOString()};state.trainingProgress.unshift(record);saveTrainingProgressLocal();try{const data=await trainingApiRequest('POST',{action:'progress',record});state.trainingCloudAvailable=Boolean(data.cloud)}catch(e){console.warn(e.message)}$('trainingCompletionPanel').classList.add('hidden');renderTrainingPage();showToast('Conclusão registrada.')}
async function initTrainingModule(){populateTrainingSelectors();initVisualTraining();for(const id of ['trainingSearch','trainingFilterType','trainingFilterMachine','trainingFilterStatus'])$(id)?.addEventListener(id==='trainingSearch'?'input':'change',renderTrainingPage);$('saveTrainingBtn')?.addEventListener('click',saveTrainingItem);$('cancelTrainingEditBtn')?.addEventListener('click',clearTrainingForm);$('saveTrainingCompletionBtn')?.addEventListener('click',saveTrainingCompletion);$('cancelTrainingCompletionBtn')?.addEventListener('click',()=> $('trainingCompletionPanel')?.classList.add('hidden'));$('refreshTrainingBtn')?.addEventListener('click',()=>loadTrainingData(true));await loadTrainingData()}

function maintenanceManagerSnapshot() {
  const metrics = state.reliability3Days || calculateReliability3Days();
  const summary = state.sgmanHistory?.summary || {};
  const trend = calculateEfficiencyTrend();
  const level = maintenanceEfficiencyLevel(metrics);
  const targets = maintenanceTargets();
  const shift = currentOperationalShiftWindow(new Date());
  const plan = maintenanceShiftCommitments(metrics);
  const preventive = buildPreventivePlan(metrics).slice(0, 5);
  const people = maintenancePeopleAccountability().slice(0, 6);
  const oee = trend.current ?? getRecentOeeDashboard()?.companyAverage ?? null;
  const goals = [
    {label:'OEE',target:`≥ ${Number(targets.oee||70).toFixed(0)}%`,current:oee==null?'-':formatOee(oee),ok:oee!=null&&oee>=Number(targets.oee||70)},
    {label:'MTTR',target:`≤ ${formatReliabilityTime(Number(targets.mttrMinutes||60))}`,current:formatReliabilityTime(metrics.mttrMinutes),ok:Number.isFinite(Number(metrics.mttrMinutes))&&Number(metrics.mttrMinutes)<=Number(targets.mttrMinutes||60)},
    {label:'MTBF',target:`≥ ${formatReliabilityTime(Number(targets.mtbfHours||12)*60)}`,current:formatReliabilityTime(metrics.mtbfMinutes),ok:Number.isFinite(Number(metrics.mtbfMinutes))&&Number(metrics.mtbfMinutes)>=Number(targets.mtbfHours||12)*60},
    {label:'Confiabilidade',target:`≥ ${Number(targets.reliabilityPercent||55).toFixed(0)}%`,current:formatReliabilityPercent(metrics.reliabilityPercent),ok:Number.isFinite(Number(metrics.reliabilityPercent))&&Number(metrics.reliabilityPercent)>=Number(targets.reliabilityPercent||55)},
    {label:'OS em atraso',target:`≤ ${Number(targets.maxOverdueOrders||20)}`,current:String(Number(summary.overdue||0)),ok:Number(summary.overdue||0)<=Number(targets.maxOverdueOrders||20)},
    {label:'Reincidências',target:`≤ ${Number(targets.maxRecurrenceMachines||2)}`,current:String(Number(metrics.recurrentMachines||0)),ok:Number(metrics.recurrentMachines||0)<=Number(targets.maxRecurrenceMachines||2)}
  ];
  return {metrics,summary,trend,level,shift,oee,plan,preventive,people,goals};
}
function managerReliabilityExplanation(percent){
  const v=Number(percent);
  if(!Number.isFinite(v)) return {status:'Sem dados',color:'gray',text:'Atualize o SGMan para estimar a chance de operar 12 horas sem nova falha.'};
  if(v>=80) return {status:'Excelente',color:'green',text:'Alta probabilidade de concluir as próximas 12 horas sem nova falha.'};
  if(v>=60) return {status:'Boa',color:'yellow',text:'Boa estabilidade, mas as reincidências ainda precisam ser controladas.'};
  if(v>=40) return {status:'Atenção',color:'orange',text:'Risco moderado de nova parada. Priorize as máquinas reincidentes.'};
  return {status:'Alto risco',color:'red',text:'Existe alto risco de uma nova falha nas próximas 12 horas. Foco total em causa raiz, teste e estabilidade.'};
}
function renderMaintenanceManagerHome(){
  const target=$('managerHomeContent'); if(!target) return;
  const s=maintenanceManagerSnapshot();
  const r=managerReliabilityExplanation(s.metrics.reliabilityPercent);
  const trendText=s.trend.delta==null?'Sem comparação anterior':s.trend.direction==='up'?`Melhora de ${Math.abs(s.trend.delta).toFixed(1).replace('.',',')} ponto(s)`:s.trend.direction==='down'?`Piora de ${Math.abs(s.trend.delta).toFixed(1).replace('.',',')} ponto(s)`:'Eficiência estável';
  target.innerHTML=`
  <div class="manager-home-level manager-home-level-${escapeHtml(s.level.status)}"><div><span>Índice de gestão</span><strong>${escapeHtml(s.level.level)}</strong><small>${escapeHtml(trendText)}</small></div><b>${s.level.score}/100</b></div>
  <div class="manager-home-kpis">
   <div class="metric"><span>OEE</span><strong>${s.oee==null?'-':escapeHtml(formatOee(s.oee))}</strong><small>${escapeHtml(s.trend.arrow||'➜')} tendência</small></div>
   <div class="metric"><span>MTTR</span><strong>${escapeHtml(formatReliabilityTime(s.metrics.mttrMinutes,'-'))}</strong><small>Tempo médio de reparo</small></div>
   <div class="metric"><span>MTBF</span><strong>${escapeHtml(formatReliabilityTime(s.metrics.mtbfMinutes,'-'))}</strong><small>Tempo médio entre falhas</small></div>
   <div class="metric"><span>OS concluídas</span><strong>${Number(s.metrics.completedCurrentShift||0)}</strong><small>${escapeHtml(s.shift.label)}</small></div>
   <div class="metric"><span>OS em atraso</span><strong>${Number(s.summary.overdue||0)}</strong><small>Exigem responsável e prazo</small></div>
   <div class="metric"><span>Reincidências</span><strong>${Number(s.metrics.recurrentMachines||0)}</strong><small>Máquinas com 2+ falhas</small></div>
  </div>
  <div class="manager-reliability-card manager-reliability-${escapeHtml(r.color)}"><div><span>Confiabilidade para as próximas 12 horas</span><strong>${escapeHtml(formatReliabilityPercent(s.metrics.reliabilityPercent,'-'))} — ${escapeHtml(r.status)}</strong></div><p>${escapeHtml(r.text)}</p></div>
  <div class="manager-home-grid">
   <section class="manager-home-section"><span class="eyebrow">PRIORIDADES DO TURNO</span><h3>Fila de ataque</h3><div class="manager-priority-list">${s.plan.length?s.plan.map(i=>`<article><span class="priority-number">${i.priority}</span><div><strong>${escapeHtml(i.machine)}</strong><p>${escapeHtml(i.target)}</p><small>${escapeHtml(i.validation)}</small></div></article>`).join(''):'<p class="muted">Atualize o SGMan para definir as três prioridades.</p>'}</div></section>
   <section class="manager-home-section"><span class="eyebrow">METAS DO TURNO</span><h3>Situação atual</h3><div class="manager-goals-list">${s.goals.map(g=>`<div class="manager-goal ${g.ok?'goal-ok':'goal-fail'}"><span>${g.ok?'✅':'❌'} ${escapeHtml(g.label)}</span><strong>${escapeHtml(g.current)}</strong><small>Meta ${escapeHtml(g.target)}</small></div>`).join('')}</div></section>
  </div>
  <div class="manager-home-grid">
   <section class="manager-home-section"><span class="eyebrow">PREVENTIVAS SUGERIDAS</span><h3>Próximas ações</h3><div class="manager-preventive-list">${s.preventive.length?s.preventive.map(i=>`<article><div><strong>${escapeHtml(i.machine)}</strong><span>${escapeHtml(i.frequency)}</span></div><ul>${i.actions.slice(0,3).map(a=>`<li>${escapeHtml(a)}</li>`).join('')}</ul></article>`).join(''):'<p class="muted">Sem dados suficientes para sugerir preventivas.</p>'}</div></section>
   <section class="manager-home-section"><span class="eyebrow">EQUIPE DO TURNO</span><h3>Acompanhamento</h3><div class="manager-team-list">${s.people.length?s.people.map(row=>`<article><div><strong>${escapeHtml(row.label||row.executante)}</strong><span>${row.completed} OS • MTTR ${escapeHtml(formatReliabilityTime(row.mttrMinutes,'-'))}</span></div><small>${escapeHtml(row.accountability.join('; '))}</small></article>`).join(''):'<p class="muted">Sem dados suficientes dos mecânicos da escala.</p>'}</div></section>
  </div>`;
}
async function refreshMaintenanceManagerHome(){const b=$('refreshManagerHomeBtn'); if(b){b.disabled=true;b.textContent='Atualizando...';} try{await refreshSgmanHistory(true);state.reliability3Days=calculateReliability3Days();renderMaintenanceManagerHome();showToast('Painel do gestor atualizado.');}finally{if(b){b.disabled=false;b.textContent='Atualizar painel';}}}
function initMaintenanceManagerHome(){
  renderMaintenanceManagerHome();

  $('refreshManagerHomeBtn')?.addEventListener(
    'click',
    refreshMaintenanceManagerHome
  );

  $('copyDailyReportHomeBtn')?.addEventListener(
    'click',
    () => copyText(
      maintenanceAccountabilityReport(),
      'Relatório diário copiado.'
    )
  );

  $$('.manager-shortcut[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      switchView(button.dataset.view);
    });
  });
}

let visualTrainingSelectedFileCache=null;
let visualTrainingPreviewUrl='';
let visualTrainingDraftFile=null;
function visualTrainingItems(){
  let local=[];

  try{
    const parsed=JSON.parse(
      localStorage.getItem(STORAGE.trainingMedia)||'[]'
    );
    local=Array.isArray(parsed)?parsed:[];
  }catch{}

  const seed={
    id:'seed-valvula-5-3',
    type:'image',
    title:'Válvula direcional 5/3',
    machine:'',
    machineType:'outros',
    problemType:'Pneumática — funcionamento da válvula',
    category:'Pneumática',
    description:'Válvula pneumática com cinco vias e três posições, usada para avançar, pausar e retornar um cilindro.',
    steps:'1. Identifique P, a alimentação de ar.\n2. Identifique A e B, que vão para o cilindro.\n3. Identifique R e S, os escapes.\n4. Na posição esquerda, P alimenta A e o cilindro avança.\n5. Na posição central, confirme se o centro é fechado, aberto ou pressurizado.\n6. Na posição direita, P alimenta B e o cilindro retorna.\n7. Antes de intervir, bloqueie e despressurize o sistema.',
    safety:'Bloquear energia, despressurizar e confirmar ausência de movimento antes de desmontar.',
    validation:'Acionar avanço, parada e retorno e confirmar ausência de vazamentos.',
    keywords:['válvula 5/3','pneumática','cilindro','avanço','retorno'],
    mediaUrl:'/assets/training/valvula-5-3-exemplo.jpeg',
    createdAt:new Date().toISOString(),
    cloud:false
  };

  const all=[
    ...(state.visualTrainingCloudItems||[]),
    ...local,
    seed
  ];

  const map=new Map();

  all.forEach(item=>{
    if(item?.id && !map.has(String(item.id))){
      map.set(String(item.id),item);
    }
  });

  return [...map.values()];
}

function saveVisualTrainingItems(items){safeStorageSet(STORAGE.trainingMedia,JSON.stringify(items.slice(0,150)),{removeOnFailure:true})}
function mediaDataUrl(file){return new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result||''));r.onerror=()=>no(r.error||new Error('Falha ao ler arquivo'));r.readAsDataURL(file)})}

function visualTrainingTemplate(
  title,
  category,
  machine,
  notes,
  machineType='outros',
  problemType='',
  component=''
){
  const selected=component||problemType||title||'Componente industrial';
  const guide=industrialTechnicalGuide(selected);
  const group=industrialComponentGroup(selected);

  const steps=[
    'Identificar placa, código, símbolo e modelo do componente.',
    'Localizar o componente no diagrama e entender sua função.',
    ...guide.steps,
    'Registrar todas as medições e comparar com placa, manual ou componente igual.',
    'Executar teste final com as proteções instaladas.',
    'Acompanhar a máquina em produção antes de liberar.',
    'Registrar problema, causa, serviço e resultado no SGMan.'
  ];

  if(notes)steps.push(`Observação prática: ${notes}`);

  return {
    component:selected,
    componentGroup:group,
    principle:guide.principle,
    description:`Aula técnica sobre ${selected}, aplicada em ${machine||'uso geral'}. Ensina funcionamento, identificação, inspeção, diagnóstico, testes e liberação.`,
    tools:guide.tools,
    steps:steps.map((text,index)=>`${index+1}. ${text}`).join('\n'),
    faults:guide.faults.map((text,index)=>`${index+1}. ${text}`).join('\n'),
    safety:'Aplicar bloqueio e etiquetagem e eliminar energias elétrica, pneumática, hidráulica, térmica, gravitacional e mecânica residual. Nunca anular proteções ou circuitos de segurança.',
    validation:'Liberar somente após teste sem carga quando aplicável, teste sob condição real, repetição do ciclo e confirmação de ausência de vazamentos, ruídos, aquecimento, alarmes ou instabilidade.',
    keywords:uniqueStrings([
      selected,group,category,problemType,machine,
      trainingMachineTypeLabel(machineType),
      'como funciona','como testar','diagnóstico','defeitos'
    ].filter(Boolean)).slice(0,30)
  };
}

async function visualTrainingVideoFrame(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const video=document.createElement('video');

    video.muted=true;
    video.playsInline=true;
    video.preload='metadata';

    video.onloadeddata=()=>{
      try{
        video.currentTime=Math.min(
          1,
          Math.max(0,Number(video.duration||0)/4)
        );
      }catch{
        video.currentTime=0;
      }
    };

    video.onseeked=()=>{
      try{
        const canvas=document.createElement('canvas');
        const width=video.videoWidth||1280;
        const height=video.videoHeight||720;
        const scale=Math.min(1,1280/Math.max(width,height));

        canvas.width=Math.max(1,Math.round(width*scale));
        canvas.height=Math.max(1,Math.round(height*scale));

        canvas.getContext('2d').drawImage(
          video,
          0,
          0,
          canvas.width,
          canvas.height
        );

        const dataUrl=canvas.toDataURL('image/jpeg',0.78);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      }catch(error){
        URL.revokeObjectURL(url);
        reject(error);
      }
    };

    video.onerror=()=>{
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível extrair uma imagem do vídeo.'));
    };

    video.src=url;
  });
}

async function visualTrainingAiAnalysis(file,context){
  let imageDataUrl='';

  if(String(file.type||'').startsWith('video/')){
    imageDataUrl=await visualTrainingVideoFrame(file);
  }else{
    imageDataUrl=await mediaDataUrl(file);
  }

  const response=await fetch('/api/training-ai',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      imageDataUrl,
      context
    })
  });

  const data=await response.json().catch(()=>({}));

  if(!response.ok || data.ok===false){
    throw new Error(
      data.error||
      `Falha na análise por inteligência artificial (${response.status}).`
    );
  }

  return data.lesson;
}

async function createVisualTraining(){
  const button=$('createVisualTrainingBtn');

  const file=
    visualTrainingSelectedFileCache ||
    $('visualTrainingCameraFile')?.files?.[0] ||
    $('visualTrainingVideoFile')?.files?.[0] ||
    $('visualTrainingFile')?.files?.[0];

  if(!file){
    showToast('Escolha uma foto ou vídeo antes de criar a lição.');
    return;
  }

  if(button){
    button.disabled=true;
    button.textContent='Analisando foto e histórico...';
  }

  try{
    const machine=$('visualTrainingMachine')?.value||'';
    const machineType=
      $('visualTrainingMachineType')?.value||
      trainingMachineType(machine);

    const problemType=
      $('visualTrainingProblemType')?.value.trim()||
      'Treinamento de componente';

    const component=
      $('visualTrainingComponent')?.value.trim()||
      problemType;

    const category=
      $('visualTrainingCategory')?.value.trim()||
      problemType||
      'Geral';

    const notes=$('visualTrainingNotes')?.value.trim()||'';

    const title=
      $('visualTrainingTitle')?.value.trim()||
      `${problemType}${machine?` — ${machine}`:''}`;

    const context={
      title,
      machine,
      machineType,
      machineTypeLabel:trainingMachineTypeLabel(machineType),
      problemType,
      component,
      componentGroup:industrialComponentGroup(component),
      category,
      notes,
      sgmanReferences:trainingProblemOptions(machine).slice(0,20)
    };

    let generated;
    let aiUsed=false;

    try{
      generated=await visualTrainingAiAnalysis(file,context);
      aiUsed=true;
    }catch(aiError){
      console.warn('IA indisponível; usando modelo técnico local:',aiError);
      generated=visualTrainingTemplate(
        title,
        category,
        machine,
        notes,
        machineType,
        problemType,
        component
      );
    }

    visualTrainingDraftFile=file;

    state.visualTrainingDraft={
      id:`visual-${Date.now()}`,
      type:String(file.type||'').startsWith('video/')
        ? 'video'
        : 'image',
      title,
      machine,
      machineType,
      problemType,
      component:generated.component||component,
      componentGroup:generated.componentGroup||industrialComponentGroup(component),
      principle:generated.principle||'',
      tools:generated.tools||'',
      faults:generated.faults||'',
      category,
      notes,
      mediaUrl:
        visualTrainingPreviewUrl||
        URL.createObjectURL(file),
      mediaIsTemporary:true,
      aiUsed,
      description:generated.description||'',
      steps:generated.steps||'',
      safety:generated.safety||'',
      validation:generated.validation||'',
      keywords:Array.isArray(generated.keywords)
        ? generated.keywords
        : [],
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };

    renderVisualTrainingDraft();

    $('visualTrainingDraft')?.scrollIntoView({
      behavior:'smooth',
      block:'start'
    });

    showToast(
      aiUsed
        ? 'Lição criada pela IA. Revise antes de salvar.'
        : 'Lição criada pelo modelo técnico local. Configure OPENAI_API_KEY para análise visual automática.'
    );
  }catch(error){
    console.error('Falha ao criar lição:',error);
    showToast(
      `Não foi possível criar a lição: ${
        error?.message||'erro desconhecido'
      }`
    );
  }finally{
    if(button){
      button.disabled=false;
      button.textContent='Criar lição ponto a ponto';
    }
  }
}

function renderVisualTrainingDraft(){
  const draft=state.visualTrainingDraft;
  const target=$('visualTrainingDraft');
  if(!target)return;

  if(!draft){
    target.classList.add('hidden');
    target.innerHTML='';
    return;
  }

  const media=draft.type==='video'
    ? `<video controls playsinline src="${escapeHtml(draft.mediaUrl)}"></video>`
    : `<img src="${escapeHtml(draft.mediaUrl)}" alt="${escapeHtml(draft.title)}">`;

  target.classList.remove('hidden');
  target.innerHTML=`
    <div class="visual-media">${media}</div>
    <div class="visual-fields">
      <div class="visual-lesson-meta">
        <span>${escapeHtml(draft.componentGroup||'Geral')}</span>
        <span>${escapeHtml(draft.component||draft.problemType||'Componente')}</span>
        <span>${escapeHtml(draft.machine||'Aplicação geral')}</span>
        <span>${draft.aiUsed?'OCR local':'Modelo técnico local'}</span>
      </div>

      <label>Título da aula
        <input id="visualDraftTitle" value="${escapeHtml(draft.title)}">
      </label>
      <label>Componente identificado
        <input id="visualDraftComponent" value="${escapeHtml(draft.component||'')}">
      </label>
      <label>Como funciona
        <textarea id="visualDraftPrinciple" rows="5">${escapeHtml(draft.principle||'')}</textarea>
      </label>
      <label>Objetivo e aplicação
        <textarea id="visualDraftDescription" rows="5">${escapeHtml(draft.description||'')}</textarea>
      </label>
      <label>Instrumentos e ferramentas
        <textarea id="visualDraftTools" rows="4">${escapeHtml(draft.tools||'')}</textarea>
      </label>
      <label>Como identificar e testar — ponto a ponto
        <textarea id="visualDraftSteps" rows="18">${escapeHtml(draft.steps||'')}</textarea>
      </label>
      <label>Defeitos, sintomas e causas
        <textarea id="visualDraftFaults" rows="10">${escapeHtml(draft.faults||'')}</textarea>
      </label>
      <label>Segurança
        <textarea id="visualDraftSafety" rows="6">${escapeHtml(draft.safety||'')}</textarea>
      </label>
      <label>Teste final e liberação
        <textarea id="visualDraftValidation" rows="6">${escapeHtml(draft.validation||'')}</textarea>
      </label>
      <label>Palavras-chave
        <input id="visualDraftKeywords" value="${escapeHtml((draft.keywords||[]).join(', '))}">
      </label>

      <div class="button-row">
        <button id="saveVisualTrainingBtn" class="primary" type="button">Salvar treinamento</button>
        <button id="cancelVisualTrainingBtn" class="secondary" type="button">Cancelar</button>
      </div>
    </div>
  `;

  $('saveVisualTrainingBtn').onclick=()=>saveVisualTraining();
  $('cancelVisualTrainingBtn').onclick=()=>{
    state.visualTrainingDraft=null;
    visualTrainingDraftFile=null;
    renderVisualTrainingDraft();
  };
}

async function visualTrainingCloudRequest(method='GET',payload=null){
  const options={
    method,
    headers:{'Content-Type':'application/json'}
  };

  if(payload!==null){
    options.body=JSON.stringify(payload);
  }

  const response=await fetch('/api/visual-training',options);
  const data=await response.json().catch(()=>({}));

  if(!response.ok || data.ok===false){
    throw new Error(
      data.error||
      `Erro na nuvem (${response.status}).`
    );
  }

  return data;
}

async function loadVisualTrainingCloud(){
  try{
    const data=await visualTrainingCloudRequest('GET');
    state.visualTrainingCloudAvailable=Boolean(data.cloud);
    state.visualTrainingCloudItems=Array.isArray(data.items)
      ? data.items
      : [];
  }catch(error){
    state.visualTrainingCloudAvailable=false;
    state.visualTrainingCloudItems=[];
    console.warn('Nuvem visual indisponível:',error);
  }

  renderVisualTrainingLibrary();
}

async function saveVisualTraining(){
  const draft=state.visualTrainingDraft;
  const button=$('saveVisualTrainingBtn');

  if(!draft){
    showToast('Nenhuma lição disponível para salvar.');
    return;
  }

  if(button){
    button.disabled=true;
    button.textContent='Enviando para a nuvem...';
  }

  try{
    draft.title=
      $('visualDraftTitle')?.value.trim()||
      draft.title;

    draft.component=
      $('visualDraftComponent')?.value.trim()||
      draft.component||
      '';

    draft.componentGroup=industrialComponentGroup(draft.component);

    draft.principle=
      $('visualDraftPrinciple')?.value.trim()||
      '';

    draft.description=
      $('visualDraftDescription')?.value.trim()||
      '';

    draft.tools=
      $('visualDraftTools')?.value.trim()||
      '';

    draft.steps=
      $('visualDraftSteps')?.value.trim()||
      '';

    draft.faults=
      $('visualDraftFaults')?.value.trim()||
      '';

    draft.safety=
      $('visualDraftSafety')?.value.trim()||
      '';

    draft.validation=
      $('visualDraftValidation')?.value.trim()||
      '';

    draft.keywords=uniqueStrings(
      ($('visualDraftKeywords')?.value||'')
        .split(',')
        .map(item=>item.trim())
        .filter(Boolean)
    );

    const file=
      visualTrainingDraftFile||
      visualTrainingSelectedFileCache;

    if(!file){
      throw new Error(
        'A foto original não está mais disponível. Selecione novamente.'
      );
    }

    const encodedMediaDataUrl=await mediaDataUrl(file);

    let cloudSaved=false;

    try{
      const result=await visualTrainingCloudRequest(
        'POST',
        {
          action:'upsert',
          item:{
            ...draft,
            mediaDataUrl:encodedMediaDataUrl,
            mediaName:file.name||`${draft.id}.jpg`,
            mediaMimeType:file.type||'image/jpeg'
          }
        }
      );

      cloudSaved=Boolean(result.cloud);

      if(result.item){
        state.visualTrainingCloudItems=[
          result.item,
          ...(state.visualTrainingCloudItems||[])
            .filter(item=>String(item.id)!==String(result.item.id))
        ];
      }
    }catch(cloudError){
      console.warn('Falha ao salvar na nuvem:',cloudError);
    }

    if(!cloudSaved){
      draft.mediaUrl=encodedMediaDataUrl;
      delete draft.mediaIsTemporary;
      draft.cloud=false;

      const local=visualTrainingItems()
        .filter(item=>item.id!=='seed-valvula-5-3')
        .filter(item=>String(item.id)!==String(draft.id));

      saveVisualTrainingItems([draft,...local]);
    }

    state.visualTrainingDraft=null;
    visualTrainingDraftFile=null;
    visualTrainingSelectedFileCache=null;

    if(visualTrainingPreviewUrl){
      try{URL.revokeObjectURL(visualTrainingPreviewUrl)}catch{}
    }

    visualTrainingPreviewUrl='';

    for(const id of [
      'visualTrainingFile',
      'visualTrainingCameraFile',
      'visualTrainingVideoFile'
    ]){
      if($(id))$(id).value='';
    }

    if($('visualTrainingSelectedFile')){
      $('visualTrainingSelectedFile').textContent=
        'Nenhum arquivo selecionado.';
    }

    if($('visualTrainingSelectionPreview')){
      $('visualTrainingSelectionPreview').classList.add('hidden');
      $('visualTrainingSelectionPreview').innerHTML='';
    }

    renderVisualTrainingDraft();
    renderVisualTrainingLibrary();

    showToast(
      cloudSaved
        ? 'Lição salva na nuvem com sucesso.'
        : 'Nuvem não configurada. Lição salva somente neste aparelho.'
    );
  }catch(error){
    console.error('Falha ao salvar lição:',error);
    showToast(
      `Não foi possível salvar: ${
        error?.message||'erro desconhecido'
      }`
    );
  }finally{
    if(button){
      button.disabled=false;
      button.textContent='Salvar na nuvem';
    }
  }
}
function renderVisualTrainingLibrary(){
  const target=$('visualTrainingLibrary');
  if(!target)return;

  const search=normalizeKey(
    $('visualTrainingSearch')?.value||''
  );

  const machine=
    $('visualTrainingFilterMachine')?.value||'';

  const machineType=
    $('visualTrainingFilterMachineType')?.value||'';

  const problemType=
    $('visualTrainingFilterProblemType')?.value||'';

  const mediaType=
    $('visualTrainingFilterType')?.value||'';

  const items=visualTrainingItems()
    .filter(item=>!machine||item.machine===machine)
    .filter(item=>!machineType||item.machineType===machineType)
    .filter(item=>!problemType||item.problemType===problemType)
    .filter(item=>!mediaType||item.type===mediaType)
    .filter(item=>{
      if(!search)return true;

      return normalizeKey([
        item.title,
        item.machine,
        trainingMachineTypeLabel(item.machineType),
        item.problemType,
        item.category,
        item.description,
        item.steps,
        item.validation,
        ...(item.keywords||[])
      ].filter(Boolean).join(' ')).includes(search);
    })
    .sort((a,b)=>
      String(b.updatedAt||b.createdAt||'')
        .localeCompare(String(a.updatedAt||a.createdAt||''))
    );

  target.innerHTML=items.length
    ? items.map(item=>{
        const media=item.type==='video'
          ? `<video controls playsinline src="${escapeHtml(item.mediaUrl)}"></video>`
          : `<img src="${escapeHtml(item.mediaUrl)}" alt="${escapeHtml(item.title)}">`;

        return `
          <article class="visual-card">
            <div class="visual-media">${media}</div>

            <div>
              <div class="visual-lesson-meta">
                <span>${escapeHtml(trainingMachineTypeLabel(item.machineType))}</span>
                <span>${escapeHtml(item.machine||'Geral')}</span>
                <span>${escapeHtml(item.problemType||item.category||'Geral')}</span>
                <span>${item.cloud?'Nuvem':'Local'}</span>
              </div>

              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.description||'')}</p>

              <details>
                <summary>Ver lição ponto a ponto</summary>
                <pre>${escapeHtml(item.steps||'')}</pre>
              </details>

              <div class="visual-safety">
                <strong>Segurança</strong>
                <p>${escapeHtml(item.safety||'')}</p>
              </div>

              ${item.validation?`
                <div class="visual-validation">
                  <strong>Teste e liberação</strong>
                  <p>${escapeHtml(item.validation)}</p>
                </div>
              `:''}

              <div class="visual-tags">
                ${(item.keywords||[])
                  .map(keyword=>`<span>${escapeHtml(keyword)}</span>`)
                  .join('')}
              </div>
            </div>
          </article>
        `;
      }).join('')
    : '<p class="muted">Nenhuma lição encontrada com esses filtros.</p>';
}

function visualTrainingFileFromEvent(event, inputId){
  const fromEvent =
    event?.target?.files?.[0] ||
    event?.currentTarget?.files?.[0];

  return fromEvent || $(inputId)?.files?.[0] || null;
}

function loadImageFromFile(file){
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(
        'O iPhone selecionou a imagem, mas o navegador não conseguiu abrir este formato.'
      ));
    };

    image.src = objectUrl;
  });
}

async function optimizeVisualTrainingImage(file){
  const extension = String(file?.name || '')
    .split('.')
    .pop()
    .toLowerCase();

  const isImage =
    String(file?.type || '').startsWith('image/') ||
    ['jpg','jpeg','png','webp','heic','heif'].includes(extension);

  if(!isImage){
    return file;
  }

  // Arquivos pequenos e formatos comuns podem seguir sem conversão.
  const commonType =
    /image\/(jpeg|jpg|png|webp)/i.test(file.type || '') ||
    ['jpg','jpeg','png','webp'].includes(extension);
  if(commonType && file.size <= 1.8 * 1024 * 1024){
    return file;
  }

  const image = await loadImageFromFile(file);
  const maxSide = 1800;
  const originalWidth = image.naturalWidth || image.width;
  const originalHeight = image.naturalHeight || image.height;
  const scale = Math.min(
    1,
    maxSide / Math.max(originalWidth, originalHeight)
  );

  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', {
    alpha: false
  });

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      result => result
        ? resolve(result)
        : reject(new Error('Não foi possível otimizar a foto.')),
      'image/jpeg',
      0.82
    );
  });

  const baseName = String(file.name || 'foto')
    .replace(/\.[^.]+$/, '');

  return new File(
    [blob],
    `${baseName}.jpg`,
    {
      type: 'image/jpeg',
      lastModified: Date.now()
    }
  );
}

async function prepareVisualTrainingSelectedFile(file){
  if(!file){
    throw new Error('Nenhum arquivo foi selecionado.');
  }

  const extension = String(file.name || '')
    .split('.')
    .pop()
    .toLowerCase();

  const isVideo =
    String(file.type || '').startsWith('video/') ||
    ['mov','mp4','m4v','avi','webm'].includes(extension);

  const maximum = isVideo
    ? 40 * 1024 * 1024
    : 25 * 1024 * 1024;

  if(file.size > maximum){
    throw new Error(
      isVideo
        ? 'O vídeo é muito grande. Use até 40 MB.'
        : 'A foto é muito grande. Use até 25 MB.'
    );
  }

  return isVideo
    ? file
    : optimizeVisualTrainingImage(file);
}

async function showVisualTrainingSelectedFile(inputId,event=null){
const input=$(inputId);
const selected=visualTrainingFileFromEvent(event,inputId);
const target=$('visualTrainingSelectedFile');
const preview=$('visualTrainingSelectionPreview');

if(!selected){
  return;
}

if(target){
  target.innerHTML='<strong>Preparando arquivo...</strong>';
}

try{
  const file=await prepareVisualTrainingSelectedFile(selected);
  visualTrainingSelectedFileCache=file;

  for(const id of [
    'visualTrainingFile',
    'visualTrainingCameraFile',
    'visualTrainingVideoFile'
  ]){
    if(id!==inputId&&$(id)){
      $(id).value='';
    }
  }

  if(visualTrainingPreviewUrl){
    try{URL.revokeObjectURL(visualTrainingPreviewUrl)}catch{}
  }

  visualTrainingPreviewUrl=URL.createObjectURL(file);

  const kind=file.type.startsWith('video/')?'Vídeo':'Foto';
  const mb=(file.size/(1024*1024)).toFixed(1).replace('.',',');

  if(target){
    target.innerHTML=
      `<strong>${kind} adicionado:</strong> `+
      `${escapeHtml(file.name)} • ${mb} MB`;
  }

  if(preview){
    preview.classList.remove('hidden');
    preview.innerHTML=file.type.startsWith('video/')
      ? `<video controls playsinline preload="metadata" src="${escapeHtml(visualTrainingPreviewUrl)}"></video>`
      : `<img src="${escapeHtml(visualTrainingPreviewUrl)}" alt="Prévia da foto selecionada">`;
  }

  if(!$('visualTrainingTitle')?.value.trim()){
    $('visualTrainingTitle').value=String(file.name||'')
      .replace(/\.[^.]+$/,'')
      .replace(/[-_]+/g,' ')
      .trim();
  }

  showToast(`${kind} adicionada com sucesso.`);
}catch(error){
  visualTrainingSelectedFileCache=null;

  if(input){
    input.value='';
  }

  if(target){
    target.textContent='Nenhum arquivo selecionado.';
  }

  if(preview){
    preview.classList.add('hidden');
    preview.innerHTML='';
  }

  showToast(error.message);
}
}
function populateVisualTrainingOptions(){
  const componentList=$('industrialComponentList');
  if(componentList){
    componentList.innerHTML=industrialComponentOptions()
      .map(item=>`<option value="${escapeHtml(item)}"></option>`)
      .join('');
  }

  const machines=trainingMachineOptions();

  for(const id of [
    'visualTrainingMachine',
    'visualTrainingFilterMachine'
  ]){
    const element=$(id);
    if(!element)continue;

    const current=element.value;

    element.innerHTML=
      `<option value="">${
        id.includes('Filter')
          ? 'Todas as máquinas'
          : 'Geral / todas'
      }</option>`+
      machines.map(machine=>
        `<option value="${escapeHtml(machine)}">${escapeHtml(machine)}</option>`
      ).join('');

    if([...element.options].some(option=>option.value===current)){
      element.value=current;
    }
  }

  const machineTypes=[
    'bolo',
    'panetone',
    'pirotine',
    'pie',
    'tulip',
    'semi_acabado',
    'outros'
  ];

  for(const id of [
    'visualTrainingMachineType',
    'visualTrainingFilterMachineType'
  ]){
    const element=$(id);
    if(!element)continue;

    const current=element.value;

    element.innerHTML=
      `<option value="">${
        id.includes('Filter')
          ? 'Todos os tipos de máquina'
          : 'Selecione o tipo'
      }</option>`+
      machineTypes.map(type=>
        `<option value="${type}">${trainingMachineTypeLabel(type)}</option>`
      ).join('');

    if([...element.options].some(option=>option.value===current)){
      element.value=current;
    }
  }

  populateVisualProblemOptions();
}

function populateVisualProblemOptions(){
  const selectedMachine=
    $('visualTrainingMachine')?.value||'';

  const options=trainingProblemOptions(selectedMachine);

  for(const id of [
    'visualTrainingProblemType',
    'visualTrainingFilterProblemType'
  ]){
    const element=$(id);
    if(!element)continue;

    const current=element.value;

    element.innerHTML=
      `<option value="">${
        id.includes('Filter')
          ? 'Todos os tipos de problema'
          : 'Selecione o problema ou regulagem'
      }</option>`+
      options.map(problem=>
        `<option value="${escapeHtml(problem)}">${escapeHtml(problem)}</option>`
      ).join('');

    if([...element.options].some(option=>option.value===current)){
      element.value=current;
    }
  }
}

function initVisualTraining(){
  populateVisualTrainingOptions();

  $('visualTrainingMachine')?.addEventListener('change',event=>{
    const type=trainingMachineType(event.target.value);

    if($('visualTrainingMachineType')){
      $('visualTrainingMachineType').value=type;
    }

    populateVisualProblemOptions();
  });

  for(const inputId of [
    'visualTrainingCameraFile',
    'visualTrainingFile',
    'visualTrainingVideoFile'
  ]){
    const input=$(inputId);
    if(!input)continue;

    input.addEventListener('change',async event=>{
      await showVisualTrainingSelectedFile(inputId,event);
    });
  }

  $('createVisualTrainingBtn')?.addEventListener(
    'click',
    createVisualTraining
  );

  for(const id of [
    'visualTrainingSearch',
    'visualTrainingFilterMachine',
    'visualTrainingFilterMachineType',
    'visualTrainingFilterProblemType',
    'visualTrainingFilterType'
  ]){
    const element=$(id);
    if(!element)continue;

    element.addEventListener(
      id==='visualTrainingSearch'
        ? 'input'
        : 'change',
      renderVisualTrainingLibrary
    );
  }

  renderVisualTrainingLibrary();
  loadVisualTrainingCloud();
}

function liveHistory(){try{const a=JSON.parse(localStorage.getItem(STORAGE.liveDashboardHistory)||'[]');return Array.isArray(a)?a:[]}catch{return []}}
function liveSnapshot(){const m=state.reliability3Days||calculateReliability3Days(),s=state.sgmanHistory?.summary||{},rows=(m.rows||[]).filter(x=>x.machine).sort((a,b)=>(b.failureCount||0)-(a.failureCount||0)).slice(0,10);const stopped=rows.reduce((z,x)=>z+(Number(x.mttrMinutes||0)*Number(x.failureCount||0))/60,0);return{at:new Date().toISOString(),open:Number(s.open||0),overdue:Number(s.overdue||0),completed:Number(m.completedCurrentShift||0),mttr:m.mttrMinutes,mtbf:m.mtbfMinutes,reliability:m.reliabilityPercent,availability:Math.max(0,Math.min(100,((72-stopped)/72)*100)),recurrence:Number(m.recurrentMachines||0),rows}}
function saveLivePoint(x){const h=liveHistory();h.unshift({at:x.at,overdue:x.overdue,mttr:x.mttr,open:x.open,availability:x.availability});safeStorageSet(STORAGE.liveDashboardHistory,JSON.stringify(h.slice(0,100)),{removeOnFailure:true})}
function renderLiveDashboard(x=liveSnapshot()){const t=$('liveSgmanContent');if(!t)return;const max=Math.max(...x.rows.map(r=>Number(r.failureCount||0)),1);const hist=liveHistory().slice(0,12).reverse();t.innerHTML=`<div class="live-status"><span></span><strong>SGMan ao vivo</strong><small>${new Date(x.at).toLocaleString('pt-BR')}</small></div><div class="live-kpis">${[['OS abertas',x.open],['OS atrasadas',x.overdue],['Concluídas no turno',x.completed],['MTTR',formatReliabilityTime(x.mttr,'-')],['MTBF',formatReliabilityTime(x.mtbf,'-')],['Disponibilidade',x.availability.toFixed(1).replace('.',',')+'%'],['Confiabilidade 12h',formatReliabilityPercent(x.reliability,'-')],['Reincidências',x.recurrence]].map(a=>`<div class="metric"><span>${a[0]}</span><strong>${a[1]}</strong></div>`).join('')}</div><div class="live-grid"><section class="card"><h3>Histórico de OS atrasadas</h3><div class="spark-bars">${hist.map(v=>`<i style="height:${Math.max(5,Math.min(100,Number(v.overdue||0)))}%" title="${v.overdue}"></i>`).join('')}</div></section><section class="card"><h3>Falhas por máquina</h3><div class="machine-bars">${x.rows.map(r=>`<div><span>${escapeHtml(r.machine)}</span><b style="width:${(Number(r.failureCount||0)/max)*100}%"></b><strong>${r.failureCount||0}</strong></div>`).join('')}</div></section></div>`}
async function refreshLiveDashboard(){const b=$('refreshLiveSgmanBtn');if(b){b.disabled=true;b.textContent='Atualizando...'}try{await refreshSgmanHistory(true);state.reliability3Days=calculateReliability3Days();const x=liveSnapshot();saveLivePoint(x);renderLiveDashboard(x)}finally{if(b){b.disabled=false;b.textContent='Atualizar agora'}}}
function initLiveDashboard(){renderLiveDashboard();$('refreshLiveSgmanBtn')?.addEventListener('click',refreshLiveDashboard);$('startLiveSgmanBtn')?.addEventListener('click',()=>{if(state.liveTimer)clearInterval(state.liveTimer);const sec=Number($('liveInterval')?.value||60);state.liveTimer=setInterval(refreshLiveDashboard,Math.max(30,sec)*1000);refreshLiveDashboard()});$('stopLiveSgmanBtn')?.addEventListener('click',()=>{if(state.liveTimer)clearInterval(state.liveTimer);state.liveTimer=null;showToast('Painel pausado.')})}

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
  cleanupStorageOnStartup();
  forceCurrentAppVersion();
  const versionBadge = $('appVersionBadge');
  if (versionBadge) versionBadge.textContent = `V${APP_VERSION}`;

  $('reportReceivedAt').value = toLocalDateTimeInput(new Date());
  migrateConfirmedSgmanUsers();
  populateSgmanUserSelect('scaleSgmanMechanic1');
  populateSgmanUserSelect('scaleSgmanMechanic2');
  populateSgmanUserSelect('scaleSgmanMechanic3');
  const config = migrateSgmanConfig();
  fillOrganizationForm();
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

  $('quickOsDateTime').value = toLocalDateTimeInput(new Date());
  populateQuickOsMachineSelect();
  populateVirtualMechanicMachines();
  updateQuickOsContext();
  updateQuickOsTagStatus();

  state.sgmanHistory = getCachedSgmanHistory();
  state.sgmanMachineHistory = getCachedSgmanMachineHistory();
  renderSgmanDailyStatus();
  refreshSgmanHistory(false);

  const draft = localStorage.getItem(STORAGE.draft);
  if (draft) $('reportText').value = draft;


  $('openQuickOsBtn').addEventListener('click', () => {
    $('quickOsDateTime').value = toLocalDateTimeInput(new Date());
    populateQuickOsMachineSelect($('quickOsMachine').value);
    updateQuickOsContext();
    switchView('osrapida');
  });

  $('quickOsDateTime').addEventListener('change', updateQuickOsContext);
  $('quickOsMachine').addEventListener('change', updateQuickOsTagStatus);
  $('quickOsProblem').addEventListener('input', event => {
    detectQuickMachineFromText(event.target.value);
  });
  $('quickOsSpeechBtn').addEventListener('click', startQuickOsSpeech);

  $('quickOsPhotoInput').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      $('quickOsPhotoStatus').textContent = 'Preparando a foto...';
      const dataUrl = await compressQuickOsPhoto(file);
      state.quickOsPhotoDataUrl = dataUrl;
      $('quickOsPhotoPreview').src = dataUrl;
      $('quickOsPhotoWrap').classList.remove('hidden');
      $('quickOsPhotoStatus').textContent =
        'Foto pronta para ser anexada à OS.';
    } catch (error) {
      state.quickOsPhotoDataUrl = '';
      $('quickOsPhotoStatus').textContent =
        `Não foi possível preparar a foto: ${error.message}`;
    }
  });

  $('quickOsRemovePhotoBtn').addEventListener('click', () => {
    state.quickOsPhotoDataUrl = '';
    $('quickOsPhotoInput').value = '';
    $('quickOsPhotoPreview').src = '';
    $('quickOsPhotoWrap').classList.add('hidden');
    $('quickOsPhotoStatus').textContent = 'Foto removida.';
  });

  $('quickOsSendBtn').addEventListener('click', sendQuickOsToSgman);
  $('virtualMechanicRunBtn')?.addEventListener('click',runVirtualMechanic);
  $('virtualMechanicSpeechBtn')?.addEventListener('click',startVirtualMechanicSpeech);
  $('virtualMechanicClearBtn')?.addEventListener('click',clearVirtualMechanic);
  $('refreshKnowledgeGapsBtn')?.addEventListener('click',()=>{
    renderKnowledgeGapDashboard();
    showToast('Lacunas de conhecimento atualizadas.');
  });
  $('refreshManagementHistoryBtn')?.addEventListener('click',()=>{
    renderManagementHistory();
    showToast('Evolução mensal atualizada.');
  });
  $('managementHistoryStart')?.addEventListener('change',renderManagementHistory);


  $('virtualMechanicProblem')?.addEventListener('input',event=>{
    const machine=machineKeyFromText(event.target.value);

    if(machine){
      populateVirtualMechanicMachines(machine);
      $('virtualMechanicMachine').value=machine;
    }
  });
  $('quickOsClearBtn').addEventListener('click', () => {
    clearQuickOsForm(false);
    $('quickOsResult').textContent = '';
    showToast('Formulário da OS limpo.');
  });
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

  $('refreshMachineHistoryBtn').addEventListener('click', async () => {
    if (!state.analysis) {
      showToast('Analise um relatório primeiro.');
      return;
    }

    await loadSgmanMachineHistories(state.actions, true);
    applySgmanHistoryToActions();
    renderActions();
    renderAnalysis();
    showToast('Análise das OS por máquina atualizada.');
  });
  $('refreshReliabilityBtn').addEventListener('click', async () => {
    await refreshSgmanHistory(true);
    renderReliability3Days();
  });
  $('analyzeBtn').addEventListener('click', analyzeCurrentReport);
  $('sampleBtn').addEventListener('click', () => {
    $('reportText').value = SAMPLE_REPORT;
    safeStorageSet(STORAGE.draft, SAMPLE_REPORT);
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
    setAnalysisRunStatus('');
    localStorage.removeItem(STORAGE.draft);
  });
  $('reportText').addEventListener('input', e =>
    safeStorageSet(
      STORAGE.draft,
      compactTextForStorage(e.target.value, 30000)
    )
  );
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
  $('copyMaintenanceAccountabilityBtn')?.addEventListener('click', () => copyText(maintenanceAccountabilityReport(), 'Relatório de cobrança copiado.'));
  $('refreshMaintenanceAccountabilityBtn')?.addEventListener('click', async () => {
    const button = $('refreshMaintenanceAccountabilityBtn');
    button.disabled = true;
    button.textContent = 'Atualizando...';
    try {
      await refreshSgmanHistory(true);
      state.reliability3Days = calculateReliability3Days();
      renderMaintenanceAccountabilityPanel();
      showToast('Gestão da manutenção atualizada.');
    } finally {
      button.disabled = false;
      button.textContent = 'Atualizar gestão';
    }
  });

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

  $('saveOrganizationBtn')?.addEventListener(
    'click',
    saveOrganizationSettings
  );

  $('exportOrganizationBtn')?.addEventListener(
    'click',
    exportOrganizationProfile
  );

  $('importOrganizationInput')?.addEventListener(
    'change',
    async event => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        await importOrganizationProfileFile(file);
        fillOrganizationForm();
        renderScale();
        populateQuickOsMachineSelect();
        showToast('Configuração da empresa importada.');
      } catch (error) {
        showToast(`Falha ao importar: ${error.message}`);
      } finally {
        event.target.value = '';
      }
    }
  );

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
    populateQuickOsMachineSelect($('quickOsMachine')?.value || '');
    updateQuickOsTagStatus();
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
        const registration = await navigator.serviceWorker.register('/sw.js?v=98.5.0');
        registration.update();
      } catch {}
    });
  }

  renderAnalysis();
  renderActions();
  renderScale();
  renderHistory();
  renderOeeDashboard();
  initMaintenanceManagerHome();
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    init();
  } catch (error) {
    console.error('Falha em um módulo do TurnoSmart:', error);

    const banner = document.createElement('div');
    banner.className = 'runtime-error-banner';
    banner.innerHTML =
      `<strong>Uma função não iniciou:</strong> ${escapeHtml(error.message)}. ` +
      `A navegação e as outras páginas continuam disponíveis.`;

    document.body.prepend(banner);
  }
});

function applySmartRealPlan(){
  const plan=smartFormatNextShiftPlan();
  state.realNextShiftPlanText=plan;

  const selectors=[
    '#maintenanceActionsText','#actionsText',
    '#dailyReportText','#maintenanceReportText'
  ];

  for(const selector of selectors){
    const el=document.querySelector(selector);
    if(!el)continue;
    const current=('value' in el?el.value:el.textContent)||'';
    if(!current)continue;

    const markers=[
      '*COMPROMISSOS DAS MÁQUINAS*',
      '*PLANO DO PRÓXIMO TURNO*',
      '*PRIORIDADES DO TURNO*'
    ];
    const marker=markers.find(item=>current.includes(item));
    if(!marker)continue;

    const before=current.split(marker)[0];
    const next=`${marker}\n${plan}\n\n*Resolver durante o turno.*\n*SGMan:* registrar causa real, serviço executado e resultado do teste.`;

    if('value' in el)el.value=before+next;
    else el.textContent=before+next;
  }
}

document.addEventListener('click',event=>{
  const text=normalizeKey(event.target?.textContent||'');
  if(text.includes('analisar relatorio')||text.includes('gerar relatorio')||text==='acoes'){
    setTimeout(applySmartRealPlan,500);
  }
});

document.addEventListener('click',event=>{
  if(event.target?.id==='refreshSupervisorFusionBtn'){
    renderSupervisorFusionPanel();
    showToast('Prioridades atualizadas com quadro e relatório da produção.');
  }
});

document.addEventListener('click',event=>{
  if(event.target?.id==='refreshDynamicSgmanBtn') refreshDynamicSgmanManagement();
  if(event.target?.id==='applyDynamicSgmanFiltersBtn') renderDynamicSgmanManagement();
  if(event.target?.id==='clearDynamicSgmanFiltersBtn') clearDynamicSgmanFilters();
  if(event.target?.id==='loadAllSgmanHistoryBtn') loadAllDynamicSgmanHistory();
});
document.addEventListener('change',event=>{
  if(event.target?.id==='sgmanManagementMonth'){ const range=sgmanMonthRange(event.target.value); if(range){ $('sgmanManagementStart').value=sgmanDateInputValue(range.start); $('sgmanManagementEnd').value=sgmanDateInputValue(range.end); $('sgmanManagementDay').value=''; }}
  if(['sgmanManagementDay','sgmanManagementMachine','sgmanManagementMechanic','sgmanManagementType','sgmanManagementStatus'].includes(event.target?.id)) renderDynamicSgmanManagement();
});

document.addEventListener('click',event=>{
  if(event.target?.id==='reloadPowerBiOeeBtn') loadEmbeddedPowerBiOee(true);
  if(event.target?.id==='applyPowerBiOeeFiltersBtn') renderPowerBiSgmanDashboard();
  if(event.target?.id==='clearPowerBiOeeFiltersBtn') clearPowerBiOeeFilters();
});

document.addEventListener('change',event=>{
  if(['powerBiOeeStart','powerBiOeeEnd','powerBiOeeMachine','powerBiOeeProduct'].includes(event.target?.id)){
    renderPowerBiSgmanDashboard();
  }
});

document.addEventListener('click',event=>{
  if(event.target?.id==='unlockLaborCostBtn'){
    unlockLaborCosts();
  }
});

document.addEventListener('change',event=>{
  if([
    'laborHoursPerMonth',
    'laborEmployerMultiplier'
  ].includes(event.target?.id) && laborCostState().unlocked){
    const badge=$('laborCostSecurityBadge');
    if(badge)badge.textContent='🔐 Revalide para recalcular';
  }
});
