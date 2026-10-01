const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const part06 = fs.readFileSync(path.join(root, 'src', 'content', 'part-06.js'), 'utf8');
const part10 = fs.readFileSync(path.join(root, 'src', 'content', 'part-10.js'), 'utf8');

function extractSimpleFunction(source, name) {
  const pattern = new RegExp(`(?:async\\s+)?function ${name}\\([^]*?\\n\\}`);
  const match = source.match(pattern);
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

const context = {};
vm.createContext(context);
vm.runInContext(
  `${extractSimpleFunction(part06, 'shouldHoldInitialChatGptQueueItem')}\n`
    + `${extractSimpleFunction(part06, 'shouldHoldSteeringQueueHeadForFirstChatGptTurn')}\n`
    + `${extractSimpleFunction(part10, 'getSteeringComposerEnterMode')}\n`
    + `${extractSimpleFunction(part10, 'getSteeringComposerKeyboardPlan')}\n`
    + 'this.policy = shouldHoldInitialChatGptQueueItem;\n'
    + 'this.queuePolicy = shouldHoldSteeringQueueHeadForFirstChatGptTurn;\n'
    + 'this.enterMode = getSteeringComposerEnterMode;\n'
    + 'this.keyboardPlan = getSteeringComposerKeyboardPlan;',
  context
);

const heldItem = { holdForFirstChatGptTurn: true };
const regularItem = { holdForFirstChatGptTurn: false };
const policyCases = [
  ['blank ChatGPT Enter stays queued', heldItem, { siteKey: 'chatgpt', hasConversationTurns: false }, true],
  ['manual next-send can release it', heldItem, { siteKey: 'chatgpt', hasConversationTurns: false, allowHeldFirstTurn: true }, false],
  ['first real conversation releases it', heldItem, { siteKey: 'chatgpt', hasConversationTurns: true }, false],
  ['non-ChatGPT sites keep their prior behavior', heldItem, { siteKey: 'gemini', hasConversationTurns: false }, false],
  ['ordinary queued items are not held', regularItem, { siteKey: 'chatgpt', hasConversationTurns: false }, false],
  ['missing item is safe', null, { siteKey: 'chatgpt', hasConversationTurns: false }, false],
];

for (const [label, item, options, expected] of policyCases) {
  assert.equal(context.policy(item, options), expected, label);
}

let siteKey = 'chatgpt';
let hasConversationTurns = false;
context.getSiteKey = () => siteKey;
context.hasChatGptConversationTurns = () => hasConversationTurns;

const heldHead = { holdForFirstChatGptTurn: true };
context.steeringQueue = [heldHead];
assert.equal(context.queuePolicy(), true, 'automatic queue probes must preserve the first-question hold');
assert.equal(context.queuePolicy({ allowHeldFirstTurn: true }), false, 'the explicit next-send action may release the hold');
assert.equal(heldHead.holdForFirstChatGptTurn, true, 'manual permission must not silently rewrite the queue item');

hasConversationTurns = true;
assert.equal(context.queuePolicy(), false, 'a real conversation turn releases automatic follow-up processing');
assert.equal(heldHead.holdForFirstChatGptTurn, false, 'released items no longer need a first-turn hold');

const nonChatHead = { holdForFirstChatGptTurn: true };
context.steeringQueue = [nonChatHead];
siteKey = 'gemini';
hasConversationTurns = false;
assert.equal(context.queuePolicy(), false, 'other AI sites retain their existing queue behavior');
assert.equal(nonChatHead.holdForFirstChatGptTurn, false, 'a stale ChatGPT hold is cleared after a site change');

context.steeringQueue = [];
assert.equal(context.queuePolicy(), false, 'an empty queue remains safe');

const enterModeCases = [
  ['non-Enter key is ignored', { key: 'a' }, ''],
  ['physical key repeat is ignored', { key: 'Enter', repeat: true }, 'repeat'],
  ['Shift+Enter keeps a line break', { key: 'Enter', shiftKey: true }, 'linebreak'],
  ['plain Enter queues one item', { key: 'Enter' }, 'queue'],
  ['Ctrl+Enter is immediate', { key: 'Enter', ctrlKey: true }, 'immediate'],
  ['Cmd+Enter is immediate', { key: 'Enter', metaKey: true }, 'immediate'],
];
for (const [label, event, expected] of enterModeCases) {
  assert.equal(context.enterMode(event), expected, label);
}
const repeatedModes = [
  context.enterMode({ key: 'Enter' }),
  context.enterMode({ key: 'Enter' }),
  context.enterMode({ key: 'Enter' }),
  context.enterMode({ key: 'Enter' }),
  context.enterMode({ key: 'Enter', ctrlKey: true }),
];
assert.deepEqual(repeatedModes, ['queue', 'queue', 'queue', 'queue', 'immediate'], 'repeated queue entries never poison the next Ctrl+Enter');

assert.deepEqual(
  JSON.parse(JSON.stringify(context.keyboardPlan({ key: 'Enter' }, { now: 1000, lastPlainEnterAt: 0 }))),
  { mode: 'queue', delayMs: 300, nextPlainEnterAt: 1000, doubleEnter: false },
  'first Enter waits briefly before queueing'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.keyboardPlan({ key: 'Enter' }, { now: 1240, lastPlainEnterAt: 1000 }))),
  { mode: 'immediate', delayMs: 0, nextPlainEnterAt: 0, doubleEnter: true },
  'second Enter inside the window requests an immediate send'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(context.keyboardPlan({ key: 'Enter' }, { now: 1301, lastPlainEnterAt: 1000 }))),
  { mode: 'queue', delayMs: 300, nextPlainEnterAt: 1301, doubleEnter: false },
  'late second Enter starts a new single-Enter queue action'
);

