const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const suitePath = path.join(root, 'src', 'verification-suite.json');
const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
const args = process.argv.slice(2);
const platformOption = args.find((value) => /^--platform=[a-z0-9_-]+$/i.test(value));
const platformSelector = platformOption ? platformOption.split('=')[1].toLowerCase() : '';
const categoryOption = args.find((value) => /^--category=[a-z0-9_-]+$/i.test(value));
const categorySelector = categoryOption ? categoryOption.split('=')[1].toLowerCase() : '';
const selectedPlatform = platformSelector
  ? (suite.platforms || []).find((platform) => (
      String(platform.id || '').toLowerCase() === platformSelector
      || String(platform.runnerArg || '').toLowerCase() === platformSelector
    ))
  : null;
const selectedCategory = categorySelector
  ? (suite.categories || []).find((category) => String(category.id || '').toLowerCase() === categorySelector)
  : null;

if (platformSelector && !selectedPlatform) {
  console.error(`알 수 없는 플랫폼: ${platformSelector} · gpt, gemini, ais 중 하나를 사용하세요.`);
  process.exit(1);
}
if (categorySelector && !selectedCategory) {
  console.error(`알 수 없는 카테고리: ${categorySelector} · input, generation, queue, recovery, ui 중 하나를 사용하세요.`);
  process.exit(1);
}

const selectedGroups = suite.groups.filter((group) => (
  (!selectedPlatform || (Array.isArray(group.platforms) && group.platforms.includes(selectedPlatform.id)))
  && (!selectedCategory || group.category === selectedCategory.id)
));

function readRounds() {
  if (args.includes('--quick')) return 1;
  if (args.includes('--full')) {
    return Math.max(1, Number(suite?.cadencePolicy?.criticalRepeatRounds) || 5);
  }
  const explicit = args.find((value) => /^--rounds=\d+$/.test(value));
  if (!explicit) return Math.max(1, Number(suite?.automated?.repeatRounds) || 1);
  return Math.max(1, Math.min(20, Number(explicit.split('=')[1]) || 1));
}

function printList() {
  console.log(`Ready_Ai 검증팩 V${suite.suiteVersion} · 앱 ${suite.appVersion}`);
  console.log('실행 단계: --quick 일상 변경 1회 · --full 핵심 로직 5회');
  console.log('플랫폼 선택: --platform=gpt · --platform=gemini · --platform=ais');
  console.log('카테고리 선택: --category=input · generation · queue · recovery · ui');
  const listedPlatforms = selectedPlatform ? [selectedPlatform] : suite.platforms;
  listedPlatforms.forEach((platform) => {
    const platformGroups = suite.groups.filter((group) => Array.isArray(group.platforms) && group.platforms.includes(platform.id));
    const platformManualChecks = suite.manualChecks.filter((check) => check.platform === platform.id);
    const listedCategories = selectedCategory ? [selectedCategory] : suite.categories;
    console.log(`[${platform.label}] 자동 ${platformGroups.length}개 · 실웹 ${platformManualChecks.length}개`);
    listedCategories.forEach((category) => {
      const groups = platformGroups.filter((group) => group.category === category.id);
      const manualChecks = platformManualChecks.filter((check) => check.category === category.id);
      if (!groups.length && !manualChecks.length) return;
      console.log(`  ${category.label} · 자동 ${groups.length}개 · 실웹 ${manualChecks.length}개`);
      groups.forEach((group) => {
        console.log(`    자동 ${group.id} · 항목 V${group.version} · 통과 앱 ${group.passedInAppVersion || '기록 없음'} · ${group.name} · ${group.script}`);
      });
      manualChecks.forEach((check) => {
        const passedVersion = check.status === 'passed' ? (check.passedInAppVersion || '기록 없음') : '아직 없음';
        console.log(`    실웹 ${check.id} · 통과 앱 ${passedVersion} · ${check.name}`);
      });
    });
  });
}

if (args.includes('--list')) {
  printList();
  process.exit(0);
}

if (!selectedGroups.length) {
  console.error(`실행할 자동 검증이 없습니다: ${selectedPlatform?.label || '전체'} · ${selectedCategory?.label || '전체 카테고리'}`);
  process.exit(1);
}

const rounds = readRounds();
const startedAt = Date.now();
for (let round = 1; round <= rounds; round += 1) {
  for (const group of selectedGroups) {
    const scriptPath = path.join(root, group.script);
    if (!fs.existsSync(scriptPath)) {
      console.error(`누락: ${group.id} ${group.script}`);
      process.exit(1);
    }
    const nodeArgs = Array.isArray(group.nodeArgs) ? group.nodeArgs : [];
    const result = spawnSync(process.execPath, [...nodeArgs, scriptPath], {
      cwd: root,
      encoding: 'utf8',
      timeout: 120000,
    });
    if (result.status !== 0) {
      console.error(`실패: ${group.id} V${group.version} · ${group.name} · ${round}/${rounds}회`);
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      process.exit(result.status || 1);
    }
  }
  console.log(`검증 ${round}/${rounds}회 통과 · ${selectedPlatform?.label || '전체'} · ${selectedCategory?.label || '전체 카테고리'} ${selectedGroups.length}개 묶음`);
}

console.log(JSON.stringify({
  ok: true,
  suiteVersion: suite.suiteVersion,
  appVersion: suite.appVersion,
  platform: selectedPlatform?.id || 'all',
  category: selectedCategory?.id || 'all',
  groups: selectedGroups.length,
  rounds,
  automatedRuns: selectedGroups.length * rounds,
  liveWebStatus: suite.liveWeb.status,
  elapsedMs: Date.now() - startedAt,
}));
