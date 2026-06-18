import { showView, formatTime } from './ui.js';
import { getCallLogs, groupCallLogsByRemoteNumber } from './call-log-store.js';
import { downloadRecording, isRecordingPlaying, playRecording, stopRecordingPlayback, updateRecordingPlaybackButtons } from './recording-manager.js';

function escapeHtml(value){
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function getStatusLabel(call){
  if (call.status === 'answered' || call.status === 'ended') return 'Answered';
  if (call.status === 'busy') return 'Busy';
  if (call.status === 'missed') return 'Missed';
  if (call.status === 'failed') return 'Failed';
  if (call.status === 'calling') return 'Calling';
  if (call.status === 'transferred') return 'Transferred';
  if (call.status === 'ringing') return 'Ringing';
  return 'Unknown';
}

function getStatusTone(call){
  const label = getStatusLabel(call);
  if (label === 'Answered') return 'answered';
  if (label === 'Missed') return 'missed';
  if (label === 'Calling' || label === 'Ringing') return 'answered';
  return 'failed';
}

function getCallIcon(call){
  if (call.status === 'missed' || call.status === 'failed') return 'ti-phone-x';
  return call.direction === 'outbound' ? 'ti-phone-outgoing' : 'ti-phone-incoming';
}

function sumAnsweredDuration(calls){
  return calls.reduce((total, call) => {
    const isAnswered = call.status === 'answered' || call.status === 'ended' || Boolean(call.answeredAt);
    return isAnswered ? total + Number(call.durationSec || 0) : total;
  }, 0);
}

function countTransfers(calls){
  return calls.reduce((total, call) => total + Number(call.transferCount || call.transfers || 0), 0);
}

function countDtmfDigits(calls){
  return calls.reduce((total, call) => {
    if (Array.isArray(call.dtmfDigits)) return total + call.dtmfDigits.length;
    if (typeof call.dtmfDigits === 'string') return total + call.dtmfDigits.length;
    return total + Number(call.dtmfCount || 0);
  }, 0);
}

function getSipFailureText(call){
  return [call.sipCode, call.sipReason].filter(Boolean).join(' ');
}

function getLogStatusLine(call){
  const label = getStatusLabel(call);
  const failureDetail = getThreadFailureDetail(call);
  if ((label === 'Failed' || label === 'Busy') && failureDetail) return `${label}: ${failureDetail}`;
  return label;
}

function getThreadFailureDetail(call){
  const parts = [];
  const sipText = getSipFailureText(call);
  if (sipText) parts.push(sipText);
  if (call.failureCause && !parts.includes(call.failureCause)) parts.push(call.failureCause);
  return parts.join(' · ');
}

export function renderLogs(){
  const groupedLogs = groupCallLogsByRemoteNumber();
  const entries = Object.entries(groupedLogs).map(([number, calls]) => {
    const last = calls[0];
    const totalRecordings = calls.filter(c => c.recordingId || c.recordingUrl).length;
    const totalTransfers = countTransfers(calls);
    const totalDtmfDigits = countDtmfDigits(calls);
    const totalDuration = sumAnsweredDuration(calls);
    const lastStarted = new Date(last.startedAt);
    const tone = getStatusTone(last);

    return `
      <button class="call-log-card" data-thread-number="${escapeHtml(number)}">
        <span class="call-log-top">
          <span class="call-log-avatar">
            <i class="ti ${getCallIcon(last)}" aria-hidden="true"></i>
          </span>

          <span class="call-log-main">
            <strong class="call-log-number">${escapeHtml(number)}</strong>
            <span class="call-log-status ${tone}">${escapeHtml(getLogStatusLine(last))}</span>

            <span class="call-log-meta">
              <span><i class="ti ti-calendar" aria-hidden="true"></i> Last ${formatDay(lastStarted)} ${formatClock(lastStarted)}</span>
              <span><i class="ti ti-phone" aria-hidden="true"></i> ${calls.length} total calls</span>
              <span><i class="ti ti-clock" aria-hidden="true"></i> ${formatDuration(totalDuration)}</span>
            </span>
          </span>

          <span class="call-log-arrow">
            <i class="ti ti-chevron-right" aria-hidden="true"></i>
          </span>
        </span>

        <span class="call-log-footer">
          <span><i class="ti ti-microphone" aria-hidden="true"></i> ${totalRecordings} recordings</span>
          <span><i class="ti ti-transfer" aria-hidden="true"></i> Transfers: ${totalTransfers}</span>
          <span><i class="ti ti-keyboard" aria-hidden="true"></i> ${totalDtmfDigits} DTMF</span>
        </span>
      </button>
    `;
  }).join('');

  document.getElementById('logsList').innerHTML = entries || '<div class="small-pill">No call logs yet</div>';

  document.querySelectorAll('[data-thread-number]').forEach(btn => {
    btn.addEventListener('click', () => openCallThread(btn.dataset.threadNumber));
  });
}

export function openCallThread(number){
  const calls = getCallLogs().filter((call) => call.remoteNumber === number);
  document.getElementById('threadNumber').textContent = number;
  document.getElementById('threadMeta').textContent = `${calls.length} calls total`;

  let lastDay = '';

  document.getElementById('threadTimeline').innerHTML = calls.map((call, idx) => {
    const startedAt = new Date(call.startedAt);
    const callDay = formatDay(startedAt);
    const day = callDay !== lastDay ? `<div class="day-label">${callDay}</div>` : '';
    lastDay = callDay;

    const isFailed = call.status === 'failed';
    const title = call.status === 'missed'
      ? 'Missed call'
      : isFailed
        ? 'Failed call'
        : call.direction === 'outbound'
          ? 'Outgoing call'
          : 'Incoming call';
    const bubbleStateClass = isFailed ? 'failed' : call.status === 'missed' ? 'missed' : call.direction;
    const failureReason = isFailed ? formatFailureReason(call) : '';
    const failure = failureReason ? `<div class="failure-reason">${failureReason}</div>` : '';

    const transferEvents = Array.isArray(call.transferEvents) ? call.transferEvents : [];
    const transfers = transferEvents.map((event) => `
      <div class="transfer-event">
        <div>Transfer → ${escapeHtml(event.target || 'Unknown')}</div>
        <span>Type: ${escapeHtml(formatTransferType(event.type))}</span>
      </div>
    `).join('');

    const recordingKey = call.recordingId || call.recordingUrl || '';
    const rec = recordingKey ? `
      <div class="recording">
        <button class="rec-btn" data-play-recording="${escapeHtml(recordingKey)}">Play</button>
        <button class="rec-btn secondary" data-download-rec="${escapeHtml(recordingKey)}"><i class="ti ti-download" aria-hidden="true"></i> Download</button>
      </div>` : '';

    return `
      ${day}
      <div class="call-bubble ${bubbleStateClass}">
        <div class="bubble-title">${title}</div>
        <div class="bubble-meta"><span>${formatClock(startedAt)}</span><span>${formatStatus(call.status)}</span><span>Duration ${formatDuration(call.durationSec)}</span></div>
        ${failure}
        ${transfers}
        ${rec}
      </div>
    `;
  }).join('');

  bindRecordingActions();
  updateRecordingPlaybackButtons();
  showView('thread');
}

function formatDay(date){
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatClock(date){
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds = 0){
  return seconds ? formatTime(seconds) : '—';
}

function formatStatus(status = ''){
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatTransferType(type = ''){
  if (type === 'consult') return 'Consult';
  return 'Blind';
}

function formatFailureReason(call){
  if (call.sipCode && call.sipReason) return `${call.sipCode} ${call.sipReason}`;
  if (call.failureCause) return call.failureCause;
  return 'Call failed';
}

window.addEventListener('calllogs:changed', () => {
  stopRecordingPlayback();
  renderLogs();
});

function bindRecordingActions(){
  document.querySelectorAll('[data-play-recording]').forEach(btn => {
    btn.addEventListener('click', () => {
      const recordingId = btn.dataset.playRecording;
      if (isRecordingPlaying(recordingId)) stopRecordingPlayback();
      else playRecording(recordingId);
    });
  });

  document.querySelectorAll('[data-download-rec]').forEach(btn => {
    btn.addEventListener('click', () => downloadRecording(btn.dataset.downloadRec));
  });
}
