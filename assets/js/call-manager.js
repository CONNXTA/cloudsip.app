import { state } from './state.js';
import { $, formatTime } from './ui.js';
import { getSettings } from './settings-store.js';
import { isRecording, isRecordingSupported, stopRecordingPlayback } from './recording-manager.js';
import { addIncomingLine, answerRingingLine, blindTransferActiveLine, cancelConsultTransfer as cancelManagedConsultTransfer, completeConsultTransfer as completeManagedConsultTransfer, getActiveConsultTransfer, getActiveLine, hangupActiveLine, markLineAnswered, markLineEnded, rejectRingingLine, renderStack, sendActiveDTMF, startConsultTransfer as startManagedConsultTransfer, startManagedCall, tickActiveLineTimer, toggleActiveHold, toggleActiveMute, toggleActiveRecording, updateActiveCallScreen as updateManagedActiveCallScreen, updateLineHold, updateLineMute } from './line-manager.js';


export function startTimers(){
  clearInterval(state.timer);

  state.timer = setInterval(() => {
    tickActiveLineTimer();
    renderStack();

    state.footerSeconds++;
    $('footerTime').textContent = formatTime(state.footerSeconds);
  }, 1000);
}

export function startCall(number = null){
  stopRecordingPlayback();
  startManagedCall(number);
}

export function updateActiveCallScreen(line){
  updateManagedActiveCallScreen(line);
}


export function updateRecordingButton(line) {
  const btn = document.getElementById('recordBtn');
  const label = document.getElementById('recordBtnLabel');
  if (!btn) return;

  const recordingSupported = isRecordingSupported();
  const recording = Boolean(line && isRecording(line.id));
  btn.classList.toggle('active', recording);
  btn.disabled = !recordingSupported;
  btn.title = recordingSupported ? 'Record call' : 'Recording not supported in this browser';
  if (label) label.textContent = recording ? 'Recording' : 'Record';
}

async function handleRecordButtonClick() {
  const line = getActiveLine();
  if (!line || !isRecordingSupported()) return;
  await toggleActiveRecording();
  updateRecordingButton(line);
}

export function toggleDtmfPanel() {
  const panel = document.getElementById('dtmfPanel');
  const btn = document.getElementById('toggleDtmfBtn');

  if (!panel || !btn) return;

  if (!panel.classList.contains('show')) hideTransferPanel();

  panel.classList.toggle('show');
  btn.classList.toggle('active', panel.classList.contains('show'));
}

function hideDtmfPanel() {
  document.getElementById('dtmfPanel')?.classList.remove('show');
  document.getElementById('toggleDtmfBtn')?.classList.remove('active');
}

function updateConsultTransferControls() {
  const panel = document.getElementById('consultTransferPanel');
  const target = document.getElementById('consultTransferTarget');
  const consult = getActiveConsultTransfer();

  if (!panel) return;

  panel.classList.toggle('show', Boolean(consult));
  panel.setAttribute('aria-hidden', consult ? 'false' : 'true');
  if (target && consult) target.textContent = `Transfer → ${consult.target}`;
}

export function toggleTransferPanel() {
  const panel = document.getElementById('transferPanel');
  const btn = document.getElementById('transferBtn');
  const input = document.getElementById('transferTarget');

  if (!panel || !btn) return;

  if (!panel.classList.contains('show')) hideDtmfPanel();

  panel.classList.toggle('show');
  btn.classList.toggle('active', panel.classList.contains('show'));
  panel.setAttribute('aria-hidden', panel.classList.contains('show') ? 'false' : 'true');

  if (panel.classList.contains('show')) input?.focus();
}

function hideTransferPanel() {
  const panel = document.getElementById('transferPanel');
  panel?.classList.remove('show');
  panel?.setAttribute('aria-hidden', 'true');
  document.getElementById('transferBtn')?.classList.remove('active');
}

function getTransferTarget() {
  const input = document.getElementById('transferTarget');
  const target = input?.value.trim() || '';

  if (!target) input?.focus();
  return target;
}

function confirmBlindTransfer() {
  const target = getTransferTarget();
  if (!target) return;

  if (blindTransferActiveLine(target)) hideTransferPanel();
}

