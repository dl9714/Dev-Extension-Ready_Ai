// Extension-owned storage: prompts and file chunks never live in the site's storage.
var readyAiSessionDbPromise = null;
function openReadyAiSessionDb() {
  if (readyAiSessionDbPromise) return readyAiSessionDbPromise;
  readyAiSessionDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('ready-ai-followups', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('sessions', { keyPath: 'key' });
      db.createObjectStore('chunks', { keyPath: 'key' }).createIndex('sessionKey', 'sessionKey');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => { readyAiSessionDbPromise = null; throw error; });
  return readyAiSessionDbPromise;
}
async function readyAiSessionTransaction(stores, mode, operation) {
  const db = await openReadyAiSessionDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    let value;
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error('Follow-up storage failed'));
    operation(transaction, (result) => { value = result; });
  });
}
async function handleReadyAiSessionStorage(message, sender) {
  const tabId = sender?.tab?.id;
  const platform = String(message.platform || '');
  const scope = String(message.scope || 'site');
  if (!Number.isInteger(tabId) || sender.frameId !== 0 || !platform || platform.length > 256 || scope.length > 256) {
    throw new Error('Invalid follow-up storage owner');
  }
  const key = `${tabId}:${encodeURIComponent(platform)}:${encodeURIComponent(scope)}`;
  const fileId = String(message.fileId || '');
  const chunkIndex = Number(message.chunkIndex);
  const chunkKey = `${key}:${fileId}:${chunkIndex}`;
  switch (message.action) {
    case 'steering_session_load':
      return readyAiSessionTransaction(['sessions'], 'readonly', (tx, done) => {
        const request = tx.objectStore('sessions').get(key);
        request.onsuccess = () => done({ ok: true, state: request.result?.state || null });
      });
    case 'steering_session_save': {
      const state = message.state;
      if (!state || !Array.isArray(state.queue) || !Number.isFinite(state.savedAt)) throw new Error('Invalid follow-up state');
      return readyAiSessionTransaction(['sessions', 'chunks'], 'readwrite', (tx, done) => {
        const sessions = tx.objectStore('sessions');
        const previous = sessions.get(key);
        previous.onsuccess = () => {
          // A delayed old content instance must never overwrite a newer snapshot.
          if ((previous.result?.state?.savedAt || 0) > state.savedAt) { done({ ok: true, stale: true }); return; }
          sessions.put({ key, state });
          const retained = new Set([...state.queue.flatMap((item) => item.files || []), ...(state.attachments || [])].map((file) => file.fileId));
          const cursor = tx.objectStore('chunks').index('sessionKey').openCursor(IDBKeyRange.only(key));
          cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry) return;
            if (!retained.has(entry.value.fileId) && entry.value.createdAt <= state.savedAt) entry.delete();
            entry.continue();
          };
          done({ ok: true });
        };
      });
    }
    case 'steering_session_file_put':
    case 'steering_session_file_get':
      if (!/^[a-z0-9-]{1,100}$/i.test(fileId) || !Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 100) throw new Error('Invalid file chunk');
      if (message.action === 'steering_session_file_put') {
        if (typeof message.data !== 'string' || message.data.length > 1500000) throw new Error('Invalid file data');
        return readyAiSessionTransaction(['chunks'], 'readwrite', (tx, done) => {
          tx.objectStore('chunks').put({ key: chunkKey, sessionKey: key, fileId, data: message.data, createdAt: Date.now() });
          done({ ok: true });
        });
      }
      return readyAiSessionTransaction(['chunks'], 'readonly', (tx, done) => {
        const request = tx.objectStore('chunks').get(chunkKey);
        request.onsuccess = () => done({ ok: !!request.result, data: request.result?.data });
      });
    default: throw new Error('Unknown follow-up storage operation');
  }
}
async function removeReadyAiTabSessions(tabId) {
  return readyAiSessionTransaction(['sessions', 'chunks'], 'readwrite', (tx) => {
    for (const name of ['sessions', 'chunks']) {
      const request = tx.objectStore(name).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(`${tabId}:`)) cursor.delete();
        cursor.continue();
      };
    }
  });
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!/^steering_session_(?:load|save|file_put|file_get)$/.test(String(message?.action || ''))) return;
  handleReadyAiSessionStorage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, message: error?.message || 'Follow-up storage failed' }));
  return true;
});
