function cloneSteeringAttachmentsForQueue() {
  return steeringAttachments.map((item) => ({
    name: item.name,
    size: item.size,
    type: item.type,
    file: item.file,
    isImage: !!item.isImage,
  }));
}
function cloneSteeringImagesForQueue() {
  return cloneSteeringAttachmentsForQueue();
}
function getSteeringAttachmentTotalBytes(list = steeringAttachments) {
  return (Array.isArray(list) ? list : []).reduce((sum, item) => sum + Math.max(0, Number(item?.size) || 0), 0);
}
function getSteeringAttachmentHintText(list = steeringAttachments) {
  const count = Array.isArray(list) ? list.length : 0;
  const remaining = Math.max(0, STEERING_ATTACHMENT_LIMIT - count);
  const maxSize = formatSteeringBytes(STEERING_FILE_MAX_BYTES);
  if (!count) return '';
  const modeHint = steeringAdvancedEnabled ? ' · 파일은 현재 대화로 전송' : '';
  return `남은 ${remaining}칸 · 파일당 최대 ${maxSize}${modeHint}`;
}
function renderSteeringAttachments() {
  if (!steeringRefs?.attachmentWrap || !steeringRefs?.attachmentList || !steeringRefs?.attachmentMeta) return;
  const list = steeringAttachments.slice();
  const totalBytes = getSteeringAttachmentTotalBytes(list);
  const metaText = list.length ? `파일 ${list.length}/${STEERING_ATTACHMENT_LIMIT} · 총 ${formatSteeringBytes(totalBytes)}` : `PDF·문서·이미지·압축 · 최대 ${formatSteeringBytes(STEERING_FILE_MAX_BYTES)}`;
  const hintText = getSteeringAttachmentHintText(list);
  const nextDisplay = (steeringPanelOpen || list.length) ? 'flex' : 'none';
  const signature = JSON.stringify({
    open: !!steeringPanelOpen,
    advanced: !!steeringAdvancedEnabled,
    list: list.map((item) => [item.id, item.name, item.type, item.size, item.width, item.height, !!item.optimized, !!item.previewUrl, !!item.isImage]),
  });
  steeringRefs.attachmentWrap.style.display = nextDisplay;
  if (steeringRefs.attachmentMeta.textContent !== metaText) steeringRefs.attachmentMeta.textContent = metaText;
  if (steeringRefs.attachmentHint && steeringRefs.attachmentHint.textContent !== hintText) steeringRefs.attachmentHint.textContent = hintText;
  if (steeringRefs.attachmentDropzone) steeringRefs.attachmentDropzone.hidden = !!list.length;
  if (steeringRefs.attachmentList) steeringRefs.attachmentList.hidden = !list.length;
  if (steeringRefs.clearAttachments) steeringRefs.clearAttachments.disabled = !list.length;
  if (steeringRefs.addImage) steeringRefs.addImage.disabled = list.length >= STEERING_ATTACHMENT_LIMIT;
  if (steeringAttachmentRenderSignature === signature) return;
  steeringAttachmentRenderSignature = signature;
  steeringRefs.attachmentList.innerHTML = '';
  const fragment = document.createDocumentFragment();
  for (const item of list) {
    const chip = document.createElement('div');
    chip.className = 'attachment-item';
    const thumb = document.createElement(item.previewUrl ? 'img' : 'div');
    thumb.className = 'attachment-thumb';
    if (item.previewUrl) {
      thumb.src = item.previewUrl;
      thumb.alt = item.name;
      thumb.loading = 'lazy';
      try { thumb.decoding = 'async'; } catch (_) {}
    } else {
      thumb.textContent = getSteeringAttachmentThumbLabel(item);
      thumb.setAttribute('aria-label', `${getSteeringFileKindLabel(item)} 파일`);
    }
    thumb.addEventListener('click', (event) => {
      try { event.preventDefault(); } catch (_) {}
      try { event.stopPropagation(); } catch (_) {}
      openSteeringAttachmentPreview(item.id);
    });
    const meta = document.createElement('div');
    meta.className = 'attachment-meta';
    const nameEl = document.createElement('div');
    nameEl.className = 'attachment-name';
    nameEl.textContent = item.name;
    const subEl = document.createElement('div');
    subEl.className = 'attachment-sub';
    subEl.textContent = getSteeringAttachmentMetaText(item);
    meta.appendChild(nameEl);
    meta.appendChild(subEl);
    const actionWrap = document.createElement('div');
    actionWrap.className = 'attachment-row-actions';
    const moveUpBtn = document.createElement('button');
    moveUpBtn.type = 'button';
    moveUpBtn.className = 'attachment-mini-btn';
    moveUpBtn.textContent = '↑';
    moveUpBtn.title = '앞으로 이동';
    moveUpBtn.disabled = list[0]?.id === item.id;
    moveUpBtn.addEventListener('click', (event) => {
      try { event.preventDefault(); } catch (_) {}
      try { event.stopPropagation(); } catch (_) {}
      moveSteeringAttachment(item.id, -1);
    });
    const moveDownBtn = document.createElement('button');
    moveDownBtn.type = 'button';
    moveDownBtn.className = 'attachment-mini-btn';
    moveDownBtn.textContent = '↓';
    moveDownBtn.title = '뒤로 이동';
    moveDownBtn.disabled = list[list.length - 1]?.id === item.id;
    moveDownBtn.addEventListener('click', (event) => {
      try { event.preventDefault(); } catch (_) {}
      try { event.stopPropagation(); } catch (_) {}
      moveSteeringAttachment(item.id, 1);
    });
    const previewBtn = document.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'attachment-mini-btn';
    previewBtn.textContent = item.previewUrl ? '보기' : '정보';
    previewBtn.title = item.previewUrl ? '크게 보기' : '파일 정보 보기';
    previewBtn.addEventListener('click', (event) => {
      try { event.preventDefault(); } catch (_) {}
      try { event.stopPropagation(); } catch (_) {}
      openSteeringAttachmentPreview(item.id);
    });
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'attachment-remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', '파일 제거');
    removeBtn.addEventListener('click', (event) => {
      try { event.preventDefault(); } catch (_) {}
      try { event.stopPropagation(); } catch (_) {}
      removeSteeringAttachment(item.id);
    });
    actionWrap.appendChild(moveUpBtn);
    actionWrap.appendChild(moveDownBtn);
    actionWrap.appendChild(previewBtn);
    actionWrap.appendChild(removeBtn);
    chip.appendChild(thumb);
    chip.appendChild(meta);
    chip.appendChild(actionWrap);
    fragment.appendChild(chip);
  }
  steeringRefs.attachmentList.appendChild(fragment);
}
function renderSteeringQueue() {
  if (!steeringRefs?.queueWrap || !steeringRefs?.queue) return;
  syncSteeringQueueEditState();
  const nextDisplay = (steeringPanelOpen && steeringQueue.length) ? 'flex' : 'none';
  const signature = JSON.stringify({
    open: !!steeringPanelOpen,
    editingId: steeringQueueEditingId,
    editingText: steeringQueueEditingId == null ? '' : String(steeringQueueEditingText || ''),
    draggingId: steeringQueueDragState?.itemId || null,
    queue: steeringQueue.map((item) => [item?.id, String(item?.text || '').trim(), getSteeringItemAttachmentCount(item)]),
  });
  steeringRefs.queueWrap.style.display = nextDisplay;
  steeringRefs.queue.classList.toggle('dragging-active', !!steeringQueueDragState);
  if (steeringQueueRenderSignature === signature) return;
  steeringQueueRenderSignature = signature;
  steeringRefs.queue.innerHTML = '';
  if (!steeringQueue.length) return;
  const fragment = document.createDocumentFragment();
  steeringQueue.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'queue-item';
    row.addEventListener('dblclick', (event) => {
      const target = event?.target;
      if (target?.closest?.('button, input')) return;
      beginSteeringQueueEdit(item.id);
    });
    const isEditing = item?.id === steeringQueueEditingId;
    if (isEditing) row.classList.add('editing');
    if (steeringQueueDragState?.itemId === item?.id) row.classList.add('dragging');
    row.setAttribute('data-queue-id', String(item?.id || ''));
    row.setAttribute('data-queue-index', String(index));
    const dragHandle = document.createElement('button');
    dragHandle.type = 'button';
    dragHandle.className = 'queue-drag-handle';
    dragHandle.title = isEditing ? '수정 중에는 드래그할 수 없습니다.' : '왼쪽 핸들을 드래그해서 순서 변경';
    dragHandle.setAttribute('aria-label', `${index + 1}번 대기, 드래그해서 순서 변경`);
    const grip = document.createElement('span');
    grip.className = 'queue-grip';
    grip.setAttribute('aria-hidden', 'true');
    const order = document.createElement('span');
    order.className = 'queue-order';
    order.textContent = String(index + 1);
    dragHandle.appendChild(grip);
    dragHandle.appendChild(order);
    if (!isEditing) {
      dragHandle.addEventListener('pointerdown', (event) => {
        beginSteeringQueueDrag(event, item.id);
      });
      dragHandle.addEventListener('keydown', (event) => {
        if (event.isComposing) return;
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          try { event.preventDefault(); } catch (_) {}
          try { event.stopPropagation(); } catch (_) {}
          moveSteeringQueueItem(item.id, event.key === 'ArrowUp' ? -1 : 1);
        }
      });
    }
    const body = document.createElement('div');
    body.className = 'queue-body';
    const itemMeta = document.createElement('div');
    itemMeta.className = 'queue-item-meta';
    const attachmentCount = getSteeringItemAttachmentCount(item);
    itemMeta.textContent = attachmentCount ? `후속 ${index + 1} · 파일 ${attachmentCount}개` : `후속 ${index + 1} · 다음 작업`;
    body.appendChild(itemMeta);
    const textEl = document.createElement('div');
    textEl.className = 'queue-text';
    textEl.textContent = getSteeringItemSummary(item);
    textEl.title = '더블클릭해서 수정';
    textEl.addEventListener('dblclick', () => {
      beginSteeringQueueEdit(item.id);
    });
    body.appendChild(textEl);
    if (isEditing) {
      const editWrap = document.createElement('div');
      editWrap.className = 'queue-edit-wrap';
      const editInput = document.createElement('input');
      editInput.type = 'text';
      editInput.className = 'queue-edit-input';
      editInput.value = String(steeringQueueEditingText || '');
      editInput.placeholder = getSteeringItemAttachmentCount(item) ? '텍스트 없이 파일 첨부 대기만 둘 수 있습니다.' : '대기 문구 수정';
      editInput.setAttribute('aria-label', '대기 수정');
      editInput.addEventListener('input', () => {
        syncSteeringQueueEditDraft(editInput.value || '');
      });
      editInput.addEventListener('keydown', (event) => {
        try { event.stopPropagation(); } catch (_) {}
        if (event.isComposing) return;
        if (event.key === 'Escape') {
          try { event.preventDefault(); } catch (_) {}
          cancelSteeringQueueEdit();
          return;
        }
        if (event.key !== 'Enter') return;
        try { event.preventDefault(); } catch (_) {}
        commitSteeringQueueEdit();
      });
      editWrap.appendChild(editInput);
      if (getSteeringItemAttachmentCount(item)) {
        const helper = document.createElement('div');
        helper.className = 'queue-edit-meta';
        helper.textContent = `첨부 파일 ${getSteeringItemAttachmentCount(item)}개 유지`;
        editWrap.appendChild(helper);
      }
      body.appendChild(editWrap);
      window.setTimeout(() => {
        try {
          if (steeringQueueEditingId !== item.id) return;
          editInput.focus();
          editInput.setSelectionRange(editInput.value.length, editInput.value.length);
        } catch (_) {}
      }, 0);
    }
    const actions = document.createElement('div');
    actions.className = 'queue-actions';
    const makeActionBtn = (label, title, handler, extraClass = '') => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `queue-action ${extraClass}`.trim();
      btn.textContent = label;
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.addEventListener('click', (event) => {
        try { event.preventDefault(); } catch (_) {}
        try { event.stopPropagation(); } catch (_) {}
        handler?.();
      });
      return btn;
    };
    if (isEditing) {
      actions.appendChild(makeActionBtn('저장', '수정 저장', () => commitSteeringQueueEdit(), 'solid'));
      actions.appendChild(makeActionBtn('취소', '수정 취소', () => cancelSteeringQueueEdit(), 'muted'));
    } else {
      actions.appendChild(makeActionBtn('바로 반영', '현재 작업에 이 지시를 바로 반영', () => sendSteeringQueueItemImmediately(item.id), 'immediate'));
      actions.appendChild(makeActionBtn('수정', '대기 내용 수정', () => beginSteeringQueueEdit(item.id), 'muted'));
    }
    actions.appendChild(makeActionBtn('삭제', '대기 삭제', () => {
      steeringQueue = steeringQueue.filter((queued) => queued.id !== item.id);
      syncSteeringQueueEditState();
      setSteeringStatus(steeringQueue.length ? `${getSteeringQueueCountLabel()}` : '대기를 비웠습니다.');
      updateSteeringUi();
    }, 'danger'));
    row.appendChild(dragHandle);
    row.appendChild(body);
    row.appendChild(actions);
    fragment.appendChild(row);
  });
  steeringRefs.queue.appendChild(fragment);
}
function getSteeringQueueDedupeSignature(text, files = []) {
  const fileSig = (Array.isArray(files) ? files : []).map((item) => [
    String(item?.name || ''),
    String(item?.type || ''),
    Math.max(0, Number(item?.size) || 0),
  ]);
  return JSON.stringify([String(text || '').replace(/\s+/g, ' ').trim(), fileSig]);
}
function shouldDropRuntimeSteeringEnqueue(signature) {
  const now = Date.now();
  if (
    signature
    && steeringLastRuntimeEnqueueSignature === signature
    && now - steeringLastRuntimeEnqueueAt <= STEERING_RUNTIME_ENQUEUE_DEDUPE_MS
  ) {
    return true;
  }
  steeringLastRuntimeEnqueueSignature = signature;
  steeringLastRuntimeEnqueueAt = now;
  return false;
}
function shouldHoldInitialChatGptQueueItem(item, options = {}) {
  if (!item?.holdForFirstChatGptTurn) return false;
  if (String(options.siteKey || '') !== 'chatgpt') return false;
  if (options.hasConversationTurns) return false;
  return options.allowHeldFirstTurn !== true;
}
function shouldHoldSteeringQueueHeadForFirstChatGptTurn(options = {}) {
  const item = steeringQueue[0];
  if (!item?.holdForFirstChatGptTurn) return false;
  const siteKey = getSiteKey();
  const hasConversationTurns = siteKey === 'chatgpt' && hasChatGptConversationTurns();
  if (siteKey !== 'chatgpt' || hasConversationTurns) {
    item.holdForFirstChatGptTurn = false;
    return false;
  }
  return shouldHoldInitialChatGptQueueItem(item, {
    siteKey,
    hasConversationTurns,
    allowHeldFirstTurn: options.allowHeldFirstTurn === true,
  });
}
function enqueueSteeringPrompt(text, options = {}) {
  if (syncSteeringConversationScope()) return null;
  if (steeringStateRestoring || steeringSessionStorageFailed) return null;
  const value = String(text || '').trim();
  const files = (Array.isArray(options.files) ? options.files : (Array.isArray(options.images) ? options.images : [])).filter((item) => item?.file);
  if (!value && !files.length) return null;
  if (options.source === 'runtime') {
    const signature = getSteeringQueueDedupeSignature(value, files);
    if (shouldDropRuntimeSteeringEnqueue(signature)) {
      return steeringQueue[steeringQueue.length - 1] || null;
    }
  }
  const item = {
    id: steeringQueueSeq++,
    text: value,
    files,
    images: files, // 기존 내부 호출 호환용
    createdAt: Date.now(),
    retryCount: 0,
    holdForFirstChatGptTurn: options.holdForFirstChatGptTurn === true,
  };
  steeringQueue = [...steeringQueue, item];
  return item;
}
function clearSteeringQueue(showStatus = true) {
  steeringQueue = [];
  steeringRestoredQueuePaused = false;
  cancelSteeringQueueEdit({ silent: true });
  setSteeringDraftText('');
  clearSteeringDraftAttachments();
  try {
    if (steeringRefs?.input) steeringRefs.input.value = '';
  } catch (_) {}
  if (showStatus) setSteeringStatus('대기를 모두 비웠습니다.');
  updateSteeringUi();
}
function getSteeringQueueItemIndex(itemId) {
  return steeringQueue.findIndex((item) => item?.id === itemId);
}
function moveSteeringQueueItemToIndex(itemId, nextIndex, options = {}) {
  const index = steeringQueue.findIndex((item) => item?.id === itemId);
  if (index < 0) return false;
  const targetIndex = Number(nextIndex);
  if (!Number.isFinite(targetIndex)) return false;
  const boundedIndex = Math.max(0, Math.min(steeringQueue.length - 1, targetIndex));
  if (boundedIndex === index) return false;
  const list = steeringQueue.slice();
  const [picked] = list.splice(index, 1);
  list.splice(boundedIndex, 0, picked);
  steeringQueue = list;
  syncSteeringQueueEditState();
  if (!options.silentStatus) setSteeringStatus('대기 순서를 변경했습니다.');
  if (options.render !== false) updateSteeringUi();
  return true;
}
function moveSteeringQueueItem(itemId, direction) {
  const index = getSteeringQueueItemIndex(itemId);
  if (index < 0) return false;
  return moveSteeringQueueItemToIndex(itemId, index + Number(direction || 0));
}
function setSteeringQueueDragListeners(enabled) {
  try {
    const method = enabled ? 'addEventListener' : 'removeEventListener';
    window[method]('pointermove', handleSteeringQueueDragMove, true);
    window[method]('pointerup', finishSteeringQueueDrag, true);
    window[method]('pointercancel', finishSteeringQueueDrag, true);
  } catch (_) {}
}
function getSteeringQueueDragTargetIndex(clientY, sourceIndex) {
  if (!Number.isFinite(clientY) || !Number.isFinite(sourceIndex)) return -1;
  const rows = Array.from(steeringRefs?.queue?.querySelectorAll?.('.queue-item') || []);
  if (!rows.length) return -1;
  let lastIndex = -1;
  for (const row of rows) {
    const rowIndex = Number(row.getAttribute('data-queue-index'));
    if (!Number.isFinite(rowIndex)) continue;
    lastIndex = rowIndex;
    const rect = row.getBoundingClientRect();
    if (clientY < rect.top + (rect.height / 2)) return rowIndex > sourceIndex ? rowIndex - 1 : rowIndex;
  }
  return lastIndex;
}
function beginSteeringQueueDrag(event, itemId) {
  if (steeringQueueEditingId === itemId) return false;
  if (getSteeringQueueItemIndex(itemId) < 0) return false;
  try { event.preventDefault(); } catch (_) {}
  try { event.stopPropagation(); } catch (_) {}
  if (steeringQueueDragState) finishSteeringQueueDrag();
  steeringQueueDragState = {
    itemId,
    pointerId: event?.pointerId,
    moved: false,
  };
  try {
    steeringQueueDragPreviousUserSelect = document.body?.style?.userSelect || '';
    if (document.body?.style) document.body.style.userSelect = 'none';
  } catch (_) {}
  try { event.currentTarget?.setPointerCapture?.(event.pointerId); } catch (_) {}
  setSteeringQueueDragListeners(true);
  updateSteeringUi();
  return true;
}
function handleSteeringQueueDragMove(event) {
  const state = steeringQueueDragState;
  if (!state) return;
  if (state.pointerId != null && event?.pointerId != null && event.pointerId !== state.pointerId) return;
  try { event.preventDefault(); } catch (_) {}
  try { event.stopPropagation(); } catch (_) {}
  const currentIndex = getSteeringQueueItemIndex(state.itemId);
  if (currentIndex < 0) {
    finishSteeringQueueDrag(event);
    return;
  }
  const targetIndex = getSteeringQueueDragTargetIndex(Number(event?.clientY), currentIndex);
  if (targetIndex < 0) return;
  if (targetIndex === currentIndex) return;
  state.moved = true;
  moveSteeringQueueItemToIndex(state.itemId, targetIndex, { silentStatus: true });
}
function finishSteeringQueueDrag(event) {
  const state = steeringQueueDragState;
  if (!state) return false;
  if (event && state.pointerId != null && event?.pointerId != null && event.pointerId !== state.pointerId) return false;
  try { event?.preventDefault?.(); } catch (_) {}
  try { event?.stopPropagation?.(); } catch (_) {}
  const moved = !!state.moved;
  steeringQueueDragState = null;
  setSteeringQueueDragListeners(false);
  try {
    if (document.body?.style) document.body.style.userSelect = steeringQueueDragPreviousUserSelect || '';
  } catch (_) {}
  steeringQueueDragPreviousUserSelect = '';
  if (moved) setSteeringStatus('대기 순서를 변경했습니다.');
  updateSteeringUi();
  return true;
}
function scheduleSteeringQueueProcessing(delay = STEERING_AUTO_SEND_DELAY_MS) {
  clearSteeringAutoSendTimer();
  if (!monitoring || !steeringEnabled) return;
  if (!steeringQueue.length) return;
  if (shouldHoldSteeringQueueHeadForFirstChatGptTurn()) return;
  if (!canAutoSendSteeringNow()) {
    if (isSteeringTurnWatchdogMature()) recoverStaleSteeringTurnWait('schedule_queue');
    return;
  }
  steeringAutoSendTimer = setTimeout(() => {
    steeringAutoSendTimer = null;
    processSteeringQueue({ source: 'auto' });
  }, Math.max(0, delay));
}
function getFileInputSelectors(siteKey, files = []) {
  const hasNonImage = Array.from(files || []).some((file) => !isSteeringImageFile(file));
  const broad = ['input[type="file"]', 'form input[type="file"]'];
  const imageFirst = ['input[type="file"][accept*="image"]', 'form input[type="file"]', 'input[type="file"]'];
  if (hasNonImage) return broad;
  if (siteKey === 'chatgpt') return imageFirst;
  if (siteKey === 'gemini' || siteKey === 'aistudio' || siteKey === 'claude') return imageFirst;
  return imageFirst;
}
function parseSteeringAcceptTokens(accept) {
  return String(accept || '').toLowerCase().split(',').map((token) => token.trim()).filter(Boolean);
}
function doesFileMatchSteeringAcceptToken(file, token) {
  if (!token || token === '*/*') return true;
  const type = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();
  if (token.startsWith('.')) return name.endsWith(token);
  if (token.endsWith('/*')) return !!type && type.startsWith(token.slice(0, -1));
  return !!type && type === token;
}
function doesInputAcceptSteeringFile(input, file) {
  const tokens = parseSteeringAcceptTokens(input?.getAttribute?.('accept') || '');
  if (!tokens.length) return true;
  return tokens.some((token) => doesFileMatchSteeringAcceptToken(file, token));
}
function scoreFileInputCandidate(el, composer, files = []) {
  if (!el || String(el.tagName || '').toLowerCase() !== 'input') return -999;
  if (String(el.type || '').toLowerCase() !== 'file') return -999;
  if (el.disabled) return -999;
  const fileList = Array.from(files || []).filter((file) => isSteeringAttachmentFile(file));
  const hasNonImage = fileList.some((file) => !isSteeringImageFile(file));
  const allAccepted = !fileList.length || fileList.every((file) => doesInputAcceptSteeringFile(el, file));
  let score = 0;
  const accept = String(el.getAttribute?.('accept') || '').toLowerCase();
  const cls = String(el.className || '').toLowerCase();
  const name = String(el.getAttribute?.('name') || '').toLowerCase();
  const aria = String(el.getAttribute?.('aria-label') || '').toLowerCase();
  const testId = String(el.getAttribute?.('data-testid') || '').toLowerCase();
  const hay = `${accept} ${cls} ${name} ${aria} ${testId}`;
  if (allAccepted) score += 8;
  else score -= 10;
  if (!accept || accept.includes('*/*')) score += hasNonImage ? 8 : 5;
  if (accept.includes('image')) score += hasNonImage ? -6 : 6;
  if (hay.includes('attach') || hay.includes('attachment') || hay.includes('file') || hay.includes('upload') || hay.includes('첨부') || hay.includes('파일') || hay.includes('업로드')) score += 5;
  if (hay.includes('image') || hay.includes('photo') || hay.includes('gallery') || hay.includes('이미지') || hay.includes('사진')) score += hasNonImage ? -2 : 3;
  if (el.multiple) score += fileList.length > 1 ? 3 : 1;
  const form = getComposerSubmitForm(composer);
  try { if (form && form.contains(el)) score += 5; } catch (_) {}
  try {
    const wrap = composer?.closest?.('[data-testid], [role="group"], [role="presentation"], form, section, main, article, div');
    if (wrap && wrap.contains(el)) score += 3;
  } catch (_) {}
  try {
    const cr = composer?.getBoundingClientRect?.();
    const ir = el.getBoundingClientRect?.();
    if (cr && ir && ir.width >= 0 && ir.height >= 0) {
      const dx = Math.abs(ir.left - cr.left) + Math.abs(ir.right - cr.right);
      const dy = Math.abs(ir.top - cr.bottom);
      if (dx < 600) score += 1;
      if (dy < 300) score += 1;
    }
  } catch (_) {}
  return score;
}
function findNearbyFileInput(composer, files = []) {
  const fileList = Array.from(files || []).filter((file) => isSteeringAttachmentFile(file));
  const selectors = getFileInputSelectors(getSiteKey(), fileList);
  let best = null;
  let bestScore = -999;
  for (const selector of selectors) {
    const candidates = qsa(selector);
    for (const input of candidates) {
      const score = scoreFileInputCandidate(input, composer, fileList);
      if (score > bestScore) {
        best = input;
        bestScore = score;
      }
    }
  }
  return bestScore >= 4 ? best : null;
}
