import { state } from './state.js';
import { updateNumberDisplay } from './ui.js';
import { startCall } from './call-manager.js';
import { playDtmfTone } from './sound-manager.js';
import { applyDialPlan, lastDialedNumber, recentDialedNumbers } from './telephony-preferences.js';

function isTypingTarget(target) {
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

function appendDialKey(key) {
  state.typed += key;
  updateNumberDisplay(state);
}

function isToneKey(key) {
  return /^[0-9*#]$/.test(key);
}

function handleDialKey(key) {
  appendDialKey(key);
  if (isToneKey(key)) playDtmfTone(key);
}

function handleStartCall() {
  if (!state.typed) return;
  state.typed = applyDialPlan(state.typed);
  updateNumberDisplay(state);
  startCall(state.typed);
}

function renderRecentNumbers(){
  const container = document.getElementById('recentDialNumbers');
  if (!container) return;
  container.innerHTML = recentDialedNumbers().map((number) => `<button class="recent-number" type="button" data-recent-number="${number}">${number}</button>`).join('');
}

export function updateDialModeUI() {
  updateNumberDisplay(state);
}

export function initDialpad(){
  document.addEventListener('click', (e) => {
    const key = e.target.closest('[data-key]');
    const recent = e.target.closest('[data-recent-number]');
    if (recent) {
      state.typed = recent.dataset.recentNumber;
      updateNumberDisplay(state);
      return;
    }
    if (!key) return;

    handleDialKey(key.dataset.key);
  });

  document.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target)) return;

    const key = event.key;

    if (/^[0-9]$/.test(key) || key === '*' || key === '#' || key === '+') {
      event.preventDefault();
      handleDialKey(key);
      return;
    }

    if (key === 'Backspace') {
      event.preventDefault();
      state.typed = state.typed.slice(0, -1);
      updateNumberDisplay(state);
      return;
    }

    if (key === 'Delete' || key === 'Escape') {
      event.preventDefault();
      state.typed = '';
      updateNumberDisplay(state);
      return;
    }

    if (key === 'Enter') {
      event.preventDefault();
      handleStartCall();
    }
  });

  document.addEventListener('viewchange', (event) => {
    if (event.detail?.view === 'dial') updateDialModeUI();
  });

  document.getElementById('backspaceBtn').addEventListener('click', () => {
    state.typed = state.typed.slice(0, -1);
    updateNumberDisplay(state);
  });

  document.getElementById('clearBtn').addEventListener('click', () => {
    state.typed = '';
    updateNumberDisplay(state);
  });

  document.getElementById('startCall').addEventListener('click', handleStartCall);
  document.getElementById('redialBtn')?.addEventListener('click', () => {
    const number = lastDialedNumber();
    if (!number) return;
    state.typed = number;
    updateNumberDisplay(state);
    startCall(number);
  });
  window.addEventListener('calllogs:changed', renderRecentNumbers);
  renderRecentNumbers();
  updateDialModeUI();
}
