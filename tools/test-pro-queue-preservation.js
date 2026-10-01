const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { File } = require('node:buffer');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'src/content', name), 'utf8');
const part02 = read('part-02.js');
const part03 = read('part-03.js');
const part04 = read('part-04.js');
const part07 = read('part-07.js');
function extract(source, name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} exists`);
  return match[0];
}
function load(context, entries) {
  vm.createContext(context);
  vm.runInContext(entries.map(([source, name]) => extract(source, name)).join('\n'), context);
  return context;
}
async function run() {
  let now = 1000;
  let snapshot = { count: 1, identity: 'pro-response', finalized: false };
  let advances = 0;
  let watchdogs = 0;
  const queue = [{ id: 1, text: '다음 지시' }, { id: 2, text: '마지막 지시' }];
  const longRun = load({
    steeringStateRestoring: false, syncSteeringConversationScope: () => false,
    Date: { now: () => now }, monitoring: true, activeSite: { key: 'chatgpt' }, isGenerating: true,
    steeringQueue: queue, steeringAwaitingTurnCompletion: true, steeringObservedGenerationSinceSend: false,
    steeringChatGptAssistantBaseline: { count: 0, identity: '', finalized: false },
    steeringChatGptAssistantObservedAt: 0, steeringChatGptAssistantFinalizedAt: 0,
    chatGptLightGenerationWatchUntil: 601000, steeringLastCompletionAt: 0, completionStatus: 'idle',
    isChatGptSafeMode: () => true, maybeRescanShadowRoots() {}, detectGenerating: () => false,
    getChatGptAssistantTurnSnapshot: () => snapshot,
    markSteeringGenerationObserved() { this.steeringObservedGenerationSinceSend = true; },
    armSteeringTurnCompletionWatchdog: () => { watchdogs += 1; }, getSteeringTurnWatchdogDelayMs: () => 12000,
    updateTitleBadge() {}, updateSteeringUi() {}, holdChatGptUnobservedSteeringTurn: () => false,
    clearSteeringTurnCompletionWait() { longRun.steeringAwaitingTurnCompletion = false; },
    clearSteeringAwaitingResponseStart() {}, STEERING_AUTO_SEND_DELAY_MS: 1000,
    scheduleSteeringQueueProcessing: () => { advances += 1; },
  }, [[part03, 'observeSteeringChatGptAssistantTurn'], [part03, 'isSteeringChatGptAssistantTurnStable'], [part03, 'recoverStaleSteeringTurnWait']]);
  for (const minutes of [10, 40, 90]) {
    now = minutes * 60000;
    assert.equal(longRun.recoverStaleSteeringTurnWait('system_resume'), false, `${minutes} minutes is not proof of completion`);
    assert.equal(longRun.steeringQueue, queue);
    assert.equal(longRun.isGenerating, true);
    assert.equal(advances, 0, 'missing Stop controls do not advance the queue');
  }
  snapshot = { ...snapshot, finalized: true };
  assert.equal(longRun.recoverStaleSteeringTurnWait('watchdog'), false, 'finalization must settle');
  now += 300;
  assert.equal(longRun.recoverStaleSteeringTurnWait('watchdog'), true);
  assert.equal(advances, 1, 'a finalized new response advances once');
  assert.equal(longRun.recoverStaleSteeringTurnWait('watchdog'), false);
  assert.ok(watchdogs >= 4);
  const timers = [];
  const completionWatch = load({
    Date: { now: () => now }, isChatGptSafeMode: () => true, monitoring: true, IS_TOP_FRAME: true,
    chatGptLightCompletionWatchTimer: null, chatGptLightGenerationStartedAt: 1000,
    chatGptLightGenerationWatchUntil: 601000, steeringAwaitingTurnCompletion: true,
    steeringObservedGenerationSinceSend: false, steeringStateRestoring: false, isGenerating: true,
    document: { hidden: false }, setTimeout: (fn) => { timers.push(fn); return timers.length; }, clearTimeout() {},
    syncSteeringConversationScope: () => false, detectChatGptGeneratingLight: () => false,
    observeSteeringChatGptAssistantTurn() {}, isSteeringChatGptAssistantTurnStable: () => false,
    setChatGptLightGenerating: () => { throw new Error('An unobserved long response must not be completed'); },
  }, [[part02, 'scheduleChatGptLightCompletionWatch']]);
  for (const minutes of [40, 90]) {
    now = minutes * 60000;
    completionWatch.scheduleChatGptLightCompletionWatch();
    timers.at(-1)();
    assert.equal(completionWatch.isGenerating, true, 'completion polling also retains long responses after the old ten-minute window');
  }

  let user = { count: 3, identity: 'old-user', text: 'old message' };
  let composerText = '';
  const before = { ...user };
  const submission = load({
    Date: { now: () => now }, location: { href: 'https://chatgpt.com/c/test' },
    getChatGptUserTurnSnapshot: () => user, getCurrentComposerText: () => composerText,
    maybeRescanShadowRoots() {}, activeSite: { key: 'chatgpt' }, detectGenerating: () => true,
    waitForSteeringTick: async (ms) => { now += ms; }, hasChatGptConversationTurns: () => true,
  }, [[part04, 'waitForSubmissionStart']]);
  assert.equal(await submission.waitForSubmissionStart({}, 'next instruction', 400, { chatGptUserBaseline: before }), false,
    'old Pro generation and an emptied composer cannot acknowledge a new send');
  user = { count: 4, identity: 'other-user', text: 'different instruction' };
  assert.equal(await submission.waitForSubmissionStart({}, 'next instruction', 400, { chatGptUserBaseline: before }), false);
  user = { count: 4, identity: 'new-user', text: 'next instruction' };
  assert.equal(await submission.waitForSubmissionStart({}, 'next instruction', 400, { chatGptUserBaseline: before }), true);
  assert.equal(await submission.waitForSubmissionStart({}, '', 400, { chatGptUserBaseline: before }), true, 'file-only submissions use a new user turn');

  let finishSend;
  const a = { id: 1, text: 'a', files: [] };
  const b = { id: 2, text: 'b', files: [] };
  const c = { id: 3, text: 'c', files: [] };
  const processing = load({
    steeringConversationSessionToken: 'conversation-a', getReadyAiContentInstanceSeq: () => 7, isReadyAiCurrentContentInstance: (seq) => seq === 7,
    monitoring: true, steeringEnabled: true, readyAiEnabled: true, steeringStateRestoring: false, steeringSessionStorageFailed: false,
    steeringQueue: [a, b, c], steeringProcessing: false, steeringRestoredQueuePaused: false,
    shouldHoldSteeringQueueHeadForFirstChatGptTurn: () => false, acquireSteeringQueueDispatchLock: () => 'lock',
    releaseSteeringQueueDispatchLock() {}, canAutoSendSteeringNow: () => true,
    getSteeringItemAttachmentCount: () => 0, getSteeringQueueAttachments: () => [],
    updateSteeringUi() {}, syncSteeringQueueEditState() {}, persistSteeringSessionState: async () => true,
    captureSteeringChatGptAssistantBaseline() {}, clearSteeringChatGptAssistantObservation() {},
    sendSteeringPromptText: () => new Promise((resolve) => { finishSend = resolve; }),
    clearSteeringCompletionOffer() {}, armSteeringAwaitingResponseStart() {}, armSteeringTurnCompletionWatchdog() {},
    armSteeringSendLock() {}, isChatGptSafeMode: () => false, setSteeringStatus() {},
    steeringCloseAfterSend: false, steeringDraftText: 'new draft while sending',
  }, [[part07, 'processSteeringQueue']]);
  const inFlight = processing.processSteeringQueue();
  await new Promise(setImmediate);
  processing.steeringQueue = [b, a, c];
  finishSend({ ok: true, sent: true });
  assert.equal(await inFlight, true);
  assert.deepEqual(Array.from(processing.steeringQueue, (item) => item.id), [2, 3], 'only the confirmed item is removed after reordering');
  assert.equal(processing.steeringDraftText, 'new draft while sending');
  processing.sendSteeringPromptText = async () => ({ ok: false, sent: false, uncertain: true });
  assert.equal(await processing.processSteeringQueue(), false);
  assert.deepEqual(Array.from(processing.steeringQueue, (item) => item.id), [2, 3]);
  assert.equal(processing.steeringRestoredQueuePaused, true, 'uncertain delivery stops automatic retries');
  let sentCalls = 0;
  processing.persistSteeringSessionState = async () => false;
  processing.sendSteeringPromptText = async () => { sentCalls += 1; };
  assert.equal(await processing.processSteeringQueue(), false);
  assert.equal(sentCalls, 0, 'storage failure preserves the queued item before dispatch');

  const records = new Map();
  let savedState;
  let writes = 0;
  const file = new File([new Uint8Array(1024 * 1024 + 17).fill(91)], 'queued.pdf', { type: 'application/pdf' });
  const attachment = { file, name: file.name, type: file.type, size: file.size, isImage: false };
  const persistence = load({
    File, crypto: webcrypto, btoa, atob, Uint8Array, URL, Date, steeringConversationScope: 'conversation:a', steeringSessionSiteKey: 'chatgpt', steeringConversationSessionToken: 'a',
    steeringSessionFileCache: new WeakMap(), steeringSessionSavedSignature: '', steeringSessionLastSavedAt: 0,
    steeringAttachmentSeq: 1, steeringQueueSeq: 1, steeringQueue: [], steeringAttachments: [],
    getSteeringFileIdentity: (value) => `${value.name}:${value.size}:${value.lastModified}`,
    isReadyAiCurrentContentInstance: (seq) => seq === 7, getSiteKey: () => 'chatgpt',
    updateSteeringUi() {}, setSteeringDraftText(value) { persistence.steeringDraftText = value; },
    requestSteeringSessionStorage: async (action, payload) => {
      if (action.endsWith('file_put')) { records.set(`${payload.fileId}:${payload.chunkIndex}`, payload.data); writes += 1; return { ok: true }; }
      if (action.endsWith('file_get')) return { ok: true, data: records.get(`${payload.fileId}:${payload.chunkIndex}`) };
      savedState = payload.state; return { ok: true };
    },
  }, ['getSteeringSessionSignature', 'saveSteeringSessionFile', 'saveSteeringSessionSnapshot', 'loadSteeringSessionFile', 'applyRecoveredSteeringSession'].map((name) => [part02, name]));
  const state = { scope: 'conversation:a', queue: [{ id: 4, text: '40분 후 실행', files: [attachment], holdForFirstChatGptTurn: true }], attachments: [attachment], draft: '작성 중인 한글 지시', queueSeq: 5, attachmentSeq: 1, siteKey: 'chatgpt', panelOpen: true };
  assert.equal(await persistence.saveSteeringSessionSnapshot(state, 7), true);
  assert.equal(writes, 2, 'large files use bounded chunks and identical queue/draft files are saved once');
  assert.ok(!JSON.stringify(savedState).includes('"file":'), 'metadata never silently serializes File to an empty object');
  const restored = await persistence.loadSteeringSessionFile(savedState.queue[0].files[0]);
  assert.equal(restored.file.size, file.size);
  assert.deepEqual(new Uint8Array(await restored.file.arrayBuffer()), new Uint8Array(await file.arrayBuffer()));
  persistence.applyRecoveredSteeringSession({ ...savedState, queue: [{ ...savedState.queue[0], files: [restored] }], attachments: [restored] });
  assert.equal(persistence.steeringQueue[0].text, state.queue[0].text);
  assert.equal(persistence.steeringDraftText, state.draft);
  assert.equal(persistence.steeringRestoredQueuePaused, true, 'page recovery restores the list without automatic delivery');
  const savedBeforeStaleWrite = savedState;
  assert.equal(await persistence.saveSteeringSessionSnapshot({ ...state, draft: 'stale' }, 6), false);
  assert.equal(savedState, savedBeforeStaleWrite);
  persistence.applyRecoveredSteeringSession({ ...state, awaiting: false }, true);
  assert.equal(persistence.steeringQueue[0].files[0].file, file, 'live reinjection retains File objects');
  assert.equal(persistence.steeringDraftText, state.draft);
  const popupSource = fs.readFileSync(path.join(root, 'src/popup.js'), 'utf8');
  const lifecycleSource = read('part-12.js');
  let nextScope = 'conversation:a';
  let view = { count: 1, identity: 'user-a', text: 'a' };
  const persistedScopes = [];
  let restoredAdvances = 0;
  const sessions = load({
    crypto: webcrypto, IS_TOP_FRAME: true, monitoring: true, readyAiEnabled: true, steeringRefs: null,
    isChatGptSafeMode: () => true, getSteeringConversationScope: () => nextScope, getSiteKey: () => 'chatgpt',
    steeringConversationScope: nextScope, steeringConversationSessionToken: 'a-token', steeringConversationSessions: new Map(),
    steeringConversationStartPendingUntil: 0, steeringStateRestoring: false, steeringSessionRestoreSeq: 0, steeringSessionStorageFailed: false,
    steeringQueue: [{ id: 1, text: 'A의 후속', files: [attachment] }], steeringQueueSeq: 2,
    steeringAttachments: [attachment], steeringAttachmentSeq: 2, steeringDraftText: 'A의 작성 내용',
    steeringQueueEditingId: null, steeringQueueEditingText: '', steeringPanelOpen: true, steeringRestoredQueuePaused: false,
    steeringAwaitingTurnCompletion: false, steeringProcessing: false, steeringObservedGenerationSinceSend: false,
    steeringSessionSiteKey: 'chatgpt', isGenerating: false, completionStatus: 'idle',
    steeringChatGptAssistantBaseline: null, steeringChatGptAssistantObservedAt: 0, steeringChatGptAssistantFinalizedAt: 0,
    chatGptLightGenerationStartedAt: 0, chatGptLightGenerationWatchUntil: 0,
    getChatGptUserTurnSnapshot: () => view, getReadyAiContentInstanceSeq: () => 7, isReadyAiCurrentContentInstance: () => true,
    getSteeringQueueAttachments: (item) => item.files,
    setSteeringDraftText(value) { sessions.steeringDraftText = value; }, updateSteeringUi() {}, setSteeringStatus() {},
    clearSteeringAutoSendTimer() {}, clearSteeringSendLock() {}, clearChatGptLightCompletionWatch() {},
    clearSteeringAwaitingResponseStart() {}, clearSteeringTurnCompletionWait() { sessions.steeringAwaitingTurnCompletion = false; },
    armSteeringTurnCompletionWatchdog() {}, scheduleChatGptLightCompletionWatch() {}, scheduleSteeringSessionSave() {},
    persistSteeringSessionState: async (override) => { persistedScopes.push(override || sessions.captureSteeringSessionState()); return true; },
    requestSteeringSessionStorage: async () => ({ ok: true, state: null }),
    Date: { now: () => now }, waitForSteeringTick: async (ms) => { now += ms; },
    scheduleSteeringQueueProcessing: () => { restoredAdvances += 1; }, STEERING_AUTO_SEND_DELAY_MS: 1000,
  }, ['captureSteeringSessionState', 'syncSteeringConversationScope', 'restoreSteeringSessionState', 'applyRecoveredSteeringSession', 'waitForSteeringConversationView'].map((name) => [part02, name]));
  nextScope = 'conversation:b';
  assert.equal(sessions.syncSteeringConversationScope(), true);
  await new Promise(setImmediate);
  assert.equal(sessions.steeringQueue.length, 0, 'A queue does not follow navigation to B');
  assert.equal(sessions.steeringDraftText, '');
  sessions.steeringQueue = [{ id: 1, text: 'B의 후속', files: [] }];
  sessions.steeringDraftText = 'B의 작성 내용';
  view = { count: 1, identity: 'user-b', text: 'b' };
  nextScope = 'conversation:a';
  sessions.syncSteeringConversationScope();
  view = { count: 1, identity: 'user-a', text: 'a' };
  await new Promise(setImmediate);
  assert.equal(sessions.steeringQueue[0].text, 'A의 후속');
  assert.equal(sessions.steeringQueue[0].files[0].file, file, 'returning restores the original live File');
  assert.equal(sessions.steeringDraftText, 'A의 작성 내용');
  assert.equal(sessions.steeringRestoredQueuePaused, false, 'returning to a known conversation resumes its own queue');
  assert.equal(restoredAdvances, 2, 'each completed switch schedules only the current conversation');
  assert.deepEqual(persistedScopes.map((state) => state.scope), ['conversation:a', 'conversation:b']);
  nextScope = 'conversation:b';
  sessions.syncSteeringConversationScope();
  view = { count: 1, identity: 'user-b', text: 'b' };
  await new Promise(setImmediate);
  assert.equal(sessions.steeringQueue[0].text, 'B의 후속');
  assert.equal(sessions.steeringDraftText, 'B의 작성 내용');
  const writesBeforeRecoverySwitch = persistedScopes.length;
  sessions.steeringStateRestoring = true;
  nextScope = 'conversation:slow-recovery';
  sessions.syncSteeringConversationScope();
  await new Promise(setImmediate);
  assert.equal(persistedScopes.length, writesBeforeRecoverySwitch, 'leaving during file recovery never saves a partial list over the original');

  sessions.steeringConversationScope = 'draft:/';
  sessions.steeringQueue = [{ id: 1, text: '첫 대화 후속', files: [] }];
  sessions.steeringProcessing = true;
  sessions.steeringStateRestoring = false;
  nextScope = 'conversation:new-id';
  const originalToken = sessions.steeringConversationSessionToken;
  assert.equal(sessions.syncSteeringConversationScope(), false, 'assigning a new chat ID preserves that same session');
  assert.equal(sessions.steeringQueue[0].text, '첫 대화 후속');
  assert.equal(sessions.steeringConversationSessionToken, originalToken);
  assert.equal(persistedScopes.at(-1).queue.length, 0, 'the old blank-chat backup is cleared during migration');

  processing.steeringConversationSessionToken = 'a-token';
  processing.steeringQueue = [a];
  processing.persistSteeringSessionState = async () => true;
  processing.sendSteeringPromptText = () => new Promise((resolve) => { finishSend = resolve; });
  const oldSend = processing.processSteeringQueue();
  await new Promise(setImmediate);
  processing.steeringConversationSessionToken = 'b-token';
  processing.steeringQueue = [{ id: 1, text: 'B must survive', files: [] }];
  finishSend({ ok: true, sent: true });
  assert.equal(await oldSend, false);
  assert.equal(processing.steeringQueue[0].text, 'B must survive', 'late send completion from A cannot remove B even when IDs match');

  let stops = 0;
  let refreshes = 0;
  const usage = load({
    readyAiEnabled: true, steeringQueue: [a], steeringRestoredQueuePaused: false, steeringConversationSessions: new Map(),
    persistSteeringSessionState: async () => true, stopMonitoring: () => { stops += 1; },
    refreshSiteFromStorage: () => { refreshes += 1; },
  }, [[lifecycleSource, 'applyReadyAiUsageEnabled']]);
  usage.applyReadyAiUsageEnabled(false);
  assert.equal(usage.readyAiEnabled, false);
  assert.equal(usage.steeringQueue[0], a, 'turning off preserves the queue');
  assert.equal(usage.steeringRestoredQueuePaused, true);
  assert.equal(stops, 1);
  usage.applyReadyAiUsageEnabled(true);
  assert.equal(refreshes, 1);
  assert.equal(usage.steeringRestoredQueuePaused, true, 'turning on never silently sends preserved work');
  const nodes = new Map(['ready-ai-usage', 'ready-ai-use-on', 'ready-ai-use-off', 'ready-ai-usage-state', 'ready-ai-usage-note'].map((id) => [id, { dataset: {}, setAttribute(key, value) { this[key] = value; } }]));
  const popup = load({ $: (id) => nodes.get(id) }, [[popupSource, 'renderReadyAiUsageControl']]);
  popup.renderReadyAiUsageControl({ readyAiEnabled: false });
  assert.equal(nodes.get('ready-ai-use-off')['aria-pressed'], 'true');
  assert.equal(nodes.get('ready-ai-usage-state').textContent, '사용 안 함');
  popup.renderReadyAiUsageControl({ readyAiEnabled: true });
  assert.equal(nodes.get('ready-ai-use-on')['aria-pressed'], 'true');
  assert.equal(nodes.get('ready-ai-usage-state').textContent, '사용 중');
  console.log('Pro queue preservation: 10/40/90-minute responses, delivery acknowledgment, reorder races, recovery and file bytes passed');
  console.log('Conversation sessions: A/B queues, drafts, attachments, first-chat migration, navigation races and pause controls passed');
}
module.exports = run;
if (require.main === module) run().catch((error) => { console.error(error); process.exitCode = 1; });
