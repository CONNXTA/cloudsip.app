const DB_NAME = 'cloudsip_phone_db';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

function openRecordingDb(){
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);

    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    });

    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error || new Error('Unable to open recording database')));
    request.addEventListener('blocked', () => reject(new Error('Recording database upgrade is blocked')));
  });
}

function withStore(mode, callback){
  return openRecordingDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;

    transaction.addEventListener('complete', () => {
      db.close();
      resolve(request?.result);
    });
    transaction.addEventListener('error', () => {
      db.close();
      reject(transaction.error || request?.error || new Error('Recording database transaction failed'));
    });
    transaction.addEventListener('abort', () => {
      db.close();
      reject(transaction.error || new Error('Recording database transaction aborted'));
    });

    try {
      request = callback(store);
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  }));
}

export async function saveRecordingBlob(metadata, blob){
  if (!metadata?.id) throw new Error('Recording metadata requires an id');
  if (!(blob instanceof Blob)) throw new Error('Recording blob is required');

  const record = {
    id: metadata.id,
    lineId: metadata.lineId ?? null,
    remoteNumber: metadata.remoteNumber || 'Unknown caller',
    startedAt: metadata.startedAt ?? null,
    endedAt: metadata.endedAt ?? null,
    durationSec: metadata.durationSec ?? 0,
    mimeType: metadata.mimeType || blob.type || 'audio/webm',
    blob
  };

  await withStore('readwrite', (store) => store.put(record));
  return record;
}

export async function getRecordingBlob(recordingId){
  if (!recordingId) return null;
  const record = await withStore('readonly', (store) => store.get(String(recordingId)));
  return record || null;
}

export async function deleteRecordingBlob(recordingId){
  if (!recordingId) return false;
  await withStore('readwrite', (store) => store.delete(String(recordingId)));
  return true;
}

export async function clearRecordingBlobs(){
  await withStore('readwrite', (store) => store.clear());
  return true;
}

export async function listRecordingBlobs(){
  return (await withStore('readonly', (store) => store.getAll())) || [];
}
