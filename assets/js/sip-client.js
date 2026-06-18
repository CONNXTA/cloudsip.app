import { applyAudioDevicesToMedia, getSelectedAudioDevices } from './audio-devices.js';
import { showError, showSuccess, showWarning } from './toast.js';
import { runBrowserChecks } from './browser-check.js';
import { getUserPresence } from './presence.js';
let sipUA = null;
let sipConfig = null;
let registered = false;
let started = false;
let eventHandlers = {};
let currentAudioSession = null;

const sessionEvents = ['progress', 'accepted', 'confirmed', 'ended', 'failed', 'bye', 'rejected', 'canceled'];

const statusClasses = ['is-online', 'is-offline', 'is-failed'];

function getElement(id){
  return document.getElementById(id);
}

function getExtension(){
  return sipConfig?.extension || '-';
}

function getConnectionLabel(status){
  const extension = getExtension();
  return `WSS · ${extension} · ${status}`;
}

function setConnectionInfo(status){
  const connectionInfo = getElement('connectionInfo');
  if (connectionInfo) connectionInfo.textContent = getConnectionLabel(status);
}

function setConnectionInfoText(text){
  const connectionInfo = getElement('connectionInfo');
  if (connectionInfo) connectionInfo.textContent = text;
}

function setSipStatus(text, dotClass){
  const sipStatusText = getElement('sipStatusText');
  const sipStatusDot = getElement('sipStatusDot');

  if (sipStatusText) sipStatusText.textContent = text;
  window.dispatchEvent(new CustomEvent('sip:status', { detail: { text, dotClass } }));

  if (sipStatusDot) {
    sipStatusDot.classList.remove(...statusClasses);
    if (dotClass) sipStatusDot.classList.add(dotClass);
  }
}

function setOffline(){
  registered = false;
  console.log("SIP registered", registered);
  setSipStatus('Offline', 'is-offline');
}


function getSipDomain(){
  const sipUri = sipConfig?.sipUri || '';
  const match = sipUri.match(/^sip:[^@]+@([^;>]+)/i);
  return match?.[1] || '';
}

function normalizeSipTarget(number){
  const cleanNumber = String(number || '').trim().replace(/\s+/g, '');
  const domain = getSipDomain();

  if (!cleanNumber) return '';
  if (cleanNumber.startsWith('sip:')) return cleanNumber;
  if (!domain) return '';

  return `sip:${cleanNumber}@${domain}`;
}

function getMediaConstraints(){
  const { inputDeviceId } = getSelectedAudioDevices();

  return {
    audio: inputDeviceId
      ? { deviceId: { exact: inputDeviceId } }
      : true,
    video: false
  };
}

function getSessionOptions(){
  return {
    mediaConstraints: getMediaConstraints(),
    pcConfig: {
      iceServers: []
    }
  };
}

async function ensureMicrophonePermission(){
  if (!navigator.mediaDevices?.getUserMedia) {
    console.error('Microphone permission unsupported: navigator.mediaDevices.getUserMedia is unavailable');
    return 'unsupported';
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    // Stop test tracks immediately. JsSIP will request media again when calling.
    stream.getTracks().forEach((track) => track.stop());

    return true;
  } catch (error) {
    console.error('Microphone permission denied or unavailable:', error);
    showError('Microphone permission denied');
    return false;
  }
}

function playRemoteAudio(remoteAudio){
  remoteAudio.muted = false;
  remoteAudio.volume = 1.0;
  console.log('Remote audio srcObject', remoteAudio.srcObject);
  remoteAudio.play().catch((err) => {
    console.warn('Remote audio autoplay blocked:', err);
  });
}

export function attachRemoteAudio(session) {
  const remoteAudio = document.getElementById("remoteAudio");
  if (!remoteAudio) {
    console.error("remoteAudio element not found");
    return null;
  }

  currentAudioSession = session || null;

  if (!session?.connection) return remoteAudio;

  const pc = session.connection;
  const remoteStream = new MediaStream();

  console.log('Receivers', pc.getReceivers());

  pc.getReceivers().forEach(receiver => {
    if (receiver.track && receiver.track.kind === "audio") {
      remoteStream.addTrack(receiver.track);
    }
  });

  remoteAudio.srcObject = remoteStream;
  applyAudioDevicesToMedia();
  playRemoteAudio(remoteAudio);
  return remoteAudio;
}

function attachRemoteTrackHandler(session, peerConnection = session?.connection){
  if (!peerConnection || peerConnection.remoteAudioTrackHandlerAttached) return;

  peerConnection.remoteAudioTrackHandlerAttached = true;
  peerConnection.addEventListener('track', (event) => {
    console.log('Remote track received', event);

    if (session !== currentAudioSession) return;

    const remoteAudio = document.getElementById('remoteAudio');
    if (remoteAudio && event.streams && event.streams[0]) {
      remoteAudio.srcObject = event.streams[0];
      applyAudioDevicesToMedia();
      playRemoteAudio(remoteAudio);
      return;
    }

    attachRemoteAudio(session);
  });
}

