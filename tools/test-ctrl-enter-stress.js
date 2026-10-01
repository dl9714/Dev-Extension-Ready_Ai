const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const part07 = fs.readFileSync(path.join(root, 'src', 'content', 'part-07.js'), 'utf8');
const part10 = fs.readFileSync(path.join(root, 'src', 'content', 'part-10.js'), 'utf8');
const part11 = fs.readFileSync(path.join(root, 'src', 'content', 'part-11.js'), 'utf8');

function extractFunction(source, name) {
  const match = source.match(new RegExp(`(?:async\\s+)?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

const context = {};
vm.createContext(context);
vm.runInContext(
  `${extractFunction(part10, 'getSteeringComposerEnterMode')}\n`
    + `${extractFunction(part10, 'getSteeringComposerKeyboardPlan')}\n`
    + `${extractFunction(part07, 'getVisibleChatGptStopButton')}\n`
    + `${extractFunction(part07, 'waitForChatGptUserTurnText')}\n`
    + `${extractFunction(part07, 'waitForChatGptComposerSubmissionStart')}\n`
    + `${extractFunction(part07, 'sendChatGptImmediateViaStableControls')}\n`
    + `${extractFunction(part11, 'getChatGptNativeComposerEnterPlan')}\n`
    + 'this.enterMode = getSteeringComposerEnterMode;\n'
    + 'this.keyboardPlan = getSteeringComposerKeyboardPlan;\n'
    + 'this.nativeEnterPlan = getChatGptNativeComposerEnterPlan;\n'
    + 'this.stableImmediate = sendChatGptImmediateViaStableControls;',
  context
);

function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function runGeminiEnterPlanStress(iterations = 25000) {
  const random = makeRandom(0x6e746572);
  for (let index = 0; index < iterations; index += 1) {
    const firstAt = 1000 + (index * 1000);
    const first = context.keyboardPlan({ key: 'Enter' }, { now: firstAt, lastPlainEnterAt: 0 });
    assert.equal(first.mode, 'queue', `Gemini first Enter queues ${index}`);
    assert.equal(first.delayMs, 300, `Gemini first Enter keeps the double-enter window ${index}`);
    const interval = Math.floor(random() * 701);
    const second = context.keyboardPlan({ key: 'Enter' }, {
      now: firstAt + interval,
      lastPlainEnterAt: firstAt,
    });
    const expectedSecond = interval <= 300 ? 'immediate' : 'queue';
    assert.equal(second.mode, expectedSecond, `Gemini second Enter route ${index}:${interval}`);
    assert.equal(second.doubleEnter, interval <= 300, `Gemini double-enter flag ${index}:${interval}`);
    const reset = context.keyboardPlan({ key: 'Enter' }, {
      now: firstAt + interval + 1,
      lastPlainEnterAt: 0,
    });
    assert.equal(reset.mode, 'queue', `Gemini completed double Enter never poisons the next single Enter ${index}`);
  }
}

function runKeySequenceStress(iterations = 50000) {
  const random = makeRandom(0x5eedc0de);
  for (let index = 0; index < iterations; index += 1) {
    const precedingCount = Math.floor(random() * 24);
    for (let item = 0; item < precedingCount; item += 1) {
      const modeRoll = random();
      const event = modeRoll < 0.82
        ? { key: 'Enter' }
        : (modeRoll < 0.91 ? { key: 'Enter', shiftKey: true } : { key: 'Enter', repeat: true });
      const expected = event.repeat ? 'repeat' : (event.shiftKey ? 'linebreak' : 'queue');
      assert.equal(context.enterMode(event), expected, `prelude ${index}:${item}`);
    }
    const modifier = random() < 0.5 ? { ctrlKey: true } : { metaKey: true };
    assert.equal(context.enterMode({ key: 'Enter', ...modifier }), 'immediate', `final shortcut ${index}`);
  }
}

function runCtrlEnterFollowupHandoffStress(iterations = 50000) {
  const random = makeRandom(0xc071e73e);
  for (let index = 0; index < iterations; index += 1) {
    const ctrlEvent = random() < 0.5
      ? { key: 'Enter', ctrlKey: true }
      : { key: 'Enter', metaKey: true };
    const generating = random() < 0.5;
    const immediate = context.nativeEnterPlan(ctrlEvent, {
      monitoring: true,
      steeringEnabled: true,
      generating,
      awaitingImmediateResponse: false,
    });
    assert.equal(immediate.mode, 'native_fallback', `immediate shortcut remains native-first ${index}`);
    assert.equal(immediate.interruptExistingGeneration, generating, `interrupt state follows generation ${index}`);

    const followupDelayMs = Math.floor(random() * 6501);
    const followup = context.nativeEnterPlan({ key: 'Enter' }, {
      monitoring: true,
      steeringEnabled: true,
      generating: false,
      awaitingImmediateResponse: followupDelayMs <= 6500,
    });
    assert.equal(followup.mode, 'queue', `follow-up Enter is captured across the handoff window ${index}:${followupDelayMs}`);

    const settled = context.nativeEnterPlan({ key: 'Enter' }, {
      monitoring: true,
      steeringEnabled: true,
      generating: false,
      awaitingImmediateResponse: false,
    });
    assert.equal(settled.mode, 'ignore', `idle Enter returns to ChatGPT after settlement ${index}`);
  }
}

async function runStableControlScenario(index) {
  const kind = index % 7;
  let clock = 0;
  let ticks = 0;
  let stopPresent = kind === 0 || kind === 2 || kind === 5;
  let stopClicks = 0;
  let userTurnCount = 0;
  let sendClicks = 0;
  const expected = `CTRL_STRESS_${index}`;
  const composer = { text: kind === 4 ? '' : expected };
  const stopButton = {
    enabled: kind !== 2,
    click() {
      stopClicks += 1;
      if (kind === 5 && stopClicks === 1) throw new Error('transient stop click failure');
      stopPresent = false;
    },
  };
  const sendButton = {
    enabled: kind !== 3,
    click() {
      sendClicks += 1;
      composer.text = '';
      if (kind === 4 && sendClicks === 1) return;
      userTurnCount += 1;
    },
  };
  context.Date = { now: () => { clock += 50; return clock; } };
  context.CHATGPT_STOP_SELECTOR = '[data-testid="stop-button"]';
  context.document = { querySelectorAll: () => (stopPresent ? [stopButton] : []) };
  context.isVisible = () => true;
  context.isEnabledButtonLike = (target) => target?.enabled !== false;
  context.waitForSteeringTick = async () => {
    ticks += 1;
    if (kind === 2 && ticks >= 3) stopButton.enabled = true;
    if (kind === 3 && ticks >= 4) sendButton.enabled = true;
  };
  context.getActiveComposer = () => composer;
  context.getCurrentComposerText = (target) => target.text;
  context.setControlValue = (target, value) => { target.text = value; return true; };
  context.waitForSteeringComposerText = async (target, value) => ({ ok: target.text === value });
  context.countRecentChatGptUserTurnText = () => userTurnCount;
  context.getActiveSendButton = () => (kind === 6 ? null : sendButton);
  context.findNearbySendButton = () => null;
  context.requestSubmitComposer = () => false;
  context.dispatchSubmitKey = () => false;
  context.detectChatGptGeneratingLight = () => false;

  const result = await context.stableImmediate(composer, expected, 6200);
  if (kind === 6) {
    assert.equal(result.ok, false, `missing controls fail safely ${index}`);
    assert.equal(composer.text, expected, `missing controls preserve the draft ${index}`);
    return;
  }
  assert.equal(result.ok, true, `stable controls eventually send ${index}`);
  assert.equal(userTurnCount, kind === 4 ? 0 : 1, `the accepted submission is recognized ${index}`);
  if (kind === 4) assert.equal(sendClicks, 1, `a cleared image-editor composer is never submitted twice ${index}`);
  if (kind === 0 || kind === 2 || kind === 5) {
    assert.equal(result.route, 'chatgpt_interrupt_then_send', `active response is interrupted ${index}`);
  } else {
    assert.equal(result.route, 'chatgpt_generation_finished_then_send', `idle/completion race sends normally ${index}`);
  }
}

async function main() {
  if (typeof global.gc === 'function') global.gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = Date.now();
  runKeySequenceStress(50000);
  runCtrlEnterFollowupHandoffStress(50000);
  runGeminiEnterPlanStress(25000);
  for (let index = 0; index < 350; index += 1) {
    await runStableControlScenario(index);
  }
  if (typeof global.gc === 'function') global.gc();
  const heapAfter = process.memoryUsage().heapUsed;
  const heapGrowthMb = (heapAfter - heapBefore) / (1024 * 1024);
  assert.ok(heapGrowthMb < 8, `stress test retained too much heap: ${heapGrowthMb.toFixed(2)}MB`);
  console.log(JSON.stringify({
    keySequences: 50000,
    ctrlEnterFollowupHandoffs: 50000,
    geminiEnterPlans: 25000,
    stableControlScenarios: 350,
    heapGrowthMb: Number(heapGrowthMb.toFixed(2)),
    elapsedMs: Date.now() - startedAt,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
