const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8');

// Exercise the actual worker entry imports, resolving relative to the manifest
// worker URL. Testing the storage module alone misses a broken startup path.
const { pathToFileURL, fileURLToPath } = require('node:url');
const manifestForImports = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const workerUrl = pathToFileURL(path.join(root, manifestForImports.background.service_worker));
const storageListeners = [];
const bootContext = {
  console,
  chrome: { runtime: { onMessage: { addListener(listener) { storageListeners.push(listener); } } } },
};
vm.createContext(bootContext);
bootContext.importScripts = (...urls) => {
  for (const url of urls) {
    const resolved = fileURLToPath(new URL(url, workerUrl));
    vm.runInContext(fs.readFileSync(resolved, 'utf8'), bootContext, { filename: resolved });
  }
};
vm.runInContext(background.slice(0, background.indexOf('// tabStates')), bootContext);
assert.ok(bootContext.ReadyAi?.sites, 'the manifest worker imports its sites registry');
assert.equal(typeof bootContext.handleReadyAiSessionStorage, 'function', 'the manifest worker imports the follow-up store');
assert.equal(storageListeners.length, 1, 'the follow-up storage message listener is registered at worker startup');

function extractSimpleFunction(source, name) {
  const pattern = new RegExp(`(?:async )?function ${name}\\([^]*?\\n\\}`);
  const match = source.match(pattern);
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

const context = {};
vm.createContext(context);
vm.runInContext(
  `${extractSimpleFunction(background, 'shouldRecoverManifestManagedContent')}\n`
    + 'this.shouldRecover = shouldRecoverManifestManagedContent;',
  context
);

const cases = [
  ['completed tab with no listener is recovered', { status: 'complete' }, null, {}, true],
  ['completed tab with a responsive listener is not duplicated', { status: 'complete' }, { ok: true }, {}, false],
  ['completed tab with an older responsive build is replaced', { status: 'complete' }, { ok: true }, { recoverVersionMismatch: true }, true],
  ['loading tab with an older responsive build waits', { status: 'loading' }, { ok: true }, { recoverVersionMismatch: true }, false],
  ['loading tab waits for manifest document_idle injection', { status: 'loading' }, null, {}, false],
  ['unknown tab state is not injected speculatively', {}, null, {}, false],
  ['an explicit force can recover a non-complete tab', { status: 'loading' }, null, { forceInject: true }, true],
  ['force still does not duplicate a responsive listener', { status: 'complete' }, { ok: true }, { forceInject: true }, false],
];

for (const [label, tab, response, options, expected] of cases) {
  assert.equal(context.shouldRecover(tab, response, options), expected, label);
}

assert.match(background, /recoverVersionMismatch: true/);
assert.match(background, /return isCurrentBuild\(reinjected\);/);
assert.match(background, /kickActivePrimaryAiTabs\('sw_init_active'\)/);

console.log(`Ready_Ai content recovery: ${cases.length} policy cases passed`);
vm.runInContext(extractSimpleFunction(background, 'isReadyAiContentBuildCurrentOrNewer'), context);
assert.equal(context.isReadyAiContentBuildCurrentOrNewer('2026-10-02.10-next', '2026-10-02.9-current'), true, 'an older worker never reinjects repeatedly over newer compatible content');
assert.equal(context.isReadyAiContentBuildCurrentOrNewer('2026-10-02.4-old', '2026-10-02.5-current'), false, 'older builds still receive an upgrade');
assert.equal(context.isReadyAiContentBuildCurrentOrNewer('2026-10-03.1-next', '2026-10-02.5-current'), true);

async function testChatGptStartup() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const chatGptEntry = manifest.content_scripts.find((entry) => entry.matches.includes('https://chatgpt.com/*'));
  assert.equal(chatGptEntry.run_at, 'document_end', 'bootstrap does not wait for slow subresources');
  assert.deepEqual(chatGptEntry.js, ['src/content/chatgpt-bootstrap.js'], 'only the lightweight bootstrap is declarative');
  assert.equal(chatGptEntry.all_frames, false);
  assert.equal(manifest.content_scripts[1].run_at, 'document_idle', 'other platform timing is preserved');

  let batchShouldFail = true;
  let apiError = null;
  const injections = [];
  const scriptingContext = {
    chrome: {
      runtime: { get lastError() { return apiError; } },
      scripting: {
        executeScript(request, callback) {
          injections.push(JSON.parse(JSON.stringify(request)));
          apiError = batchShouldFail && request.files.length > 1 ? { message: 'batch fetch failed' } : null;
          callback();
          apiError = null;
        },
      },
    },
  };
  vm.createContext(scriptingContext);
  vm.runInContext(extractSimpleFunction(background, 'pScriptingExecOnce') + '\n'
    + extractSimpleFunction(background, 'pScriptingExec'), scriptingContext);
  assert.equal(await scriptingContext.pScriptingExec(42, ['a.js', 'b.js'], false,
    { injectImmediately: true, documentId: 'navigation-1' }), true);
  assert.equal(injections.length, 3, 'batch failure falls back in file order');
  for (const request of injections) {
    assert.equal(request.injectImmediately, true, 'fallback does not silently resume document_idle waiting');
    assert.deepEqual(request.target, { tabId: 42, documentIds: ['navigation-1'] }, 'injection cannot drift to a later reload');
  }
  batchShouldFail = false;
  await scriptingContext.pScriptingExec(43, ['a.js']);
  assert.equal(injections.at(-1).injectImmediately, undefined, 'normal platform injection retains its default timing');
  assert.deepEqual(injections.at(-1).target, { tabId: 43, allFrames: false });

  const pending = [];
  const bootContext = {
    contentEnsureInFlight: new Map(),
    isChatGptUrl: () => true,
    ensureContentScriptsNow: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
  };
  vm.createContext(bootContext);
  vm.runInContext(extractSimpleFunction(background, 'ensureContentScripts'), bootContext);
  const tab = { id: 42, url: 'https://chatgpt.com/' };
  const first = bootContext.ensureContentScripts(tab, { documentId: 'navigation-1' });
  const duplicate = bootContext.ensureContentScripts(tab, { documentId: 'navigation-1' });
  assert.equal(pending.length, 1, 'bootstrap and navigation share the same pending document');
  const reload = bootContext.ensureContentScripts(tab, { documentId: 'navigation-2' });
  assert.equal(pending.length, 2, 'a same-URL reload gets its own initialization');
  pending[0].resolve(true);
  assert.equal(await first, true);
  assert.equal(await duplicate, true);
  pending[1].resolve(false);
  assert.equal(await reload, false);
  assert.equal(bootContext.contentEnsureInFlight.size, 0, 'failed initialization can be retried');
  const retry = bootContext.ensureContentScripts(tab, { documentId: 'navigation-2' });
  pending[2].reject(new Error('navigation interrupted'));
  await assert.rejects(retry, /navigation interrupted/);
  assert.equal(bootContext.contentEnsureInFlight.size, 0, 'interrupted navigation also releases the pending operation');

  const startupCalls = [];
  let bodyReadyObserver;
  const readyContext = {
    MutationObserver: class { constructor(callback) { bodyReadyObserver = callback; } observe() {} disconnect() {} },
    addReadyAiEventListener: (target, ...args) => target.addEventListener(...args),
    document: { readyState: 'loading', body: null, documentElement: {}, addEventListener: (...args) => startupCalls.push(args) },
    isChatGptSafeMode: () => true,
    refreshSiteFromStorage: () => startupCalls.push('initialized'),
  };
  vm.createContext(readyContext);
  const content = fs.readFileSync(path.join(root, 'src', 'content', 'part-12.js'), 'utf8');
  vm.runInContext(extractSimpleFunction(content, 'initializeReadyAiContent'), readyContext);
  readyContext.initializeReadyAiContent();
  assert.equal(startupCalls.length, 1, 'early injection must not initialize against a missing body');
  assert.equal(startupCalls[0][0], 'DOMContentLoaded');
  assert.equal(startupCalls[0][2].once, true);
  readyContext.document.body = {};
  bodyReadyObserver();
  assert.equal(startupCalls[1], 'initialized', 'body availability starts immediately before DOMContentLoaded');
  startupCalls[0][1]();
  assert.equal(startupCalls.length, 2, 'the fallback event never initializes twice');
  readyContext.document.readyState = 'interactive';
  readyContext.initializeReadyAiContent();
  assert.equal(startupCalls[2], 'initialized', 'ready DOM starts without waiting for window.load');
  readyContext.isChatGptSafeMode = () => false;
  readyContext.document.readyState = 'loading';
  readyContext.initializeReadyAiContent();
  assert.equal(startupCalls[3], 'initialized', 'other sites preserve their existing initialization');
  console.log('ChatGPT startup: early injection, ordered fallback, navigation deduplication and DOM readiness passed');
}
testChatGptStartup().then(() => require('./test-pro-queue-preservation')())
  .then(() => require('./test-session-recovery-races')()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
