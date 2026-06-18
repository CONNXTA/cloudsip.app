import { showError, showSuccess, showWarning } from './toast.js';
import { getRecordingBlob, saveRecordingBlob } from './recording-db.js';

const STORAGE_KEY = 'cloudsip_phone_recordings';
const activeRecordings = new Map();
const recordingBlobs = new Map();
let currentPlaybackAudio = null;
let currentPlaybackId = null;

function hasLocalStorage(){
  try {
    if (!globalThis.localStorage) return false;
    const testKey = `${STORAGE_KEY}_test`;
    globalThis.localStorage.setItem(testKey, testKey);
    globalThis.localStorage.removeItem(testKey);
    return true;
  } catch (_error) {
    return false;
  }
}

function readMetadata(){
  if (!hasLocalStorage()) return [];

  try {
    const parsed = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    console.warn('Unable to parse stored recording metadata', error);
    return [];
  }
}

function persistMetadata(recording){
  if (!hasLocalStorage() || !recording) return;

  const metadata = {
    id: recording.id,
    lineId: recording.lineId,
    remoteNumber: recording.remoteNumber,
    startedAt: recording.startedAt,
    endedAt: recording.endedAt,
    durationSec: recording.durationSec,
    mimeType: recording.mimeType,
    hasInMemoryBlob: Boolean(recording.blobUrl),
    storedInIndexedDB: Boolean(recording.endedAt)
  };

  const next = [metadata, ...readMetadata().filter((item) => item.id !== recording.id)];
  globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function makeId(){
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function preferredMimeType(){
  const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
  return candidates.find((type) => globalThis.MediaRecorder?.isTypeSupported?.(type)) || '';
}

function dispatchRecordingReady(recording){
  if (typeof globalThis.dispatchEvent !== 'function') return;
  const event = typeof CustomEvent === 'function'
    ? new CustomEvent('recording:ready', { detail: { recording } })
    : new Event('recording:ready');
  if (!('detail' in event)) Object.defineProperty(event, 'detail', { value: { recording } });
  globalThis.dispatchEvent(event);
}

function dispatchRecordingState(lineId){
  if (typeof globalThis.dispatchEvent !== 'function') return;
  const event = typeof CustomEvent === 'function'
    ? new CustomEvent('recording:state', { detail: { lineId, recording: activeRecordings.get(Number(lineId)) || null } })
    : new Event('recording:state');
  if (!('detail' in event)) Object.defineProperty(event, 'detail', { value: { lineId, recording: activeRecordings.get(Number(lineId)) || null } });
  globalThis.dispatchEvent(event);
}

export function isRecordingSupported(){
  return !!globalThis.MediaRecorder;
}

export async function buildMixedRecordingStream(session){
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  const audioContext = new AudioContextClass();
  const destination = audioContext.createMediaStreamDestination();

  const localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  console.log('Local tracks', localStream.getAudioTracks());
  const localSource = audioContext.createMediaStreamSource(localStream);
  localSource.connect(destination);

  const remoteStream = new MediaStream();
  const receivers = session.connection.getReceivers();
  console.log('Remote receivers', receivers);
  receivers.forEach((receiver) => {
    if (receiver.track && receiver.track.kind === 'audio') remoteStream.addTrack(receiver.track);
  });
  console.log('Remote tracks', remoteStream.getAudioTracks());

  if (remoteStream.getAudioTracks().length > 0) {
    const remoteSource = audioContext.createMediaStreamSource(remoteStream);
    remoteSource.connect(destination);
  } else {
    console.warn('No remote audio track found for recording');
  }

  return { mixedStream: destination.stream, audioContext, localStream };
}

function findRecording(recordingId){
  const normalizedRecordingId = String(recordingId || '');
  const inMemory = recordingBlobs.get(normalizedRecordingId);
  if (inMemory) return inMemory;
  return readMetadata().find((item) => item.id === normalizedRecordingId) || null;
}

function cacheRecording(recording){
  if (!recording?.id) return null;
  const previous = recordingBlobs.get(recording.id);
  if (previous?.blobUrl && previous.blobUrl !== recording.blobUrl) URL.revokeObjectURL(previous.blobUrl);
  recordingBlobs.set(recording.id, recording);
  return recording;
}

async function loadRecording(recordingId){
  const normalizedRecordingId = String(recordingId || '');
  const cached = recordingBlobs.get(normalizedRecordingId);
  if (cached?.blobUrl && cached?.blob) return cached;

  let stored = null;
  try {
    stored = await getRecordingBlob(normalizedRecordingId);
  } catch (error) {
    console.warn('Unable to load recording blob from IndexedDB', error);
  }
  if (!stored?.blob) return findRecording(normalizedRecordingId);

  return cacheRecording({
    ...stored,
    blobUrl: URL.createObjectURL(stored.blob)
  });
}

export async function startRecording(lineId, session, remoteNumber){
  const normalizedLineId = Number(lineId);
  if (!normalizedLineId) return null;
  if (activeRecordings.has(normalizedLineId)) return activeRecordings.get(normalizedLineId);

  if (!isRecordingSupported()) {
    showError('Recording not supported in this browser');
    return null;
  }
  if (!session) {
    showWarning('No active call to record');
    return null;
  }
  if (!session.connection) {
    showWarning('Call media not ready yet');
    return null;
  }

  console.log('Starting recording for line', normalizedLineId);

  let built;
  try {
    built = await buildMixedRecordingStream(session);
    const mimeType = preferredMimeType();
    const mediaRecorder = new MediaRecorder(built.mixedStream, mimeType ? { mimeType } : undefined);
    const recording = {
      id: makeId(),
      lineId: normalizedLineId,
      session,
      remoteNumber: String(remoteNumber || 'Unknown caller'),
      mediaRecorder,
      chunks: [],
      startedAt: new Date().toISOString(),
      audioContext: built.audioContext,
      localStream: built.localStream,
      mimeType: mediaRecorder.mimeType || mimeType || 'audio/webm',
      endedAt: null,
      durationSec: 0,
      blobUrl: null,
      stopPromise: null
    };

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) recording.chunks.push(event.data);
    });

    activeRecordings.set(normalizedLineId, recording);
    mediaRecorder.start();
    console.log('MediaRecorder state', mediaRecorder.state);
    persistMetadata(recording);
    dispatchRecordingState(normalizedLineId);
    showSuccess('Recording started');
    return recording;
  } catch (error) {
    console.warn('Unable to start call recording', error);
    built?.localStream?.getTracks?.().forEach((track) => track.stop());
    built?.audioContext?.close?.().catch?.((closeError) => console.warn('Unable to close recording audio context', closeError));
    showWarning('Call media not ready yet');
    return null;
  }
}

