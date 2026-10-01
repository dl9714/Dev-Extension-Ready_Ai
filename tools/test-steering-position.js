const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const part03 = fs.readFileSync(path.join(root, 'src', 'content', 'part-03.js'), 'utf8');

function extractSimpleFunction(source, name) {
  const pattern = new RegExp(`(?:async\\s+)?function ${name}\\([^]*?\\n\\}`);
  const match = source.match(pattern);
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

const context = {};
vm.createContext(context);
vm.runInContext(
  `${extractSimpleFunction(part03, 'getSteeringAnchorElement')}\n`
    + 'this.getAnchor = getSteeringAnchorElement;',
  context
);

let siteKey = 'gemini';
let outerVisible = true;
const inputArea = { id: 'gemini-input-area' };
const form = { id: 'fallback-form' };
const composer = {
  closest(selector) {
    if (selector.includes('input-area-v2')) return inputArea;
    if (selector === 'form') return form;
    return null;
  },
};
context.getActiveComposer = () => composer;
context.getSiteKey = () => siteKey;
context.isVisible = (element) => element === inputArea ? outerVisible : true;

assert.equal(context.getAnchor(), inputArea, 'Gemini uses the full input container, including right-side controls');

outerVisible = false;
assert.equal(context.getAnchor(), form, 'Gemini safely falls back when the outer container is hidden');

outerVisible = true;
for (const key of ['chatgpt', 'aistudio', 'claude', 'perplexity']) {
  siteKey = key;
  assert.equal(context.getAnchor(), form, `${key} keeps its existing anchor behavior`);
}

context.getActiveComposer = () => null;
assert.equal(context.getAnchor(), null, 'a missing composer remains safe');

const positionContext = {};
vm.createContext(positionContext);
vm.runInContext(
  `${extractSimpleFunction(part03, 'getSteeringStableBottom')}\n`
    + `${extractSimpleFunction(part03, 'getSteeringModelSafeRight')}\n`
    + `${extractSimpleFunction(part03, 'positionSteeringUi')}\n`
    + `${extractSimpleFunction(part03, 'refreshFallbackSteeringPosition')}\n`
    + 'this.position = positionSteeringUi;',
  positionContext
);

let anchorRect = { right: 1316, top: 738 };
let positionSiteKey = 'gemini';
let sizeVarApplyCount = 0;
positionContext.steeringHost = { style: { setProperty() {} } };
positionContext.steeringPanelOpen = false;
positionContext.steeringQueue = [];
positionContext.steeringAdvancedEnabled = false;
positionContext.steeringLastPositionSignature = '';
positionContext.window = { innerWidth: 1920, innerHeight: 855 };
positionContext.getSteeringAnchorElement = () => ({ getBoundingClientRect: () => anchorRect });
positionContext.getSteeringLayoutPositionKey = () => 'closed:empty:basic';
positionContext.getSiteKey = () => positionSiteKey;
positionContext.applySteeringViewportSizeVars = () => { sizeVarApplyCount += 1; };
positionContext.shouldDockSteeringAtViewportBottom = () => false;

assert.equal(positionContext.getSteeringStableBottom('gemini'), 111, 'Gemini uses the measured conversation dock height');
assert.equal(positionContext.getSteeringStableBottom('chatgpt'), 122, 'ChatGPT retains its existing stable dock height');
assert.equal(positionContext.getSteeringStableBottom('aistudio'), null, 'AI Studio retains composer-relative vertical positioning');

positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '24px', '1920px Gemini sits to the right of the conversation composer');
assert.equal(positionContext.steeringHost.style.bottom, '111px', 'Gemini launcher starts at the same lower dock used during a conversation');

anchorRect = { right: 1316, top: 395.5 };
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.bottom, '111px', 'Gemini home composer does not pull the launcher into the middle of the viewport');

const sizeVarApplyCountBeforeRepeat = sizeVarApplyCount;
for (let i = 0; i < 1000; i += 1) positionContext.position(false);
assert.equal(sizeVarApplyCount, sizeVarApplyCountBeforeRepeat, 'unchanged repeated positioning is skipped');

