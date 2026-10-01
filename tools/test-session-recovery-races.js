const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sessionSource = fs.readFileSync(path.join(root, 'src/content/part-02.js'), 'utf8');
const lifecycleSource = fs.readFileSync(path.join(root, 'src/content/part-12.js'), 'utf8');
function extract(source, name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} exists`);
  return match[0];
}
const tick = () => new Promise(setImmediate);
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function run() {
  const context = {
    IS_TOP_FRAME: true, steeringSessionRestoreSeq: 0,
    steeringConversationScope: 'conversation:a', steeringConversationSessionToken: 'a-first',
    steeringConversationSessions: new Map(), steeringStateRestoring: false,
    steeringRestoredQueuePaused: true, steeringSessionStorageFailed: false,
    getReadyAiContentInstanceSeq: () => 1, isReadyAiCurrentContentInstance: () => true,
    getSiteKey: () => 'chatgpt', updateSteeringUi() {}, setSteeringStatus() {},
    waitForSteeringConversationView: async () => true, scheduleSteeringQueueProcessing() {},
    STEERING_AUTO_SEND_DELAY_MS: 1000,
    applyRecoveredSteeringSession(state) { context.visible = state; },
  };
  vm.createContext(context);
  vm.runInContext(extract(sessionSource, 'restoreSteeringSessionState'), context);
  const firstFile = deferred();
  const secondFile = deferred();
  let reads = 0;
  context.requestSteeringSessionStorage = async () => ({ state: {
    scope: context.steeringConversationScope, siteKey: 'chatgpt',
    queue: [{ id: 1, text: ++reads === 1 ? 'old A' : 'current A', files: [{ fileId: String(reads) }] }],
    attachments: [], draft: reads === 1 ? 'old draft' : 'current draft',
  } });
  context.loadSteeringSessionFile = (file) => file.fileId === '1' ? firstFile.promise : secondFile.promise;
  const oldRecovery = context.restoreSteeringSessionState();
  await tick();
  context.steeringConversationScope = 'conversation:b';
  context.steeringConversationSessionToken = 'b';
  context.steeringConversationSessions.set('conversation:b', { queue: [], attachments: [], draft: 'B' });
  await context.restoreSteeringSessionState();
  context.steeringConversationScope = 'conversation:a';
  context.steeringConversationSessionToken = 'a-second';
  const currentRecovery = context.restoreSteeringSessionState();
  await tick();
  firstFile.resolve({ file: {}, name: 'old.txt' });
  await oldRecovery;
  assert.equal(context.steeringStateRestoring, true, 'old A recovery cannot unlock the new A recovery');
  assert.equal(context.visible.draft, 'current draft', 'late A recovery cannot overwrite the newer A draft');
  secondFile.resolve({ file: {}, name: 'current.txt' });
  await currentRecovery;
  assert.equal(context.visible.queue[0].files[0].name, 'current.txt');
  assert.equal(context.steeringStateRestoring, false);

  const restored = {
    steeringConversationSessionToken: 'fresh-visit-a', steeringAttachmentSeq: 1,
    getSiteKey: () => 'chatgpt', setSteeringDraftText() {}, updateSteeringUi() {},
  };
  vm.createContext(restored);
  vm.runInContext(extract(sessionSource, 'applyRecoveredSteeringSession'), restored);
  restored.applyRecoveredSteeringSession({ sessionToken: 'old-visit-a', queue: [], attachments: [] }, true);
  assert.equal(restored.steeringConversationSessionToken, 'fresh-visit-a',
    'returning to A cannot make an old in-flight send current again');

  const signature = { getSteeringFileIdentity: () => '', steeringConversationScope: 'conversation:a' };
  vm.createContext(signature);
  vm.runInContext(extract(sessionSource, 'getSteeringSessionSignature'), signature);
  const state = { scope: 'conversation:a', queue: [], attachments: [], draft: '', panelOpen: false };
  assert.notEqual(signature.getSteeringSessionSignature(state), signature.getSteeringSessionSignature({ ...state, panelOpen: true }),
    'opening or closing the panel must update its persisted state');

  const saved = [];
  const usage = {
    readyAiEnabled: true, steeringQueue: [{ id: 1 }], steeringRestoredQueuePaused: false,
    steeringConversationSessions: new Map([
      ['conversation:a', { queue: [{ id: 1 }], paused: false }],
      ['conversation:b', { queue: [{ id: 2 }], paused: false }],
      ['conversation:empty', { queue: [], paused: false }],
    ]),
    persistSteeringSessionState: async (snapshot) => { saved.push(snapshot); return true; },
    stopMonitoring() {}, refreshSiteFromStorage() {},
  };
  vm.createContext(usage);
  vm.runInContext(extract(lifecycleSource, 'applyReadyAiUsageEnabled'), usage);
  usage.applyReadyAiUsageEnabled(false);
  assert.equal(usage.steeringConversationSessions.get('conversation:b').paused, true,
    'turning off pauses queues in other conversations too');
  assert.equal(usage.steeringConversationSessions.get('conversation:empty').paused, false);
  usage.applyReadyAiUsageEnabled(true);
  assert.equal(usage.steeringConversationSessions.get('conversation:b').paused, true,
    'turning on does not silently resume another conversation');
  assert.equal(saved.length, 1);
  console.log('Session recovery races: rapid A/B/A, late sends, attachment loading, panel persistence and global pause passed');
}

module.exports = run;
if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });
