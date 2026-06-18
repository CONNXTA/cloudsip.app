import { showSuccess } from './toast.js';

const STORAGE_KEY = 'cloudsip_phone_audio_devices';

const defaultSelection = {
  inputDeviceId: '',
  outputDeviceId: '',
  ringtoneDeviceId: ''
};

let cachedDevices = {
  inputs: [],
  outputs: []
};

let permissionRequested = false;

function getElement(id){
  return document.getElementById(id);
}

function supportsMediaDevices(){
  return Boolean(navigator.mediaDevices?.enumerateDevices);
}

function supportsOutputSelection(){
  return typeof HTMLMediaElement !== 'undefined'
    && 'setSinkId' in HTMLMediaElement.prototype;
}

function readSelection(){
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      ...defaultSelection,
      ...stored
    };
  } catch (error) {
    console.warn('Unable to read stored audio device settings:', error);
    return { ...defaultSelection };
  }
}

function saveSelection(selection){
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...defaultSelection,
    ...selection
  }));
}

function getDeviceLabel(device, fallback){
  return device.label || fallback;
}

function ensureOption(select, value, label){
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function populateSelect(select, devices, selectedDeviceId, fallbackPrefix, includeDefault = true){
  if (!select) return;

  select.innerHTML = '';
  if (includeDefault) ensureOption(select, '', 'System default');

  devices.forEach((device, index) => {
    ensureOption(
      select,
      device.deviceId,
      getDeviceLabel(device, `${fallbackPrefix} ${index + 1}`)
    );
  });

  const hasSelectedDevice = devices.some((device) => device.deviceId === selectedDeviceId);
  select.value = hasSelectedDevice ? selectedDeviceId : '';
}

function updateUnsupportedMessage(){
  const message = getElement('audioOutputUnsupported');
  if (!message) return;

  message.hidden = supportsOutputSelection();
}

function bindSelect(select, key){
  if (!select || select.audioDevicesBound) return;

  select.audioDevicesBound = true;
  select.addEventListener('change', async () => {
    const selection = readSelection();
    selection[key] = select.value;
    saveSelection(selection);
    await applyAudioDevicesToMedia();
    showSuccess('Audio device saved');
  });
}

function bindButtons(){
  const refreshButton = getElement('refreshAudioDevices');
  const speakerButton = getElement('testSpeaker');
  const ringtoneButton = getElement('testRingtone');

  if (refreshButton && !refreshButton.audioDevicesBound) {
    refreshButton.audioDevicesBound = true;
    refreshButton.addEventListener('click', refreshAudioDevices);
  }

  if (speakerButton && !speakerButton.audioDevicesBound) {
    speakerButton.audioDevicesBound = true;
    speakerButton.addEventListener('click', () => playTestTone('output'));
  }

  if (ringtoneButton && !ringtoneButton.audioDevicesBound) {
    ringtoneButton.audioDevicesBound = true;
    ringtoneButton.addEventListener('click', () => playTestTone('ringtone'));
  }
}

function renderDevices(){
  const selection = readSelection();
  const outputSupported = supportsOutputSelection();

  const inputSelect = getElement('inputDeviceSelect');
  const outputSelect = getElement('outputDeviceSelect');
  const ringtoneSelect = getElement('ringtoneDeviceSelect');

  populateSelect(inputSelect, cachedDevices.inputs, selection.inputDeviceId, 'Microphone');
  populateSelect(outputSelect, cachedDevices.outputs, selection.outputDeviceId, 'Speaker');
  populateSelect(ringtoneSelect, cachedDevices.outputs, selection.ringtoneDeviceId, 'Ringtone output');

  if (outputSelect) outputSelect.disabled = !outputSupported;
  if (ringtoneSelect) ringtoneSelect.disabled = !outputSupported;
  getElement('testSpeaker')?.toggleAttribute('disabled', !outputSupported);
  getElement('testRingtone')?.toggleAttribute('disabled', !outputSupported);

  updateUnsupportedMessage();
}

export async function requestMicrophonePermission(){
  if (permissionRequested || !navigator.mediaDevices?.getUserMedia) return;

  permissionRequested = true;

  try {
    const permission = await navigator.permissions?.query?.({ name: 'microphone' });
    if (permission?.state === 'granted') return;
  } catch (_error) {
    // Some browsers do not expose microphone permission state. Fall back to getUserMedia.
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    console.warn('Microphone permission was not granted; device labels may be unavailable:', error);
  }
}

function ensureRingtoneAudio(){
  let audio = getElement('ringtoneAudio');
  if (audio) return audio;

  audio = document.createElement('audio');
  audio.id = 'ringtoneAudio';
  audio.preload = 'auto';
  audio.playsInline = true;
  document.body.appendChild(audio);
  return audio;
}

async function applySink(audio, deviceId){
  if (!audio || typeof audio.setSinkId !== 'function') return false;

  try {
    await audio.setSinkId(deviceId || '');
    return true;
  } catch (error) {
    console.warn('Unable to apply audio output device:', error);
    return false;
  }
}

function createToneStream(frequency = 880){
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.3);

  return { context, stream: destination.stream, oscillator };
}

export async function playTestTone(type){
  const selection = readSelection();
  const audio = type === 'ringtone' ? ensureRingtoneAudio() : getElement('remoteAudio');
  const sinkId = type === 'ringtone' ? selection.ringtoneDeviceId : selection.outputDeviceId;
  const tone = createToneStream(type === 'ringtone' ? 1046 : 880);

  if (!audio || !tone) return;

  const previousSource = audio.srcObject;
  await applySink(audio, sinkId);
  audio.srcObject = tone.stream;
  audio.muted = false;
  audio.volume = 1;
  try {
    await audio.play();
  } catch (error) {
    console.warn('Unable to play audio device test tone:', error);
  }

  tone.oscillator.onended = () => {
    tone.stream.getTracks().forEach((track) => track.stop());
    audio.pause();
    audio.srcObject = previousSource || null;
    tone.context.close?.();
  };
}


export async function testMicrophone(){
  if (!navigator.mediaDevices?.getUserMedia) {
    console.warn('Microphone testing is not supported by this browser.');
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    console.warn('Microphone test failed:', error);
    return false;
  }
}

export async function initAudioDevices(){
  bindSelect(getElement('inputDeviceSelect'), 'inputDeviceId');
  bindSelect(getElement('outputDeviceSelect'), 'outputDeviceId');
  bindSelect(getElement('ringtoneDeviceSelect'), 'ringtoneDeviceId');
  bindButtons();
  ensureRingtoneAudio();

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', refreshAudioDevices);
  }

  await refreshAudioDevices();
}

export function getSelectedAudioDevices(){
  return readSelection();
}

export async function refreshAudioDevices(){
  if (!supportsMediaDevices()) {
    console.warn('Audio device enumeration is not supported by this browser.');
    renderDevices();
    return cachedDevices;
  }

  await requestMicrophonePermission();

  const devices = await navigator.mediaDevices.enumerateDevices();
  cachedDevices = {
    inputs: devices.filter((device) => device.kind === 'audioinput'),
    outputs: devices.filter((device) => device.kind === 'audiooutput')
  };

  renderDevices();
  await applyAudioDevicesToMedia();
  return cachedDevices;
}

export async function applyAudioDevicesToMedia(){
  const selection = readSelection();
  await Promise.all([
    applySink(getElement('remoteAudio'), selection.outputDeviceId),
    applySink(ensureRingtoneAudio(), selection.ringtoneDeviceId)
  ]);
}