for (const scenario of [
  { width: 360, height: 420, right: 348, top: 190, expectedRight: 12 },
  { width: 1024, height: 640, right: 890, top: 280, expectedRight: 24 },
  { width: 1366, height: 768, right: 1100, top: 650, expectedRight: 24 },
  { width: 2560, height: 1440, right: 1880, top: 1260, expectedRight: 24 },
]) {
  positionContext.window.innerWidth = scenario.width;
  positionContext.window.innerHeight = scenario.height;
  anchorRect = { right: scenario.right, top: scenario.top };
  positionContext.steeringLastPositionSignature = '';
  positionContext.position(true);
  assert.equal(positionContext.steeringHost.style.right, `${scenario.expectedRight}px`, `Gemini keeps safe horizontal alignment at ${scenario.width}x${scenario.height}`);
  assert.equal(positionContext.steeringHost.style.bottom, '111px', `Gemini keeps the lower dock at ${scenario.width}x${scenario.height}`);
}

positionContext.window.innerWidth = 760;
positionContext.window.innerHeight = 700;
anchorRect = { right: 748, top: 620 };
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '12px', 'narrow Gemini view keeps the 12px viewport safe margin');
assert.equal(positionContext.steeringHost.style.bottom, '111px', 'narrow Gemini view keeps the stable lower dock');

positionContext.window.innerWidth = 1920;
positionContext.window.innerHeight = 855;
anchorRect = { right: 1316, top: 395.5 };
positionContext.getSteeringAnchorElement = () => null;
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '18px', 'Gemini stays safe before its composer is mounted');
assert.equal(positionContext.steeringHost.style.bottom, '111px', 'Gemini starts at the lower dock even before its composer is mounted');
assert.match(positionContext.steeringLastPositionSignature, /\|fallback\|/, 'Gemini keeps retrying horizontal anchoring while its composer is missing');

positionContext.getSteeringAnchorElement = () => ({ getBoundingClientRect: () => anchorRect });
assert.equal(positionContext.refreshFallbackSteeringPosition(), true, 'Gemini retries horizontal anchoring after the composer mounts');
assert.equal(positionContext.steeringHost.style.right, '24px', 'Gemini resolves to its viewport-right dock without a click');
assert.equal(positionContext.steeringHost.style.bottom, '111px', 'Gemini remains at the lower dock after resolving its composer');

positionSiteKey = 'chatgpt';
positionContext.window.innerWidth = 1920;
positionContext.window.innerHeight = 855;
anchorRect = { right: 1200, top: 730 };
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '482px', 'ChatGPT keeps its existing 250px shift and scrollbar gutter');
assert.equal(positionContext.steeringHost.style.bottom, '122px', 'ChatGPT keeps its stable vertical dock');

positionContext.steeringPanelOpen = true;
positionContext.window.innerHeight = 821;
positionContext.steeringHost.getBoundingClientRect = () => ({ width: 430, height: 522 });
positionContext.isVisible = () => true;
let modelRect = { left: 1354, right: 1427, top: 353, bottom: 389 };
const modelAnchor = { querySelector: () => ({ getBoundingClientRect: () => modelRect }) };
assert.equal(positionContext.getSteeringModelSafeRight(modelAnchor, 168, 122), 51, 'the expanded panel moves beside the home model trigger');
modelRect = { left: 1354, right: 1427, top: 730, bottom: 766 };
assert.equal(positionContext.getSteeringModelSafeRight(modelAnchor, 168, 122), 168, 'a conversation composer below the panel needs no horizontal move');
positionContext.window.innerWidth = 1000;
modelRect = { left: 700, right: 780, top: 353, bottom: 389 };
assert.equal(positionContext.getSteeringModelSafeRight(modelAnchor, 168, 122), 312, 'a narrower desktop uses the available left side');
positionContext.window.innerWidth = 360;
positionContext.steeringHost.getBoundingClientRect = () => ({ width: 332, height: 522 });
modelRect = { left: 180, right: 250, top: 353, bottom: 389 };
assert.equal(positionContext.getSteeringModelSafeRight(modelAnchor, 18, 122), 18, 'a small viewport keeps the panel inside the screen when no side fits');
positionContext.steeringPanelOpen = false;
positionContext.window.innerWidth = 1920;
positionContext.window.innerHeight = 855;

positionSiteKey = 'aistudio';
anchorRect = { right: 1200, top: 730 };
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '120px', 'AI Studio keeps its existing viewport-right dock');

anchorRect = { right: 1395, top: 750 };
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '120px', 'measured 1920px AI Studio layout docks at the screen-right margin');
assert.equal(positionContext.steeringHost.style.bottom, '115px', 'AI Studio keeps its measured composer-relative vertical position');

