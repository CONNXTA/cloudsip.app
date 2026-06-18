import { getSelectedAudioDevices } from './audio-devices.js';

const RINGTONE_SRC = 'assets/sounds/ringtone.mp3';
const RINGBACK_SRC = 'assets/sounds/ringback.mp3';
const DTMF_VOLUME = 0.35;
const DTMF_SOURCES = {
  '0': 'assets/sounds/dtmf/0.wav',
  '1': 'assets/sounds/dtmf/1.wav',
  '2': 'assets/sounds/dtmf/2.wav',
  '3': 'assets/sounds/dtmf/3.wav',
  '4': 'assets/sounds/dtmf/4.wav',
  '5': 'assets/sounds/dtmf/5.wav',
  '6': 'assets/sounds/dtmf/6.wav',
  '7': 'assets/sounds/dtmf/7.wav',
  '8': 'assets/sounds/dtmf/8.wav',
  '9': 'assets/sounds/dtmf/9.wav',
  '*': 'assets/sounds/dtmf/star.wav',
  '#': 'assets/sounds/dtmf/hash.wav'
};

let ringtoneAudio = null;
let ringbackAudio = null;
let initialized = false;
let userInteracted = false;
let pendingRingtone = false;
let pendingRingback = false;
let warnedMissingRingtone = false;
let warnedMissingRingback = false;
const dtmfAudioCache = new Map();
const warnedMissingDtmf = new Set();

function getOrCreateAudio(id){
  let audio = document.getElementById(id);
  if (audio) return audio;

  audio = document.createElement('audio');
  audio.id = id;
  audio.preload = 'auto';
  audio.playsInline = true;
  document.body.appendChild(audio);
  return audio;
}

function configureAudio(audio, src){
  if (!audio) return;

  audio.loop = true;
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.srcObject = null;
  if (!audio.src.endsWith(src)) audio.src = src;
}

function warnMissingDtmf(tone, error){
  if (warnedMissingDtmf.has(tone)) return;

  warnedMissingDtmf.add(tone);
  console.warn(`DTMF tone sound file is missing or unavailable for ${tone}.`, error);
}

function warnMissing(type, error){
  if (type === 'ringtone') {
    if (warnedMissingRingtone) return;
    warnedMissingRingtone = true;
  } else {
    if (warnedMissingRingback) return;
    warnedMissingRingback = true;
  }

  console.warn(`${type} sound file is missing or unavailable.`, error);
}

function bindMissingWarning(audio, type){
  if (!audio || audio.soundManagerErrorBound) return;

  audio.soundManagerErrorBound = true;
  audio.addEventListener('error', () => warnMissing(type, audio.error));
}

function getOrCreateDtmfAudio(tone){
  const src = DTMF_SOURCES[tone];
  if (!src) return null;

  if (!dtmfAudioCache.has(tone)) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.volume = DTMF_VOLUME;
    audio.addEventListener('error', () => warnMissingDtmf(tone, audio.error));
    dtmfAudioCache.set(tone, audio);
  }

  return dtmfAudioCache.get(tone);
}

async function playDtmfAudio(audio, tone){
  const playbackAudio = audio.cloneNode(true);
  playbackAudio.volume = DTMF_VOLUME;
  playbackAudio.currentTime = 0;
  playbackAudio.muted = false;
  playbackAudio.addEventListener('error', () => warnMissingDtmf(tone, playbackAudio.error), { once: true });
  await applySelectedAudioSink(playbackAudio);

  try {
    await playbackAudio.play();
  } catch (error) {
    if (error?.name === 'NotSupportedError' || playbackAudio.error) {
      warnMissingDtmf(tone, error);
      return;
    }

    console.warn(`Unable to play DTMF tone ${tone}:`, error);
  }
}

async function applySelectedAudioSink(audio){
  if (!audio || typeof audio.setSinkId !== 'function') return;

  const { ringtoneDeviceId, outputDeviceId } = getSelectedAudioDevices();
  try {
    await audio.setSinkId(ringtoneDeviceId || outputDeviceId || '');
  } catch (error) {
    console.warn('Unable to apply audio output device:', error);
  }
}

async function applyRingtoneSink(){
  if (!ringtoneAudio || typeof ringtoneAudio.setSinkId !== 'function') return;

  const { ringtoneDeviceId } = getSelectedAudioDevices();
  try {
    await ringtoneAudio.setSinkId(ringtoneDeviceId || '');
  } catch (error) {
    console.warn('Unable to apply ringtone output device:', error);
  }
}

function rememberPending(type, pending){
  if (type === 'ringtone') pendingRingtone = pending;
  if (type === 'ringback') pendingRingback = pending;
}

async function playLoopingAudio(audio, type){
  if (!audio) return;

  rememberPending(type, true);
  audio.loop = true;
  audio.currentTime = 0;
  audio.muted = false;
  audio.volume = 1;

  if (type === 'ringtone') await applyRingtoneSink();

  try {
    await audio.play();
  } catch (error) {
    if (error?.name === 'NotAllowedError') {
      console.warn(`${type} playback was blocked until the first user interaction.`, error);
      return;
    }

    if (error?.name === 'NotSupportedError' || audio.error) {
      warnMissing(type, error);
      return;
    }

    console.warn(`Unable to play ${type} sound:`, error);
  }
}

function stopAudio(audio, type){
  rememberPending(type, false);
  if (!audio) return;

  audio.pause();
  audio.currentTime = 0;
}

function replayPendingSounds(){
  if (!userInteracted) return;

  if (pendingRingtone && ringtoneAudio?.paused) playLoopingAudio(ringtoneAudio, 'ringtone');
  if (pendingRingback && ringbackAudio?.paused) playLoopingAudio(ringbackAudio, 'ringback');
}

function handleFirstInteraction(){
  userInteracted = true;
  replayPendingSounds();
}

export function initSoundManager(){
  ringtoneAudio = getOrCreateAudio('ringtoneAudio');
  ringbackAudio = getOrCreateAudio('ringbackAudio');

  configureAudio(ringtoneAudio, RINGTONE_SRC);
  configureAudio(ringbackAudio, RINGBACK_SRC);
  bindMissingWarning(ringtoneAudio, 'ringtone');
  bindMissingWarning(ringbackAudio, 'ringback');
  applyRingtoneSink();

  if (!initialized) {
    initialized = true;
    ['click', 'keydown', 'touchstart'].forEach((eventName) => {
      document.addEventListener(eventName, handleFirstInteraction, { passive: true });
    });
  }
}

export function playRingtone(){
  initSoundManager();
  playLoopingAudio(ringtoneAudio, 'ringtone');
}

export function stopRingtone(){
  stopAudio(ringtoneAudio, 'ringtone');
}

export function playRingback(){
  initSoundManager();
  playLoopingAudio(ringbackAudio, 'ringback');
}

export function stopRingback(){
  stopAudio(ringbackAudio, 'ringback');
}

export function stopAllSounds(){
  stopRingtone();
  stopRingback();
}

export function playDtmfTone(tone){
  const audio = getOrCreateDtmfAudio(tone);
  if (!audio) return;

  playDtmfAudio(audio, tone);
}
