import { clearLocalData, getSettings, resetSettings, saveSettings } from './settings-store.js';
import { renderLogs } from './call-logs.js';
import { showSuccess, showWarning } from './toast.js';
import { setTheme } from './theme-manager.js';
import { clearRecordingBlobs } from './recording-db.js';
import { deleteSipProfile, getActiveSipProfileId, getSipProfiles, loadSipProfile, saveSipProfile } from './sip-profile-store.js';
import { downloadConfiguration, parseConfigurationImport } from './configuration-transfer.js';

const fields = {
  companyWebsite: 'settingsCompanyWebsite',
  extension: 'settingsExtension',
  sipDomain: 'settingsSipDomain',
  websocketUrl: 'settingsWebsocketUrl',
  sipUri: 'settingsSipUri',
  displayName: 'settingsDisplayName',
  password: 'settingsPassword',
  sessionTimers: 'settingsSessionTimers',
  rememberPassword: 'settingsRememberPassword',
  autoAnswer: 'settingsAutoAnswer',
  autoRecordCalls: 'settingsAutoRecordCalls',
  autoHoldOnSwitch: 'settingsAutoHoldOnSwitch',
  transferMode: 'settingsTransferMode',
  callWaiting: 'settingsCallWaiting',
  dialPlanRules: 'settingsDialPlanRules',
  ringtoneStyle: 'settingsRingtoneStyle',
  headsetControls: 'settingsHeadsetControls',
  sipMessageEnabled: 'settingsSipMessageEnabled',
  blfEnabled: 'settingsBlfEnabled',
  theme: 'settingsTheme'
};

function getElement(id){
  return document.getElementById(id);
}

function setFieldValue(id, value){
  const element = getElement(id);
  if (!element) return;

  if (element.type === 'checkbox') {
    element.checked = Boolean(value);
  } else {
    element.value = value ?? '';
  }
}

function getFieldValue(id){
  const element = getElement(id);
  if (!element) return '';
  if (element.type === 'checkbox') return element.checked;
  if (element.type === 'password') return element.value;
  return element.value.trim();
}

function buildSipUri(extension, sipDomain, sipUri, previousSettings){
  if (!extension || !sipDomain) return sipUri || '';

  const previousGeneratedUri = `sip:${previousSettings.extension}@${previousSettings.sipDomain}`;
  if (!sipUri || sipUri === previousGeneratedUri) {
    return `sip:${extension}@${sipDomain}`;
  }

  return sipUri;
}

function normalizeQuickHost(value){
  return String(value || '').trim().replace(/^wss?:\/\//i, '').split('/')[0];
}

function renderSettingsForm(settings = getSettings()){
  Object.entries(fields).forEach(([key, id]) => setFieldValue(id, settings[key]));
  const iceServers = Array.isArray(settings.iceServers) ? settings.iceServers : [];
  const stunUrls = iceServers.flatMap((server) => server.urls || []).filter((url) => String(url).startsWith('stun:'));
  const turn = iceServers.find((server) => (server.urls || []).some((url) => /^turns?:/.test(url))) || {};
  setFieldValue('settingsStunUrls', stunUrls.join('\n'));
  setFieldValue('settingsTurnUrls', Array.isArray(turn.urls) ? turn.urls.filter((url) => /^turns?:/.test(url)).join('\n') : '');
  setFieldValue('settingsTurnUsername', turn.username || '');
  setFieldValue('settingsTurnCredential', turn.credential || '');
  setFieldValue('quickPbxHost', settings.sipDomain);
  setFieldValue('quickExtension', settings.extension);
  setFieldValue('quickDisplayName', settings.displayName);
  setFieldValue('quickPassword', settings.password);
}

function collectSettings(){
  const current = getSettings();
  const quickMode = getFieldValue('settingsSetupMode') === 'quick';
  const extension = quickMode ? getFieldValue('quickExtension') : getFieldValue(fields.extension);
  const quickHost = normalizeQuickHost(getFieldValue('quickPbxHost'));
  const sipDomain = quickMode ? quickHost.replace(/:\d+$/, '') : getFieldValue(fields.sipDomain);
  const websocketUrl = quickMode && quickHost
    ? `wss://${quickHost}${/:\d+$/.test(quickHost) ? '' : ':8089'}/ws`
    : getFieldValue(fields.websocketUrl);
  const password = quickMode ? getFieldValue('quickPassword') : getFieldValue(fields.password);
  const displayName = quickMode ? getFieldValue('quickDisplayName') : getFieldValue(fields.displayName);
  const sipUri = quickMode ? `sip:${extension}@${sipDomain}` : buildSipUri(extension, sipDomain, getFieldValue(fields.sipUri), current);
  const stunUrls = getFieldValue('settingsStunUrls').split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);
  const turnUrls = getFieldValue('settingsTurnUrls').split(/[\n,]+/).map((url) => url.trim()).filter(Boolean);
  const iceServers = [];
  if (stunUrls.length) iceServers.push({ urls: stunUrls });
  if (turnUrls.length) iceServers.push({
    urls: turnUrls,
    username: getFieldValue('settingsTurnUsername'),
    credential: getFieldValue('settingsTurnCredential')
  });

  return {
    ...current,
    companyWebsite: getFieldValue(fields.companyWebsite),
    extension,
    sipDomain,
    websocketUrl,
    sipUri,
    displayName: displayName || extension,
    password,
    iceServers,
    sessionTimers: getFieldValue(fields.sessionTimers),
    rememberPassword: getFieldValue(fields.rememberPassword),
    autoAnswer: getFieldValue(fields.autoAnswer),
    autoRecordCalls: getFieldValue(fields.autoRecordCalls),
    autoHoldOnSwitch: getFieldValue(fields.autoHoldOnSwitch),
    transferMode: getFieldValue(fields.transferMode),
    callWaiting: getFieldValue(fields.callWaiting),
    dialPlanRules: getFieldValue(fields.dialPlanRules),
    ringtoneStyle: getFieldValue(fields.ringtoneStyle),
    headsetControls: getFieldValue(fields.headsetControls),
    sipMessageEnabled: getFieldValue(fields.sipMessageEnabled),
    blfEnabled: getFieldValue(fields.blfEnabled),
    theme: getFieldValue(fields.theme)
  };
}