function prepareSessionAudio(session){
  if (!session || session.remoteAudioPrepared) return;

  session.remoteAudioPrepared = true;
  attachRemoteTrackHandler(session);

  session.on('peerconnection', (event) => {
    attachRemoteTrackHandler(session, event.peerconnection);
  });

}

function sessionAudioTracks(session){
  const receivers = session?.connection?.getReceivers?.() || [];
  return receivers
    .map((receiver) => receiver.track)
    .filter((track) => track?.kind === 'audio');
}

function clearRemoteAudio(session = null){
  const remoteAudio = getElement('remoteAudio');
  if (!remoteAudio) return;

  if (session && session !== currentAudioSession) {
    const currentTracks = remoteAudio.srcObject?.getAudioTracks?.() || [];
    const endedTracks = sessionAudioTracks(session);
    const isPlayingEndedSession = currentTracks.length > 0
      && endedTracks.length > 0
      && currentTracks.every((track) => endedTracks.includes(track));

    if (!isPlayingEndedSession) return;
  }

  remoteAudio.pause?.();
  remoteAudio.srcObject = null;
  if (!session || session === currentAudioSession) currentAudioSession = null;
}

function getCaller(session){
  const remoteIdentity = session?.remote_identity;
  return remoteIdentity?.uri?.user || remoteIdentity?.display_name || 'Unknown caller';
}

function getHandlerName(eventName){
  return {
    accepted: 'onCallAccepted',
    confirmed: 'onCallAccepted',
    ended: 'onCallEnded',
    bye: 'onCallEnded',
    failed: 'onCallFailed',
    rejected: 'onCallFailed',
    canceled: 'onCallFailed',
    progress: 'onCallProgress'
  }[eventName];
}

function addSessionEvents(session, handlers = {}){
  if (!session) return;

  session.on('muted', (event) => {
    handlers.muted?.(event, session);
  });

  session.on('unmuted', (event) => {
    handlers.unmuted?.(event, session);
  });

  session.on('hold', (event) => {
    handlers.hold?.(event, session);
  });

  session.on('unhold', (event) => {
    handlers.unhold?.(event, session);
  });

  sessionEvents.forEach((eventName) => {
    session.on(eventName, (event) => {
      handlers[eventName]?.(event, session);
      const handlerName = getHandlerName(eventName);
      if (handlerName) handlers[handlerName]?.(event, session);

      if (['ended', 'failed', 'bye', 'rejected', 'canceled'].includes(eventName)) {
        clearRemoteAudio(session);
      }
    });
  });
}

function handleNewRTCSession(event){
  if (event.originator !== 'remote') return;

  const session = event.session;
  const presence = getUserPresence();

  if (presence === 'DND') {
    showWarning('Incoming call rejected: DND');
    session.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
    return;
  }
  prepareSessionAudio(session);
  addSessionEvents(session, eventHandlers);

  const caller = getCaller(session);
  eventHandlers.onIncomingCall?.(caller, session);
}

function logRegistrationFailure(event){
  console.error('SIP registration failed', {
    cause: event?.cause,
    response: event?.response,
    status_code: event?.response?.status_code,
    reason_phrase: event?.response?.reason_phrase,
    event
  });
}

export async function initSipClient(config, handlers = {}){
  sipConfig = config;
  eventHandlers = handlers;
  registered = false;
  started = false;

  const browserCapabilities = runBrowserChecks();
  if (!browserCapabilities.canRegisterSip) {
    setConnectionInfo(!browserCapabilities.secureContext ? 'HTTPS required' : 'WebRTC unsupported');
    setSipStatus('Failed', 'is-failed');
    return null;
  }

  if (!window.JsSIP) {
    setConnectionInfoText('JsSIP Missing');
    setSipStatus('Failed', 'is-failed');
    return null;
  }

  if (sipUA) {
    stopSipClient();
  }

  const microphonePermission = await ensureMicrophonePermission();

  if (microphonePermission === 'unsupported') {
    setConnectionInfo('Mic unsupported');
    setSipStatus('Failed', 'is-failed');
    eventHandlers.onMicrophoneDenied?.();
    return null;
  }

  if (!microphonePermission) {
    setConnectionInfo('Mic denied');
    setSipStatus('Failed', 'is-failed');
    eventHandlers.onMicrophoneDenied?.();
    return null;
  }

  const socket = new window.JsSIP.WebSocketInterface(config.websocketUrl);

  sipUA = new window.JsSIP.UA({
    sockets: [socket],
    uri: config.sipUri,
    password: config.password,
    display_name: config.displayName,
    register: getUserPresence() !== 'Offline',
    session_timers: false
  });

  sipUA.on('connecting', () => {
    setConnectionInfo('Connecting');
    setSipStatus('Registering', 'is-offline');
  });

  sipUA.on('connected', () => {
    setConnectionInfo('Connected');
  });

  sipUA.on('disconnected', () => {
    setConnectionInfo('Disconnected');
    setOffline();
    showWarning('SIP disconnected');
  });

  sipUA.on('registered', () => {
    registered = true;
    console.log("SIP registered", registered);
    setConnectionInfo('Registered');
    setSipStatus('Registered', 'is-online');
    showSuccess('SIP registered');
  });

  sipUA.on('unregistered', () => {
    setOffline();
  });

  sipUA.on('registrationFailed', (event) => {
    registered = false;
    console.log("SIP registered", registered);
    setConnectionInfo('Failed');
    setSipStatus('Failed', 'is-failed');
    showError('SIP registration failed');
    logRegistrationFailure(event);
  });

  sipUA.on('newRTCSession', handleNewRTCSession);

  if (getUserPresence() !== 'Offline') {
    sipUA.start();
    started = true;
  } else {
    setOffline();
  }

  return sipUA;
}

