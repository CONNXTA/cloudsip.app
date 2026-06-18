import * as audioDevices from './audio-devices.js';
import { state } from './state.js';
import { getSipDiagnostics, registerSip, unregisterSip } from './sip-client.js';
import { clearLocalData } from './settings-store.js';
import { clearRecordingBlobs } from './recording-db.js';
import { renderLogs } from './call-logs.js';
import { showInfo, showSuccess, showWarning } from './toast.js';
import { getBrowserCapabilities } from './browser-check.js';

const fieldIds = {
  browser: 'diagBrowserName',
  microphonePermission: 'diagMicrophonePermission',
  selectedMicrophone: 'diagSelectedMicrophone',
  selectedSpeaker: 'diagSelectedSpeaker',
  sipRegistration: 'diagSipRegistration',
  websocket: 'diagWebSocketState',
  activeLines: 'diagActiveLineCount',
  activeCallId: 'diagActiveCallId',
  iceConnection: 'diagIceConnectionState',
  rtpAudioTracks: 'diagRtpAudioTracksCount',
  microphoneSupported: 'diagMicrophoneSupported',
  recordingSupported: 'diagRecordingSupported',
  speakerSelectionSupported: 'diagSpeakerSelectionSupported',
  secureContext: 'diagSecureContext',
  webRtcSupported: 'diagWebRtcSupported'
};

function getElement(id){
  return document.getElementById(id);
}

function setValue(id, value){
  const element = getElement(id);
  if (element) element.textContent = value || '—';
}

function getBrowserName(){
  const ua = navigator.userAgent || '';
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return navigator.userAgentData?.brands?.[0]?.brand || 'Unknown browser';
}

async function getMicrophonePermissionState(){
  if (!navigator.permissions?.query) return 'Unavailable';

  try {
    const permission = await navigator.permissions.query({ name: 'microphone' });
    return permission?.state || 'Unavailable';
  } catch (_error) {
    return 'Unavailable';
  }
}

function liveLines(){
  return state.lines.filter((line) => !['ended', 'failed', 'busy', 'transferred'].includes(line?.state));
}

function getActiveLine(){
  return state.lines.find((line) => line.id === state.activeLineId) || null;
}

function getActivePeerConnection(){
  return getActiveLine()?.session?.connection || null;
}

function getActiveCallId(){
  const session = getActiveLine()?.session;
  return session?.id
    || session?.request?.call_id
    || session?._request?.call_id
    || session?.dialog?.id?.call_id
    || '—';
}

function countRtpAudioTracks(peerConnection){
  if (!peerConnection) return 0;

  const receivers = peerConnection.getReceivers?.() || [];
  const senders = peerConnection.getSenders?.() || [];
  return [...receivers, ...senders].filter((item) => item.track?.kind === 'audio').length;
}

function yesNo(value){
  return value ? 'Yes' : 'No';
}

function supported(value){
  return value ? 'Supported' : 'Not supported';
}

function getDeviceLabel(selectId, storedDeviceId){
  const select = getElement(selectId);
  if (!select) return storedDeviceId ? 'Saved device' : 'System default';
  return select.options[select.selectedIndex]?.textContent || (storedDeviceId ? 'Saved device' : 'System default');
}

export async function refreshWebRtcDiagnostics(){
  const selection = audioDevices.getSelectedAudioDevices();
  const sip = getSipDiagnostics();
  const peerConnection = getActivePeerConnection();
  const capabilities = getBrowserCapabilities();

  setValue(fieldIds.microphoneSupported, supported(capabilities.microphoneSupported));
  setValue(fieldIds.recordingSupported, supported(capabilities.recordingSupported));
  setValue(fieldIds.speakerSelectionSupported, supported(capabilities.speakerSelectionSupported));
  setValue(fieldIds.secureContext, yesNo(capabilities.secureContext));
  setValue(fieldIds.webRtcSupported, yesNo(capabilities.webRtcSupported));
  setValue(fieldIds.browser, getBrowserName());
  setValue(fieldIds.microphonePermission, await getMicrophonePermissionState());
  setValue(fieldIds.selectedMicrophone, getDeviceLabel('inputDeviceSelect', selection.inputDeviceId));
  setValue(fieldIds.selectedSpeaker, getDeviceLabel('outputDeviceSelect', selection.outputDeviceId));
  setValue(fieldIds.sipRegistration, sip.registrationState);
  setValue(fieldIds.websocket, sip.websocketState);
  setValue(fieldIds.activeLines, String(liveLines().length));
  setValue(fieldIds.activeCallId, getActiveCallId());
  setValue(fieldIds.iceConnection, peerConnection?.iceConnectionState || '—');
  setValue(fieldIds.rtpAudioTracks, String(countRtpAudioTracks(peerConnection)));
}

async function clearAllLocalData(){
  const confirmed = typeof globalThis.confirm !== 'function'
    || globalThis.confirm('Clear settings, call logs, contacts, audio device choices and local recordings?');
  if (!confirmed) return;

  localStorage.clear();
  clearLocalData();
  try {
    await clearRecordingBlobs();
  } catch (error) {
    console.warn('Unable to clear IndexedDB recordings', error);
    showWarning('Local data cleared, but recordings could not be cleared');
    return;
  }
  renderLogs();
  showSuccess('Local data cleared');
}

function bindButton(id, handler){
  const button = getElement(id);
  if (!button || button.webRtcDiagnosticsBound) return;

  button.webRtcDiagnosticsBound = true;
  button.addEventListener('click', handler);
}

export function initWebRtcDiagnostics(){
  bindButton('diagTestMicrophone', async () => {
    const result = await audioDevices.testMicrophone();
    if (result) showSuccess('Microphone is available');
    await audioDevices.refreshAudioDevices();
    refreshWebRtcDiagnostics();
  });
  bindButton('diagTestSpeaker', () => audioDevices.playTestTone?.('output'));
  bindButton('diagReconnectSip', () => {
    unregisterSip();
    registerSip();
    showInfo('SIP reconnect requested');
    window.setTimeout(refreshWebRtcDiagnostics, 500);
  });
  bindButton('diagClearLocalData', clearAllLocalData);

  ['sip:status', 'activecall:updated'].forEach((eventName) => {
    window.addEventListener(eventName, refreshWebRtcDiagnostics);
    document.addEventListener(eventName, refreshWebRtcDiagnostics);
  });
  window.setInterval(refreshWebRtcDiagnostics, 3000);
  refreshWebRtcDiagnostics();
}