positionContext.getSteeringAnchorElement = () => null;
positionContext.steeringLastPositionSignature = '';
positionContext.position(true);
assert.equal(positionContext.steeringHost.style.right, '18px', 'a missing AI Studio composer uses the temporary viewport fallback');
assert.match(positionContext.steeringLastPositionSignature, /\|fallback\|/, 'the temporary position remains identifiable for a later DOM refresh');

positionContext.getSteeringAnchorElement = () => ({ getBoundingClientRect: () => anchorRect });
assert.equal(positionContext.refreshFallbackSteeringPosition(), true, 'a status refresh retries the temporary position');
assert.equal(positionContext.steeringHost.style.right, '120px', 'AI Studio moves to the viewport-right dock without requiring a launcher click');
assert.doesNotMatch(positionContext.steeringLastPositionSignature, /\|fallback\|/, 'the resolved position stops fallback retries');

const fitContext = {};
vm.createContext(fitContext);
vm.runInContext(
  `${extractSimpleFunction(part03, 'fitOpenSteeringUiInsideViewport')}\n`
    + 'this.fit = fitOpenSteeringUiInsideViewport;',
  fitContext
);
fitContext.steeringPanelOpen = true;
fitContext.steeringHost = {
  style: { bottom: '111px' },
  getBoundingClientRect: () => ({ top: -30 }),
};
fitContext.fit();
assert.equal(fitContext.steeringHost.style.bottom, '69px', 'an open Gemini panel shifts down only enough to keep its top clickable');

fitContext.steeringPanelOpen = false;
fitContext.steeringHost.style.bottom = '111px';
fitContext.fit();
assert.equal(fitContext.steeringHost.style.bottom, '111px', 'a closed launcher keeps the stable lower dock');

const overlayContext = {};
vm.createContext(overlayContext);
for (const name of [
  'shouldYieldSteeringToSiteOverlay', 'getChatGptOverlayRects', 'applySteeringOverlayYield',
  'scheduleSteeringOverlayYield', 'startSteeringOverlayWatch', 'stopSteeringOverlayWatch',
]) {
  vm.runInContext(extractSimpleFunction(part03, name), overlayContext);
}
const launcherRect = { left: 800, top: 670, right: 1040, bottom: 735 };
const modelMenuRect = { left: 780, top: 640, right: 1050, bottom: 760 };
assert.equal(overlayContext.shouldYieldSteeringToSiteOverlay([launcherRect], [modelMenuRect]), true, 'the Pro menu can take the launcher area');
assert.equal(overlayContext.shouldYieldSteeringToSiteOverlay([launcherRect], []), false, 'closing the menu restores the launcher');
assert.equal(overlayContext.shouldYieldSteeringToSiteOverlay([launcherRect], [{ ...modelMenuRect, left: 1040 }]), false, 'touching edges are not an overlap');
assert.equal(overlayContext.shouldYieldSteeringToSiteOverlay([launcherRect], [{ ...modelMenuRect, top: 735 }]), false, 'vertically touching edges are not an overlap');
assert.equal(overlayContext.shouldYieldSteeringToSiteOverlay([{ left: 0, top: 0, right: 0, bottom: 0 }], [modelMenuRect]), false, 'hidden panel boxes cannot trigger yielding');
assert.equal(overlayContext.shouldYieldSteeringToSiteOverlay([launcherRect], [{ ...modelMenuRect, right: NaN }]), false, 'invalid overlay geometry is ignored');

