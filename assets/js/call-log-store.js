const STORAGE_KEY = 'cloudsip_phone_call_logs';

let memoryLogs = [];
let storageAvailable;

function hasLocalStorage(){
  if (storageAvailable !== undefined) return storageAvailable;

  try {
    if (!globalThis.localStorage) {
      storageAvailable = false;
      return storageAvailable;
    }

    const testKey = `${STORAGE_KEY}_test`;
    globalThis.localStorage.setItem(testKey, testKey);
    globalThis.localStorage.removeItem(testKey);
    storageAvailable = true;
  } catch (error) {
    storageAvailable = false;
  }

  return storageAvailable;
}

function safeParseLogs(raw){
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    console.warn('Unable to parse stored call logs', error);
    return [];
  }
}

function readLogs(){
  if (!hasLocalStorage()) return [...memoryLogs];
  return safeParseLogs(globalThis.localStorage.getItem(STORAGE_KEY));
}

function persist(logs){
  const nextLogs = Array.isArray(logs) ? logs.filter(Boolean) : [];

  if (hasLocalStorage()) {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLogs));
    } catch (error) {
      console.warn('Unable to persist call logs to localStorage; using memory fallback', error);
      storageAvailable = false;
      memoryLogs = [...nextLogs];
    }
  } else {
    memoryLogs = [...nextLogs];
  }

  if (typeof globalThis.dispatchEvent === 'function') {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('calllogs:changed')
      : new Event('calllogs:changed');
    globalThis.dispatchEvent(event);
  }
}

function nowIso(){
  return new Date().toISOString();
}

