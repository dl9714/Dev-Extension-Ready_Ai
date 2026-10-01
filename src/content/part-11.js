function mountSteeringUi() {
  if (isReadyAiDuplicateContentInstance()) return;
  try { (document.body || document.documentElement).appendChild(steeringHost); } catch (_) {}
  startSteeringOverlayWatch();
  restoreSteeringDraftToInput();
  applySteeringTheme();
  positionSteeringUi(true);
  renderSteeringQueue();
  renderSteeringTemplates();
  renderSteeringAttachments();
  syncSteeringAttachmentPreview();
}
function ensureSteeringUi() {
  if (!claimReadyAiContentOwnership('ensure_ui')) return null;
  if (isReadyAiDuplicateContentInstance()) return null;
  if (steeringHost && steeringRoot && steeringRefs) {
    return reuseExistingSteeringUi();
  }
  if (createSteeringUiHost() === false) return null;
  buildSteeringRefs();
  bindSteeringUiEvents();
  mountSteeringUi();
  return steeringRefs;
}
function acknowledgeCompletion() {
  if (!monitoring) return;
  if (isGenerating) return;
  if (completionStatus !== 'completed') return;
  completionStatus = 'idle';
  updateTitleBadge();
  updateSteeringUi();
  chrome.runtime.sendMessage({
    action: 'user_activity',
    platform: getSiteKey(),
    siteName: activeSite?.name,
  });
}
function applySteeringUiNow() {
  if (isReadyAiDuplicateContentInstance()) {
    hideSteeringUi();
    return;
  }
  if (!monitoring || !steeringEnabled) {
    hideSteeringUi();
    return;
  }
  const refs = ensureSteeringUi();
  if (!refs) return;
  setSteeringDisabledIfChanged(refs.input, steeringStateRestoring || steeringSessionStorageFailed);
  if (refs.queueWrap) refs.queueWrap.inert = steeringStateRestoring || steeringSessionStorageFailed;
  if (refs.attachmentWrap) refs.attachmentWrap.inert = steeringStateRestoring || steeringSessionStorageFailed;
  startSteeringOverlayWatch();
  const queueCountLabel = getSteeringQueueCountLabel();
  setSteeringTextIfChanged(refs.title, getSteeringStateLabel());
  setSteeringTextIfChanged(refs.meta, queueCountLabel);
  if (refs.tabTitleBadge) {
    setSteeringTextIfChanged(refs.tabTitleBadge, getCurrentTitleBadgeGlyph());
    setSteeringDatasetIfChanged(refs.tabTitleBadge, 'state', getCurrentTitleBadgeState());
  }
  if (refs.launcherCount) {
    setSteeringTextIfChanged(refs.launcherCount, queueCountLabel);
    setSteeringDisplayIfChanged(refs.launcherCount, steeringQueueCountVisible ? 'inline-flex' : 'none');
  }
  setSteeringTextIfChanged(refs.launcherTitle, getSteeringLauncherText());
  setSteeringTextIfChanged(refs.launcherSub, getSteeringLauncherSubText());
  if (refs.tabTitleMeta) refs.tabTitleMeta.textContent = hasCustomTabTitle() ? `크롬 탭 이름변경: ${normalizeCustomTabTitle(customTabTitle)} · 원래 제목: ${normalizeCustomTabTitle(nativePageTitle || activeSite?.name || 'AI')}` : `크롬 탭 이름 자동 · 원래 제목: ${normalizeCustomTabTitle(nativePageTitle || activeSite?.name || 'AI')}`;
  const titleInputActive = steeringRoot?.activeElement === refs.tabTitleInput;
  if (refs.tabTitleInput && (!titleInputActive || !String(refs.tabTitleInput.value || '').trim())) {
    setSteeringValueIfChanged(refs.tabTitleInput, normalizeCustomTabTitle(customTabTitle));
  }
  restoreSteeringDraftToInput();
  setSteeringDisabledIfChanged(refs.tabTitleSave, !IS_TOP_FRAME);
  setSteeringDisabledIfChanged(refs.tabTitleClear, !IS_TOP_FRAME || !hasCustomTabTitle());
  setSteeringDatasetIfChanged(refs.card, 'advanced', steeringAdvancedEnabled ? 'true' : 'false');
  setSteeringClassToggleIfChanged(refs.advancedCard, 'enabled', steeringAdvancedEnabled);
  setSteeringCheckedIfChanged(refs.advancedToggle, steeringAdvancedEnabled);
  setSteeringDisplayIfChanged(refs.advancedBody, steeringAdvancedEnabled ? 'flex' : 'none');
  const newChatCountActive = steeringRoot?.activeElement === refs.newChatCount;
  if (refs.newChatCount && !newChatCountActive && refs.newChatCount.value !== String(steeringNewChatTabCount)) {
    refs.newChatCount.value = String(steeringNewChatTabCount);
  }
  setSteeringTextIfChanged(refs.primary, steeringAdvancedEnabled ? getSteeringPrimaryLabel() : '후속 대기');
  setSteeringDisabledIfChanged(refs.primary, steeringStateRestoring);
  const hasDraftText = !!String(refs.input?.value || '').trim();
  const hasDraftImages = getSteeringDraftAttachmentCount() > 0;
  setSteeringDisabledIfChanged(refs.newChatSend, steeringNewChatSendPending || !steeringAdvancedEnabled || !hasDraftText || hasDraftImages);
  setSteeringDisabledIfChanged(refs.sendNow, !hasDraftText && !hasDraftImages || steeringProcessing || steeringStateRestoring);
  setSteeringDisabledIfChanged(refs.clear, !steeringQueue.length && !hasDraftText && !hasDraftImages);
  const canRunNext = canUserRunSteeringQueueNow();
  if (refs.runNext) {
    setSteeringTextIfChanged(refs.runNext, getSteeringResumeLabel());
    setSteeringDisabledIfChanged(refs.runNext, !canRunNext);
    setSteeringClassToggleIfChanged(refs.runNext, 'resume', canRunNext);
    const runNextTitle = getSteeringResumeButtonTitle();
    if (refs.runNext.title !== runNextTitle) refs.runNext.title = runNextTitle;
    refs.runNext.setAttribute('aria-disabled', canRunNext ? 'false' : 'true');
  }
  setSteeringDisabledIfChanged(refs.clearQueue, !steeringQueue.length);
  setSteeringDisplayIfChanged(refs.launcherRow, steeringLauncherVisible ? 'inline-flex' : 'none');
  setSteeringDisplayIfChanged(refs.launcher, steeringLauncherVisible ? 'inline-flex' : 'none');
  setSteeringDisplayIfChanged(refs.card, steeringPanelOpen ? 'block' : 'none');
  applySteeringTheme();
  positionSteeringUi();
  renderSteeringQueue();
  renderSteeringTemplates();
  renderSteeringAttachments();
  syncSteeringAttachmentPreview();
  syncSteeringQueueCount();
  syncTitleBadgeFromUiRender(false);
  setSteeringDisplayIfChanged(steeringHost, (steeringPanelOpen || steeringLauncherVisible) ? 'block' : 'none');
  fitOpenSteeringUiInsideViewport();
  applySteeringOverlayYield();
}
function updateSteeringUi() {
  syncSteeringConversationScope();
  scheduleSteeringSessionSave();
  if (steeringUiRafId) return;
  const schedule = window.requestAnimationFrame || ((cb) => window.setTimeout(cb, 16));
  steeringUiRafId = schedule(() => {
    steeringUiRafId = 0;
    applySteeringUiNow();
  });
}
// =========================
// Generating detection rules
// =========================
// Generating detection rules
// =========================
var CHATGPT_IMAGE_GENERATING_RE = /(\b(?:creating|generating|making|rendering|drawing|editing|updating|processing)\s+(?:(?:an?|the)\s+)?images?\b|\b(?:applying|processing)\s+(?:the\s+)?(?:image\s+)?(?:edit|change)s?\b|\bimages?\s+(?:is|are)\s+being\s+(?:created|generated|rendered|edited|updated|processed)\b|\bimages?\s+(?:generation|editing|processing)\s+(?:is\s+)?(?:in\s+progress|underway)\b|이미지(?:를|가)?\s*(?:생성|만들|그리|편집|수정|처리|업데이트)(?:하는|하고\s*있는|고\s*있는|는)?\s*중|이미지\s*(?:생성|편집|수정|처리)\s*중)/i;
var CHATGPT_STOP_SELECTOR = '[data-testid="stop-button"],button[aria-label*="Stop"],button[aria-label*="stop"],button[aria-label*="\uC911\uC9C0"],button[data-testid*="stop"]';
var CHATGPT_IMAGE_STATUS_SELECTOR = '[role="status"],[aria-live],[aria-busy="true"],[data-testid*="image-generation"],[data-testid*="image_generation"],[data-testid*="generating-image"],[data-testid*="editing-image"],[data-testid*="image-edit"],[data-testid*="image-gen"],[data-testid*="progress"],[data-testid*="loading"]';
var CHATGPT_TURN_SELECTOR = '[data-message-author-role="assistant"],[data-testid^="conversation-turn-"],article[data-testid*="conversation-turn"]';
var CHATGPT_PROGRESS_SELECTOR = '[role="progressbar"],[aria-busy="true"],[data-testid*="progress"],[data-testid*="loading"],.animate-spin,.animate-pulse,[class*="shimmer"],[class*="skeleton"]';
function getElementSignalText(el) {
  if (!el) return '';
  const attrs = [
    el.getAttribute?.('aria-label'),
    el.getAttribute?.('title'),
    el.getAttribute?.('data-testid'),
    el.getAttribute?.('role'),
    el.getAttribute?.('class'),
  ];
  return `${attrs.filter(Boolean).join(' ')} ${el.textContent || ''}`.replace(/\s+/g, ' ').trim();
}
function hasChatGptImageGenerationSignal(el) {
  const signal = getElementSignalText(el);
  if (CHATGPT_IMAGE_GENERATING_RE.test(signal)) return true;
  return /(?:image|이미지).*(?:generat|creat|editing|updating|processing|progress|loading|skeleton|생성\s*중|편집\s*중|수정\s*중|처리\s*중|진행|로딩)|(?:generating|creating|editing|updating|processing).*(?:image)/i.test(signal);
}
function hasChatGptProgressIndicator(el) {
  if (!el) return false;
  const candidates = el.matches?.(CHATGPT_PROGRESS_SELECTOR) ? [el] : Array.from(el.querySelectorAll?.(CHATGPT_PROGRESS_SELECTOR) || []);
  return candidates.some((candidate) => isVisible(candidate));
}
function getVisibleChatGptTurnCandidates() {
  const maxRecentTurns = 16;
  const out = [];
  const candidates = qsa(CHATGPT_TURN_SELECTOR);
  const start = Math.max(0, candidates.length - maxRecentTurns);
  for (let i = start; i < candidates.length; i++) {
    const el = candidates[i];
    if (!el || !isVisible(el)) continue;
    out.push(el);
    if (out.length >= maxRecentTurns) return out;
  }
  return out;
}
function isLikelyUserChatGptTurn(el) {
  const author = String(el?.getAttribute?.('data-message-author-role') || '').trim().toLowerCase();
  if (author === 'user') return true;
  if (author === 'assistant') return false;
  const hasUser = !!el?.querySelector?.('[data-message-author-role="user"]');
  const hasAssistant = !!el?.querySelector?.('[data-message-author-role="assistant"]');
  return hasUser && !hasAssistant;
}
function detectChatGPTImageGenerating() {
  const statusCandidates = qsa(CHATGPT_IMAGE_STATUS_SELECTOR);
  const statusStart = Math.max(0, statusCandidates.length - 24);
  for (let i = statusStart; i < statusCandidates.length; i++) {
    const el = statusCandidates[i];
    if (!isVisible(el)) continue;
    const signal = getElementSignalText(el);
    if (!CHATGPT_IMAGE_GENERATING_RE.test(signal)) continue;
    const ownText = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    const testId = String(el.getAttribute?.('data-testid') || '');
    const ariaBusy = String(el.getAttribute?.('aria-busy') || '').toLowerCase() === 'true';
    if (ariaBusy || /(?:generating|editing)-image|image-(?:generation|edit)|progress|loading/i.test(testId) || ownText.length <= 360) return true;
  }
  const turns = getVisibleChatGptTurnCandidates();
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (isLikelyUserChatGptTurn(turn)) continue;
    if (hasChatGptProgressIndicator(turn) && hasChatGptImageGenerationSignal(turn)) return true;
  }
  return false;
}
function detectChatGPTGenerating() {
  const mergedBtns = qsa(CHATGPT_STOP_SELECTOR);
  if (mergedBtns.some((btn) => isVisible(btn) && isEnabledButtonLike(btn))) return true;
  return detectChatGPTImageGenerating();
}
function detectGeminiGenerating() {
  // Gemini: "중지" 또는 "Stop" 단어가 들어간 버튼이 화면에 보이는지 확인
  // (open shadowRoot 내부에 들어가는 케이스 대응)
  const btns = qsa('[aria-label*="중지"], [aria-label*="Stop"], [aria-label*="stop"]');
  return btns.some((btn) => isVisible(btn) && isEnabledButtonLike(btn));
}
function shouldInferAiStudioGeneratingFromRunButton(options = {}) {
  if (!options.composerVisible || options.runButtonVisible) return false;
  return !!(
    options.runRequestedRecently
    || options.wasGenerating
    || options.awaitingResponseStart
    || options.awaitingTurnCompletion
  );
}
function getVisibleAiStudioRunButtons() {
  const candidates = qsa('ms-run-button button,button.ctrl-enter-submits,ms-run-button');
  const seen = new Set();
  const out = [];
  for (const el of candidates) {
    if (!el || seen.has(el) || !isVisible(el)) continue;
    const aria = (el.getAttribute?.('aria-label') || '').trim();
    const title = (el.getAttribute?.('title') || '').trim();
    const tooltip = (el.getAttribute?.('mattooltip') || '').trim();
    const text = (el.innerText || el.textContent || '').trim();
    const hay = `${aria} ${title} ${tooltip} ${text}`.trim();
    if (!/(\brun\b|실행)/i.test(hay) || /(\bstop\b|\bcancel\b|중지|취소)/i.test(hay)) continue;
    seen.add(el);
    out.push(el);
  }
  return out;
}
function hasVisibleAiStudioComposer() {
  const candidates = qsa([
    'ms-prompt-box',
    'textarea[aria-label="Enter a prompt"]',
    'textarea[placeholder*="prompt" i]',
    'textarea[placeholder*="입력"]',
  ].join(','));
  return candidates.some((el) => isVisible(el));
}
function clearAiStudioGenerationProbeBurst(options = {}) {
  for (const timer of aiStudioGenerationProbeTimers) {
    try { clearTimeout(timer); } catch (_) {}
  }
  aiStudioGenerationProbeTimers = [];
  if (options.resetRequest !== false) aiStudioRunRequestedAt = 0;
}
function armAiStudioGenerationProbeBurst() {
  if (getSiteKey() !== 'aistudio') return false;
  clearAiStudioGenerationProbeBurst({ resetRequest: false });
  aiStudioRunRequestedAt = Date.now();
  ensurePolling(true);
  const delays = [0, 90, 220, 500, 900, 1500, 2600, 4500, 7500];
  for (const delay of delays) {
    aiStudioGenerationProbeTimers.push(window.setTimeout(() => scheduleCheck(true), delay));
  }
  return true;
}
function isAiStudioComposerEventTarget(target) {
  if (!target || getSiteKey() !== 'aistudio' || isSteeringTarget(target)) return false;
  const composer = getActiveComposer();
  if (!composer) return false;
  try { return target === composer || composer.contains(target); } catch (_) { return false; }
}
function noteAiStudioPossibleRun(event) {
  if (!event || getSiteKey() !== 'aistudio' || isSteeringTarget(event.target)) return;
  if (event.type === 'keydown') {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.isComposing) return;
    if (!event.ctrlKey && !event.metaKey) return;
    if (!isAiStudioComposerEventTarget(event.target)) return;
    armAiStudioGenerationProbeBurst();
    return;
  }
  if (event.type !== 'click') return;
  let control = null;
  try { control = event.target?.closest?.('button, ms-run-button') || null; } catch (_) { control = null; }
  if (!control || !isVisible(control)) return;
  const hay = `${control.getAttribute?.('aria-label') || ''} ${control.getAttribute?.('title') || ''} ${control.innerText || control.textContent || ''}`;
  if (!/(\brun\b|실행)/i.test(hay) || /(\bstop\b|\bcancel\b|중지|취소)/i.test(hay)) return;
  armAiStudioGenerationProbeBurst();
}
function hasVisibleAiStudioStopControl() {
  const selector = [
    'ms-stop-button',
    'button[aria-label*="Stop"]',
    'button[aria-label*="stop"]',
    'button[aria-label*="중지"]',
    'button[title*="Stop"]',
    'button[title*="중지"]',
  ].join(',');
  return qsa(selector).some((el) => isVisible(el) && isEnabledButtonLike(el));
}
function getVisibleAiStudioSignalScopes() {
  const scopes = [];
  const seen = new Set();
  const add = (el) => {
    if (!el || seen.has(el) || !isVisible(el)) return;
    seen.add(el);
    scopes.push(el);
  };
  for (const composer of qsa('ms-prompt-box,textarea[aria-label="Enter a prompt"],textarea[placeholder*="prompt" i],textarea[placeholder*="입력"]')) {
    if (!isVisible(composer)) continue;
    add(composer);
    try { add(composer.closest?.('footer')); } catch (_) {}
  }
  return scopes;
}
function hasVisibleAiStudioScopedActivitySignal() {
  const selector = [
    '.mat-progress-spinner',
    '.mat-mdc-progress-spinner',
    'mat-progress-spinner',
    'mat-spinner',
    '.mat-progress-bar',
    '.mat-mdc-progress-bar',
    'mat-progress-bar',
    '[aria-busy="true"]',
    'button mat-icon',
    'button .material-symbols-outlined',
  ].join(',');
  const stopIconRe = /(\bstop\b|stop_circle|stop_circle_filled|\bcancel\b|중지|취소)/i;
  const seen = new Set();
  for (const scope of getVisibleAiStudioSignalScopes()) {
    let candidates = [];
    try { candidates = Array.from(scope.querySelectorAll(selector)); } catch (_) { candidates = []; }
    for (const el of candidates) {
      if (!el || seen.has(el) || !isVisible(el)) continue;
      seen.add(el);
      if (el.matches?.('.mat-progress-spinner,.mat-mdc-progress-spinner,mat-progress-spinner,mat-spinner,.mat-progress-bar,.mat-mdc-progress-bar,mat-progress-bar,[aria-busy="true"]')) {
        return true;
      }
      const text = (el.textContent || '').trim();
      const fontIcon = (el.getAttribute?.('fonticon') || '').trim();
      const svgIcon = (el.getAttribute?.('svgicon') || '').trim();
      if (stopIconRe.test(`${text} ${fontIcon} ${svgIcon}`)) return true;
    }
  }
  return false;
}
function detectAiStudioGenerating() {
  const runButtonVisible = getVisibleAiStudioRunButtons().length > 0;
  const composerVisible = hasVisibleAiStudioComposer();
  const runRequestedRecently = !!(
    aiStudioRunRequestedAt
    && Date.now() - aiStudioRunRequestedAt <= 15000
  );
  const inferredFromRunButton = shouldInferAiStudioGeneratingFromRunButton({
    composerVisible,
    runButtonVisible,
    runRequestedRecently,
    wasGenerating: isGenerating,
    awaitingResponseStart: steeringAwaitingResponseStart,
    awaitingTurnCompletion: steeringAwaitingTurnCompletion,
  });
  if (inferredFromRunButton) return true;
  if (hasVisibleAiStudioStopControl()) return true;
  return hasVisibleAiStudioScopedActivitySignal();
}
function detectClaudeGenerating() {
  // Claude: 버튼 텍스트에 "Stop"이 포함되어 있는지 확인
  const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
  return buttons.some((btn) => String(btn.textContent || '').includes('Stop') && isVisible(btn));
}
function detectGenericStopGenerating() {
  // 범용: Stop/중지/Cancel/취소/Abort 텍스트 or aria-label 기반
  // (등록된 사이트에서만 쓰이므로, 너무 공격적으로 잡지 않는다)
  const STOP_RE = /(\bstop\b|\bcancel\b|\babort\b|중지|취소)/i;
  const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const aria = (el.getAttribute('aria-label') || '').trim();
    const txt = (el.textContent || '').trim();
    const hay = `${aria} ${txt}`.trim();
    if (!hay) continue;
    if (STOP_RE.test(hay)) return true;
  }
  return false;
}
function detectGenerating(site) {
  const mode = site?.detection || 'generic_stop';
  if (mode === 'chatgpt') return detectChatGPTGenerating();
  if (mode === 'gemini') return detectGeminiGenerating();
  if (mode === 'aistudio') return detectAiStudioGenerating();
  if (mode === 'claude') return detectClaudeGenerating();
  return detectGenericStopGenerating();
}
function checkStatus() {
  if (!monitoring || !activeSite) return;
  if (isReadyAiDuplicateContentInstance()) return;
  const platform = activeSite.key;
  let currentlyGenerating = false;
  beginStatusQueryCache();
  try {
    // web component/shadow root 구조가 동적으로 바뀌는 사이트(AI Studio 등) 보강
    // open shadowRoot가 동적으로 생기는 사이트(특히 Gemini) 대비
    maybeRescanShadowRoots();
    currentlyGenerating = detectGenerating(activeSite);
    // AI Studio처럼 입력창이 늦게 생기면 최초 배치는 viewport fallback을 쓴다.
    // DOM 감시가 다시 실행된 시점에 실제 입력창 앵커로 자동 복귀시킨다.
    refreshFallbackSteeringPosition();
    if (!currentlyGenerating && platform === 'chatgpt') {
      observeSteeringChatGptAssistantTurn();
      if (
        isGenerating
        && steeringAwaitingTurnCompletion
        && steeringObservedGenerationSinceSend
        && !isSteeringChatGptAssistantTurnStable()
      ) {
        currentlyGenerating = true;
      }
    }
  } catch (_) {
    currentlyGenerating = false;
  } finally {
    endStatusQueryCache();
  }
  // 상태가 변했을 때만 처리 + heartbeat(프레임 합산용)
  let shouldSend = false;
  let visualChanged = false;
  if (isGenerating !== currentlyGenerating) {
    isGenerating = currentlyGenerating;
    visualChanged = true;
    // 요구사항:
    // - 생성 시작: 🟢 -> 🟠
    // - 생성 완료: 🟠 -> ⚪ (탭이 포커스인지 여부와 무관하게 무조건 ⚪)
    // - ⚪ 상태는 "클릭/스크롤"로만 🟢로 돌아간다.
    if (isGenerating) {
      completionStatus = 'idle';
      steeringLastCompletionAt = 0;
      clearSteeringAutoSendTimer();
      clearSteeringSendLock();
      clearSteeringAwaitingResponseStart();
      markSteeringGenerationObserved();
    } else {
      if (platform === 'aistudio') clearAiStudioGenerationProbeBurst();
      completionStatus = 'completed';
      steeringLastCompletionAt = Date.now();
      // Completion may queue/follow up work, but the panel itself only opens via the launcher click.
      const canAdvanceSteeringQueue = !steeringAwaitingTurnCompletion || steeringObservedGenerationSinceSend;
      if (steeringAwaitingTurnCompletion && steeringObservedGenerationSinceSend) {
        clearSteeringTurnCompletionWait();
      }
      if (canAdvanceSteeringQueue) {
        scheduleSteeringQueueProcessing(STEERING_AUTO_SEND_DELAY_MS);
      }
    }
    armTitleBadgeStabilityWindow(isGenerating ? 1800 : 4000);
    shouldSend = true;
    ensurePolling(true);
  } else if (!hasSentInitialState) {
    // 초기 1회는 무조건 상태 전송(연두색 뱃지 표시용)
    shouldSend = true;
    visualChanged = true;
  } else {
    // frame TTL이 남지 않도록 주기적으로 status를 보내준다(오탐 방지: 5초에 1번)
    const now = Date.now();
    if (!_lastHeartbeatAt || now - _lastHeartbeatAt >= HEARTBEAT_MS) {
      shouldSend = true;
    }
  }
  if (shouldSend) {
    chrome.runtime.sendMessage({
      action: "status_update",
      platform,
      siteName: activeSite.name,
      isGenerating,
    });
    hasSentInitialState = true;
    _lastHeartbeatAt = Date.now();
  }
  if (visualChanged) {
    updateTitleBadge();
    updateSteeringUi();
  } else {
    syncTitleBadgeFromStatusLoop(false);
  }
}
function isEditableInteractionTarget(target) {
  if (!target) return false;
  try {
    if (target.closest?.('textarea, input, [contenteditable="true"], [role="textbox"]')) return true;
  } catch (_) {}
  const tagName = String(target?.tagName || '').toLowerCase();
  if (tagName === 'textarea' || tagName === 'input') return true;
  if (target?.isContentEditable) return true;
  return false;
}
function getChatGptNativeComposerForEventTarget(target) {
  if (!target || !isChatGptSafeMode() || isSteeringTarget(target)) return null;
  let directComposer = null;
  try {
    directComposer = target.closest?.('textarea, div[contenteditable="true"], [role="textbox"][contenteditable="true"]') || null;
  } catch (_) {
    directComposer = null;
  }
  if (directComposer && scoreChatGptComposerCandidate(directComposer, null) >= 18) return directComposer;
  const composer = getActiveComposer();
  if (!composer) return null;
  try {
    if (target === composer || composer.contains(target)) return composer;
  } catch (_) {}
  return null;
}
var chatGptNativeComposerImmediateFallbackTimer = null;
var chatGptNativeComposerImmediateFallbackSending = false;
var chatGptNativeComposerImmediateHandoffUntil = 0;
var CHATGPT_NATIVE_COMPOSER_IMMEDIATE_HANDOFF_MS = 6500;
var chatGptNativeComposerRecentSubmitSignature = '';
var chatGptNativeComposerRecentSubmitAt = 0;
var chatGptNativeComposerRecentSubmitTarget = null;
var CHATGPT_NATIVE_COMPOSER_REPEAT_DEDUPE_MS = 320;
function getChatGptNativeComposerSubmitSignature(text) {
  return normalizeChatGptShortcutText(text);
}
function rememberChatGptNativeComposerSubmit(text, composer, now = Date.now()) {
  chatGptNativeComposerRecentSubmitSignature = getChatGptNativeComposerSubmitSignature(text);
  chatGptNativeComposerRecentSubmitAt = Math.max(0, Number(now) || 0);
  chatGptNativeComposerRecentSubmitTarget = composer || null;
}
function isRecentDuplicateChatGptNativeComposerSubmit(text, composer, now = Date.now()) {
  const signature = getChatGptNativeComposerSubmitSignature(text);
  const elapsed = Math.max(0, Number(now) || 0) - chatGptNativeComposerRecentSubmitAt;
  return !!(
    signature
    && signature === chatGptNativeComposerRecentSubmitSignature
    && composer === chatGptNativeComposerRecentSubmitTarget
    && chatGptNativeComposerRecentSubmitAt > 0
    && elapsed >= 0
    && elapsed <= CHATGPT_NATIVE_COMPOSER_REPEAT_DEDUPE_MS
  );
}
function clearChatGptNativeComposerImmediateHandoff() {
  chatGptNativeComposerImmediateHandoffUntil = 0;
}
function armChatGptNativeComposerImmediateHandoff(options = {}) {
  if (!monitoring || !steeringEnabled) {
    clearChatGptNativeComposerImmediateHandoff();
    return false;
  }
  chatGptNativeComposerImmediateHandoffUntil = Date.now()
    + Math.max(1000, Number(options.timeoutMs) || CHATGPT_NATIVE_COMPOSER_IMMEDIATE_HANDOFF_MS);
  try {
    if (options.generating) clearSteeringChatGptAssistantObservation();
    else captureSteeringChatGptAssistantBaseline();
  } catch (_) {}
  return true;
}
function isChatGptNativeComposerFollowupGateActive() {
  if (!monitoring || !steeringEnabled) return false;
  return !!(
    chatGptNativeComposerImmediateFallbackSending
    || steeringAwaitingResponseStart
    || steeringAwaitingTurnCompletion
    || Date.now() <= chatGptNativeComposerImmediateHandoffUntil
  );
}
function confirmChatGptNativeComposerImmediateSubmission(options = {}) {
  clearChatGptNativeComposerImmediateHandoff();
  if (!monitoring || !steeringEnabled) return false;
  const observedGeneration = !!options.observedGeneration;
  clearSteeringCompletionOffer();
  steeringAwaitingTurnCompletion = true;
  steeringObservedGenerationSinceSend = observedGeneration;
  if (observedGeneration) clearSteeringAwaitingResponseStart();
  else armSteeringAwaitingResponseStart();
  setChatGptLightGenerating(true, { observed: observedGeneration });
  armSteeringTurnCompletionWatchdog();
  armSteeringSendLock();
  return true;
}
function normalizeChatGptShortcutText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function countRecentChatGptUserTurnText(text) {
  const expected = normalizeChatGptShortcutText(text);
  if (!expected) return 0;
  let turns = [];
  try { turns = Array.from(document.querySelectorAll('[data-message-author-role="user"]')).slice(-20); } catch (_) { turns = []; }
  return turns.filter((turn) => normalizeChatGptShortcutText(turn?.innerText || turn?.textContent || '') === expected).length;
}
async function sendChatGptNativeComposerImmediately(composer, text, options = {}) {
  chatGptNativeComposerImmediateFallbackSending = true;
  try {
    const result = await sendChatGptImmediateViaStableControls(composer, text, 5200, {
      interruptExistingGeneration: !!options.interruptExistingGeneration,
    });
    if (result?.ok && result?.sent) {
      confirmChatGptNativeComposerImmediateSubmission({
        observedGeneration: !!options.interruptExistingGeneration,
      });
      return true;
    }
    try {
      if (!String(getCurrentComposerText(composer) || '').trim()) setControlValue(composer, text);
      composer?.focus?.();
    } catch (_) {}
    clearChatGptNativeComposerImmediateHandoff();
    return false;
  } finally {
    chatGptNativeComposerImmediateFallbackSending = false;
  }
}
function scheduleChatGptNativeComposerImmediateFallback(composer, text, options = {}) {
  if (chatGptNativeComposerImmediateFallbackTimer) {
    try { clearTimeout(chatGptNativeComposerImmediateFallbackTimer); } catch (_) {}
  }
  const matchingTurnCountBefore = countRecentChatGptUserTurnText(text);
  chatGptNativeComposerImmediateFallbackTimer = setTimeout(() => {
    chatGptNativeComposerImmediateFallbackTimer = null;
    const matchingTurnCreated = countRecentChatGptUserTurnText(text) > matchingTurnCountBefore;
    if (matchingTurnCreated || composer?.isConnected === false) {
      confirmChatGptNativeComposerImmediateSubmission({
        observedGeneration: !!options.interruptExistingGeneration,
      });
      return;
    }
    const liveComposer = getChatGptNativeComposerForEventTarget(composer) || getActiveComposer() || composer;
    const currentText = normalizeChatGptShortcutText(getCurrentComposerText(liveComposer));
    if (!currentText || currentText !== normalizeChatGptShortcutText(text)) {
      confirmChatGptNativeComposerImmediateSubmission({
        observedGeneration: !!options.interruptExistingGeneration,
      });
      return;
    }
    void sendChatGptNativeComposerImmediately(liveComposer, text, {
      interruptExistingGeneration: !!options.interruptExistingGeneration,
    });
  }, 360);
}
function getChatGptNativeComposerEnterPlan(event, options = {}) {
  if (!event || event.key !== 'Enter' || event.repeat || event.isComposing) return { mode: 'ignore', interruptExistingGeneration: false };
  if (event.shiftKey || event.altKey) return { mode: 'ignore', interruptExistingGeneration: false };
  const generating = !!options.generating;
  const awaitingImmediateResponse = !!options.awaitingImmediateResponse;
  const readyAiQueueEnabled = !!(options.monitoring && options.steeringEnabled);
  if (event.ctrlKey || event.metaKey) {
    return {
      mode: 'native_fallback',
      interruptExistingGeneration: !!(readyAiQueueEnabled && generating),
    };
  }
  if (readyAiQueueEnabled && (generating || awaitingImmediateResponse)) {
    return { mode: 'queue', interruptExistingGeneration: false };
  }
  return { mode: 'ignore', interruptExistingGeneration: false };
}
function handleChatGptNativeComposerFollowupEnter(event) {
  if (!event || event.key !== 'Enter' || event.isComposing) return;
  if (!event.isTrusted) return;
  if (event.shiftKey || event.altKey) return;
  if (!IS_TOP_FRAME) return;
  if (!isChatGptSafeMode() || isReadyAiDuplicateContentInstance()) return;
  const composer = getChatGptNativeComposerForEventTarget(event.target);
  if (!composer) return;
  const text = String(getCurrentComposerText(composer) || '').trim();
  if (!text) return;
  if (
    monitoring
    && steeringEnabled
    && isRecentDuplicateChatGptNativeComposerSubmit(text, composer)
  ) {
    try { event.preventDefault(); } catch (_) {}
    try { event.stopImmediatePropagation(); } catch (_) {
      try { event.stopPropagation(); } catch (_) {}
    }
    setSteeringStatus('빠른 연속 Enter의 중복 전송을 막았습니다.');
    updateSteeringUi();
    return;
  }
  if (event.repeat) return;
  let generatingNow = false;
  try { generatingNow = !!(isGenerating || detectChatGptGeneratingLight()); } catch (_) {}
  const enterPlan = getChatGptNativeComposerEnterPlan(event, {
    monitoring,
    steeringEnabled,
    generating: generatingNow,
    awaitingImmediateResponse: isChatGptNativeComposerFollowupGateActive(),
  });
  if (enterPlan.mode === 'native_fallback') {
    rememberChatGptNativeComposerSubmit(text, composer);
    armChatGptNativeComposerImmediateHandoff({ generating: generatingNow });
    if (!chatGptNativeComposerImmediateFallbackSending) {
      scheduleChatGptNativeComposerImmediateFallback(composer, text, {
        interruptExistingGeneration: enterPlan.interruptExistingGeneration,
      });
    }
    return;
  }
  if (enterPlan.mode !== 'queue') {
    if (!event.ctrlKey && !event.metaKey) {
      rememberChatGptNativeComposerSubmit(text, composer);
    }
    return;
  }
  try { event.preventDefault(); } catch (_) {}
  try { event.stopImmediatePropagation(); } catch (_) {
    try { event.stopPropagation(); } catch (_) {}
  }
  const queued = enqueueSteeringPrompt(text, { source: 'native_chatgpt_composer' });
  if (!queued) return;
  rememberChatGptNativeComposerSubmit(text, composer);
  setControlValue(composer, '');
  setChatGptLightGenerating(true, { observed: generatingNow });
  setSteeringStatus(`${getSteeringQueueCountLabel()} · 응답이 끝나면 자동 전송합니다.`);
  updateSteeringUi();
}
function markTypingAcknowledged(event) {
  if (completionStatus !== 'completed' || isGenerating) return;
  if (isSteeringTarget(event?.target)) return;
  if (isComposerAcknowledgeSuppressed()) return;
  if (!isEditableInteractionTarget(event?.target)) return;
  acknowledgeCompletion();
}
// 사용자 상호작용(클릭/스크롤) 시 ⚪ -> 🟢 전환 (요구사항)