let overlaySiteKey = 'chatgpt';
let nativeOverlays = [];
let visibilityWrites = 0;
let hostVisibility = '';
const draftInput = { value: '보존할 후속 지시' };
const queuedPrompts = [{ text: '대기 중인 지시' }];
overlayContext.steeringPanelOpen = false;
overlayContext.steeringQueue = queuedPrompts;
overlayContext.steeringRefs = { input: draftInput };
overlayContext.getSiteKey = () => overlaySiteKey;
overlayContext.isReadyAiDuplicateContentInstance = () => false;
overlayContext.isVisible = (element) => element.visible;
overlayContext.document = {
  body: {},
  querySelectorAll: () => nativeOverlays,
};
overlayContext.steeringRoot = { querySelectorAll: () => [{ getBoundingClientRect: () => launcherRect }] };
overlayContext.steeringHost = {
  contains: () => false,
  style: {
    display: 'block', right: '482px', bottom: '122px', zIndex: '2147483647',
    get visibility() { return hostVisibility; },
    set visibility(value) { hostVisibility = value; visibilityWrites += 1; },
  },
};
function overlayElement(options = {}) {
  return {
    visible: options.visible !== false,
    getAttribute: (attribute) => options[attribute] || null,
    querySelector: (selector) => selector === '[role="tooltip"]' ? (options.tooltip || null) : null,
    getBoundingClientRect: () => options.rect || modelMenuRect,
  };
}
nativeOverlays = [overlayElement({ visible: false }), overlayElement({ tooltip: true }), overlayElement({ 'data-state': 'closed' }), overlayElement({ 'aria-hidden': 'true' })];
assert.equal(overlayContext.getChatGptOverlayRects().length, 0, 'hidden and tooltip overlays do not disturb the launcher');
overlayContext.applySteeringOverlayYield();
assert.equal(hostVisibility, '');
nativeOverlays = [overlayElement()];
overlayContext.applySteeringOverlayYield();
assert.equal(hostVisibility, 'hidden', 'an overlapping native menu hides the launcher');
const writesBeforeRepeat = visibilityWrites;
overlayContext.applySteeringOverlayYield();
assert.equal(visibilityWrites, writesBeforeRepeat, 'unchanged yield state avoids repeated DOM writes');
overlayContext.steeringPanelOpen = true;
overlayContext.applySteeringOverlayYield();
assert.equal(hostVisibility, 'hidden', 'an open panel also yields to the native menu');
assert.equal(draftInput.value, '보존할 후속 지시', 'yielding preserves the draft');
assert.equal(overlayContext.steeringQueue, queuedPrompts, 'yielding preserves the queue');
assert.equal(overlayContext.steeringPanelOpen, true, 'yielding preserves panel state');
nativeOverlays = [];
overlayContext.applySteeringOverlayYield();
assert.equal(hostVisibility, '', 'dismissal restores the open panel');
assert.equal(overlayContext.steeringHost.style.bottom, '122px', 'restoration retains the dock');
assert.equal(overlayContext.steeringHost.style.zIndex, '2147483647', 'yielding does not permanently lower the panel stacking order');
nativeOverlays = [overlayElement({ rect: { left: 20, top: 20, right: 300, bottom: 400 } })];
overlayContext.applySteeringOverlayYield();
assert.equal(hostVisibility, '', 'unrelated menus do not hide the launcher');
nativeOverlays = [overlayElement()];
overlaySiteKey = 'gemini';
overlayContext.applySteeringOverlayYield();
assert.equal(hostVisibility, '', 'other sites retain their UI');

overlaySiteKey = 'chatgpt';
overlayContext.monitoring = true;
overlayContext.steeringOverlayRafId = 0;
overlayContext.steeringOverlayObserver = null;
let pendingFrame = null;
let requestedFrames = 0;
let disconnected = false;
let observedOptions = null;
overlayContext.window = {
  requestAnimationFrame(callback) { pendingFrame = callback; requestedFrames += 1; return requestedFrames; },
  cancelAnimationFrame() { pendingFrame = null; },
};
overlayContext.MutationObserver = class {
  constructor(callback) { this.callback = callback; }
  observe(target, options) { assert.equal(target, overlayContext.document.body); observedOptions = options; }
  disconnect() { disconnected = true; }
};
overlayContext.startSteeringOverlayWatch();
const firstObserver = overlayContext.steeringOverlayObserver;
overlayContext.startSteeringOverlayWatch();
assert.equal(overlayContext.steeringOverlayObserver, firstObserver, 'remounts reuse the portal watcher');
assert.equal(observedOptions.childList, true);
assert.equal(observedOptions.subtree, undefined, 'the watcher does not scan conversation changes');
firstObserver.callback();
firstObserver.callback();
assert.equal(requestedFrames, 1, 'portal changes coalesce into one frame');
pendingFrame();
assert.equal(hostVisibility, 'hidden', 'portal changes apply the collision policy');
overlayContext.scheduleSteeringOverlayYield();
overlayContext.stopSteeringOverlayWatch();
assert.equal(disconnected, true, 'stopping monitoring disconnects the watcher');
assert.equal(pendingFrame, null, 'stopping monitoring cancels pending frame work');
assert.equal(overlayContext.steeringOverlayRafId, 0);

console.log('steering position regression tests passed');