export function registerSip(){
  const browserCapabilities = runBrowserChecks();
  if (!browserCapabilities.canRegisterSip) {
    setConnectionInfo(!browserCapabilities.secureContext ? 'HTTPS required' : 'WebRTC unsupported');
    setSipStatus('Failed', 'is-failed');
    return false;
  }

  if (!sipUA) return false;

  setSipStatus('Registering', 'is-offline');

  if (!started) {
    sipUA.start();
    started = true;
  }

  sipUA.register();
  return true;
}

export function unregisterSip(){
  if (!sipUA) return false;

  if (started) {
    sipUA.unregister();
  }

  registered = false;
  setOffline();
  return true;
}

export function stopSipClient(){
  if (!sipUA) return false;

  sipUA.stop();
  sipUA = null;
  registered = false;
  started = false;
  setOffline();
  return true;
}

function describeReadyState(readyState){
  return {
    0: 'Connecting',
    1: 'Open',
    2: 'Closing',
    3: 'Closed'
  }[readyState] || (readyState == null ? 'Unavailable' : String(readyState));
}

function getWebSocketState(){
  const socket = sipUA?._transport?.socket?._ws || sipUA?._transport?.socket?.socket || sipUA?._transport?.socket;
  return describeReadyState(socket?.readyState);
}

export function getSipDiagnostics(){
  return {
    registrationState: registered ? 'Registered' : started ? 'Unregistered' : 'Offline',
    websocketState: getWebSocketState()
  };
}

export function getSipUA(){
  return sipUA;
}

export function isSipRegistered(){
  return registered;
}


export function createOutgoingSession(number, eventHandlers = {}){
  if (!sipUA || !registered) {
    console.error('Cannot make SIP call: JsSIP is not registered');
    setSipStatus('Offline', 'is-offline');
    return null;
  }

  const target = normalizeSipTarget(number);
  if (!target) {
    console.error('Cannot make SIP call: invalid target', { number, sipUri: sipConfig?.sipUri });
    return null;
  }

  const session = sipUA.call(target, getSessionOptions());
  prepareSessionAudio(session);
  addSessionEvents(session, eventHandlers);

  return session;
}

export function answerSession(session){
  if (!session) return false;

  session.answer(getSessionOptions());
  prepareSessionAudio(session);
  return true;
}

export function hangupSession(session){
  if (!session) return false;

  session.terminate();
  return true;
}

export function holdSession(session){
  if (!session) return false;

  session.hold();
  return true;
}

export function unholdSession(session){
  if (!session) return false;

  session.unhold();
  return true;
}

export function muteSession(session){
  if (!session) return false;

  session.mute({ audio: true });
  return true;
}

export function unmuteSession(session){
  if (!session) return false;

  session.unmute({ audio: true });
  return true;
}

export function sendDTMF(session, tone){
  if (!session || !tone) return false;

  session.sendDTMF(tone);
  return true;
}

export function blindTransferSession(session, targetNumber){
  if (!session) {
    console.error('No active session to transfer');
    showError('Transfer failed');
    return false;
  }

  if (!String(targetNumber || '').trim()) {
    console.error('Blind transfer failed: transfer target is empty');
    showError('Transfer failed');
    return false;
  }

  const target = normalizeSipTarget(targetNumber);
  if (!target) {
    console.error('Blind transfer failed: invalid target or SIP domain unavailable', {
      targetNumber,
      sipUri: sipConfig?.sipUri
    });
    showError('Transfer failed');
    return false;
  }

  try {
    console.log('Starting blind transfer', { target });
    session.refer(target, {
      eventHandlers: {
        requestSucceeded: (event) => console.log('Blind transfer REFER request succeeded', event),
        requestFailed: (event) => {
          console.error('Blind transfer REFER request failed', event);
          showError('Transfer failed');
        },
        accepted: (event) => console.log('Blind transfer accepted', event),
        failed: (event) => {
          console.error('Blind transfer failed', event);
          showError('Transfer failed');
        }
      }
    });
    showSuccess('Transfer sent');
    return true;
  } catch (error) {
    console.error('Blind transfer failed:', error);
    showError('Transfer failed');
    return false;
  }
}