export function stopRecording(lineId){
  const normalizedLineId = Number(lineId);
  const recording = activeRecordings.get(normalizedLineId);
  if (!recording) return Promise.resolve(null);
  if (recording.stopPromise) return recording.stopPromise;

  recording.stopPromise = new Promise((resolve) => {
    const finish = async () => {
      recording.endedAt = new Date().toISOString();
      recording.durationSec = Math.max(0, Math.floor((new Date(recording.endedAt).getTime() - new Date(recording.startedAt).getTime()) / 1000));
      recording.localStream?.getTracks?.().forEach((track) => track.stop());
      recording.audioContext?.close?.().catch?.((error) => console.warn('Unable to close recording audio context', error));
      const blob = new Blob(recording.chunks, { type: recording.mimeType || 'audio/webm' });
      const blobUrl = URL.createObjectURL(blob);
      const metadata = {
        id: recording.id,
        lineId: recording.lineId,
        remoteNumber: recording.remoteNumber,
        startedAt: recording.startedAt,
        endedAt: recording.endedAt,
        durationSec: recording.durationSec,
        mimeType: blob.type || recording.mimeType,
        blobUrl
      };
      cacheRecording({ ...metadata, blob });
      try {
        await saveRecordingBlob(metadata, blob);
      } catch (error) {
        console.warn('Unable to save recording blob to IndexedDB', error);
        showWarning('Recording could not be saved for playback after refresh');
      }
      persistMetadata(metadata);
      activeRecordings.delete(normalizedLineId);
      console.log('Recording stopped', metadata);
      dispatchRecordingReady(metadata);
      dispatchRecordingState(normalizedLineId);
      resolve(metadata);
    };

    recording.mediaRecorder.addEventListener('stop', finish, { once: true });
    if (recording.mediaRecorder.state !== 'inactive') recording.mediaRecorder.stop();
    else finish();
    console.log('MediaRecorder state', recording.mediaRecorder.state);
  });

  return recording.stopPromise;
}

