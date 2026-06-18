import { showError, showWarning } from './toast.js';

let lastCapabilities = null;
let startupWarningShown = false;

function isLocalhost(){
  const hostname = globalThis.location?.hostname || '';
  return ['localhost', '127.0.0.1', '::1'].includes(hostname) || hostname.endsWith('.localhost');
}

function hasAudioContext(){
  return typeof globalThis.AudioContext === 'function' || typeof globalThis.webkitAudioContext === 'function';
}

function hasSetSinkId(){
  return typeof globalThis.HTMLMediaElement !== 'undefined'
    && typeof globalThis.HTMLMediaElement.prototype?.setSinkId === 'function';
}

export function getBrowserCapabilities(){
  const secureContext = Boolean(globalThis.isSecureContext) || isLocalhost();
  const mediaDevices = Boolean(navigator.mediaDevices);
  const getUserMedia = typeof navigator.mediaDevices?.getUserMedia === 'function';
  const rtcPeerConnection = typeof globalThis.RTCPeerConnection === 'function';
  const mediaRecorder = typeof globalThis.MediaRecorder === 'function';
  const audioContext = hasAudioContext();
  const setSinkId = hasSetSinkId();
  const webRtcSupported = secureContext && mediaDevices && getUserMedia && rtcPeerConnection && audioContext;

  return {
    secureContext,
    localhost: isLocalhost(),
    mediaDevices,
    getUserMedia,
    rtcPeerConnection,
    mediaRecorder,
    audioContext,
    setSinkId,
    microphoneSupported: mediaDevices && getUserMedia,
    recordingSupported: mediaRecorder,
    speakerSelectionSupported: setSinkId,
    webRtcSupported,
    canRegisterSip: secureContext && mediaDevices && getUserMedia && rtcPeerConnection && audioContext
  };
}

export function runBrowserChecks({ notify = true } = {}){
  const capabilities = getBrowserCapabilities();
  lastCapabilities = capabilities;

  if (notify) {
    if (!capabilities.secureContext) showError('WebRTC requires HTTPS or localhost');
    else if (!capabilities.getUserMedia) showError('Microphone access is not supported in this browser');
    else if (!capabilities.rtcPeerConnection) showError('WebRTC calling is not supported in this browser');

    if (!startupWarningShown) {
      if (!capabilities.mediaRecorder) showWarning('Call recording is not supported in this browser');
      if (!capabilities.setSinkId) showWarning('Speaker selection is not supported in this browser');
      startupWarningShown = true;
    }
  }

  window.dispatchEvent(new CustomEvent('browser:capabilities', { detail: { capabilities } }));
  return capabilities;
}

export function getLastBrowserCapabilities(){
  return lastCapabilities || getBrowserCapabilities();
}
