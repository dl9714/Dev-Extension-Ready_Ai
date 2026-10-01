const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const part11 = fs.readFileSync(path.join(root, 'src', 'content', 'part-11.js'), 'utf8');

function extractFunction(source, name) {
  const match = source.match(new RegExp(`(?:async\\s+)?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

const declarations = [
  'chatGptNativeComposerImmediateFallbackTimer',
  'chatGptNativeComposerImmediateFallbackSending',
  'chatGptNativeComposerImmediateHandoffUntil',
  'CHATGPT_NATIVE_COMPOSER_IMMEDIATE_HANDOFF_MS',
  'chatGptNativeComposerRecentSubmitSignature',
  'chatGptNativeComposerRecentSubmitAt',
  'chatGptNativeComposerRecentSubmitTarget',
  'CHATGPT_NATIVE_COMPOSER_REPEAT_DEDUPE_MS',
].map((name) => {
  const match = part11.match(new RegExp(`var ${name} = [^;]+;`));
  assert.ok(match, `${name} declaration was not found`);
  return match[0];
}).join('\n');

let clock = 1000;
const queued = [];
const scheduled = [];
const generationUpdates = [];
let baselineCaptures = 0;
let observationClears = 0;

const context = {
  Date: { now: () => clock },
  monitoring: true,
  steeringEnabled: true,
  steeringAwaitingResponseStart: false,
  steeringAwaitingTurnCompletion: false,
  IS_TOP_FRAME: true,
  isGenerating: false,
};
vm.createContext(context);
vm.runInContext(
  `${declarations}\n`
    + `${extractFunction(part11, 'normalizeChatGptShortcutText')}\n`
    + `${extractFunction(part11, 'getChatGptNativeComposerSubmitSignature')}\n`
    + `${extractFunction(part11, 'rememberChatGptNativeComposerSubmit')}\n`
    + `${extractFunction(part11, 'isRecentDuplicateChatGptNativeComposerSubmit')}\n`
    + `${extractFunction(part11, 'clearChatGptNativeComposerImmediateHandoff')}\n`
    + `${extractFunction(part11, 'armChatGptNativeComposerImmediateHandoff')}\n`
    + `${extractFunction(part11, 'isChatGptNativeComposerFollowupGateActive')}\n`
    + `${extractFunction(part11, 'getChatGptNativeComposerEnterPlan')}\n`
    + `${extractFunction(part11, 'handleChatGptNativeComposerFollowupEnter')}\n`
    + 'this.clearHandoff = clearChatGptNativeComposerImmediateHandoff;\n'
    + 'this.armHandoff = armChatGptNativeComposerImmediateHandoff;\n'
    + 'this.gateActive = isChatGptNativeComposerFollowupGateActive;\n'
    + 'this.handleEnter = handleChatGptNativeComposerFollowupEnter;',
  context
);

context.captureSteeringChatGptAssistantBaseline = () => { baselineCaptures += 1; };
context.clearSteeringChatGptAssistantObservation = () => { observationClears += 1; };
context.isChatGptSafeMode = () => true;
context.isReadyAiDuplicateContentInstance = () => false;
context.getChatGptNativeComposerForEventTarget = (target) => target;
context.getCurrentComposerText = (target) => target.text;
context.detectChatGptGeneratingLight = () => false;
context.scheduleChatGptNativeComposerImmediateFallback = (composer, text, options) => {
  scheduled.push({ composer, text, options });
};
context.enqueueSteeringPrompt = (text, options) => {
  queued.push({ text, options });
  return true;
};
context.setControlValue = (target, value) => { target.text = value; return true; };
context.setChatGptLightGenerating = (next, options) => generationUpdates.push({ next, options });
context.setSteeringStatus = () => {};
context.getSteeringQueueCountLabel = () => `대기중: ${queued.length}`;
context.updateSteeringUi = () => {};

function makeEvent(target, modifiers = {}) {
  const state = { prevented: false, stopped: false };
  return {
    key: 'Enter',
    isTrusted: true,
    target,
    ...modifiers,
    preventDefault() { state.prevented = true; },
    stopImmediatePropagation() { state.stopped = true; },
    state,
  };
}

const composer = { text: '첫 요청을 바로 반영', isConnected: true };
const immediate = makeEvent(composer, { ctrlKey: true });
context.handleEnter(immediate);
assert.equal(immediate.state.prevented, false, 'Ctrl+Enter remains native-first');
assert.equal(scheduled.length, 1, 'Ctrl+Enter arms one recovery fallback');
assert.equal(baselineCaptures, 1, 'the assistant baseline is captured before native submission');
assert.equal(context.gateActive(), true, 'the follow-up gate opens synchronously on Ctrl+Enter');

clock += 25;
composer.text = '두 번째 요청은 후속 지시';
const fastFollowup = makeEvent(composer);
context.handleEnter(fastFollowup);
assert.equal(fastFollowup.state.prevented, true, 'a 25ms follow-up Enter cannot leak into ChatGPT native send');
assert.equal(fastFollowup.state.stopped, true, 'the native key handler is stopped for the follow-up');
assert.equal(queued.at(-1).text, '두 번째 요청은 후속 지시', 'the fast follow-up is queued intact');
assert.equal(composer.text, '', 'only the queued follow-up draft is cleared');
assert.equal(generationUpdates.at(-1).next, true, 'the response watch starts immediately');
assert.equal(generationUpdates.at(-1).options.observed, false, 'the handoff is not mistaken for observed generation');

context.clearHandoff();
context.steeringAwaitingResponseStart = false;
context.steeringAwaitingTurnCompletion = false;
context.chatGptNativeComposerImmediateFallbackSending = true;
composer.text = '복구 전송 중 입력한 후속 지시';
const fallbackOverlap = makeEvent(composer);
context.handleEnter(fallbackOverlap);
assert.equal(fallbackOverlap.state.prevented, true, 'plain Enter is still queued while recovery send is in flight');
assert.equal(queued.at(-1).text, '복구 전송 중 입력한 후속 지시');

context.chatGptNativeComposerImmediateFallbackSending = false;
composer.text = '응답 시작 대기 중 후속 지시';
context.steeringAwaitingResponseStart = true;
const responseStartWait = makeEvent(composer);
context.handleEnter(responseStartWait);
assert.equal(responseStartWait.state.prevented, true, 'response-start waiting state also captures Enter');

context.steeringAwaitingResponseStart = false;
context.steeringAwaitingTurnCompletion = true;
composer.text = '응답 완료 대기 중 후속 지시';
const completionWait = makeEvent(composer);
context.handleEnter(completionWait);
assert.equal(completionWait.state.prevented, true, 'turn-completion waiting state also captures Enter');

context.steeringAwaitingTurnCompletion = false;
context.steeringEnabled = false;
composer.text = '기능을 끄면 일반 Enter';
const disabledPlainEnter = makeEvent(composer);
context.handleEnter(disabledPlainEnter);
assert.equal(disabledPlainEnter.state.prevented, false, 'Ready_Ai off never blocks native plain Enter');

context.steeringEnabled = true;
context.clearHandoff();
clock += 7000;
composer.text = '완전히 유휴 상태의 일반 Enter';
const settledPlainEnter = makeEvent(composer);
context.handleEnter(settledPlainEnter);
assert.equal(settledPlainEnter.state.prevented, false, 'plain Enter returns to native behavior after the handoff settles');

context.isGenerating = true;
clock += 10;
composer.text = '완전히 유휴 상태의 일반 Enter';
const rapidNativeRepeat = makeEvent(composer);
const queueCountBeforeNativeRepeat = queued.length;
context.handleEnter(rapidNativeRepeat);
assert.equal(rapidNativeRepeat.state.prevented, true, 'a rapid second Enter cannot duplicate stale native composer text');
assert.equal(rapidNativeRepeat.state.stopped, true, 'the stale rapid Enter is stopped before ChatGPT sees it');
assert.equal(queued.length, queueCountBeforeNativeRepeat, 'stale native composer text is not added to the queue');
assert.equal(composer.text, '완전히 유휴 상태의 일반 Enter', 'the native first submit remains in control of clearing stale text');

clock += 500;
composer.text = '후속 지시 빠른 반복';
const queuedOnce = makeEvent(composer);
context.handleEnter(queuedOnce);
const queueCountAfterFirstFollowup = queued.length;
clock += 10;
composer.text = '후속 지시 빠른 반복';
const queuedTwice = makeEvent(composer, { repeat: true });
context.handleEnter(queuedTwice);
assert.equal(queuedTwice.state.prevented, true, 'physical key repeat is suppressed while stale follow-up text is visible');
assert.equal(queued.length, queueCountAfterFirstFollowup, 'physical key repeat does not duplicate a queued follow-up');

context.isGenerating = false;
composer.text = '줄바꿈 유지';
const lineBreak = makeEvent(composer, { shiftKey: true });
context.handleEnter(lineBreak);
assert.equal(lineBreak.state.prevented, false, 'Shift+Enter remains a line break');

composer.text = '생성 중 즉시 반영';
context.isGenerating = true;
const interruptingImmediate = makeEvent(composer, { metaKey: true });
context.handleEnter(interruptingImmediate);
assert.equal(observationClears, 1, 'an in-progress response clears the old assistant observation');
assert.equal(scheduled.at(-1).options.interruptExistingGeneration, true, 'Cmd+Enter keeps immediate-interrupt intent');

const confirmationContext = {
  Date,
  monitoring: true,
  steeringEnabled: true,
  steeringAwaitingResponseStart: false,
  steeringAwaitingTurnCompletion: false,
  steeringObservedGenerationSinceSend: false,
};
let pendingTimer = null;
let fallbackSends = 0;
let matchingTurns = [];
let confirmedGenerationUpdates = 0;
confirmationContext.document = { querySelectorAll: () => matchingTurns };
confirmationContext.setTimeout = (callback) => { pendingTimer = callback; return 1; };
confirmationContext.clearTimeout = () => { pendingTimer = null; };
vm.createContext(confirmationContext);
vm.runInContext(
  `${declarations}\n`
    + `${extractFunction(part11, 'clearChatGptNativeComposerImmediateHandoff')}\n`
    + `${extractFunction(part11, 'normalizeChatGptShortcutText')}\n`
    + `${extractFunction(part11, 'countRecentChatGptUserTurnText')}\n`
    + `${extractFunction(part11, 'confirmChatGptNativeComposerImmediateSubmission')}\n`
    + `${extractFunction(part11, 'scheduleChatGptNativeComposerImmediateFallback')}\n`
    + 'this.scheduleFallback = scheduleChatGptNativeComposerImmediateFallback;',
  confirmationContext
);
confirmationContext.clearSteeringCompletionOffer = () => {};
confirmationContext.clearSteeringAwaitingResponseStart = () => {
  confirmationContext.steeringAwaitingResponseStart = false;
};
confirmationContext.armSteeringAwaitingResponseStart = () => {
  confirmationContext.steeringAwaitingResponseStart = true;
};
confirmationContext.setChatGptLightGenerating = () => { confirmedGenerationUpdates += 1; };
confirmationContext.armSteeringTurnCompletionWatchdog = () => {};
confirmationContext.armSteeringSendLock = () => {};
confirmationContext.getChatGptNativeComposerForEventTarget = (target) => target;
confirmationContext.getActiveComposer = () => null;
confirmationContext.getCurrentComposerText = (target) => target.text;
confirmationContext.sendChatGptNativeComposerImmediately = () => { fallbackSends += 1; };

function resetConfirmationState() {
  confirmationContext.steeringAwaitingResponseStart = false;
  confirmationContext.steeringAwaitingTurnCompletion = false;
  confirmationContext.steeringObservedGenerationSinceSend = false;
  matchingTurns = [];
  pendingTimer = null;
}

resetConfirmationState();
const nativeTurnComposer = { text: '네이티브 전송 확인', isConnected: true };
confirmationContext.scheduleFallback(nativeTurnComposer, nativeTurnComposer.text, {});
matchingTurns = [{ innerText: nativeTurnComposer.text }];
pendingTimer();
assert.equal(confirmationContext.steeringAwaitingTurnCompletion, true, 'a new user turn promotes the handoff into completion waiting');
assert.equal(confirmationContext.steeringAwaitingResponseStart, true, 'native submission waits for response start');
assert.equal(fallbackSends, 0, 'confirmed native submission is not sent twice');

resetConfirmationState();
const closedImageComposer = { text: '이미지 수정 전송', isConnected: true };
confirmationContext.scheduleFallback(closedImageComposer, closedImageComposer.text, {});
closedImageComposer.isConnected = false;
pendingTimer();
assert.equal(confirmationContext.steeringAwaitingTurnCompletion, true, 'a closed image editor confirms native submission');
assert.equal(fallbackSends, 0, 'a closed image editor is not submitted twice');

resetConfirmationState();
const clearedComposer = { text: '입력창 비움 확인', isConnected: true };
confirmationContext.scheduleFallback(clearedComposer, clearedComposer.text, {});
clearedComposer.text = '';
pendingTimer();
assert.equal(confirmationContext.steeringAwaitingTurnCompletion, true, 'a cleared composer confirms native submission');
assert.equal(fallbackSends, 0, 'a cleared composer is not submitted twice');

resetConfirmationState();
const unchangedComposer = { text: '네이티브 미응답 복구', isConnected: true };
confirmationContext.scheduleFallback(unchangedComposer, unchangedComposer.text, {});
pendingTimer();
assert.equal(fallbackSends, 1, 'unchanged input starts exactly one stable-control recovery send');
assert.equal(confirmedGenerationUpdates, 3, 'only the three confirmed native paths start response tracking');

console.log('Ready_Ai Ctrl+Enter follow-up handoff: 30 cases passed');
