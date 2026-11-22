import * as audioDevices from './audio-devices.js';
import { state } from './state.js';
import { getSipDiagnostics, registerSip, unregisterSip } from './sip-client.js';
import { clearLocalData, getSettings } from './settings-store.js';
import { clearRecordingBlobs } from './recording-db.js';
import { renderLogs } from './call-logs.js';
import { showInfo, showSuccess, showWarning } from './toast.js';
import { getBrowserCapabilities } from './browser-check.js';

const fields = {
  browser: 'diagBrowserName', microphonePermission: 'diagMicrophonePermission', selectedMicrophone: 'diagSelectedMicrophone', selectedSpeaker: 'diagSelectedSpeaker',
  sipRegistration: 'diagSipRegistration', websocket: 'diagWebSocketState', activeLines: 'diagActiveLineCount', activeCallId: 'diagActiveCallId',
  iceGathering: 'diagIceGatheringState', iceConnection: 'diagIceConnectionState', localCandidate: 'diagLocalCandidate', remoteCandidate: 'diagRemoteCandidate',
  turnUsage: 'diagTurnUsage', codec: 'diagCodec', jitter: 'diagJitter', packetLoss: 'diagPacketLoss', roundTripTime: 'diagRoundTripTime',
  bitrate: 'diagBitrate', audioLevel: 'diagAudioLevel', rtpAudioTracks: 'diagRtpAudioTracksCount', microphoneSupported: 'diagMicrophoneSupported',
  recordingSupported: 'diagRecordingSupported', speakerSelectionSupported: 'diagSpeakerSelectionSupported', secureContext: 'diagSecureContext',
  webRtcSupported: 'diagWebRtcSupported', wssTest: 'diagWssTestResult'
};

let previousTraffic = null;
let latestSnapshot = null;
let latestWssTest = null;

function element(id){ return document.getElementById(id); }
function setValue(id, value){ const target = element(id); if (target) target.textContent = value ?? '—'; }
function yesNo(value){ return value ? 'Yes' : 'No'; }
function supported(value){ return value ? 'Supported' : 'Not supported'; }

function browserName(){
  const ua = navigator.userAgent || '';
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua) && !/Chromium\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
  return navigator.userAgentData?.brands?.[0]?.brand || 'Unknown browser';
}

async function microphonePermission(){
  if (!navigator.permissions?.query) return 'Unavailable';
  try { return (await navigator.permissions.query({ name: 'microphone' }))?.state || 'Unavailable'; }
  catch (_error) { return 'Unavailable'; }
}

function liveLines(){ return state.lines.filter((line) => !['ended', 'failed', 'busy', 'transferred'].includes(line?.state)); }
function activeLine(){ return state.lines.find((line) => line.id === state.activeLineId) || null; }
function peerConnection(){ return activeLine()?.session?.connection || null; }
function activeCallId(){ const session = activeLine()?.session; return session?.id || session?.request?.call_id || session?._request?.call_id || session?.dialog?.id?.call_id || '—'; }
function trackCount(pc){ return pc ? [...(pc.getReceivers?.() || []), ...(pc.getSenders?.() || [])].filter((item) => item.track?.kind === 'audio').length : 0; }
function deviceLabel(selectId, storedId){ const select = element(selectId); return select?.options[select.selectedIndex]?.textContent || (storedId ? 'Saved device' : 'System default'); }
function candidateText(candidate){ if (!candidate) return '—'; return `${candidate.candidateType || 'unknown'} · ${candidate.protocol || candidate.transport || '?'} · ${candidate.address || candidate.ip || 'hidden'}${candidate.port ? `:${candidate.port}` : ''}`; }
function percent(value){ return Number.isFinite(value) ? `${Math.max(0, value).toFixed(2)}%` : '—'; }

