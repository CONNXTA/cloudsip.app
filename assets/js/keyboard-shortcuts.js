import { state } from './state.js';
import { closeSheet, openSheet, showView } from './ui.js';
import {
  answerIncomingCall,
  hangupActiveCall,
  rejectIncomingCall,
  startCall,
  toggleDtmfPanel,
  toggleHold,
  toggleMute,
  toggleRecording,
  toggleTransferPanel
} from './call-manager.js';
import { getActiveLine, switchToLine } from './line-manager.js';

function isTypingTarget(target) {
  return Boolean(
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.tagName === 'SELECT' ||
    target?.isContentEditable ||
    target?.closest?.('[contenteditable="true"]')
  );
}

function isViewActive(name) {
  return document.getElementById(`view-${name}`)?.classList.contains('active') || false;
}

function isIncomingVisible() {
  return document.getElementById('incoming')?.classList.contains('show') || false;
}

function hasActiveCall() {
  const line = getActiveLine();
  return Boolean(line && ['active', 'calling', 'hold'].includes(line.state));
}

function focusDialpadDisplay() {
  const display = document.getElementById('numberDisplay');
  display?.setAttribute('tabindex', '-1');
  display?.focus({ preventScroll: true });
}

function closeOpenPanel() {
  const stackSheet = document.getElementById('stackSheet');
  const contactSheet = document.getElementById('contactSheet');
  const transferPanel = document.getElementById('transferPanel');
  const dtmfPanel = document.getElementById('dtmfPanel');
  const presencePicker = document.getElementById('presencePicker');

  if (stackSheet?.classList.contains('open')) {
    closeSheet();
    return true;
  }

  if (contactSheet?.classList.contains('open')) {
    document.getElementById('contactSheetBackdrop')?.classList.remove('open');
    contactSheet.classList.remove('open');
    return true;
  }

  if (transferPanel?.classList.contains('show')) {
    toggleTransferPanel();
    return true;
  }

  if (dtmfPanel?.classList.contains('show')) {
    toggleDtmfPanel();
    return true;
  }

  if (presencePicker?.classList.contains('open')) {
    presencePicker.classList.remove('open');
    document.getElementById('agentStatusButton')?.setAttribute('aria-expanded', 'false');
    return true;
  }

  return false;
}

function toggleCallStack() {
  if (document.getElementById('stackSheet')?.classList.contains('open')) {
    closeSheet();
  } else {
    openSheet();
  }
}

function handleGlobalShortcut(event) {
  const key = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;

  if (event.key === 'Enter') {
    if (isIncomingVisible()) {
      event.preventDefault();
      answerIncomingCall();
      return;
    }

    if (isViewActive('dial') && state.typed) {
      event.preventDefault();
      startCall();
    }
    return;
  }

  if (event.key === 'Escape') {
    if (isIncomingVisible()) {
      event.preventDefault();
      rejectIncomingCall();
      return;
    }

    if (closeOpenPanel()) event.preventDefault();
    return;
  }

  if (command && key === 'k' && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    showView('dial');
    focusDialpadDisplay();
    return;
  }

  if (command && key === 'l' && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    showView('logs');
    return;
  }

  if (command && event.key === ',' && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    showView('settings');
    return;
  }

  if (command && key === 's' && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    toggleCallStack();
    return;
  }

  if (event.altKey && !command && !event.shiftKey && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    switchToLine(Number(event.key));
  }
}

function handleActiveCallShortcut(event) {
  if (!hasActiveCall()) return;

  const key = event.key.toLowerCase();
  const command = event.ctrlKey || event.metaKey;
  if (!command || event.altKey) return;

  if (event.shiftKey && key === 'h') {
    event.preventDefault();
    hangupActiveCall();
    return;
  }

  if (event.shiftKey) return;

  const actions = {
    m: toggleMute,
    h: toggleHold,
    t: toggleTransferPanel,
    r: toggleRecording,
    d: toggleDtmfPanel
  };

  const action = actions[key];
  if (!action) return;

  event.preventDefault();
  action();
}

export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (event) => {
    if (isTypingTarget(event.target)) return;

    handleActiveCallShortcut(event);
    if (event.defaultPrevented) return;

    handleGlobalShortcut(event);
  });
}
