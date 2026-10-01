async function tryTriggerComposerSend(composer, trigger, options = {}) {
  if (!composer || typeof trigger !== 'function') return false;
  const beforeText = getCurrentComposerText(composer);
  let hadConversationTurns = false;
  try {
    hadConversationTurns = typeof hasChatGptConversationTurns === 'function' && hasChatGptConversationTurns();
  } catch (_) {}
  const beforeUrl = String(location.href || '');
  const chatGptUserBaseline = isChatGptSafeMode() ? getChatGptUserTurnSnapshot() : null;
  const sessionToken = steeringConversationSessionToken;
  let triggered = false;
  try { triggered = trigger() !== false; } catch (_) { triggered = false; }
  if (!triggered) return false;
  const sent = await waitForSubmissionStart(composer, beforeText, options.submitStartTimeoutMs || options.timeoutMs || (chatGptUserBaseline ? 3500 : 900), {
    hadConversationTurns,
    beforeUrl,
    ignoreExistingGeneration: !!options.ignoreExistingGeneration,
    chatGptUserBaseline,
    sessionToken,
  });
  if (!sent && chatGptUserBaseline && !String(getCurrentComposerText(composer) || '').trim()) steeringChatGptSubmissionUncertain = true;
  return sent;
}
function setSteeringStatus(text, isError = false) {
  if (!steeringRefs?.status) return;
  steeringRefs.status.textContent = text || '';
  steeringRefs.status.dataset.state = isError ? 'error' : 'ok';
}
function hideSteeringUi() {
  if (steeringHost) steeringHost.style.display = 'none';
  if (typeof isReadyAiDuplicateContentInstance === 'function' && isReadyAiDuplicateContentInstance()) return;
  syncSteeringQueueCount();
}
function getSteeringQueueCountValue() {
  return Math.max(0, Number(steeringQueue.length) || 0);
}
function getSteeringQueueCountText() {
  const count = getSteeringQueueCountValue();
  return count > 99 ? '99+' : String(count);
}
function getSteeringQueueCountLabel() {
  return `대기중: ${getSteeringQueueCountText()}`;
}
function syncSteeringQueueCount(force = false) {
  if (!IS_TOP_FRAME) return;
  const count = Math.max(0, Number(steeringQueue.length) || 0);
  if (!force && steeringLastReportedQueueCount === count) return;
  steeringLastReportedQueueCount = count;
  try {
    chrome.runtime.sendMessage({
      action: 'steering_queue_update',
      platform: getSiteKey(),
      siteName: activeSite?.name,
      count,
    });
  } catch (_) {}
}
function formatSteeringBytes(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
  if (value >= 1024) return `${Math.max(1, Math.round(value / 1024))}KB`;
  return `${value}B`;
}
function getSteeringFallbackFileName(file) {
  const raw = String(file?.name || '').trim();
  if (raw) return raw;
  const type = String(file?.type || '').trim().toLowerCase();
  if (type.includes('pdf')) return `file-${Date.now()}.pdf`;
  if (type.includes('json')) return `file-${Date.now()}.json`;
  if (type.includes('text')) return `file-${Date.now()}.txt`;
  if (type.includes('image')) return `image-${Date.now()}.png`;
  return `file-${Date.now()}`;
}
function isSteeringAttachmentFile(file) {
  if (!file || typeof file !== 'object') return false;
  if (typeof File !== 'undefined' && file instanceof File) return true;
  if (typeof Blob !== 'undefined' && file instanceof Blob) return true;
  return typeof file.name === 'string' || Number.isFinite(Number(file.size));
}
function getSteeringFileIdentity(file) {
  if (!isSteeringAttachmentFile(file)) return '';
  const name = String(file.webkitRelativePath || getSteeringFallbackFileName(file));
  const size = Math.max(0, Number(file.size) || 0);
  const type = String(file.type || '').toLowerCase();
  const modified = Math.max(0, Number(file.lastModified) || 0);
  return `${name}|${size}|${type}|${modified}`;
}
function hasSteeringAttachmentDuplicate(file, extraSeen = null) {
  const key = getSteeringFileIdentity(file);
  if (!key) return false;
  if (extraSeen && extraSeen.has(key)) return true;
  return steeringAttachments.some((item) => getSteeringFileIdentity(item?.file || item) === key);
}
function isSteeringImageFile(file) {
  return isSteeringAttachmentFile(file) && /^image\//i.test(String(file.type || ''));
}
function getSteeringFileExtension(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]{1,10})$/);
  return match ? match[1] : '';
}
function getSteeringFileKindLabel(item) {
  const name = String(item?.name || item?.file?.name || '');
  const type = String(item?.type || item?.file?.type || '').toLowerCase();
  const ext = getSteeringFileExtension(name);
  if (/^image\//.test(type)) return '이미지';
  if (type.includes('pdf') || ext === 'pdf') return 'PDF';
  if (/spreadsheet|excel|csv/.test(type) || ['xls', 'xlsx', 'csv', 'tsv'].includes(ext)) return ext ? ext.toUpperCase() : '스프레드시트';
  if (/presentation|powerpoint/.test(type) || ['ppt', 'pptx', 'key'].includes(ext)) return ext ? ext.toUpperCase() : '프레젠테이션';
  if (/word|document/.test(type) || ['doc', 'docx', 'hwp', 'hwpx', 'odt'].includes(ext)) return ext ? ext.toUpperCase() : '문서';
  if (/zip|compressed|archive/.test(type) || ['zip', '7z', 'rar', 'tar', 'gz'].includes(ext)) return ext ? ext.toUpperCase() : '압축';
  if (/json/.test(type) || ext === 'json') return 'JSON';
  if (/text/.test(type) || ['txt', 'md', 'log'].includes(ext)) return ext ? ext.toUpperCase() : '텍스트';
  if (ext) return ext.toUpperCase();
  return '파일';
}
function getSteeringAttachmentThumbLabel(item) {
  const label = getSteeringFileKindLabel(item);
  return label.length > 4 ? 'FILE' : label;
}
function makeSteeringAttachment(file, options = {}) {
  if (!isSteeringAttachmentFile(file)) return null;
  const size = Math.max(0, Number(file.size) || 0);
  if (size > STEERING_FILE_MAX_BYTES) return { invalid: true, reason: 'too_large', file };
  const isImage = isSteeringImageFile(file);
  let previewUrl = '';
  if (isImage) {
    try { previewUrl = URL.createObjectURL(file); } catch (_) {}
  }
  return {
    id: steeringAttachmentSeq++,
    name: getSteeringFallbackFileName(file),
    size,
    type: String(file.type || ''),
    file,
    isImage,
    previewUrl,
    width: isImage ? Math.max(0, Number(options.width) || 0) : 0,
    height: isImage ? Math.max(0, Number(options.height) || 0) : 0,
    optimized: !!options.optimized,
    originalSize: Math.max(0, Number(options.originalSize) || 0),
  };
}
function getSteeringImageExtensionForType(type) {
  const raw = String(type || '').toLowerCase();
  if (raw.includes('png')) return 'png';
  if (raw.includes('webp')) return 'webp';
  if (raw.includes('gif')) return 'gif';
  return 'jpg';
}
function buildSteeringOptimizedFileName(name, type) {
  const raw = String(name || '').trim() || `image-${Date.now()}`;
  const nextExt = getSteeringImageExtensionForType(type);
  const stem = raw.replace(/\.[a-z0-9]{2,8}$/i, '') || `image-${Date.now()}`;
  return `${stem}.${nextExt}`;
}
function loadSteeringImageElement(file) {
  return new Promise((resolve) => {
    if (!file) {
      resolve(null);
      return;
    }
    let objectUrl = '';
    try { objectUrl = URL.createObjectURL(file); } catch (_) {
      resolve(null);
      return;
    }
    const img = new Image();
    const done = (value) => {
      if (!value) {
        try { if (objectUrl) URL.revokeObjectURL(objectUrl); } catch (_) {}
      }
      resolve(value || null);
    };
    img.onload = () => {
      done({
        img,
        objectUrl,
        width: Math.max(0, Number(img.naturalWidth) || 0),
        height: Math.max(0, Number(img.naturalHeight) || 0),
      });
    };
    img.onerror = () => done(null);
    try { img.src = objectUrl; } catch (_) { done(null); }
  });
}
function canvasToBlobAsync(canvas, type, quality) {
  return new Promise((resolve) => {
    try { canvas.toBlob((blob) => resolve(blob || null), type, quality); } catch (_) { resolve(null); }
  });
}
async function optimizeSteeringImageFile(file) {
  if (!isSteeringImageFile(file)) {
    return { file, optimized: false, width: 0, height: 0, originalSize: Math.max(0, Number(file?.size) || 0) };
  }
  const loaded = await loadSteeringImageElement(file);
  const width = Math.max(0, Number(loaded?.width) || 0);
  const height = Math.max(0, Number(loaded?.height) || 0);
  const size = Math.max(0, Number(file.size) || 0);
  try {
    return { file, optimized: false, width, height, originalSize: size };
  } finally {
    try { if (loaded?.objectUrl) URL.revokeObjectURL(loaded.objectUrl); } catch (_) {}
  }
}
function getSteeringAttachmentMetaText(item) {
  const parts = [];
  const kind = getSteeringFileKindLabel(item);
  if (kind) parts.push(kind);
  const width = Math.max(0, Number(item?.width) || 0);
  const height = Math.max(0, Number(item?.height) || 0);
  if (item?.isImage && width && height) parts.push(`${width}×${height}`);
  parts.push(formatSteeringBytes(item?.size));
  return parts.join(' · ');
}
function moveSteeringAttachment(attachmentId, direction) {
  const index = steeringAttachments.findIndex((item) => item?.id === attachmentId);
  if (index < 0) return false;
  const nextIndex = index + (direction < 0 ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= steeringAttachments.length) return false;
  const cloned = steeringAttachments.slice();
  const [picked] = cloned.splice(index, 1);
  cloned.splice(nextIndex, 0, picked);
  steeringAttachments = cloned;
  updateSteeringUi();
  return true;
}
function openSteeringAttachmentPreview(attachmentId) {
  steeringPreviewAttachmentId = attachmentId;
  syncSteeringAttachmentPreview();
}
function closeSteeringAttachmentPreview() {
  steeringPreviewAttachmentId = null;
  syncSteeringAttachmentPreview();
}
function stepSteeringAttachmentPreview(direction) {
  if (!steeringAttachments.length) {
    closeSteeringAttachmentPreview();
    return;
  }
  const currentIndex = steeringAttachments.findIndex((item) => item?.id === steeringPreviewAttachmentId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (safeIndex + (direction < 0 ? -1 : 1) + steeringAttachments.length) % steeringAttachments.length;
  steeringPreviewAttachmentId = steeringAttachments[nextIndex]?.id || null;
  syncSteeringAttachmentPreview();
}
function renderSteeringTemplates() {
  const refs = steeringRefs;
  if (!refs?.templateWrap || !refs?.templateList) return;
  const templates = normalizeSteeringTemplates(steeringTemplates);
  steeringTemplates = templates;
  refs.templateWrap.style.display = templates.length ? 'flex' : 'none';
  if (refs.templateMeta) refs.templateMeta.textContent = templates.length ? `등록 ${templates.length}개 · 툴팁 확인 가능` : '등록된 템플릿 없음';
  const signature = JSON.stringify(templates.map((item) => [item.id, item.name, item.text, item.tooltip]));
  if (signature === steeringTemplateRenderSignature) return;
  steeringTemplateRenderSignature = signature;
  refs.templateList.innerHTML = '';
  templates.forEach((template) => {
    const btn = document.createElement('button');
    btn.className = 'template-btn';
    btn.type = 'button';
    btn.textContent = template.name || '템플릿';
    const tooltip = getSteeringTemplateTooltip(template);
    btn.title = tooltip;
    btn.setAttribute('aria-label', tooltip || template.name || '템플릿');
    btn.addEventListener('click', (event) => {
      try { event.preventDefault(); } catch (_) {}
      try { event.stopPropagation(); } catch (_) {}
      enqueueSteeringPrompt(template.text);
      setSteeringStatus(`템플릿 대기 추가: ${template.name || truncateSteeringText(template.text, 18)}`);
      if (!steeringPanelOpen) steeringPanelOpen = true;
      updateSteeringUi();
    });
    refs.templateList.appendChild(btn);
  });
}
function syncSteeringAttachmentPreview() {
  const overlay = steeringRefs?.attachmentPreview;
  const imageEl = steeringRefs?.attachmentPreviewImage;
  const fileEl = steeringRefs?.attachmentPreviewFile;
  const fileIconEl = steeringRefs?.attachmentPreviewFileIcon;
  const fileNameEl = steeringRefs?.attachmentPreviewFileName;
  const fileHintEl = steeringRefs?.attachmentPreviewFileHint;
  const titleEl = steeringRefs?.attachmentPreviewTitle;
  const metaEl = steeringRefs?.attachmentPreviewMeta;
  const prevBtn = steeringRefs?.attachmentPreviewPrev;
  const nextBtn = steeringRefs?.attachmentPreviewNext;
  if (!overlay || !imageEl || !metaEl) return;
  const active = steeringAttachments.find((item) => item?.id === steeringPreviewAttachmentId) || null;
  const showNav = steeringAttachments.length > 1;
  const isImagePreview = !!(active?.isImage && active?.previewUrl);
  const signature = active ? JSON.stringify([active.id, active.previewUrl || '', active.name || '', active.type || '', active.size || 0, active.width || 0, active.height || 0, !!active.optimized, !!active.isImage, showNav]) : 'hidden';
  if (steeringPreviewRenderSignature === signature) return;
  steeringPreviewRenderSignature = signature;
  if (!active) {
    overlay.hidden = true;
    imageEl.hidden = false;
    if (imageEl.getAttribute('src')) imageEl.removeAttribute('src');
    imageEl.alt = 'attachment preview';
    if (fileEl) fileEl.hidden = true;
    if (fileIconEl) fileIconEl.textContent = 'FILE';
    if (fileNameEl) fileNameEl.textContent = '';
    if (fileHintEl) fileHintEl.textContent = '';
    if (titleEl) titleEl.textContent = '첨부 미리보기';
    if (metaEl.textContent) metaEl.textContent = '';
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    return;
  }
  overlay.hidden = false;
  if (titleEl) titleEl.textContent = isImagePreview ? '이미지 미리보기' : '파일 첨부 정보';
  if (isImagePreview) {
    imageEl.hidden = false;
    if (fileEl) fileEl.hidden = true;
    if ((imageEl.getAttribute('src') || '') !== (active.previewUrl || '')) imageEl.src = active.previewUrl;
    imageEl.alt = active.name || 'attachment preview';
  } else {
    if (imageEl.getAttribute('src')) imageEl.removeAttribute('src');
    imageEl.hidden = true;
    if (fileEl) fileEl.hidden = false;
    if (fileIconEl) fileIconEl.textContent = getSteeringAttachmentThumbLabel(active);
    if (fileNameEl) fileNameEl.textContent = active.name || '파일';
    if (fileHintEl) fileHintEl.textContent = '이미지가 아닌 파일은 썸네일 대신 첨부 정보만 표시됩니다.';
  }
  const nextMeta = String(active.name || '파일') + ' · ' + getSteeringAttachmentMetaText(active);
  if (metaEl.textContent !== nextMeta) metaEl.textContent = nextMeta;
  if (prevBtn) prevBtn.style.display = showNav ? 'inline-flex' : 'none';
  if (nextBtn) nextBtn.style.display = showNav ? 'inline-flex' : 'none';
}
function revokeSteeringAttachment(attachment) {
  const url = String(attachment?.previewUrl || '');
  if (!url) return;
  try { URL.revokeObjectURL(url); } catch (_) {}
}
function getSteeringDraftAttachmentCount() {
  return Math.max(0, steeringAttachments.length || 0);
}
function getSteeringQueueAttachments(item) {
  if (Array.isArray(item?.files)) return item.files.filter((entry) => entry?.file);
  if (Array.isArray(item?.images)) return item.images.filter((entry) => entry?.file);
  return [];
}
function getSteeringItemAttachmentCount(item) {
  return (Array.isArray(item?.files) ? item.files : (Array.isArray(item?.images) ? item.images : [])).length;
}
function getSteeringItemSummary(item) {
  const text = String(item?.text || '').trim();
  const fileCount = getSteeringItemAttachmentCount(item);
  const fileLabel = fileCount ? `파일 ${fileCount}` : '';
  if (text && fileLabel) return `${text} · ${fileLabel}`;
  if (text) return text;
  if (fileLabel) return fileLabel;
  return '비어 있는 대기';
}
function removeSteeringAttachment(attachmentId, options = {}) {
  const index = steeringAttachments.findIndex((item) => item?.id === attachmentId);
  if (index < 0) return false;
  const [picked] = steeringAttachments.splice(index, 1);
  revokeSteeringAttachment(picked);
  if (steeringPreviewAttachmentId === attachmentId) {
    steeringPreviewAttachmentId = steeringAttachments[Math.min(index, steeringAttachments.length - 1)]?.id || null;
  }
  if (!options.silent) {
    const count = getSteeringDraftAttachmentCount();
    setSteeringStatus(count ? `파일 ${count}개 준비됨` : '파일을 제거했습니다.');
  }
  updateSteeringUi();
  return true;
}
function clearSteeringDraftAttachments(options = {}) {
  const list = steeringAttachments.slice();
  steeringAttachments = [];
  steeringPreviewAttachmentId = null;
  list.forEach((item) => revokeSteeringAttachment(item));
  try { if (!options.keepFileInputValue && steeringRefs?.fileInput) steeringRefs.fileInput.value = ''; } catch (_) {}
  syncSteeringAttachmentPreview();
}
function extractSteeringFilesFromTransfer(dataTransfer) {
  const files = [];
  const seen = new Set();
  const addFile = (file) => {
    if (!isSteeringAttachmentFile(file)) return;
    const key = getSteeringFileIdentity(file);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    files.push(file);
  };
  if (!dataTransfer) return files;
  try {
    const direct = Array.from(dataTransfer.files || []);
    for (const file of direct) addFile(file);
  } catch (_) {}
  try {
    const items = Array.from(dataTransfer.items || []);
    for (const item of items) {
      if (!item || item.kind !== 'file') continue;
      const file = item.getAsFile?.();
      addFile(file);
    }
  } catch (_) {}
  return files;
}
function cloneSteeringDroppedFolderFile(file, relativePath) {
  if (!isSteeringAttachmentFile(file)) return file;
  const path = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!path || path === String(file.name || '')) return file;
  try {
    if (typeof File !== 'undefined') {
      return new File([file], path, { type: file.type || '', lastModified: file.lastModified || Date.now() });
    }
  } catch (_) {}
  return file;
}
function readSteeringFileEntry(entry, relativePath = '', options = {}) {
  return new Promise((resolve) => {
    if (!entry) {
      resolve([]);
      return;
    }
    const limit = Math.max(STEERING_ATTACHMENT_LIMIT, Number(options.limit) || 64);
    if (Array.isArray(options.results) && options.results.length >= limit) {
      resolve([]);
      return;
    }
    if (entry.isFile) {
      try {
        entry.file((file) => {
          const name = String(file?.name || entry.name || '').trim();
          const path = [relativePath, name].filter(Boolean).join('/');
          resolve(file ? [cloneSteeringDroppedFolderFile(file, path)] : []);
        }, () => resolve([]));
      } catch (_) {
        resolve([]);
      }
      return;
    }
    if (!entry.isDirectory || !entry.createReader) {
      resolve([]);
      return;
    }
    const reader = entry.createReader();
    const dirPath = [relativePath, entry.name || ''].filter(Boolean).join('/');
    const out = [];
    const pump = () => {
      if (out.length >= limit) {
        resolve(out.slice(0, limit));
        return;
      }
      try {
        reader.readEntries(async (entries) => {
          if (!entries || !entries.length) {
            resolve(out.slice(0, limit));
            return;
          }
          for (const child of entries) {
            if (out.length >= limit) break;
            const childFiles = await readSteeringFileEntry(child, dirPath, { ...options, results: out, limit });
            for (const file of childFiles) {
              if (out.length >= limit) break;
              out.push(file);
            }
          }
          pump();
        }, () => resolve(out.slice(0, limit)));
      } catch (_) {
        resolve(out.slice(0, limit));
      }
    };
    pump();
  });
}
async function extractSteeringFilesFromTransferAsync(dataTransfer, options = {}) {
  const limit = Math.max(STEERING_ATTACHMENT_LIMIT, Number(options.limit) || 64);
  const out = [];
  const seen = new Set();
  const addFile = (file) => {
    if (!isSteeringAttachmentFile(file)) return;
    const key = getSteeringFileIdentity(file);
    if (key && seen.has(key)) return;
    if (key) seen.add(key);
    if (out.length < limit) out.push(file);
  };
  for (const file of extractSteeringFilesFromTransfer(dataTransfer)) addFile(file);
  try {
    const items = Array.from(dataTransfer?.items || []);
    for (const item of items) {
      if (!item || item.kind !== 'file') continue;
      const entry = item.webkitGetAsEntry?.();
      if (!entry || !entry.isDirectory) continue;
      const files = await readSteeringFileEntry(entry, '', { limit });
      for (const file of files) addFile(file);
      if (out.length >= limit) break;
    }
  } catch (_) {}
  return out;
}
function extractImageFilesFromTransfer(dataTransfer) {
  return extractSteeringFilesFromTransfer(dataTransfer).filter((file) => isSteeringImageFile(file));
}
async function addSteeringAttachments(inputFiles, options = {}) {
  const incomingRaw = Array.from(inputFiles || []).filter((file) => isSteeringAttachmentFile(file));
  if (!incomingRaw.length) {
    if (!options.silent) setSteeringStatus('추가할 파일을 찾지 못했습니다.', true);
    return { added: 0, skipped: 0, duplicates: 0, optimized: 0, total: getSteeringDraftAttachmentCount() };
  }
  const seenIncoming = new Set();
  const incoming = [];
  let skippedDuplicate = 0;
  for (const file of incomingRaw) {
    const key = getSteeringFileIdentity(file);
    if (key && (seenIncoming.has(key) || hasSteeringAttachmentDuplicate(file))) {
      skippedDuplicate += 1;
      continue;
    }
    if (key) seenIncoming.add(key);
    incoming.push(file);
  }
  if (!incoming.length) {
    try { if (steeringRefs?.fileInput) steeringRefs.fileInput.value = ''; } catch (_) {}
    if (!options.silent) setSteeringStatus(`이미 추가된 파일입니다. · 총 ${getSteeringDraftAttachmentCount()}개`, true);
    updateSteeringUi();
    return { added: 0, skipped: skippedDuplicate, duplicates: skippedDuplicate, optimized: 0, total: getSteeringDraftAttachmentCount() };
  }
  const room = Math.max(0, STEERING_ATTACHMENT_LIMIT - steeringAttachments.length);
  const accepted = incoming.slice(0, room);
  const skippedLimit = Math.max(0, incoming.length - accepted.length);
  let added = 0;
  let skippedInvalid = 0;
  let optimizedCount = 0;
  if (!options.silent && accepted.length > 1) setSteeringStatus(`파일 ${accepted.length}개 준비 중`);
  for (const file of accepted) {
    const prepared = isSteeringImageFile(file) ? await optimizeSteeringImageFile(file) : { file, optimized: false, width: 0, height: 0, originalSize: Math.max(0, Number(file?.size) || 0) };
    const attachment = makeSteeringAttachment(prepared.file, prepared);
    if (!attachment || attachment.invalid) {
      skippedInvalid += 1;
      continue;
    }
    if (prepared.optimized) optimizedCount += 1;
    steeringAttachments = [...steeringAttachments, attachment];
    added += 1;
  }
  try { if (steeringRefs?.fileInput) steeringRefs.fileInput.value = ''; } catch (_) {}
  if (!options.silent) {
    if (added) {
      const total = getSteeringDraftAttachmentCount();
      const extras = [];
      if (skippedDuplicate) extras.push(`중복 ${skippedDuplicate}`);
      if (skippedLimit) extras.push(`개수제한 ${skippedLimit}`);
      if (skippedInvalid) extras.push(`용량초과 ${skippedInvalid}`);
      const extra = extras.length ? ` · 제외 ${extras.join(' · ')}` : '';
      setSteeringStatus(`파일 ${added}개 추가됨 · 총 ${total}개${extra}`);
    } else {
      const message = skippedInvalid ? '파일 용량이 너무 큽니다.' : (skippedLimit ? `최대 ${STEERING_ATTACHMENT_LIMIT}개까지 첨부할 수 있습니다.` : '추가할 파일을 찾지 못했습니다.');
      setSteeringStatus(message, true);
    }
  }
  updateSteeringUi();
  return { added, skipped: skippedLimit + skippedInvalid + skippedDuplicate, duplicates: skippedDuplicate, optimized: optimizedCount, total: getSteeringDraftAttachmentCount() };
}
