const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const part02 = fs.readFileSync(path.join(root, 'src', 'content', 'part-02.js'), 'utf8');
const part04 = fs.readFileSync(path.join(root, 'src', 'content', 'part-04.js'), 'utf8');
const part07 = fs.readFileSync(path.join(root, 'src', 'content', 'part-07.js'), 'utf8');
const part11 = fs.readFileSync(path.join(root, 'src', 'content', 'part-11.js'), 'utf8');

function extractFunction(source, name) {
  const match = source.match(new RegExp(`(?:async\\s+)?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

function makeElement(options = {}) {
  const attrs = { ...(options.attrs || {}) };
  return {
    tagName: options.tagName || 'DIV',
    className: options.className || '',
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    isContentEditable: !!options.isContentEditable,
    isConnected: options.isConnected !== false,
    text: options.text || '',
    getAttribute(name) { return attrs[name] ?? null; },
    closest(selector) {
      if (/role="dialog"|aria-modal/.test(selector)) return options.inDialog ? { role: 'dialog' } : null;
      if (selector === 'form') return options.inForm ? { tagName: 'FORM' } : null;
      return null;
    },
  };
}

const policyContext = { document: { activeElement: null } };
vm.createContext(policyContext);
vm.runInContext(
  `${extractFunction(part04, 'getComposerSelectors')}\n`
    + `${extractFunction(part04, 'scoreChatGptComposerCandidate')}\n`
    + `${extractFunction(part04, 'findBestChatGptComposer')}\n`
    + `${extractFunction(part11, 'getChatGptNativeComposerEnterPlan')}\n`
    + 'this.scoreComposer = scoreChatGptComposerCandidate;\n'
    + 'this.findBestComposer = findBestChatGptComposer;\n'
    + 'this.enterPlan = getChatGptNativeComposerEnterPlan;',
  policyContext
);
policyContext.isVisible = () => true;
policyContext.isSteeringTargetNode = () => false;

const mainComposer = makeElement({
  isContentEditable: true,
  attrs: { id: 'prompt-textarea', role: 'textbox', 'data-testid': 'prompt-textarea' },
  inForm: true,
});
const imageEditorComposer = makeElement({
  tagName: 'TEXTAREA',
  attrs: { placeholder: 'Describe the image edit', name: 'prompt' },
  inDialog: true,
  inForm: true,
});
const unrelatedTextarea = makeElement({ tagName: 'TEXTAREA' });
assert.ok(
  policyContext.scoreComposer(imageEditorComposer, null) > policyContext.scoreComposer(mainComposer, null),
  'the image editor dialog wins over the background conversation composer'
);
assert.ok(policyContext.scoreComposer(mainComposer, null) >= 18, 'the normal ChatGPT composer remains eligible');
assert.ok(policyContext.scoreComposer(unrelatedTextarea, null) < 18, 'an unrelated textarea is not treated as a ChatGPT composer');
assert.equal(
  policyContext.scoreComposer(makeElement({ tagName: 'TEXTAREA', attrs: { placeholder: 'Search chats' } }), null),
  -999,
  'the chat search field is explicitly excluded'
);
policyContext.qsa = (selector) => {
  if (selector === '#prompt-textarea') return [mainComposer];
  if (String(selector).includes('[role="dialog"]')) return [imageEditorComposer];
  if (selector === 'textarea') return [imageEditorComposer, unrelatedTextarea];
  return [];
};
assert.equal(policyContext.findBestComposer(), imageEditorComposer, 'the production selector chooses the image editor modal');

const planCases = [
  ['Ctrl+Enter is rescued while Ready_Ai is disabled', { key: 'Enter', ctrlKey: true }, { monitoring: false, steeringEnabled: false, generating: false }, 'native_fallback', false],
  ['Cmd+Enter is rescued while idle', { key: 'Enter', metaKey: true }, { monitoring: true, steeringEnabled: true, generating: false }, 'native_fallback', false],
  ['Ctrl+Enter interrupts only when immediate steering is enabled', { key: 'Enter', ctrlKey: true }, { monitoring: true, steeringEnabled: true, generating: true }, 'native_fallback', true],
  ['Ctrl+Enter never interrupts when steering is disabled', { key: 'Enter', ctrlKey: true }, { monitoring: true, steeringEnabled: false, generating: true }, 'native_fallback', false],
  ['plain Enter queues during generation', { key: 'Enter' }, { monitoring: true, steeringEnabled: true, generating: true }, 'queue', false],
  ['plain Enter queues during the Ctrl+Enter handoff', { key: 'Enter' }, { monitoring: true, steeringEnabled: true, generating: false, awaitingImmediateResponse: true }, 'queue', false],
  ['the handoff does not capture Enter while steering is disabled', { key: 'Enter' }, { monitoring: true, steeringEnabled: false, generating: false, awaitingImmediateResponse: true }, 'ignore', false],
  ['plain Enter stays native while idle', { key: 'Enter' }, { monitoring: true, steeringEnabled: true, generating: false }, 'ignore', false],
  ['Shift+Enter keeps a line break', { key: 'Enter', shiftKey: true }, { monitoring: true, steeringEnabled: true, generating: true }, 'ignore', false],
];
for (const [label, event, options, expectedMode, expectedInterrupt] of planCases) {
  const plan = policyContext.enterPlan(event, options);
  assert.equal(plan.mode, expectedMode, label);
  assert.equal(plan.interruptExistingGeneration, expectedInterrupt, `${label}: interrupt policy`);
}

const imageDetectionContext = {};
vm.createContext(imageDetectionContext);
const imageVars = [
  'CHATGPT_IMAGE_GENERATING_RE',
  'CHATGPT_STOP_SELECTOR',
  'CHATGPT_IMAGE_STATUS_SELECTOR',
  'CHATGPT_TURN_SELECTOR',
  'CHATGPT_PROGRESS_SELECTOR',
].map((name) => {
  const match = part11.match(new RegExp(`var ${name} = [^;]+;`));
  assert.ok(match, `${name} declaration was not found`);
  return match[0];
}).join('\n');
vm.runInContext(
  `${imageVars}\n`
    + `${extractFunction(part11, 'getElementSignalText')}\n`
    + `${extractFunction(part11, 'hasChatGptImageGenerationSignal')}\n`
    + `${extractFunction(part11, 'hasChatGptProgressIndicator')}\n`
    + `${extractFunction(part11, 'getVisibleChatGptTurnCandidates')}\n`
    + `${extractFunction(part11, 'isLikelyUserChatGptTurn')}\n`
    + `${extractFunction(part11, 'detectChatGPTImageGenerating')}\n`
    + `${extractFunction(part11, 'detectChatGPTGenerating')}\n`
    + 'this.detect = detectChatGPTGenerating;',
  imageDetectionContext
);
imageDetectionContext.isVisible = () => true;
imageDetectionContext.isEnabledButtonLike = () => true;
let statusText = '';
const statusElement = {
  textContent: '',
  getAttribute(name) { return name === 'aria-label' ? statusText : ''; },
  matches() { return false; },
  querySelectorAll() { return []; },
};
imageDetectionContext.qsa = (selector) => {
  if (String(selector).includes('stop-button')) return [];
  if (String(selector).includes('[role="status"]')) return statusText ? [statusElement] : [];
  return [];
};
for (const signal of ['Editing image', 'Applying image edits', 'Processing the image', '이미지 수정 중']) {
  statusText = signal;
  assert.equal(imageDetectionContext.detect(), true, `image activity is detected: ${signal}`);
}
statusText = 'Image ready';
assert.equal(imageDetectionContext.detect(), false, 'a completed image does not look active');
statusText = 'Image editor';
assert.equal(imageDetectionContext.detect(), false, 'the open image editor alone does not look active');
for (const completedSignal of ['Image generated', 'Image is created', '이미지 수정 완료']) {
  statusText = completedSignal;
  assert.equal(imageDetectionContext.detect(), false, `completed image status is ignored: ${completedSignal}`);
}

const sendContext = {};
vm.createContext(sendContext);
vm.runInContext(
  `${extractFunction(part07, 'getVisibleChatGptStopButton')}\n`
    + `${extractFunction(part07, 'waitForChatGptComposerSubmissionStart')}\n`
    + `${extractFunction(part07, 'sendChatGptImmediateViaStableControls')}\n`
    + 'this.sendStable = sendChatGptImmediateViaStableControls;',
  sendContext
);

async function testImageEditorStableSend() {
  let stopClicks = 0;
  let sendClicks = 0;
  let userTurnCount = 0;
  const stopButton = { click() { stopClicks += 1; } };
  const composer = { text: '배경만 흐리게 수정', isConnected: true };
  const sendButton = {
    enabled: true,
    isConnected: true,
    click() {
      sendClicks += 1;
      composer.isConnected = false;
    },
  };
  sendContext.CHATGPT_STOP_SELECTOR = '[data-testid="stop-button"]';
  sendContext.document = { querySelectorAll: () => [stopButton] };
  sendContext.isVisible = () => true;
  sendContext.isEnabledButtonLike = (target) => target?.enabled !== false;
  sendContext.waitForSteeringTick = async () => {};
  sendContext.getCurrentComposerText = (target) => target.text;
  sendContext.setControlValue = (target, value) => { target.text = value; return true; };
  sendContext.waitForSteeringComposerText = async (target, value) => ({ ok: target.text === value });
  sendContext.countRecentChatGptUserTurnText = () => userTurnCount;
  sendContext.detectChatGptGeneratingLight = () => false;
  sendContext.findNearbySendButton = () => sendButton;
  sendContext.getActiveSendButton = () => null;
  sendContext.getActiveComposer = () => composer;
  sendContext.requestSubmitComposer = () => false;
  sendContext.dispatchSubmitKey = () => false;

  const result = await sendContext.sendStable(composer, composer.text, 3000, { interruptExistingGeneration: false });
  assert.equal(result.ok, true, 'closing the image editor after submit counts as success');
  assert.equal(sendClicks, 1, 'the image edit is submitted exactly once');
  assert.equal(stopClicks, 0, 'Ready_Ai-off rescue never interrupts another response');

  composer.isConnected = true;
  composer.text = '선택 부분만 밝게';
  sendClicks = 0;
  sendButton.enabled = true;
  sendButton.click = () => {
    sendClicks += 1;
    sendButton.enabled = false;
  };
  const disabledResult = await sendContext.sendStable(composer, composer.text, 3000, { interruptExistingGeneration: false });
  assert.equal(disabledResult.ok, true, 'a disabled send control confirms image-edit submission');
  assert.equal(sendClicks, 1, 'button-state confirmation also avoids duplicate submissions');

  composer.text = '대화 패널로 수정';
  sendButton.enabled = true;
  sendButton.click = () => { userTurnCount += 1; };
  const turnResult = await sendContext.sendStable(composer, composer.text, 3000, { interruptExistingGeneration: false });
  assert.equal(turnResult.ok, true, 'conversation-panel image edits still confirm through a user turn');
}

const uploadContext = {};
vm.createContext(uploadContext);
vm.runInContext(
  `${extractFunction(part07, 'waitForSteeringAttachmentUploadReady')}\n`
    + 'this.waitUpload = waitForSteeringAttachmentUploadReady;',
  uploadContext
);
async function testImageUploadSettling() {
  let clock = 0;
  let probe = 0;
  const states = [
    { pending: true, sendFound: true, sendEnabled: false },
    { pending: false, sendFound: true, sendEnabled: false },
    { pending: false, sendFound: true, sendEnabled: true },
    { pending: false, sendFound: true, sendEnabled: true },
  ];
  uploadContext.Date = { now: () => { clock += 260; return clock; } };
  uploadContext.maybeRescanShadowRoots = () => {};
  uploadContext.getSteeringAttachmentUploadState = () => states[Math.min(probe++, states.length - 1)];
  uploadContext.waitForSteeringTick = async () => {};
  const result = await uploadContext.waitUpload({}, { timeout: 5000, minWait: 320, settleWindow: 360 });
  assert.equal(result.ok, true, 'upload readiness waits through pending and disabled states');
  assert.equal(result.sawPending, true, 'the pending upload was observed');
  assert.equal(result.sawDisabledSend, true, 'the disabled image send button was observed');
}

assert.match(part02, /detectChatGPTImageGenerating/);
assert.match(part04, /findNearbySendButton\(targetComposer\) \|\| findVisibleActionButton/);
assert.match(part07, /composer\?\.isConnected === false/);
assert.match(part11, /interruptExistingGeneration: !!\(readyAiQueueEnabled && generating\)/);

Promise.all([testImageEditorStableSend(), testImageUploadSettling()])
  .then(() => console.log(`Ready_Ai ChatGPT image editing: ${planCases.length + 22} cases passed`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