export function toggleRecording(lineId, session, remoteNumber){
  return isRecording(lineId) ? stopRecording(lineId) : startRecording(lineId, session, remoteNumber);
}

export function isRecording(lineId){
  return activeRecordings.has(Number(lineId));
}

export function getRecordingUrl(recordingId){
  return findRecording(recordingId)?.blobUrl || null;
}

export function getRecording(lineId){
  const normalizedLineId = Number(lineId);
  return activeRecordings.get(normalizedLineId) || [...recordingBlobs.values()].find((recording) => Number(recording.lineId) === normalizedLineId) || null;
}

export function updateRecordingPlaybackButtons(){
  if (typeof document === 'undefined') return;

  document.querySelectorAll('[data-play-recording], [data-play-rec]').forEach((button) => {
    const recordingId = button.dataset.playRecording || button.dataset.playRec || '';
    const isPlaying = Boolean(currentPlaybackId && recordingId === currentPlaybackId);
    button.textContent = isPlaying ? 'Stop' : 'Play';
    button.classList.toggle('active', isPlaying);
  });
}

export function stopRecordingPlayback(){
  const audio = currentPlaybackAudio;

  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute?.('src');
    audio.src = '';
    audio.load?.();
  }

  currentPlaybackAudio = null;
  currentPlaybackId = null;
  updateRecordingPlaybackButtons();
}

export function isRecordingPlaying(recordingId){
  return Boolean(recordingId && currentPlaybackId === recordingId && currentPlaybackAudio);
}

export async function downloadRecording(recordingId){
  const recording = await loadRecording(recordingId);
  if (!recording?.blobUrl) {
    showWarning('Recording file not available');
    return false;
  }

  const safeNumber = String(recording.remoteNumber || 'unknown').replace(/[^\w.-]+/g, '_');
  const timestamp = String(recording.startedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  const extension = String(recording.mimeType || '').includes('wav') ? 'wav' : 'webm';
  const link = document.createElement('a');
  link.href = recording.blobUrl;
  link.download = `cloudsip-recording-${safeNumber}-${timestamp}.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

export async function playRecording(recordingId){
  const normalizedRecordingId = String(recordingId || '');

  if (isRecordingPlaying(normalizedRecordingId)) {
    stopRecordingPlayback();
    return true;
  }

  if (currentPlaybackAudio) stopRecordingPlayback();

  const recording = await loadRecording(normalizedRecordingId);
  if (!recording?.blobUrl) {
    showWarning('Recording file not available');
    updateRecordingPlaybackButtons();
    return false;
  }

  const audio = new Audio(recording.blobUrl);
  currentPlaybackAudio = audio;
  currentPlaybackId = normalizedRecordingId;
  updateRecordingPlaybackButtons();

  audio.addEventListener('ended', () => {
    if (currentPlaybackAudio !== audio) return;
    currentPlaybackAudio = null;
    currentPlaybackId = null;
    updateRecordingPlaybackButtons();
  }, { once: true });

  audio.play().catch((error) => {
    if (currentPlaybackAudio !== audio) return;
    console.warn('Unable to play recording', error);
    showWarning('Unable to play recording');
    stopRecordingPlayback();
  });
  return true;
}

if (typeof document !== 'undefined') {
  document.addEventListener('viewchange', (event) => {
    if (event.detail?.view !== 'thread') stopRecordingPlayback();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopRecordingPlayback();
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    stopRecordingPlayback();
    recordingBlobs.forEach((recording) => {
      if (recording.blobUrl) URL.revokeObjectURL(recording.blobUrl);
    });
    recordingBlobs.clear();
  });
}
