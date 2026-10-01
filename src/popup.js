function $(id) {
  return document.getElementById(id);
}
let hintClearTimer = null;
function setHint(text, isError = false) {
  const el = $('status-hint');
  if (!el) return;
  el.textContent = text || '';
  el.style.color = isError ? 'var(--danger)' : 'var(--sub)';
  if (hintClearTimer) clearTimeout(hintClearTimer);
  hintClearTimer = text && !isError ? setTimeout(() => {
    el.textContent = '';
    hintClearTimer = null;
  }, 3000) : null;
}
function getSitesApi() {
  return window?.ReadyAi?.sites;
}
const SOUND_PRESETS = Object.freeze({
  off: 'off',
  soft: 'soft',
  double: 'double',
  triple: 'triple',
  long: 'long',
  custom: 'custom',
});
const POPUP_FAVORITE_ITEMS = Object.freeze({
  alerts: { title: '완료 알림', icon: 'bell.svg', toggle: 'alerts', sheet: 'alerts-sheet' },
  steering: { title: '후속 지시', icon: 'message.svg', toggle: 'steering', sheet: 'steering-sheet' },
  dnd: { title: '방해 금지', icon: 'shield-off.svg', toggle: 'dnd', sheet: 'alerts-sheet', anchor: 'alerts-dnd-section' },
  sites: { title: '사이트', icon: 'window.svg', sheet: 'builtin-sites-sheet' },
  templates: { title: '후속 지시 템플릿', icon: 'message.svg', sheet: 'steering-sheet', anchor: 'steering-templates-section' },
  titles: { title: '탭 이름과 현황', icon: 'window.svg', sheet: 'title-manager-sheet' },
  advanced: { title: '고급 설정', icon: 'settings.svg', sheet: 'advanced-sheet' },
  utilities: { title: '데이터 관리', icon: 'settings.svg', sheet: 'advanced-sheet', anchor: 'advanced-data-tools-section' },
  gemini: { title: 'Gemini 감지', icon: 'bell.svg', sheet: 'builtin-sites-sheet', anchor: 'site-gemini-section' },
});
const DEFAULT_POPUP_FAVORITES = Object.freeze(['alerts', 'steering', 'dnd']);
const MAX_CUSTOM_SOUND_FILE_BYTES = 1024 * 1024 * 2;
const MAX_TEMPLATE_COUNT = 20;
const MAX_TEMPLATE_NAME_LENGTH = 24;
const MAX_TEMPLATE_TOOLTIP_LENGTH = 160;
let runtimeSnapshot = {
  items: [],
  history: [],
  snoozeUntil: 0,
  quietHoursActive: false,
  suppressionReason: '',
};
let dashboardTimer = null;
let dashboardRefreshInFlight = null;
let lastDashboardListSignature = '';
let lastDashboardStatsSignature = '';
let lastHistorySignature = '';
let lastDashboardVersionSeen = 0;
let lastDashboardFetchedAt = 0;
let lastTitleManagerListSignature = '';
let lastFavoritesRenderSignature = '';
const DASHBOARD_META_FORCE_REFRESH_MS = 30000;
let dashboardView = {
  filter: 'ALL',
  sort: 'status',
  search: '',
};
let currentPopupConfig = null;
let pendingConfigSaveTimer = null;
let pendingConfigSavePayload = null;
let pendingConfigSaveSignature = '';
let lastSavedConfigSignature = '';
let pendingConfigSaveCallbacks = [];
let filteredDashboardCacheKey = '';
let filteredDashboardCacheItems = [];
let lastRelativeTimeBucket = -1;
const CONFIG_SAVE_DEBOUNCE_MS = 120;
const DASHBOARD_RELATIVE_TIME_BUCKET_MS = 30000;
const DASHBOARD_SEARCH_DEBOUNCE_MS = 120;
const CUSTOM_TAB_TITLE_MAX_LENGTH = 80;
const DASHBOARD_LONG_RUNNING_MS = 10 * 60 * 1000;
const SMART_BRIEFING_ITEM_LIMIT = 8;
function soundPresetLabel(soundKey) {
  switch (soundKey) {
    case SOUND_PRESETS.off: return '없음';
    case SOUND_PRESETS.soft: return '기본 1회';
    case SOUND_PRESETS.double: return '기본 2회';
    case SOUND_PRESETS.triple: return '기본 3회';
    case SOUND_PRESETS.long: return '길게 1회';
    case SOUND_PRESETS.custom: return '사용자 파일';
    default: return String(soundKey || '기본 1회');
  }
}
function clampInt(v, fallback, min, max) {
  const n = parseInt(v, 10);
  const out = Number.isFinite(n) ? n : fallback;
  if (typeof min === 'number' && out < min) return min;
  if (typeof max === 'number' && out > max) return max;
  return out;
}
function clampNumber(v, fallback, min, max) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  const out = Number.isFinite(n) ? n : fallback;
  if (typeof min === 'number' && out < min) return min;
  if (typeof max === 'number' && out > max) return max;
  return out;
}
function normalizePopupFavorites(value) {
  const input = Array.isArray(value) ? value : DEFAULT_POPUP_FAVORITES;
  const seen = new Set();
  return input.map((id) => {
    const key = String(id || '').trim();
    return key === 'custom-sites' ? 'sites' : key;
  }).filter((key) => {
    if (!POPUP_FAVORITE_ITEMS[key] || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function normalizeSoundKey(soundKey, fallback) {
  const key = String(soundKey || '').trim();
  return Object.prototype.hasOwnProperty.call(SOUND_PRESETS, key) ? key : fallback;
}
function volumeToPercent(volume) {
  return clampInt(Math.round(clampNumber(volume, 0.8, 0, 1) * 100), 80, 0, 100);
}
function percentToVolume(percent) {
  return clampNumber(percent / 100, 0.8, 0, 1);
}
function normalizeSteeringNewChatTabCount(value) {
  return clampInt(value, 3, 1, 8);
}
function normalizeClockTime(value, fallback = '23:00') {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return fallback;
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10) || 0));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10) || 0));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
function clockTimeToMinutes(value, fallback = 0) {
  const normalized = normalizeClockTime(value, '00:00');
  const [hh, mm] = normalized.split(':').map((v) => parseInt(v, 10) || 0);
  return (hh * 60) + mm;
}
function truncateText(value, max = 80) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}
function formatVerificationPlanCount(value) {
  const count = Math.max(0, Number(value) || 0);
  if (count >= 10000 && count % 10000 === 0) return `${count / 10000}만`;
  if (count >= 10000) return `${(count / 10000).toFixed(1)}만`;
  return String(count);
}
function getVerificationUiModel(data = {}) {
  const groups = Array.isArray(data.groups) ? data.groups.filter(Boolean) : [];
  const manualChecks = Array.isArray(data.manualChecks) ? data.manualChecks.filter(Boolean) : [];
  const categories = Array.isArray(data.categories) ? data.categories.filter(Boolean) : [];
  const passedGroups = groups.filter((group) => group.status === 'passed').length;
  const passedManualChecks = manualChecks.filter((check) => check.status === 'passed').length;
  const scheduledManualChecks = manualChecks.filter((check) => check.status === 'scheduled').length;
  const platformDefinitions = Array.isArray(data.platforms) ? data.platforms.filter(Boolean) : [];
  const platforms = platformDefinitions.map((platform) => {
    const platformGroups = groups.filter((group) => Array.isArray(group.platforms) && group.platforms.includes(platform.id));
    const platformManualChecks = manualChecks.filter((check) => check.platform === platform.id);
    const groupCategories = categories
      .map((category) => ({ ...category, items: platformGroups.filter((group) => group.category === category.id) }))
      .filter((category) => category.items.length > 0);
    const manualCategories = categories
      .map((category) => ({ ...category, items: platformManualChecks.filter((check) => check.category === category.id) }))
      .filter((category) => category.items.length > 0);
    return {
      ...platform,
      groups: platformGroups,
      manualChecks: platformManualChecks,
      groupCategories,
      manualCategories,
    };
  });
  const automatedPassed = data?.automated?.status === 'passed' && groups.length > 0 && passedGroups === groups.length;
  const liveWebPassed = data?.liveWeb?.status === 'passed' && manualChecks.length > 0 && passedManualChecks === manualChecks.length;
  const progress = groups.length ? Math.round((passedGroups / groups.length) * 100) : 0;
  return {
    suiteVersion: String(data.suiteVersion || '0.0.0'),
    appVersion: String(data.appVersion || '확인 필요'),
    completedAt: String(data.completedAt || ''),
    groups,
    manualChecks,
    categories,
    platforms,
    passedGroups,
    passedManualChecks,
    scheduledManualChecks,
    automatedPassed,
    liveWebPassed,
    liveWebStatus: String(data?.liveWeb?.status || 'scheduled'),
    progress,
    repeatRounds: Math.max(0, Number(data?.automated?.repeatRounds) || 0),
    randomizedPlansLabel: formatVerificationPlanCount(data?.automated?.randomizedPlansPerRound),
    automatedSummary: String(data?.automated?.summary || ''),
    liveWebSummary: String(data?.liveWeb?.summary || ''),
    liveWebNote: String(data?.liveWeb?.note || ''),
  };
}
function setVerificationText(id, value) {
  const el = $(id);
  if (el) el.textContent = String(value ?? '');
}
function resetVerificationList(container) {
  if (!container) return;
  if (typeof container.replaceChildren === 'function') container.replaceChildren();
  else container.textContent = '';
}
function appendVerificationResultRow(container, item, options = {}) {
  if (!container || !item) return;
  const passed = item.status === 'passed';
  const scheduled = item.status === 'scheduled';
  const row = document.createElement('div');
  row.className = options.manual ? 'verification-manual-row' : 'verification-group-row';
  const icon = document.createElement('img');
  icon.src = passed ? '../assets/icons/status-complete.svg' : '../assets/icons/status-queue.svg';
  icon.alt = '';
  const copy = document.createElement('span');
  copy.className = 'verification-row-copy';
  const title = document.createElement('strong');
  title.textContent = options.manual
    ? `${item.id} · ${item.name}`
    : `${item.name} · 항목 V${item.version}`;
  const passVersion = document.createElement('span');
  passVersion.className = `verification-pass-version${passed ? '' : ' pending'}`;
  const passedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(item.passedAt || ''))
    ? ` · ${String(item.passedAt).slice(5).replace('-', '.')}`
    : '';
  passVersion.textContent = passed
    ? `통과 앱 버전 · ${item.passedInAppVersion || '기록 없음'}${passedDate}`
    : '통과 앱 버전 · 아직 없음';
  const meta = document.createElement('span');
  if (options.manual) {
    const delayText = Array.isArray(item.delaysMs) && item.delaysMs.length
      ? ` · ${item.delaysMs.join('/')}ms`
      : '';
    meta.textContent = item.evidence || `해당 플랫폼 실웹에서 확인${delayText}`;
  } else {
    meta.textContent = `${item.id} · ${item.evidence || item.summary || '자동 검증'}`;
    if (item.summary) title.title = item.summary;
  }
  copy.appendChild(title);
  copy.appendChild(passVersion);
  copy.appendChild(meta);
  const status = document.createElement('span');
  status.className = `verification-result-pill${passed ? '' : ' pending'}`;
  status.textContent = passed ? '통과' : (scheduled ? '변동 시' : '대기');
  row.appendChild(icon);
  row.appendChild(copy);
  row.appendChild(status);
  container.appendChild(row);
}
function appendVerificationPlatformSection(container, platform, items, options = {}) {
  if (!container || !platform || !Array.isArray(items) || !items.length) return;
  const section = document.createElement('section');
  section.className = 'verification-platform-section';
  section.dataset.platform = String(platform.id || '');
  const head = document.createElement('div');
  head.className = 'verification-platform-head';
  const title = document.createElement('strong');
  const platformLabel = String(platform.label || platform.id || '');
  const platformName = String(platform.name || platformLabel);
  title.textContent = platformLabel === platformName ? platformName : `${platformLabel} · ${platformName}`;
  const count = document.createElement('span');
  const passedCount = items.filter((item) => item.status === 'passed').length;
  count.textContent = options.manual ? `${passedCount}/${items.length} 기준선` : `${passedCount}/${items.length} 통과`;
  const rows = document.createElement('div');
  rows.className = 'verification-platform-rows';
  const categoryGroups = Array.isArray(options.categories) ? options.categories.filter((category) => category?.items?.length) : [];
  if (categoryGroups.length) {
    categoryGroups.forEach((category, index) => {
      const details = document.createElement('details');
      details.className = 'verification-category';
      details.dataset.category = String(category.id || '');
      details.open = index === 0;
      const summary = document.createElement('summary');
      summary.className = 'verification-category-summary';
      const categoryCopy = document.createElement('span');
      categoryCopy.className = 'verification-category-copy';
      const categoryTitle = document.createElement('strong');
      categoryTitle.textContent = String(category.label || category.id || '기타');
      const categoryDescription = document.createElement('span');
      categoryDescription.textContent = String(category.description || '관련 검증 항목');
      const categoryCount = document.createElement('span');
      categoryCount.className = 'verification-category-count';
      const categoryPassed = category.items.filter((item) => item.status === 'passed').length;
      categoryCount.textContent = options.manual
        ? (categoryPassed ? `${categoryPassed}/${category.items.length} 기준선` : `${category.items.length}개 · 변동 시`)
        : `${categoryPassed}/${category.items.length} 통과`;
      categoryCopy.appendChild(categoryTitle);
      categoryCopy.appendChild(categoryDescription);
      summary.appendChild(categoryCopy);
      summary.appendChild(categoryCount);
      const categoryRows = document.createElement('div');
      categoryRows.className = 'verification-category-rows';
      category.items.forEach((item) => appendVerificationResultRow(categoryRows, item, options));
      details.appendChild(summary);
      details.appendChild(categoryRows);
      rows.appendChild(details);
    });
  } else {
    items.forEach((item) => appendVerificationResultRow(rows, item, options));
  }
  head.appendChild(title);
  head.appendChild(count);
  section.appendChild(head);
  section.appendChild(rows);
  container.appendChild(section);
}
function activateVerificationPlatform(model, platformId) {
  const platform = model?.platforms?.find((item) => item.id === platformId) || model?.platforms?.[0];
  if (!platform) return;
  document.querySelectorAll('[data-verification-platform-tab]').forEach((button) => {
    const active = button.dataset.verificationPlatformTab === platform.id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('#verification-group-list .verification-platform-section, #verification-manual-list .verification-platform-section').forEach((section) => {
    section.hidden = section.dataset.platform !== platform.id;
  });
  const manualPassed = platform.manualChecks.filter((item) => item.status === 'passed').length;
  setVerificationText('verification-group-heading', `${platform.label} 자동 검증`);
  setVerificationText('verification-group-count-label', `${platform.groups.length}개 · 카테고리 ${platform.groupCategories.length}`);
  setVerificationText('verification-manual-heading', `${platform.label} 실웹 확인`);
  setVerificationText('verification-manual-count-label', `${manualPassed}/${platform.manualChecks.length} 기준선 · 카테고리 ${platform.manualCategories.length}`);
}
function renderVerificationPlatformTabs(container, model) {
  if (!container || !Array.isArray(model?.platforms)) return;
  const previousPlatformId = container.querySelector('.verification-platform-tab.active')?.dataset.verificationPlatformTab || '';
  resetVerificationList(container);
  model.platforms.forEach((platform) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'verification-platform-tab';
    button.dataset.verificationPlatformTab = String(platform.id || '');
    button.setAttribute('role', 'tab');
    const title = document.createElement('strong');
    title.textContent = String(platform.label || platform.name || platform.id || '');
    const count = document.createElement('span');
    const manualPassed = platform.manualChecks.filter((item) => item.status === 'passed').length;
    count.textContent = `자동 ${platform.groups.length} · 실웹 ${manualPassed}/${platform.manualChecks.length}`;
    button.appendChild(title);
    button.appendChild(count);
    button.addEventListener('click', () => activateVerificationPlatform(model, platform.id));
    container.appendChild(button);
  });
  const initialPlatformId = model.platforms.some((platform) => platform.id === previousPlatformId)
    ? previousPlatformId
    : model.platforms[0]?.id;
  activateVerificationPlatform(model, initialPlatformId);
}
function renderVerificationCenter(data) {
  const model = getVerificationUiModel(data);
  const progress = $('verification-progress-home');
  const progressTrack = progress?.parentElement || null;
  const card = $('verification-card');
  if (card) card.dataset.status = model.automatedPassed ? 'passed' : 'attention';
  setVerificationText('verification-card-title', model.automatedPassed ? '자동 안정화 검증 완료' : '자동 검증 확인 필요');
  setVerificationText('verification-run-summary-home', `앱 ${model.appVersion} · 자동 검증 ${model.repeatRounds}회`);
  setVerificationText('verification-suite-version-home', `검증팩 V${model.suiteVersion.replace(/\.0$/, '')}`);
  setVerificationText('verification-stat-gpt', `${model.platforms.find((platform) => platform.id === 'chatgpt')?.groups.length || 0}개`);
  setVerificationText('verification-stat-gemini', `${model.platforms.find((platform) => platform.id === 'gemini')?.groups.length || 0}개`);
  setVerificationText('verification-stat-ais', `${model.platforms.find((platform) => platform.id === 'aistudio')?.groups.length || 0}개`);
  if (progress) progress.style.width = `${model.progress}%`;
  if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(model.progress));

  setVerificationText('verification-status-detail', model.automatedPassed ? '자동 검증 완료' : '자동 검증 확인 필요');
  setVerificationText('verification-version-detail', `검증팩 V${model.suiteVersion} · 앱 ${model.appVersion}`);
  const dateParts = model.completedAt.split('-').filter(Boolean);
  const shortDate = dateParts.length === 3 ? `${dateParts[1]}.${dateParts[2]} 완료` : '날짜 확인';
  setVerificationText('verification-date-detail', shortDate);
  setVerificationText('verification-groups-detail', String(model.groups.length));
  setVerificationText('verification-rounds-detail', `${model.repeatRounds}회`);
  setVerificationText('verification-random-detail', model.randomizedPlansLabel);
  setVerificationText('verification-live-title', model.liveWebSummary || (model.liveWebPassed ? '플랫폼별 실웹 검증 완료' : '플랫폼별 실웹 검증 예약'));
  setVerificationText('verification-live-copy', model.liveWebNote || '실제 웹 시나리오 상태를 확인합니다.');
  const groupList = $('verification-group-list');
  resetVerificationList(groupList);
  model.platforms.forEach((platform) => appendVerificationPlatformSection(groupList, platform, platform.groups, {
    categories: platform.groupCategories,
  }));
  const manualList = $('verification-manual-list');
  resetVerificationList(manualList);
  model.platforms.forEach((platform) => appendVerificationPlatformSection(manualList, platform, platform.manualChecks, {
    manual: true,
    categories: platform.manualCategories,
  }));
  renderVerificationPlatformTabs($('verification-platform-tabs'), model);
  return model;
}
async function loadVerificationCenter() {
  try {
    const url = typeof chrome !== 'undefined' && chrome.runtime?.getURL
      ? chrome.runtime.getURL('src/verification-suite.json')
      : 'verification-suite.json';
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`verification_http_${response.status}`);
    renderVerificationCenter(await response.json());
    return true;
  } catch (_) {
    setVerificationText('verification-card-title', '검증 정보 확인 필요');
    setVerificationText('verification-run-summary-home', '검증 데이터 파일을 불러오지 못했습니다.');
    setVerificationText('verification-stat-gpt', '-');
    setVerificationText('verification-stat-gemini', '-');
    setVerificationText('verification-stat-ais', '-');
    return false;
  }
}
function buildTemplateId() {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function normalizeTemplateItem(item, index = 0) {
  if (typeof item === 'string') {
    const text = String(item || '').trim();
    if (!text) return null;
    return {
      id: buildTemplateId(),
      name: truncateText(`템플릿 ${index + 1}`, MAX_TEMPLATE_NAME_LENGTH),
      text,
      tooltip: '',
    };
  }
  if (!item || typeof item !== 'object') return null;
  const text = String(item.text ?? item.content ?? '').trim();
  if (!text) return null;
  const rawName = String(item.name ?? item.title ?? item.label ?? '').trim();
  const rawTooltip = String(item.tooltip ?? item.note ?? item.description ?? '').trim();
  return {
    id: String(item.id || buildTemplateId()),
    name: truncateText(rawName || `템플릿 ${index + 1}`, MAX_TEMPLATE_NAME_LENGTH),
    text,
    tooltip: truncateText(rawTooltip, MAX_TEMPLATE_TOOLTIP_LENGTH),
  };
}
function normalizeTemplateList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => normalizeTemplateItem(item, index)).filter(Boolean).slice(0, MAX_TEMPLATE_COUNT);
}
function getTemplateTooltip(template) {
  const parts = [];
  const name = truncateText(template?.name || '', MAX_TEMPLATE_NAME_LENGTH);
  const tooltip = String(template?.tooltip || '').trim();
  const text = String(template?.text || '').trim();
  if (name) parts.push(name);
  if (tooltip) parts.push(tooltip);
  if (text) parts.push(`문구: ${text}`);
  return parts.join('\n');
}
function getTemplatePreview(template) {
  const tooltip = String(template?.tooltip || '').trim();
  if (tooltip) return truncateText(tooltip, 60);
  return truncateText(template?.text || '', 60);
}
function readTemplateEditor() {
  const name = truncateText($('template-name')?.value || '', MAX_TEMPLATE_NAME_LENGTH);
  const text = String($('template-draft')?.value || '').trim();
  const tooltip = truncateText($('template-tooltip')?.value || '', MAX_TEMPLATE_TOOLTIP_LENGTH);
  const editingId = String($('template-editing-id')?.value || '').trim();
  return { id: editingId, name: name || '템플릿', text, tooltip };
}
function setTemplateEditorState(template = null) {
  const editingId = $('template-editing-id');
  const name = $('template-name');
  const draft = $('template-draft');
  const tooltip = $('template-tooltip');
  const label = $('template-editor-mode');
  const cancelBtn = $('cancel-template-edit');
  if (template) {
    if (editingId) editingId.value = String(template.id || '');
    if (name) name.value = String(template.name || '');
    if (draft) draft.value = String(template.text || '');
    if (tooltip) tooltip.value = String(template.tooltip || '');
    if (label) label.textContent = `수정 중 · ${truncateText(template.name || '템플릿', 18)}`;
    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
    return;
  }
  if (editingId) editingId.value = '';
  if (name) name.value = '';
  if (draft) draft.value = currentPopupConfig?.steeringRecentDraft || '';
  if (tooltip) tooltip.value = '';
  if (label) label.textContent = '새 템플릿';
  if (cancelBtn) cancelBtn.style.display = 'none';
}
function isQuietHoursActiveLocal(cfg, ts = Date.now()) {
  if (!cfg?.quietHoursEnabled) return false;
  const start = clockTimeToMinutes(cfg.quietHoursStart, 23 * 60);
  const end = clockTimeToMinutes(cfg.quietHoursEnd, 8 * 60);
  if (start === end) return true;
  const d = new Date(ts);
  const nowMinutes = (d.getHours() * 60) + d.getMinutes();
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}
function getQuietHoursLabel(cfg) {
  const start = normalizeClockTime(cfg?.quietHoursStart, '23:00');
  const end = normalizeClockTime(cfg?.quietHoursEnd, '08:00');
  return `${start} ~ ${end}`;
}
function getRuntimeSuppressionLabel(cfg) {
  if (cfg?.dndMode) return '방해 금지 중';
  if (runtimeSnapshot.snoozeUntil > Date.now()) return `스누즈 ~ ${formatDateTime(runtimeSnapshot.snoozeUntil)}`;
  if (runtimeSnapshot.quietHoursActive || isQuietHoursActiveLocal(cfg)) return `조용한 시간 ${getQuietHoursLabel(cfg)}`;
  return '알림 활성';
}
function getVisibleDashboardItems() {
  return getFilteredDashboardItems();
}
function getVisibleDashboardLinksText(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const title = item.title || item.siteName || `탭 ${item.tabId}`;
    return `${title}\n${item.url || ''}`.trim();
  }).join('\n\n');
}
function getVisibleDashboardSummary(items) {
  const list = Array.isArray(items) ? items : [];
  const orange = list.filter((item) => item.status === 'ORANGE').length;
  const green = list.filter((item) => item.status === 'GREEN').length;
  const queued = list.reduce((sum, item) => sum + Math.max(0, Number(item.steeringQueueCount) || 0), 0);
  return { total: list.length, orange, green, queued };
}