function makeId(){
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getSipCallId(session){
  return session?.id
    || session?.request?.call_id
    || session?._request?.call_id
    || session?.dialog?.id?.call_id
    || null;
}

function calculateDurationSec(log){
  if (!log?.answeredAt || !log?.endedAt) return 0;

  const answeredAt = new Date(log.answeredAt).getTime();
  const endedAt = new Date(log.endedAt).getTime();
  if (Number.isNaN(answeredAt) || Number.isNaN(endedAt)) return 0;

  return Math.max(0, Math.floor((endedAt - answeredAt) / 1000));
}

function normalizeLog(payload = {}){
  const startedAt = payload.startedAt || nowIso();

  return {
    id: payload.id || makeId(),
    lineId: payload.lineId ?? null,
    remoteNumber: String(payload.remoteNumber || 'Unknown caller'),
    direction: payload.direction || 'outbound',
    status: payload.status || 'calling',
    sipCode: payload.sipCode ?? null,
    sipReason: payload.sipReason ?? null,
    failureCause: payload.failureCause ?? null,
    startedAt,
    answeredAt: payload.answeredAt ?? null,
    endedAt: payload.endedAt ?? null,
    durationSec: payload.durationSec ?? 0,
    recordingId: payload.recordingId ?? null,
    recordingUrl: payload.recordingUrl ?? null,
    recordingMimeType: payload.recordingMimeType ?? null,
    recordingStartedAt: payload.recordingStartedAt ?? null,
    recordingEndedAt: payload.recordingEndedAt ?? null,
    transferCount: Number(payload.transferCount || payload.transfers || 0),
    transferType: payload.transferType || null,
    transferEvents: Array.isArray(payload.transferEvents) ? payload.transferEvents.filter(Boolean) : [],
    dtmfDigits: Array.isArray(payload.dtmfDigits)
      ? payload.dtmfDigits.map((digit) => String(digit))
      : typeof payload.dtmfDigits === 'string'
        ? [...payload.dtmfDigits]
        : [],
    sipCallId: payload.sipCallId ?? getSipCallId(payload.session)
  };
}

function newestFirst(logs){
  return [...logs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function createCallLog(payload = {}){
  const logs = readLogs();
  const log = normalizeLog(payload);
  const nextLogs = newestFirst([log, ...logs.filter((item) => item.id !== log.id)]);

  persist(nextLogs);
  return log;
}

export function updateCallLog(id, payload = {}){
  if (!id) return null;

  const logs = readLogs();
  let updated = null;

  const nextLogs = logs.map((log) => {
    if (log.id !== id) return log;

    updated = { ...log, ...payload };
    if ('answeredAt' in payload || 'endedAt' in payload || !('durationSec' in payload)) {
      updated.durationSec = calculateDurationSec(updated);
    }
    return updated;
  });

  if (updated) persist(newestFirst(nextLogs));
  return updated;
}

export function getAllCallLogs(){
  return newestFirst(readLogs());
}

export function getGroupedCallLogs(){
  return getAllCallLogs().reduce((groups, log) => {
    const key = log.remoteNumber || 'Unknown caller';
    groups[key] ||= [];
    groups[key].push(log);
    return groups;
  }, {});
}

export function getCallThread(remoteNumber){
  return getAllCallLogs().filter((log) => log.remoteNumber === remoteNumber);
}

export function clearCallLogs(){
  persist([]);
}

export function attachSipCallId(id, session){
  const sipCallId = getSipCallId(session);
  if (!sipCallId) return null;
  return updateCallLog(id, { sipCallId });
}

export function markCallLogAnswered(id){
  const existing = getAllCallLogs().find((log) => log.id === id);
  return updateCallLog(id, { status: 'answered', answeredAt: existing?.answeredAt || nowIso() });
}

export function markCallLogEnded(id, status, failureDetails = {}){
  const changes = { endedAt: nowIso() };
  if (status) changes.status = status;

  if (failureDetails && Object.keys(failureDetails).length) {
    if ('sipCode' in failureDetails) changes.sipCode = failureDetails.sipCode;
    if ('sipReason' in failureDetails) changes.sipReason = failureDetails.sipReason;
    if ('failureCause' in failureDetails) changes.failureCause = failureDetails.failureCause;
    if ('recordingId' in failureDetails) changes.recordingId = failureDetails.recordingId;
    if ('recordingUrl' in failureDetails) changes.recordingUrl = failureDetails.recordingUrl;
    if ('recordingMimeType' in failureDetails) changes.recordingMimeType = failureDetails.recordingMimeType;
    if ('recordingStartedAt' in failureDetails) changes.recordingStartedAt = failureDetails.recordingStartedAt;
    if ('recordingEndedAt' in failureDetails) changes.recordingEndedAt = failureDetails.recordingEndedAt;
  }

  return updateCallLog(id, changes);
}

export const getCallLogs = getAllCallLogs;
export const groupCallLogsByRemoteNumber = getGroupedCallLogs;


export function recordTransferForLine(lineId, payload = {}){
  const log = getAllCallLogs().find((item) => Number(item.lineId) === Number(lineId));
  if (!log) return null;

  const event = {
    target: String(payload.target || '').trim(),
    type: payload.type || payload.transferType || 'blind',
    createdAt: payload.createdAt || nowIso()
  };

  return updateCallLog(log.id, {
    transferCount: Number(log.transferCount || log.transfers || 0) + 1,
    transferType: event.type,
    transferEvents: [...(Array.isArray(log.transferEvents) ? log.transferEvents : []), event]
  });
}

export function recordDtmfForLine(lineId, tone){
  const log = getAllCallLogs().find((item) => Number(item.lineId) === Number(lineId));
  if (!log) return null;

  const digits = Array.isArray(log.dtmfDigits)
    ? log.dtmfDigits
    : typeof log.dtmfDigits === 'string'
      ? [...log.dtmfDigits]
      : [];

  return updateCallLog(log.id, {
    dtmfDigits: [...digits, String(tone)]
  });
}

export function attachRecordingToLine(lineId, recording){
  if (!recording) return null;
  const log = getAllCallLogs().find((item) => Number(item.lineId) === Number(lineId));
  if (!log) return null;

  return updateCallLog(log.id, {
    recordingId: recording.id,
    recordingUrl: recording.blobUrl,
    recordingMimeType: recording.mimeType,
    recordingStartedAt: recording.startedAt,
    recordingEndedAt: recording.endedAt
  });
}
