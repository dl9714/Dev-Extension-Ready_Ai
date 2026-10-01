function applyDesiredDocumentTitle(force = false) {
  if (!monitoring) return;
  if (!IS_TOP_FRAME) return;
  if (isGoogleAiTitleSafeMode()) return;
  if (typeof isReadyAiDuplicateContentInstance === 'function' && isReadyAiDuplicateContentInstance()) return;
  if (!isChatGptSafeMode()) publishTitleGuardState({ force });
  const currentTitle = String(document.title || '');
  const targetTitle = computeDesiredDocumentTitle(currentTitle);
  if (currentTitle === targetTitle) return;
  titleSyncMuted = true;
  try {
    document.title = targetTitle;
  } catch (_) {}
  if (titleSyncApplyTimer) {
    try { clearTimeout(titleSyncApplyTimer); } catch (_) {}
  }
  titleSyncApplyTimer = setTimeout(() => {
    titleSyncMuted = false;
    titleSyncApplyTimer = null;
  }, 0);
}
function queueDesiredDocumentTitleSync(force = false) {
  if (!monitoring) return;
  if (!IS_TOP_FRAME) return;
  if (isGoogleAiTitleSafeMode()) return;
  if (!isChatGptSafeMode()) publishTitleGuardState({ force });
  titleSyncQueuedForce = titleSyncQueuedForce || !!force;
  if (titleSyncQueued) return;
  titleSyncQueued = true;
  Promise.resolve().then(() => {
    const shouldForce = titleSyncQueuedForce;
    titleSyncQueuedForce = false;
    titleSyncQueued = false;
    applyDesiredDocumentTitle(shouldForce);
  });
}
function getTitleBadgeStabilityIntervalMs() {
  return document.hidden ? 750 : 250;
}
function armTitleBadgeStabilityWindow(ms = 1800) {
  if (isChatGptSafeMode()) return;
  if (isGoogleAiTitleSafeMode()) return;
  if (!monitoring) return;
  if (!IS_TOP_FRAME) return;
  if (!titleBadgeEnabled) return;
  titleBadgeStabilityUntil = Math.max(titleBadgeStabilityUntil || 0, Date.now() + Math.max(200, ms));
  if (titleBadgeStabilityTimer) return;
  const tick = () => {
    titleBadgeStabilityTimer = null;
    if (!monitoring || !IS_TOP_FRAME || !titleBadgeEnabled) return;
    applyDesiredDocumentTitle();
    if (Date.now() < titleBadgeStabilityUntil) {
      titleBadgeStabilityTimer = setTimeout(tick, getTitleBadgeStabilityIntervalMs());
    }
  };
  titleBadgeStabilityTimer = setTimeout(tick, 0);
}
function clearTitleBadgeStabilityWindow() {
  titleBadgeStabilityUntil = 0;
  if (titleBadgeStabilityTimer) {
    try { clearTimeout(titleBadgeStabilityTimer); } catch (_) {}
    titleBadgeStabilityTimer = null;
  }
}
function getTitleGuardPrefix() {
  if (!titleBadgeEnabled) return '';
  const badge = TITLE_BADGE[getTitleBadgeStateKey()] || TITLE_BADGE.WHITE;
  const countGlyph = getTitleBadgeCountGlyph();
  return `${badge}${countGlyph}`.trim();
}
function markTitleGuardInstalled(seq = 0) {
  titleGuardInstalled = true;
  titleGuardInstallInFlight = false;
  if (Number(seq) > 0) {
    titleGuardLastAckSeq = Math.max(titleGuardLastAckSeq || 0, Number(seq) || 0);
    if (titleGuardLastAckSeq >= titleGuardStateSeq && titleGuardStateRetryTimer) {
      try { clearTimeout(titleGuardStateRetryTimer); } catch (_) {}
      titleGuardStateRetryTimer = null;
      titleGuardStateRetryUntil = 0;
    }
  }
  if (titleGuardInstallRetryTimer) {
    try { clearTimeout(titleGuardInstallRetryTimer); } catch (_) {}
    titleGuardInstallRetryTimer = null;
  }
}
function ensureTitleGuardMessageBridge() {
  if (!IS_TOP_FRAME) return;
  if (titleGuardBridgeBound) return;
  titleGuardBridgeBound = true;
  try {
    addReadyAiEventListener(window, 'message', (event) => {
      if (event.source !== window) return;
      const data = event.data || {};
      if (data.source !== 'Ready_Ai') return;
      if (data.type === 'ready_ai_title_guard_ready') {
        titleGuardVersion = Math.max(titleGuardVersion || 0, Number(data.guardVersion) || 0);
        markTitleGuardInstalled();
        publishTitleGuardState({ force: titleGuardLastAckSeq < titleGuardStateSeq || titleGuardStateSeq <= 0 });
        return;
      }
      if (data.type === 'ready_ai_title_guard_ack') {
        markTitleGuardInstalled(data.seq || 0);
      }
    }, false);
  } catch (_) {}
}
function requestTitleGuardInstall() {
  if (isChatGptSafeMode()) return;
  if (isGoogleAiTitleSafeMode()) return;
  if (!IS_TOP_FRAME) return;
  ensureTitleGuardMessageBridge();
  if (titleGuardInstalled || titleGuardInstallInFlight) return;
  titleGuardInstallRequested = true;
  titleGuardInstallInFlight = true;
  try {
    chrome.runtime.sendMessage({ action: 'ensure_title_guard' }, (resp) => {
      const ok = !!resp?.ok && !chrome.runtime.lastError;
      titleGuardInstallInFlight = false;
      if (ok) {
        markTitleGuardInstalled();
        publishTitleGuardState({ force: true });
        return;
      }
      scheduleTitleGuardInstallRetry();
    });
  } catch (_) {
    titleGuardInstallInFlight = false;
    scheduleTitleGuardInstallRetry();
  }
}
function scheduleTitleGuardInstallRetry() {
  if (isGoogleAiTitleSafeMode()) return;
  if (!monitoring || !IS_TOP_FRAME || titleGuardInstalled) return;
  if (titleGuardInstallRetryTimer) return;
  titleGuardInstallRetryTimer = setTimeout(() => {
    titleGuardInstallRetryTimer = null;
    titleGuardInstallRequested = false;
    requestTitleGuardInstall();
  }, 900);
}
function scheduleTitleGuardStateRetry() {
  if (isGoogleAiTitleSafeMode()) return;
  if (!monitoring || !IS_TOP_FRAME || !titleBadgeEnabled) return;
  if (titleGuardLastAckSeq >= titleGuardStateSeq) return;
  if (!titleGuardStateRetryUntil) titleGuardStateRetryUntil = Date.now() + 5000;
  if (titleGuardStateRetryTimer) return;
  titleGuardStateRetryTimer = setTimeout(() => {
    titleGuardStateRetryTimer = null;
    if (!monitoring || !IS_TOP_FRAME || !titleBadgeEnabled) return;
    if (titleGuardLastAckSeq >= titleGuardStateSeq) {
      titleGuardStateRetryUntil = 0;
      return;
    }
    if (Date.now() > titleGuardStateRetryUntil) {
      titleGuardStateRetryUntil = 0;
      titleGuardInstalled = false;
      titleGuardInstallInFlight = false;
      titleGuardStateSignature = '';
      requestTitleGuardInstall();
      return;
    }
    publishTitleGuardState({ force: true });
  }, titleGuardInstalled ? 180 : 320);
}
function publishTitleGuardState(options = {}) {
  if (isChatGptSafeMode()) return;
  if (!IS_TOP_FRAME) return;
  if (isGoogleAiTitleSafeMode()) {
    // 확장 새로고침 전 페이지에 남아 있는 구형 main-world guard도 해제한다.
    titleGuardStateSignature = 'google-ai-title-safe-mode';
    titleGuardStateRetryUntil = 0;
    if (titleGuardInstallRetryTimer) {
      try { clearTimeout(titleGuardInstallRetryTimer); } catch (_) {}
      titleGuardInstallRetryTimer = null;
    }
    if (titleGuardStateRetryTimer) {
      try { clearTimeout(titleGuardStateRetryTimer); } catch (_) {}
      titleGuardStateRetryTimer = null;
    }
    try {
      window.postMessage({
        source: 'Ready_Ai',
        type: 'ready_ai_title_guard_state',
        enabled: false,
        prefix: '',
        customBaseTitle: '',
        fallbackBaseTitle: '',
        seq: Math.max(1, ++titleGuardStateSeq),
      }, '*');
    } catch (_) {}
    return;
  }
  ensureTitleGuardMessageBridge();
  const enabled = Object.prototype.hasOwnProperty.call(options, 'enabled')
    ? !!options.enabled
    : !!(monitoring && titleBadgeEnabled);
  const prefix = enabled ? getTitleGuardPrefix() : '';
  const customBaseTitle = enabled && hasCustomTabTitle() ? normalizeCustomTabTitle(customTabTitle) : '';
  const fallbackBaseTitle = enabled ? getDesiredBaseTitle(getCleanDocumentTitleText()) : '';
  const payload = {
    source: 'Ready_Ai',
    type: 'ready_ai_title_guard_state',
    enabled,
    prefix,
    customBaseTitle,
    fallbackBaseTitle,
  };
  const signature = JSON.stringify(payload);
  if (!options.force && signature === titleGuardStateSignature) {
    if (enabled && titleGuardLastAckSeq < titleGuardStateSeq) scheduleTitleGuardStateRetry();
    return;
  }
  if (signature !== titleGuardStateSignature || titleGuardStateSeq <= 0) {
    titleGuardStateSeq += 1;
    titleGuardLastAckSeq = Math.min(titleGuardLastAckSeq || 0, titleGuardStateSeq - 1);
    titleGuardStateRetryUntil = 0;
    titleGuardStateSignature = signature;
  }
  payload.seq = titleGuardStateSeq;
  try { window.postMessage(payload, '*'); } catch (_) {}
  if (!enabled) {
    if (titleGuardStateRetryTimer) {
      try { clearTimeout(titleGuardStateRetryTimer); } catch (_) {}
      titleGuardStateRetryTimer = null;
    }
    titleGuardStateRetryUntil = 0;
    return;
  }
  if (enabled) scheduleTitleGuardStateRetry();
  if (enabled && !titleGuardInstalled) scheduleTitleGuardInstallRetry();
}
function syncNativePageTitleFromDocumentTitle() {
  if (hasCustomTabTitle()) return;
  const cleanTitle = getCleanDocumentTitleText();
  const normalizedClean = normalizeCustomTabTitle(cleanTitle);
  const rememberedCustom = normalizeCustomTabTitle(lastCustomTabTitle);
  if (!normalizedClean || normalizedClean !== rememberedCustom) {
    nativePageTitle = cleanTitle || nativePageTitle || activeSite?.name || 'AI';
    if (normalizedClean && normalizedClean !== rememberedCustom) lastCustomTabTitle = '';
  }
}
function reconcileDesiredDocumentTitleFromMutation() {
  if (!monitoring) return;
  if (!IS_TOP_FRAME) return;
  if (isGoogleAiTitleSafeMode()) return;
  syncNativePageTitleFromDocumentTitle();
  const currentTitle = String(document.title || '');
  const targetTitle = computeDesiredDocumentTitle(currentTitle);
  if (currentTitle === targetTitle) return;
  queueDesiredDocumentTitleSync(true);
  if (titleBadgeEnabled) {
    armTitleBadgeStabilityWindow(titleSyncMuted ? 1200 : 1800);
  }
}
function ensureTitleSyncObserver() {
  if (isChatGptSafeMode()) return;
  if (isGoogleAiTitleSafeMode()) return;
  if (!IS_TOP_FRAME) return;
  if (titleSyncObserver) return;
  const target = document.head || document.documentElement;
  if (!target) return;
  titleSyncObserver = new MutationObserver(() => {
    reconcileDesiredDocumentTitleFromMutation();
  });
  try {
    titleSyncObserver.observe(target, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  } catch (_) {
    titleSyncObserver = null;
  }
}
function disconnectTitleSyncObserver() {
  if (!titleSyncObserver) return;
  try { titleSyncObserver.disconnect(); } catch (_) {}
  titleSyncObserver = null;
}
function updateTitleBadge() {
  if (isReadyAiDuplicateContentInstance()) return;
  if (isGoogleAiTitleSafeMode()) {
    publishTitleGuardState({ enabled: false });
    return;
  }
  if (!isChatGptSafeMode()) requestTitleGuardInstall();
  applyDesiredDocumentTitle();
}
function getTitleBadgeUiSyncSignature() {
  return JSON.stringify({
    enabled: !!titleBadgeEnabled,
    countEnabled: !!titleBadgeCountEnabled,
    state: getTitleBadgeStateKey(),
    queue: titleBadgeCountEnabled ? getTitleBadgeCountGlyph() : '',
    custom: normalizeCustomTabTitle(customTabTitle),
    native: normalizeCustomTabTitle(nativePageTitle || activeSite?.name || 'AI'),
  });
}
function syncTitleBadgeFromUiRender(force = false) {
  if (!monitoring || !IS_TOP_FRAME) return;
  if (isGoogleAiTitleSafeMode()) return;
  if (isReadyAiDuplicateContentInstance()) return;
  const now = Date.now();
  const signature = getTitleBadgeUiSyncSignature();
  const sameSignature = signature === titleBadgeLastUiSyncSignature;
  const minGap = document.hidden ? 6000 : 3000;
  if (!force && sameSignature && titleBadgeLastUiSyncAt && now - titleBadgeLastUiSyncAt < minGap) return;
  titleBadgeLastUiSyncSignature = signature;
  titleBadgeLastUiSyncAt = now;
  updateTitleBadge();
}
function syncTitleBadgeFromStatusLoop(force = false) {
  if (isChatGptSafeMode()) return;
  if (isGoogleAiTitleSafeMode()) return;
  if (!monitoring || !IS_TOP_FRAME) return;
  if (isReadyAiDuplicateContentInstance()) return;
  const now = Date.now();
  const minGap = document.hidden ? 2500 : 1200;
  if (!force && titleBadgeLastLoopSyncAt && now - titleBadgeLastLoopSyncAt < minGap) return;
  titleBadgeLastLoopSyncAt = now;
  applyDesiredDocumentTitle();
}
function clearTitleBadge() {
  if (!IS_TOP_FRAME) return;
  if (typeof isReadyAiDuplicateContentInstance === 'function' && isReadyAiDuplicateContentInstance()) return;
  if (isGoogleAiTitleSafeMode()) {
    publishTitleGuardState({ enabled: false, force: true });
    return;
  }
  if (!isChatGptSafeMode()) publishTitleGuardState({ enabled: false, force: true });
  const cleanTitle = hasCustomTabTitle() ? normalizeCustomTabTitle(customTabTitle) : getDesiredBaseTitle(getCleanDocumentTitleText());
  try { document.title = cleanTitle; } catch (_) {}
}
function detectChatGptGeneratingLight() {
  if (!isChatGptSafeMode()) return false;
  if (isReadyAiDuplicateContentInstance()) return false;
  const selector = typeof CHATGPT_STOP_SELECTOR === 'string'
    ? CHATGPT_STOP_SELECTOR
    : '[data-testid="stop-button"],button[aria-label*="Stop"],button[aria-label*="stop"],button[aria-label*="중지"],button[data-testid*="stop"]';
  let buttons = [];
  try { buttons = Array.from(document.querySelectorAll(selector)).slice(-8); } catch (_) { buttons = []; }
  if (buttons.some((btn) => isVisible(btn) && isEnabledButtonLike(btn))) return true;
  try {
    return typeof detectChatGPTImageGenerating === 'function' && detectChatGPTImageGenerating();
  } catch (_) {
    return false;
  }
}
function sendChatGptLightStatusUpdate() {
  if (!activeSite || !isChatGptSafeMode()) return;
  if (isReadyAiDuplicateContentInstance()) return;
  try {
    chrome.runtime.sendMessage({
      action: 'status_update',
      platform: activeSite.key,
      siteName: activeSite.name,
      isGenerating,
    });
    hasSentInitialState = true;
    _lastHeartbeatAt = Date.now();
  } catch (_) {}
}
function runChatGptLightTitleBadgeSync() {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  if (isReadyAiDuplicateContentInstance()) return;
  syncNativePageTitleFromDocumentTitle();
  applyDesiredDocumentTitle(true);
}
function ensureChatGptLightTitleObserver() {
  if (!isChatGptSafeMode() || !IS_TOP_FRAME || chatGptLightTitleObserver) return;
  const scheduleSync = () => {
    if (chatGptLightTitleObserverQueued) return;
    chatGptLightTitleObserverQueued = true;
    Promise.resolve().then(() => {
      chatGptLightTitleObserverQueued = false;
      if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
      applyDesiredDocumentTitle(true);
    });
  };
  try {
    chatGptLightTitleObserver = new MutationObserver(() => scheduleSync());
    const target = document.head || document.querySelector('title') || document.documentElement;
    if (!target) {
      chatGptLightTitleObserver = null;
      return;
    }
    chatGptLightTitleObserver.observe(target, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  } catch (_) {
    chatGptLightTitleObserver = null;
  }
}
function disconnectChatGptLightTitleObserver() {
  if (!chatGptLightTitleObserver) return;
  try { chatGptLightTitleObserver.disconnect(); } catch (_) {}
  chatGptLightTitleObserver = null;
  chatGptLightTitleObserverQueued = false;
}
function scheduleChatGptLightTitleBadgeSync(delay = 0) {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  if (chatGptLightTitleBadgeTimer) {
    try { clearTimeout(chatGptLightTitleBadgeTimer); } catch (_) {}
    chatGptLightTitleBadgeTimer = null;
  }
  chatGptLightTitleBadgeTimer = setTimeout(() => {
    chatGptLightTitleBadgeTimer = null;
    runChatGptLightTitleBadgeSync();
  }, Math.max(0, Number(delay) || 0));
}
function armChatGptLightTitleBadgeBurst() {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  clearChatGptLightTitleBadgeBurst();
  const delays = [0, 160, 600, 1800, 4800];
  for (const delay of delays) {
    const timer = setTimeout(() => runChatGptLightTitleBadgeSync(), delay);
    chatGptLightTitleBadgeBurstTimers.push(timer);
  }
}
function clearChatGptLightTitleBadgeBurst() {
  if (!chatGptLightTitleBadgeBurstTimers.length) return;
  for (const timer of chatGptLightTitleBadgeBurstTimers) {
    try { clearTimeout(timer); } catch (_) {}
  }
  chatGptLightTitleBadgeBurstTimers = [];
}
function startChatGptLightTitleBadgeKeepAlive() {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  ensureChatGptLightTitleObserver();
  if (chatGptLightTitleBadgeKeepAliveTimer) return;
  const getDelay = () => {
    const active = isFastStatusCheckWindow() || getSteeringQueueCountValue() > 0;
    if (document.hidden) return active ? 10000 : 60000;
    return active ? 3000 : 15000;
  };
  const tick = () => {
    chatGptLightTitleBadgeKeepAliveTimer = null;
    if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
    runChatGptLightTitleBadgeSync();
    chatGptLightTitleBadgeKeepAliveTimer = setTimeout(tick, getDelay());
  };
  chatGptLightTitleBadgeKeepAliveTimer = setTimeout(tick, 900);
}
function stopChatGptLightTitleBadgeKeepAlive() {
  disconnectChatGptLightTitleObserver();
  if (chatGptLightTitleBadgeTimer) {
    try { clearTimeout(chatGptLightTitleBadgeTimer); } catch (_) {}
    chatGptLightTitleBadgeTimer = null;
  }
  if (chatGptLightTitleBadgeKeepAliveTimer) {
    try { clearTimeout(chatGptLightTitleBadgeKeepAliveTimer); } catch (_) {}
    chatGptLightTitleBadgeKeepAliveTimer = null;
  }
  clearChatGptLightTitleBadgeBurst();
}
function setChatGptLightGenerating(nextGenerating, options = {}) {
  if (!isChatGptSafeMode() || !monitoring) return;
  const next = !!nextGenerating;
  if (next) {
    const observed = Object.prototype.hasOwnProperty.call(options, 'observed')
      ? !!options.observed
      : detectChatGptGeneratingLight();
    if (!steeringAwaitingTurnCompletion) {
      captureSteeringChatGptAssistantBaseline();
      // A tab may reconnect after the response has already begun.
      if (observed && steeringChatGptAssistantBaseline?.count && !steeringChatGptAssistantBaseline.finalized) {
        steeringChatGptAssistantBaseline = { ...steeringChatGptAssistantBaseline, count: steeringChatGptAssistantBaseline.count - 1, identity: '' };
      }
      steeringAwaitingTurnCompletion = true;
      steeringObservedGenerationSinceSend = false;
      armSteeringTurnCompletionWatchdog();
    }
    if (!chatGptLightGenerationStartedAt) chatGptLightGenerationStartedAt = Date.now();
    chatGptLightGenerationWatchUntil = Date.now() + 10 * 60 * 1000;
    steeringLastCompletionAt = 0;
    clearSteeringAutoSendTimer();
    clearSteeringSendLock();
    if (observed) {
      clearSteeringAwaitingResponseStart();
      markSteeringGenerationObserved();
    }
    if (!isGenerating || completionStatus === 'completed') {
      isGenerating = true;
      completionStatus = 'idle';
      updateTitleBadge();
      updateSteeringUi();
      sendChatGptLightStatusUpdate();
    }
    scheduleChatGptLightCompletionWatch(500);
    return;
  }
  if (isGenerating) {
    isGenerating = false;
    completionStatus = 'completed';
    steeringLastCompletionAt = Date.now();
    const canAdvanceSteeringQueue = !steeringAwaitingTurnCompletion || steeringObservedGenerationSinceSend;
    if (steeringAwaitingTurnCompletion && steeringObservedGenerationSinceSend) {
      clearSteeringTurnCompletionWait();
    }
    if (canAdvanceSteeringQueue) {
      scheduleSteeringQueueProcessing(STEERING_AUTO_SEND_DELAY_MS);
    }
    updateTitleBadge();
    updateSteeringUi();
    sendChatGptLightStatusUpdate();
  } else {
    updateTitleBadge();
  }
}
function scheduleChatGptLightCompletionWatch(delay = 900) {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  if (chatGptLightCompletionWatchTimer) {
    try { clearTimeout(chatGptLightCompletionWatchTimer); } catch (_) {}
    chatGptLightCompletionWatchTimer = null;
  }
  chatGptLightCompletionWatchTimer = setTimeout(() => {
    chatGptLightCompletionWatchTimer = null;
    if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
    if (syncSteeringConversationScope()) return;
    if (steeringStateRestoring) { scheduleChatGptLightCompletionWatch(500); return; }
    const now = Date.now();
    const generatingNow = detectChatGptGeneratingLight();
    if (generatingNow) {
      setChatGptLightGenerating(true, { observed: true });
      scheduleChatGptLightCompletionWatch(document.hidden ? 1800 : 900);
      return;
    }
    observeSteeringChatGptAssistantTurn();
    if (isGenerating && now - chatGptLightGenerationStartedAt >= 2200) {
      if (
        steeringAwaitingTurnCompletion
        && steeringObservedGenerationSinceSend
        && !isSteeringChatGptAssistantTurnStable()
      ) {
        scheduleChatGptLightCompletionWatch(document.hidden ? 1800 : 700);
        return;
      }
      const awaitingUnobservedSteeringTurn = !!(
        steeringAwaitingTurnCompletion
        && !steeringObservedGenerationSinceSend
      );
      if (awaitingUnobservedSteeringTurn) {
        scheduleChatGptLightCompletionWatch(document.hidden ? 1800 : 900);
        return;
      }
      setChatGptLightGenerating(false);
      return;
    }
    if (steeringAwaitingTurnCompletion || now < chatGptLightGenerationWatchUntil) {
      scheduleChatGptLightCompletionWatch(700);
    }
  }, Math.max(0, Number(delay) || 0));
}
function clearChatGptLightCompletionWatch() {
  if (chatGptLightCompletionWatchTimer) {
    try { clearTimeout(chatGptLightCompletionWatchTimer); } catch (_) {}
    chatGptLightCompletionWatchTimer = null;
  }
  chatGptLightGenerationStartedAt = 0;
  chatGptLightGenerationWatchUntil = 0;
}
function isChatGptLightSendClick(event) {
  const target = event?.target;
  if (!target || isSteeringTarget(target)) return false;
  let button = null;
  try { button = target.closest?.('button, [role="button"], input[type="submit"]') || null; } catch (_) { button = null; }
  if (!button) return false;
  const aria = (button.getAttribute?.('aria-label') || '').trim();
  const title = (button.getAttribute?.('title') || '').trim();
  const testId = (button.getAttribute?.('data-testid') || '').trim();
  const type = (button.getAttribute?.('type') || '').trim();
  const text = (button.innerText || button.textContent || '').trim();
  const hay = `${aria} ${title} ${testId} ${type} ${text}`.trim();
  if (/(stop|중지|cancel|취소|abort|voice|mic|마이크|upload|첨부|attachment|plus|더보기)/i.test(hay)) return false;
  if (/send|전송|보내기|submit|arrow-up|paper-plane/i.test(hay)) return true;
  try {
    const activeSend = typeof getActiveSendButton === 'function' ? getActiveSendButton() : null;
    return !!(activeSend && (button === activeSend || button.contains(activeSend) || activeSend.contains(button)));
  } catch (_) {
    return false;
  }
}
function isChatGptLightSendKey(event) {
  if (!event || event.key !== 'Enter') return false;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return false;
  if (isSteeringTarget(event.target)) return false;
  try {
    if (typeof isEditableInteractionTarget === 'function') return isEditableInteractionTarget(event.target);
  } catch (_) {}
  return false;
}
function noteChatGptLightPossibleSend(event) {
  if (!isChatGptSafeMode() || !monitoring || !IS_TOP_FRAME) return;
  const isSend = event?.type === 'click' ? isChatGptLightSendClick(event) : isChatGptLightSendKey(event);
  if (!isSend) return;
  armChatGptLightTitleBadgeBurst();
  const baseline = !isGenerating ? getChatGptAssistantTurnSnapshot() : null;
  if (!hasChatGptConversationTurns()) steeringConversationStartPendingUntil = Date.now() + 15000;
  const instanceSeq = getReadyAiContentInstanceSeq();
  setTimeout(() => {
    if (!isReadyAiCurrentContentInstance(instanceSeq)) return;
    if (event.defaultPrevented || isGenerating) return;
    if (baseline) steeringChatGptAssistantBaseline = baseline;
    steeringChatGptAssistantObservedAt = 0;
    steeringChatGptAssistantFinalizedAt = 0;
    steeringAwaitingTurnCompletion = true;
    steeringObservedGenerationSinceSend = false;
    armSteeringTurnCompletionWatchdog();
    setChatGptLightGenerating(true, { observed: false });
  }, 120);
}
function bindChatGptLightTitleBadgeTriggers() {
  if (chatGptLightTitleBadgeTriggersBound || !IS_TOP_FRAME) return;
  chatGptLightTitleBadgeTriggersBound = true;
  addReadyAiEventListener(document, 'click', (event) => {
    if (!isChatGptSafeMode()) return;
    scheduleChatGptLightTitleBadgeSync(60);
    noteChatGptLightPossibleSend(event);
  }, true);
  addReadyAiEventListener(document, 'keydown', (event) => {
    if (!isChatGptSafeMode()) return;
    scheduleChatGptLightTitleBadgeSync(60);
    noteChatGptLightPossibleSend(event);
  }, true);
  addReadyAiEventListener(document, 'input', () => {
    if (!isChatGptSafeMode()) return;
    scheduleChatGptLightTitleBadgeSync(120);
  }, true);
  addReadyAiEventListener(document, 'visibilitychange', () => {
    if (!isChatGptSafeMode()) return;
    armChatGptLightTitleBadgeBurst();
    startChatGptLightTitleBadgeKeepAlive();
  });
  addReadyAiEventListener(window, 'pageshow', () => {
    if (!isChatGptSafeMode()) return;
    armChatGptLightTitleBadgeBurst();
    startChatGptLightTitleBadgeKeepAlive();
  });
}
var STEERING_AUTO_SEND_DELAY_MS = 1000;
var STEERING_TURN_WATCHDOG_VISIBLE_MS = 12000;
var STEERING_TURN_WATCHDOG_HIDDEN_MS = 20000;
var READY_AI_CONTENT_VERSION = '2026-06-12.21-single-queue-dispatch';
var READY_AI_CONTENT_BUILD_VERSION = '2026-10-02.7-safe-session-recovery';
var READY_AI_CANONICAL_EXTENSION_ID = 'jmgnmeaiahlpbbgnocmognokfecofkma';
var readyAiDuplicateContentInstance = false;
function getReadyAiExtensionId() {
  try {
    return String(chrome?.runtime?.id || '');
  } catch (_) {
    return '';
  }
}
function isReadyAiCanonicalExtension() {
  return getReadyAiExtensionId() === READY_AI_CANONICAL_EXTENSION_ID;
}
function isReadyAiDuplicateContentInstance() {
  if (!readyAiDuplicateContentInstance && IS_TOP_FRAME) {
    try {
      const myId = getReadyAiExtensionId();
      const ownerId = String(document.documentElement?.getAttribute?.('data-ready-ai-extension-owner') || '');
      const ownerIsCanonical = ownerId === READY_AI_CANONICAL_EXTENSION_ID;
      if (ownerId && ownerId !== myId && (!isReadyAiCanonicalExtension() || ownerIsCanonical)) {
        markReadyAiDuplicateContentInstance('owner_changed');
      }
    } catch (_) {}
  }
  return !!readyAiDuplicateContentInstance;
}
function markReadyAiDuplicateContentInstance(reason = '') {
  readyAiDuplicateContentInstance = true;
  try {
    if (IS_TOP_FRAME && document.documentElement) {
      document.documentElement.setAttribute('data-ready-ai-duplicate-owner', getReadyAiExtensionId());
      document.documentElement.setAttribute('data-ready-ai-duplicate-reason', String(reason || 'duplicate'));
    }
  } catch (_) {}
}
function claimReadyAiContentOwnership(reason = '') {
  if (!IS_TOP_FRAME) return true;
  const myId = getReadyAiExtensionId();
  if (!myId) return true;
  const root = document.documentElement;
  if (!root) return true;
  let ownerId = '';
  try { ownerId = String(root.getAttribute('data-ready-ai-extension-owner') || ''); } catch (_) { ownerId = ''; }
  if (ownerId && ownerId !== myId) {
    const ownerIsCanonical = ownerId === READY_AI_CANONICAL_EXTENSION_ID;
    if (!isReadyAiCanonicalExtension() || ownerIsCanonical) {
      markReadyAiDuplicateContentInstance(reason || 'owner_exists');
      return false;
    }
  }
  readyAiDuplicateContentInstance = false;
  try {
    root.setAttribute('data-ready-ai-extension-owner', myId);
    root.setAttribute('data-ready-ai-content-version', READY_AI_CONTENT_BUILD_VERSION);
    root.removeAttribute('data-ready-ai-duplicate-owner');
    root.removeAttribute('data-ready-ai-duplicate-reason');
  } catch (_) {}
  return true;
}
function shouldYieldToReadyAiSteeringHost(host) {
  if (!host || host === steeringHost) return false;
  const myId = getReadyAiExtensionId();
  let ownerId = '';
  try {
    ownerId = String(host.getAttribute('data-ready-ai-extension-id') || host.dataset?.readyAiExtensionId || '');
  } catch (_) {
    ownerId = '';
  }
  if (ownerId && ownerId === myId) return false;
  if (isReadyAiCanonicalExtension()) return false;
  return true;
}
function stampReadyAiSteeringHost(host) {
  if (!host) return;
  try {
    host.setAttribute('data-ready-ai-extension-id', getReadyAiExtensionId());
    host.setAttribute('data-ready-ai-content-version', READY_AI_CONTENT_BUILD_VERSION);
  } catch (_) {}
}
try {
  globalThis.__ReadyAiContentInstanceSeq = (Number(globalThis.__ReadyAiContentInstanceSeq) || 0) + 1;
} catch (_) {}
function getReadyAiContentInstanceSeq() {
  try {
    return Number(globalThis.__ReadyAiContentInstanceSeq) || 0;
  } catch (_) {
    return 0;
  }
}
function isReadyAiCurrentContentInstance(instanceSeq) {
  const current = getReadyAiContentInstanceSeq();
  return !current || !instanceSeq || current === Number(instanceSeq);
}
try {
  var existingSteeringHost = document.getElementById('ready-ai-steering-host');
  if (existingSteeringHost) existingSteeringHost.remove();
} catch (_) {}
var steeringHost = null;
var steeringRoot = null;
var steeringRefs = null;
var steeringPanelOpen = false;
var STEERING_STORAGE_KEYS = Object.freeze({
  ENABLED: 'steeringEnabled',
  THEME: 'steeringTheme',
  LAUNCHER_VISIBLE: 'steeringLauncherVisible',
  AUTO_FOCUS_INPUT: 'steeringAutoFocusInput',
  CLOSE_AFTER_SEND: 'steeringCloseAfterSend',
  QUEUE_COUNT_VISIBLE: 'steeringQueueCountVisible',
  TEMPLATES: 'steeringTemplates',
  ADVANCED_ENABLED: 'steeringAdvancedEnabled',
  NEW_CHAT_TAB_COUNT: 'steeringNewChatTabCount',
});
var TITLE_BADGE_STORAGE_KEYS = Object.freeze({
  ENABLED: 'titleBadgeEnabled',
  COUNT_ENABLED: 'titleBadgeCountEnabled',
});
var CUSTOM_TAB_TITLE_MAX_LENGTH = 80;
var STEERING_THEME = Object.freeze({
  DARK: 'dark',
  LIGHT: 'light',
});
var steeringEnabled = true;
var readyAiEnabled = true;
var steeringTheme = STEERING_THEME.DARK;
var steeringLauncherVisible = true;
var steeringAutoFocusInput = true;
var steeringCloseAfterSend = false;
var steeringQueueCountVisible = true;
var steeringTemplates = [];
var steeringAdvancedEnabled = false;
var steeringNewChatTabCount = 3;
var titleBadgeEnabled = true;
var titleBadgeCountEnabled = true;
var customTabTitle = '';
var lastCustomTabTitle = '';
var nativePageTitle = '';
var titleSyncObserver = null;
var titleSyncApplyTimer = null;
var titleSyncMuted = false;
var titleSyncQueued = false;
var titleSyncQueuedForce = false;
var titleBadgeStabilityTimer = null;
var titleBadgeStabilityUntil = 0;
var titleGuardInstallRequested = false;
var titleGuardInstallInFlight = false;
var titleGuardInstalled = false;
var titleGuardInstallRetryTimer = null;
var titleGuardBridgeBound = false;
var titleGuardStateSignature = '';
var titleGuardStateSeq = 0;
var titleGuardLastAckSeq = 0;
var titleGuardStateRetryTimer = null;
var titleGuardStateRetryUntil = 0;
var titleGuardVersion = 0;
var titleBadgeLastLoopSyncAt = 0;
var titleBadgeLastUiSyncAt = 0;
var titleBadgeLastUiSyncSignature = '';
var chatGptLightTitleBadgeTimer = null;
var chatGptLightTitleBadgeBurstTimers = [];
var chatGptLightTitleBadgeKeepAliveTimer = null;
var chatGptLightTitleObserver = null;
var chatGptLightTitleObserverQueued = false;
var chatGptLightTitleBadgeTriggersBound = false;
var chatGptLightCompletionWatchTimer = null;
var chatGptLightGenerationStartedAt = 0;
var chatGptLightGenerationWatchUntil = 0;
var steeringQueue = [];
var steeringQueueSeq = 1;
var steeringQueueDragState = null;
var steeringQueueDragPreviousUserSelect = '';
var steeringAutoSendTimer = null;
var steeringSendLock = false;
var steeringSendLockTimer = null;
var steeringProcessing = false;
var steeringLastRuntimeEnqueueSignature = '';
var steeringLastRuntimeEnqueueAt = 0;
var STEERING_RUNTIME_ENQUEUE_DEDUPE_MS = 1200;
var STEERING_QUEUE_DISPATCH_LOCK_MS = 45000;
var STEERING_ATTACHMENT_LIMIT = 8;
var STEERING_FILE_MAX_BYTES = 50 * 1024 * 1024;
var STEERING_IMAGE_LIMIT = STEERING_ATTACHMENT_LIMIT; // 기존 내부 호출 호환용
var STEERING_IMAGE_MAX_BYTES = STEERING_FILE_MAX_BYTES;
var STEERING_IMAGE_OPTIMIZE_TARGET_BYTES = 6 * 1024 * 1024;
var STEERING_IMAGE_OPTIMIZE_MAX_DIMENSION = 2400;
var steeringAttachments = [];
var steeringAttachmentSeq = 1;
var steeringPreviewAttachmentId = null;
var steeringSuppressAcknowledgeUntil = 0;
var steeringLastReportedQueueCount = null;
var steeringLastCompletionAt = 0;
var steeringAwaitingResponseStart = false;
var steeringAwaitingResponseTimer = null;
var steeringAwaitingTurnCompletion = false;
var steeringObservedGenerationSinceSend = false;
var steeringChatGptAssistantBaseline = null;
var steeringChatGptAssistantObservedAt = 0;
var steeringChatGptAssistantFinalizedAt = 0;
var steeringTurnCompletionWatchdogTimer = null;
var steeringTurnCompletionWatchdogStartedAt = 0;
var steeringAttachmentRenderSignature = '';
var steeringQueueRenderSignature = '';
var steeringPreviewRenderSignature = '';
var steeringTemplateRenderSignature = '';
var steeringUiRafId = 0;
var steeringOverlayObserver = null;
var steeringOverlayRafId = 0;
var steeringLastPositionSignature = '';
var steeringAppliedThemeSignature = '';
var steeringConversationTurnsCacheAt = 0;
var steeringConversationTurnsCacheValue = false;
var steeringDraftText = '';
var steeringNewChatSendPending = false;
var steeringSessionSiteKey = '';
var steeringQueueEditingId = null;
var steeringQueueEditingText = '';
var steeringDragActive = false;
var steeringDragHideTimer = null;
var steeringDropPointerGuardUntil = 0;
var steeringStateRestoring = false;
var steeringSessionRestoreSeq = 0;
var steeringSessionStorageFailed = false;
var steeringRestoredQueuePaused = false;
var steeringSessionSaveTimer = null;
var steeringSessionSaveTail = Promise.resolve();
var steeringSessionSavedSignature = '';
var steeringSessionFileCache = new WeakMap();
var steeringSessionLastSavedAt = 0;
var steeringChatGptSubmissionUncertain = false;
var steeringConversationScope = getSteeringConversationScope();
var steeringConversationSessionToken = crypto.randomUUID();
var steeringConversationSessions = globalThis.__ReadyAiConversationSessions || new Map();
globalThis.__ReadyAiConversationSessions = steeringConversationSessions;
var steeringConversationStartPendingUntil = 0;
function getSteeringConversationScope(url = location.href) {
  if (!isChatGptSafeMode()) return 'site';
  const path = new URL(url).pathname;
  const match = path.match(/\/c\/([^/]+)/);
  return match ? `conversation:${match[1]}` : `draft:${path}`;
}
async function waitForSteeringConversationView(state, scope) {
  if (!isChatGptSafeMode()) return true;
  const expected = state?.viewUser;
  const deadline = Date.now() + 5000;
  while (Date.now() <= deadline) {
    if (getSteeringConversationScope() !== scope) return false;
    const current = getChatGptUserTurnSnapshot();
    if (scope.startsWith('draft:') && current.count === 0) return true;
    if (!scope.startsWith('draft:') && (!expected?.identity || current.identity === expected.identity)) return true;
    await waitForSteeringTick(100);
  }
  return false;
}
function syncSteeringConversationScope() {
  if (!IS_TOP_FRAME || !isChatGptSafeMode() || !monitoring) return false;
  const next = getSteeringConversationScope();
  if (next === steeringConversationScope) return false;
  const state = steeringStateRestoring ? null : captureSteeringSessionState();
  if (state && steeringConversationScope.startsWith('draft:') && next.startsWith('conversation:')
    && (steeringProcessing || steeringAwaitingTurnCompletion || Date.now() < steeringConversationStartPendingUntil)) {
    // The first real submission assigns an ID to this same new conversation.
    persistSteeringSessionState({ ...state, queue: [], attachments: [], draft: '', editingId: null, editingText: '' }).catch(() => {});
    steeringConversationSessions.delete(steeringConversationScope);
    steeringConversationScope = next;
    state.scope = next;
    steeringConversationSessions.set(next, state);
    scheduleSteeringSessionSave();
    return false;
  }
  if (state) {
    steeringConversationSessions.set(steeringConversationScope, state);
    persistSteeringSessionState().catch(() => {});
  }
  clearSteeringAutoSendTimer();
  clearSteeringSendLock();
  clearChatGptLightCompletionWatch();
  clearSteeringAwaitingResponseStart();
  clearSteeringTurnCompletionWait();
  steeringConversationScope = next;
  steeringConversationSessionToken = crypto.randomUUID();
  steeringConversationStartPendingUntil = 0;
  steeringQueue = [];
  steeringQueueSeq = 1;
  steeringAttachments = [];
  steeringQueueEditingId = null;
  steeringQueueEditingText = '';
  steeringRestoredQueuePaused = false;
  steeringProcessing = false;
  steeringSessionStorageFailed = false;
  steeringSessionSavedSignature = '';
  isGenerating = false;
  completionStatus = 'idle';
  steeringConversationTurnsCacheAt = 0;
  setSteeringDraftText('', { syncInput: true });
  restoreSteeringSessionState({ conversationSwitch: true });
  updateSteeringUi();
  return true;
}
function requestSteeringSessionStorage(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('대기 저장 연결 시간이 초과되었습니다.')), 10000);
    try {
      chrome.runtime.sendMessage({ action, platform: steeringSessionSiteKey || getSiteKey(), scope: steeringConversationScope, ...payload }, (response) => {
        clearTimeout(timer);
        const error = chrome.runtime.lastError;
        if (error || !response?.ok) reject(new Error(error?.message || response?.message || '대기 목록을 저장하지 못했습니다.'));
        else resolve(response);
      });
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}
function captureSteeringSessionState() {
  return {
    queue: steeringQueue.map((item) => ({ ...item, files: getSteeringQueueAttachments(item).slice(), images: undefined })),
    queueSeq: steeringQueueSeq,
    draft: String(steeringRefs?.input?.value ?? steeringDraftText ?? ''),
    attachments: steeringAttachments.slice(),
    attachmentSeq: steeringAttachmentSeq,
    panelOpen: steeringPanelOpen,
    siteKey: steeringSessionSiteKey,
    scope: steeringConversationScope,
    sessionToken: steeringConversationSessionToken,
    viewUser: isChatGptSafeMode() ? getChatGptUserTurnSnapshot() : null,
    paused: steeringRestoredQueuePaused || steeringProcessing,
    awaiting: steeringAwaitingTurnCompletion,
    observed: steeringObservedGenerationSinceSend,
    baseline: steeringChatGptAssistantBaseline,
    observedAt: steeringChatGptAssistantObservedAt,
    finalizedAt: steeringChatGptAssistantFinalizedAt,
    generating: isGenerating,
    startedAt: chatGptLightGenerationStartedAt,
    watchUntil: chatGptLightGenerationWatchUntil,
    editingId: steeringQueueEditingId,
    editingText: steeringQueueEditingText,
  };
}
function getSteeringSessionSignature(state) {
  const files = (list) => list.map((item) => [item.name, item.size, item.type, getSteeringFileIdentity(item.file)]);
  return JSON.stringify([state.scope, state.queue.map((item) => [item.id, item.text, !!item.holdForFirstChatGptTurn, files(item.files)]), state.draft, files(state.attachments), state.editingId, state.editingText, state.paused, !!state.panelOpen]);
}
async function saveSteeringSessionFile(item, scope = steeringConversationScope, platform = steeringSessionSiteKey || getSiteKey()) {
  const file = item.file;
  let cached = steeringSessionFileCache.get(file);
  if (cached?.scope === scope && cached?.platform === platform) return cached;
  const fileId = crypto.randomUUID();
  const chunkSize = 1024 * 1024;
  const chunks = Math.max(1, Math.ceil(file.size / chunkSize));
  for (let index = 0; index < chunks; index += 1) {
    const bytes = new Uint8Array(await file.slice(index * chunkSize, (index + 1) * chunkSize).arrayBuffer());
    let binary = '';
    for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
    await requestSteeringSessionStorage('steering_session_file_put', { scope, platform, fileId, chunkIndex: index, data: btoa(binary) });
  }
  cached = { fileId, chunks, scope, platform, name: item.name || file.name, type: item.type || file.type, size: file.size, lastModified: file.lastModified || 0, isImage: !!item.isImage };
  steeringSessionFileCache.set(file, cached);
  return cached;
}
async function saveSteeringSessionSnapshot(state, instanceSeq) {
  if (!isReadyAiCurrentContentInstance(instanceSeq)) return false;
  const signature = getSteeringSessionSignature(state);
  if (state.scope === steeringConversationScope && signature === steeringSessionSavedSignature) return true;
  const queue = [];
  for (const item of state.queue) {
    const files = [];
    for (const file of item.files) files.push(await saveSteeringSessionFile(file, state.scope, state.siteKey));
    queue.push({ ...item, files, images: undefined });
  }
  const attachments = [];
  for (const file of state.attachments) attachments.push(await saveSteeringSessionFile(file, state.scope, state.siteKey));
  if (!isReadyAiCurrentContentInstance(instanceSeq)) return false;
  steeringSessionLastSavedAt = Math.max(Date.now(), steeringSessionLastSavedAt + 1);
  await requestSteeringSessionStorage('steering_session_save', {
    scope: state.scope, platform: state.siteKey,
    state: { ...state, queue, attachments, savedAt: steeringSessionLastSavedAt },
  });
  if (state.scope === steeringConversationScope) steeringSessionSavedSignature = signature;
  return true;
}
function persistSteeringSessionState(snapshot = null) {
  if (!IS_TOP_FRAME || steeringStateRestoring || steeringSessionStorageFailed || !monitoring) return Promise.resolve(false);
  const state = snapshot || captureSteeringSessionState();
  const instanceSeq = getReadyAiContentInstanceSeq();
  const pending = steeringSessionSaveTail.then(() => saveSteeringSessionSnapshot(state, instanceSeq));
  // Keep subsequent saves working after a temporary storage/context error.
  steeringSessionSaveTail = pending.catch(() => {});
  return pending;
}
function scheduleSteeringSessionSave() {
  if (!IS_TOP_FRAME || !monitoring || steeringStateRestoring || steeringSessionSaveTimer) return;
  steeringSessionSaveTimer = setTimeout(() => {
    steeringSessionSaveTimer = null;
    persistSteeringSessionState().catch(() => setSteeringStatus('대기 목록 저장 실패: 현재 탭을 유지하고 다시 시도해 주세요.', true));
  }, 120);
}
async function loadSteeringSessionFile(saved, scope = steeringConversationScope, platform = steeringSessionSiteKey || getSiteKey()) {
  const parts = [];
  for (let index = 0; index < saved.chunks; index += 1) {
    const response = await requestSteeringSessionStorage('steering_session_file_get', { scope, platform, fileId: saved.fileId, chunkIndex: index });
    const binary = atob(response.data);
    parts.push(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  }
  const file = new File(parts, saved.name, { type: saved.type, lastModified: saved.lastModified });
  if (file.size !== saved.size) throw new Error('첨부파일 복구가 완료되지 않았습니다.');
  steeringSessionFileCache.set(file, saved);
  return { ...saved, id: steeringAttachmentSeq++, file, previewUrl: saved.isImage ? URL.createObjectURL(file) : '' };
}
function applyRecoveredSteeringSession(state, live = false) {
  // Keep this visit's token: an old send may finish after A -> B -> A.
  steeringQueue = state.queue || [];
  steeringQueueSeq = Math.max(state.queueSeq || 1, ...steeringQueue.map((item) => Number(item.id) + 1));
  steeringAttachments = state.attachments || [];
  steeringAttachmentSeq = Math.max(steeringAttachmentSeq, state.attachmentSeq || 1);
  steeringPanelOpen = !!state.panelOpen;
  steeringSessionSiteKey = state.siteKey || getSiteKey();
  steeringRestoredQueuePaused = live ? !!state.paused : steeringQueue.length > 0;
  steeringQueueEditingId = state.editingId ?? null;
  steeringQueueEditingText = state.editingText || '';
  setSteeringDraftText(state.draft || '', { syncInput: true });
  if (live && state.awaiting) {
    steeringAwaitingTurnCompletion = true;
    steeringObservedGenerationSinceSend = !!state.observed;
    steeringChatGptAssistantBaseline = state.baseline;
    steeringChatGptAssistantObservedAt = state.observedAt || 0;
    steeringChatGptAssistantFinalizedAt = state.finalizedAt || 0;
    isGenerating = !!state.generating;
    chatGptLightGenerationStartedAt = state.startedAt || Date.now();
    chatGptLightGenerationWatchUntil = state.watchUntil || 0;
    armSteeringTurnCompletionWatchdog();
    if (isChatGptSafeMode()) scheduleChatGptLightCompletionWatch();
  }
  updateSteeringUi();
}
async function restoreSteeringSessionState(options = {}) {
  if (!IS_TOP_FRAME) return;
  const restoreSeq = ++steeringSessionRestoreSeq;
  const instanceSeq = getReadyAiContentInstanceSeq();
  const scope = steeringConversationScope;
  const isCurrent = () => isReadyAiCurrentContentInstance(instanceSeq)
    && steeringConversationScope === scope && steeringSessionRestoreSeq === restoreSeq;
  const live = globalThis.__ReadyAiRecoveredSession;
  globalThis.__ReadyAiRecoveredSession = null;
  if (live && live.siteKey === getSiteKey() && (!live.scope || live.scope === scope)) {
    applyRecoveredSteeringSession(live, true);
    return;
  }
  steeringStateRestoring = true;
  updateSteeringUi();
  try {
    const memoryState = steeringConversationSessions.get(scope);
    const response = memoryState ? { state: memoryState } : await requestSteeringSessionStorage('steering_session_load', { scope });
    const state = response.state;
    if (!state) return;
    if (!isCurrent()) return;
    // Keep the recovered list visible and read-only while file chunks load.
    applyRecoveredSteeringSession(state, !!memoryState);
    setSteeringStatus('대기 목록과 첨부파일을 복구하는 중입니다.');
    const queue = [];
    for (const item of state.queue || []) {
      const files = [];
      for (const saved of item.files || []) files.push(saved.file ? saved : await loadSteeringSessionFile(saved, scope, state.siteKey));
      queue.push({ ...item, files, images: files });
    }
    const attachments = [];
    for (const saved of state.attachments || []) attachments.push(saved.file ? saved : await loadSteeringSessionFile(saved, scope, state.siteKey));
    if (!isCurrent()) return;
    if (options.conversationSwitch && !await waitForSteeringConversationView(state, scope)) state.paused = true;
    if (!isCurrent()) return;
    applyRecoveredSteeringSession({ ...state, queue, attachments }, !!memoryState);
    setSteeringStatus(queue.length ? (memoryState && !state.paused ? '이 대화의 후속 대기를 이어갑니다.' : '이 대화의 대기를 복구했습니다. 확인 후 ‘다음 보내기’를 눌러 주세요.') : '이 대화의 작성 내용을 복구했습니다.');
  } catch (_) {
    if (isCurrent()) {
      steeringSessionStorageFailed = true;
      setSteeringStatus('대기 목록 복구 실패: 페이지를 다시 연결해 주세요. 저장된 목록은 유지합니다.', true);
    }
  } finally {
    if (isCurrent()) {
      steeringStateRestoring = false;
      updateSteeringUi();
      if (options.conversationSwitch && !steeringRestoredQueuePaused) scheduleSteeringQueueProcessing(STEERING_AUTO_SEND_DELAY_MS);
    }
  }
}
function setSteeringTextIfChanged(el, value) {
  if (!el) return;
  const nextValue = String(value ?? '');
  if (el.textContent !== nextValue) el.textContent = nextValue;
}
function setSteeringValueIfChanged(el, value) {
  if (!el) return;
  const nextValue = String(value ?? '');
  if (String(el.value ?? '') !== nextValue) el.value = nextValue;
}
function setSteeringDisplayIfChanged(el, value) {
  if (!el) return;
  const nextValue = String(value || '');
  if (el.style.display !== nextValue) el.style.display = nextValue;
}
function setSteeringDisabledIfChanged(el, disabled) {
  if (!el) return;
  const nextValue = !!disabled;
  if (el.disabled !== nextValue) el.disabled = nextValue;
}
function setSteeringCheckedIfChanged(el, checked) {
  if (!el) return;
  const nextValue = !!checked;
  if (el.checked !== nextValue) el.checked = nextValue;
}
function setSteeringDatasetIfChanged(el, key, value) {
  if (!el || !key) return;
  const nextValue = String(value ?? '');
  if (el.dataset[key] !== nextValue) el.dataset[key] = nextValue;
}
function setSteeringClassToggleIfChanged(el, className, enabled) {
  if (!el || !className) return;
  const nextValue = !!enabled;
  if (el.classList.contains(className) !== nextValue) el.classList.toggle(className, nextValue);
}
function setSteeringDraftText(value, options = {}) {
  steeringDraftText = String(value || '');
  if (options.syncInput && steeringRefs?.input && String(steeringRefs.input.value || '') !== steeringDraftText) {
    try { steeringRefs.input.value = steeringDraftText; } catch (_) {}
  }
}
function syncSteeringDraftFromInput() {
  setSteeringDraftText(steeringRefs?.input?.value || '');
}
function restoreSteeringDraftToInput() {
  const input = steeringRefs?.input;
  if (!input) return;
  const desired = String(steeringDraftText || '');
  const current = String(input.value || '');
  if (current === desired) return;
  const inputActive = steeringRoot?.activeElement === input;
  if (inputActive && current) return;
  try { input.value = desired; } catch (_) {}
}
function isSteeringTargetNode(target) {
  if (!target) return false;
  if (target === steeringHost) return true;
  try {
    if (steeringHost?.contains?.(target)) return true;
  } catch (_) {}
  try {
    if (target?.getRootNode?.() === steeringRoot) return true;
  } catch (_) {}
  return false;
}
function setSteeringDragActive(active) {
  const next = !!active;
  if (steeringDragHideTimer) {
    try { clearTimeout(steeringDragHideTimer); } catch (_) {}
    steeringDragHideTimer = null;
  }
  if (next) {
    steeringDragActive = true;
    steeringRefs?.attachmentWrap?.classList.add('dragging');
    if (steeringRefs?.dropShield) steeringRefs.dropShield.hidden = false;
    return;
  }
  steeringDragHideTimer = setTimeout(() => {
    steeringDragActive = false;
    steeringRefs?.attachmentWrap?.classList.remove('dragging');
    if (steeringRefs?.dropShield) steeringRefs.dropShield.hidden = true;
    steeringDragHideTimer = null;
  }, 60);
}
function armSteeringDropPointerGuard(duration = 360) {
  steeringDropPointerGuardUntil = Date.now() + Math.max(120, Number(duration) || 0);
}
function suppressFollowupPointerAfterSteeringDrop(event) {
  if (Date.now() > steeringDropPointerGuardUntil) return;
  if (isSteeringTargetNode(event?.target)) return;
  try { event.preventDefault(); } catch (_) {}
  try { event.stopPropagation(); } catch (_) {}
  try { event.stopImmediatePropagation?.(); } catch (_) {}
}
function getSteeringQueueEditingItem() {
  if (steeringQueueEditingId == null) return null;
  return steeringQueue.find((item) => item?.id === steeringQueueEditingId) || null;
}
function beginSteeringQueueEdit(itemId) {
  const item = steeringQueue.find((entry) => entry?.id === itemId);
  if (!item) return false;
  steeringQueueEditingId = item.id;
  steeringQueueEditingText = String(item.text || '');
  updateSteeringUi();
  return true;
}
function syncSteeringQueueEditDraft(value) {
  steeringQueueEditingText = String(value || '');
}
function cancelSteeringQueueEdit(options = {}) {
  const hadEdit = steeringQueueEditingId != null;
  steeringQueueEditingId = null;
  steeringQueueEditingText = '';
  if (hadEdit && !options.silent) updateSteeringUi();
  return hadEdit;
}
function commitSteeringQueueEdit() {
  const item = getSteeringQueueEditingItem();
  if (!item) return false;
  const nextText = String(steeringQueueEditingText || '').trim();
  steeringQueue = steeringQueue.map((entry) => entry?.id === item.id ? { ...entry, text: nextText } : entry);
  cancelSteeringQueueEdit({ silent: true });
  setSteeringStatus(nextText ? '대기를 수정했습니다.' : (getSteeringItemAttachmentCount(item) ? '파일 첨부 대기를 수정했습니다.' : '빈 대기로 변경했습니다.'));
  updateSteeringUi();
  return true;
}
function syncSteeringQueueEditState() {
  if (steeringQueueEditingId == null) return;
  const item = getSteeringQueueEditingItem();
  if (item) return;
  steeringQueueEditingId = null;
  steeringQueueEditingText = '';
}
function resetSteeringSessionState(nextSiteKey = '') {
  steeringQueue = [];
  steeringRestoredQueuePaused = false;
  steeringLastReportedQueueCount = null;
  steeringProcessing = false;
  steeringPanelOpen = false;
  steeringQueueEditingId = null;
  steeringQueueEditingText = '';
  steeringConversationTurnsCacheAt = 0;
  steeringConversationTurnsCacheValue = false;
  clearSteeringTurnCompletionWait();
  setSteeringDraftText('');
  clearSteeringDraftAttachments({ keepFileInputValue: true });
  try { if (steeringRefs?.input) steeringRefs.input.value = ''; } catch (_) {}
  steeringSessionSiteKey = String(nextSiteKey || '');
}
function suppressComposerAcknowledge(ms = 1200) {
  steeringSuppressAcknowledgeUntil = Date.now() + Math.max(0, ms);
}
function isComposerAcknowledgeSuppressed() {
  return Date.now() < steeringSuppressAcknowledgeUntil;
}
function normalizeSteeringTheme(value) {
  return String(value || '').trim().toLowerCase() === STEERING_THEME.LIGHT ? STEERING_THEME.LIGHT : STEERING_THEME.DARK;
}
function normalizeSteeringNewChatTabCount(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(8, parsed));
}
function truncateSteeringText(value, max = 80) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}
function normalizeSteeringTemplate(item, index = 0) {
  if (typeof item === 'string') {
    const text = String(item || '').trim();
    if (!text) return null;
    return {
      id: `tpl_${index}_${text.slice(0, 16)}`,
      name: truncateSteeringText(`템플릿 ${index + 1}`, 24),
      text,
      tooltip: '',
    };
  }
  if (!item || typeof item !== 'object') return null;
  const text = String(item.text ?? item.content ?? '').trim();
  if (!text) return null;
  return {
    id: String(item.id || `tpl_${index}_${Date.now()}`),
    name: truncateSteeringText(item.name ?? item.title ?? item.label ?? `템플릿 ${index + 1}`, 24),
    text,
    tooltip: truncateSteeringText(item.tooltip ?? item.note ?? item.description ?? '', 160),
  };
}
function normalizeSteeringTemplates(list) {
  if (!Array.isArray(list)) return [];
  return list.map((item, index) => normalizeSteeringTemplate(item, index)).filter(Boolean).slice(0, 20);
}
function getSteeringTemplateTooltip(template) {
  const parts = [];
  const name = String(template?.name || '').trim();
  const tooltip = String(template?.tooltip || '').trim();
  const text = String(template?.text || '').trim();
  if (name) parts.push(name);
  if (tooltip) parts.push(tooltip);
  if (text) parts.push(`문구: ${text}`);
  return parts.join('\n');
}
function loadSteeringPrefs(cb) {
  try {
    chrome.storage.local.get([
      STEERING_STORAGE_KEYS.ENABLED,
      STEERING_STORAGE_KEYS.THEME,
      STEERING_STORAGE_KEYS.LAUNCHER_VISIBLE,
      STEERING_STORAGE_KEYS.AUTO_FOCUS_INPUT,
      STEERING_STORAGE_KEYS.CLOSE_AFTER_SEND,
      STEERING_STORAGE_KEYS.QUEUE_COUNT_VISIBLE,
      STEERING_STORAGE_KEYS.TEMPLATES,
      STEERING_STORAGE_KEYS.ADVANCED_ENABLED,
      STEERING_STORAGE_KEYS.NEW_CHAT_TAB_COUNT,
      TITLE_BADGE_STORAGE_KEYS.ENABLED,
      TITLE_BADGE_STORAGE_KEYS.COUNT_ENABLED,
    ], (res) => {
      steeringEnabled = typeof res?.[STEERING_STORAGE_KEYS.ENABLED] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.ENABLED] : true;
      steeringTheme = normalizeSteeringTheme(res?.[STEERING_STORAGE_KEYS.THEME]);
      steeringLauncherVisible = typeof res?.[STEERING_STORAGE_KEYS.LAUNCHER_VISIBLE] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.LAUNCHER_VISIBLE] : true;
      steeringAutoFocusInput = typeof res?.[STEERING_STORAGE_KEYS.AUTO_FOCUS_INPUT] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.AUTO_FOCUS_INPUT] : true;
      steeringCloseAfterSend = typeof res?.[STEERING_STORAGE_KEYS.CLOSE_AFTER_SEND] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.CLOSE_AFTER_SEND] : false;
      steeringQueueCountVisible = typeof res?.[STEERING_STORAGE_KEYS.QUEUE_COUNT_VISIBLE] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.QUEUE_COUNT_VISIBLE] : true;
      steeringTemplates = normalizeSteeringTemplates(res?.[STEERING_STORAGE_KEYS.TEMPLATES]);
      steeringAdvancedEnabled = typeof res?.[STEERING_STORAGE_KEYS.ADVANCED_ENABLED] === 'boolean' ? !!res[STEERING_STORAGE_KEYS.ADVANCED_ENABLED] : false;
      steeringNewChatTabCount = normalizeSteeringNewChatTabCount(res?.[STEERING_STORAGE_KEYS.NEW_CHAT_TAB_COUNT]);
      titleBadgeEnabled = typeof res?.[TITLE_BADGE_STORAGE_KEYS.ENABLED] === 'boolean' ? !!res[TITLE_BADGE_STORAGE_KEYS.ENABLED] : true;
      titleBadgeCountEnabled = typeof res?.[TITLE_BADGE_STORAGE_KEYS.COUNT_ENABLED] === 'boolean' ? !!res[TITLE_BADGE_STORAGE_KEYS.COUNT_ENABLED] : true;
      cb?.();
    });
  } catch (_) {
    steeringEnabled = true;
    steeringTheme = STEERING_THEME.DARK;
    steeringLauncherVisible = true;
    steeringAutoFocusInput = true;
    steeringCloseAfterSend = false;
    steeringQueueCountVisible = true;
    steeringTemplates = [];
    steeringAdvancedEnabled = false;
    steeringNewChatTabCount = 3;
    titleBadgeEnabled = true;
    titleBadgeCountEnabled = true;
    cb?.();
  }
}