async function callStatistics(pc){
  const empty = { localCandidate: null, remoteCandidate: null, turnUsage: 'Not active', codec: '—', jitterMs: null, packetsLost: null, packetLossPercent: null, roundTripTimeMs: null, bitrateKbps: null, audioLevelPercent: null };
  if (!pc?.getStats) { previousTraffic = null; return empty; }
  const report = await pc.getStats();
  const stats = new Map();
  report.forEach((item) => stats.set(item.id, item));
  let selectedPair = null;
  let inbound = null;
  let outbound = null;
  let remoteInbound = null;
  stats.forEach((item) => {
    if (item.type === 'candidate-pair' && item.state === 'succeeded' && (item.selected || item.nominated)) selectedPair = item;
    if (item.type === 'transport' && item.selectedCandidatePairId) selectedPair = stats.get(item.selectedCandidatePairId) || selectedPair;
    if (item.type === 'inbound-rtp' && item.kind === 'audio' && !item.isRemote) inbound = item;
    if (item.type === 'outbound-rtp' && item.kind === 'audio' && !item.isRemote) outbound = item;
    if (item.type === 'remote-inbound-rtp' && item.kind === 'audio') remoteInbound = item;
  });
  const localCandidate = stats.get(selectedPair?.localCandidateId);
  const remoteCandidate = stats.get(selectedPair?.remoteCandidateId);
  const codec = stats.get(inbound?.codecId) || stats.get(outbound?.codecId);
  const received = Number(inbound?.packetsReceived);
  const lost = Number(inbound?.packetsLost);
  const total = received + Math.max(0, lost);
  const traffic = inbound && Number.isFinite(Number(inbound.bytesReceived)) ? { bytes: Number(inbound.bytesReceived), timestamp: Number(inbound.timestamp) } : null;
  let bitrate = null;
  if (traffic && previousTraffic && traffic.timestamp > previousTraffic.timestamp) bitrate = ((traffic.bytes - previousTraffic.bytes) * 8) / (traffic.timestamp - previousTraffic.timestamp);
  previousTraffic = traffic;
  const rtt = Number(selectedPair?.currentRoundTripTime ?? remoteInbound?.roundTripTime);
  const level = Number(inbound?.audioLevel ?? outbound?.audioLevel);
  return {
    localCandidate, remoteCandidate,
    turnUsage: localCandidate?.candidateType === 'relay' || remoteCandidate?.candidateType === 'relay' ? 'Yes · relay selected' : 'No · direct/STUN path',
    codec: codec?.mimeType ? `${codec.mimeType.replace(/^audio\//, '')}${codec.clockRate ? `/${codec.clockRate}` : ''}` : '—',
    jitterMs: Number.isFinite(Number(inbound?.jitter)) ? Number(inbound.jitter) * 1000 : null,
    packetsLost: Number.isFinite(lost) ? lost : null, packetLossPercent: total > 0 ? (Math.max(0, lost) / total) * 100 : null,
    roundTripTimeMs: Number.isFinite(rtt) ? rtt * 1000 : null, bitrateKbps: Number.isFinite(bitrate) ? Math.max(0, bitrate) : null,
    audioLevelPercent: Number.isFinite(level) ? Math.max(0, Math.min(100, level * 100)) : null
  };
}

function safeSettings(){
  const settings = getSettings();
  return {
    extension: settings.extension, sipDomain: settings.sipDomain, sipUri: settings.sipUri, websocketUrl: settings.websocketUrl,
    displayName: settings.displayName, sessionTimers: settings.sessionTimers,
    iceServers: (settings.iceServers || []).map((server) => ({ urls: server.urls, username: server.username ? '[configured]' : '' }))
  };
}

export async function refreshWebRtcDiagnostics(){
  const selection = audioDevices.getSelectedAudioDevices();
  const sip = getSipDiagnostics();
  const pc = peerConnection();
  const capabilities = getBrowserCapabilities();
  let call;
  try { call = await callStatistics(pc); } catch (error) { console.warn('Unable to collect WebRTC statistics', error); call = await callStatistics(null); }
  const values = {
    browser: browserName(), microphonePermission: await microphonePermission(), selectedMicrophone: deviceLabel('inputDeviceSelect', selection.inputDeviceId),
    selectedSpeaker: deviceLabel('outputDeviceSelect', selection.outputDeviceId), sipRegistration: sip.registrationState, websocket: sip.websocketState,
    activeLines: String(liveLines().length), activeCallId: activeCallId(), iceGathering: pc?.iceGatheringState || '—', iceConnection: pc?.iceConnectionState || '—',
    localCandidate: candidateText(call.localCandidate), remoteCandidate: candidateText(call.remoteCandidate), turnUsage: call.turnUsage, codec: call.codec,
    jitter: call.jitterMs == null ? '—' : `${call.jitterMs.toFixed(2)} ms`, packetLoss: call.packetsLost == null ? '—' : `${call.packetsLost} · ${percent(call.packetLossPercent)}`,
    roundTripTime: call.roundTripTimeMs == null ? '—' : `${call.roundTripTimeMs.toFixed(1)} ms`, bitrate: call.bitrateKbps == null ? '—' : `${call.bitrateKbps.toFixed(1)} kbps`,
    audioLevel: call.audioLevelPercent == null ? '—' : `${call.audioLevelPercent.toFixed(1)}%`, rtpAudioTracks: String(trackCount(pc)),
    microphoneSupported: supported(capabilities.microphoneSupported), recordingSupported: supported(capabilities.recordingSupported),
    speakerSelectionSupported: supported(capabilities.speakerSelectionSupported), secureContext: yesNo(capabilities.secureContext), webRtcSupported: yesNo(capabilities.webRtcSupported)
  };
  Object.entries(values).forEach(([key, value]) => setValue(fields[key], value));
  latestSnapshot = { capturedAt: new Date().toISOString(), ...values };
  return latestSnapshot;
}

