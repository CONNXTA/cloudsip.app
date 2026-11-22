import { getSettings } from './settings-store.js';
import { sendSipMessage } from './sip-client.js';
import { showWarning } from './toast.js';

function renderModuleState(settings = getSettings()){
  const panel = document.getElementById('sipMessagePanel');
  if (panel) panel.hidden = !settings.sipMessageEnabled;
  document.documentElement.classList.toggle('blf-module-enabled', Boolean(settings.blfEnabled));
}

function appendIncomingMessage(message){
  const inbox = document.getElementById('sipMessageInbox');
  if (!inbox || !getSettings().sipMessageEnabled) return;
  const item = document.createElement('div');
  const sender = document.createElement('strong');
  const body = document.createElement('span');
  sender.textContent = message.from || 'Unknown';
  body.textContent = message.body || '';
  item.append(sender, body);
  inbox.prepend(item);
}

export function initOptionalSipModules(){
  renderModuleState();
  window.addEventListener('settings:changed', (event) => renderModuleState(event.detail?.settings));
  window.addEventListener('sip:message', (event) => appendIncomingMessage(event.detail || {}));
  document.getElementById('sendSipMessage')?.addEventListener('click', () => {
    if (!getSettings().sipMessageEnabled) return;
    const target = document.getElementById('sipMessageTarget')?.value || '';
    const body = document.getElementById('sipMessageBody')?.value || '';
    if (!sendSipMessage(target, body)) showWarning('Enter a target and message while SIP is registered');
  });
}

