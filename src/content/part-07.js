function createFileListFromFiles(files) {
  const dt = new DataTransfer();
  for (const file of files) {
    try { dt.items.add(file); } catch (_) {}
  }
  return dt.files;
}
function findAttachmentRevealButton(composer) {
  const scopes = [getComposerSubmitForm(composer), composer?.parentElement, composer?.closest?.('[data-testid], [role="group"], [role="presentation"], form, section, main, article, div') || null, document];
  let best = null;
  let bestScore = -999;
  for (const scope of scopes) {
    if (!scope || typeof scope.querySelectorAll !== 'function') continue;
    const buttons = Array.from(scope.querySelectorAll('button, [role="button"]'));
    for (const btn of buttons) {
      if (!btn || !isVisible(btn) || !isEnabledButtonLike(btn)) continue;
      const hay = `${btn.getAttribute?.('aria-label') || ''} ${btn.getAttribute?.('title') || ''} ${btn.getAttribute?.('data-testid') || ''} ${btn.textContent || ''}`.toLowerCase();
      if (!/(attach|upload|image|photo|gallery|file|첨부|업로드|이미지|사진)/.test(hay)) continue;
      if (/(send|전송|stop|중지|cancel|abort|voice|mic)/.test(hay)) continue;
      let score = 0;
      if (/(attach|첨부)/.test(hay)) score += 4;
      if (/(upload|업로드|file|document|첨부|파일)/.test(hay)) score += 4;
      if (/(image|photo|gallery|이미지|사진)/.test(hay)) score += 2;
      if (/(plus|add|추가)/.test(hay)) score += 1;
      if (score > bestScore) {
        best = btn;
        bestScore = score;
      }
    }
    if (best && bestScore >= 4) return best;
  }
  return bestScore >= 4 ? best : null;
}
async function attachSteeringFilesViaFileInput(composer, attachmentItems) {
  if (!Array.isArray(attachmentItems) || !attachmentItems.length) return { ok: true, attachedCount: 0, message: '' };
  const files = attachmentItems.map((item) => item?.file).filter((file) => isSteeringAttachmentFile(file));
  if (!files.length) return { ok: true, attachedCount: 0, message: '' };
  let input = findNearbyFileInput(composer, files);
  if (!input) {
    const revealButton = findAttachmentRevealButton(composer);
    if (revealButton) {
      try { revealButton.click(); } catch (_) {}
      await waitForSteeringTick(180);
      input = findNearbyFileInput(composer, files);
    }
  }
  if (!input) {
    return { ok: false, attachedCount: 0, message: '이 사이트에서 파일 업로드 입력을 찾지 못했습니다.' };
  }
  const usableFiles = input.multiple ? files : files.slice(0, 1);
  let fileList;
  try { fileList = createFileListFromFiles(usableFiles); } catch (_) { fileList = null; }
  if (!fileList || !fileList.length) {
    return { ok: false, attachedCount: 0, message: '파일 목록을 만들지 못했습니다.' };
  }
  try { input.files = fileList; } catch (_) {
    return { ok: false, attachedCount: 0, message: '파일을 업로드 입력에 넣지 못했습니다.' };
  }
  try { input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true })); } catch (_) {}
  try { input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true })); } catch (_) {}
  await waitForSteeringTick(220);
  return {
    ok: true,
    attachedCount: usableFiles.length,
    message: usableFiles.length < files.length ? `파일 ${usableFiles.length}개만 업로드했습니다.` : `파일 ${usableFiles.length}개 업로드 준비됨`,
  };
}
async function attachSteeringImagesViaFileInput(composer, imageItems) {
  return attachSteeringFilesViaFileInput(composer, imageItems);
}
function getSteeringAttachmentUploadScope(composer) {
  const form = getComposerSubmitForm(composer);
  if (form && isVisible(form)) return form;
  try {
    const scope = composer?.closest?.('[data-testid], [role="group"], [role="presentation"], form, section, main, article, div');
    if (scope && isVisible(scope)) return scope;
  } catch (_) {}
  return document;
}
function hasSteeringPendingUploadIndicator(scope) {
  if (!scope || typeof scope.querySelectorAll !== 'function') return false;
  const indicatorSelectors = [
    '[role="progressbar"]',
    'progress',
    '[aria-busy="true"]',
    '[data-testid*="upload"]',
    '[data-testid*="progress"]',
    '[class*="uploading"]',
    '[class*="progress"]',
    '[class*="spinner"]',
    '[class*="loading"]',
  ];
  for (const selector of indicatorSelectors) {
    const nodes = Array.from(scope.querySelectorAll(selector));
    if (nodes.some((node) => isVisible(node))) return true;
  }
  const textSelectors = ['[role="status"]', '[role="alert"]', '[aria-live]', 'button', 'span', 'div'];
  const pendingTextRe = /(uploading|processing|preparing|analyzing|rendering|업로드 중|처리 중|준비 중|분석 중|렌더링 중)/i;
  const nodes = Array.from(scope.querySelectorAll(textSelectors.join(','))).slice(0, 180);
  for (const node of nodes) {
    if (!isVisible(node)) continue;
    const hay = `${node.getAttribute?.('aria-label') || ''} ${node.getAttribute?.('title') || ''} ${node.textContent || ''}`.trim();
    if (!hay) continue;
    if (pendingTextRe.test(hay)) return true;
  }
  return false;
}
function getSteeringAttachmentUploadState(composer) {
  const scope = getSteeringAttachmentUploadScope(composer);
  const sendButton = findNearbySendButton(composer) || findNearbySendButtonAnyState(composer) || getActiveSendButton(composer);
  const sendFound = !!sendButton;
  const sendEnabled = !!(sendButton && isEnabledButtonLike(sendButton));
  const pending = hasSteeringPendingUploadIndicator(scope);
  return { scope, sendButton, sendFound, sendEnabled, pending };
}
async function waitForSteeringAttachmentUploadReady(composer, options = {}) {
  const timeout = Math.max(2500, Number(options.timeout) || 18000);
  const minWait = Math.max(320, Number(options.minWait) || 520);
  const settleWindow = Math.max(360, Number(options.settleWindow) || 620);
  const startedAt = Date.now();
  let lastBusyAt = startedAt;
  let sawPending = false;
  let sawDisabledSend = false;
  while (Date.now() - startedAt <= timeout) {
    try { maybeRescanShadowRoots(); } catch (_) {}
    const state = getSteeringAttachmentUploadState(composer);
    if (state.pending) {
      sawPending = true;
      lastBusyAt = Date.now();
    }
    if (state.sendFound && !state.sendEnabled) {
      sawDisabledSend = true;
      lastBusyAt = Date.now();
    }
    const elapsed = Date.now() - startedAt;
    const settledFor = Date.now() - lastBusyAt;
    const ready = elapsed >= minWait && settledFor >= settleWindow && !state.pending && (!state.sendFound || state.sendEnabled);
    if (ready) {
      return {
        ok: true,
        waitedMs: elapsed,
        sawPending,
        sawDisabledSend,
      };
    }
    await waitForSteeringTick((state.pending || (state.sendFound && !state.sendEnabled)) ? 150 : 110);
  }
  return {
    ok: false,
    retryable: true,
    message: sawPending || sawDisabledSend ? '파일 업로드가 아직 끝나지 않았습니다.' : '파일 업로드 완료 상태를 확인하지 못했습니다.',
    waitedMs: Date.now() - startedAt,
    sawPending,
    sawDisabledSend,
  };
}
async function waitForSteeringComposerText(composer, expectedText, timeoutMs = 1500) {
  const normalize = (value) => String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const expected = normalize(expectedText);
  const deadline = Date.now() + Math.max(300, Number(timeoutMs) || 1500);
  let current = '';
  while (Date.now() <= deadline) {
    try {
      current = normalize(getCurrentComposerText(composer));
      if (current === expected) return { ok: true, current };
    } catch (_) {}
    await waitForSteeringTick(90);
  }
  try { current = normalize(getCurrentComposerText(composer)); } catch (_) {}
  return { ok: current === expected, current };
}
function requestChatGptNativeImmediateSteer(text, timeoutMs = 5200) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        const root = document.documentElement;
        root?.setAttribute?.('data-ready-ai-last-immediate-ok', result?.ok ? 'true' : 'false');
        root?.setAttribute?.('data-ready-ai-last-immediate-route', String(result?.route || result?.attempted?.slice?.(-1)?.[0] || 'none'));
        root?.setAttribute?.('data-ready-ai-last-immediate-debug', String(result?.debugKeys?.join?.('|') || '').slice(0, 900));
        root?.setAttribute?.('data-ready-ai-last-immediate-attempts', String(result?.attempted?.join?.('|') || '').slice(0, 1400));
        root?.setAttribute?.('data-ready-ai-last-immediate-handlers', String(result?.handlerDebug?.join?.('|') || '').slice(0, 1800));
        root?.setAttribute?.('data-ready-ai-last-immediate-views', String(result?.viewDebug?.join?.('|') || '').slice(0, 1800));
        root?.setAttribute?.('data-ready-ai-last-immediate-pm', String(result?.pmDebug?.join?.('|') || '').slice(0, 1800));
        root?.setAttribute?.('data-ready-ai-last-immediate-composer', String(result?.composerText || '').slice(0, 240));
        root?.setAttribute?.('data-ready-ai-last-immediate-href', String(result?.href || '').slice(0, 320));
      } catch (_) {}
      resolve(result || { ok: false, message: '즉시 반영 결과를 확인하지 못했습니다.' });
    };
    const timer = setTimeout(() => finish({ ok: false, message: 'Ctrl+Enter 즉시 반영 확인 시간이 초과되었습니다.' }), Math.max(3200, Number(timeoutMs) || 5200));
    try {
      chrome.runtime.sendMessage({ action: 'chatgpt_native_immediate_steer', text: String(text || '') }, (response) => {
        try { clearTimeout(timer); } catch (_) {}
        try {
          if (chrome.runtime.lastError) {
            finish({ ok: false, message: chrome.runtime.lastError.message || '즉시 반영 요청을 보내지 못했습니다.' });
            return;
          }
        } catch (_) {}
        finish(response);
      });
    } catch (err) {
      try { clearTimeout(timer); } catch (_) {}
      finish({ ok: false, message: err?.message || '즉시 반영 요청을 보내지 못했습니다.' });
    }
  });
}
function requestGoogleNativeSteer(text, timeoutMs = 9000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        document.documentElement?.setAttribute?.('data-ready-ai-last-google-steer-stage', String(result?.stage || result?.route || 'none'));
        document.documentElement?.setAttribute?.('data-ready-ai-last-google-steer-result', result?.ok ? 'ok' : 'fail');
        document.documentElement?.setAttribute?.('data-ready-ai-last-google-steer-after', String(result?.after || '').slice(0, 240));
        document.documentElement?.setAttribute?.('data-ready-ai-last-google-background-build', String(result?.readyAiBackgroundBuildVersion || 'unknown'));
      } catch (_) {}
      resolve(result || { ok: false, sent: false, retryable: true, message: 'Google AI 전송 결과를 확인하지 못했습니다.' });
    };
    const timer = setTimeout(() => finish({ ok: false, sent: false, retryable: true, message: 'Google AI 실제 입력 경로 확인 시간이 초과되었습니다.' }), Math.max(15000, Number(timeoutMs) || 15000));
    try {
      chrome.runtime.sendMessage({ action: 'google_native_steer', text: String(text || '') }, (response) => {
        try { clearTimeout(timer); } catch (_) {}
        try {
          if (chrome.runtime.lastError) {
            finish({ ok: false, sent: false, retryable: true, message: chrome.runtime.lastError.message || 'Google AI 실제 입력 요청을 보내지 못했습니다.' });
            return;
          }
        } catch (_) {}
        finish(response || { ok: false, sent: false, retryable: true, message: 'Google AI 실제 입력 요청 결과를 받지 못했습니다.' });
      });
    } catch (err) {
      try { clearTimeout(timer); } catch (_) {}
      finish({ ok: false, sent: false, retryable: true, message: err?.message || 'Google AI 실제 입력 요청을 보내지 못했습니다.' });
    }
  });
}
function getVisibleChatGptStopButton() {
  const selector = typeof CHATGPT_STOP_SELECTOR === 'string'
    ? CHATGPT_STOP_SELECTOR
    : '[data-testid="stop-button"],button[aria-label*="Stop"],button[aria-label*="stop"],button[aria-label*="중지"],button[data-testid*="stop"]';
  let candidates = [];
  try { candidates = Array.from(document.querySelectorAll(selector)).slice(-8); } catch (_) { candidates = []; }
  return candidates.find((candidate) => isVisible(candidate)) || null;
}
async function waitForChatGptUserTurnText(text, beforeCount, timeoutMs = 2200) {
  const expected = String(text || '').trim();
  if (!expected || typeof countRecentChatGptUserTurnText !== 'function') return false;
  const deadline = Date.now() + Math.max(400, Number(timeoutMs) || 2200);
  while (Date.now() <= deadline) {
    if (countRecentChatGptUserTurnText(expected) > beforeCount) return true;
    await waitForSteeringTick(70);
  }
  return countRecentChatGptUserTurnText(expected) > beforeCount;
}
async function waitForChatGptComposerSubmissionStart(composer, text, options = {}) {
  const expected = String(text || '').trim();
  const beforeCount = Math.max(0, Number(options.beforeCount) || 0);
  const sendButton = options.sendButton || null;
  const wasGenerating = !!options.wasGenerating;
  const timeoutMs = Math.max(400, Number(options.timeoutMs) || 1900);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    try {
      if (typeof countRecentChatGptUserTurnText === 'function' && countRecentChatGptUserTurnText(expected) > beforeCount) return true;
    } catch (_) {}
    try {
      if (composer?.isConnected === false) return true;
      const currentText = String(getCurrentComposerText(composer) || '').trim();
      if (expected && currentText !== expected) return true;
    } catch (_) {}
    try {
      if (sendButton?.isConnected === false || (sendButton && !isEnabledButtonLike(sendButton))) return true;
    } catch (_) {}
    if (!wasGenerating) {
      try {
        if (detectChatGptGeneratingLight()) return true;
      } catch (_) {}
    }
    await waitForSteeringTick(70);
  }
  return false;
}
async function sendChatGptImmediateViaStableControls(composer, text, timeoutMs = 6200, options = {}) {
  const expected = String(text || '').trim();
  if (!composer || !expected) return { ok: false, sent: false, retryable: false };
  const deadline = Date.now() + Math.max(2600, Number(timeoutMs) || 6200);
  const interruptExistingGeneration = options.interruptExistingGeneration !== false;
  let interrupted = false;
  let submitAttempts = 0;
  while (Date.now() <= deadline) {
    const stopButton = getVisibleChatGptStopButton();
    if (stopButton && interruptExistingGeneration) {
      if (!interrupted && isEnabledButtonLike(stopButton)) {
        try { stopButton.click(); interrupted = true; } catch (_) {}
      }
      await waitForSteeringTick(80);
      continue;
    }
    const liveComposer = composer?.isConnected !== false && isVisible(composer)
      ? composer
      : (getActiveComposer() || composer);
    const currentText = String(getCurrentComposerText(liveComposer) || '').trim();
    if (currentText !== expected) {
      setControlValue(liveComposer, expected);
      const ready = await waitForSteeringComposerText(liveComposer, expected, 700);
      if (!ready.ok) {
        await waitForSteeringTick(100);
        continue;
      }
    }
    const beforeCount = typeof countRecentChatGptUserTurnText === 'function'
      ? countRecentChatGptUserTurnText(expected)
      : 0;
    let wasGenerating = false;
    try { wasGenerating = !!detectChatGptGeneratingLight(); } catch (_) {}
    const sendButton = findNearbySendButton(liveComposer) || getActiveSendButton(liveComposer);
    let triggered = false;
    if (sendButton) {
      if (!isEnabledButtonLike(sendButton)) {
        await waitForSteeringTick(100);
        continue;
      }
      try { sendButton.click(); triggered = true; } catch (_) { triggered = false; }
    } else {
      triggered = requestSubmitComposer(liveComposer);
      if (!triggered) triggered = dispatchSubmitKey(liveComposer);
    }
    if (triggered) {
      submitAttempts += 1;
      if (await waitForChatGptComposerSubmissionStart(liveComposer, expected, {
        beforeCount,
        sendButton,
        wasGenerating,
        timeoutMs: 1900,
      })) {
        return {
          ok: true,
          sent: true,
          immediate: true,
          route: interrupted ? 'chatgpt_interrupt_then_send' : 'chatgpt_generation_finished_then_send',
          message: interrupted ? '현재 작업을 조정해 즉시 반영했습니다.' : '바로 전송했습니다.',
        };
      }
      if (submitAttempts >= 2) break;
    }
    await waitForSteeringTick(120);
  }
  const liveComposer = composer?.isConnected !== false && isVisible(composer)
    ? composer
    : (getActiveComposer() || composer);
  if (String(getCurrentComposerText(liveComposer) || '').trim() !== expected) {
    setControlValue(liveComposer, expected);
    await waitForSteeringComposerText(liveComposer, expected, 700);
  }
  return {
    ok: false,
    sent: false,
    retryable: true,
    message: 'ChatGPT 전송 버튼이 안정화되지 않아 Ctrl+Enter 지시를 입력창에 보존했습니다.',
  };
}
async function sendSteeringPromptText(text, options = {}) {
  const sessionToken = steeringConversationSessionToken;
  const instanceSeq = getReadyAiContentInstanceSeq();
  if (!monitoring || !readyAiEnabled) return { ok: false, sent: false, message: 'Ready_AI 사용을 멈췄습니다. 대기는 유지합니다.' };
  steeringChatGptSubmissionUncertain = false;
  const composer = getActiveComposer();
  if (!composer) {
    return { ok: false, sent: false, retryable: true, message: '입력창이 아직 준비되지 않았습니다.' };
  }
  const files = (Array.isArray(options.files) ? options.files : (Array.isArray(options.images) ? options.images : [])).filter((item) => item?.file);
  if (files.length) {
    setSteeringStatus(`파일 ${files.length}개 업로드 준비 중...`);
    const attached = await attachSteeringFilesViaFileInput(composer, files);
    if (!attached.ok) {
      return { ok: false, sent: false, retryable: false, message: attached.message || '파일을 업로드하지 못했습니다.' };
    }
    setSteeringStatus(attached.message || `파일 ${files.length}개 업로드 대기 중`);
    const uploadReady = await waitForSteeringAttachmentUploadReady(composer, { fileCount: files.length });
    if (!uploadReady.ok) {
      return {
        ok: false,
        sent: false,
        retryable: !!uploadReady.retryable,
        message: uploadReady.message || '파일 업로드가 끝날 때까지 기다리는 중입니다.',
      };
    }
    setSteeringStatus(text ? '파일 업로드 완료 · 문구 전송 중' : '파일 업로드 완료 · 전송 중');
  }
  if (!monitoring || !readyAiEnabled || sessionToken !== steeringConversationSessionToken || !isReadyAiCurrentContentInstance(instanceSeq)) return { ok: false, sent: false, message: '대화 또는 사용 상태가 변경되어 대기를 유지합니다.' };
  suppressComposerAcknowledge(1700);
  const existingText = options.replaceComposerText ? '' : getCurrentComposerText(composer);
  const mergedText = mergeSteeringText(existingText, text);
  const siteKey = getSiteKey();
  if (siteKey === 'gemini' || siteKey === 'aistudio') {
    if (!mergedText && !files.length) {
      return { ok: false, sent: false, message: '보낼 내용이 없습니다.' };
    }
    if (siteKey === 'aistudio') armAiStudioGenerationProbeBurst();
    const googleResult = await requestGoogleNativeSteer(mergedText, Math.max(16000, Number(options.submitStartTimeoutMs) || 0));
    if (googleResult?.ok && googleResult?.sent) return googleResult;
    // Gemini sometimes paints/enables its send button a moment after an image
    // response completes.  The main-world route may have already populated the
    // editor, so finish that exact submission without rewriting the draft.
    const expected = String(mergedText || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const fallbackDeadline = Date.now() + 2600;
    while (Date.now() <= fallbackDeadline) {
      const liveComposer = getActiveComposer() || composer;
      const current = String(getCurrentComposerText(liveComposer) || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      if (current !== expected) break;
      const sendButton = getActiveSendButton() || findNearbySendButton(liveComposer);
      if (sendButton && isEnabledButtonLike(sendButton)) {
        const sent = await tryTriggerComposerSend(liveComposer, () => {
          try { sendButton.click(); return true; } catch (_) { return false; }
        }, { submitStartTimeoutMs: 2400, ignoreExistingGeneration: !!options.ignoreExistingGeneration });
        if (sent) return { ok: true, sent: true, route: 'google_delayed_send_button', message: '전송했습니다.' };
      }
      await waitForSteeringTick(120);
    }
    return googleResult;
  }
  if (mergedText) {
    const filled = setControlValue(composer, mergedText);
    if (!filled) {
      return { ok: false, sent: false, message: '입력창에 지시를 넣지 못했습니다.' };
    }
    let textReady = await waitForSteeringComposerText(composer, mergedText, 1500);
    if (!textReady.ok) {
      setControlValue(composer, mergedText);
      textReady = await waitForSteeringComposerText(composer, mergedText, 1900);
      if (!textReady.ok) {
        return { ok: false, sent: false, message: '입력창에 지시를 안정적으로 반영하지 못했습니다.' };
      }
    }
    await waitForSteeringTick(140);
  } else if (!files.length) {
    return { ok: false, sent: false, message: '보낼 내용이 없습니다.' };
  } else {
    await waitForSteeringTick(180);
  }
  if (options.requireNativeImmediateSteer && getSiteKey() === 'chatgpt') {
    return await sendChatGptImmediateViaStableControls(
      composer,
      mergedText,
      Math.max(4200, Number(options.nativeImmediateTimeoutMs) || 6200)
    );
  }
  const buttonFirstAttempts = [
    () => {
      const btn = findNearbySendButton(composer) || getActiveSendButton(composer);
      if (!btn) return false;
      try { btn.click(); return true; } catch (_) { return false; }
    },
    () => {
      const btn = findNearbySendButton(composer);
      if (!btn) return false;
      try { btn.click(); return true; } catch (_) { return false; }
    },
    () => requestSubmitComposer(composer),
    () => dispatchSubmitKey(composer),
    () => dispatchSubmitKey(composer, { ctrlKey: true }),
    () => dispatchSubmitKey(composer, { metaKey: true }),
  ];
  const shortcutFirstAttempts = [
    () => dispatchSubmitKey(composer, { ctrlKey: true }),
    () => dispatchSubmitKey(composer, { metaKey: true }),
    buttonFirstAttempts[0],
    buttonFirstAttempts[1],
    () => requestSubmitComposer(composer),
    () => dispatchSubmitKey(composer),
  ];
  const attempts = options.preferKeyboardShortcut ? shortcutFirstAttempts : buttonFirstAttempts;
  for (const attempt of attempts) {
    if (!monitoring || !readyAiEnabled || sessionToken !== steeringConversationSessionToken || !isReadyAiCurrentContentInstance(instanceSeq)) return { ok: false, sent: false, message: '대화 또는 사용 상태가 변경되어 대기를 유지합니다.' };
    if (mergedText) {
      const currentText = String(getCurrentComposerText(composer) || '').trim();
      if (currentText !== String(mergedText || '').trim()) {
        setControlValue(composer, mergedText);
        await waitForSteeringComposerText(composer, mergedText, 1200);
      }
    }
    const sent = await tryTriggerComposerSend(composer, attempt, {
      submitStartTimeoutMs: options.submitStartTimeoutMs,
      ignoreExistingGeneration: !!options.ignoreExistingGeneration,
    });
    if (sent) {
      return { ok: true, sent: true, message: '전송했습니다.' };
    }
    if (steeringChatGptSubmissionUncertain) {
      return { ok: false, sent: false, uncertain: true, message: '전송 확인이 지연되어 대기를 보존했습니다. 대화에서 전송 여부를 확인해 주세요.' };
    }
  }
  return { ok: false, sent: false, message: '전송 경로를 모두 시도했지만 전송하지 못했습니다.' };
}
async function sendSteeringItemImmediately(item, options = {}) {
  const sessionToken = steeringConversationSessionToken;
  const instanceSeq = getReadyAiContentInstanceSeq();
  if (steeringStateRestoring || steeringSessionStorageFailed) return false;
  if (!monitoring || !steeringEnabled) {
    setSteeringStatus('후속 지시 기능이 꺼져 있습니다.', true);
    return false;
  }
  clearSteeringAutoSendTimer();
  if (steeringProcessing) {
    setSteeringStatus('앞선 전송을 마무리한 뒤 Ctrl+Enter를 바로 실행합니다.');
    const processingDeadline = Date.now() + 6200;
    while (steeringProcessing && Date.now() <= processingDeadline) {
      await waitForSteeringTick(70);
    }
    if (sessionToken !== steeringConversationSessionToken || !isReadyAiCurrentContentInstance(instanceSeq)) return false;
    if (steeringProcessing) {
      setSteeringStatus('앞선 전송이 아직 끝나지 않아 Ctrl+Enter 지시를 입력창에 보존했습니다.', true);
      return false;
    }
  }
  const text = String(item?.text || '').trim();
  const files = getSteeringQueueAttachments(item);
  if (!text && !files.length) {
    setSteeringStatus('바로 반영할 지시나 파일을 준비해주세요.', true);
    return false;
  }
  let generatingNow = false;
  try {
    maybeRescanShadowRoots();
    generatingNow = !!(activeSite && detectGenerating(activeSite));
  } catch (_) {
    generatingNow = !!isGenerating;
  }
  let dispatchToken = acquireSteeringQueueDispatchLock(options.source || 'steer_now');
  const dispatchDeadline = Date.now() + 1400;
  while (!dispatchToken && Date.now() <= dispatchDeadline) {
    await waitForSteeringTick(70);
    dispatchToken = acquireSteeringQueueDispatchLock(options.source || 'steer_now');
  }
  if (!dispatchToken) {
    setSteeringStatus('전송 잠금이 풀리지 않아 Ctrl+Enter 지시를 입력창에 보존했습니다.', true);
    return false;
  }
  steeringProcessing = true;
  setSteeringStatus(generatingNow ? '현재 작업에 바로 반영 중...' : '바로 전송 중...');
  updateSteeringUi();
  try {
    if (!generatingNow || !steeringChatGptAssistantBaseline) captureSteeringChatGptAssistantBaseline();
    const result = await sendSteeringPromptText(text, {
      files,
      ignoreExistingGeneration: generatingNow,
      preferKeyboardShortcut: !!options.preferKeyboardShortcut || !!(
        generatingNow
        && options.source === 'queued_steer_now'
        && getSiteKey() === 'chatgpt'
      ),
      requireNativeImmediateSteer: !!(
        generatingNow
        && getSiteKey() === 'chatgpt'
        && (
          options.source === 'queued_steer_now'
          || options.source === 'draft_steer_now'
          || options.source === 'native_chatgpt_composer_steer_now'
        )
      ),
      nativeImmediateTimeoutMs: 5200,
      submitStartTimeoutMs: Math.max(700, Number(options.submitStartTimeoutMs) || (generatingNow ? 4200 : 3500)),
    });
    if (sessionToken !== steeringConversationSessionToken || !isReadyAiCurrentContentInstance(instanceSeq)) return false;
    if (!result?.ok || !result?.sent) {
      if (result?.uncertain) steeringRestoredQueuePaused = true;
      if (!generatingNow) clearSteeringChatGptAssistantObservation();
      setSteeringStatus(result?.message || '바로 반영하지 못했습니다.', true);
      updateSteeringUi();
      return false;
    }
    if (options.queueItemId != null) {
      steeringQueue = steeringQueue.filter((queued) => queued?.id !== options.queueItemId);
      syncSteeringQueueEditState();
    }
    if (options.clearDraft) {
      // Sending can take a few hundred milliseconds on Google AI.  Do not let
      // the completion of an older send erase a follow-up the user typed while
      // that request was in flight.
      const liveDraftText = String(steeringRefs?.input?.value || '');
      if (liveDraftText.trim() === text) {
        setSteeringDraftText('');
        try { if (steeringRefs?.input) steeringRefs.input.value = ''; } catch (_) {}
      } else {
        setSteeringDraftText(liveDraftText);
      }
      const draftAttachmentsUnchanged = steeringAttachments.length === files.length
        && steeringAttachments.every((attachment, index) => attachment?.file === files[index]?.file);
      if (draftAttachmentsUnchanged) clearSteeringDraftAttachments();
    }
    clearSteeringCompletionOffer();
    steeringAwaitingTurnCompletion = true;
    steeringObservedGenerationSinceSend = generatingNow;
    if (generatingNow) clearSteeringAwaitingResponseStart();
    else armSteeringAwaitingResponseStart();
    armSteeringTurnCompletionWatchdog();
    armSteeringSendLock();
    if (isChatGptSafeMode()) setChatGptLightGenerating(true, { observed: generatingNow });
    setSteeringStatus(generatingNow ? '현재 작업에 반영했습니다.' : '바로 전송했습니다.');
    updateSteeringUi();
    return true;
  } finally {
    releaseSteeringQueueDispatchLock(dispatchToken);
    if (sessionToken === steeringConversationSessionToken && isReadyAiCurrentContentInstance(instanceSeq)) {
      steeringProcessing = false;
      updateSteeringUi();
    }
  }
}
async function sendSteeringDraftImmediately() {
  const refs = ensureSteeringUi();
  const text = String(refs?.input?.value || '').trim();
  const files = cloneSteeringAttachmentsForQueue();
  return await sendSteeringItemImmediately({ text, files, images: files }, {
    source: 'draft_steer_now',
    clearDraft: true,
  });
}
async function sendSteeringQueueItemImmediately(itemId) {
  const item = steeringQueue.find((queued) => queued?.id === itemId);
  if (!item) {
    setSteeringStatus('선택한 대기 항목을 찾지 못했습니다.', true);
    return false;
  }
  return await sendSteeringItemImmediately(item, {
    source: 'queued_steer_now',
    queueItemId: item.id,
  });
}
function hasLikelySteeringSubmissionStarted() {
  try {
    if (activeSite && detectGenerating(activeSite)) return true;
  } catch (_) {}
  const composer = getActiveComposer();
  if (!composer) return false;
  try {
    return !String(getCurrentComposerText(composer) || '').trim();
  } catch (_) {
    return false;
  }
}
function hasChatGptRateLimitNotice() {
  if (getSiteKey() !== 'chatgpt') return false;
  try {
    const text = String(document.body?.innerText || document.documentElement?.innerText || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return /(요청이\s*너무\s*많|너무\s*빠르게\s*보내|일시적으로\s*제한|몇\s*분\s*후\s*다시|too\s*many\s*requests|sending\s*requests\s*too\s*fast|temporarily\s*limited|rate\s*limit)/i.test(text);
  } catch (_) {
    return false;
  }
}
function finalizeDirectSteeringSend(source) {
  clearSteeringCompletionOffer();
  if (monitoring) {
    steeringAwaitingTurnCompletion = true;
    steeringObservedGenerationSinceSend = false;
    armSteeringAwaitingResponseStart();
    armSteeringTurnCompletionWatchdog();
    armSteeringSendLock();
    if (isChatGptSafeMode()) setChatGptLightGenerating(true, { observed: false });
  } else {
    clearSteeringTurnCompletionWait();
    clearSteeringAwaitingResponseStart();
    clearSteeringSendLock();
  }
  setSteeringStatus(source === 'new_chat_tab' ? '새 채팅에 전송했습니다.' : '전송했습니다.');
  setSteeringDraftText('');
  try { if (steeringRefs?.input) steeringRefs.input.value = ''; } catch (_) {}
  updateSteeringUi();
  return { ok: true, sent: true, message: '전송했습니다.' };
}
async function sendSteeringPromptTextWhenReady(text, options = {}) {
  const value = String(text || '').trim();
  if (!value) return { ok: false, sent: false, message: '보낼 내용이 없습니다.' };
  const timeoutMs = Math.max(5000, Number(options.timeoutMs) || 45000);
  const deadline = Date.now() + timeoutMs;
  const skipReadinessGate = !!options.skipReadinessGate || options.source === 'new_chat_tab';
  let attempt = 0;
  let lastMessage = '';
  while (Date.now() <= deadline) {
    if (hasChatGptRateLimitNotice()) {
      return {
        ok: false,
        sent: false,
        retryable: false,
        rateLimited: true,
        message: 'ChatGPT 요청 제한이 감지되었습니다. 잠시 후 다시 시도해 주세요.',
      };
    }
    if (!steeringEnabled) {
      return { ok: false, sent: false, message: '후속 지시 기능이 꺼져 있습니다.' };
    }
    try { maybeRescanShadowRoots(); } catch (_) {}
    if (!skipReadinessGate && monitoring && !canAutoSendSteeringNow()) {
      lastMessage = '전송 가능 상태를 기다리는 중입니다.';
    } else {
      const result = await sendSteeringPromptText(value, {
        files: [],
        images: [],
        replaceComposerText: options.source === 'new_chat_tab',
        submitStartTimeoutMs: Math.max(1200, Number(options.submitStartTimeoutMs) || 3500),
      });
      lastMessage = result?.message || '';
      if (result?.ok && result?.sent) {
        return finalizeDirectSteeringSend(options.source);
      }
      if (/전송 경로/.test(lastMessage)) {
        await waitForSteeringTick(700);
        if (hasLikelySteeringSubmissionStarted()) {
          return finalizeDirectSteeringSend(options.source);
        }
      }
    }
    attempt += 1;
    const delay = Math.min(2200, 350 + attempt * 180);
    await waitForSteeringTick(delay);
  }
  return {
    ok: false,
    sent: false,
    retryable: true,
    message: lastMessage || '새 채팅 탭 전송 준비 시간이 초과되었습니다.',
  };
}
async function processSteeringQueue(options = {}) {
  const sessionToken = steeringConversationSessionToken;
  const instanceSeq = getReadyAiContentInstanceSeq();
  if (!monitoring || !steeringEnabled) return false;
  if (steeringStateRestoring || steeringSessionStorageFailed) return false;
  if (!steeringQueue.length) return false;
  if (steeringProcessing) return false;
  const allowHeldFirstTurn = options.source === 'resume_button';
  if (shouldHoldSteeringQueueHeadForFirstChatGptTurn({ allowHeldFirstTurn })) return false;
  const dispatchToken = acquireSteeringQueueDispatchLock(options.source || 'queue');
  if (!dispatchToken) return false;
  const allowGoogleIdle = options.source === 'resume_button' || options.source === 'manual';
  if (!canAutoSendSteeringNow({ allowGoogleIdle })) {
    releaseSteeringQueueDispatchLock(dispatchToken);
    return false;
  }
  const current = steeringQueue[0];
  if (!current?.text && !getSteeringItemAttachmentCount(current)) {
    current.retryCount = 0;
    steeringQueue = steeringQueue.slice(1);
    syncSteeringQueueEditState();
    updateSteeringUi();
    releaseSteeringQueueDispatchLock(dispatchToken);
    return false;
  }
  steeringProcessing = true;
  updateSteeringUi();
  try {
    if (!await persistSteeringSessionState() || !monitoring || !readyAiEnabled || sessionToken !== steeringConversationSessionToken || !isReadyAiCurrentContentInstance(instanceSeq)) return false;
    captureSteeringChatGptAssistantBaseline();
    const result = await sendSteeringPromptText(current.text, { files: getSteeringQueueAttachments(current) });
    if (sessionToken !== steeringConversationSessionToken || !isReadyAiCurrentContentInstance(instanceSeq)) return false;
    if (!result.ok || !result.sent) {
      if (result.uncertain) steeringRestoredQueuePaused = true;
      clearSteeringChatGptAssistantObservation();
      if (result.retryable) {
        current.retryCount = Math.max(0, Number(current.retryCount) || 0) + 1;
        if (current.retryCount <= 6) {
          setSteeringStatus(`${result.message || '전송 준비 대기 중'} · 재시도 ${current.retryCount}`);
          scheduleSteeringQueueProcessing(Math.min(4200, 900 + current.retryCount * 550));
        } else {
          setSteeringStatus(result.message || '전송 준비가 오래 걸리고 있습니다. 페이지가 열린 뒤 다시 전송해 주세요.', true);
        }
      } else {
        setSteeringStatus(result.message || '전송하지 못했습니다.', true);
      }
      updateSteeringUi();
      return false;
    }
    steeringQueue = steeringQueue.filter((item) => item.id !== current.id);
    syncSteeringQueueEditState();
    clearSteeringCompletionOffer();
    steeringAwaitingTurnCompletion = true;
    steeringObservedGenerationSinceSend = false;
    armSteeringAwaitingResponseStart();
    armSteeringTurnCompletionWatchdog();
    armSteeringSendLock();
    if (isChatGptSafeMode()) setChatGptLightGenerating(true, { observed: false });
    setSteeringStatus(options.source === 'auto' ? '자동 전송했습니다.' : '전송했습니다.');
    if (steeringCloseAfterSend) steeringPanelOpen = false;
    updateSteeringUi();
    return true;
  } finally {
    releaseSteeringQueueDispatchLock(dispatchToken);
    if (sessionToken === steeringConversationSessionToken && isReadyAiCurrentContentInstance(instanceSeq)) {
      steeringProcessing = false;
      updateSteeringUi();
    }
  }
}
async function resumeSteeringQueueNow(options = {}) {
  if (!monitoring || !steeringEnabled) return false;
  if (steeringStateRestoring || steeringSessionStorageFailed) return false;
  const forceResume = !!options.force || options.source === 'resume_button';
  if (!steeringQueue.length) {
    setSteeringStatus('전송할 대기열이 없습니다.', true);
    updateSteeringUi();
    return false;
  }
  if (steeringProcessing) {
    setSteeringStatus('전송 처리 중입니다.');
    updateSteeringUi();
    return false;
  }
  try { maybeRescanShadowRoots(); } catch (_) {}
  let generatingNow = false;
  try {
    generatingNow = !!(activeSite && detectGenerating(activeSite));
  } catch (_) {
    generatingNow = false;
  }
  if (generatingNow) {
    isGenerating = true;
    completionStatus = 'idle';
    markSteeringGenerationObserved();
    armSteeringTurnCompletionWatchdog(getSteeringTurnWatchdogDelayMs());
    setSteeringStatus('아직 답변 중입니다. 완료되면 다음 지시를 보냅니다.');
    updateTitleBadge();
    updateSteeringUi();
    return false;
  }
  if (!forceResume && steeringAwaitingResponseStart && !isSteeringTurnWatchdogMature()) {
    if (!steeringTurnCompletionWatchdogStartedAt) armSteeringTurnCompletionWatchdog(getSteeringTurnWatchdogDelayMs());
    scheduleCheck(true);
    setSteeringStatus('방금 보낸 답변 시작을 확인 중입니다.');
    updateSteeringUi();
    return false;
  }
  if (!forceResume && holdChatGptUnobservedSteeringTurn('resume')) return false;
  clearSteeringAutoSendTimer();
  clearSteeringSendLock();
  clearSteeringAwaitingResponseStart();
  clearSteeringTurnCompletionWait();
  isGenerating = false;
  steeringRestoredQueuePaused = false;
  if (completionStatus === 'completed') completionStatus = 'idle';
  setSteeringStatus(options.source === 'resume_button' ? '즉시 재개합니다.' : '대기열 전송을 재개합니다.');
  updateTitleBadge();
  updateSteeringUi();
  return await processSteeringQueue({ source: options.source || 'manual' });
}
function submitSteeringInputToNewChats() {
  const refs = ensureSteeringUi();
  const text = String(refs?.input?.value || '').trim();
  const fileCount = getSteeringDraftAttachmentCount();
  const getRequestFailureMessage = (errorMessage) => {
    const message = String(errorMessage || '').trim();
    if (/extension context invalidated|context invalidated|receiving end does not exist|could not establish connection|message port closed/i.test(message)) {
      return '확장프로그램이 새로고침되어 현재 탭 연결이 끊겼습니다. 이 ChatGPT 탭을 새로고침한 뒤 다시 시도해 주세요.';
    }
    return message || '새 채팅 탭 전송 요청에 실패했습니다.';
  };
  const finishPending = () => {
    steeringNewChatSendPending = false;
    updateSteeringUi();
  };
  if (!steeringAdvancedEnabled) {
    setSteeringStatus('고급설정을 먼저 켜주세요.', true);
    return false;
  }
  if (steeringNewChatSendPending) {
    setSteeringStatus('새 채팅 탭 전송 요청을 처리 중입니다.');
    return false;
  }
  if (!text) {
    setSteeringStatus('새 채팅으로 보낼 문구를 입력해주세요.', true);
    try { refs?.input?.focus(); } catch (_) {}
    return false;
  }
  if (fileCount > 0) {
    setSteeringStatus('새 채팅 탭 전송은 텍스트만 지원합니다. 파일 첨부는 현재 대화로 전송해 주세요.', true);
    return false;
  }
  const count = normalizeSteeringNewChatTabCount(refs?.newChatCount?.value || steeringNewChatTabCount);
  steeringNewChatTabCount = count;
  try {
    chrome.storage.local.set({ [STEERING_STORAGE_KEYS.NEW_CHAT_TAB_COUNT]: count });
  } catch (_) {}
  steeringNewChatSendPending = true;
  setSteeringStatus(`열린 ChatGPT 탭을 확인하는 중... 요청 ${count}개`);
  updateSteeringUi();
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      setSteeringStatus(getRequestFailureMessage('context invalidated'), true);
      finishPending();
      return false;
    }
    chrome.runtime.sendMessage({
      action: 'open_chatgpt_new_chat_tabs',
      text,
      count,
      sourceUrl: location.href,
    }, (resp) => {
      if (chrome.runtime.lastError) {
        setSteeringStatus(getRequestFailureMessage(chrome.runtime.lastError.message), true);
        finishPending();
        return;
      }
      if (!resp?.ok) {
        setSteeringStatus(resp?.message || '새 채팅 탭 전송에 실패했습니다.', true);
        finishPending();
        return;
      }
      setSteeringDraftText('');
      try { if (refs?.input) refs.input.value = ''; } catch (_) {}
      setSteeringStatus(resp?.message || `새 ChatGPT 채팅 ${resp.sentCount || count}개에 전송 요청 완료`);
      finishPending();
    });
  } catch (error) {
    setSteeringStatus(getRequestFailureMessage(error?.message), true);
    finishPending();
    return false;
  }
  return true;
}
function refreshSteeringGeneratingStateBeforeQueueSubmit() {
  let generatingNow = !!isGenerating;
  try {
    maybeRescanShadowRoots();
    generatingNow = !!(activeSite && detectGenerating(activeSite));
  } catch (_) {}
  if (!generatingNow) return false;
  clearSteeringAutoSendTimer();
  isGenerating = true;
  completionStatus = 'idle';
  steeringLastCompletionAt = 0;
  markSteeringGenerationObserved();
  armSteeringTurnCompletionWatchdog(getSteeringTurnWatchdogDelayMs());
  ensurePolling(true);
  scheduleCheck(true);
  updateTitleBadge();
  return true;
}
function submitSteeringInput() {
  const refs = ensureSteeringUi();
  const text = String(refs?.input?.value || '').trim();
  const files = cloneSteeringAttachmentsForQueue();
  if (steeringAdvancedEnabled && !files.length) {
    submitSteeringInputToNewChats();
    return;
  }
  if (steeringAdvancedEnabled && files.length) {
    setSteeringStatus('파일 첨부는 현재 대화로 전송합니다.');
  }
  if (!text && !files.length) {
    setSteeringStatus('후속 지시나 파일을 준비해주세요.', true);
    try { refs?.input?.focus(); } catch (_) {}
    return;
  }
  const holdForFirstChatGptTurn = !!(
    getSiteKey() === 'chatgpt'
    && !hasChatGptConversationTurns()
  );
  const generatingNow = refreshSteeringGeneratingStateBeforeQueueSubmit();
  enqueueSteeringPrompt(text, { files, holdForFirstChatGptTurn });
  setSteeringDraftText('');
  try { refs.input.value = ''; } catch (_) {}
  clearSteeringDraftAttachments();
  const canSendNow = !holdForFirstChatGptTurn && !generatingNow && canAutoSendSteeringNow();
  setSteeringStatus(
    holdForFirstChatGptTurn
      ? `${getSteeringQueueCountLabel()} · 첫 질문 전에는 Enter 입력을 전송하지 않습니다.`
      : (canSendNow ? '전송 준비 중' : `${getSteeringQueueCountLabel()}`)
  );
  updateSteeringUi();
  if (!canSendNow) return;
  scheduleSteeringQueueProcessing(0);
}
['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click'].forEach((type) => {
  try { addReadyAiEventListener(document, type, suppressFollowupPointerAfterSteeringDrop, true); } catch (_) {}
});
