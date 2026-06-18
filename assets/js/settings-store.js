import { defaultConfig } from './default-config.js';

const STORAGE_KEY = 'cloudsip_phone_settings';
const CALL_LOGS_STORAGE_KEY = 'cloudsip_phone_call_logs';
const RECORDINGS_STORAGE_KEY = 'cloudsip_phone_recordings';

export const defaultSettings = Object.freeze({
  companyWebsite: defaultConfig.companyWebsite,
  extension: defaultConfig.sip.extension,
  sipDomain: defaultConfig.sip.sipDomain,
  websocketUrl: defaultConfig.sip.websocketUrl,
  sipUri: defaultConfig.sip.sipUri,
  displayName: defaultConfig.sip.displayName,
  password: defaultConfig.sip.password,
  autoAnswer: defaultConfig.settings.autoAnswer,
  autoRecordCalls: defaultConfig.settings.autoRecordCalls,
  autoHoldOnSwitch: defaultConfig.settings.autoHoldOnSwitch,
  theme: defaultConfig.settings.theme,
  audioDevices: {
    inputDeviceId: '',
    outputDeviceId: '',
    ringtoneDeviceId: ''
  }
});

function hasLocalStorage(){
  try {
    if (!globalThis.localStorage) return false;
    const testKey = `${STORAGE_KEY}_test`;
    globalThis.localStorage.setItem(testKey, testKey);
    globalThis.localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
}

function normalizeSettings(settings = {}){
  const nextSettings = {
    ...defaultSettings,
    ...settings,
    audioDevices: {
      ...defaultSettings.audioDevices,
      ...(settings.audioDevices || {})
    }
  };

  nextSettings.companyWebsite = String(nextSettings.companyWebsite || '').trim() || defaultSettings.companyWebsite;
  nextSettings.extension = String(nextSettings.extension || '').trim() || defaultSettings.extension;
  nextSettings.sipDomain = String(nextSettings.sipDomain || '').trim() || defaultSettings.sipDomain;
  nextSettings.websocketUrl = String(nextSettings.websocketUrl || '').trim() || defaultSettings.websocketUrl;
  nextSettings.sipUri = String(nextSettings.sipUri || '').trim() || `sip:${nextSettings.extension}@${nextSettings.sipDomain}`;
  nextSettings.displayName = String(nextSettings.displayName || '').trim() || nextSettings.extension;
  nextSettings.password = String(nextSettings.password || '');
  nextSettings.autoAnswer = Boolean(nextSettings.autoAnswer);
  nextSettings.autoRecordCalls = Boolean(nextSettings.autoRecordCalls);
  nextSettings.autoHoldOnSwitch = Boolean(nextSettings.autoHoldOnSwitch);
  nextSettings.theme = nextSettings.theme === 'dark' ? 'dark' : 'light';

  return nextSettings;
}

function readStoredSettings(){
  if (!hasLocalStorage()) return {};

  try {
    const parsed = JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.warn('Unable to parse stored phone settings', error);
    return {};
  }
}

function dispatchSettingsChanged(settings){
  if (typeof globalThis.dispatchEvent !== 'function') return;
  const event = typeof CustomEvent === 'function'
    ? new CustomEvent('settings:changed', { detail: { settings } })
    : new Event('settings:changed');
  globalThis.dispatchEvent(event);
}

export function getSettings(){
  return normalizeSettings({
    ...defaultSettings,
    ...readStoredSettings()
  });
}

export function saveSettings(settings){
  const nextSettings = normalizeSettings(settings);

  if (hasLocalStorage()) {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
  }

  dispatchSettingsChanged(nextSettings);
  return nextSettings;
}

export function updateSetting(key, value){
  return saveSettings({
    ...getSettings(),
    [key]: value
  });
}

export function resetSettings(){
  return saveSettings({ ...defaultSettings });
}

export function clearLocalData(){
  if (hasLocalStorage()) {
    globalThis.localStorage.removeItem(CALL_LOGS_STORAGE_KEY);
    globalThis.localStorage.removeItem(RECORDINGS_STORAGE_KEY);
  }

  if (typeof globalThis.dispatchEvent === 'function') {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('calllogs:changed')
      : new Event('calllogs:changed');
    globalThis.dispatchEvent(event);
  }
}
