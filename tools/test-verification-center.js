const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const popupHtml = read('src', 'popup.html');
const popupJs = read('src', 'popup.js');
const background = read('src', 'background.js');
const content = read('src', 'content', 'part-02.js');
const docs = read('docs', 'VERIFICATION_TEST_MATRIX.md');
const runner = read('tools', 'run-verification-suite.js');
const suite = JSON.parse(read('src', 'verification-suite.json'));

function extractFunction(source, name) {
  const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

assert.equal(suite.schemaVersion, 2, 'the platform-aware verification data has a known schema');
assert.equal(suite.suiteVersion, '1.7.0', 'the platform-tab verification pack exposes its own version');
assert.equal(suite.appVersion, '2026-10-02.7', 'the verification pack records the app build it covers');
assert.equal(suite.automated.status, 'passed', 'the automated verification result is explicit');
assert.equal(suite.automated.repeatRounds, 5, 'critical recovery changes record five full rounds');
assert.equal(suite.automated.randomizedPlansPerRound, 125000, 'randomized coverage is recorded per round');
assert.deepEqual(
  Object.values(suite.automated.platformRuns).map((run) => [run.status, run.groups, run.rounds]),
  [['passed', 8, 5], ['passed', 6, 5], ['passed', 5, 5]],
  'the latest full runs cover each platform'
);
assert.equal(suite.cadencePolicy.mode, 'change_triggered', 'live verification follows change-triggered cadence');
assert.equal(suite.cadencePolicy.routineRepeatRounds, 1, 'routine changes require one round');
assert.equal(suite.cadencePolicy.criticalRepeatRounds, 5, 'critical changes retain five rounds');
assert.equal(suite.cadencePolicy.structuralReviewDays, 90, 'periodic structure-only review remains scheduled');
assert.equal(suite.cadencePolicy.majorChangeSignals.length, 4, 'major GPT web change signals are explicit');
assert.equal(suite.liveWeb.status, 'scheduled', 'live GPT checks wait for a major web change trigger');
assert.equal(suite.liveWeb.structuralStatus, 'passed', 'the completed read-only Chrome structure check is recorded separately');
assert.equal(suite.groups.length, 9, 'all automated verification groups are listed');
assert.equal(suite.platforms.length, 3, 'GPT, Gemini, and AI Studio are separated');
assert.deepEqual(suite.platforms.map((platform) => platform.runnerArg), ['gpt', 'gemini', 'ais'], 'platform runner arguments stay stable');
assert.equal(suite.categories.length, 5, 'the verification list has five scannable categories');
assert.deepEqual(suite.categories.map((category) => category.id), ['input', 'generation', 'queue', 'recovery', 'ui'], 'category order stays intuitive');
assert.equal(suite.manualChecks.length, 20, 'all platform live web scenarios are listed');

const groupIds = suite.groups.map((group) => group.id);
assert.equal(new Set(groupIds).size, groupIds.length, 'verification group ids are unique');
const manualIds = suite.manualChecks.map((check) => check.id);
assert.equal(new Set(manualIds).size, manualIds.length, 'manual scenario ids are unique');
const categoryIds = new Set(suite.categories.map((category) => category.id));
suite.groups.forEach((group) => {
  assert.equal(group.status, 'passed', `${group.id} has a completed automated result`);
  assert.ok(Array.isArray(group.platforms) && group.platforms.length > 0, `${group.id} belongs to at least one platform`);
  group.platforms.forEach((platformId) => assert.ok(suite.platforms.some((platform) => platform.id === platformId), `${group.id} uses a known platform`));
  assert.ok(categoryIds.has(group.category), `${group.id} belongs to a known category`);
  assert.match(String(group.version), /^\d+\.\d+$/, `${group.id} has a readable version`);
  assert.equal(group.passedInAppVersion, suite.appVersion, `${group.id} records the app version where it passed`);
  assert.equal(group.passedAt, suite.completedAt, `${group.id} records the date where it passed`);
  assert.ok(fs.existsSync(path.join(root, group.script)), `${group.id} script exists: ${group.script}`);
  assert.match(docs, new RegExp(`\\| ${group.id.replace('-', '\\-')} \\|`), `${group.id} is documented for the next AI`);
});
suite.manualChecks.forEach((check) => {
  assert.ok(['scheduled', 'passed'].includes(check.status), `${check.id} has a supported live verification status`);
  assert.ok(suite.platforms.some((platform) => platform.id === check.platform), `${check.id} belongs to a known platform`);
  assert.ok(categoryIds.has(check.category), `${check.id} belongs to a known category`);
  if (check.status === 'passed') {
    assert.match(String(check.passedInAppVersion || ''), /^\d{4}-\d{2}-\d{2}\.\d+$/, `${check.id} records its passed app version`);
    assert.match(String(check.passedAt || ''), /^\d{4}-\d{2}-\d{2}$/, `${check.id} records its passed date`);
  } else {
    assert.equal(check.passedInAppVersion, undefined, `${check.id} does not invent a pass version before live verification`);
  }
  assert.match(docs, new RegExp(check.id), `${check.id} is documented`);
});
assert.equal(suite.manualChecks.filter((check) => check.status === 'passed').length, 2, 'only completed live scenarios count as passed');
assert.equal(suite.manualChecks.filter((check) => check.status === 'scheduled').length, 18, 'remaining live scenarios wait for a major platform web change');
assert.deepEqual(
  suite.manualChecks.filter((check) => check.status === 'passed').map((check) => [check.id, check.passedInAppVersion]),
  [['GPT-WEB-01', '2026-08-19.6'], ['GPT-WEB-07', '2026-08-19.6']],
  'completed live baselines preserve the app version where they actually passed'
);
assert.deepEqual(
  suite.platforms.map((platform) => suite.groups.filter((group) => group.platforms.includes(platform.id)).length),
  [8, 6, 5],
  'automated coverage is separated by platform'
);
assert.deepEqual(
  suite.platforms.map((platform) => suite.manualChecks.filter((check) => check.platform === platform.id).length),
  [9, 6, 5],
  'live coverage is separated by platform'
);

assert.match(background, /2026-10-02\.7-safe-session-recovery/);
assert.match(content, /2026-10-02\.7-safe-session-recovery/);
assert.match(popupHtml, /Ready_Ai 0\.3\.16/);
assert.match(popupHtml, /popup\.js\?v=0\.3\.16/);
assert.match(popupHtml, /id="verification-card"/);
assert.match(popupHtml, /data-open-sheet="verification-sheet"/);
assert.match(popupHtml, /id="verification-sheet"/);
assert.match(popupHtml, /id="verification-group-list"/);
assert.match(popupHtml, /id="verification-manual-list"/);
assert.match(popupHtml, /id="verification-platform-tabs"[^>]*role="tablist"/);
assert.match(popupHtml, /id="verification-group-heading"/);
assert.match(popupHtml, /id="verification-manual-heading"/);
assert.match(popupHtml, /role="progressbar"[^>]*aria-valuenow="100"/);
assert.match(popupHtml, /\.verification-card\s*\{/);
assert.match(popupHtml, /\.verification-group-row,/);
assert.match(popupHtml, /\.verification-platform-section\s*\{/);
assert.match(popupHtml, /\.verification-category\s*\{/);
assert.match(popupHtml, /\.verification-category-summary\s*\{/);
assert.match(popupHtml, /\.verification-row-copy \.verification-pass-version\s*\{/);
assert.match(popupHtml, /\.verification-platform-tabs\s*\{/);
assert.match(popupJs, /void loadVerificationCenter\(\)/);
assert.match(popupJs, /chrome\.runtime\?\.getURL/);
assert.match(popupJs, /document\.createElement\('details'\)/);
assert.match(popupJs, /통과 앱 버전 ·/);
assert.match(popupJs, /function activateVerificationPlatform\(/);
assert.match(popupJs, /function renderVerificationPlatformTabs\(/);
assert.match(popupJs, /section\.hidden = section\.dataset\.platform !== platform\.id/);
assert.match(runner, /--quick/);
assert.match(runner, /--full/);
assert.match(runner, /--platform=gpt/);
assert.match(runner, /--platform=gemini/);
assert.match(runner, /--platform=ais/);
assert.match(runner, /--category=input/);
assert.match(runner, /--rounds=\\d\+/);
assert.match(runner, /--list/);
assert.match(runner, /통과 앱/);

const ids = Array.from(popupHtml.matchAll(/\sid="([^"]+)"/g), (match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual(duplicateIds, [], 'popup element ids remain unique');
const idSet = new Set(ids);
const sheetTargets = Array.from(popupHtml.matchAll(/data-open-sheet="([^"]+)"/g), (match) => match[1]);
sheetTargets.forEach((target) => assert.ok(idSet.has(target), `sheet target exists: ${target}`));
const labelledByTargets = Array.from(popupHtml.matchAll(/aria-labelledby="([^"]+)"/g), (match) => match[1]);
labelledByTargets.forEach((target) => assert.ok(idSet.has(target), `aria-labelledby target exists: ${target}`));

const assetPaths = Array.from(popupHtml.matchAll(/(?:src|href)="\.\.\/assets\/([^"]+)"/g), (match) => match[1]);
assetPaths.forEach((assetPath) => {
  assert.ok(fs.existsSync(path.join(root, 'assets', assetPath)), `popup asset exists: ${assetPath}`);
});

const context = {};
vm.createContext(context);
vm.runInContext(
  `${extractFunction(popupJs, 'formatVerificationPlanCount')}\n`
    + `${extractFunction(popupJs, 'getVerificationUiModel')}\n`
    + 'this.getModel = getVerificationUiModel;',
  context
);
const model = context.getModel(suite);
assert.equal(model.automatedPassed, true, 'the UI model reports full automated success');
assert.equal(model.liveWebPassed, false, 'the UI model separates pending live checks');
assert.equal(model.progress, 100, 'all automated groups produce a 100% progress bar');
assert.equal(model.randomizedPlansLabel, '12.5만', 'the randomized plan count stays compact in the popup');
assert.equal(model.passedGroups, 9, 'all group results reach the summary');
assert.equal(model.passedManualChecks, 2, 'only actually completed live checks count in the UI');
assert.equal(model.scheduledManualChecks, 18, 'scheduled live checks stay visible without looking failed');
assert.equal(model.liveWebStatus, 'scheduled', 'the UI can label change-triggered live verification');
assert.equal(model.categories.length, 5, 'the UI exposes all verification categories');
assert.deepEqual(Array.from(model.platforms, (platform) => platform.groups.length), [8, 6, 5], 'the UI groups automated checks by platform');
assert.deepEqual(Array.from(model.platforms, (platform) => platform.manualChecks.length), [9, 6, 5], 'the UI groups live checks by platform');
assert.deepEqual(Array.from(model.platforms, (platform) => platform.groupCategories.length), [5, 4, 3], 'automated categories are grouped within each platform');
assert.deepEqual(Array.from(model.platforms, (platform) => platform.manualCategories.length), [4, 3, 4], 'live categories are grouped within each platform');

const jsFileCount = ['src', 'tools'].reduce((count, directory) => {
  const stack = [path.join(root, directory)];
  let total = count;
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith('.js')) total += 1;
    }
  }
  return total;
}, 0);
assert.equal(suite.automated.javascriptFilesChecked, jsFileCount, 'the displayed JavaScript file count matches the workspace');

new Function(popupJs);
console.log(`Ready_Ai verification center: ${suite.groups.length} automated groups, ${suite.manualChecks.length} live scenarios, UI contract passed`);