function getDashboardItemTitle(item) {
  return String(item?.title || item?.siteName || getHostLabel(item?.url || '') || `탭 ${item?.tabId || ''}`).trim();
}
function getDashboardItemHost(item) {
  return String(item?.host || getHostLabel(item?.url || '') || 'URL 없음').trim();
}
function formatDurationShort(ms) {
  const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (sec < 60) return `${sec}초`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간`;
  const day = Math.round(hr / 24);
  return `${day}일`;
}
function getDashboardRunningDurationMs(item, now = Date.now()) {
  if (item?.status !== 'ORANGE') return 0;
  const since = clampInt(item?.orangeSinceAt, 0, 0, Number.MAX_SAFE_INTEGER);
  if (!since) return 0;
  return Math.max(0, now - since);
}
function isLongRunningDashboardItem(item, now = Date.now()) {
  return getDashboardRunningDurationMs(item, now) >= DASHBOARD_LONG_RUNNING_MS;
}
function getDashboardItemRunningLabel(item, now = Date.now()) {
  const durationMs = getDashboardRunningDurationMs(item, now);
  if (!durationMs) return '';
  const label = `진행 ${formatDurationShort(durationMs)}`;
  return isLongRunningDashboardItem(item, now) ? `${label} · 장기 진행` : label;
}
function getDashboardDynamicSuffixFromElement(el, fallbackSuffix = '') {
  if (!el) return fallbackSuffix || '';
  const staticSuffix = el.getAttribute('data-static-suffix') || fallbackSuffix || '';
  const status = el.getAttribute('data-status') || '';
  const orangeSinceAt = clampInt(el.getAttribute('data-orange-since-at'), 0, 0, Number.MAX_SAFE_INTEGER);
  if (status !== 'ORANGE' || !orangeSinceAt) return staticSuffix;
  const runningLabel = getDashboardItemRunningLabel({ status, orangeSinceAt });
  return runningLabel ? ` · ${runningLabel}${staticSuffix}` : staticSuffix;
}
function buildSmartBriefingItemLine(item, now = Date.now()) {
  const title = getDashboardItemTitle(item);
  const host = getDashboardItemHost(item);
  const status = statusLabel(item?.status);
  const queueCount = Math.max(0, Number(item?.steeringQueueCount) || 0);
  const runningLabel = getDashboardItemRunningLabel(item, now);
  const customTitle = normalizeCustomTabTitleValue(item?.customTabTitle || '');
  const meta = [item?.siteName || item?.platform || '미확인', host, runningLabel, queueCount ? `대기열 ${queueCount}` : '', customTitle ? `이름변경 ${customTitle}` : '']
    .filter(Boolean)
    .join(' · ');
  const url = String(item?.url || '').trim();
  return `- [${status}] ${title}${meta ? ` · ${meta}` : ''}${url ? `\n  ${url}` : ''}`;
}
function buildSmartDashboardBriefing(items, options = {}) {
  const now = Date.now();
  const list = Array.isArray(items) ? items.slice() : [];
  const summary = getVisibleDashboardSummary(list);
  const longRunning = list.filter((item) => isLongRunningDashboardItem(item, now));
  const completed = list.filter((item) => item.status === 'GREEN');
  const running = list.filter((item) => item.status === 'ORANGE');
  const queued = list.filter((item) => Math.max(0, Number(item.steeringQueueCount) || 0) > 0);
  const lines = [];
  lines.push('Ready_Ai 스마트 브리핑');
  lines.push(`생성: ${formatDateTime(now)}`);
  lines.push(`범위: ${options.scopeLabel || '현재 표시 탭'} · ${summary.total}개`);
  lines.push(`요약: 진행중 ${summary.orange} · 완료 ${summary.green} · 대기열 ${summary.queued} · 장기 진행 ${longRunning.length}`);
  const recommendations = [];
  if (completed.length) recommendations.push(`완료 탭 ${completed.length}개를 먼저 검토`);
  if (longRunning.length) recommendations.push(`10분 이상 진행중 ${longRunning.length}개는 강제 확인 또는 탭 열기로 상태 재확인`);
  if (queued.length) recommendations.push(`후속 지시 대기열이 있는 탭 ${queued.length}개는 전송 순서 확인`);
  if (!recommendations.length && running.length) recommendations.push('진행중 탭 완료 알림 대기');
  if (!recommendations.length) recommendations.push('현재 긴급 처리할 탭 없음');
  lines.push('추천:');
  recommendations.forEach((text) => lines.push(`- ${text}`));
  const priority = [
    ...longRunning,
    ...completed.filter((item) => !longRunning.some((longItem) => longItem.tabId === item.tabId)),
    ...running.filter((item) => !longRunning.some((longItem) => longItem.tabId === item.tabId)),
    ...queued.filter((item) => !longRunning.some((longItem) => longItem.tabId === item.tabId) && !completed.some((doneItem) => doneItem.tabId === item.tabId) && !running.some((runItem) => runItem.tabId === item.tabId)),
    ...list,
  ];
  const seen = new Set();
  const uniquePriority = [];
  for (const item of priority) {
    const key = item?.tabId;
    if (!Number.isFinite(key) || seen.has(key)) continue;
    seen.add(key);
    uniquePriority.push(item);
    if (uniquePriority.length >= SMART_BRIEFING_ITEM_LIMIT) break;
  }
  if (uniquePriority.length) {
    lines.push('우선 탭:');
    uniquePriority.forEach((item) => lines.push(buildSmartBriefingItemLine(item, now)));
  }
  return lines.join('\n');
}
async function copySmartDashboardBriefing(items, options = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    setHint('브리핑할 표시 탭이 없음', true);
    return false;
  }
  return copyTextToClipboard(buildSmartDashboardBriefing(list, options), '스마트 브리핑 복사됨');
}

function buildDashboardListSignature(items, view) {
  const list = Array.isArray(items) ? items : [];
  return JSON.stringify({
    view: { filter: view?.filter || 'ALL', sort: view?.sort || 'status', search: view?.search || '' },
    items: list.map((item) => [item.tabId, item.status, item.title || '', item.host || '', item.siteName || '', item.platform || '', item.lastUpdateAt || 0, item.orangeSinceAt || 0, item.steeringQueueCount || 0, !!item.active, !!item.discarded, !!item.hasCustomTabTitle, item.customTabTitle || '']),
  });
}
function buildHistorySignature(history) {
  const list = Array.isArray(history) ? history.slice(0, 12) : [];
  return JSON.stringify({
    items: list.map((item) => [item.kind || '', item.at || 0, item.siteName || '', item.peakOrangeCount || 0]),
  });
}
function applyQuickPreset(cfg, preset) {
  const mode = String(preset || '').trim();
  if (mode === 'focus') {
    cfg.dndMode = false;
    cfg.badgeEnabled = false;
    cfg.badgeCountEnabled = false;
    cfg.individualCompletionNotificationEnabled = true;
    cfg.batchCompletionNotificationEnabled = true;
    cfg.individualCompletionSound = SOUND_PRESETS.soft;
    cfg.batchCompletionSound = SOUND_PRESETS.double;
    cfg.individualCompletionVolume = 0.45;
    cfg.batchCompletionVolume = 0.55;
    cfg.batchCompletionThreshold = 4;
    cfg.quietHoursEnabled = true;
    cfg.quietHoursStart = '23:00';
    cfg.quietHoursEnd = '08:00';
  } else if (mode === 'loud') {
    cfg.dndMode = false;
    cfg.badgeEnabled = false;
    cfg.badgeCountEnabled = false;
    cfg.individualCompletionNotificationEnabled = true;
    cfg.batchCompletionNotificationEnabled = true;
    cfg.individualCompletionSound = SOUND_PRESETS.double;
    cfg.batchCompletionSound = SOUND_PRESETS.triple;
    cfg.individualCompletionVolume = 0.8;
    cfg.batchCompletionVolume = 0.95;
    cfg.batchCompletionThreshold = 3;
    cfg.quietHoursEnabled = false;
  } else {
    cfg.dndMode = false;
    cfg.badgeEnabled = false;
    cfg.badgeCountEnabled = false;
    cfg.individualCompletionNotificationEnabled = true;
    cfg.batchCompletionNotificationEnabled = true;
    cfg.individualCompletionSound = SOUND_PRESETS.soft;
    cfg.batchCompletionSound = SOUND_PRESETS.triple;
    cfg.individualCompletionVolume = 0.75;
    cfg.batchCompletionVolume = 0.9;
    cfg.batchCompletionThreshold = 4;
    cfg.quietHoursEnabled = false;
    cfg.quietHoursStart = normalizeClockTime(cfg.quietHoursStart, '23:00');
    cfg.quietHoursEnd = normalizeClockTime(cfg.quietHoursEnd, '08:00');
  }
}
function updateSummaryText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}
function setToneClass(id, baseClass, tone) {
  const el = $(id);
  if (!el) return;
  const tones = ['is-idle', 'is-running', 'is-done', 'is-muted', 'is-info', 'is-positive'];
  tones.forEach((name) => el.classList.remove(name));
  if (tone) el.classList.add(`is-${tone}`);
  if (baseClass && !el.classList.contains(baseClass)) el.classList.add(baseClass);
}
function setMainStatusTone({ readyAiEnabled = true, dndMode, snoozed, quiet, greenCount, orangeCount }) {
  let tone = 'idle';
  if (!readyAiEnabled || dndMode || snoozed || quiet) tone = 'muted';
  else if (greenCount > 0) tone = 'done';
  else if (orangeCount > 0) tone = 'running';
  setToneClass('main-status-badge', 'status-badge', tone);
}
function setHidden(id, hidden) {
  const el = $(id);
  if (el) el.classList.toggle('hidden', !!hidden);
}
function getFavoriteSubtext(id, cfg) {
  const sitesApi = getSitesApi();
  const builtinSites = Array.isArray(sitesApi?.BUILTIN_SITES) ? sitesApi.BUILTIN_SITES : [];
  const builtinEnabledCount = builtinSites.filter((site) => !!cfg.enabledSites?.[site.key]).length;
  const customEnabledCount = (Array.isArray(cfg.customSites) ? cfg.customSites : []).filter((site) => !!site.enabled).length;
  const alertEnabled = !!(cfg.individualCompletionNotificationEnabled || cfg.batchCompletionNotificationEnabled);
  switch (id) {
    case 'alerts': return alertEnabled ? '작업 완료 시 알림 표시' : '완료 알림 꺼짐';
    case 'steering': return cfg.steeringEnabled ? `${cfg.steeringTheme === 'light' ? '라이트' : '다크'} 패널` : '런처 꺼짐';
    case 'dnd': return cfg.dndMode ? '완료 팝업 숨김' : '완료 팝업 표시';
    case 'sites': return `기본 ${builtinEnabledCount}개 · 직접 추가 ${customEnabledCount}개 사용 중`;
    case 'templates': return `저장된 템플릿 ${(cfg.steeringTemplates || []).length}개`;
    case 'titles': return `추적 중인 탭 ${runtimeSnapshot.items.length}개`;
    case 'advanced': return '표시 방식 · 이력 · 자동 새로고침';
    case 'utilities': return '설정 백업 · 복원 · 완료 이력';
    case 'gemini': return cfg.geminiProbeEnabled ? '자동 완료 확인 켜짐' : '자동 완료 확인 꺼짐';
    default: return '';
  }
}
function applyFavoriteToggle(id, checked, cfg) {
  if (id === 'alerts') {
    cfg.individualCompletionNotificationEnabled = !!checked;
    cfg.batchCompletionNotificationEnabled = !!checked;
    if ($('individual-alert-toggle')) $('individual-alert-toggle').checked = !!checked;
    if ($('batch-alert-toggle')) $('batch-alert-toggle').checked = !!checked;
  } else if (id === 'steering') {
    cfg.steeringEnabled = !!checked;
    if ($('steering-toggle')) $('steering-toggle').checked = !!checked;
    if ($('advanced-steering-enabled')) $('advanced-steering-enabled').checked = !!checked;
  } else if (id === 'dnd') {
    cfg.dndMode = !!checked;
    if ($('dnd-toggle')) $('dnd-toggle').checked = !!checked;
  } else {
    return;
  }
  renderFavorites(cfg);
  saveConfig(cfg, () => {
    refreshSummary(cfg);
    refreshRuntimeDashboard(cfg, true);
    const label = POPUP_FAVORITE_ITEMS[id]?.title || '즐겨찾기';
    setHint(`${label} ${checked ? '켜짐' : '꺼짐'}`);
  });
}
function renderFavorites(cfg) {
  const container = $('favorites-list');
  const empty = $('favorites-empty');
  const count = $('favorites-count');
  if (!container) return;
  const favorites = normalizePopupFavorites(cfg.popupFavorites);
  cfg.popupFavorites = favorites;
  const renderSignature = JSON.stringify({
    favorites,
    alert: !!(cfg.individualCompletionNotificationEnabled || cfg.batchCompletionNotificationEnabled),
    steering: !!cfg.steeringEnabled,
    steeringTheme: cfg.steeringTheme,
    dnd: !!cfg.dndMode,
    sites: cfg.enabledSites,
    customSites: (cfg.customSites || []).map((site) => [site.id || site.key || site.url || '', !!site.enabled]),
    templates: (cfg.steeringTemplates || []).length,
    tracked: runtimeSnapshot.items.length,
    quiet: [!!cfg.quietHoursEnabled, cfg.quietHoursStart, cfg.quietHoursEnd],
    gemini: !!cfg.geminiProbeEnabled,
  });
  if (renderSignature === lastFavoritesRenderSignature) return;
  lastFavoritesRenderSignature = renderSignature;
  const focusedId = container.contains(document.activeElement) ? document.activeElement.id : '';
  container.innerHTML = '';
  if (count) count.textContent = `${favorites.length}개`;
  if (empty) empty.classList.toggle('hidden', favorites.length > 0);
  favorites.forEach((id) => {
    const item = POPUP_FAVORITE_ITEMS[id];
    if (!item) return;
    const row = document.createElement(item.toggle ? 'div' : 'button');
    row.className = 'quick-function-row';
    if (!item.toggle) {
      row.type = 'button';
      row.setAttribute('aria-label', `${item.title} 열기`);
      row.addEventListener('click', () => openSheet(item.sheet, item.anchor));
    }
    const icon = document.createElement('span');
    icon.className = 'quick-function-icon';
    icon.setAttribute('aria-hidden', 'true');
    const iconImg = document.createElement('img');
    iconImg.src = `../assets/icons/${item.icon}`;
    iconImg.alt = '';
    icon.appendChild(iconImg);
    const title = document.createElement('span');
    title.className = 'quick-function-title';
    title.textContent = item.title;
    const sub = document.createElement('span');
    sub.className = 'quick-function-sub';
    sub.textContent = getFavoriteSubtext(id, cfg);
    row.appendChild(icon);
    row.appendChild(title);
    row.appendChild(sub);
    if (item.toggle) {
      const label = document.createElement('label');
      label.className = 'switch';
      label.setAttribute('aria-label', `${item.title} 켜기 또는 끄기`);
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `quick-${id}-toggle`;
      input.checked = id === 'alerts'
        ? !!(cfg.individualCompletionNotificationEnabled || cfg.batchCompletionNotificationEnabled)
        : (id === 'steering' ? !!cfg.steeringEnabled : !!cfg.dndMode);
      input.addEventListener('change', () => applyFavoriteToggle(id, input.checked, cfg));
      const slider = document.createElement('span');
      slider.className = 'slider';
      label.appendChild(input);
      label.appendChild(slider);
      row.appendChild(label);
    } else {
      const chevron = document.createElement('span');
      chevron.className = 'simple-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      const chevronImg = document.createElement('img');
      chevronImg.src = '../assets/icons/arrow-right.svg';
      chevronImg.alt = '';
      chevron.appendChild(chevronImg);
      row.appendChild(chevron);
    }
    container.appendChild(row);
  });
  if (focusedId) $(focusedId)?.focus({ preventScroll: true });
}
function renderFavoriteButtons(cfg) {
  const favorites = new Set(normalizePopupFavorites(cfg.popupFavorites));
  document.querySelectorAll('[data-favorite-id]').forEach((button) => {
    const id = String(button.getAttribute('data-favorite-id') || '');
    const active = favorites.has(id);
    const title = POPUP_FAVORITE_ITEMS[id]?.title || '이 기능';
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', active ? `${title} 즐겨찾기에서 제거` : `${title} 즐겨찾기에 추가`);
    button.title = active ? '즐겨찾기에서 제거' : '즐겨찾기에 추가';
  });
}
function togglePopupFavorite(id, cfg) {
  if (!POPUP_FAVORITE_ITEMS[id]) return;
  const current = normalizePopupFavorites(cfg.popupFavorites);
  const removing = current.includes(id);
  cfg.popupFavorites = removing ? current.filter((itemId) => itemId !== id) : [...current, id];
  renderFavorites(cfg);
  renderFavoriteButtons(cfg);
  saveConfig(cfg, () => {
    const title = POPUP_FAVORITE_ITEMS[id]?.title || '기능';
    setHint(`${title} 즐겨찾기 ${removing ? '제거됨' : '추가됨'}`);
  });
}
function getSitesStorageKeys() {
  const sitesApi = getSitesApi();
  return {
    enabledKey: sitesApi?.STORAGE_KEYS?.ENABLED_SITES || 'enabledSites',
    customKey: sitesApi?.STORAGE_KEYS?.CUSTOM_SITES || 'customSites',
  };
}
function buildConfigStoragePayload(cfg) {
  const { enabledKey, customKey } = getSitesStorageKeys();
  return {
    readyAiEnabled: cfg.readyAiEnabled !== false,
    dndMode: !!cfg.dndMode,
    badgeEnabled: false,
    badgeCountEnabled: false,
    titleBadgeEnabled: !!cfg.titleBadgeEnabled,
    titleBadgeCountEnabled: !!cfg.titleBadgeCountEnabled,
    completionHistoryEnabled: !!cfg.completionHistoryEnabled,
    dashboardAutoRefreshEnabled: !!cfg.dashboardAutoRefreshEnabled,
    [enabledKey]: cfg.enabledSites,
    [customKey]: cfg.customSites,
    geminiProbeEnabled: !!cfg.geminiProbeEnabled,
    geminiProbePeriodMin: cfg.geminiProbePeriodMin,
    geminiProbeOnlyIdle: !!cfg.geminiProbeOnlyIdle,
    geminiProbeIdleSec: cfg.geminiProbeIdleSec,
    geminiProbeMinOrangeSec: cfg.geminiProbeMinOrangeSec,
    individualCompletionNotificationEnabled: !!cfg.individualCompletionNotificationEnabled,
    individualCompletionSound: normalizeSoundKey(cfg.individualCompletionSound, SOUND_PRESETS.soft),
    individualCompletionVolume: clampNumber(cfg.individualCompletionVolume, 0.75, 0, 1),
    individualCompletionCustomSoundDataUrl: String(cfg.individualCompletionCustomSoundDataUrl || ''),
    individualCompletionCustomSoundName: String(cfg.individualCompletionCustomSoundName || ''),
    batchCompletionNotificationEnabled: !!cfg.batchCompletionNotificationEnabled,
    batchCompletionSound: normalizeSoundKey(cfg.batchCompletionSound, SOUND_PRESETS.triple),
    batchCompletionThreshold: clampInt(cfg.batchCompletionThreshold, 4, 2, 99),
    batchCompletionVolume: clampNumber(cfg.batchCompletionVolume, 0.9, 0, 1),
    batchCompletionCustomSoundDataUrl: String(cfg.batchCompletionCustomSoundDataUrl || ''),
    batchCompletionCustomSoundName: String(cfg.batchCompletionCustomSoundName || ''),
    steeringEnabled: !!cfg.steeringEnabled,
    steeringTheme: String(cfg.steeringTheme || 'dark').trim().toLowerCase() === 'light' ? 'light' : 'dark',
    steeringLauncherVisible: !!cfg.steeringLauncherVisible,
    steeringAutoFocusInput: !!cfg.steeringAutoFocusInput,
    steeringCloseAfterSend: !!cfg.steeringCloseAfterSend,
    steeringQueueCountVisible: !!cfg.steeringQueueCountVisible,
    steeringAdvancedEnabled: !!cfg.steeringAdvancedEnabled,
    steeringNewChatTabCount: normalizeSteeringNewChatTabCount(cfg.steeringNewChatTabCount),
    steeringTemplates: normalizeTemplateList(cfg.steeringTemplates),
    steeringRecentDraft: String(cfg.steeringRecentDraft || ''),
    popupFavorites: normalizePopupFavorites(cfg.popupFavorites),
    quietHoursEnabled: !!cfg.quietHoursEnabled,
    quietHoursStart: normalizeClockTime(cfg.quietHoursStart, '23:00'),
    quietHoursEnd: normalizeClockTime(cfg.quietHoursEnd, '08:00'),
  };
}
function flushPendingConfigSave() {
  if (pendingConfigSaveTimer) {
    clearTimeout(pendingConfigSaveTimer);
    pendingConfigSaveTimer = null;
  }
  if (!pendingConfigSavePayload) return;
  const payload = pendingConfigSavePayload;
  const signature = pendingConfigSaveSignature;
  const callbacks = pendingConfigSaveCallbacks.slice();
  pendingConfigSavePayload = null;
  pendingConfigSaveSignature = '';
  pendingConfigSaveCallbacks = [];
  chrome.storage.local.set(payload, () => {
    lastSavedConfigSignature = signature;
    callbacks.forEach((cb) => {
      try { cb?.(); } catch (_) {}
    });
  });
}
function cancelPendingConfigSave() {
  if (pendingConfigSaveTimer) {
    clearTimeout(pendingConfigSaveTimer);
    pendingConfigSaveTimer = null;
  }
  pendingConfigSavePayload = null;
  pendingConfigSaveSignature = '';
  pendingConfigSaveCallbacks = [];
}
function saveConfig(cfg, cb, options = {}) {
  const payload = buildConfigStoragePayload(cfg);
  const signature = JSON.stringify(payload);
  if (!options.force && signature === lastSavedConfigSignature && !pendingConfigSavePayload) {
    cb?.();
    return;
  }
  pendingConfigSavePayload = payload;
  pendingConfigSaveSignature = signature;
  if (typeof cb === 'function') pendingConfigSaveCallbacks.push(cb);
  if (options.flushImmediately) {
    flushPendingConfigSave();
    return;
  }
  if (pendingConfigSaveTimer) clearTimeout(pendingConfigSaveTimer);
  pendingConfigSaveTimer = setTimeout(() => flushPendingConfigSave(), CONFIG_SAVE_DEBOUNCE_MS);
}
function invalidateFilteredDashboardCache() {
  filteredDashboardCacheKey = '';
  filteredDashboardCacheItems = [];
}
function getDashboardRelativeTimeBucket() {
  return Math.floor(Date.now() / DASHBOARD_RELATIVE_TIME_BUCKET_MS);
}
function refreshRelativeTimeLabels(force = false) {
  const bucket = getDashboardRelativeTimeBucket();
  if (!force && bucket === lastRelativeTimeBucket) return;
  lastRelativeTimeBucket = bucket;
  document.querySelectorAll('[data-role="relative-time"]').forEach((el) => {
    const ts = clampInt(el.getAttribute('data-ts'), 0, 0, Number.MAX_SAFE_INTEGER);
    if (!ts) return;
    const mode = el.getAttribute('data-mode') || 'ago';
    if (mode === 'history') {
      el.textContent = `${formatTime(ts)} · ${formatAgo(ts)}`;
      return;
    }
    const prefix = el.getAttribute('data-prefix') || '';
    const suffix = el.getAttribute('data-suffix') || '';
    const dynamicSuffix = mode === 'dashboard' ? getDashboardDynamicSuffixFromElement(el, suffix) : suffix;
    el.textContent = `${prefix}${formatAgo(ts)}${dynamicSuffix}`;
  });
}
function loadConfig(cb) {
  const sitesApi = getSitesApi();
  const { enabledKey, customKey } = getSitesStorageKeys();
  chrome.storage.local.get([
    'readyAiEnabled',
    'dndMode',
    'badgeEnabled',
    'badgeCountEnabled',
    'titleBadgeEnabled',
    'titleBadgeCountEnabled',
    'completionHistoryEnabled',
    'dashboardAutoRefreshEnabled',
    'steeringLauncherVisible',
    'steeringAutoFocusInput',
    'steeringCloseAfterSend',
    'steeringQueueCountVisible',
    'steeringAdvancedEnabled',
    'steeringNewChatTabCount',
    enabledKey,
    customKey,
    'geminiProbeEnabled',
    'geminiProbePeriodMin',
    'geminiProbeOnlyIdle',
    'geminiProbeIdleSec',
    'geminiProbeMinOrangeSec',
    'individualCompletionNotificationEnabled',
    'individualCompletionSound',
    'individualCompletionVolume',
    'individualCompletionCustomSoundDataUrl',
    'individualCompletionCustomSoundName',
    'batchCompletionNotificationEnabled',
    'batchCompletionSound',
    'batchCompletionThreshold',
    'batchCompletionVolume',
    'batchCompletionCustomSoundDataUrl',
    'batchCompletionCustomSoundName',
    'steeringEnabled',
    'steeringTheme',
    'steeringTemplates',
    'steeringRecentDraft',
    'popupFavorites',
    'quietHoursEnabled',
    'quietHoursStart',
    'quietHoursEnd',
  ], (res) => {
    const enabledSites = sitesApi?.ensureEnabledSitesObject
      ? sitesApi.ensureEnabledSitesObject(res?.[enabledKey])
      : (res?.[enabledKey] || {});
    const customSites = sitesApi?.normalizeCustomSites
      ? sitesApi.normalizeCustomSites(res?.[customKey])
      : (res?.[customKey] || []);
    cb({
      readyAiEnabled: res.readyAiEnabled !== false,
      dndMode: !!res.dndMode,
      badgeEnabled: false,
      badgeCountEnabled: false,
      titleBadgeEnabled: (typeof res.titleBadgeEnabled === 'boolean') ? res.titleBadgeEnabled : true,
      titleBadgeCountEnabled: (typeof res.titleBadgeCountEnabled === 'boolean') ? res.titleBadgeCountEnabled : true,
      completionHistoryEnabled: (typeof res.completionHistoryEnabled === 'boolean') ? res.completionHistoryEnabled : true,
      dashboardAutoRefreshEnabled: (typeof res.dashboardAutoRefreshEnabled === 'boolean') ? res.dashboardAutoRefreshEnabled : true,
      enabledSites,
      customSites,
      geminiProbeEnabled: (typeof res.geminiProbeEnabled === 'boolean') ? res.geminiProbeEnabled : true,
      geminiProbePeriodMin: (res.geminiProbePeriodMin != null) ? res.geminiProbePeriodMin : 1,
      geminiProbeOnlyIdle: (typeof res.geminiProbeOnlyIdle === 'boolean') ? res.geminiProbeOnlyIdle : true,
      geminiProbeIdleSec: (res.geminiProbeIdleSec != null) ? res.geminiProbeIdleSec : 60,
      geminiProbeMinOrangeSec: (res.geminiProbeMinOrangeSec != null) ? res.geminiProbeMinOrangeSec : 12,
      individualCompletionNotificationEnabled: (typeof res.individualCompletionNotificationEnabled === 'boolean') ? res.individualCompletionNotificationEnabled : true,
      individualCompletionSound: normalizeSoundKey(res.individualCompletionSound, SOUND_PRESETS.soft),
      individualCompletionVolume: clampNumber(res.individualCompletionVolume, 0.75, 0, 1),
      individualCompletionCustomSoundDataUrl: String(res.individualCompletionCustomSoundDataUrl || ''),
      individualCompletionCustomSoundName: String(res.individualCompletionCustomSoundName || ''),
      batchCompletionNotificationEnabled: (typeof res.batchCompletionNotificationEnabled === 'boolean') ? res.batchCompletionNotificationEnabled : true,
      batchCompletionSound: normalizeSoundKey(res.batchCompletionSound, SOUND_PRESETS.triple),
      batchCompletionThreshold: clampInt(res.batchCompletionThreshold, 4, 2, 99),
      batchCompletionVolume: clampNumber(res.batchCompletionVolume, 0.9, 0, 1),
      batchCompletionCustomSoundDataUrl: String(res.batchCompletionCustomSoundDataUrl || ''),
      batchCompletionCustomSoundName: String(res.batchCompletionCustomSoundName || ''),
      steeringEnabled: (typeof res.steeringEnabled === 'boolean') ? res.steeringEnabled : true,
      steeringTheme: String(res.steeringTheme || 'dark').trim().toLowerCase() === 'light' ? 'light' : 'dark',
      steeringLauncherVisible: (typeof res.steeringLauncherVisible === 'boolean') ? res.steeringLauncherVisible : true,
      steeringAutoFocusInput: (typeof res.steeringAutoFocusInput === 'boolean') ? res.steeringAutoFocusInput : true,
      steeringCloseAfterSend: (typeof res.steeringCloseAfterSend === 'boolean') ? res.steeringCloseAfterSend : false,
      steeringQueueCountVisible: (typeof res.steeringQueueCountVisible === 'boolean') ? res.steeringQueueCountVisible : true,
      steeringAdvancedEnabled: (typeof res.steeringAdvancedEnabled === 'boolean') ? res.steeringAdvancedEnabled : false,
      steeringNewChatTabCount: normalizeSteeringNewChatTabCount(res.steeringNewChatTabCount),
      steeringTemplates: normalizeTemplateList(res.steeringTemplates),
      steeringRecentDraft: String(res.steeringRecentDraft || ''),
      popupFavorites: normalizePopupFavorites(res.popupFavorites),
      quietHoursEnabled: (typeof res.quietHoursEnabled === 'boolean') ? res.quietHoursEnabled : false,
      quietHoursStart: normalizeClockTime(res.quietHoursStart, '23:00'),
      quietHoursEnd: normalizeClockTime(res.quietHoursEnd, '08:00'),
    });
  });
}
function getSoundCfg(cfg, kind) {
  if (kind === 'batch') {
    return {
      enabledKey: 'batchCompletionNotificationEnabled',
      soundKey: 'batchCompletionSound',
      volumeKey: 'batchCompletionVolume',
      customDataKey: 'batchCompletionCustomSoundDataUrl',
      customNameKey: 'batchCompletionCustomSoundName',
    };
  }
  return {
    enabledKey: 'individualCompletionNotificationEnabled',
    soundKey: 'individualCompletionSound',
    volumeKey: 'individualCompletionVolume',
    customDataKey: 'individualCompletionCustomSoundDataUrl',
    customNameKey: 'individualCompletionCustomSoundName',
  };
}
function renderBuiltinSites(cfg) {
  const sitesApi = getSitesApi();
  const container = $('builtin-sites');
  if (!container || !sitesApi?.BUILTIN_SITES) return;
  container.innerHTML = '';
  for (const s of sitesApi.BUILTIN_SITES) {
    const row = document.createElement('div');
    row.className = 'site-row';
    const left = document.createElement('div');
    left.className = 'site-left';
    const name = document.createElement('div');
    name.className = 'site-name';
    name.textContent = s.name;
    const sub = document.createElement('div');
    sub.className = 'site-sub';
    sub.textContent = (s.patterns || []).join(' , ');
    left.appendChild(name);
    left.appendChild(sub);
    const switchWrap = document.createElement('label');
    switchWrap.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!cfg.enabledSites?.[s.key];
    const slider = document.createElement('span');
    slider.className = 'slider';
    input.addEventListener('change', () => {
      cfg.enabledSites[s.key] = input.checked;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
    switchWrap.appendChild(input);
    switchWrap.appendChild(slider);
    row.appendChild(left);
    row.appendChild(switchWrap);
    container.appendChild(row);
  }
}
function renderCustomSites(cfg) {
  const sitesApi = getSitesApi();
  const container = $('custom-sites');
  if (!container || !sitesApi) return;
  container.innerHTML = '';
  const customSites = Array.isArray(cfg.customSites) ? cfg.customSites : [];
  if (!customSites.length) {
    const empty = document.createElement('div');
    empty.className = 'desc';
    empty.textContent = '직접 추가한 사이트가 없습니다.';
    container.appendChild(empty);
    return;
  }
  for (const s of customSites) {
    const row = document.createElement('div');
    row.className = 'site-row';
    const left = document.createElement('div');
    left.className = 'site-left';
    const name = document.createElement('div');
    name.className = 'site-name';
    name.textContent = s.name;
    const modeLabel = sitesApi.DETECTION_MODES?.find((m) => m.key === s.detection)?.label || s.detection;
    const sub = document.createElement('div');
    sub.className = 'site-sub';
    sub.textContent = `${modeLabel} · ${(s.patterns || []).join(' , ')}`;
    left.appendChild(name);
    left.appendChild(sub);
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.alignItems = 'center';
    actions.style.gap = '8px';
    const switchWrap = document.createElement('label');
    switchWrap.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!s.enabled;
    const slider = document.createElement('span');
    slider.className = 'slider';
    input.addEventListener('change', () => {
      s.enabled = input.checked;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
    switchWrap.appendChild(input);
    switchWrap.appendChild(slider);
    const del = document.createElement('button');
    del.className = 'btn danger';
    del.textContent = '삭제';
    del.addEventListener('click', () => {
      cfg.customSites = cfg.customSites.filter((x) => x.id !== s.id);
      saveConfig(cfg, () => {
        renderCustomSites(cfg);
        refreshSummary(cfg);
        setHint('삭제됨');
      });
    });
    actions.appendChild(switchWrap);
    actions.appendChild(del);
    row.appendChild(left);
    row.appendChild(actions);
    container.appendChild(row);
  }
}
function renderDetectionOptions() {
  const sitesApi = getSitesApi();
  const select = $('custom-detection');
  if (!select || !sitesApi?.DETECTION_MODES) return;
  select.innerHTML = '';
  for (const mode of sitesApi.DETECTION_MODES) {
    const opt = document.createElement('option');
    opt.value = mode.key;
    opt.textContent = mode.label;
    select.appendChild(opt);
  }
  select.value = 'generic_stop';
}
function formatTime(ts) {
  if (!ts) return '기록 없음';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts));
  } catch (_) {
    return new Date(ts).toLocaleTimeString();
  }
}
function formatDateTime(ts) {
  if (!ts) return '해제됨';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch (_) {
    return new Date(ts).toLocaleString();
  }
}
function formatRelativeMs(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}초 전`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  return `${day}일 전`;
}
function formatAgo(ts) {
  if (!ts) return '기록 없음';
  return formatRelativeMs(Date.now() - ts);
}
function statusClass(status) {
  if (status === 'ORANGE') return 'orange';
  if (status === 'GREEN') return 'white';
  return 'green';
}
function statusLabel(status) {
  if (status === 'ORANGE') return '진행중';
  if (status === 'GREEN') return '완료';
  return '대기 없음';
}
function getHostLabel(url) {
  try {
    return new URL(url).host;
  } catch (_) {
    return '';
  }
}
function getDraftValue(cfg) {
  const direct = String($('template-draft')?.value || '').trim();
  if (direct) return direct;
  return String(cfg?.steeringRecentDraft || '').trim();
}
function getStatusRank(status) {
  if (status === 'ORANGE') return 3;
  if (status === 'GREEN') return 2;
  return 1;
}
function getFilteredDashboardItems() {
  const search = String(dashboardView.search || '').trim().toLowerCase();
  const cacheKey = JSON.stringify({
    version: lastDashboardVersionSeen || 0,
    filter: dashboardView.filter || 'ALL',
    sort: dashboardView.sort || 'status',
    search,
  });
  if (filteredDashboardCacheKey === cacheKey && Array.isArray(filteredDashboardCacheItems)) {
    return filteredDashboardCacheItems.slice();
  }
  const base = Array.isArray(runtimeSnapshot.items) ? runtimeSnapshot.items.slice() : [];
  const filtered = base.filter((item) => {
    if (dashboardView.filter === 'ORANGE' && item.status !== 'ORANGE') return false;
    if (dashboardView.filter === 'GREEN' && item.status !== 'GREEN') return false;
    if (dashboardView.filter === 'QUEUED' && !(Math.max(0, Number(item.steeringQueueCount) || 0) > 0)) return false;
    if (!search) return true;
    const hay = [item.title, item.siteName, item.host, item.platform, item.url].map((v) => String(v || '').toLowerCase()).join(' ');
    return hay.includes(search);
  });
  filtered.sort((a, b) => {
    const mode = String(dashboardView.sort || 'status');
    if (mode === 'recent') {
      return (b.lastUpdateAt || 0) - (a.lastUpdateAt || 0) || getStatusRank(b.status) - getStatusRank(a.status);
    }
    if (mode === 'queue') {
      return (Math.max(0, Number(b.steeringQueueCount) || 0) - Math.max(0, Number(a.steeringQueueCount) || 0))
        || getStatusRank(b.status) - getStatusRank(a.status)
        || (b.lastUpdateAt || 0) - (a.lastUpdateAt || 0);
    }
    if (mode === 'title') {
      return String(a.title || '').localeCompare(String(b.title || ''), 'ko')
        || getStatusRank(b.status) - getStatusRank(a.status)
        || (b.lastUpdateAt || 0) - (a.lastUpdateAt || 0);
    }
    return getStatusRank(b.status) - getStatusRank(a.status)
      || (Math.max(0, Number(b.steeringQueueCount) || 0) - Math.max(0, Number(a.steeringQueueCount) || 0))
      || (b.lastUpdateAt || 0) - (a.lastUpdateAt || 0);
  });
  filteredDashboardCacheKey = cacheKey;
  filteredDashboardCacheItems = filtered.slice();
  return filtered;
}
function updateDashboardViewUi() {
  const map = {
    'dashboard-filter-all': 'ALL',
    'dashboard-filter-orange': 'ORANGE',
    'dashboard-filter-green': 'GREEN',
    'dashboard-filter-queued': 'QUEUED',
  };
  Object.entries(map).forEach(([id, value]) => {
    const btn = $(id);
    if (btn) btn.classList.toggle('active', dashboardView.filter === value);
  });
  const search = $('dashboard-search');
  if (search && search.value !== String(dashboardView.search || '')) search.value = String(dashboardView.search || '');
  const sort = $('dashboard-sort');
  if (sort && sort.value !== String(dashboardView.sort || 'status')) sort.value = String(dashboardView.sort || 'status');
}
async function copyTextToClipboard(text, successLabel = '복사됨') {
  const value = String(text || '').trim();
  if (!value) {
    setHint('복사할 값이 없음', true);
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
    setHint(successLabel);
    return true;
  } catch (_) {
    const area = document.createElement('textarea');
    area.value = value;
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    setHint(ok ? successLabel : '복사 실패', !ok);
    return !!ok;
  }
}
function isNoReceivingEndError(res) {
  const text = String(res?.error || res?.message || '').toLowerCase();
  return text.includes('receiving end does not exist')
    || text.includes('could not establish connection')
    || text.includes('message port closed')
    || text.includes('no receiver');
}
async function ensureContentForTab(tabId, reason = 'popup') {
  if (!Number.isFinite(Number(tabId))) return { ok: false, error: 'invalid tab' };
  return sendRuntimeMessage({
    action: 'ensure_content_for_tab',
    tabId: Number(tabId),
    reason,
  });
}
async function ensureActiveTabContent(reason = 'popup_open') {
  const tabs = await pQueryTabs({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return { ok: false, error: 'active tab not found' };
  return ensureContentForTab(tab.id, reason);
}
async function sendSteeringToTab(tabId, text, opts = {}) {
  const value = String(text || '').trim();
  if (!value) {
    setHint('전송할 문구를 먼저 입력해줘', true);
    return false;
  }
  await ensureContentForTab(tabId, opts.ensureReason || 'popup_send_steering');
  let res = await pSendTabMessage(tabId, { action: 'enqueue_steering_prompt', text: value });
  if (!res?.ok && isNoReceivingEndError(res)) {
    const ensured = await ensureContentForTab(tabId, 'popup_send_steering_retry');
    if (ensured?.ok) {
      res = await pSendTabMessage(tabId, { action: 'enqueue_steering_prompt', text: value });
    }
  }
  if (res?.ok) {
    const successText = typeof opts.successText === 'string'
      ? opts.successText
      : `대기 추가됨 (${res.count || 1})`;
    if (successText) setHint(successText);
    return true;
  }
  const err = String(res?.message || res?.error || '이 탭이 지원되지 않음');
  setHint(`${opts.failPrefix || '전송 실패'}: ${err}`, true);
  return false;
}
async function clearSteeringQueueForTab(tabId) {
  await ensureContentForTab(tabId, 'popup_clear_queue');
  let res = await pSendTabMessage(tabId, { action: 'clear_steering_queue' });
  if (!res?.ok && isNoReceivingEndError(res)) {
    const ensured = await ensureContentForTab(tabId, 'popup_clear_queue_retry');
    if (ensured?.ok) {
      res = await pSendTabMessage(tabId, { action: 'clear_steering_queue' });
    }
  }
  setHint(res?.ok ? '이 탭 대기열 비움' : '이 탭 대기열 비우기 실패', !res?.ok);
  return !!res?.ok;
}
function normalizeCustomTabTitleValue(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, CUSTOM_TAB_TITLE_MAX_LENGTH);
}
function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || '백그라운드 연결 실패' });
          return;
        }
        resolve(res || { ok: true });
      });
    } catch (err) {
      resolve({ ok: false, error: err?.message || '백그라운드 연결 실패' });
    }
  });
}
async function setCustomTitleForTabId(tabId, title) {
  const value = normalizeCustomTabTitleValue(title);
  if (!value) {
    setHint('탭 이름을 먼저 입력해줘', true);
    return false;
  }
  const res = await sendRuntimeMessage({ action: 'set_custom_tab_title_for_tab', tabId, title: value });
  if (!res?.ok) {
    setHint(res?.message || res?.error || '탭 이름 저장 실패', true);
    return false;
  }
  return true;
}
async function clearCustomTitleForTabId(tabId) {
  const res = await sendRuntimeMessage({ action: 'clear_custom_tab_title_for_tab', tabId });
  if (!res?.ok) {
    setHint(res?.message || res?.error || '탭 이름 해제 실패', true);
    return false;
  }
  return true;
}
async function getActiveBrowserTab() {
  const tabs = await pQueryTabs({ active: true, currentWindow: true });
  return tabs[0] || null;
}
function buildBulkTitleValue(baseTitle, index, numberingEnabled, startNumber) {
  const base = normalizeCustomTabTitleValue(baseTitle);
  if (!base) return '';
  if (!numberingEnabled) return base;
  return normalizeCustomTabTitleValue(`${base} ${startNumber + index}`);
}
async function applyBulkTitleToItems(items, baseTitle, opts = {}) {
  const targets = Array.isArray(items) ? items.filter((item) => Number.isFinite(item?.tabId)) : [];
  if (!targets.length) {
    setHint('적용할 탭이 없음', true);
    return { ok: false, count: 0, total: 0 };
  }
  const base = normalizeCustomTabTitleValue(baseTitle);
  if (!base) {
    setHint('이름을 먼저 입력해줘', true);
    return { ok: false, count: 0, total: targets.length };
  }
  const numberingEnabled = opts.numberingEnabled !== false;
  const startNumber = clampInt(opts.startNumber, 1, 1, 9999);
  const payload = targets.map((item, index) => ({
    tabId: item.tabId,
    title: buildBulkTitleValue(base, index, numberingEnabled, startNumber),
  })).filter((item) => item.title);
  const res = await sendRuntimeMessage({ action: 'batch_set_custom_tab_titles_for_tabs', items: payload });
  if (!res?.ok && !(res && typeof res.count === 'number')) {
    setHint(res?.message || res?.error || '탭 이름 일괄 적용 실패', true);
    return { ok: false, count: 0, total: targets.length };
  }
  return { ok: (res?.count || 0) > 0, count: Math.max(0, Number(res?.count) || 0), total: targets.length };
}
async function clearBulkTitleForItems(items) {
  const targets = Array.isArray(items) ? items.filter((item) => Number.isFinite(item?.tabId)) : [];
  if (!targets.length) {
    setHint('해제할 탭이 없음', true);
    return { ok: false, count: 0, total: 0 };
  }
  const res = await sendRuntimeMessage({
    action: 'batch_clear_custom_tab_titles_for_tabs',
    tabIds: targets.map((item) => item.tabId),
  });
  if (!res?.ok && !(res && typeof res.count === 'number')) {
    setHint(res?.message || res?.error || '탭 이름 일괄 해제 실패', true);
    return { ok: false, count: 0, total: targets.length };
  }
  return { ok: (res?.count || 0) > 0, count: Math.max(0, Number(res?.count) || 0), total: targets.length };
}
async function renderTitleManager(cfg, options = {}) {
  const preserveInput = !!options.preserveInput;
  const activeSummary = $('active-tab-title-summary');
  const activeInput = $('active-tab-title-input');
  const activeSave = $('active-tab-title-save');
  const activeClear = $('active-tab-title-clear');
  const listEl = $('title-manager-list');
  const activeTab = await getActiveBrowserTab();
  const items = Array.isArray(runtimeSnapshot.items) ? runtimeSnapshot.items.slice() : [];
  const activeItem = items.find((item) => item.tabId === activeTab?.id) || null;
  if (activeSummary) {
    if (activeTab?.id) {
      const host = activeItem?.host || getHostLabel(activeTab?.url || '');
      const fixed = normalizeCustomTabTitleValue(activeItem?.customTabTitle || '');
      activeSummary.textContent = `${activeItem?.title || activeTab.title || '현재 탭'} · ${host || 'URL 없음'}${fixed ? ` · 변경됨: ${fixed}` : ' · 자동 제목'}`;
    } else {
      activeSummary.textContent = '현재 탭을 찾지 못했습니다.';
    }
  }
  if (activeInput && !preserveInput) activeInput.value = normalizeCustomTabTitleValue(activeItem?.customTabTitle || '');
  if (activeSave) activeSave.disabled = !activeTab?.id;
  if (activeClear) activeClear.disabled = !activeTab?.id;
  if (!listEl) return;
  const sorted = items.sort((a, b) => {
    const activeRank = (v) => v.active ? 1 : 0;
    const customRank = (v) => v.hasCustomTabTitle ? 1 : 0;
    return activeRank(b) - activeRank(a)
      || customRank(b) - customRank(a)
      || (b.lastUpdateAt || 0) - (a.lastUpdateAt || 0);
  });
  const listSignature = JSON.stringify(sorted.map((item) => [
    item.tabId,
    item.title || '',
    item.status || '',
    item.siteName || '',
    item.platform || '',
    item.host || '',
    item.url || '',
    item.customTabTitle || '',
    !!item.hasCustomTabTitle,
    !!item.active,
    item.lastUpdateAt || 0,
  ]));
  if (lastTitleManagerListSignature === listSignature) return;
  lastTitleManagerListSignature = listSignature;
  listEl.innerHTML = '';
  if (!sorted.length) {
    const empty = document.createElement('div');
    empty.className = 'desc';
    empty.textContent = '현재 추적 중인 탭이 없습니다.';
    listEl.appendChild(empty);
    return;
  }
  sorted.forEach((item) => {
    const row = document.createElement('div');
    row.className = `title-manager-row is-${statusClass(item.status)}`;
    const top = document.createElement('div');
    top.className = 'title-manager-top';
    const left = document.createElement('div');
    left.className = 'title-manager-left';
    const title = document.createElement('div');
    title.className = 'title-manager-title';
    title.textContent = item.title || item.siteName || item.host || `탭 ${item.tabId}`;
    const sub = document.createElement('div');
    sub.className = 'title-manager-sub';
    const customText = normalizeCustomTabTitleValue(item.customTabTitle || '');
    sub.textContent = `${statusLabel(item.status)} · ${item.siteName || item.platform || '미확인'} · ${item.host || getHostLabel(item.url) || 'URL 없음'}${customText ? ` · 변경: ${customText}` : ' · 자동 제목'}`;
    left.appendChild(title);
    left.appendChild(sub);
    top.appendChild(left);
    const right = document.createElement('div');
    if (customText) {
      const pin = document.createElement('span');
      pin.className = 'title-badge-pin';
      pin.textContent = '변경';
      right.appendChild(pin);
    } else {
      const state = document.createElement('span');
      state.className = `state-chip ${statusClass(item.status)}`;
      state.textContent = statusLabel(item.status);
      right.appendChild(state);
    }
    top.appendChild(right);
    row.appendChild(top);
    const field = document.createElement('div');
    field.className = 'title-manager-field';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = CUSTOM_TAB_TITLE_MAX_LENGTH;
    input.value = customText;
    input.placeholder = '크롬 탭 이름변경';
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn primary';
    saveBtn.type = 'button';
    saveBtn.textContent = '저장';
    saveBtn.addEventListener('click', async () => {
      const ok = await setCustomTitleForTabId(item.tabId, input.value);
      if (ok) {
        setHint(`탭 이름 저장됨: ${normalizeCustomTabTitleValue(input.value)}`);
        lastTitleManagerListSignature = '';
        await refreshRuntimeDashboard(cfg, true, { force: true });
        renderTitleManager(cfg);
      }
    });
    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn';
    clearBtn.type = 'button';
    clearBtn.textContent = '해제';
    clearBtn.addEventListener('click', async () => {
      const ok = await clearCustomTitleForTabId(item.tabId);
      if (ok) {
        setHint('크롬 탭 이름변경 해제됨');
        lastTitleManagerListSignature = '';
        await refreshRuntimeDashboard(cfg, true, { force: true });
        renderTitleManager(cfg);
      }
    });
    field.appendChild(input);
    field.appendChild(saveBtn);
    field.appendChild(clearBtn);
    row.appendChild(field);
    const chips = document.createElement('div');
    chips.className = 'title-chip-row';
    ['작업', '확인', '보류', '중요'].forEach((preset) => {
      const btn = document.createElement('button');
      btn.className = 'title-chip-btn';
      btn.type = 'button';
      btn.textContent = preset;
      btn.addEventListener('click', async () => {
        const ok = await setCustomTitleForTabId(item.tabId, preset);
        if (ok) {
          setHint(`탭 이름 저장됨: ${preset}`);
          lastTitleManagerListSignature = '';
          await refreshRuntimeDashboard(cfg, true, { force: true });
          renderTitleManager(cfg);
        }
      });
      chips.appendChild(btn);
    });
    const openBtn = document.createElement('button');
    openBtn.className = 'title-chip-btn';
    openBtn.type = 'button';
    openBtn.textContent = '탭 열기';
    openBtn.addEventListener('click', () => focusTab(item.tabId, item.windowId));
    chips.appendChild(openBtn);
    row.appendChild(chips);
    listEl.appendChild(row);
  });
}
async function focusNextGreenTab() {
  const items = (Array.isArray(runtimeSnapshot.items) ? runtimeSnapshot.items.slice() : [])
    .filter((item) => item.status === 'GREEN')
    .sort((a, b) => (b.lastUpdateAt || 0) - (a.lastUpdateAt || 0));
  if (!items.length) {
    setHint('열 수 있는 완료 탭이 없음', true);
    return false;
  }
  await focusTab(items[0].tabId, items[0].windowId);
  setHint('다음 완료 탭으로 이동');
  return true;
}
async function sendSteeringToItems(items, text, label) {
  const value = String(text || '').trim();
  const targets = Array.isArray(items) ? items.filter((item) => typeof item?.tabId === 'number') : [];
  if (!value) {
    setHint('전송할 문구를 먼저 입력해줘', true);
    return { ok: false, successCount: 0, failCount: targets.length };
  }
  if (!targets.length) {
    setHint(`${label} 대상이 없음`, true);
    return { ok: false, successCount: 0, failCount: 0 };
  }
  let successCount = 0;
  let failCount = 0;
  for (const item of targets) {
    const ok = await sendSteeringToTab(item.tabId, value, { successText: '' , failPrefix: `${item.title || item.siteName || '탭'} 전송 실패`});
    if (ok) successCount += 1;
    else failCount += 1;
  }
  setHint(`${label}: ${successCount}개 성공${failCount ? ` · ${failCount}개 실패` : ''}`, failCount > 0 && successCount === 0);
  return { ok: successCount > 0, successCount, failCount };
}
function refreshSummary(cfg) {
  renderReadyAiUsageControl(cfg);
  const sitesApi = getSitesApi();
  const builtinSites = Array.isArray(sitesApi?.BUILTIN_SITES) ? sitesApi.BUILTIN_SITES : [];
  const builtinEnabledCount = builtinSites.filter((s) => !!cfg.enabledSites?.[s.key]).length;
  const customSites = Array.isArray(cfg.customSites) ? cfg.customSites : [];
  const customEnabledCount = customSites.filter((s) => !!s.enabled).length;
  const orangeCount = runtimeSnapshot.items.filter((item) => item.status === 'ORANGE').length;
  const greenCount = runtimeSnapshot.items.filter((item) => item.status === 'GREEN').length;
  const queueCount = runtimeSnapshot.items.reduce((sum, item) => sum + Math.max(0, Number(item.steeringQueueCount) || 0), 0);
  const trackedCount = runtimeSnapshot.items.length;
  const templateCount = (cfg.steeringTemplates || []).length;
  const alertEnabled = cfg.individualCompletionNotificationEnabled || cfg.batchCompletionNotificationEnabled;
  const snoozed = runtimeSnapshot.snoozeUntil > Date.now();
  const quiet = isQuietHoursActiveLocal(cfg);
  const mainStatus = cfg.readyAiEnabled === false ? '사용 안 함' : cfg.dndMode
    ? '방해 금지'
    : (snoozed ? '스누즈 중' : (quiet ? '조용한 시간' : (greenCount > 0 ? '완료 감지' : (orangeCount > 0 ? '감시 중' : '대기 중'))));
  updateSummaryText('main-status-badge', mainStatus);
  updateSummaryText('main-stat-tracked', String(trackedCount));
  updateSummaryText('main-stat-orange', String(orangeCount));
  updateSummaryText('main-stat-green', String(greenCount));
  updateSummaryText('main-stat-queue', String(queueCount));
  updateSummaryText('main-chip-alert', alertEnabled ? `알림 ${soundPresetLabel(cfg.individualCompletionSound)}` : '알림 꺼짐');
  updateSummaryText('main-chip-site', `사이트 ${builtinEnabledCount + customEnabledCount}`);
  updateSummaryText('main-chip-template', `템플릿 ${templateCount}`);
  updateSummaryText('main-chip-quiet', snoozed ? '스누즈 적용' : (cfg.quietHoursEnabled ? getQuietHoursLabel(cfg) : '조용한 시간 꺼짐'));
  setMainStatusTone({ readyAiEnabled: cfg.readyAiEnabled !== false, dndMode: !!cfg.dndMode, snoozed, quiet, greenCount, orangeCount });
  setToneClass('main-chip-alert', 'quick-chip', (!alertEnabled || cfg.dndMode || snoozed || quiet) ? 'muted' : 'positive');
  setToneClass('main-chip-site', 'quick-chip', (builtinEnabledCount + customEnabledCount) > 0 ? 'info' : 'muted');
  setToneClass('main-chip-template', 'quick-chip', templateCount > 0 ? 'info' : 'muted');
  setToneClass('main-chip-quiet', 'quick-chip', (snoozed || quiet) ? 'muted' : 'info');
  updateSummaryText('quick-dnd-sub', cfg.dndMode ? '완료 팝업 숨김' : '완료 팝업 표시');
  updateSummaryText('quick-alert-sub', alertEnabled ? '작업 완료 시 알림 표시' : '완료 알림 꺼짐');
  updateSummaryText('quick-steering-sub', cfg.steeringEnabled ? (cfg.steeringAdvancedEnabled ? `새 채팅 ${normalizeSteeringNewChatTabCount(cfg.steeringNewChatTabCount)}탭` : `${cfg.steeringTheme === 'light' ? '라이트' : '다크'} 패널`) : '런처 꺼짐');
  updateSummaryText('quick-quiet-sub', cfg.quietHoursEnabled ? `${getQuietHoursLabel(cfg)}${quiet ? ' · 지금 적용' : ''}` : '사용 안 함');
  const quickDnd = $('quick-dnd-toggle');
  if (quickDnd && quickDnd.checked !== !!cfg.dndMode) quickDnd.checked = !!cfg.dndMode;
  const quickAlert = $('quick-alert-toggle');
  if (quickAlert && quickAlert.checked !== !!alertEnabled) quickAlert.checked = !!alertEnabled;
  const quickSteering = $('quick-steering-toggle');
  if (quickSteering && quickSteering.checked !== !!cfg.steeringEnabled) quickSteering.checked = !!cfg.steeringEnabled;
  const steeringAdvancedToggle = $('steering-advanced-toggle');
  if (steeringAdvancedToggle && steeringAdvancedToggle.checked !== !!cfg.steeringAdvancedEnabled) steeringAdvancedToggle.checked = !!cfg.steeringAdvancedEnabled;
  const steeringNewChatCount = $('steering-new-chat-count');
  const normalizedNewChatCount = String(normalizeSteeringNewChatTabCount(cfg.steeringNewChatTabCount));
  if (steeringNewChatCount && steeringNewChatCount.value !== normalizedNewChatCount) steeringNewChatCount.value = normalizedNewChatCount;
  const quickQuiet = $('quick-quiet-toggle');
  if (quickQuiet && quickQuiet.checked !== !!cfg.quietHoursEnabled) quickQuiet.checked = !!cfg.quietHoursEnabled;
  const advancedToggleMap = {
    'advanced-steering-enabled': !!cfg.steeringEnabled,
    'advanced-steering-launcher-visible': !!cfg.steeringLauncherVisible,
    'advanced-steering-auto-focus': !!cfg.steeringAutoFocusInput,
    'advanced-steering-close-after-send': !!cfg.steeringCloseAfterSend,
    'advanced-steering-count-visible': !!cfg.steeringQueueCountVisible,
    'advanced-steering-advanced-enabled': !!cfg.steeringAdvancedEnabled,
    'advanced-title-badge-enabled': !!cfg.titleBadgeEnabled,
    'advanced-title-badge-count-enabled': !!cfg.titleBadgeCountEnabled,
    'advanced-history-enabled': !!cfg.completionHistoryEnabled,
    'advanced-dashboard-auto-refresh': !!cfg.dashboardAutoRefreshEnabled,
  };
  Object.entries(advancedToggleMap).forEach(([id, value]) => {
    const el = $(id);
    if (el && el.checked !== value) el.checked = value;
  });
  const advancedSummary = $('advanced-settings-summary');
  if (advancedSummary) {
    const parts = [];
    parts.push(cfg.steeringLauncherVisible ? '후속 지시 버튼 표시' : '후속 지시 버튼 숨김');
    parts.push(cfg.steeringAdvancedEnabled ? `고급 새 채팅 ${normalizeSteeringNewChatTabCount(cfg.steeringNewChatTabCount)}탭` : '기본 후속 지시');
    parts.push(cfg.titleBadgeEnabled ? (cfg.titleBadgeCountEnabled ? '탭 제목 숫자 켜짐' : '탭 제목 숫자 꺼짐') : '탭 제목 표시 꺼짐');
    parts.push(cfg.completionHistoryEnabled ? '완료 이력 저장' : '완료 이력 저장 안 함');
    parts.push(cfg.dashboardAutoRefreshEnabled ? '팝업 자동 새로고침' : '수동 새로고침');
    advancedSummary.textContent = parts.join(' · ');
  }
  setHidden('history-divider', !cfg.completionHistoryEnabled);
  setHidden('history-title', !cfg.completionHistoryEnabled);
  setHidden('completion-history', !cfg.completionHistoryEnabled);
  renderFavorites(cfg);
  renderFavoriteButtons(cfg);
}
function openSheet(sheetId, anchorId = '') {
  document.querySelectorAll('.sheet.active').forEach((el) => el.classList.remove('active'));
  const target = $(sheetId);
  if (target) {
    target.classList.add('active');
    const scroller = target.querySelector('.sheet-scroll');
    if (scroller) scroller.scrollTop = 0;
    if (scroller && anchorId) {
      const anchor = $(anchorId);
      if (anchor && target.contains(anchor)) {
        setTimeout(() => {
          scroller.scrollTop = Math.max(0, anchor.offsetTop - 72);
        }, 0);
      }
    }
    const closeButton = target.querySelector('[data-close-sheet]');
    if (closeButton && typeof closeButton.focus === 'function') setTimeout(() => closeButton.focus(), 0);
  }
  if (sheetId === 'title-manager-sheet' && currentPopupConfig) {
    refreshRuntimeDashboard(currentPopupConfig, true, { force: true }).then(() => {
      renderTitleManager(currentPopupConfig, { preserveInput: false });
    }).catch(() => {
      renderTitleManager(currentPopupConfig, { preserveInput: false });
    });
  }
}
function closeSheets() {
  document.querySelectorAll('.sheet.active').forEach((el) => el.classList.remove('active'));
}
function wireSheetNavigation() {
  document.querySelectorAll('[data-open-sheet]').forEach((btn) => {
    btn.addEventListener('click', () => openSheet(btn.getAttribute('data-open-sheet')));
  });
  document.querySelectorAll('[data-close-sheet]').forEach((btn) => {
    btn.addEventListener('click', () => closeSheets());
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSheets();
  });
}
function updateVolumeLabel(kind, volume) {
  const el = $(`${kind}-volume-label`);
  if (el) el.textContent = `${volumeToPercent(volume)}%`;
}
function updateCustomSoundUi(cfg, kind) {
  const map = getSoundCfg(cfg, kind);
  const select = $(`${kind}-sound`);
  const fileInfo = $(`${kind}-custom-file-info`);
  const clearBtn = $(`${kind}-custom-clear`);
  const uploadRow = $(`${kind}-custom-upload-row`);
  const hasCustom = !!cfg[map.customDataKey];
  if (fileInfo) fileInfo.textContent = hasCustom ? `파일: ${cfg[map.customNameKey] || '사용자 파일'}` : '파일 없음';
  if (clearBtn) clearBtn.disabled = !hasCustom;
  if (uploadRow) uploadRow.classList.toggle('hidden', normalizeSoundKey(select?.value, cfg[map.soundKey]) !== SOUND_PRESETS.custom);
}
function sendSoundTest(cfg, kind) {
  const map = getSoundCfg(cfg, kind);
  const soundKey = normalizeSoundKey(cfg[map.soundKey], SOUND_PRESETS.soft);
  chrome.runtime.sendMessage({
    action: 'test_alert_sound',
    kind,
    soundKey,
    volume: clampNumber(cfg[map.volumeKey], 0.8, 0, 1),
    customSoundDataUrl: String(cfg[map.customDataKey] || ''),
  }, (res) => {
    if (chrome.runtime.lastError) {
      setHint('알림음 테스트 실패: 백그라운드 연결 오류', true);
      return;
    }
    if (res?.ok) {
      setHint('알림음 테스트 재생');
    } else if (soundKey === SOUND_PRESETS.custom && !cfg[map.customDataKey]) {
      setHint('사용자 지정 파일을 먼저 넣어줘', true);
    } else {
      setHint('알림음 재생 실패', true);
    }
  });
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
  });
}
function wireSoundSection(cfg, kind) {
  const map = getSoundCfg(cfg, kind);
  const toggle = $(`${kind}-alert-toggle`);
  const soundSelect = $(`${kind}-sound`);
  const volumeRange = $(`${kind}-volume`);
  const thresholdInput = $('batch-threshold');
  const testBtn = $(`${kind}-sound-test`);
  const fileInput = $(`${kind}-custom-file`);
  const clearBtn = $(`${kind}-custom-clear`);
  if (toggle) {
    toggle.checked = !!cfg[map.enabledKey];
    toggle.addEventListener('change', () => {
      cfg[map.enabledKey] = !!toggle.checked;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (soundSelect) {
    soundSelect.value = normalizeSoundKey(cfg[map.soundKey], SOUND_PRESETS.soft);
    soundSelect.addEventListener('change', () => {
      cfg[map.soundKey] = normalizeSoundKey(soundSelect.value, SOUND_PRESETS.soft);
      updateCustomSoundUi(cfg, kind);
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (volumeRange) {
    volumeRange.value = String(volumeToPercent(cfg[map.volumeKey]));
    updateVolumeLabel(kind, cfg[map.volumeKey]);
    volumeRange.addEventListener('input', () => {
      cfg[map.volumeKey] = percentToVolume(clampInt(volumeRange.value, 80, 0, 100));
      updateVolumeLabel(kind, cfg[map.volumeKey]);
    });
    volumeRange.addEventListener('change', () => {
      cfg[map.volumeKey] = percentToVolume(clampInt(volumeRange.value, 80, 0, 100));
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (kind === 'batch' && thresholdInput) {
    thresholdInput.value = String(cfg.batchCompletionThreshold ?? 4);
    thresholdInput.addEventListener('change', () => {
      cfg.batchCompletionThreshold = clampInt(thresholdInput.value, 4, 2, 99);
      thresholdInput.value = String(cfg.batchCompletionThreshold);
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (testBtn) {
    testBtn.addEventListener('click', () => sendSoundTest(cfg, kind));
  }
  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > MAX_CUSTOM_SOUND_FILE_BYTES) {
        setHint('사운드 파일은 2MB 이하로 넣어줘', true);
        fileInput.value = '';
        return;
      }
      try {
        const dataUrl = await readFileAsDataUrl(file);
        cfg[map.customDataKey] = dataUrl;
        cfg[map.customNameKey] = file.name || '사용자 파일';
        cfg[map.soundKey] = SOUND_PRESETS.custom;
        if (soundSelect) soundSelect.value = SOUND_PRESETS.custom;
        updateCustomSoundUi(cfg, kind);
        saveConfig(cfg, () => {
          refreshSummary(cfg);
          setHint('사용자 지정 알림음 저장됨');
        });
      } catch (_) {
        setHint('파일 읽기 실패', true);
      } finally {
        fileInput.value = '';
      }
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      cfg[map.customDataKey] = '';
      cfg[map.customNameKey] = '';
      if (cfg[map.soundKey] === SOUND_PRESETS.custom) {
        cfg[map.soundKey] = kind === 'batch' ? SOUND_PRESETS.triple : SOUND_PRESETS.soft;
        if (soundSelect) soundSelect.value = cfg[map.soundKey];
      }
      updateCustomSoundUi(cfg, kind);
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('사용자 지정 알림음 삭제됨');
      });
    });
  }
  updateCustomSoundUi(cfg, kind);
}
function pQueryTabs(query) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query(query, (tabs) => resolve(Array.isArray(tabs) ? tabs : []));
    } catch (_) {
      resolve([]);
    }
  });
}
function pSendTabMessage(tabId, message, options = null) {
  return new Promise((resolve) => {
    try {
      const opts = options || {};
      const targetOptions = opts.allFrames
        ? {}
        : { frameId: Number.isFinite(Number(opts.frameId)) ? Number(opts.frameId) : 0 };
      const payload = opts.topFrameOnly === false
        ? (message || {})
        : { ...(message || {}), topFrameOnly: true };
      chrome.tabs.sendMessage(tabId, payload, targetOptions, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || '메시지 전송 실패' });
          return;
        }
        resolve(res || { ok: true });
      });
    } catch (err) {
      resolve({ ok: false, error: err?.message || '메시지 전송 실패' });
    }
  });
}
function pUpdateTab(tabId, props) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.update(tabId, props, (tab) => resolve(tab || null));
    } catch (_) {
      resolve(null);
    }
  });
}
function pUpdateWindow(windowId, props) {
  return new Promise((resolve) => {
    try {
      chrome.windows.update(windowId, props, (win) => resolve(win || null));
    } catch (_) {
      resolve(null);
    }
  });
}
function requestDashboardMeta() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'get_dashboard_meta' }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, version: 0, itemsCount: 0, hasOrange: false, hasGreen: false });
        return;
      }
      resolve(res?.ok ? res : { ok: false, version: 0, itemsCount: 0, hasOrange: false, hasGreen: false });
    });
  });
}
function requestDashboard() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'get_dashboard' }, (res) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, items: [], history: [], snoozeUntil: 0, version: 0 });
        return;
      }
      resolve(res?.ok ? res : { ok: false, items: [], history: [], snoozeUntil: 0, version: 0 });
    });
  });
}
async function focusTab(tabId, windowId) {
  await pUpdateTab(tabId, { active: true });
  if (typeof windowId === 'number') await pUpdateWindow(windowId, { focused: true });
}
async function sendSteeringToActiveTab(text) {
  const tabs = await pQueryTabs({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) {
    setHint('현재 활성 탭을 찾지 못함', true);
    return false;
  }
  return sendSteeringToTab(tab.id, text, { successText: '현재 탭에 대기 추가됨' });
}
async function fillPatternFromCurrentTab() {
  const tabs = await pQueryTabs({ active: true, currentWindow: true });
  const tab = tabs[0];
  const url = String(tab?.url || '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    setHint('현재 탭 URL에서 패턴을 만들 수 없음', true);
    return;
  }
  try {
    const parsed = new URL(url);
    $('custom-name').value = $('custom-name').value || (parsed.hostname.replace(/^www\./, '') || 'My AI 서비스');
    $('custom-patterns').value = `${parsed.origin}/*`;
    setHint('현재 탭 기준으로 패턴 채움');
  } catch (_) {
    setHint('현재 탭 URL 해석 실패', true);
  }
}
function renderHistory(history) {
  const container = $('completion-history');
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(history) || !history.length) {
    const empty = document.createElement('div');
    empty.className = 'desc';
    empty.textContent = '최근 완료 이력이 없습니다.';
    container.appendChild(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  history.slice(0, 12).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'history-row';
    const top = document.createElement('div');
    top.className = 'history-top';
    const left = document.createElement('div');
    left.className = 'history-left';
    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = item.kind === 'batch'
      ? `일괄 완료 · ${item.peakOrangeCount || 0}개`
      : (item.siteName || 'AI 답변 완료');
    const sub = document.createElement('div');
    sub.className = 'history-sub';
    sub.setAttribute('data-role', 'relative-time');
    sub.setAttribute('data-mode', 'history');
    sub.setAttribute('data-ts', String(item.at || 0));
    sub.textContent = `${formatTime(item.at)} · ${formatAgo(item.at)}`;
    left.appendChild(title);
    left.appendChild(sub);
    top.appendChild(left);
    row.appendChild(top);
    frag.appendChild(row);
  });
  container.appendChild(frag);
}
function renderDashboardData(data, cfg) {
  runtimeSnapshot = {
    items: Array.isArray(data?.items) ? data.items : [],
    history: Array.isArray(data?.history) ? data.history : [],
    snoozeUntil: clampInt(data?.snoozeUntil, 0, 0, Number.MAX_SAFE_INTEGER),
    quietHoursActive: !!data?.quietHoursActive,
    suppressionReason: String(data?.suppressionReason || ''),
  };
  invalidateFilteredDashboardCache();
  lastDashboardVersionSeen = clampInt(data?.version, lastDashboardVersionSeen || 0, 0, Number.MAX_SAFE_INTEGER);
  lastDashboardFetchedAt = Date.now();
  updateDashboardViewUi();
  const visibleItems = getFilteredDashboardItems();
  const listSignature = buildDashboardListSignature(visibleItems, dashboardView);
  const historySignature = buildHistorySignature(runtimeSnapshot.history);
  if (lastDashboardListSignature !== listSignature) {
    lastDashboardListSignature = listSignature;
    const container = $('dashboard-list');
    if (container) {
      container.innerHTML = '';
      if (!visibleItems.length) {
        const empty = document.createElement('div');
        empty.className = 'desc';
        empty.textContent = runtimeSnapshot.items.length ? '필터 조건에 맞는 탭이 없습니다.' : '현재 추적 중인 탭이 없습니다.';
        container.appendChild(empty);
      } else {
        const frag = document.createDocumentFragment();
        visibleItems.forEach((item) => {
          const row = document.createElement('div');
          row.className = `dash-row is-${statusClass(item.status)}`;
          const top = document.createElement('div');
          top.className = 'dash-top';
          const left = document.createElement('div');
          left.className = 'dash-left';
          const title = document.createElement('div');
          title.className = 'dash-title';
          title.textContent = item.title || item.siteName || getHostLabel(item.url) || `탭 ${item.tabId}`;
          const sub = document.createElement('div');
          sub.className = 'dash-sub';
          const queueLabel = item.steeringQueueCount ? ` · 대기열 ${item.steeringQueueCount}` : '';
          const pinLabel = item.hasCustomTabTitle ? ` · 변경: ${item.customTabTitle}` : '';
          const staticSuffix = `${queueLabel}${pinLabel}`;
          const dynamicSuffix = getDashboardDynamicSuffixFromElement({
            getAttribute(name) {
              if (name === 'data-static-suffix') return staticSuffix;
              if (name === 'data-status') return item.status || '';
              if (name === 'data-orange-since-at') return String(item.orangeSinceAt || 0);
              return '';
            },
          }, staticSuffix);
          sub.setAttribute('data-role', 'relative-time');
          sub.setAttribute('data-mode', 'dashboard');
          sub.setAttribute('data-ts', String(item.lastUpdateAt || 0));
          sub.setAttribute('data-prefix', `${item.siteName || item.platform || '미확인'} · ${item.host || getHostLabel(item.url) || 'URL 없음'} · `);
          sub.setAttribute('data-suffix', staticSuffix);
          sub.setAttribute('data-static-suffix', staticSuffix);
          sub.setAttribute('data-status', item.status || '');
          sub.setAttribute('data-orange-since-at', String(item.orangeSinceAt || 0));
          sub.textContent = `${item.siteName || item.platform || '미확인'} · ${item.host || getHostLabel(item.url) || 'URL 없음'} · ${formatAgo(item.lastUpdateAt)}${dynamicSuffix}`;
          left.appendChild(title);
          left.appendChild(sub);
          const state = document.createElement('span');
          state.className = `state-chip ${statusClass(item.status)}`;
          state.textContent = statusLabel(item.status);
          top.appendChild(left);
          top.appendChild(state);
          row.appendChild(top);
          const actions = document.createElement('div');
          actions.className = 'dash-actions';
          const openBtn = document.createElement('button');
          openBtn.className = 'btn primary';
          openBtn.type = 'button';
          openBtn.textContent = '탭 열기';
          openBtn.addEventListener('click', () => focusTab(item.tabId, item.windowId));
          const forceBtn = document.createElement('button');
          forceBtn.className = 'btn';
          forceBtn.type = 'button';
          forceBtn.textContent = '강제 확인';
          forceBtn.addEventListener('click', async () => {
            await ensureContentForTab(item.tabId, 'popup_dashboard_force_check');
            const res = await pSendTabMessage(
              item.tabId,
              { action: 'force_check', reason: 'popup_dashboard', topFrameOnly: true },
              { frameId: 0 }
            );
            setHint(res?.ok ? '강제 확인 요청 전송' : '강제 확인 요청 실패', !res?.ok);
          });
          const sendBtn = document.createElement('button');
          sendBtn.className = 'btn';
          sendBtn.type = 'button';
          sendBtn.textContent = '이 탭 전송';
          sendBtn.addEventListener('click', async () => {
            const ok = await sendSteeringToTab(item.tabId, getDraftValue(cfg), { successText: '이 탭에 대기 추가됨' });
            if (ok) refreshRuntimeDashboard(cfg, true);
          });
          const clearBtn = document.createElement('button');
          clearBtn.className = 'btn';
          clearBtn.type = 'button';
          clearBtn.textContent = '대기열 비우기';
          clearBtn.addEventListener('click', async () => {
            const ok = await clearSteeringQueueForTab(item.tabId);
            if (ok) refreshRuntimeDashboard(cfg, true);
          });
          const copyBtn = document.createElement('button');
          copyBtn.className = 'btn';
          copyBtn.type = 'button';
          copyBtn.textContent = '링크 복사';
          copyBtn.addEventListener('click', () => copyTextToClipboard(item.url, '탭 링크 복사됨'));
          const pinBtn = document.createElement('button');
          pinBtn.className = 'btn';
          pinBtn.type = 'button';
          pinBtn.textContent = item.hasCustomTabTitle ? '이름 해제' : '기본 이름 변경';
          pinBtn.addEventListener('click', async () => {
            if (item.hasCustomTabTitle) {
              const ok = await clearCustomTitleForTabId(item.tabId);
              if (ok) {
                await refreshRuntimeDashboard(cfg, true, { force: true });
                if ($('title-manager-sheet')?.classList.contains('active')) renderTitleManager(cfg);
              }
              return;
            }
            const fallbackTitle = normalizeCustomTabTitleValue(item.siteName || item.platform || item.host || item.title || `탭 ${item.tabId}`);
            const ok = await setCustomTitleForTabId(item.tabId, fallbackTitle);
            if (ok) {
              await refreshRuntimeDashboard(cfg, true, { force: true });
              if ($('title-manager-sheet')?.classList.contains('active')) renderTitleManager(cfg);
            }
          });
          actions.appendChild(openBtn);
          actions.appendChild(forceBtn);
          actions.appendChild(sendBtn);
          actions.appendChild(clearBtn);
          actions.appendChild(copyBtn);
          actions.appendChild(pinBtn);
          row.appendChild(actions);
          frag.appendChild(row);
        });
        container.appendChild(frag);
      }
    }
  }
  const visibleSummary = getVisibleDashboardSummary(visibleItems);
  const longRunningCount = visibleItems.filter((item) => isLongRunningDashboardItem(item)).length;
  const statsSignature = JSON.stringify({
    visibleSummary,
    longRunningCount,
    totalOrange: runtimeSnapshot.items.filter((item) => item.status === 'ORANGE').length,
    totalGreen: runtimeSnapshot.items.filter((item) => item.status === 'GREEN').length,
    totalQueue: runtimeSnapshot.items.reduce((sum, item) => sum + Math.max(0, Number(item.steeringQueueCount) || 0), 0),
    snoozeUntil: runtimeSnapshot.snoozeUntil,
    quietHoursActive: runtimeSnapshot.quietHoursActive,
    suppressionReason: runtimeSnapshot.suppressionReason,
    quietHoursEnabled: !!cfg.quietHoursEnabled,
    quietHoursStart: cfg.quietHoursStart,
    quietHoursEnd: cfg.quietHoursEnd,
    dndMode: !!cfg.dndMode,
  });
  if (lastDashboardStatsSignature !== statsSignature) {
    lastDashboardStatsSignature = statsSignature;
    const bulkStatus = $('dashboard-bulk-status');
    if (bulkStatus) bulkStatus.textContent = `현재 필터 기준 ${visibleSummary.total}개 · 진행중 ${visibleSummary.orange} · 완료 ${visibleSummary.green} · 대기열 ${visibleSummary.queued}${longRunningCount ? ` · 장기 진행 ${longRunningCount}` : ''}`;
    const visibleCount = $('dashboard-visible-count');
    if (visibleCount) visibleCount.textContent = `표시 ${visibleItems.length}`;
    const orangeCount = $('dashboard-orange-count');
    if (orangeCount) orangeCount.textContent = `진행중 ${runtimeSnapshot.items.filter((item) => item.status === 'ORANGE').length}`;
    const greenCount = $('dashboard-green-count');
    if (greenCount) greenCount.textContent = `완료 ${runtimeSnapshot.items.filter((item) => item.status === 'GREEN').length}`;
    const queueCount = $('dashboard-queue-count');
    if (queueCount) queueCount.textContent = `대기열 ${runtimeSnapshot.items.reduce((sum, item) => sum + Math.max(0, Number(item.steeringQueueCount) || 0), 0)}`;
    const attentionCount = $('dashboard-attention-count');
    if (attentionCount) attentionCount.textContent = `주의 ${longRunningCount}`;
    const snoozeStatus = $('snooze-status');
    if (snoozeStatus) snoozeStatus.textContent = getRuntimeSuppressionLabel(cfg);
    const quietStatus = $('quiet-hours-status');
    if (quietStatus) {
      quietStatus.textContent = cfg.quietHoursEnabled
        ? `${getQuietHoursLabel(cfg)} · ${isQuietHoursActiveLocal(cfg) ? '지금 적용 중' : '대기 중'}`
        : '사용 안 함';
    }
  }
  if (cfg.completionHistoryEnabled) {
    if (lastHistorySignature !== historySignature) {
      lastHistorySignature = historySignature;
      renderHistory(runtimeSnapshot.history);
    }
  } else {
    lastHistorySignature = '';
    const historyContainer = $('completion-history');
    if (historyContainer) historyContainer.innerHTML = '';
  }
  refreshRelativeTimeLabels(true);
  refreshSummary(cfg);
}
async function refreshRuntimeDashboard(cfg, silent = false, options = {}) {
  if (options?.fromAutoPoll && cfg?.dashboardAutoRefreshEnabled === false) {
    return Promise.resolve({ ok: true, skipped: true, reason: 'auto_refresh_disabled' });
  }
  if (dashboardRefreshInFlight) return dashboardRefreshInFlight;
  dashboardRefreshInFlight = (async () => {
    try {
      const force = !!options.force;
      let shouldFetchFull = force;
      let meta = null;
      if (!shouldFetchFull) {
        meta = await requestDashboardMeta();
        if (!meta?.ok) {
          shouldFetchFull = true;
        } else if (meta.version !== lastDashboardVersionSeen) {
          shouldFetchFull = true;
        } else if ((Date.now() - lastDashboardFetchedAt) >= DASHBOARD_META_FORCE_REFRESH_MS) {
          shouldFetchFull = true;
        }
      }
      if (!shouldFetchFull) {
        refreshRelativeTimeLabels();
        return { ok: true, skipped: true, version: meta?.version || lastDashboardVersionSeen };
      }
      const data = await requestDashboard();
      renderDashboardData(data, cfg);
      if (!silent && !data?.ok) setHint('실시간 상태를 일부 불러오지 못함', true);
      return data;
    } finally {
      dashboardRefreshInFlight = null;
    }
  })();
  return dashboardRefreshInFlight;
}
function renderTemplates(cfg) {
  const draft = $('template-draft');
  if (draft && draft.value !== cfg.steeringRecentDraft) draft.value = cfg.steeringRecentDraft || '';
  const container = $('templates-list');
  if (!container) return;
  const normalized = normalizeTemplateList(cfg.steeringTemplates);
  if (JSON.stringify(normalized) !== JSON.stringify(cfg.steeringTemplates || [])) cfg.steeringTemplates = normalized;
  container.innerHTML = '';
  const templates = normalized;
  if (!templates.length) {
    const empty = document.createElement('div');
    empty.className = 'desc';
    empty.textContent = '저장된 대기 템플릿이 없습니다.';
    container.appendChild(empty);
    return;
  }
  templates.forEach((template, index) => {
    const row = document.createElement('div');
    row.className = 'template-row';
    row.title = getTemplateTooltip(template);
    const top = document.createElement('div');
    top.className = 'template-top';
    const left = document.createElement('div');
    left.className = 'template-left';
    const title = document.createElement('div');
    title.className = 'template-title';
    title.textContent = template.name || `템플릿 ${index + 1}`;
    const sub = document.createElement('div');
    sub.className = 'template-sub';
    sub.textContent = getTemplatePreview(template);
    left.appendChild(title);
    left.appendChild(sub);
    if (template.tooltip) {
      const note = document.createElement('div');
      note.className = 'template-note';
      note.textContent = `툴팁: ${truncateText(template.tooltip, 90)}`;
      left.appendChild(note);
    }
    const promptLine = document.createElement('div');
    promptLine.className = 'template-prompt';
    promptLine.textContent = truncateText(template.text, 120);
    left.appendChild(promptLine);
    top.appendChild(left);
    row.appendChild(top);
    const actions = document.createElement('div');
    actions.className = 'template-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn';
    editBtn.type = 'button';
    editBtn.textContent = '수정';
    editBtn.addEventListener('click', () => {
      setTemplateEditorState(template);
      cfg.steeringRecentDraft = template.text;
      saveConfig(cfg, () => {
        renderTemplates(cfg);
        setHint('템플릿 수정 모드로 불러옴');
      });
    });
    const fillBtn = document.createElement('button');
    fillBtn.className = 'btn';
    fillBtn.type = 'button';
    fillBtn.textContent = '입력칸 채우기';
    fillBtn.addEventListener('click', () => {
      cfg.steeringRecentDraft = template.text;
      saveConfig(cfg, () => {
        const editor = $('template-draft');
        if (editor) editor.value = template.text;
        setHint('입력칸에 템플릿 채움');
      });
    });
    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn primary';
    sendBtn.type = 'button';
    sendBtn.textContent = '현재 탭 전송';
    sendBtn.addEventListener('click', async () => {
      const ok = await sendSteeringToActiveTab(template.text);
      if (ok) refreshRuntimeDashboard(cfg, true);
    });
    const delBtn = document.createElement('button');
    delBtn.className = 'btn danger';
    delBtn.type = 'button';
    delBtn.textContent = '삭제';
    delBtn.addEventListener('click', () => {
      cfg.steeringTemplates = normalizeTemplateList((cfg.steeringTemplates || []).filter((item) => String(item?.id || '') !== template.id));
      if (String($('template-editing-id')?.value || '') === template.id) setTemplateEditorState(null);
      saveConfig(cfg, () => {
        renderTemplates(cfg);
        refreshSummary(cfg);
        setHint('템플릿 삭제됨');
      });
    });
    actions.appendChild(editBtn);
    actions.appendChild(fillBtn);
    actions.appendChild(sendBtn);
    actions.appendChild(delBtn);
    row.appendChild(actions);
    container.appendChild(row);
  });
}
function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportSettings() {
  chrome.storage.local.get(null, (all) => {
    downloadJson(`ready_ai_settings_${Date.now()}.json`, all || {});
    setHint('설정 내보내기 완료');
  });
}
async function importSettingsFile(cfg) {
  const file = $('import-settings-file')?.files?.[0];
  if (!file) {
    setHint('가져올 JSON 파일을 먼저 골라줘', true);
    return;
  }
  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setHint('JSON 형식이 올바르지 않음', true);
      return;
    }
    cancelPendingConfigSave();
    await sendRuntimeMessage({ action: 'reset_runtime_caches_for_storage_replace' });
    chrome.storage.local.set(parsed, () => {
      if (chrome.runtime.lastError) {
        setHint('설정 가져오기 실패', true);
        return;
      }
      loadConfig((newCfg) => {
        Object.keys(cfg).forEach((key) => delete cfg[key]);
        Object.assign(cfg, newCfg);
        renderBuiltinSites(cfg);
        renderCustomSites(cfg);
        renderTemplates(cfg);
        refreshRuntimeDashboard(cfg, true);
        refreshSummary(cfg);
        if (cfg.dashboardAutoRefreshEnabled) startDashboardPolling(cfg); else stopDashboardPolling();
        setHint('설정 가져오기 완료');
      });
    });
  } catch (_) {
    setHint('설정 파일 읽기 또는 해석 실패', true);
  } finally {
    const input = $('import-settings-file');
    if (input) input.value = '';
  }
}
function setSnoozeUntil(ts, cfg) {
  chrome.storage.local.set({ notificationSnoozeUntil: ts }, () => {
    runtimeSnapshot.snoozeUntil = ts;
    refreshSummary(cfg);
    const snoozeStatus = $('snooze-status');
    if (snoozeStatus) {
      snoozeStatus.textContent = ts > Date.now()
        ? `현재 ${formatDateTime(ts)}까지 알림 중지`
        : '현재 알림 중지 없음';
    }
    setHint(ts > Date.now() ? '알림 잠시 끄기 적용됨' : '알림 잠시 끄기 해제됨');
  });
}
function renderReadyAiUsageControl(cfg) {
  const enabled = cfg.readyAiEnabled !== false;
  const control = $('ready-ai-usage');
  if (control) control.dataset.enabled = String(enabled);
  $('ready-ai-use-on')?.setAttribute('aria-pressed', String(enabled));
  $('ready-ai-use-off')?.setAttribute('aria-pressed', String(!enabled));
  if ($('ready-ai-usage-state')) $('ready-ai-usage-state').textContent = enabled ? '사용 중' : '사용 안 함';
  if ($('ready-ai-usage-note')) $('ready-ai-usage-note').textContent = enabled
    ? '후속 지시와 완료 알림을 사용합니다.'
    : '후속 대기는 보관합니다. 화면 버튼·자동 전송·알림은 멈춥니다.';
}
function setReadyAiUsageEnabled(cfg, enabled) {
  const previous = cfg.readyAiEnabled !== false;
  cfg.readyAiEnabled = !!enabled;
  renderReadyAiUsageControl(cfg);
  chrome.storage.local.set({ readyAiEnabled: cfg.readyAiEnabled }, () => {
    if (chrome.runtime.lastError) {
      cfg.readyAiEnabled = previous;
      renderReadyAiUsageControl(cfg);
      setHint('사용 상태를 변경하지 못했습니다.', true);
      return;
    }
    refreshSummary(cfg);
    setHint(enabled ? 'Ready_AI를 켰습니다. 보관된 대기는 확인 후 재개할 수 있습니다.' : 'Ready_AI를 껐습니다. 후속 대기는 보관됩니다.');
    if (enabled) ensureActiveTabContent('usage_enabled').catch(() => {});
  });
}
function wireActions(cfg) {
  $('ready-ai-use-on')?.addEventListener('click', () => setReadyAiUsageEnabled(cfg, true));
  $('ready-ai-use-off')?.addEventListener('click', () => setReadyAiUsageEnabled(cfg, false));
  document.querySelectorAll('[data-home-dashboard-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      dashboardView.filter = button.dataset.homeDashboardFilter;
      dashboardView.search = '';
      if ($('dashboard-search')) $('dashboard-search').value = '';
      invalidateFilteredDashboardCache();
      openSheet('dashboard-sheet');
      refreshRuntimeDashboard(cfg, true, { force: true }).catch(() => {});
    });
  });
  document.querySelectorAll('[data-favorite-id]').forEach((button) => {
    button.addEventListener('click', () => {
      togglePopupFavorite(String(button.getAttribute('data-favorite-id') || ''), cfg);
    });
  });
  const dndToggle = $('dnd-toggle');
  if (dndToggle) {
    dndToggle.checked = !!cfg.dndMode;
    dndToggle.addEventListener('change', () => {
      cfg.dndMode = dndToggle.checked;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  const quickDndToggle = $('quick-dnd-toggle');
  if (quickDndToggle) {
    quickDndToggle.checked = !!cfg.dndMode;
    quickDndToggle.addEventListener('change', () => {
      cfg.dndMode = !!quickDndToggle.checked;
      if (dndToggle) dndToggle.checked = cfg.dndMode;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        refreshRuntimeDashboard(cfg, true);
        setHint('저장됨');
      });
    });
  }
  const quickAlertToggle = $('quick-alert-toggle');
  if (quickAlertToggle) {
    quickAlertToggle.checked = !!(cfg.individualCompletionNotificationEnabled || cfg.batchCompletionNotificationEnabled);
    quickAlertToggle.addEventListener('change', () => {
      const enabled = !!quickAlertToggle.checked;
      cfg.individualCompletionNotificationEnabled = enabled;
      cfg.batchCompletionNotificationEnabled = enabled;
      if ($('individual-alert-toggle')) $('individual-alert-toggle').checked = enabled;
      if ($('batch-alert-toggle')) $('batch-alert-toggle').checked = enabled;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        refreshRuntimeDashboard(cfg, true);
        setHint(enabled ? '완료 알림 켜짐' : '완료 알림 꺼짐');
      });
    });
  }
  const steeringToggle = $('steering-toggle');
  const steeringTheme = $('steering-theme');
  const steeringAdvancedToggle = $('steering-advanced-toggle');
  const steeringNewChatCount = $('steering-new-chat-count');
  if (steeringToggle) {
    steeringToggle.checked = !!cfg.steeringEnabled;
    steeringToggle.addEventListener('change', () => {
      cfg.steeringEnabled = !!steeringToggle.checked;
      if ($('advanced-steering-enabled')) $('advanced-steering-enabled').checked = cfg.steeringEnabled;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  const quickSteeringToggle = $('quick-steering-toggle');
  if (quickSteeringToggle) {
    quickSteeringToggle.checked = !!cfg.steeringEnabled;
    quickSteeringToggle.addEventListener('change', () => {
      cfg.steeringEnabled = !!quickSteeringToggle.checked;
      if (steeringToggle) steeringToggle.checked = cfg.steeringEnabled;
      if ($('advanced-steering-enabled')) $('advanced-steering-enabled').checked = cfg.steeringEnabled;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (steeringTheme) {
    steeringTheme.value = String(cfg.steeringTheme || 'dark').trim().toLowerCase() === 'light' ? 'light' : 'dark';
    steeringTheme.addEventListener('change', () => {
      cfg.steeringTheme = steeringTheme.value === 'light' ? 'light' : 'dark';
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (steeringAdvancedToggle) {
    steeringAdvancedToggle.checked = !!cfg.steeringAdvancedEnabled;
    steeringAdvancedToggle.addEventListener('change', () => {
      cfg.steeringAdvancedEnabled = !!steeringAdvancedToggle.checked;
      if ($('advanced-steering-advanced-enabled')) $('advanced-steering-advanced-enabled').checked = cfg.steeringAdvancedEnabled;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (steeringNewChatCount) {
    steeringNewChatCount.value = String(normalizeSteeringNewChatTabCount(cfg.steeringNewChatTabCount));
    const getSingleNewChatCountDigit = (value) => {
      const digits = String(value || '').replace(/[^\d]/g, '');
      const validDigits = digits.split('').filter((digit) => /^[1-8]$/.test(digit));
      return validDigits.length ? validDigits[validDigits.length - 1] : '';
    };
    const commitNewChatCountDigit = (value) => {
      const digit = getSingleNewChatCountDigit(value);
      if (!digit) return false;
      cfg.steeringNewChatTabCount = normalizeSteeringNewChatTabCount(digit);
      steeringNewChatCount.value = String(cfg.steeringNewChatTabCount);
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
      return true;
    };
    steeringNewChatCount.addEventListener('keydown', (event) => {
      const key = String(event.key || '');
      if (/^[1-8]$/.test(key)) {
        event.preventDefault();
        commitNewChatCountDigit(key);
        return;
      }
      if (key === 'Backspace' || key === 'Delete') {
        event.preventDefault();
        steeringNewChatCount.value = '';
        return;
      }
      if (key === 'ArrowUp' || key === 'ArrowDown') {
        event.preventDefault();
        const base = normalizeSteeringNewChatTabCount(steeringNewChatCount.value || cfg.steeringNewChatTabCount);
        commitNewChatCountDigit(String(Math.max(1, Math.min(8, base + (key === 'ArrowUp' ? 1 : -1)))));
        return;
      }
      if (key.length === 1) event.preventDefault();
    });
    steeringNewChatCount.addEventListener('input', () => {
      const raw = String(steeringNewChatCount.value || '').trim();
      if (!raw) return;
      commitNewChatCountDigit(raw);
    });
    steeringNewChatCount.addEventListener('change', () => {
      cfg.steeringNewChatTabCount = normalizeSteeringNewChatTabCount(steeringNewChatCount.value);
      steeringNewChatCount.value = String(cfg.steeringNewChatTabCount);
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  const bindAdvancedToggle = (id, key, options = {}) => {
    const el = $(id);
    if (!el) return;
    el.checked = !!cfg[key];
    el.addEventListener('change', () => {
      cfg[key] = !!el.checked;
      if (options.syncMainSteeringToggle && $('steering-toggle')) $('steering-toggle').checked = !!cfg[key];
      if (options.syncQuickSteeringToggle && $('quick-steering-toggle')) $('quick-steering-toggle').checked = !!cfg[key];
      if (options.syncMainSteeringAdvancedToggle && $('steering-advanced-toggle')) $('steering-advanced-toggle').checked = !!cfg[key];
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        refreshRuntimeDashboard(cfg, true);
        if (key === 'dashboardAutoRefreshEnabled') {
          if (cfg.dashboardAutoRefreshEnabled) startDashboardPolling(cfg);
          else stopDashboardPolling();
        }
        setHint('저장됨');
      });
    });
  };
  bindAdvancedToggle('advanced-steering-enabled', 'steeringEnabled', { syncMainSteeringToggle: true, syncQuickSteeringToggle: true });
  bindAdvancedToggle('advanced-steering-launcher-visible', 'steeringLauncherVisible');
  bindAdvancedToggle('advanced-steering-auto-focus', 'steeringAutoFocusInput');
  bindAdvancedToggle('advanced-steering-close-after-send', 'steeringCloseAfterSend');
  bindAdvancedToggle('advanced-steering-count-visible', 'steeringQueueCountVisible');
  bindAdvancedToggle('advanced-steering-advanced-enabled', 'steeringAdvancedEnabled', { syncMainSteeringAdvancedToggle: true });
  bindAdvancedToggle('advanced-title-badge-enabled', 'titleBadgeEnabled');
  bindAdvancedToggle('advanced-title-badge-count-enabled', 'titleBadgeCountEnabled');
  bindAdvancedToggle('advanced-history-enabled', 'completionHistoryEnabled');
  bindAdvancedToggle('advanced-dashboard-auto-refresh', 'dashboardAutoRefreshEnabled');
  const probeToggle = $('gemini-probe-toggle');
  const probePeriod = $('gemini-probe-period');
  const probeIdleToggle = $('gemini-probe-idle-toggle');
  const probeIdleSec = $('gemini-probe-idle-sec');
  const probeMinOrangeSec = $('gemini-probe-min-orange-sec');
  if (probeToggle) {
    probeToggle.checked = !!cfg.geminiProbeEnabled;
    probeToggle.addEventListener('change', () => {
      cfg.geminiProbeEnabled = !!probeToggle.checked;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (probePeriod) {
    probePeriod.value = String(cfg.geminiProbePeriodMin ?? 1);
    probePeriod.addEventListener('change', () => {
      cfg.geminiProbePeriodMin = clampNumber(probePeriod.value, 1, 1, 60);
      probePeriod.value = String(cfg.geminiProbePeriodMin);
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (probeIdleToggle) {
    probeIdleToggle.checked = !!cfg.geminiProbeOnlyIdle;
    probeIdleToggle.addEventListener('change', () => {
      cfg.geminiProbeOnlyIdle = !!probeIdleToggle.checked;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (probeIdleSec) {
    probeIdleSec.value = String(cfg.geminiProbeIdleSec ?? 60);
    probeIdleSec.addEventListener('change', () => {
      cfg.geminiProbeIdleSec = clampInt(probeIdleSec.value, 60, 15, 3600);
      probeIdleSec.value = String(cfg.geminiProbeIdleSec);
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  if (probeMinOrangeSec) {
    probeMinOrangeSec.value = String(cfg.geminiProbeMinOrangeSec ?? 12);
    probeMinOrangeSec.addEventListener('change', () => {
      cfg.geminiProbeMinOrangeSec = clampInt(probeMinOrangeSec.value, 12, 3, 600);
      probeMinOrangeSec.value = String(cfg.geminiProbeMinOrangeSec);
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        setHint('저장됨');
      });
    });
  }
  wireSoundSection(cfg, 'individual');
  wireSoundSection(cfg, 'batch');
  $('add-custom')?.addEventListener('click', () => {
    const sitesApi = getSitesApi();
    if (!sitesApi) return;
    const name = String($('custom-name').value || '').trim();
    const rawPatterns = $('custom-patterns').value;
    const patterns = sitesApi.normalizePatterns(rawPatterns);
    const detection = String($('custom-detection').value || 'generic_stop').trim();
    if (!name) {
      setHint('이름을 입력해줘', true);
      return;
    }
    if (!patterns.length) {
      setHint('URL 패턴을 1개 이상 입력해줘', true);
      return;
    }
    const bad = patterns.find((p) => !sitesApi.isProbablyValidMatchPattern(p));
    if (bad) {
      setHint(`URL 패턴 형식이 이상함: ${bad}`, true);
      return;
    }
    const id = sitesApi.makeCustomId();
    cfg.customSites = [...(cfg.customSites || []), { id, name, patterns, detection, enabled: true }];
    saveConfig(cfg, () => {
      $('custom-name').value = '';
      $('custom-patterns').value = '';
      $('custom-detection').value = 'generic_stop';
      renderCustomSites(cfg);
      refreshSummary(cfg);
      setHint('추가됨');
    });
  });
  $('fill-current-pattern')?.addEventListener('click', () => fillPatternFromCurrentTab());
  $('reset-defaults')?.addEventListener('click', async () => {
    cancelPendingConfigSave();
    await sendRuntimeMessage({ action: 'reset_runtime_caches_for_storage_replace' });
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        setHint('전체 설정 초기화 실패', true);
        return;
      }
      lastSavedConfigSignature = '';
      setHint('전체 설정 초기화됨');
      setTimeout(() => window.location.reload(), 200);
    });
  });
const draft = $('template-draft');
const templateName = $('template-name');
const templateTooltip = $('template-tooltip');
setTemplateEditorState(null);
if (draft) {
  draft.value = cfg.steeringRecentDraft || '';
  draft.addEventListener('input', () => {
    cfg.steeringRecentDraft = draft.value;
  });
  draft.addEventListener('change', () => {
    cfg.steeringRecentDraft = draft.value;
    saveConfig(cfg, () => {});
  });
}
templateName?.addEventListener('input', () => {
  if (templateName.value.length > MAX_TEMPLATE_NAME_LENGTH) templateName.value = templateName.value.slice(0, MAX_TEMPLATE_NAME_LENGTH);
});
templateTooltip?.addEventListener('input', () => {
  if (templateTooltip.value.length > MAX_TEMPLATE_TOOLTIP_LENGTH) templateTooltip.value = templateTooltip.value.slice(0, MAX_TEMPLATE_TOOLTIP_LENGTH);
});
$('clear-template-draft')?.addEventListener('click', () => {
  cfg.steeringRecentDraft = '';
  setTemplateEditorState(null);
  saveConfig(cfg, () => setHint('입력칸 비움'));
});
$('cancel-template-edit')?.addEventListener('click', () => {
  setTemplateEditorState(null);
  setHint('템플릿 수정 취소');
});
$('save-template')?.addEventListener('click', () => {
  const payload = readTemplateEditor();
  if (!payload.text) {
    setHint('저장할 문구를 먼저 입력해줘', true);
    return;
  }
  const current = normalizeTemplateList(cfg.steeringTemplates);
  const nextTemplate = {
    id: payload.id || buildTemplateId(),
    name: payload.name || `템플릿 ${current.length + 1}`,
    text: payload.text,
    tooltip: payload.tooltip,
  };
  const next = [];
  let updated = false;
  current.forEach((item) => {
    if (item.id === nextTemplate.id) {
      next.push(nextTemplate);
      updated = true;
    } else {
      next.push(item);
    }
  });
  if (!updated) next.unshift(nextTemplate);
  cfg.steeringTemplates = normalizeTemplateList(next).slice(0, MAX_TEMPLATE_COUNT);
  cfg.steeringRecentDraft = payload.text;
  saveConfig(cfg, () => {
    setTemplateEditorState(null);
    renderTemplates(cfg);
    refreshSummary(cfg);
    setHint(updated ? '템플릿 수정됨' : '템플릿 저장됨');
  });
});
  $('send-template-now')?.addEventListener('click', async () => {
    const value = String(draft?.value || '').trim();
    if (!value) {
      setHint('전송할 문구를 먼저 입력해줘', true);
      return;
    }
    cfg.steeringRecentDraft = value;
    saveConfig(cfg, async () => {
      const ok = await sendSteeringToActiveTab(value);
      if (ok) refreshRuntimeDashboard(cfg, true);
    });
  });
  $('send-template-completed')?.addEventListener('click', async () => {
    const value = getDraftValue(cfg);
    if (!value) {
      setHint('전송할 문구를 먼저 입력해줘', true);
      return;
    }
    cfg.steeringRecentDraft = value;
    saveConfig(cfg, async () => {
      await refreshRuntimeDashboard(cfg, true);
      const targets = runtimeSnapshot.items.filter((item) => item.status === 'GREEN');
      const result = await sendSteeringToItems(targets, value, '완료 탭 전송');
      if (result.ok) refreshRuntimeDashboard(cfg, true);
    });
  });
  $('send-template-orange')?.addEventListener('click', async () => {
    const value = getDraftValue(cfg);
    if (!value) {
      setHint('전송할 문구를 먼저 입력해줘', true);
      return;
    }
    cfg.steeringRecentDraft = value;
    saveConfig(cfg, async () => {
      await refreshRuntimeDashboard(cfg, true);
      const targets = runtimeSnapshot.items.filter((item) => item.status === 'ORANGE');
      const result = await sendSteeringToItems(targets, value, '진행중 탭 전송');
      if (result.ok) refreshRuntimeDashboard(cfg, true);
    });
  });
  $('send-template-tracked')?.addEventListener('click', async () => {
    const value = getDraftValue(cfg);
    if (!value) {
      setHint('전송할 문구를 먼저 입력해줘', true);
      return;
    }
    cfg.steeringRecentDraft = value;
    saveConfig(cfg, async () => {
      await refreshRuntimeDashboard(cfg, true);
      const result = await sendSteeringToItems(runtimeSnapshot.items, value, '추적 탭 전송');
      if (result.ok) refreshRuntimeDashboard(cfg, true);
    });
  });
  $('refresh-dashboard')?.addEventListener('click', () => refreshRuntimeDashboard(cfg));
  $('focus-next-green')?.addEventListener('click', async () => {
    const ok = await focusNextGreenTab();
    if (ok) refreshRuntimeDashboard(cfg, true);
  });
  const filterButtons = {
    'dashboard-filter-all': 'ALL',
    'dashboard-filter-orange': 'ORANGE',
    'dashboard-filter-green': 'GREEN',
    'dashboard-filter-queued': 'QUEUED',
  };
  Object.entries(filterButtons).forEach(([id, value]) => {
    $(id)?.addEventListener('click', () => {
      dashboardView.filter = value;
      updateDashboardViewUi();
      renderDashboardData(runtimeSnapshot, cfg);
    });
  });
  let dashboardSearchTimer = null;
  $('dashboard-search')?.addEventListener('input', () => {
    const nextValue = String($('dashboard-search')?.value || '');
    if (dashboardSearchTimer) clearTimeout(dashboardSearchTimer);
    dashboardSearchTimer = setTimeout(() => {
      dashboardView.search = nextValue;
      renderDashboardData(runtimeSnapshot, cfg);
    }, DASHBOARD_SEARCH_DEBOUNCE_MS);
  });
  $('dashboard-sort')?.addEventListener('change', () => {
    dashboardView.sort = String($('dashboard-sort')?.value || 'status');
    renderDashboardData(runtimeSnapshot, cfg);
  });
  $('dashboard-send-visible')?.addEventListener('click', async () => {
    const value = getDraftValue(cfg);
    if (!value) {
      setHint('전송할 문구를 먼저 입력해줘', true);
      return;
    }
    await refreshRuntimeDashboard(cfg, true);
    const visible = getVisibleDashboardItems();
    const result = await sendSteeringToItems(visible, value, '표시 탭 전송');
    if (result.ok) refreshRuntimeDashboard(cfg, true);
  });
  $('dashboard-clear-visible')?.addEventListener('click', async () => {
    await refreshRuntimeDashboard(cfg, true);
    const targets = getVisibleDashboardItems().filter((item) => Math.max(0, Number(item.steeringQueueCount) || 0) > 0);
    if (!targets.length) {
      setHint('비울 대기열이 없음', true);
      return;
    }
    let okCount = 0;
    for (const item of targets) {
      const ok = await clearSteeringQueueForTab(item.tabId);
      if (ok) okCount += 1;
    }
    setHint(`표시 탭 대기열 비움: ${okCount}/${targets.length}`);
    refreshRuntimeDashboard(cfg, true);
  });
  $('dashboard-copy-visible-links')?.addEventListener('click', async () => {
    await refreshRuntimeDashboard(cfg, true);
    const visible = getVisibleDashboardItems();
    if (!visible.length) {
      setHint('복사할 표시 탭이 없음', true);
      return;
    }
    copyTextToClipboard(getVisibleDashboardLinksText(visible), '표시 탭 링크 복사됨');
  });
  $('dashboard-copy-smart-briefing')?.addEventListener('click', async () => {
    await refreshRuntimeDashboard(cfg, true);
    await copySmartDashboardBriefing(getVisibleDashboardItems(), { scopeLabel: '현재 표시 탭' });
  });
  $('dashboard-export-snapshot')?.addEventListener('click', async () => {
    await refreshRuntimeDashboard(cfg, true);
    const visible = getVisibleDashboardItems();
    downloadJson(`ready_ai_dashboard_snapshot_${Date.now()}.json`, {
      exportedAt: Date.now(),
      filter: dashboardView.filter,
      sort: dashboardView.sort,
      search: dashboardView.search,
      visibleSummary: getVisibleDashboardSummary(visible),
      items: visible,
    });
    setHint('대시보드 스냅샷 내보내기 완료');
  });
  $('apply-preset-default')?.addEventListener('click', () => {
    applyQuickPreset(cfg, 'default');
    saveConfig(cfg, () => {
      renderTemplates(cfg);
      refreshSummary(cfg);
      refreshRuntimeDashboard(cfg, true);
      setHint('기본 프리셋 적용');
    });
  });
  $('apply-preset-focus')?.addEventListener('click', () => {
    applyQuickPreset(cfg, 'focus');
    saveConfig(cfg, () => {
      renderTemplates(cfg);
      refreshSummary(cfg);
      refreshRuntimeDashboard(cfg, true);
      setHint('집중 프리셋 적용');
    });
  });
  $('apply-preset-loud')?.addEventListener('click', () => {
    applyQuickPreset(cfg, 'loud');
    saveConfig(cfg, () => {
      renderTemplates(cfg);
      refreshSummary(cfg);
      refreshRuntimeDashboard(cfg, true);
      setHint('강한 알림 프리셋 적용');
    });
  });
  const quietToggle = $('quiet-hours-toggle');
  const quietStart = $('quiet-hours-start');
  const quietEnd = $('quiet-hours-end');
  if (quietToggle) {
    quietToggle.checked = !!cfg.quietHoursEnabled;
    quietToggle.addEventListener('change', () => {
      cfg.quietHoursEnabled = !!quietToggle.checked;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        refreshRuntimeDashboard(cfg, true);
        setHint('저장됨');
      });
    });
  }
  const quickQuietToggle = $('quick-quiet-toggle');
  if (quickQuietToggle) {
    quickQuietToggle.checked = !!cfg.quietHoursEnabled;
    quickQuietToggle.addEventListener('change', () => {
      cfg.quietHoursEnabled = !!quickQuietToggle.checked;
      if (quietToggle) quietToggle.checked = cfg.quietHoursEnabled;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        refreshRuntimeDashboard(cfg, true);
        setHint('저장됨');
      });
    });
  }
  if (quietStart) {
    quietStart.value = normalizeClockTime(cfg.quietHoursStart, '23:00');
    quietStart.addEventListener('change', () => {
      cfg.quietHoursStart = normalizeClockTime(quietStart.value, '23:00');
      quietStart.value = cfg.quietHoursStart;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        refreshRuntimeDashboard(cfg, true);
        setHint('저장됨');
      });
    });
  }
  if (quietEnd) {
    quietEnd.value = normalizeClockTime(cfg.quietHoursEnd, '08:00');
    quietEnd.addEventListener('change', () => {
      cfg.quietHoursEnd = normalizeClockTime(quietEnd.value, '08:00');
      quietEnd.value = cfg.quietHoursEnd;
      saveConfig(cfg, () => {
        refreshSummary(cfg);
        refreshRuntimeDashboard(cfg, true);
        setHint('저장됨');
      });
    });
  }
  $('force-check-active')?.addEventListener('click', async () => {
    const tabs = await pQueryTabs({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
      setHint('현재 활성 탭을 찾지 못함', true);
      return;
    }
    const res = await pSendTabMessage(tab.id, { action: 'force_check', reason: 'popup_active' });
    setHint(res?.ok ? '현재 탭 강제 확인 요청 전송' : '현재 탭 강제 확인 실패', !res?.ok);
  });
  $('snooze-15m')?.addEventListener('click', () => setSnoozeUntil(Date.now() + 15 * 60 * 1000, cfg));
  $('snooze-1h')?.addEventListener('click', () => setSnoozeUntil(Date.now() + 60 * 60 * 1000, cfg));
  $('snooze-clear')?.addEventListener('click', () => setSnoozeUntil(0, cfg));
  $('export-settings')?.addEventListener('click', () => exportSettings());
  $('import-settings')?.addEventListener('click', () => importSettingsFile(cfg));
  $('export-history')?.addEventListener('click', () => {
    downloadJson(`ready_ai_history_${Date.now()}.json`, runtimeSnapshot.history || []);
    setHint('완료 이력 내보내기 완료');
  });
  $('clear-history')?.addEventListener('click', () => {
    chrome.storage.local.set({ completionHistory: [] }, () => {
      runtimeSnapshot.history = [];
      lastHistorySignature = '';
      renderHistory([]);
      refreshSummary(cfg);
      setHint('완료 이력 비움');
    });
  });
  $('active-tab-title-save')?.addEventListener('click', async () => {
    const activeTab = await getActiveBrowserTab();
    if (!activeTab?.id) {
      setHint('현재 탭을 찾지 못함', true);
      return;
    }
    const ok = await setCustomTitleForTabId(activeTab.id, $('active-tab-title-input')?.value || '');
    if (ok) {
      await refreshRuntimeDashboard(cfg, true, { force: true });
      renderTitleManager(cfg);
    }
  });
  $('active-tab-title-clear')?.addEventListener('click', async () => {
    const activeTab = await getActiveBrowserTab();
    if (!activeTab?.id) {
      setHint('현재 탭을 찾지 못함', true);
      return;
    }
    const ok = await clearCustomTitleForTabId(activeTab.id);
    if (ok) {
      await refreshRuntimeDashboard(cfg, true, { force: true });
      renderTitleManager(cfg);
    }
  });
  $('active-tab-title-refresh')?.addEventListener('click', async () => {
    await refreshRuntimeDashboard(cfg, true, { force: true });
    renderTitleManager(cfg);
    setHint('현재 탭 이름 정보 새로 불러옴');
  });
  document.querySelectorAll('[data-active-title-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $('active-tab-title-input');
      if (input) input.value = normalizeCustomTabTitleValue(btn.getAttribute('data-active-title-preset') || '');
    });
  });
  $('bulk-title-apply-visible')?.addEventListener('click', async () => {
    await refreshRuntimeDashboard(cfg, true, { force: true });
    const base = $('bulk-title-base')?.value || '';
    const numberingEnabled = !!$('bulk-title-numbering')?.checked;
    const startNumber = clampInt($('bulk-title-start')?.value, 1, 1, 9999);
    const result = await applyBulkTitleToItems(getVisibleDashboardItems(), base, { numberingEnabled, startNumber });
    if (result.ok) {
      setHint(`표시 탭 이름 적용: ${result.count}/${result.total}`);
      await refreshRuntimeDashboard(cfg, true, { force: true });
      if ($('title-manager-sheet')?.classList.contains('active')) renderTitleManager(cfg);
    }
  });
  $('bulk-title-apply-orange')?.addEventListener('click', async () => {
    await refreshRuntimeDashboard(cfg, true, { force: true });
    const base = $('bulk-title-base')?.value || '';
    const numberingEnabled = !!$('bulk-title-numbering')?.checked;
    const startNumber = clampInt($('bulk-title-start')?.value, 1, 1, 9999);
    const targets = runtimeSnapshot.items.filter((item) => item.status === 'ORANGE');
    const result = await applyBulkTitleToItems(targets, base, { numberingEnabled, startNumber });
    if (result.ok) {
      setHint(`진행중 탭 이름 적용: ${result.count}/${result.total}`);
      await refreshRuntimeDashboard(cfg, true, { force: true });
      if ($('title-manager-sheet')?.classList.contains('active')) renderTitleManager(cfg);
    }
  });
  $('bulk-title-apply-green')?.addEventListener('click', async () => {
    await refreshRuntimeDashboard(cfg, true, { force: true });
    const base = $('bulk-title-base')?.value || '';
    const numberingEnabled = !!$('bulk-title-numbering')?.checked;
    const startNumber = clampInt($('bulk-title-start')?.value, 1, 1, 9999);
    const targets = runtimeSnapshot.items.filter((item) => item.status === 'GREEN');
    const result = await applyBulkTitleToItems(targets, base, { numberingEnabled, startNumber });
    if (result.ok) {
      setHint(`완료 탭 이름 적용: ${result.count}/${result.total}`);
      await refreshRuntimeDashboard(cfg, true, { force: true });
      if ($('title-manager-sheet')?.classList.contains('active')) renderTitleManager(cfg);
    }
  });
  $('bulk-title-clear-visible')?.addEventListener('click', async () => {
    await refreshRuntimeDashboard(cfg, true, { force: true });
    const result = await clearBulkTitleForItems(getVisibleDashboardItems().filter((item) => item.hasCustomTabTitle));
    if (result.ok) {
      setHint(`표시 탭 이름 해제: ${result.count}/${result.total}`);
      await refreshRuntimeDashboard(cfg, true, { force: true });
      if ($('title-manager-sheet')?.classList.contains('active')) renderTitleManager(cfg);
    }
  });
}
function getDashboardPollMs() {
  if (document.hidden) return 12000;
  if (runtimeSnapshot.items.some((item) => item.status === 'ORANGE')) return 2200;
  if (runtimeSnapshot.items.length) return 4500;
  return 9000;
}
function stopDashboardPolling() {
  if (dashboardTimer) {
    clearTimeout(dashboardTimer);
    dashboardTimer = null;
  }
}
function startDashboardPolling(cfg) {
  stopDashboardPolling();
  if (cfg?.dashboardAutoRefreshEnabled === false) return;
  const scheduleNext = async () => {
    dashboardTimer = setTimeout(async () => {
      dashboardTimer = null;
      if (!document.hidden) {
        await refreshRuntimeDashboard(cfg, true, { fromAutoPoll: true });
      }
      startDashboardPolling(cfg);
    }, getDashboardPollMs());
  };
  scheduleNext();
}
document.addEventListener('DOMContentLoaded', () => {
  renderDetectionOptions();
  wireSheetNavigation();
  void loadVerificationCenter();
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  loadConfig((cfg) => {
    currentPopupConfig = cfg;
    setHint('');
    renderBuiltinSites(cfg);
    renderCustomSites(cfg);
    renderTemplates(cfg);
    wireActions(cfg);
    refreshSummary(cfg);
    ensureActiveTabContent('popup_open').then(() => {
      refreshRuntimeDashboard(cfg, true, { force: true });
    }).catch(() => {});
    refreshRuntimeDashboard(cfg, true, { force: true }).then(() => renderTitleManager(cfg)).catch(() => {});
    startDashboardPolling(cfg);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopDashboardPolling();
        return;
      }
      refreshRuntimeDashboard(cfg, true, { force: true });
      startDashboardPolling(cfg);
    });
  });
});
window.addEventListener('beforeunload', () => {
  stopDashboardPolling();
  flushPendingConfigSave();
});
