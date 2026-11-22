import { showView } from './ui.js';
import { answerIncomingCall, applyCallBehaviorSettings, handleCallAccepted, handleCallEnded, handleCallFailed, handleCallHold, handleCallMuted, handleCallUnhold, handleCallUnmuted, handleIncomingCall, hangupActiveCall, rejectIncomingCall, startTimers, toggleHoldCall, toggleMuteCall } from './call-manager.js';
import { initDialpad } from './dialpad.js';
import * as contactsModule from './contacts.js?v=20260617';
import { renderLogs } from './call-logs.js';
import { initLineManager } from './line-manager.js';
import { initSipClient, isSipRegistered, registerSip, unregisterSip } from './sip-client.js';
import { initAudioDevices } from './audio-devices.js';
import { initSoundManager } from './sound-manager.js';
import { getSettings } from './settings-store.js';
import { initSettings } from './settings-ui.js';
import { initWebRtcDiagnostics } from './webrtc-diagnostics.js';
import { initPresence } from './presence.js';
import { initKeyboardShortcuts } from './keyboard-shortcuts.js';
import { initTheme } from './theme-manager.js';
import { blockSipForInvalidCompanyWebsite, normalizeCompanyWebsiteUrl } from './branding-check.js';
import { initHeadsetControls } from './headset-controls.js';
import { initOptionalSipModules } from './optional-sip-modules.js';

function buildSipConfig(settings){
  return {
    websocketUrl: settings.websocketUrl,
    sipUri: settings.sipUri || `sip:${settings.extension}@${settings.sipDomain}`,
    password: settings.password,
    iceServers: settings.iceServers,
    sessionTimers: settings.sessionTimers,
    reconnectMinSeconds: 2,
    reconnectMaxSeconds: 30,
    displayName: settings.displayName || settings.extension,
    extension: settings.extension,
    autoAnswer: settings.autoAnswer,
    autoHoldOnSwitch: settings.autoHoldOnSwitch
  };
}

function sipConfigsMatch(firstConfig, secondConfig){
  if (!firstConfig || !secondConfig) return false;

  return firstConfig.websocketUrl === secondConfig.websocketUrl
    && firstConfig.sipUri === secondConfig.sipUri
    && firstConfig.password === secondConfig.password
    && firstConfig.displayName === secondConfig.displayName
    && firstConfig.extension === secondConfig.extension
    && firstConfig.sessionTimers === secondConfig.sessionTimers
    && JSON.stringify(firstConfig.iceServers || []) === JSON.stringify(secondConfig.iceServers || []);
}

function updateHeaderFromSettings(settings){
  const displayNameText = document.getElementById('displayNameText');
  if (displayNameText) {
    displayNameText.textContent = settings.displayName || settings.extension || 'cloudSIP.app';
  }

  const companyWebsite = document.getElementById('companyWebsiteLink');
  if (companyWebsite) {
    const website = settings.companyWebsite || 'www.connxta.com';
    companyWebsite.textContent = website;
    companyWebsite.href = normalizeCompanyWebsiteUrl(website);
  }
}

function updateTodayDate(){
  const el = document.getElementById('todayDate');
  if (!el) return;

  const now = new Date();
  el.textContent = now.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function initNavigation(){
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    showView(nav.dataset.nav);
  });
}

function initCallControls(){
  document.getElementById('hangup').addEventListener('click', hangupActiveCall);
  document.getElementById('holdBtn').addEventListener('click', toggleHoldCall);
  document.getElementById('muteBtn').addEventListener('click', toggleMuteCall);
  document.getElementById('acceptIncoming').addEventListener('click', answerIncomingCall);
  document.getElementById('rejectIncoming').addEventListener('click', rejectIncomingCall);
  document.getElementById('backToLogs').addEventListener('click', () => showView('logs'));
}

function initPresenceSipControls(){
  window.addEventListener('presence:changed', (event) => {
    const presence = event.detail?.userPresence;

    if (presence === 'Offline') {
      unregisterSip();
      return;
    }

    if (['Available', 'Away', 'Busy', 'DND'].includes(presence) && !isSipRegistered()) {
      registerSip();
    }
  });
}

function getSipHandlers(){
  return {
    onIncomingCall: handleIncomingCall,
    onCallAccepted: handleCallAccepted,
    onCallEnded: handleCallEnded,
    onCallFailed: handleCallFailed,
    muted: handleCallMuted,
    unmuted: handleCallUnmuted,
    hold: handleCallHold,
    unhold: handleCallUnhold
  };
}


async function boot(){
  initTheme();
  initNavigation();
  initDialpad();
  initCallControls();
  initLineManager();
  initSettings();
  initWebRtcDiagnostics();
  initPresence();
  initPresenceSipControls();
  initKeyboardShortcuts();
  initHeadsetControls();
  initOptionalSipModules();
  const settings = getSettings();
  updateTodayDate();
  updateHeaderFromSettings(settings);
  let activeSipConfig = buildSipConfig(settings);
  let activeCompanyWebsite = settings.companyWebsite;
  window.addEventListener('settings:changed', async (event) => {
    const nextSettings = event.detail?.settings || getSettings();
    updateHeaderFromSettings(nextSettings);
    applyCallBehaviorSettings(nextSettings);

    const nextSipConfig = buildSipConfig(nextSettings);
    const sipConfigChanged = !sipConfigsMatch(activeSipConfig, nextSipConfig);
    const companyWebsiteChanged = activeCompanyWebsite !== nextSettings.companyWebsite;
    if (!sipConfigChanged && !companyWebsiteChanged) return;

    activeSipConfig = nextSipConfig;
    activeCompanyWebsite = nextSettings.companyWebsite;
    if (blockSipForInvalidCompanyWebsite(nextSettings.companyWebsite, { message: 'SIP Failed. Browser not supported.' })) {
      unregisterSip();
      return;
    }

    await initSipClient(nextSipConfig, getSipHandlers());
  });
  await initAudioDevices();
  initSoundManager();

  if (blockSipForInvalidCompanyWebsite(settings.companyWebsite, { message: 'SIP Failed. Browser not supported.' })) {
    contactsModule.initContacts();
    renderLogs();
    showView('dial');
    startTimers();
    return;
  }

  await initSipClient(activeSipConfig, getSipHandlers());

  contactsModule.initContacts();
  renderLogs();

  showView('dial');
  startTimers();
}

boot();
