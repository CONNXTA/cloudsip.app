import { getSettings, updateSetting } from './settings-store.js';
import { showSuccess } from './toast.js';

const THEMES = new Set(['light', 'dark']);
const DEFAULT_THEME = 'light';

function normalizeTheme(theme){
  return THEMES.has(theme) ? theme : DEFAULT_THEME;
}

function updateThemeSelect(theme){
  const select = document.getElementById('settingsTheme');
  if (select) select.value = theme;
}

function applyTheme(theme){
  const nextTheme = normalizeTheme(theme);
  document.documentElement.setAttribute('data-theme', nextTheme);
  updateThemeSelect(nextTheme);
  return nextTheme;
}

export function getTheme(){
  return normalizeTheme(getSettings().theme);
}

export function setTheme(theme, options = {}){
  const nextTheme = applyTheme(theme);
  updateSetting('theme', nextTheme);

  if (options.toast !== false) {
    showSuccess('Theme updated');
  }

  return nextTheme;
}

export function toggleTheme(){
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme(){
  applyTheme(getTheme());

  window.addEventListener('settings:changed', (event) => {
    applyTheme(event.detail?.settings?.theme || getTheme());
  });
}
