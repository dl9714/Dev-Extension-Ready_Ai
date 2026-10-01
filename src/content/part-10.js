var STEERING_UI_MARKUP_TEMPLATE = `
    <div class="dock" data-theme="dark">
      <div class="launcher-row" id="ready-ai-steering-launcher-row">
        <button class="launcher" type="button" id="ready-ai-steering-launcher">
          <span class="dot"></span>
          <span class="launcher-text">
            <span class="launcher-title-row">
              <strong id="ready-ai-steering-launcher-title">후속 지시 열기</strong>
              <span class="launcher-count" id="ready-ai-steering-launcher-count">대기중: 0</span>
            </span>
            <small id="ready-ai-steering-launcher-sub">항상 열어둘 수 있는 후속 지시 패널</small>
          </span>
        </button>
      </div>
      <div class="card" id="ready-ai-steering-card">
        <div class="top">
          <div class="top-main">
            <div class="title-row">
              <div class="title" id="ready-ai-steering-title"></div>
              <div class="meta" id="ready-ai-steering-meta">대기중: 0</div>
            </div>
          </div>
          <div class="maker-credit">Made by 라쿤솜사탕</div>
          <button class="icon-btn" type="button" id="ready-ai-steering-close" aria-label="접기">×</button>
        </div>
        <div class="title-edit-card">
          <div class="title-edit-head">
            <span class="title-edit-label"><span class="title-label-badge" aria-hidden="true">🟢</span><span>크롬 탭 이름변경</span></span>
            <div class="title-meta" id="ready-ai-steering-tab-title-meta">크롬 탭 이름 자동</div>
          </div>
          <div class="title-edit">
            <input class="title-input" id="ready-ai-steering-tab-title-input" type="text" maxlength="80" placeholder="변경할 크롬 탭 이름 입력" />
            <button class="title-btn" type="button" id="ready-ai-steering-tab-title-save">이름 변경</button>
            <button class="title-btn subtle" type="button" id="ready-ai-steering-tab-title-clear">해제</button>
          </div>
        </div>
        <div class="composer-shell">
          <textarea class="input" id="ready-ai-steering-input" placeholder="후속 지시를 입력하세요 · 파일/폴더 드래그 가능"></textarea>
          <div class="shortcut-row" aria-label="후속 지시 단축키 안내">
            <span><kbd>Enter</kbd> 다음 작업으로 대기</span>
            <span><kbd>Enter ×2 / Ctrl/⌘ Enter</kbd> 현재 작업에 바로 반영</span>
          </div>
        </div>
        <div class="drop-shield" id="ready-ai-steering-drop-shield" hidden>여기에 놓으면 파일 첨부</div>
        <div class="template-wrap" id="ready-ai-steering-template-wrap">
          <div class="template-head">
            <div class="template-label">대기 템플릿</div>
            <div class="template-sub" id="ready-ai-steering-template-meta">버튼 클릭 시 바로 대기열에 추가</div>
          </div>
          <div class="template-list" id="ready-ai-steering-template-list"></div>
        </div>
        <div class="attachment-wrap" id="ready-ai-steering-attachment-wrap">
          <div class="attachment-top">
            <div class="attachment-meta-line" id="ready-ai-steering-attachment-meta">PDF·문서·이미지·압축 · 최대 50MB</div>
            <div class="attachment-actions">
              <button class="attachment-btn" type="button" id="ready-ai-steering-add-image">파일 추가</button>
              <button class="attachment-btn" type="button" id="ready-ai-steering-clear-images">파일 비우기</button>
            </div>
          </div>
          <input class="file-input" id="ready-ai-steering-image-file" type="file" multiple />
          <div class="attachment-dropzone" id="ready-ai-steering-attachment-dropzone">
            <strong>파일을 여기로 드롭</strong>
            <span>(폴더 드롭 지원)</span>
          </div>
          <div class="attachment-list" id="ready-ai-steering-attachment-list"></div>
          <div class="attachment-hint" id="ready-ai-steering-attachment-hint"></div>
        </div>
        <div class="actions">
          <button class="btn" type="button" id="ready-ai-steering-primary">후속 대기</button>
          <button class="btn secondary" type="button" id="ready-ai-steering-send-now">바로 반영</button>
          <button class="btn subtle" type="button" id="ready-ai-steering-clear">모두 비우기</button>
        </div>
        <div class="status" id="ready-ai-steering-status"></div>
        <div class="advanced-card" id="ready-ai-steering-advanced-card">
          <div class="advanced-toggle-row">
            <div class="advanced-copy">
              <div class="advanced-title">후속 지시 고급설정</div>
              <div class="advanced-sub">ON이면 새 ChatGPT 채팅 탭으로 분산 전송</div>
            </div>
            <label class="advanced-switch" title="후속 지시 고급설정 켜기/끄기">
              <input type="checkbox" id="ready-ai-steering-advanced-toggle" />
              <span></span>
            </label>
          </div>
          <div class="advanced-body" id="ready-ai-steering-advanced-body">
            <div class="advanced-field-row">
              <label for="ready-ai-steering-new-chat-count">새 채팅 탭 수</label>
              <input id="ready-ai-steering-new-chat-count" type="text" inputmode="numeric" pattern="[1-8]" autocomplete="off" value="3" />
              <button class="advanced-btn" type="button" id="ready-ai-steering-new-chat-send">새 채팅으로 보내기</button>
            </div>
            <div class="advanced-hint">고급설정 ON에서는 텍스트만 새 채팅 탭으로 보냅니다. 파일이 붙어 있으면 Enter가 현재 대화 전송으로 자동 전환됩니다.</div>
          </div>
        </div>
      </div>
      <div class="attachment-preview" id="ready-ai-steering-attachment-preview" hidden>
        <div class="attachment-preview-card">
          <div class="attachment-preview-head">
            <div class="attachment-preview-title" id="ready-ai-steering-attachment-preview-title">첨부 미리보기</div>
            <button class="attachment-preview-close" type="button" id="ready-ai-steering-attachment-preview-close" aria-label="닫기">×</button>
          </div>
          <div class="attachment-preview-body">
            <button class="attachment-preview-nav" type="button" id="ready-ai-steering-attachment-preview-prev">‹</button>
            <img class="attachment-preview-image" id="ready-ai-steering-attachment-preview-image" alt="preview" />
            <div class="attachment-preview-file" id="ready-ai-steering-attachment-preview-file" hidden>
              <div class="attachment-preview-file-icon" id="ready-ai-steering-attachment-preview-file-icon">FILE</div>
              <div class="attachment-preview-file-name" id="ready-ai-steering-attachment-preview-file-name"></div>
              <div class="attachment-preview-file-hint" id="ready-ai-steering-attachment-preview-file-hint"></div>
            </div>
            <button class="attachment-preview-nav" type="button" id="ready-ai-steering-attachment-preview-next">›</button>
          </div>
          <div class="attachment-preview-meta" id="ready-ai-steering-attachment-preview-meta"></div>
        </div>
      </div>
      <div class="queue-wrap" id="ready-ai-steering-queue-wrap">
        <div class="queue-head">
          <div class="queue-label">후속 대기 · 위에서부터 차례로 실행</div>
          <div class="queue-head-actions">
            <button class="queue-head-btn" type="button" id="ready-ai-steering-run-next">다음 보내기</button>
            <button class="queue-head-btn danger" type="button" id="ready-ai-steering-clear-queue">모두 삭제</button>
          </div>
        </div>
        <div class="queue-list" id="ready-ai-steering-queue"></div>
      </div>
    </div>
`;
function reuseExistingSteeringUi() {
  if (!steeringHost || !steeringRoot || !steeringRefs) return null;
  if (!steeringHost.isConnected) {
    try { (document.body || document.documentElement).appendChild(steeringHost); } catch (_) {}
  }
  restoreSteeringDraftToInput();
  applySteeringTheme();
  positionSteeringUi();
  renderSteeringQueue();
  renderSteeringTemplates();
  renderSteeringAttachments();
  syncSteeringAttachmentPreview();
  return steeringRefs;
}
function createSteeringUiHost() {
  if (!claimReadyAiContentOwnership('create_ui')) return false;
  try {
    const staleHost = document.getElementById('ready-ai-steering-host');
    if (staleHost && staleHost !== steeringHost) {
      if (shouldYieldToReadyAiSteeringHost(staleHost)) {
        markReadyAiDuplicateContentInstance('foreign_host');
        return false;
      }
      const staleInput = staleHost.shadowRoot?.getElementById?.('ready-ai-steering-input');
      const staleDraft = String(staleInput?.value || '').trim();
      if (staleDraft && !String(steeringDraftText || '').trim()) setSteeringDraftText(staleInput.value || '');
      staleHost.remove();
    }
  } catch (_) {}
  steeringHost = document.createElement('div');
  steeringHost.id = 'ready-ai-steering-host';
  steeringHost.style.position = 'fixed';
  steeringHost.style.right = '18px';
  steeringHost.style.bottom = '140px';
  steeringHost.style.left = 'auto';
  steeringHost.style.transform = 'none';
  steeringHost.style.zIndex = '2147483647';
  steeringHost.style.pointerEvents = 'none';
  steeringHost.style.display = 'none';
  stampReadyAiSteeringHost(steeringHost);
  steeringRoot = steeringHost.attachShadow({ mode: 'open' });
  steeringRoot.innerHTML = STEERING_UI_STYLE_TEMPLATE_A + STEERING_UI_STYLE_TEMPLATE_B + STEERING_UI_MARKUP_TEMPLATE;
  steeringAppliedThemeSignature = '';
  steeringLastPositionSignature = '';
  return true;
}
function buildSteeringRefs() {
  steeringRefs = {
    dock: steeringRoot.querySelector('.dock'),
    title: steeringRoot.getElementById('ready-ai-steering-title'),
    meta: steeringRoot.getElementById('ready-ai-steering-meta'),
    launcherCount: steeringRoot.getElementById('ready-ai-steering-launcher-count'),
    launcherRow: steeringRoot.getElementById('ready-ai-steering-launcher-row'),
    launcher: steeringRoot.getElementById('ready-ai-steering-launcher'),
    launcherTitle: steeringRoot.getElementById('ready-ai-steering-launcher-title'),
    launcherSub: steeringRoot.getElementById('ready-ai-steering-launcher-sub'),
    card: steeringRoot.getElementById('ready-ai-steering-card'),
    input: steeringRoot.getElementById('ready-ai-steering-input'),
    dropShield: steeringRoot.getElementById('ready-ai-steering-drop-shield'),
    templateWrap: steeringRoot.getElementById('ready-ai-steering-template-wrap'),
    templateMeta: steeringRoot.getElementById('ready-ai-steering-template-meta'),
    templateList: steeringRoot.getElementById('ready-ai-steering-template-list'),
    attachmentWrap: steeringRoot.getElementById('ready-ai-steering-attachment-wrap'),
    attachmentMeta: steeringRoot.getElementById('ready-ai-steering-attachment-meta'),
    attachmentDropzone: steeringRoot.getElementById('ready-ai-steering-attachment-dropzone'),
    attachmentList: steeringRoot.getElementById('ready-ai-steering-attachment-list'),
    attachmentHint: steeringRoot.getElementById('ready-ai-steering-attachment-hint'),
    addImage: steeringRoot.getElementById('ready-ai-steering-add-image'),
    clearAttachments: steeringRoot.getElementById('ready-ai-steering-clear-images'),
    fileInput: steeringRoot.getElementById('ready-ai-steering-image-file'),
    attachmentPreview: steeringRoot.getElementById('ready-ai-steering-attachment-preview'),
    attachmentPreviewTitle: steeringRoot.getElementById('ready-ai-steering-attachment-preview-title'),
    attachmentPreviewImage: steeringRoot.getElementById('ready-ai-steering-attachment-preview-image'),
    attachmentPreviewFile: steeringRoot.getElementById('ready-ai-steering-attachment-preview-file'),
    attachmentPreviewFileIcon: steeringRoot.getElementById('ready-ai-steering-attachment-preview-file-icon'),
    attachmentPreviewFileName: steeringRoot.getElementById('ready-ai-steering-attachment-preview-file-name'),
    attachmentPreviewFileHint: steeringRoot.getElementById('ready-ai-steering-attachment-preview-file-hint'),
    attachmentPreviewMeta: steeringRoot.getElementById('ready-ai-steering-attachment-preview-meta'),
    attachmentPreviewClose: steeringRoot.getElementById('ready-ai-steering-attachment-preview-close'),
    attachmentPreviewPrev: steeringRoot.getElementById('ready-ai-steering-attachment-preview-prev'),
    attachmentPreviewNext: steeringRoot.getElementById('ready-ai-steering-attachment-preview-next'),
    tabTitleInput: steeringRoot.getElementById('ready-ai-steering-tab-title-input'),
    tabTitleSave: steeringRoot.getElementById('ready-ai-steering-tab-title-save'),
    tabTitleClear: steeringRoot.getElementById('ready-ai-steering-tab-title-clear'),
    tabTitlePresets: Array.from(steeringRoot.querySelectorAll('[data-preset-title]')),
    tabTitleBadge: steeringRoot.querySelector('.title-label-badge'),
    tabTitleMeta: steeringRoot.getElementById('ready-ai-steering-tab-title-meta'),
    advancedCard: steeringRoot.getElementById('ready-ai-steering-advanced-card'),
    advancedToggle: steeringRoot.getElementById('ready-ai-steering-advanced-toggle'),
    advancedBody: steeringRoot.getElementById('ready-ai-steering-advanced-body'),
    newChatCount: steeringRoot.getElementById('ready-ai-steering-new-chat-count'),
    newChatSend: steeringRoot.getElementById('ready-ai-steering-new-chat-send'),
    primary: steeringRoot.getElementById('ready-ai-steering-primary'),
    sendNow: steeringRoot.getElementById('ready-ai-steering-send-now'),
    clear: steeringRoot.getElementById('ready-ai-steering-clear'),
    queueWrap: steeringRoot.getElementById('ready-ai-steering-queue-wrap'),
    queue: steeringRoot.getElementById('ready-ai-steering-queue'),
    runNext: steeringRoot.getElementById('ready-ai-steering-run-next'),
    clearQueue: steeringRoot.getElementById('ready-ai-steering-clear-queue'),
    close: steeringRoot.getElementById('ready-ai-steering-close'),
    status: steeringRoot.getElementById('ready-ai-steering-status'),
  };
  return steeringRefs;
}
function getSteeringComposerEnterMode(event) {
  if (!event || event.key !== 'Enter') return '';
  if (event.repeat) return 'repeat';
  if (event.shiftKey) return 'linebreak';
  return event.ctrlKey || event.metaKey ? 'immediate' : 'queue';
}
function getSteeringComposerKeyboardPlan(event, options = {}) {
  const baseMode = getSteeringComposerEnterMode(event);
  const now = Math.max(0, Number(options.now) || Date.now());
  const lastPlainEnterAt = Math.max(0, Number(options.lastPlainEnterAt) || 0);
  const doubleEnterWindowMs = Math.max(180, Math.min(600, Number(options.doubleEnterWindowMs) || 300));
  const isDoubleEnter = baseMode === 'queue'
    && lastPlainEnterAt > 0
    && now >= lastPlainEnterAt
    && now - lastPlainEnterAt <= doubleEnterWindowMs;
  if (isDoubleEnter) {
    return { mode: 'immediate', delayMs: 0, nextPlainEnterAt: 0, doubleEnter: true };
  }
  if (baseMode === 'queue') {
    return { mode: 'queue', delayMs: doubleEnterWindowMs, nextPlainEnterAt: now, doubleEnter: false };
  }
  return { mode: baseMode, delayMs: 0, nextPlainEnterAt: 0, doubleEnter: false };
}
function bindSteeringUiEvents() {
  let steeringComposerSubmitTimer = null;
  let steeringComposerPlainEnterAt = 0;
  let steeringComposerAllowLineBreakUntil = 0;
  const handledSteeringComposerKeydowns = new WeakSet();
  const submitSteeringComposerFromKeyboard = (options = {}) => {
    const run = () => {
      steeringComposerSubmitTimer = null;
      steeringComposerPlainEnterAt = 0;
      const input = steeringRefs?.input;
      if (!input) return;
      if (options.removeInsertedLineBreak) {
        try { input.value = String(input.value || '').replace(/(?:\r?\n)+$/, ''); } catch (_) {}
      }
      syncSteeringDraftFromInput();
      if (options.sendImmediately === true) sendSteeringDraftImmediately();
      else submitSteeringInput();
    };
    try { clearTimeout(steeringComposerSubmitTimer); } catch (_) {}
    steeringComposerSubmitTimer = null;
    const delayMs = Math.max(0, Number(options.delayMs) || 0);
    if (delayMs > 0) steeringComposerSubmitTimer = window.setTimeout(run, delayMs);
    else if (options.defer) steeringComposerSubmitTimer = window.setTimeout(run, 0);
    else run();
  };
  const handleSteeringComposerKeydown = (event) => {
    if (event?.target !== steeringRefs.input) return;
    if (handledSteeringComposerKeydowns.has(event)) return;
    handledSteeringComposerKeydowns.add(event);
    try { event.stopPropagation(); } catch (_) {}
    const now = Date.now();
    const keyboardPlan = getSteeringComposerKeyboardPlan(event, {
      now,
      lastPlainEnterAt: steeringComposerSubmitTimer ? steeringComposerPlainEnterAt : 0,
    });
    const enterMode = keyboardPlan.mode;
    if (enterMode === 'repeat') {
      try { event.preventDefault(); } catch (_) {}
      return;
    }
    if (event.key === 'Escape') {
      try { event.preventDefault(); } catch (_) {}
      steeringPanelOpen = false;
      updateSteeringUi();
      return;
    }
    if (!enterMode) return;
    if (enterMode === 'linebreak') {
      steeringComposerAllowLineBreakUntil = Date.now() + 250;
      return;
    }
    const composing = !!(event.isComposing || event.keyCode === 229);
    if (!composing) {
      try { event.preventDefault(); } catch (_) {}
    }
    if (enterMode === 'queue') {
      steeringComposerPlainEnterAt = keyboardPlan.nextPlainEnterAt;
      submitSteeringComposerFromKeyboard({
        delayMs: keyboardPlan.delayMs,
        removeInsertedLineBreak: composing,
      });
      return;
    }
    steeringComposerPlainEnterAt = 0;
    submitSteeringComposerFromKeyboard({
      defer: composing,
      removeInsertedLineBreak: composing,
      sendImmediately: true,
    });
  };
  const consume = (handler) => (event) => {
    try { event.preventDefault(); } catch (_) {}
    try { event.stopPropagation(); } catch (_) {}
    handler?.(event);
  };
  steeringRefs.launcher.addEventListener('click', consume(() => {
    steeringPanelOpen = !steeringPanelOpen;
    updateSteeringUi();
    if (steeringPanelOpen && steeringAutoFocusInput) {
      try { steeringRefs.input.focus(); } catch (_) {}
    }
  }));
  steeringRefs.close.addEventListener('click', consume(() => {
    steeringPanelOpen = false;
    updateSteeringUi();
  }));
  steeringRefs.tabTitleSave?.addEventListener('click', consume(() => {
    saveCustomTabTitleFromInput();
  }));
  steeringRefs.addImage?.addEventListener('click', consume(() => {
    try { steeringRefs.fileInput?.click(); } catch (_) {}
  }));
  steeringRefs.clearAttachments?.addEventListener('click', consume(() => {
    clearSteeringDraftAttachments();
    setSteeringStatus('파일을 모두 비웠습니다.');
    updateSteeringUi();
  }));
  steeringRefs.fileInput?.addEventListener('change', async (event) => {
    const files = Array.from(event?.target?.files || []);
    await addSteeringAttachments(files);
  });
  steeringRefs.tabTitleClear?.addEventListener('click', consume(() => {
    clearCustomTabTitleOverride();
  }));
  steeringRefs.tabTitlePresets?.forEach((btn) => {
    btn.addEventListener('click', consume(() => {
      const rawPreset = String(btn.getAttribute('data-preset-title') || '').trim();
      const preset = rawPreset === '최근' ? normalizeCustomTabTitle(lastCustomTabTitle || customTabTitle || '') : rawPreset;
      if (!preset) {
        setSteeringStatus('최근 변경 이름이 없습니다.', true);
        return;
      }
      if (steeringRefs.tabTitleInput) steeringRefs.tabTitleInput.value = preset;
      saveCustomTabTitleFromInput();
    }));
  });
  steeringRefs.tabTitleInput?.addEventListener('keydown', (event) => {
    try { event.stopPropagation(); } catch (_) {}
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      try { event.preventDefault(); } catch (_) {}
      try { steeringRefs.tabTitleInput.value = customTabTitle || ''; } catch (_) {}
      return;
    }
    if (event.key !== 'Enter') return;
    try { event.preventDefault(); } catch (_) {}
    saveCustomTabTitleFromInput();
  });
  steeringRefs.advancedToggle?.addEventListener('change', consume(() => {
    setSteeringAdvancedEnabled(!!steeringRefs.advancedToggle.checked);
  }));
  const getSingleNewChatCountDigit = (value) => {
    const digits = String(value || '').replace(/[^\d]/g, '');
    const validDigits = digits.split('').filter((digit) => /^[1-8]$/.test(digit));
    return validDigits.length ? validDigits[validDigits.length - 1] : '';
  };
  const commitNewChatCountDigit = (digit, options = {}) => {
    const normalized = getSingleNewChatCountDigit(digit);
    if (!normalized) return false;
    try { steeringRefs.newChatCount.value = normalized; } catch (_) {}
    setSteeringNewChatTabCountValue(normalized, {
      render: false,
      syncInput: false,
      silentStatus: options.silentStatus !== false,
    });
    if (options.silentStatus === false) setSteeringStatus(`새 채팅 탭 수: ${normalized}`);
    return true;
  };
  const syncNewChatCountInput = (options = {}) => {
    const raw = String(steeringRefs.newChatCount?.value || '').trim();
    if (!raw) {
      setSteeringNewChatTabCountValue('', {
        allowEmpty: true,
        render: false,
        syncInput: false,
        silentStatus: true,
      });
      return false;
    }
    const normalized = getSingleNewChatCountDigit(raw);
    if (!normalized) {
      try { steeringRefs.newChatCount.value = ''; } catch (_) {}
      setSteeringNewChatTabCountValue('', {
        allowEmpty: true,
        render: false,
        syncInput: false,
        silentStatus: true,
      });
      return false;
    }
    if (raw !== normalized) {
      try { steeringRefs.newChatCount.value = normalized; } catch (_) {}
      setSteeringStatus(`새 채팅 탭 수: ${normalized}`);
    }
    setSteeringNewChatTabCountValue(normalized, {
      render: false,
      syncInput: false,
      silentStatus: options.silentStatus !== false,
    });
    return true;
  };
  steeringRefs.newChatCount?.addEventListener('change', consume(() => {
    if (!syncNewChatCountInput({ silentStatus: false })) setSteeringNewChatTabCountValue(steeringRefs.newChatCount.value);
  }));
  steeringRefs.newChatCount?.addEventListener('input', (event) => {
    try { event.stopPropagation(); } catch (_) {}
    syncNewChatCountInput({ silentStatus: false });
  });
  steeringRefs.newChatCount?.addEventListener('keydown', (event) => {
    try { event.stopPropagation(); } catch (_) {}
    if (event.isComposing) return;
    const key = String(event.key || '');
    if (/^[1-8]$/.test(key)) {
      try { event.preventDefault(); } catch (_) {}
      commitNewChatCountDigit(key, { silentStatus: false });
      return;
    }
    if (key === 'Backspace' || key === 'Delete') {
      try { event.preventDefault(); } catch (_) {}
      try { steeringRefs.newChatCount.value = ''; } catch (_) {}
      setSteeringNewChatTabCountValue('', {
        allowEmpty: true,
        render: false,
        syncInput: false,
        silentStatus: true,
      });
      return;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      try { event.preventDefault(); } catch (_) {}
      const base = normalizeSteeringNewChatTabCount(steeringRefs.newChatCount.value || steeringNewChatTabCount);
      const next = Math.max(1, Math.min(8, base + (key === 'ArrowUp' ? 1 : -1)));
      commitNewChatCountDigit(String(next), { silentStatus: false });
      return;
    }
    if (key === 'Enter') {
      try { event.preventDefault(); } catch (_) {}
      if (!syncNewChatCountInput({ silentStatus: false })) commitNewChatCountDigit(String(steeringNewChatTabCount), { silentStatus: false });
      return;
    }
    if (key === 'Escape') {
      try { event.preventDefault(); } catch (_) {}
      commitNewChatCountDigit(String(steeringNewChatTabCount));
      return;
    }
    if (key.length === 1) {
      try { event.preventDefault(); } catch (_) {}
    }
  });
  steeringRefs.newChatCount?.addEventListener('keyup', (event) => {
    try { event.stopPropagation(); } catch (_) {}
    syncNewChatCountInput();
  });
  steeringRefs.newChatSend?.addEventListener('click', consume(() => {
    submitSteeringInputToNewChats();
  }));
  steeringRefs.primary.addEventListener('click', consume(() => {
    submitSteeringInput();
  }));
  steeringRefs.sendNow.addEventListener('click', consume(async () => {
    await sendSteeringDraftImmediately();
  }));
  steeringRefs.clear.addEventListener('click', consume(() => {
    clearSteeringQueue(true);
  }));
  steeringRefs.runNext.addEventListener('click', consume(async () => {
    if (!canUserRunSteeringQueueNow()) {
      setSteeringStatus(getSteeringQueueWaitMessage(), !steeringQueue.length);
      updateSteeringUi();
      return;
    }
    const ok = await processSteeringQueue({ source: 'resume_button' });
    if (!ok) setSteeringStatus(getSteeringQueueWaitMessage(), !steeringQueue.length);
  }));
  steeringRefs.clearQueue.addEventListener('click', consume(() => {
    clearSteeringQueue(true);
  }));
  steeringRefs.attachmentPreviewClose?.addEventListener('click', consume(() => {
    closeSteeringAttachmentPreview();
  }));
  steeringRefs.attachmentPreviewPrev?.addEventListener('click', consume(() => {
    stepSteeringAttachmentPreview(-1);
  }));
  steeringRefs.attachmentPreviewNext?.addEventListener('click', consume(() => {
    stepSteeringAttachmentPreview(1);
  }));
  steeringRefs.attachmentPreview?.addEventListener('click', (event) => {
    if (event.target !== steeringRefs.attachmentPreview) return;
    try { event.preventDefault(); } catch (_) {}
    closeSteeringAttachmentPreview();
  });
  steeringRoot.addEventListener('keydown', (event) => {
    if (!steeringPreviewAttachmentId) return;
    if (event.key === 'Escape') {
      try { event.preventDefault(); } catch (_) {}
      closeSteeringAttachmentPreview();
      return;
    }
    if (event.key === 'ArrowLeft') {
      try { event.preventDefault(); } catch (_) {}
      stepSteeringAttachmentPreview(-1);
      return;
    }
    if (event.key === 'ArrowRight') {
      try { event.preventDefault(); } catch (_) {}
      stepSteeringAttachmentPreview(1);
    }
  });
  const stopSteeringDragEvent = (event) => {
    try { event.preventDefault(); } catch (_) {}
    try { event.stopPropagation(); } catch (_) {}
    try { event.stopImmediatePropagation?.(); } catch (_) {}
  };
  const handleSteeringAttachmentDragEnter = (event) => {
    stopSteeringDragEvent(event);
    setSteeringDragActive(true);
  };
  const handleSteeringAttachmentDragOver = (event) => {
    stopSteeringDragEvent(event);
    setSteeringDragActive(true);
  };
  const handleSteeringAttachmentDragLeave = (event) => {
    stopSteeringDragEvent(event);
    setSteeringDragActive(false);
  };
  const handleSteeringAttachmentDrop = async (event) => {
    stopSteeringDragEvent(event);
    setSteeringDragActive(false);
    armSteeringDropPointerGuard();
    const files = await extractSteeringFilesFromTransferAsync(event.dataTransfer, { limit: Math.max(64, STEERING_ATTACHMENT_LIMIT * 4) });
    await addSteeringAttachments(files);
  };
  [steeringRefs.card, steeringRefs.attachmentWrap, steeringRefs.attachmentDropzone, steeringRefs.input, steeringRefs.dropShield].forEach((target) => {
    target?.addEventListener('dragenter', handleSteeringAttachmentDragEnter, true);
    target?.addEventListener('dragover', handleSteeringAttachmentDragOver, true);
    target?.addEventListener('dragleave', handleSteeringAttachmentDragLeave, true);
    target?.addEventListener('drop', handleSteeringAttachmentDrop, true);
  });
  steeringRefs.input.addEventListener('paste', async (event) => {
    const files = await extractSteeringFilesFromTransferAsync(event.clipboardData, { limit: Math.max(64, STEERING_ATTACHMENT_LIMIT * 4) });
    if (!files.length) return;
    try { event.preventDefault(); } catch (_) {}
    try { event.stopPropagation(); } catch (_) {}
    await addSteeringAttachments(files);
  });
  steeringRefs.input.addEventListener('input', (event) => {
    syncSteeringDraftFromInput();
    updateSteeringUi();
    const inputType = String(event?.inputType || '');
    if (!/^(insertLineBreak|insertParagraph)$/.test(inputType)) return;
    if (Date.now() <= steeringComposerAllowLineBreakUntil) return;
    submitSteeringComposerFromKeyboard({
      defer: true,
      removeInsertedLineBreak: true,
    });
  });
  steeringRoot.addEventListener('keydown', handleSteeringComposerKeydown, true);
  steeringRefs.input.addEventListener('keydown', handleSteeringComposerKeydown);
}