const background = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'src', 'content', 'part-02.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'src', 'popup.html'), 'utf8');
assert.match(background, /2026-10-02\.7-safe-session-recovery/);
assert.match(content, /2026-10-02\.7-safe-session-recovery/);
assert.match(popup, /Ready_Ai 0\.3\.16/);
assert.match(popup, /version-pill">v0\.3\.16</);
assert.match(background, /stage: 'composer_busy'/);
assert.match(background, /document\.execCommand\('selectAll', false, null\)/);
assert.match(background, /inputType: 'insertReplacementText'/);
assert.match(background, /paragraph\.appendChild\(document\.createTextNode\(next\)\)/);
const part07 = fs.readFileSync(path.join(root, 'src', 'content', 'part-07.js'), 'utf8');
assert.match(part07, /options\.source === 'resume_button'/);
assert.match(part07, /enqueueSteeringPrompt\(text, \{ files, holdForFirstChatGptTurn \}\)/);
assert.match(part07, /async function sendChatGptImmediateViaStableControls/);
assert.match(part07, /chatgpt_interrupt_then_send/);
assert.match(part07, /chatgpt_generation_finished_then_send/);
assert.match(part07, /앞선 전송을 마무리한 뒤 Ctrl\+Enter를 바로 실행합니다/);
assert.equal((part07.match(/requestChatGptNativeImmediateSteer\(/g) || []).length, 1, 'the React fiber route remains compatibility-only and is no longer called');
assert.match(part10, /getSteeringComposerKeyboardPlan/);
assert.match(part10, /doubleEnterWindowMs/);
assert.match(part10, /delayMs: keyboardPlan\.delayMs/);
assert.match(part07, /refreshSteeringGeneratingStateBeforeQueueSubmit/);
assert.match(part07, /!generatingNow && canAutoSendSteeringNow\(\)/);
assert.match(part10, /handledSteeringComposerKeydowns = new WeakSet\(\)/);

const geminiQueueContext = {};
vm.createContext(geminiQueueContext);
vm.runInContext(
  `${extractSimpleFunction(part07, 'refreshSteeringGeneratingStateBeforeQueueSubmit')}\n`
    + `${extractSimpleFunction(part07, 'submitSteeringInput')}\n`
    + 'this.submit = submitSteeringInput;',
  geminiQueueContext
);
let geminiQueuedCount = 0;
let geminiScheduledCount = 0;
let geminiAutoSendTimerClearCount = 0;
const geminiSteeringInput = { value: '생성 중 단일 Enter 후속 지시' };
Object.assign(geminiQueueContext, {
  isGenerating: false,
  activeSite: { key: 'gemini', detection: 'gemini' },
  completionStatus: 'completed',
  steeringLastCompletionAt: 100,
  steeringAdvancedEnabled: false,
  maybeRescanShadowRoots() {},
  detectGenerating: () => true,
  clearSteeringAutoSendTimer: () => { geminiAutoSendTimerClearCount += 1; },
  markSteeringGenerationObserved() {},
  armSteeringTurnCompletionWatchdog() {},
  getSteeringTurnWatchdogDelayMs: () => 12000,
  ensurePolling() {},
  scheduleCheck() {},
  updateTitleBadge() {},
  ensureSteeringUi: () => ({ input: geminiSteeringInput }),
  cloneSteeringAttachmentsForQueue: () => [],
  getSiteKey: () => 'gemini',
  hasChatGptConversationTurns: () => true,
  enqueueSteeringPrompt: () => { geminiQueuedCount += 1; },
  setSteeringDraftText() {},
  clearSteeringDraftAttachments() {},
  canAutoSendSteeringNow: () => true,
  getSteeringQueueCountLabel: () => '대기중: 1',
  setSteeringStatus() {},
  updateSteeringUi() {},
  scheduleSteeringQueueProcessing: () => { geminiScheduledCount += 1; },
});
geminiQueueContext.submit();
assert.equal(geminiQueuedCount, 1, 'Gemini generating-time single Enter adds exactly one queue item');
assert.equal(geminiScheduledCount, 0, 'live Gemini generation blocks stale-cache immediate processing');
assert.equal(geminiAutoSendTimerClearCount, 1, 'live Gemini generation cancels an already scheduled queue send');
assert.equal(geminiQueueContext.isGenerating, true, 'live Gemini generation refreshes the cached state before routing');

vm.runInContext(
  `${extractSimpleFunction(part07, 'getVisibleChatGptStopButton')}\n`
    + `${extractSimpleFunction(part07, 'waitForChatGptUserTurnText')}\n`
    + `${extractSimpleFunction(part07, 'waitForChatGptComposerSubmissionStart')}\n`
    + `${extractSimpleFunction(part07, 'sendChatGptImmediateViaStableControls')}\n`
    + 'this.stableImmediate = sendChatGptImmediateViaStableControls;',
  context
);

async function runStableImmediateCases() {
  let stopPresent = true;
  let userTurnCount = 0;
  const composer = { text: 'CTRL_OK' };
  const stopButton = { click: () => { stopPresent = false; } };
  const sendButton = { click: () => { userTurnCount += 1; } };
  context.CHATGPT_STOP_SELECTOR = '[data-testid="stop-button"]';
  context.document = { querySelectorAll: () => (stopPresent ? [stopButton] : []) };
  context.isVisible = () => true;
  context.isEnabledButtonLike = () => true;
  context.waitForSteeringTick = async () => {};
  context.getActiveComposer = () => composer;
  context.getCurrentComposerText = (target) => target.text;
  context.setControlValue = (target, value) => { target.text = value; return true; };
  context.waitForSteeringComposerText = async (target, value) => ({ ok: target.text === value });
  context.countRecentChatGptUserTurnText = () => userTurnCount;
  context.getActiveSendButton = () => sendButton;
  context.findNearbySendButton = () => null;
  context.requestSubmitComposer = () => false;
  context.dispatchSubmitKey = () => false;
  context.detectChatGptGeneratingLight = () => false;

  const interrupted = await context.stableImmediate(composer, 'CTRL_OK', 3000);
  assert.equal(interrupted.ok, true, 'Ctrl+Enter interrupts an active response and sends');
  assert.equal(interrupted.route, 'chatgpt_interrupt_then_send', 'active generation uses the stable interrupt route');

  stopPresent = false;
  userTurnCount = 0;
  composer.text = 'CTRL_AFTER';
  const afterCompletion = await context.stableImmediate(composer, 'CTRL_AFTER', 3000);
  assert.equal(afterCompletion.ok, true, 'Ctrl+Enter still sends when generation ends during the shortcut');
  assert.equal(afterCompletion.route, 'chatgpt_generation_finished_then_send', 'completion race uses the normal visible send control');

  let fakeNow = 0;
  context.Date = { now: () => { fakeNow += 500; return fakeNow; } };
  context.getActiveSendButton = () => null;
  context.requestSubmitComposer = () => false;
  context.dispatchSubmitKey = () => false;
  composer.text = '';
  const failed = await context.stableImmediate(composer, 'PRESERVE_ME', 2600);
  assert.equal(failed.ok, false, 'a missing stable control reports failure');
  assert.equal(composer.text, 'PRESERVE_ME', 'a failed Ctrl+Enter always restores the draft');
}

runStableImmediateCases()
  .then(() => console.log(`Ready_Ai Enter routing: ${policyCases.length + 34} policy and integration cases passed`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
