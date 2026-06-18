import { state } from './state.js';
import { showError, showInfo, showSuccess, showWarning } from './toast.js';
import { $, closeSheet, formatTime, openSheet, showView, updateNumberDisplay } from './ui.js';
import { getSettings } from './settings-store.js';
import { answerSession, attachRemoteAudio, blindTransferSession, createOutgoingSession, hangupSession, holdSession, isSipRegistered, muteSession, sendDTMF, unholdSession, unmuteSession } from './sip-client.js';
import { attachRecordingToLine, attachSipCallId, createCallLog, markCallLogAnswered, markCallLogEnded, recordDtmfForLine, recordTransferForLine } from './call-log-store.js';
import { playRingback, playRingtone, stopAllSounds, stopRingback, stopRingtone } from './sound-manager.js';
import { getUserPresence, setPresenceActiveCall, updatePresenceDisplay } from './presence.js';
import { isRecording, isRecordingSupported, startRecording, stopRecording, toggleRecording } from './recording-manager.js';
import { startAudioMeters, stopAudioMeters } from './audio-meter.js';

let nextLineId = 1;

function cleanNumber(number){
  return String(number || '').trim().replace(/\s+/g, '');
}

function lineDisplayName(number, fallback = 'Unknown caller'){
  const normalized = cleanNumber(number);
  const contact = state.contacts.find(([, , contactNumber]) => cleanNumber(contactNumber) === normalized);
  return contact?.[1] || normalized || fallback;
}

const TERMINAL_LINE_RETENTION_MS = 5000;

function getSessionKey(session){
  return session?.id
    || session?.request?.call_id
    || session?._request?.call_id
    || session?.dialog?.id?.call_id
    || null;
}

