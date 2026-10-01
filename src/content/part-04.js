function findVisibleActionButton(selectors) {
  const blockWords = /(stop|중지|취소|cancel|abort)/i;
  for (const selector of selectors) {
    const candidates = qsa(selector);
    for (const el of candidates) {
      if (!el || !isVisible(el) || !isEnabledButtonLike(el)) continue;
      try {
        if (typeof isSteeringTargetNode === 'function' && isSteeringTargetNode(el)) continue;
      } catch (_) {}
      const aria = (el.getAttribute?.('aria-label') || '').trim();
      const title = (el.getAttribute?.('title') || '').trim();
      const tooltip = (el.getAttribute?.('mattooltip') || '').trim();
      const txt = (el.innerText || el.textContent || '').trim();
      const hay = `${aria} ${title} ${tooltip} ${txt}`.trim();
      if (blockWords.test(hay)) continue;
      return el;
    }
  }
  return null;
}
function getComposerSelectors(siteKey) {
  if (siteKey === 'chatgpt') {
    return [
      '#prompt-textarea',
      'textarea[data-testid="prompt-textarea"]',
      'textarea[data-testid*="prompt"]',
      'textarea[name="prompt"]',
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="메시지"]',
      'textarea[placeholder*="edit" i]',
      'textarea[placeholder*="image" i]',
      'div[contenteditable="true"][data-testid="prompt-textarea"]',
      'div[contenteditable="true"][data-testid*="prompt"]',
      'div[contenteditable="true"][role="textbox"]',
      '[role="dialog"] textarea',
      '[aria-modal="true"] textarea',
      'form textarea',
      'textarea',
    ];
  }
  if (siteKey === 'gemini') {
    return [
      'rich-textarea textarea',
      'rich-textarea div[contenteditable="true"]',
      'div[contenteditable="true"][aria-label*="메시지"]',
      'div[contenteditable="true"][aria-label*="prompt"]',
      'textarea[aria-label*="prompt"]',
      'textarea[aria-label*="메시지"]',
      'form textarea',
      'textarea',
    ];
  }
  if (siteKey === 'claude') {
    return [
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"][enterkeyhint="send"]',
      'div[contenteditable="true"][role="textbox"]',
      'form textarea',
      'textarea',
    ];
  }
  if (siteKey === 'aistudio') {
    return [
      'form textarea',
      'textarea',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
    ];
  }
  return [
    'form textarea:not([disabled]):not([readonly])',
    'textarea:not([disabled]):not([readonly])',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'input[type="text"]:not([disabled]):not([readonly])',
  ];
}
function getSendButtonSelectors(siteKey) {
  if (siteKey === 'chatgpt') {
    return [
      '[data-testid="send-button"]',
      'button[data-testid*="send"]',
      'button[data-testid*="submit"]',
      'button[aria-label*="Send message"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="Submit"]',
      'button[aria-label*="전송"]',
      'button[aria-label*="보내기"]',
      'form button[type="submit"]',
    ];
  }
  if (siteKey === 'gemini') {
    return [
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[aria-label*="전송"]',
      'button[aria-label*="보내기"]',
      'button[mattooltip*="Send"]',
      'button[mattooltip*="전송"]',
      'button[mattooltip*="보내기"]',
      'form button[type="submit"]',
    ];
  }
  if (siteKey === 'claude') {
    return [
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[data-testid*="send"]',
      'form button[type="submit"]',
    ];
  }
  return [
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[aria-label*="전송"]',
    'button[aria-label*="보내기"]',
    'form button[type="submit"]',
    'button[type="submit"]',
  ];
}
function scoreChatGptComposerCandidate(el, activeElement = document.activeElement) {
  if (!el || !isVisible(el)) return -999;
  try {
    if (typeof isSteeringTargetNode === 'function' && isSteeringTargetNode(el)) return -999;
  } catch (_) {}
  if (el.disabled === true || el.readOnly === true || el.getAttribute?.('aria-hidden') === 'true') return -999;
  const tagName = String(el.tagName || '').toLowerCase();
  const editable = tagName === 'textarea' || tagName === 'input' || el.isContentEditable || el.getAttribute?.('role') === 'textbox';
  if (!editable) return -999;
  const hay = [
    el.id,
    el.getAttribute?.('data-testid'),
    el.getAttribute?.('name'),
    el.getAttribute?.('placeholder'),
    el.getAttribute?.('aria-label'),
    el.getAttribute?.('role'),
    el.className,
  ].filter(Boolean).join(' ');
  if (/\bsearch\b|검색/i.test(hay)) return -999;
  let score = 0;
  if (el === activeElement) score += 120;
  if (/prompt-textarea/i.test(hay)) score += 42;
  if (/\bprompt\b|message|메시지|edit|image|이미지|수정/i.test(hay)) score += 18;
  if (el.getAttribute?.('role') === 'textbox') score += 8;
  if (tagName === 'textarea') score += 7;
  if (el.isContentEditable) score += 7;
  try {
    if (el.closest?.('[role="dialog"], [aria-modal="true"]')) score += 70;
    if (el.closest?.('form')) score += 10;
  } catch (_) {}
  return score;
}
function findBestChatGptComposer() {
  const selectors = getComposerSelectors('chatgpt');
  const seen = new Set();
  let best = null;
  let bestScore = -999;
  for (const selector of selectors) {
    const candidates = qsa(selector);
    for (const el of candidates) {
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (scoreChatGptComposerCandidate(el, null) < 18) continue;
      const score = scoreChatGptComposerCandidate(el);
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
  }
  return bestScore >= 18 ? best : null;
}
function getActiveComposer() {
  if (getSiteKey() === 'chatgpt' || isChatGptSafeMode()) return findBestChatGptComposer();
  return findVisibleEditable(getComposerSelectors(getSiteKey()));
}
function getActiveSendButton(composer = null) {
  const siteKey = getSiteKey() || (isChatGptSafeMode() ? 'chatgpt' : '');
  const targetComposer = composer || getActiveComposer();
  return findNearbySendButton(targetComposer) || findVisibleActionButton(getSendButtonSelectors(siteKey));
}
function getComposerSubmitForm(composer) {
  try {
    const form = composer?.closest?.('form');
    if (form && isVisible(form)) return form;
  } catch (_) {}
  return null;
}
function scoreSendButtonCandidate(el, composer) {
  if (!el || !isVisible(el) || !isEnabledButtonLike(el)) return -999;
  try {
    if (typeof isSteeringTargetNode === 'function' && isSteeringTargetNode(el)) return -999;
  } catch (_) {}
  const aria = (el.getAttribute?.('aria-label') || '').trim();
  const title = (el.getAttribute?.('title') || '').trim();
  const testId = (el.getAttribute?.('data-testid') || '').trim();
  const name = (el.getAttribute?.('name') || '').trim();
  const cls = (el.className || '').toString();
  const txt = (el.innerText || el.textContent || '').trim();
  const hay = `${aria} ${title} ${testId} ${name} ${cls} ${txt}`.trim();
  if (/(stop|중지|cancel|abort|voice|mic|upload|첨부|attachment|tool|menu|옵션|옵션열기|plus|더보기)/i.test(hay)) return -999;
  let score = 0;
  if (el.getAttribute?.('type') === 'submit') score += 7;
  if (/send|전송|보내기|submit|arrow-up|paper-plane/i.test(hay)) score += 6;
  if (/send/i.test(testId)) score += 5;
  const form = getComposerSubmitForm(composer);
  if (form && form.contains(el)) score += 3;
  try {
    if (composer) {
      const cr = composer.getBoundingClientRect();
      const br = el.getBoundingClientRect();
      const dx = Math.abs(br.right - cr.right);
      const dy = Math.abs((br.top + br.bottom) / 2 - (cr.top + cr.bottom) / 2);
      if (br.left >= cr.left - 120 && br.left <= cr.right + 240) score += 2;
      if (dx <= 260) score += 2;
      if (dy <= 120) score += 2;
    }
  } catch (_) {}
  return score;
}
function scoreAnySendButtonCandidate(el, composer) {
  if (!el || !isVisible(el)) return -999;
  try {
    if (typeof isSteeringTargetNode === 'function' && isSteeringTargetNode(el)) return -999;
  } catch (_) {}
  const aria = (el.getAttribute?.('aria-label') || '').trim();
  const title = (el.getAttribute?.('title') || '').trim();
  const testId = (el.getAttribute?.('data-testid') || '').trim();
  const name = (el.getAttribute?.('name') || '').trim();
  const cls = (el.className || '').toString();
  const txt = (el.innerText || el.textContent || '').trim();
  const hay = `${aria} ${title} ${testId} ${name} ${cls} ${txt}`.trim();
  if (/(stop|중지|cancel|abort|voice|mic|upload|첨부|attachment|tool|menu|옵션|옵션열기|plus|더보기)/i.test(hay)) return -999;
  let score = 0;
  if (el.getAttribute?.('type') === 'submit') score += 7;
  if (/send|전송|보내기|submit|arrow-up|paper-plane/i.test(hay)) score += 6;
  if (/send/i.test(testId)) score += 5;
  const form = getComposerSubmitForm(composer);
  if (form && form.contains(el)) score += 3;
  try {
    if (composer) {
      const cr = composer.getBoundingClientRect();
      const br = el.getBoundingClientRect();
      const dx = Math.abs(br.right - cr.right);
      const dy = Math.abs((br.top + br.bottom) / 2 - (cr.top + cr.bottom) / 2);
      if (br.left >= cr.left - 120 && br.left <= cr.right + 240) score += 2;
      if (dx <= 260) score += 2;
      if (dy <= 120) score += 2;
    }
  } catch (_) {}
  return score;
}
function findNearbySendButton(composer) {
  const form = getComposerSubmitForm(composer);
  const scopes = [form, composer?.parentElement, composer?.closest?.('[data-testid], section, main, article, div') || null, document];
  let best = null;
  let bestScore = -999;
  for (const scope of scopes) {
    if (!scope || typeof scope.querySelectorAll !== 'function') continue;
    const buttons = Array.from(scope.querySelectorAll('button, [role="button"], input[type="submit"]'));
    for (const btn of buttons) {
      const score = scoreSendButtonCandidate(btn, composer);
      if (score > bestScore) {
        best = btn;
        bestScore = score;
      }
    }
    if (best && bestScore >= 4) return best;
  }
  return bestScore >= 4 ? best : null;
}
function findNearbySendButtonAnyState(composer) {
  const form = getComposerSubmitForm(composer);
  const scopes = [form, composer?.parentElement, composer?.closest?.('[data-testid], section, main, article, div') || null, document];
  let best = null;
  let bestScore = -999;
  for (const scope of scopes) {
    if (!scope || typeof scope.querySelectorAll !== 'function') continue;
    const buttons = Array.from(scope.querySelectorAll('button, [role="button"], input[type="submit"]'));
    for (const btn of buttons) {
      const score = scoreAnySendButtonCandidate(btn, composer);
      if (score > bestScore) {
        best = btn;
        bestScore = score;
      }
    }
    if (best && bestScore >= 4) return best;
  }
  return bestScore >= 4 ? best : null;
}
function dispatchTextEvents(el, value = '') {
  if (!el) return;
  const data = String(value || '');
  const beforeInputInit = { bubbles: true, cancelable: true, data, inputType: 'insertReplacementText' };
  try { el.dispatchEvent(new InputEvent('beforeinput', beforeInputInit)); } catch (_) {}
  const inputEventInit = { bubbles: true, cancelable: true, data, inputType: 'insertText' };
  try { el.dispatchEvent(new InputEvent('input', inputEventInit)); } catch (_) {
    try { el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true })); } catch (_) {}
  }
  try { el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true })); } catch (_) {}
}
function dispatchSubmitKey(el, extra = {}) {
  if (!el) return false;
  const eventInit = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', which: 13, keyCode: 13, ...extra };
  try {
    const down = new KeyboardEvent('keydown', eventInit);
    const accepted = el.dispatchEvent(down);
    const press = new KeyboardEvent('keypress', eventInit);
    el.dispatchEvent(press);
    const up = new KeyboardEvent('keyup', eventInit);
    el.dispatchEvent(up);
    return accepted !== false;
  } catch (_) {
    return false;
  }
}
function requestSubmitComposer(composer) {
  const form = getComposerSubmitForm(composer);
  if (!form) return false;
  try {
    if (typeof form.requestSubmit === 'function') {
      const submitter = findNearbySendButton(composer) || getActiveSendButton(composer) || undefined;
      form.requestSubmit(submitter);
      return true;
    }
  } catch (_) {}
  try {
    const ev = new Event('submit', { bubbles: true, cancelable: true });
    return form.dispatchEvent(ev) !== false;
  } catch (_) {
    return false;
  }
}
function setControlValue(el, value) {
  if (!el) return false;
  const nextValue = String(value || '');
  const tagName = String(el.tagName || '').toLowerCase();
  const isTextControl = tagName === 'textarea' || (tagName === 'input' && /^(text|search|url|email)$/i.test(el.type || 'text'));
  try { el.focus({ preventScroll: false }); } catch (_) {}
  if (isTextControl) {
    try {
      const proto = tagName === 'textarea'
        ? window.HTMLTextAreaElement?.prototype
        : window.HTMLInputElement?.prototype;
      const setter = proto && Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, nextValue);
      else el.value = nextValue;
      dispatchTextEvents(el, nextValue);
      try {
        const len = nextValue.length;
        if (typeof el.setSelectionRange === 'function') el.setSelectionRange(len, len);
      } catch (_) {}
      return true;
    } catch (_) {}
  }
  if (el.isContentEditable) {
    try {
      const siteKey = typeof getSiteKey === 'function' ? getSiteKey() : '';
      const googleRichEditor = siteKey === 'gemini' && el.matches?.('.ql-editor, rich-textarea [contenteditable="true"]');
      // Gemini의 Quill 루트를 isolated world에서 직접 다시 쓰면 내부 문서 모델과
      // DOM이 어긋나 렌더러가 재조정을 반복할 수 있다. Google 입력은 background의
      // trusted Input.insertText 경로만 사용하고 여기서는 안전하게 중단한다.
      if (googleRichEditor) return false;
      const selection = window.getSelection?.();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges?.();
      selection?.addRange?.(range);
      const inserted = document.execCommand('insertText', false, nextValue);
      if (!inserted || String(el.innerText || '').trim() !== nextValue.trim()) {
        el.textContent = '';
        const textNode = document.createTextNode(nextValue);
        el.appendChild(textNode);
      }
      dispatchTextEvents(el, nextValue);
      return true;
    } catch (_) {
      try {
        el.textContent = nextValue;
        dispatchTextEvents(el, nextValue);
        return true;
      } catch (_) {}
    }
  }
  return false;
}
function waitForSteeringTick(ms = 80) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
function getChatGptUserTurnSnapshot() {
  const nodes = Array.from(document.querySelectorAll('[data-message-author-role="user"]'));
  const last = nodes[nodes.length - 1];
  return { count: nodes.length, identity: last?.getAttribute?.('data-message-id') || last?.closest?.('[data-testid^="conversation-turn-"]')?.getAttribute?.('data-testid') || '', text: String(last?.textContent || '').replace(/\s+/g, ' ').trim() };
}
async function waitForSubmissionStart(composer, beforeText, timeout = 900, options = {}) {
  const baseline = String(beforeText || '').trim();
  const hadConversationTurns = !!options.hadConversationTurns;
  const beforeUrl = String(options.beforeUrl || location.href || '');
  const deadline = Date.now() + Math.max(120, timeout);
  while (Date.now() <= deadline) {
    if (options.sessionToken && options.sessionToken !== steeringConversationSessionToken) return false;
    try { maybeRescanShadowRoots(); } catch (_) {}
    const current = String(getCurrentComposerText(composer) || '').trim();
    if (options.chatGptUserBaseline) {
      const before = options.chatGptUserBaseline;
      const after = getChatGptUserTurnSnapshot();
      const advanced = after.count > before.count || (!!after.identity && after.identity !== before.identity && after.count >= before.count);
      if (advanced && (!baseline || after.text.includes(baseline.replace(/\s+/g, ' ')))) return true;
      await waitForSteeringTick(70);
      continue;
    }
    if (!current && baseline) return true;
    if (!options.ignoreExistingGeneration) {
      try {
        if (activeSite && detectGenerating(activeSite)) return true;
      } catch (_) {}
    }
    try {
      if (!hadConversationTurns && typeof hasChatGptConversationTurns === 'function' && hasChatGptConversationTurns()) return true;
    } catch (_) {}
    try {
      if (beforeUrl && location.href !== beforeUrl && !current) return true;
    } catch (_) {}
    await waitForSteeringTick(70);
  }
  return false;
}