function wssError(url, elapsed){
  if (!/^wss:\/\//i.test(url)) return 'Invalid URL: use wss://';
  if (elapsed >= 7900) return 'Timeout: the WSS server did not respond';
  return 'Connection failed: check TLS certificate, port, firewall or connection refusal';
}

async function testWebSocket(){
  const url = String(getSettings().websocketUrl || '').trim();
  const output = element(fields.wssTest);
  setValue(fields.wssTest, 'Testing…');
  output?.classList.remove('is-success', 'is-error');
  const started = performance.now();
  const result = await new Promise((resolve) => {
    let done = false;
    let socket;
    const finish = (ok, message) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      try { socket?.close(1000, 'Diagnostic complete'); } catch (_error) {}
      resolve({ ok, message, elapsedMs: Math.round(performance.now() - started) });
    };
    const timeout = window.setTimeout(() => finish(false, wssError(url, 8000)), 8000);
    try {
      socket = new WebSocket(url, 'sip');
      socket.addEventListener('open', () => finish(true, 'Connected successfully'));
      socket.addEventListener('error', () => finish(false, wssError(url, performance.now() - started)));
    } catch (error) { finish(false, error?.message || wssError(url, 0)); }
  });
  setValue(fields.wssTest, `${result.message} · ${result.elapsedMs} ms`);
  output?.classList.add(result.ok ? 'is-success' : 'is-error');
  latestWssTest = { url, ...result, testedAt: new Date().toISOString() };
  return latestWssTest;
}

async function exportReport(){
  const snapshot = await refreshWebRtcDiagnostics();
  const devices = await navigator.mediaDevices?.enumerateDevices?.().catch(() => []) || [];
  const report = {
    reportVersion: 1, generatedAt: new Date().toISOString(), application: 'CloudSIP',
    browser: { name: browserName(), userAgent: navigator.userAgent, platform: navigator.userAgentData?.platform || navigator.platform || 'Unknown', online: navigator.onLine, secureContext: window.isSecureContext },
    audioDevices: devices.map((device) => ({ kind: device.kind, label: device.label || 'Permission required', deviceId: device.deviceId ? '[available]' : '' })),
    sip: safeSettings(), wssTest: latestWssTest, diagnostics: snapshot
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `cloudsip-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showSuccess('Diagnostic report exported');
}

async function clearAllLocalData(){
  const confirmed = typeof globalThis.confirm !== 'function' || globalThis.confirm('Clear settings, call logs, contacts, audio device choices and local recordings?');
  if (!confirmed) return;
  localStorage.clear();
  clearLocalData();
  try { await clearRecordingBlobs(); } catch (error) { console.warn('Unable to clear IndexedDB recordings', error); showWarning('Local data cleared, but recordings could not be cleared'); return; }
  renderLogs();
  showSuccess('Local data cleared');
}

function bindButton(id, handler){ const button = element(id); if (!button || button.webRtcDiagnosticsBound) return; button.webRtcDiagnosticsBound = true; button.addEventListener('click', handler); }

export function initWebRtcDiagnostics(){
  bindButton('diagTestMicrophone', async () => { const result = await audioDevices.testMicrophone(); if (result) showSuccess('Microphone is available'); await audioDevices.refreshAudioDevices(); refreshWebRtcDiagnostics(); });
  bindButton('diagTestSpeaker', () => audioDevices.playTestTone?.('output'));
  bindButton('diagReconnectSip', () => { unregisterSip(); registerSip(); showInfo('SIP reconnect requested'); window.setTimeout(refreshWebRtcDiagnostics, 500); });
  bindButton('diagTestWss', testWebSocket);
  bindButton('diagExportReport', exportReport);
  bindButton('diagClearLocalData', clearAllLocalData);
  ['sip:status', 'activecall:updated'].forEach((eventName) => { window.addEventListener(eventName, refreshWebRtcDiagnostics); document.addEventListener(eventName, refreshWebRtcDiagnostics); });
  window.setInterval(refreshWebRtcDiagnostics, 3000);
  refreshWebRtcDiagnostics();
}