function renderSetupMode(){
  const quickMode = getFieldValue('settingsSetupMode') === 'quick';
  getElement('quickSetupFields').hidden = !quickMode;
  getElement('advancedSetupFields').hidden = quickMode;
}

function renderProfiles(selectedId = getActiveSipProfileId()){
  const select = getElement('settingsProfileSelect');
  if (!select) return;
  const profiles = getSipProfiles();
  select.innerHTML = '<option value="">Current settings</option>';
  profiles.forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    select.appendChild(option);
  });
  select.value = profiles.some((profile) => profile.id === selectedId) ? selectedId : '';
}

function bindConfigurationTools(){
  getElement('settingsSetupMode')?.addEventListener('change', renderSetupMode);
  getElement('settingsProfileSelect')?.addEventListener('change', (event) => {
    const profile = getSipProfiles().find((item) => item.id === event.target.value);
    setFieldValue('settingsProfileName', profile?.name || '');
  });
  getElement('saveSipProfile')?.addEventListener('click', () => {
    try {
      const selectedId = getFieldValue('settingsProfileSelect');
      const profile = saveSipProfile(getFieldValue('settingsProfileName'), collectSettings(), selectedId);
      renderProfiles(profile.id);
      setFieldValue('settingsProfileName', profile.name);
      showSuccess('SIP profile saved');
    } catch (error) {
      showWarning(error.message);
    }
  });
  getElement('loadSipProfile')?.addEventListener('click', () => {
    const profile = loadSipProfile(getFieldValue('settingsProfileSelect'));
    if (!profile) return showWarning('Select a SIP profile');
    const settings = saveSettings(profile.settings);
    renderSettingsForm(settings);
    setFieldValue('settingsProfileName', profile.name);
    showSuccess('SIP profile loaded');
  });
  getElement('deleteSipProfile')?.addEventListener('click', () => {
    const profileId = getFieldValue('settingsProfileSelect');
    if (!profileId) return showWarning('Select a SIP profile');
    deleteSipProfile(profileId);
    renderProfiles();
    setFieldValue('settingsProfileName', '');
    showSuccess('SIP profile deleted');
  });
  getElement('exportConfiguration')?.addEventListener('click', () => {
    downloadConfiguration(collectSettings(), getFieldValue('settingsExportPassword'));
  });
  getElement('importConfiguration')?.addEventListener('click', () => getElement('configurationFile')?.click());
  getElement('configurationFile')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const settings = saveSettings(parseConfigurationImport(await file.text()));
      renderSettingsForm(settings);
      showSuccess('Configuration imported');
    } catch (error) {
      showWarning(error.message);
    } finally {
      event.target.value = '';
    }
  });
}

function initSettingsAccordions(){
  const key = 'teliops_phone_settings_open_section';
  const headers = document.querySelectorAll('[data-settings-accordion]');
  if (!headers.length) return;

  function openSection(name){
    document.querySelectorAll('.settings-accordion').forEach((section) => {
      section.classList.toggle('open', section.dataset.settingsSection === name);
    });
    localStorage.setItem(key, name);
  }

  headers.forEach((header) => {
    header.addEventListener('click', () => {
      const name = header.dataset.settingsAccordion;
      const section = header.closest('.settings-accordion');
      const isOpen = section?.classList.contains('open');

      if (isOpen) {
        section.classList.remove('open');
        localStorage.removeItem(key);
      } else {
        openSection(name);
      }
    });
  });

  openSection(localStorage.getItem(key) || 'audio');
}

function bindSettingsButtons(){
  getElement(fields.theme)?.addEventListener('change', (event) => {
    setTheme(event.target.value);
  });

  getElement('saveSettings')?.addEventListener('click', () => {
    const settings = saveSettings(collectSettings());
    renderSettingsForm(settings);
    showSuccess('Settings saved and applied');
  });

  getElement('resetSettings')?.addEventListener('click', () => {
    const settings = resetSettings();
    renderSettingsForm(settings);
    setTheme(settings.theme, { toast: false });
    showSuccess('Settings reset');
  });

  getElement('clearCallLogs')?.addEventListener('click', async () => {
    const confirmed = typeof globalThis.confirm !== 'function'
      || globalThis.confirm('Clear call logs and local recording files?');
    if (!confirmed) return;

    clearLocalData();
    try {
      await clearRecordingBlobs();
      showSuccess('Call logs and recordings cleared');
    } catch (error) {
      console.warn('Unable to clear IndexedDB recordings', error);
      showWarning('Call logs cleared, but recordings could not be cleared');
    }
    renderLogs();
  });
}

export function initSettings(){
  renderSettingsForm();
  renderSetupMode();
  renderProfiles();
  initSettingsAccordions();
  bindSettingsButtons();
  bindConfigurationTools();
}
