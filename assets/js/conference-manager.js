import { state } from './state.js';
import { attachRemoteAudio, unholdSession } from './sip-client.js';
import { showSuccess, showWarning } from './toast.js';

let conference = null;

function liveCallLines(){
  return state.lines.filter((line) => line?.session?.connection && ['active', 'hold'].includes(line.state));
}

function audioSender(line){
  return line.session.connection.getSenders?.().find((sender) => sender.track?.kind === 'audio') || null;
}

function remoteAudioTracks(line){
  return (line.session.connection.getReceivers?.() || []).map((receiver) => receiver.track).filter((track) => track?.kind === 'audio');
}

export function isConferenceActive(){
  return Boolean(conference);
}

export async function stopConference(){
  if (!conference) return false;
  const current = conference;
  conference = null;

  await Promise.all(current.connections.map(async ({ sender, originalTrack, destination }) => {
    try { await sender.replaceTrack(originalTrack); } catch (error) { console.warn('Unable to restore conference audio track', error); }
    destination.stream.getTracks().forEach((track) => track.stop());
  }));
  current.remoteDestination.stream.getTracks().forEach((track) => track.stop());
  await current.context.close?.();

  state.lines.forEach((line) => { line.inConference = false; });
  const active = state.lines.find((line) => line.id === state.activeLineId);
  attachRemoteAudio(active?.session || null);
  window.dispatchEvent(new CustomEvent('conference:changed', { detail: { active: false } }));
  showSuccess('Conference ended');
  return true;
}

export async function startConference(){
  const lines = liveCallLines();
  if (lines.length < 2) {
    showWarning('At least two connected lines are required');
    return false;
  }

  if (conference) return true;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) {
    showWarning('Audio conferencing is not supported by this browser');
    return false;
  }

  const context = new AudioContext();
  await context.resume?.();
  const eligibleLines = lines.filter((line) => audioSender(line)?.track);
  if (eligibleLines.length < 2) {
    await context.close?.();
    showWarning('At least two audio lines are required');
    return false;
  }
  const localSources = new Map();
  const remoteSources = new Map();

  eligibleLines.forEach((line) => {
    const sender = audioSender(line);
    if (sender?.track) localSources.set(line.id, context.createMediaStreamSource(new MediaStream([sender.track])));
    remoteAudioTracks(line).forEach((track, index) => remoteSources.set(`${line.id}:${index}`, { lineId: line.id, source: context.createMediaStreamSource(new MediaStream([track])) }));
  });

  const connections = [];
  for (const line of eligibleLines) {
    const sender = audioSender(line);
    if (!sender?.track) continue;
    const destination = context.createMediaStreamDestination();
    localSources.get(line.id)?.connect(destination);
    remoteSources.forEach((entry) => {
      if (entry.lineId !== line.id) entry.source.connect(destination);
    });
    const originalTrack = sender.track;
    await sender.replaceTrack(destination.stream.getAudioTracks()[0]);
    connections.push({ sender, originalTrack, destination });
    if (line.state === 'hold') {
      unholdSession(line.session);
      line.state = 'active';
      line.onHold = false;
    }
    line.inConference = true;
  }

  if (connections.length < 2) {
    await context.close?.();
    showWarning('Conference audio could not be created');
    return false;
  }

  const remoteDestination = context.createMediaStreamDestination();
  remoteSources.forEach((entry) => entry.source.connect(remoteDestination));
  const remoteAudio = document.getElementById('remoteAudio');
  if (remoteAudio) {
    remoteAudio.srcObject = remoteDestination.stream;
    remoteAudio.play().catch((error) => console.warn('Conference audio playback failed', error));
  }

  conference = { context, connections, remoteDestination };
  window.dispatchEvent(new CustomEvent('conference:changed', { detail: { active: true, lineIds: eligibleLines.map((line) => line.id) } }));
  showSuccess(`Conference started with ${eligibleLines.length} lines`);
  return true;
}

export async function toggleConference(){
  return conference ? stopConference() : startConference();
}
