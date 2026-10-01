const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const background = fs.readFileSync(path.join(root, 'src', 'background.js'), 'utf8');
const contentPart01 = fs.readFileSync(path.join(root, 'src', 'content', 'part-01.js'), 'utf8');
const contentPart02 = fs.readFileSync(path.join(root, 'src', 'content', 'part-02.js'), 'utf8');
const contentPart03 = fs.readFileSync(path.join(root, 'src', 'content', 'part-03.js'), 'utf8');
const contentPart12 = fs.readFileSync(path.join(root, 'src', 'content', 'part-12.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'src', 'popup.html'), 'utf8');

function extractSimpleFunction(source, name) {
  const pattern = new RegExp(`function ${name}\\([^]*?\\n\\}`);
  const match = source.match(pattern);
  assert.ok(match, `${name} production function was not found`);
  return match[0];
}

const context = {};
vm.createContext(context);
vm.runInContext(
  'const SYSTEM_RESUME_ALARM_OVERDUE_MS = 20000;\n'
    + 'const POLLING_RESUME_GRACE_MS = 10000;\n'
    + `${extractSimpleFunction(background, 'isSystemResumeAlarmOverdue')}\n`
    + `${extractSimpleFunction(contentPart01, 'isReadyAiPollingResumeGap')}\n`
    + 'this.isAlarmOverdue = isSystemResumeAlarmOverdue;\n'
    + 'this.isPollingResumeGap = isReadyAiPollingResumeGap;',
  context
);

assert.equal(context.isAlarmOverdue({ scheduledTime: 100000 }, 119999), false, 'minor alarm jitter is ignored');
assert.equal(context.isAlarmOverdue({ scheduledTime: 100000 }, 120000), true, 'an overdue alarm detects system resume');
assert.equal(context.isAlarmOverdue({}, 120000), false, 'missing alarm timestamps are ignored');

assert.equal(context.isPollingResumeGap(1000, 15999, 5000), false, 'normal foreground polling is not a resume');
assert.equal(context.isPollingResumeGap(1000, 16000, 5000), true, 'foreground timer drift detects resume');
assert.equal(context.isPollingResumeGap(1000, 61999, 60000), false, 'normal hidden polling is not a resume');
assert.equal(context.isPollingResumeGap(1000, 71000, 60000), true, 'hidden timer drift detects resume');

assert.match(background, /chrome\.idle\.onStateChanged\.addListener/);
assert.match(background, /recoverPrimaryAiTabsAfterWake\('idle_active'\)/);
assert.match(background, /alarm\.name === SYSTEM_RESUME_ALARM && isSystemResumeAlarmOverdue\(alarm\)/);
assert.match(background, /const tabs = await pTabsQuery\(\{\}\)/);
assert.match(background, /message\.action === 'system_resume_detected'/);
assert.match(contentPart01, /handleReadyAiSystemResume\('content_timer_gap'\)/);
assert.match(contentPart03, /for \(const delay of \[250, 1000, 3000\]\)/);
assert.match(contentPart12, /handleReadyAiSystemResume\('network_online'\)/);

const expectedBuild = '2026-10-02.7-safe-session-recovery';
assert.match(background, new RegExp(expectedBuild));
assert.match(contentPart02, new RegExp(expectedBuild));
assert.match(popup, /Ready_Ai 0\.3\.16/);

console.log('Ready_Ai sleep resume recovery: alarm, timer drift, wake hooks, and version checks passed');
