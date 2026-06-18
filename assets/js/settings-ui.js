import { clearLocalData, getSettings, resetSettings, saveSettings } from './settings-store.js';
import { renderLogs } from './call-logs.js';
import { showSuccess, showWarning } from './toast.js';
import { setTheme } from './theme-manager.js';
import { clearRecordingBlobs } from './recording-db.js';

const fields = {
  companyWebsite: 'settingsCompanyWebsite',
  extension: 'settingsExtension',
  sipDomain: 'settingsSipDomain',
  websocketUrl: 'settingsWebsocketUrl',
  sipUri: 'settingsSipUri',
  displayName: 'settingsDisplayName',
  password: 'settingsPassword',
  autoAnswer: 'settingsAutoAnswer',
  autoRecordCalls: 'settingsAutoRecordCalls',
  autoHoldOnSwitch: 'settingsAutoHoldOnSwitch',
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

function renderSettingsForm(settings = getSettings()){
  Object.entries(fields).forEach(([key, id]) => setFieldValue(id, settings[key]));
}

function collectSettings(){
  const current = getSettings();
  const extension = getFieldValue(fields.extension);
  const sipDomain = getFieldValue(fields.sipDomain);
  const sipUri = buildSipUri(extension, sipDomain, getFieldValue(fields.sipUri), current);

  return {
    ...current,
    companyWebsite: getFieldValue(fields.companyWebsite),
    extension,
    sipDomain,
    websocketUrl: getFieldValue(fields.websocketUrl),
    sipUri,
    displayName: getFieldValue(fields.displayName) || extension,
    password: getFieldValue(fields.password),
    autoAnswer: getFieldValue(fields.autoAnswer),
    autoRecordCalls: getFieldValue(fields.autoRecordCalls),
    autoHoldOnSwitch: getFieldValue(fields.autoHoldOnSwitch),
    theme: getFieldValue(fields.theme)
  };
}

function initSettingsAccordions(){
  const key = 'cloudsip_phone_settings_open_section';
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
    showSuccess('Settings saved');
    showWarning('SIP credentials apply after reconnect or reload if the phone is already running.');
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
  initSettingsAccordions();
  bindSettingsButtons();
}
