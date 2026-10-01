// Explicit UI-driven local test harness; never load it in the extension package.
if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Local test only');
window.chrome = { runtime: { onMessage: { addListener() {} } } };
const testTab = 900001;
const otherTab = 9000010;
const owner = (id = testTab, frameId = 0) => ({ tab: { id }, frameId });
const message = (action, scope = 'conversation:a', fields = {}) => ({ action, platform: 'chatgpt', scope, ...fields });
const store = (action, scope, fields = {}, sender = owner()) => handleReadyAiSessionStorage(message(action, scope, fields), sender);
const state = (savedAt, draft, files = []) => ({ savedAt, draft, queue: [{ id: 1, text: '한글 후속 · 40분', files }], attachments: [] });
function check(value, reason) { if (!value) throw new Error(reason); }
async function rejects(operation, reason) {
  let rejected = false;
  try { await operation(); } catch (_) { rejected = true; }
  check(rejected, reason);
}
const cases = [
  ['대기 목록·한글 작성 내용 왕복 저장', async () => {
    await store('steering_session_save', undefined, { state: state(100, '작성 중 🦝') });
    const loaded = await store('steering_session_load');
    check(loaded.state.draft === '작성 중 🦝' && loaded.state.queue[0].text === '한글 후속 · 40분', 'queue/draft round trip');
  }],
  ['대화·사이트·탭별 저장 분리', async () => {
    await store('steering_session_save', 'conversation:b', { state: state(101, 'B') });
    await store('steering_session_save', undefined, { platform: 'gemini', state: state(101, 'Gemini') });
    await store('steering_session_save', undefined, { state: state(101, 'Other tab') }, owner(otherTab));
    check((await store('steering_session_load')).state.draft === '작성 중 🦝', 'A survives');
    check((await store('steering_session_load', 'conversation:b')).state.draft === 'B', 'B isolated');
    check((await store('steering_session_load', undefined, { platform: 'gemini' })).state.draft === 'Gemini', 'platform isolated');
    check((await store('steering_session_load', undefined, {}, owner(otherTab))).state.draft === 'Other tab', 'tab isolated');
  }],
  ['첨부 청크 저장·조회와 보존', async () => {
    const data = btoa('file bytes 0123456789'.repeat(50000));
    await store('steering_session_file_put', undefined, { fileId: 'file-1', chunkIndex: 0, data });
    await store('steering_session_save', undefined, { state: state(Date.now() + 10, 'with file', [{ fileId: 'file-1' }]) });
    check((await store('steering_session_file_get', undefined, { fileId: 'file-1', chunkIndex: 0 })).data === data, 'file bytes preserved');
  }],
  ['늦은 과거 저장이 최신 목록을 덮어쓰지 않음', async () => {
    const stale = await store('steering_session_save', undefined, { state: state(50, 'stale') });
    check(stale.stale === true, 'stale acknowledged');
    check((await store('steering_session_load')).state.draft === 'with file', 'newer snapshot survives');
    check((await store('steering_session_file_get', undefined, { fileId: 'file-1', chunkIndex: 0 })).ok, 'stale cleanup cannot delete retained file');
  }],
  ['작성 첨부 보존 및 사용하지 않는 청크 정리', async () => {
    const savedAt = Date.now() + 100;
    const snapshot = state(savedAt, 'attachment retained');
    snapshot.queue = [];
    snapshot.attachments = [{ fileId: 'file-1' }];
    await store('steering_session_save', undefined, { state: snapshot });
    check((await store('steering_session_file_get', undefined, { fileId: 'file-1', chunkIndex: 0 })).ok, 'draft attachment retained');
    await store('steering_session_save', undefined, { state: state(savedAt + 1, 'no file') });
    check(!(await store('steering_session_file_get', undefined, { fileId: 'file-1', chunkIndex: 0 })).ok, 'unused chunk removed');
  }],
  ['잘못된 프레임·탭·청크·과대 데이터 거절', async () => {
    await rejects(() => store('steering_session_load', undefined, {}, owner(testTab, 1)), 'iframe rejected');
    await rejects(() => store('steering_session_load', undefined, {}, { frameId: 0 }), 'missing tab rejected');
    await rejects(() => store('steering_session_file_put', undefined, { fileId: '../bad', chunkIndex: 0, data: '' }), 'invalid file ID rejected');
    await rejects(() => store('steering_session_file_get', undefined, { fileId: 'valid', chunkIndex: -1 }), 'negative chunk rejected');
    await rejects(() => store('steering_session_file_put', undefined, { fileId: 'valid', chunkIndex: 0, data: 'a'.repeat(1500001) }), 'oversized data rejected');
  }],
  ['동시 저장 순서가 바뀌어도 최신 작성 내용 유지', async () => {
    await Promise.all([1010, 1012, 1011, 1009].map((savedAt) => store('steering_session_save', 'conversation:race', { state: state(savedAt, String(savedAt)) })));
    check((await store('steering_session_load', 'conversation:race')).state.draft === '1012', 'latest timestamp wins');
  }],
  ['탭 닫기: 모든 대화·청크 삭제, 다른 탭 보존', async () => {
    await store('steering_session_file_put', 'conversation:b', { fileId: 'close-file', chunkIndex: 0, data: btoa('close') });
    await removeReadyAiTabSessions(testTab);
    for (const scope of ['conversation:a', 'conversation:b', 'conversation:race']) check((await store('steering_session_load', scope)).state === null, 'closed scope removed');
    check((await store('steering_session_load', undefined, { platform: 'gemini' })).state === null, 'closed platform removed');
    check(!(await store('steering_session_file_get', 'conversation:b', { fileId: 'close-file', chunkIndex: 0 })).ok, 'closed chunk removed');
    check((await store('steering_session_load', undefined, {}, owner(otherTab))).state.draft === 'Other tab', 'tab ID prefix collision does not remove another tab');
  }],
];
document.getElementById('run').addEventListener('click', async () => {
  const button = document.getElementById('run');
  const summary = document.getElementById('summary');
  const list = document.getElementById('results');
  button.disabled = true;
  list.replaceChildren();
  document.getElementById('error').textContent = '';
  let passed = 0;
  try {
    await removeReadyAiTabSessions(testTab);
    await removeReadyAiTabSessions(otherTab);
    for (const [name, run] of cases) {
      summary.textContent = `검증 중 ${passed + 1}/${cases.length}`;
      const row = document.createElement('li');
      try { await run(); row.textContent = `통과 · ${name}`; row.className = 'passed'; passed += 1; }
      catch (error) { row.textContent = `실패 · ${name}`; row.className = 'failed'; list.append(row); throw error; }
      list.append(row);
    }
    summary.textContent = `전체 통과 · ${passed}/${cases.length}`;
  } catch (error) {
    summary.textContent = `실패 · ${passed}/${cases.length} 통과`;
    document.getElementById('error').textContent = error.stack;
  } finally {
    await removeReadyAiTabSessions(testTab);
    await removeReadyAiTabSessions(otherTab);
    button.disabled = false;
  }
});