function sessionsMatch(left, right){
  if (!left || !right) return false;
  if (left === right) return true;
  const leftKey = getSessionKey(left);
  const rightKey = getSessionKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

function makeLine({ session, number, direction, state: lineState }){
  const normalizedState = lineState || 'calling';

  return {
    id: nextLineId++,
    session: session || null,
    number: cleanNumber(number),
    state: normalizedState,
    muted: false,
    onHold: normalizedState === 'hold',
    startedAt: Date.now(),
    answeredAt: normalizedState === 'active' ? Date.now() : null,
    displayName: lineDisplayName(number, direction === 'inbound' ? 'Incoming call' : 'Outbound call'),
    direction,
    endedAt: null,
    callLogId: null,
    transfer: null
  };
}

function getLineBySession(session){
  return state.lines.find((line) => sessionsMatch(line.session, session));
}

function isTerminalLine(line){
  return ['ended', 'failed', 'busy', 'transferred'].includes(line?.state);
}

function liveLines(){
  return state.lines.filter((line) => !isTerminalLine(line));
}

function removeOldTerminalLines(now = Date.now()){
  const before = state.lines.length;
  state.lines = state.lines.filter((line) => !isTerminalLine(line) || !line.endedAt || now - line.endedAt < TERMINAL_LINE_RETENTION_MS);
  if (state.lines.length !== before) {
    console.log("Remaining lines", state.lines);
  }
}

function scheduleTerminalLineCleanup(){
  window.setTimeout(() => {
    removeOldTerminalLines();
    renderStack();
    updateActiveCallMini();
  }, TERMINAL_LINE_RETENTION_MS);
}

function findNextLiveLine(excludedLineId = null){
  return state.lines.find((item) => item.id !== excludedLineId && ['hold', 'active'].includes(item.state)) || null;
}

export function getActiveLine(){
  return state.lines.find((line) => line.id === state.activeLineId) || null;
}

export function getLineById(lineId){
  return state.lines.find((line) => line.id === Number(lineId)) || null;
}

export function setActiveLine(lineId){
  const line = getLineById(lineId);
  if (!line || isTerminalLine(line)) return false;
  state.activeLineId = line.id;
  console.log("Active line is now", state.activeLineId);
  return true;
}

export function getActiveSession(){
  return getActiveLine()?.session || null;
}

function syncPresenceFromLines(){
  const active = liveLines().some((line) => ['active', 'calling', 'hold'].includes(line.state));
  setPresenceActiveCall(active);
}

function setFooterForLine(_line){
  syncPresenceFromLines();
  updatePresenceDisplay();
}

export function updateActiveCallScreen(line = getActiveLine(), options = {}){
  const shouldShowCall = options.showCall !== false;
  const activeLine = line || null;
  state.callActive = activeLine?.state === 'active';
  state.activeNumber = activeLine?.number || null;

  if (!activeLine) {
    $('activeTimer').textContent = '00:00';
    setFooterForLine(null);
    updateActiveCallMini();
    document.dispatchEvent(new CustomEvent('activecall:updated', { detail: { line: null } }));
    if (shouldShowCall) showView('dial');
    return;
  }

  $('activeNumber').textContent = activeLine.number;
  const base = activeLine.answeredAt || activeLine.startedAt;
  state.activeSeconds = Math.max(0, Math.floor((Date.now() - base) / 1000));
  $('activeTimer').textContent = formatTime(state.activeSeconds);
  $('muteBtn')?.classList.toggle('active', activeLine.muted);
  $('holdBtn')?.classList.toggle('active', activeLine.onHold || activeLine.state === 'hold');
  setFooterForLine(activeLine);
  if (shouldShowCall) showView('call');
  updateActiveCallMini();
  document.dispatchEvent(new CustomEvent('activecall:updated', { detail: { line: activeLine } }));
}

export function syncActiveCallScreen(){
  updateActiveCallScreen(getActiveLine());
}

function firstLiveLine(){
  return liveLines()[0] || null;
}

function miniReturnLine(){
  return getActiveLine() || firstLiveLine();
}

export function updateActiveCallMini(){
  const mini = $('activeCallMini');
  if (!mini) return;

  const line = miniReturnLine();
  const isCallView = document.getElementById('view-call')?.classList.contains('active');
  mini.classList.toggle('show', Boolean(line) && !isCallView);

  if (!line) return;

  const base = line.answeredAt || line.startedAt;
  const seconds = Math.max(0, Math.floor((Date.now() - base) / 1000));
  $('miniActiveNumber').textContent = line.displayName || line.number || 'Active call';
  $('miniActiveTimer').textContent = `${formatTime(seconds)} · tap to return`;
}

export function returnToActiveCall(){
  const line = miniReturnLine();
  if (!line) return false;

  return switchToLine(line.id);
}

export function tickActiveLineTimer(){
  const activeLine = getActiveLine();
  if (!activeLine || !['active', 'calling'].includes(activeLine.state)) return;
  const base = activeLine.answeredAt || activeLine.startedAt;
  state.activeSeconds = Math.max(0, Math.floor((Date.now() - base) / 1000));
  $('activeTimer').textContent = formatTime(state.activeSeconds);
  updateActiveCallMini();
}

export function renderStack(){
  const lines = liveLines();
  $('stackBtn')?.setAttribute('data-count', String(lines.length));
  $('stackLines').innerHTML = lines.length ? lines.map(line => {
    const seconds = Math.max(0, Math.floor((Date.now() - (line.answeredAt || line.startedAt)) / 1000));
    const badge = line.state === 'hold' ? 'HOLD' : line.state === 'ringing' ? 'RINGING' : line.state === 'calling' ? 'CALLING' : 'ACTIVE';
    const icon = line.state === 'hold' ? 'ti-player-pause' : line.state === 'ringing' ? 'ti-bell-ringing' : 'ti-phone-call';
    return `
      <button class="call-line ${line.state}" data-line-id="${line.id}" type="button">
        <span class="line-icon"><i class="ti ${icon}" aria-hidden="true"></i></span>
        <span><strong>${line.displayName}</strong><span>${line.number} · ${formatTime(seconds)}</span></span>
        <span class="state">${badge}</span>
      </button>
    `;
  }).join('') : '<div class="small-pill">No active lines</div>';

  syncPresenceFromLines();

  document.querySelectorAll('[data-line-id]').forEach(btn => {
    btn.addEventListener('click', () => switchToLine(Number(btn.dataset.lineId)));
  });
  updateActiveCallMini();
}

function holdLine(line){
  if (!line || line.state !== 'active') return false;
  holdSession(line.session);
  line.state = 'hold';
  line.onHold = true;
  return true;
}

function shouldShowAudioMeters(line){
  return Boolean(line?.session && line.answeredAt && ['active', 'hold'].includes(line.state));
}

function restartAudioMetersForLine(line){
  stopAudioMeters();
  if (shouldShowAudioMeters(line)) startAudioMeters(line.session);
}

function attachLineAudio(line){
  const remoteAudio = attachRemoteAudio(line?.session);
  if (line) console.log("Audio switched to line", line.id, line.number);
  restartAudioMetersForLine(line);
  return remoteAudio;
}

function activateLine(line, options = {}){
  if (!line) return;
  const shouldAutoRecord = options.autoRecord !== false;
  line.state = 'active';
  line.onHold = false;
  line.answeredAt ||= Date.now();
  markCallLogAnswered(line.callLogId);
  if (shouldAutoRecord) startLineRecording(line);
  state.activeLineId = line.id;
  console.log("Active line is now", state.activeLineId);
}

export function startManagedCall(number = null){
  const chosen = cleanNumber(number || state.typed || '441632960049');
  removeOldTerminalLines();

  if (!isSipRegistered()) {
    console.error('Cannot start outgoing call: SIP is not registered');
    updatePresenceDisplay();
    renderStack();
    updateActiveCallMini();
    return;
  }

  const current = getActiveLine();
  if (current?.state === 'active') holdLine(current);

  const line = makeLine({ session: null, number: chosen, direction: 'outbound', state: 'calling' });
  state.lines.push(line);
  line.callLogId = createCallLog({ lineId: line.id, remoteNumber: line.number, direction: 'outbound', status: 'calling' }).id;
  state.activeLineId = line.id;
  playRingback();

  const session = createOutgoingSession(chosen, {
    accepted: () => {
      stopRingback();
      markLineAnswered(line.id);
    },
    confirmed: () => {
      stopRingback();
      markLineAnswered(line.id);
    },
    ended: () => {
      stopAllSounds();
      markLineEnded(line.id, 'ended');
    },
    bye: () => {
      stopAllSounds();
      markLineEnded(line.id, 'ended');
    },
    failed: (event) => {
      stopAllSounds();
      markLineEnded(line.id, getFailedStatus(line, event), getFailureDetails(event));
    },
    rejected: (event) => {
      stopAllSounds();
      markLineEnded(line.id, getFailedStatus(line, event), getFailureDetails(event));
    },
    canceled: (event) => {
      stopAllSounds();
      markLineEnded(line.id, getFailedStatus(line, event), getFailureDetails(event));
    }
  });

  if (!session) {
    stopRingback();
    markCallLogEnded(line.callLogId, 'failed', { failureCause: 'SIP not registered or outgoing session unavailable' });
    state.lines = state.lines.filter((item) => item.id !== line.id);
    state.activeLineId = current?.id || null;
    if (current) activateLine(current);
    renderStack();
    syncActiveCallScreen();
    return;
  }

  line.session = session;
  attachLineAudio(line);
  attachSipCallId(line.callLogId, session);
  state.typed = '';
  updateNumberDisplay(state);
  renderStack();
  syncActiveCallScreen();
}

export function addIncomingLine(caller, session){
  removeOldTerminalLines();
  const existingLine = getLineBySession(session);
  if (existingLine) {
    console.warn('Skipping duplicate line for session', session?.id || session);
    return existingLine;
  }

  const line = makeLine({ session, number: caller, direction: 'inbound', state: 'ringing' });
  state.lines.push(line);
  line.callLogId = createCallLog({ lineId: line.id, remoteNumber: line.number, direction: 'inbound', status: 'ringing', session }).id;
  if (getUserPresence() !== 'Offline') {
    playRingtone();
    showIncomingOverlay(line);
  } else {
    showWarning(`Incoming call from ${line.displayName || line.number}`);
  }
  renderStack();
  return line;
}

function showIncomingOverlay(line){
  if (!line) return;
  state.incomingLineId = line.id;
  $('incomingNumber').textContent = line.number;
  $('incomingLine').textContent = `Line ${line.id} waiting`;
  setFooterForLine(line);
  $('incoming').classList.add('show');
}

export function answerRingingLine(lineId = state.incomingLineId){
  const line = state.lines.find((item) => item.id === lineId && item.state === 'ringing');
  if (!line) return false;

  const current = getActiveLine();
  if (getSettings().autoHoldOnSwitch && current?.state === 'active') holdLine(current);
  if (!answerSession(line.session)) return false;

  stopRingtone();
  stopRingback();
  activateLine(line, { autoRecord: false });
  attachLineAudio(line);
  $('incoming').classList.remove('show');
  state.incomingLineId = null;
  renderStack();
  syncActiveCallScreen();
  return true;
}

export function rejectRingingLine(lineId = state.incomingLineId){
  const line = state.lines.find((item) => item.id === lineId && item.state === 'ringing');
  if (!line) return false;
  stopAllSounds();
  hangupSession(line.session);
  markLineEnded(line.id, 'missed');
  return true;
}

export function markLineAnswered(lineId){
  const line = state.lines.find((item) => item.id === lineId);
  if (!line || isTerminalLine(line)) return;

  stopRingtone();
  stopRingback();
  line.answeredAt ||= Date.now();
  if (line.state === 'hold') {
    renderStack();
    return;
  }

  activateLine(line);
  attachLineAudio(line);
  renderStack();
  syncActiveCallScreen();
}



function startLineRecording(line){
  if (!line || !getSettings().autoRecordCalls || !isRecordingSupported()) return null;
  return startRecording(line.id, line.session, line.number);
}

async function stopLineRecording(line){
  if (!line || !isRecording(line.id)) return null;
  const recording = await stopRecording(line.id);
  if (!recording) return null;

  return {
    recordingId: recording.id,
    recordingUrl: recording.blobUrl,
    recordingMimeType: recording.mimeType,
    recordingStartedAt: recording.startedAt,
    recordingEndedAt: recording.endedAt
  };
}

function getCallFailureToastMessage(details = {}){
  const sipCode = details.sipCode;
  const sipReason = details.sipReason;
  const cause = details.failureCause;

  if (Number(sipCode) === 486) return 'User busy';
  if (sipCode && sipReason) return `Call failed: ${sipCode} ${sipReason}`;
  if (sipCode) return `Call failed: ${sipCode}`;
  if (cause) return `Call failed: ${cause}`;
  return 'Call failed';
}

function showCallEndedToast(endState, details = {}){
  if (endState === 'busy' || Number(details.sipCode) === 486) {
    showWarning('User busy');
    return;
  }

  if (endState === 'failed') {
    showError(getCallFailureToastMessage(details));
    return;
  }

  if (endState === 'ended') showInfo('Call ended');
}

function getFailedStatus(line, event){
  const cause = String(event?.cause || '').toLowerCase();
  if (cause.includes('busy')) return 'busy';
  if (line?.direction === 'inbound' && line.state === 'ringing') return 'missed';
  return 'failed';
}

function getFailureDetails(event){
  const response = event?.response || event?.message || null;
  return {
    sipCode: response?.status_code ?? response?.statusCode ?? null,
    sipReason: response?.reason_phrase || response?.reasonPhrase || null,
    failureCause: event?.cause || null
  };
}

export async function markLineEnded(lineId, endState = 'ended', failureDetails = {}){
  const line = state.lines.find((item) => item.id === lineId);
  if (!line) return;

  const alreadyEnded = Boolean(line.endedAt);
  if (!alreadyEnded) showCallEndedToast(endState, failureDetails);

  const wasActive = state.activeLineId === line.id;
  console.log("Cleaning session", line.session?.id || line.session);
  stopAllSounds();
  line.state = endState === 'missed' ? 'ended' : endState;
  line.endedAt ||= Date.now();
  line.timer = null;
  const logStatus = ['failed', 'missed', 'busy', 'transferred'].includes(endState)
    ? endState
    : line.answeredAt
      ? undefined
      : 'failed';
  const recordingDetails = await stopLineRecording(line);
  markCallLogEnded(line.callLogId, logStatus, {
    ...failureDetails,
    ...(recordingDetails || {})
  });
  line.muted = false;
  line.onHold = false;
  if (wasActive) state.activeLineId = null;
  if (state.incomingLineId === line.id) {
    $('incoming').classList.remove('show');
    state.incomingLineId = null;
  }

  if (wasActive) {
    const next = findNextLiveLine(line.id);
    if (next) {
      if (next.state === 'hold') unholdSession(next.session);
      activateLine(next);
      attachLineAudio(next);
    } else {
      attachRemoteAudio(null);
      stopAudioMeters();
      setFooterForLine(null);
      showView('dial');
    }
  }

  console.log("Remaining lines", liveLines());
  scheduleTerminalLineCleanup();
  renderStack();
  syncActiveCallScreen();
}

export function updateLineHold(session, onHold){
  const line = getLineBySession(session);
  if (!line || ['ended', 'failed', 'ringing'].includes(line.state)) return;
  line.onHold = onHold;
  line.state = onHold ? 'hold' : 'active';
  if (!onHold) {
    state.activeLineId = line.id;
    attachLineAudio(line);
  }
  renderStack();
  syncActiveCallScreen();
}

export function updateLineMute(session, muted){
  const line = getLineBySession(session);
  if (!line) return;
  line.muted = muted;
  syncActiveCallScreen();
}

export function switchToLine(lineId){
  const selectedLine = getLineById(lineId);
  console.log("Switching to line", lineId, selectedLine);
  if (!selectedLine || isTerminalLine(selectedLine)) return false;

  if (selectedLine.state === 'ringing') {
    showIncomingOverlay(selectedLine);
    closeSheet();
    updateActiveCallMini();
    return true;
  }

  if (!['active', 'calling', 'hold'].includes(selectedLine.state)) return false;

  const current = getActiveLine();
  const isSelectedActive = current?.id === selectedLine.id && selectedLine.state !== 'hold';

  if (isSelectedActive) {
    showView('call');
    updateActiveCallScreen(selectedLine, { showCall: false });
    attachLineAudio(selectedLine);
    closeSheet();
    return true;
  }

  if (selectedLine.state === 'hold') {
    if (getSettings().autoHoldOnSwitch && current?.state === 'active' && current.id !== selectedLine.id) holdLine(current);
    unholdSession(selectedLine.session);
    activateLine(selectedLine);
    attachLineAudio(selectedLine);
    updateActiveCallScreen(selectedLine, { showCall: false });
    renderStack();
    showView('call');
    closeSheet();
    return true;
  }

  if (getSettings().autoHoldOnSwitch && current?.state === 'active' && current.id !== selectedLine.id) holdLine(current);
  setActiveLine(selectedLine.id);
  attachLineAudio(selectedLine);
  updateActiveCallScreen(selectedLine, { showCall: false });
  renderStack();
  showView('call');
  closeSheet();
  return true;
}

export const switchLine = switchToLine;

export function hangupActiveLine(){
  const line = getActiveLine();
  if (!line) return false;
  hangupSession(line.session);
  return true;
}

export function toggleActiveMute(){
  const line = getActiveLine();
  if (!line) return false;
  const changed = line.muted ? unmuteSession(line.session) : muteSession(line.session);
  if (changed) {
    line.muted = !line.muted;
    syncActiveCallScreen();
  }
  return changed;
}

export function toggleActiveHold(){
  const line = getActiveLine();
  if (!line) return false;
  const changed = line.onHold ? unholdSession(line.session) : holdSession(line.session);
  if (changed) {
    line.onHold = !line.onHold;
    line.state = line.onHold ? 'hold' : 'active';
    syncActiveCallScreen();
    renderStack();
  }
  return changed;
}

export async function toggleActiveRecording(){
  const line = getActiveLine();
  if (!line || !['active', 'hold'].includes(line.state)) return null;
  const recording = await toggleRecording(line.id, line.session, line.number);
  syncActiveCallScreen();
  return recording;
}

export function sendActiveDTMF(tone){
  const sent = sendDTMF(getActiveSession(), tone);
  if (sent) recordDtmfForLine(getActiveLine()?.id, tone);
  return sent;
}

function removeLineFromStack(line){
  if (!line) return;
  state.lines = state.lines.filter((item) => item.id !== line.id);
  if (state.activeLineId === line.id) state.activeLineId = null;
}

export function blindTransferActiveLine(target){
  const line = getActiveLine();
  const transferred = blindTransferSession(line?.session, target);
  if (!transferred || !line) return false;

  line.transfer = { type: 'blind', target: cleanNumber(target), completedAt: Date.now() };
  recordTransferForLine(line.id, { type: 'blind', target });
  hangupSession(line.session);
  markLineEnded(line.id, 'transferred');
  return true;
}

export function startConsultTransfer(target){
  const original = getActiveLine();
  const destination = cleanNumber(target);

  if (!original || !destination) return false;
  if (!isSipRegistered()) {
    showError('SIP Offline');
    return false;
  }

  holdLine(original);
  const consultLine = makeLine({ session: null, number: destination, direction: 'outbound', state: 'calling' });
  consultLine.transfer = { type: 'consult-leg', originalLineId: original.id, target: destination };
  original.transfer = { type: 'consult', target: destination, consultLineId: consultLine.id, startedAt: Date.now() };
  state.lines.push(consultLine);
  consultLine.callLogId = createCallLog({ lineId: consultLine.id, remoteNumber: consultLine.number, direction: 'outbound', status: 'calling' }).id;
  state.activeLineId = consultLine.id;
  playRingback();

  const session = createOutgoingSession(destination, {
    accepted: () => {
      stopRingback();
      markLineAnswered(consultLine.id);
    },
    confirmed: () => {
      stopRingback();
      markLineAnswered(consultLine.id);
    },
    ended: () => {
      stopAllSounds();
      if (original.transfer?.consultLineId === consultLine.id) original.transfer = null;
      markLineEnded(consultLine.id, 'ended');
    },
    bye: () => {
      stopAllSounds();
      if (original.transfer?.consultLineId === consultLine.id) original.transfer = null;
      markLineEnded(consultLine.id, 'ended');
    },
    failed: (event) => {
      stopAllSounds();
      if (original.transfer?.consultLineId === consultLine.id) original.transfer = null;
      markLineEnded(consultLine.id, getFailedStatus(consultLine, event), getFailureDetails(event));
      unholdSession(original.session);
      activateLine(original);
      attachLineAudio(original);
      renderStack();
      syncActiveCallScreen();
    }
  });

  if (!session) {
    stopRingback();
    markCallLogEnded(consultLine.callLogId, 'failed', { failureCause: 'SIP not registered or outgoing session unavailable' });
    removeLineFromStack(consultLine);
    original.transfer = null;
    unholdSession(original.session);
    activateLine(original);
    renderStack();
    syncActiveCallScreen();
    return false;
  }

  consultLine.session = session;
  attachLineAudio(consultLine);
  attachSipCallId(consultLine.callLogId, session);
  renderStack();
  syncActiveCallScreen();
  return true;
}

export function getActiveConsultTransfer(){
  const consultLine = getActiveLine();
  const transfer = consultLine?.transfer;
  if (transfer?.type !== 'consult-leg') return null;
  const originalLine = getLineById(transfer.originalLineId);
  if (!originalLine) return null;
  return { originalLine, consultLine, target: transfer.target };
}

export async function completeConsultTransfer(){
  const consult = getActiveConsultTransfer();
  if (!consult) return false;

  const { originalLine, consultLine, target } = consult;
  const transferred = blindTransferSession(originalLine.session, target);
  if (!transferred) return false;

  originalLine.transfer = { type: 'consult', target, completedAt: Date.now() };
  recordTransferForLine(originalLine.id, { type: 'consult', target });
  hangupSession(originalLine.session);
  hangupSession(consultLine.session);
  await stopLineRecording(originalLine);
  await stopLineRecording(consultLine);
  markCallLogEnded(originalLine.callLogId, 'transferred');
  markCallLogEnded(consultLine.callLogId, 'ended');
  removeLineFromStack(originalLine);
  removeLineFromStack(consultLine);
  attachRemoteAudio(null);
  stopAudioMeters();
  setFooterForLine(null);
  renderStack();
  syncActiveCallScreen();
  showSuccess('Transfer completed');
  return true;
}

export function cancelConsultTransfer(){
  const consult = getActiveConsultTransfer();
  if (!consult) return false;

  const { originalLine, consultLine } = consult;
  originalLine.transfer = null;
  hangupSession(consultLine.session);
  markCallLogEnded(consultLine.callLogId, 'ended');
  removeLineFromStack(consultLine);
  unholdSession(originalLine.session);
  activateLine(originalLine);
  attachLineAudio(originalLine);
  renderStack();
  syncActiveCallScreen();
  showInfo('Consult transfer canceled');
  return true;
}

export function initLineManager(){
  window.addEventListener('recording:ready', (event) => {
    const recording = event.detail?.recording;
    if (recording) attachRecordingToLine(recording.lineId, recording);
  });
  $('stackBtn').addEventListener('click', openSheet);
  $('sheetBackdrop').addEventListener('click', closeSheet);
  $('activeCallMini')?.addEventListener('click', returnToActiveCall);
  $('backToActiveCall')?.addEventListener('click', (event) => {
    event.stopPropagation();
    returnToActiveCall();
  });
  document.addEventListener('viewchange', updateActiveCallMini);
  renderStack();
}
