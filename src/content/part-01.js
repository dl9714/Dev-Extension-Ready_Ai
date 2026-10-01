// NOTE:
// - content script는 <all_urls>에 주입된다.
// - 하지만 실제 감시는 "등록/활성"된 사이트에서만 실행한다.
// Capture the old isolated-world state before any globals are reset by reinjection.
try {
  if (globalThis.__ReadyAiCaptureSession) globalThis.__ReadyAiRecoveredSession = globalThis.__ReadyAiCaptureSession();
  else if (typeof steeringQueue !== 'undefined' && Array.isArray(steeringQueue)) {
    globalThis.__ReadyAiRecoveredSession = {
      queue: steeringQueue, queueSeq: steeringQueueSeq, draft: steeringRefs?.input?.value ?? steeringDraftText,
      attachments: steeringAttachments, attachmentSeq: steeringAttachmentSeq, panelOpen: steeringPanelOpen,
      siteKey: steeringSessionSiteKey, paused: !!steeringProcessing, awaiting: steeringAwaitingTurnCompletion,
      observed: steeringObservedGenerationSinceSend, baseline: steeringChatGptAssistantBaseline,
      observedAt: steeringChatGptAssistantObservedAt, finalizedAt: steeringChatGptAssistantFinalizedAt,
      generating: isGenerating, startedAt: chatGptLightGenerationStartedAt, watchUntil: chatGptLightGenerationWatchUntil,
      editingId: steeringQueueEditingId, editingText: steeringQueueEditingText,
    };
    if (typeof stopMonitoring === 'function') stopMonitoring();
  } else globalThis.__ReadyAiRecoveredSession = null;
} catch (_) {}
try {
  for (const cleanup of globalThis.__ReadyAiEventCleanups || []) cleanup();
  globalThis.__ReadyAiEventCleanups = [];
  if (globalThis.__ReadyAiStorageListener) chrome.storage.onChanged.removeListener(globalThis.__ReadyAiStorageListener);
} catch (_) {}
function addReadyAiEventListener(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  (globalThis.__ReadyAiEventCleanups || (globalThis.__ReadyAiEventCleanups = [])).push(() => target.removeEventListener(type, handler, options));
}
var activeSite = null; // { key, name, detection }
var monitoring = false;
var isGenerating = false;
var checkInterval = null;
var completionStatus = 'idle'; // 'idle' | 'completed'
// 최초 1회는 무조건 background로 상태를 보내서
// "아무 질문 없음" 상태(연두색 뱃지)도 탭에 즉시 반영되게 한다.
var hasSentInitialState = false;
// iframe(특히 AI Studio) 대응
// - UI가 cross-origin iframe 안에 들어가면 top frame은 "생성중" 요소를 못 본다.
// - ChatGPT는 top frame만 감시한다. iframe/all_frames 감시는 Chrome 다중 탭 성능을 망가뜨릴 수 있다.
// - AI Studio 같은 예외 사이트만 background에서 명시적으로 allFrames 재주입할 수 있다.
var IS_TOP_FRAME = (() => {
  try { return window.top === window; } catch (_) { return true; }
})();
// 탭 타이틀 뱃지(이모지)
var TITLE_BADGE = {
  WHITE: '🟢',  // 대기/읽음/아무 질문 없음
  ORANGE: '🟠', // 생성중
  GREEN: '⚪',  // 완료(아직 클릭/스크롤로 확인 전)
};
var TITLE_BADGE_PREFIX_RE = /^(?:[⚪🔵🟠🟢](?:\[?\d+\+?\]?|\s*(?:\d+\+?)?)?\s*)+/;
function getTitleBadgeStateKey() {
  if (isGenerating) return 'ORANGE';
  if (completionStatus === 'completed') return 'GREEN';
  return 'WHITE';
}
function getTitleBadgeCountGlyph() {
  if (!titleBadgeCountEnabled) return '';
  if (!steeringQueue.length) return '';
  // Gemini/AI Studio는 페이지 자체가 document.title을 적극적으로 다시 쓴다.
  // 대기 수가 바뀔 때마다 제목 접두사를 다시 쓰면 양쪽 MutationObserver가
  // 맞물려 렌더러가 과부하될 수 있으므로 상태 이모지는 유지하고 숫자만 뺀다.
  const siteKey = getSiteKey();
  if (siteKey === 'gemini' || siteKey === 'aistudio') return '';
  return `${getSteeringQueueCountText()}`;
}
// background(frame 합산) 쪽에서 stale frame을 안 남기기 위해
// content는 주기적으로(기본 30s) 상태를 heartbeat로 보내준다.
var HEARTBEAT_MS = 30000;
var _lastHeartbeatAt = 0;
// ===== 백그라운드 탭에서도 완료 감지(특히 Gemini) =====
// - Gemini는 DOM 변경이 childList가 아니라 attributes/style로만 일어나는 경우가 있어
//   MutationObserver(childList)만으로는 "중지 버튼 사라짐"을 못 잡고 🟠가 유지될 수 있음.
// - 따라서 attributes 감시 + 주기 폴링(setInterval)을 같이 사용한다.
var CHECK_INTERVAL_ACTIVE_MS = 650;
var CHECK_INTERVAL_VISIBLE_IDLE_MS = 5000;
var CHECK_INTERVAL_HIDDEN_ACTIVE_MS = 1800;
var CHECK_INTERVAL_HIDDEN_IDLE_MS = 60000;
var POLLING_RESUME_GRACE_MS = 10000;
var MIN_CHECK_GAP_ACTIVE_MS = 400;
var MIN_CHECK_GAP_IDLE_MS = 1500;
var MIN_CHECK_GAP_HIDDEN_ACTIVE_MS = 1200;
var MIN_CHECK_GAP_HIDDEN_IDLE_MS = 3000;
var _checkScheduled = false;
var _checkTimer = null;
var _lastCheckAt = 0;
var _currentPollingMs = 0;
var _lastPollingTickAt = Date.now();
var _statusQueryCache = null;
var aiStudioRunRequestedAt = 0;
var aiStudioGenerationProbeTimers = [];
function isChatGptSafeMode() {
  try {
    const siteKey = getSiteKey?.();
    if (siteKey === 'chatgpt') return true;
  } catch (_) {}
  try {
    const host = String(location.hostname || '').toLowerCase();
    return host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com';
  } catch (_) {
    return false;
  }
}
// Gemini/AI Studio는 새 대화가 시작될 때 페이지 제목을 여러 번 갱신한다.
// 확장이 접두사를 계속 되쓰면 Google의 제목 동기화와 맞물려 렌더러가
// 폭주할 수 있으므로, 두 사이트에서는 상태를 패널에만 표시한다.
function isGoogleAiTitleSafeMode() {
  try {
    const siteKey = getSiteKey?.();
    if (siteKey === 'gemini' || siteKey === 'aistudio') return true;
  } catch (_) {}
  try {
    const host = String(location.hostname || '').toLowerCase();
    return host === 'gemini.google.com' || host === 'aistudio.google.com';
  } catch (_) {
    return false;
  }
}
function isFastStatusCheckWindow() {
  return !!(
    isGenerating
    || (typeof steeringAwaitingResponseStart !== 'undefined' && steeringAwaitingResponseStart)
    || (typeof steeringAwaitingTurnCompletion !== 'undefined' && steeringAwaitingTurnCompletion)
    || (typeof steeringProcessing !== 'undefined' && steeringProcessing)
  );
}
function getMinStatusCheckGapMs() {
  const active = isFastStatusCheckWindow();
  if (document.hidden) return active ? MIN_CHECK_GAP_HIDDEN_ACTIVE_MS : MIN_CHECK_GAP_HIDDEN_IDLE_MS;
  if (active && getSiteKey() === 'chatgpt') return 900;
  return active ? MIN_CHECK_GAP_ACTIVE_MS : MIN_CHECK_GAP_IDLE_MS;
}
function scheduleCheck(force = false) {
  if (!monitoring) return;
  if (typeof isReadyAiDuplicateContentInstance === 'function' && isReadyAiDuplicateContentInstance()) return;
  if (_checkScheduled) {
    if (!force) return;
    try { clearTimeout(_checkTimer); } catch (_) {}
    _checkScheduled = false;
    _checkTimer = null;
  }
  _checkScheduled = true;
  const now = Date.now();
  const delay = force ? 0 : Math.max(0, getMinStatusCheckGapMs() - (now - _lastCheckAt));
  _checkTimer = setTimeout(() => {
    _checkScheduled = false;
    _checkTimer = null;
    _lastCheckAt = Date.now();
    try {
      checkStatus();
    } catch (e) {
      // content script가 죽어버리면 이후 상태 갱신이 모두 멈추므로 예외는 삼킴
      // (필요하면 아래 라인 주석 해제)
      // console.debug('[Ready_Ai] checkStatus failed', e);
    }
  }, delay);
}
function getDesiredPollingMs() {
  if (!monitoring) return 0;
  const active = isFastStatusCheckWindow();
  if (document.hidden) return active ? CHECK_INTERVAL_HIDDEN_ACTIVE_MS : CHECK_INTERVAL_HIDDEN_IDLE_MS;
  if (active) return CHECK_INTERVAL_ACTIVE_MS;
  return CHECK_INTERVAL_VISIBLE_IDLE_MS;
}
function isReadyAiPollingResumeGap(previousAt, now, expectedMs) {
  const previous = Number(previousAt) || 0;
  const current = Number(now) || 0;
  const expected = Math.max(250, Number(expectedMs) || 0);
  if (!previous || current <= previous) return false;
  return current - previous >= expected + POLLING_RESUME_GRACE_MS;
}
function noteReadyAiPollingTick(now = Date.now()) {
  const previousAt = _lastPollingTickAt;
  _lastPollingTickAt = Number(now) || Date.now();
  if (!isReadyAiPollingResumeGap(previousAt, _lastPollingTickAt, _currentPollingMs)) return false;
  try {
    if (typeof handleReadyAiSystemResume === 'function') handleReadyAiSystemResume('content_timer_gap');
  } catch (_) {}
  return true;
}
function ensurePolling(force = false) {
  if (!monitoring) return;
  if (typeof isReadyAiDuplicateContentInstance === 'function' && isReadyAiDuplicateContentInstance()) return;
  const desiredMs = getDesiredPollingMs();
  if (!force && checkInterval && _currentPollingMs === desiredMs) return;
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  _currentPollingMs = 0;
  _currentPollingMs = desiredMs;
  _lastPollingTickAt = Date.now();
  checkInterval = window.setInterval(() => {
    noteReadyAiPollingTick();
    scheduleCheck();
  }, desiredMs);
}
// 단순 셀렉터 제거 -> 아래 checkStatus 함수 내에서 로직으로 처리
// 요소가 실제로 화면에 보이는지 확인하는 헬퍼 함수
// ==========================
// DOM 탐색/감시 유틸
// ==========================
// Gemini는 완료 후에도 Stop 버튼이 DOM에 남아있되
// opacity/visibility/disabled만 바뀌는 경우가 있어서
// 단순 offsetWidth/offsetHeight만으로는 "보임" 판정이 틀릴 수 있다.
function isVisible(elem) {
  if (!elem) return false;
  // hidden 속성
  if (elem.hasAttribute && elem.hasAttribute('hidden')) return false;
  let hasBox = false;
  try {
    hasBox = !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
  } catch (_) {
    hasBox = false;
  }
  if (!hasBox) return false;
  // computed style 기반
  let style;
  try {
    style = window.getComputedStyle(elem);
  } catch (_) {
    // getComputedStyle이 실패하면 최소한의 DOM 기반 판정만 수행
    return hasBox;
  }
  if (!style) return false;
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  if (parseFloat(style.opacity || '1') === 0) return false;
  let readyAiRect = null;
  try { readyAiRect = elem.getBoundingClientRect ? elem.getBoundingClientRect() : null; } catch (_) {}
  if (readyAiRect && (readyAiRect.width <= 0 || readyAiRect.height <= 0)) return false;
  // 마지막 안전장치
  return hasBox;
}
function isEnabledButtonLike(elem) {
  if (!elem) return false;
  // disabled / aria-disabled / role=button/버튼류 공통 케이스
  if (elem.disabled === true) return false;
  const ariaDisabled = elem.getAttribute ? elem.getAttribute('aria-disabled') : null;
  if (ariaDisabled && ariaDisabled.toLowerCase() === 'true') return false;
  return true;
}
// ===== Shadow DOM(오픈) 대응 =====
// - Gemini UI는 open shadowRoot 아래에 주요 버튼이 들어가는 경우가 있어
//   document.querySelectorAll만으로는 Stop 버튼 변화를 놓칠 수 있다.
// - 따라서 "알려진 root들(document + open shadow roots)" 에 대해
//   (1) deep query
//   (2) deep mutation observe
// 를 함께 사용한다.
var _deepRoots = new Set(); // Document | ShadowRoot
var _deepObservers = new Map(); // root -> MutationObserver
var _lastShadowRescanAt = 0;
var SHADOW_RESCAN_MS = 4000;
var SHADOW_RESCAN_HIDDEN_IDLE_MS = 12000;
var _deepEnabled = false;
function addDeepRoot(root) {
  if (!root) return;
  if (_deepRoots.has(root)) return;
  _deepRoots.add(root);
  attachObserver(root);
  // 방금 추가된 shadowRoot 내부에도 또 다른 shadowRoot가 있을 수 있으므로
  // 1회 스캔해서 깊은 구조를 초기에 잡아둔다.
  try {
    scanTreeForShadowRoots(root);
  } catch (_) {}
}
function shutdownDeepRoots() {
  // stopMonitoring()에서 호출해서, 사이트 이동/비활성 시 리소스 정리
  try {
    for (const obs of _deepObservers.values()) {
      try { obs.disconnect(); } catch (_) {}
    }
  } catch (_) {}
  _deepObservers.clear();
  _deepRoots.clear();
  _lastShadowRescanAt = 0;
}
function setDeepEnabled(on) {
  const next = !!on;
  if (next === _deepEnabled) return;
  _deepEnabled = next;
  if (_deepEnabled) {
    try { initDeepRoots(); } catch (_) {}
  } else {
    try { shutdownDeepRoots(); } catch (_) {}
  }
}
function attachObserver(root) {
  if (!root) return;
  if (_deepObservers.has(root)) return;
  const obs = new MutationObserver(() => {
    // 새 shadowRoot 탐색은 상태 폴링의 제한된 재스캔에서 수행한다.
    // 응답 스트리밍마다 추가된 전체 서브트리를 순회하지 않는다.
    scheduleCheck();
  });
  // Document/ShadowRoot 모두 observe 가능
  try {
    const target = root === document ? document.body : root;
    if (!target) return;
    const observeOptions = {
      childList: true,
      subtree: true,
      attributes: true,
      // document 전체에서는 자주 바뀌는 style/class를 제외하고,
      // 실제 shadowRoot 내부에서만 세부 속성을 감시한다.
      attributeFilter: root === document
        ? ['aria-label', 'hidden', 'disabled', 'aria-disabled']
        : ['aria-label', 'style', 'class', 'hidden', 'disabled', 'aria-disabled'],
    };
    obs.observe(target, observeOptions);
    _deepObservers.set(root, obs);
  } catch (_) {
    // observe 실패 시(특정 root가 더 이상 유효하지 않은 경우 등) 무시
  }
}
function scanTreeForShadowRoots(rootNode) {
  if (!rootNode) return;
  // Document를 넘겨도 안전하게 처리
  let start = rootNode;
  if (start === document) start = document.documentElement;
  if (!start) return;
  const stack = [];
  // (1) Element 자신도 검사 대상
  if (start.nodeType === Node.ELEMENT_NODE) stack.push(start);
  // (2) ShadowRoot/DocumentFragment 같은 경우에는 하위 element부터 탐색
  //     (shadowRoot는 children을 제공하는 경우가 많지만, 안전하게 childNodes도 처리)
  const seedChildren = start.children || start.childNodes;
  if (seedChildren && seedChildren.length) {
    for (let i = 0; i < seedChildren.length; i++) {
      const n = seedChildren[i];
      if (n && n.nodeType === Node.ELEMENT_NODE) stack.push(n);
    }
  }
  while (stack.length) {
    const el = stack.pop();
    if (!el || el.nodeType !== Node.ELEMENT_NODE) continue;
    if (el.shadowRoot) addDeepRoot(el.shadowRoot);
    const kids = el.children;
    if (kids && kids.length) {
      for (let i = 0; i < kids.length; i++) stack.push(kids[i]);
    }
  }
}
function maybeRescanShadowRoots() {
  if (!_deepEnabled) return;
  const now = Date.now();
  const minGap = (document.hidden && !isGenerating) ? SHADOW_RESCAN_HIDDEN_IDLE_MS : SHADOW_RESCAN_MS;
  if (now - _lastShadowRescanAt < minGap) return;
  _lastShadowRescanAt = now;
  for (const root of Array.from(_deepRoots)) {
    if (root === document) continue;
    const host = root?.host;
    if (host?.isConnected) continue;
    try { _deepObservers.get(root)?.disconnect?.(); } catch (_) {}
    _deepObservers.delete(root);
    _deepRoots.delete(root);
  }
  try {
    scanTreeForShadowRoots(document.documentElement);
  } catch (_) {}
}
function initDeepRoots() {
  addDeepRoot(document);
  // 최초 1회: 문서 전체에서 open shadowRoot 수집
  try {
    scanTreeForShadowRoots(document.documentElement);
  } catch (_) {}
}
function deepQuerySelectorAll(selector) {
  const out = [];
  for (const root of _deepRoots) {
    try {
      out.push(...Array.from(root.querySelectorAll(selector)));
    } catch (_) {}
  }
  return out;
}
// monitoring 종료/재시작 시 observer 누수 방지
function resetDeepRoots() {
  try {
    for (const obs of _deepObservers.values()) {
      try { obs.disconnect(); } catch (_) {}
    }
  } catch (_) {}
  _deepObservers.clear();
  _deepRoots.clear();
  _lastShadowRescanAt = 0;
}
// selector를 document + (open) shadow roots까지 포함해서 찾는다.
// (monitoring 시작 시 initDeepRoots()가 호출되어야 의미가 있다)
function qsa(selector) {
  if (_statusQueryCache?.has(selector)) return _statusQueryCache.get(selector);
  let result = [];
  // deep roots에는 document 자체도 포함된다. 결과가 0개여도 document를
  // 다시 한 번 질의하지 않아 유휴 상태의 중복 selector 탐색을 막는다.
  if (_deepEnabled && _deepRoots.size) {
    try { result = deepQuerySelectorAll(selector); } catch (_) { result = []; }
  } else {
    try {
      result = Array.from(document.querySelectorAll(selector));
    } catch (_) {
      result = [];
    }
  }
  if (_statusQueryCache) _statusQueryCache.set(selector, result);
  return result;
}
function beginStatusQueryCache() {
  _statusQueryCache = new Map();
}
function endStatusQueryCache() {
  _statusQueryCache = null;
}
function normalizeIconName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}
function getSiteKey() {
  return activeSite?.key || null;
}
// 탭 제목(Title)에 배지(이모지) 달기 - 아이콘 바로 옆에 표시됨
function getCleanDocumentTitleText(rawTitle = document.title) {
  return String(rawTitle || '').replace(TITLE_BADGE_PREFIX_RE, '').trimStart();
}
function normalizeCustomTabTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, CUSTOM_TAB_TITLE_MAX_LENGTH);
}
function hasCustomTabTitle() {
  return !!normalizeCustomTabTitle(customTabTitle);
}
function getDesiredBaseTitle(currentCleanTitle = '') {
  if (hasCustomTabTitle()) return normalizeCustomTabTitle(customTabTitle);
  const native = normalizeCustomTabTitle(nativePageTitle);
  const clean = normalizeCustomTabTitle(currentCleanTitle);
  return native || clean || activeSite?.name || 'AI';
}
function computeDesiredDocumentTitle(currentRawTitle = document.title) {
  const cleanTitle = getCleanDocumentTitleText(currentRawTitle);
  if (!titleSyncMuted && !hasCustomTabTitle()) {
    const normalizedClean = normalizeCustomTabTitle(cleanTitle);
    const rememberedCustom = normalizeCustomTabTitle(lastCustomTabTitle);
    if (!normalizedClean || normalizedClean !== rememberedCustom) {
      nativePageTitle = cleanTitle || nativePageTitle || activeSite?.name || 'AI';
      if (normalizedClean && normalizedClean !== rememberedCustom) lastCustomTabTitle = '';
    }
  }
  const baseTitle = getDesiredBaseTitle(cleanTitle);
  if (!titleBadgeEnabled) return baseTitle;
  const badge = TITLE_BADGE[getTitleBadgeStateKey()] || TITLE_BADGE.WHITE;
  const countGlyph = getTitleBadgeCountGlyph();
  const prefix = `${badge}${countGlyph}`.trim();
  return prefix ? `${prefix} ${baseTitle}`.trim() : baseTitle;
}
