import { state } from './state.js';
import { answerRingingLine, getActiveLine, hangupActiveLine, toggleActiveMute } from './line-manager.js';
import { getSettings } from './settings-store.js';
import { showSuccess, showWarning } from './toast.js';

let device = null;
let previousHook = false;
let previousMute = false;

function status(text){ const output = document.getElementById('headsetStatus'); if (output) output.textContent = text; }

function handleReport(event){
  if (!getSettings().headsetControls || !event.data?.byteLength) return;
  const value = event.data.getUint8(0);
  const hook = Boolean(value & 1);
  const mute = Boolean(value & 2);

  if (hook && !previousHook) {
    const ringing = state.lines.find((line) => line.state === 'ringing');
    if (ringing) answerRingingLine(ringing.id);
    else if (getActiveLine()) hangupActiveLine();
  }
  if (mute && !previousMute && getActiveLine()) toggleActiveMute();

  previousHook = hook;
  previousMute = mute;
}

export async function connectHeadset(){
  if (!getSettings().headsetControls) {
    showWarning('Enable WebHID headset controls first');
    return false;
  }
  if (!navigator.hid?.requestDevice) {
    status('WebHID not supported');
    showWarning('WebHID is not supported by this browser');
    return false;
  }

  const devices = await navigator.hid.requestDevice({ filters: [{ usagePage: 0x0b }] });
  device = devices[0] || null;
  if (!device) return false;
  if (!device.opened) await device.open();
  device.addEventListener('inputreport', handleReport);
  status(device.productName || 'Connected');
  showSuccess('Headset connected');
  return true;
}

export function initHeadsetControls(){
  document.getElementById('connectHeadset')?.addEventListener('click', () => connectHeadset().catch((error) => {
    console.warn('Unable to connect headset', error);
    status('Connection failed');
  }));
  if (!navigator.hid) status('WebHID not supported');
}

