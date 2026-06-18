let audioContext = null;
let animationFrameId = null;
let micAnalyser = null;
let remoteAnalyser = null;
let micSource = null;
let remoteSource = null;
let fallbackLocalStream = null;
let activeSession = null;
let remoteRetryTimer = null;
let resumeHandlerBound = false;

const REMOTE_RETRY_MS = 2000;
const REMOTE_RETRY_INTERVAL_MS = 200;

function getElement(id){
  return document.getElementById(id);
}

function showMeters(show){
  getElement('callAudioMeters')?.classList.toggle('show', show);
}

function resetMeters(){
  const micFill = getElement('micMeterFill');
  const remoteFill = getElement('remoteMeterFill');
  if (micFill) micFill.style.width = '0%';
  if (remoteFill) remoteFill.style.width = '0%';
}

function getAudioContextClass(){
  return globalThis.AudioContext || globalThis.webkitAudioContext || null;
}

function getAudioTrackFromSenders(session){
  const senders = session?.connection?.getSenders?.() || [];
  return senders.find((sender) => sender.track?.kind === 'audio' && sender.track.readyState !== 'ended')?.track || null;
}

function getAudioTracksFromReceivers(session){
  const receivers = session?.connection?.getReceivers?.() || [];
  return receivers
    .map((receiver) => receiver.track)
    .filter((track) => track?.kind === 'audio' && track.readyState !== 'ended');
}

function createAnalyserFromTracks(tracks){
  if (!audioContext || !tracks.length) return null;

  const stream = new MediaStream(tracks);
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(analyser);

  return { source, analyser };
}

function disconnectNode(node){
  try {
    node?.disconnect?.();
  } catch (error) {
    console.warn('Unable to disconnect audio meter node:', error);
  }
}

function stopFallbackLocalStream(){
  fallbackLocalStream?.getTracks?.().forEach((track) => track.stop());
  fallbackLocalStream = null;
}

function ensureResumeHandler(){
  if (resumeHandlerBound) return;
  resumeHandlerBound = true;

  document.addEventListener('click', () => {
    if (audioContext?.state === 'suspended') {
      audioContext.resume().catch((error) => console.warn('Unable to resume audio meter context:', error));
    }
  }, { passive: true });
}

async function resumeAudioContext(){
  if (!audioContext || audioContext.state !== 'suspended') return;
  try {
    await audioContext.resume();
  } catch (error) {
    console.warn('Audio meter context resume deferred until user gesture:', error);
  }
}

async function createLocalAnalyser(session){
  const senderTrack = getAudioTrackFromSenders(session);
  if (senderTrack) return createAnalyserFromTracks([senderTrack]);

  if (!navigator.mediaDevices?.getUserMedia) return null;
  fallbackLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return createAnalyserFromTracks(fallbackLocalStream.getAudioTracks());
}

function createRemoteAnalyser(session){
  return createAnalyserFromTracks(getAudioTracksFromReceivers(session));
}

function scheduleRemoteRetry(session, startedAt = Date.now()){
  clearTimeout(remoteRetryTimer);
  if (!activeSession || session !== activeSession || remoteAnalyser) return;
  if (Date.now() - startedAt >= REMOTE_RETRY_MS) return;

  remoteRetryTimer = setTimeout(() => {
    if (!activeSession || session !== activeSession || remoteAnalyser) return;
    const remote = createRemoteAnalyser(session);
    if (remote) {
      remoteSource = remote.source;
      remoteAnalyser = remote.analyser;
      return;
    }
    scheduleRemoteRetry(session, startedAt);
  }, REMOTE_RETRY_INTERVAL_MS);
}

function analyserLevel(analyser){
  if (!analyser) return 0;

  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);

  let sumSquares = 0;
  for (const value of data) {
    const centered = (value - 128) / 128;
    sumSquares += centered * centered;
  }

  const rms = Math.sqrt(sumSquares / data.length);
  return Math.min(100, Math.round(rms * 320));
}

function updateMeters(){
  getElement('micMeterFill')?.style.setProperty('width', `${analyserLevel(micAnalyser)}%`);
  getElement('remoteMeterFill')?.style.setProperty('width', `${analyserLevel(remoteAnalyser)}%`);
  animationFrameId = requestAnimationFrame(updateMeters);
}

export async function startAudioMeters(session){
  stopAudioMeters();
  activeSession = session || null;
  showMeters(true);
  resetMeters();
  ensureResumeHandler();

  const AudioContextClass = getAudioContextClass();
  if (!activeSession || !AudioContextClass) return;

  try {
    audioContext = new AudioContextClass();
    await resumeAudioContext();

    const local = await createLocalAnalyser(activeSession);
    if (activeSession !== session) return;
    micSource = local?.source || null;
    micAnalyser = local?.analyser || null;

    const remote = createRemoteAnalyser(activeSession);
    remoteSource = remote?.source || null;
    remoteAnalyser = remote?.analyser || null;
    if (!remoteAnalyser) scheduleRemoteRetry(activeSession);

    animationFrameId = requestAnimationFrame(updateMeters);
  } catch (error) {
    console.warn('Unable to start audio meters:', error);
    stopFallbackLocalStream();
    if (!animationFrameId) animationFrameId = requestAnimationFrame(updateMeters);
  }
}

export function stopAudioMeters(){
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  clearTimeout(remoteRetryTimer);
  remoteRetryTimer = null;

  disconnectNode(micSource);
  disconnectNode(remoteSource);
  disconnectNode(micAnalyser);
  disconnectNode(remoteAnalyser);
  micSource = null;
  remoteSource = null;
  micAnalyser = null;
  remoteAnalyser = null;
  activeSession = null;

  stopFallbackLocalStream();

  const context = audioContext;
  audioContext = null;
  context?.close?.().catch?.((error) => console.warn('Unable to close audio meter context:', error));

  showMeters(false);
  resetMeters();
}