function confirmConsultTransfer() {
  const target = getTransferTarget();
  if (!target) return;

  if (startManagedConsultTransfer(target)) {
    hideTransferPanel();
    updateConsultTransferControls();
  }
}

async function completeConsultTransfer() {
  if (await completeManagedConsultTransfer()) updateConsultTransferControls();
}

function cancelConsultTransfer() {
  if (cancelManagedConsultTransfer()) updateConsultTransferControls();
}

export function toggleMuteCall(){
  return toggleActiveMute();
}

export const toggleMute = toggleMuteCall;

export function toggleHoldCall(){
  return toggleActiveHold();
}

export const toggleHold = toggleHoldCall;

export async function toggleRecording(){
  const line = getActiveLine();
  if (!line) return null;
  const recording = await toggleActiveRecording();
  updateRecordingButton(line);
  return recording;
}

export function hangupActiveCall(){
  hideDtmfPanel();
  hideTransferPanel();
  updateConsultTransferControls();
  hangupActiveLine();
}

export function handleIncomingCall(caller, session){
  const line = addIncomingLine(caller, session);
  if (getSettings().autoAnswer && line?.state === 'ringing') {
    answerRingingLine(line.id);
  }
}

export function answerIncomingCall(){
  answerRingingLine();
}

export function rejectIncomingCall(){
  rejectRingingLine();
}

export function handleCallAccepted(_event, session){
  const line = state.lines.find((item) => item.session === session);
  if (line) markLineAnswered(line.id);
}

export function handleCallEnded(_event, session){
  const line = state.lines.find((item) => item.session === session);
  if (line) markLineEnded(line.id, 'ended');
}

export function handleCallFailed(event, session){
  const line = state.lines.find((item) => item.session === session);
  if (!line) return;

  const cause = String(event?.cause || '').toLowerCase();
  const endState = cause.includes('busy')
    ? 'busy'
    : line.direction === 'inbound' && line.state === 'ringing'
      ? 'missed'
      : 'failed';

  const failureDetails = {
    sipCode: event?.response?.status_code ?? event?.response?.statusCode ?? null,
    sipReason: event?.response?.reason_phrase || event?.response?.reasonPhrase || null,
    failureCause: event?.cause || null
  };

  markLineEnded(line.id, endState, failureDetails);
}

export function handleCallMuted(event, session){
  updateLineMute(session, !event || event.audio);
}

export function handleCallUnmuted(event, session){
  if (!event || event.audio) updateLineMute(session, false);
}

export function handleCallHold(_event, session){
  updateLineHold(session, true);
}

export function handleCallUnhold(_event, session){
  updateLineHold(session, false);
}

document.getElementById('toggleDtmfBtn')?.addEventListener('click', toggleDtmfPanel);

document.querySelectorAll('[data-dtmf]').forEach(btn => {
  btn.addEventListener('click', () => {
    sendActiveDTMF(btn.dataset.dtmf);
  });
});

document.getElementById('transferBtn')?.addEventListener('click', toggleTransferPanel);
document.getElementById('cancelTransfer')?.addEventListener('click', hideTransferPanel);
document.getElementById('blindTransfer')?.addEventListener('click', confirmBlindTransfer);
document.getElementById('consultTransfer')?.addEventListener('click', confirmConsultTransfer);
document.getElementById('completeTransfer')?.addEventListener('click', completeConsultTransfer);
document.getElementById('cancelConsultTransfer')?.addEventListener('click', cancelConsultTransfer);
document.getElementById('transferTarget')?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    confirmBlindTransfer();
  }
});

document.getElementById('recordBtn')?.addEventListener('click', handleRecordButtonClick);
window.addEventListener('browser:capabilities', () => updateRecordingButton(getActiveLine()));
document.addEventListener('activecall:updated', (event) => {
  updateRecordingButton(event.detail?.line);
  updateConsultTransferControls();
});
window.addEventListener('recording:ready', (event) => {
  const line = getActiveLine();
  if (event.detail?.recording?.lineId === line?.id) updateRecordingButton(line);
});
window.addEventListener('recording:state', (event) => {
  const line = getActiveLine();
  if (event.detail?.lineId === line?.id) updateRecordingButton(line);
});
