const STORAGE_KEY = 'cloudsip_phone_presence';

export const PRESENCE_STATUSES = [
  { value: 'Available', label: 'Available', dotClass: 'presence-available' },
  { value: 'Away', label: 'Away', dotClass: 'presence-away' },
  { value: 'Busy', label: 'Busy', dotClass: 'presence-busy' },
  { value: 'DND', label: 'DND', dotClass: 'presence-dnd' },
  { value: 'Offline', label: 'Offline', dotClass: 'presence-offline' }
];

const ON_CALL_STATUS = { value: 'On Call', label: 'On Call', dotClass: 'presence-on-call', iconClass: 'ti-phone-call' };
const validStatuses = new Set(PRESENCE_STATUSES.map((status) => status.value));

let userPresence = 'Available';
let hasActiveCall = false;

function readStoredPresence(){
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    return validStatuses.has(stored) ? stored : 'Available';
  } catch (error) {
    console.warn('Unable to read agent presence from localStorage', error);
    return 'Available';
  }
}

function savePresence(status){
  try {
    window.localStorage?.setItem(STORAGE_KEY, status);
  } catch (error) {
    console.warn('Unable to save agent presence to localStorage', error);
  }
}

function getPresenceDefinition(status){
  return status === ON_CALL_STATUS.value
    ? ON_CALL_STATUS
    : PRESENCE_STATUSES.find((item) => item.value === status) || PRESENCE_STATUSES[0];
}

function getDisplayedPresence(){
  return hasActiveCall ? ON_CALL_STATUS.value : userPresence;
}

function setDotState(dot, definition){
  if (!dot) return;
  dot.classList.remove('presence-available', 'presence-away', 'presence-busy', 'presence-dnd', 'presence-offline', 'presence-on-call', 'inbound');
  dot.classList.add(definition.dotClass);
}

export function getUserPresence(){
  return userPresence;
}

export function getDisplayedAgentPresence(){
  return getDisplayedPresence();
}

export function isPresence(status){
  return getDisplayedPresence() === status;
}

export function setUserPresence(status){
  if (!validStatuses.has(status)) return false;

  userPresence = status;
  savePresence(status);
  updatePresenceDisplay();
  window.dispatchEvent(new CustomEvent('presence:changed', {
    detail: { userPresence, displayedPresence: getDisplayedPresence() }
  }));
  return true;
}

export function setPresenceActiveCall(active){
  const next = Boolean(active);
  if (hasActiveCall === next) return;
  hasActiveCall = next;
  updatePresenceDisplay();
}


export function updatePresenceDisplay(){
  const displayed = getDisplayedPresence();
  const definition = getPresenceDefinition(displayed);
  const agentState = document.getElementById('agentState');
  const footerDot = document.getElementById('statusDot');
  const footerIcon = document.getElementById('statusIcon');

  if (agentState) agentState.textContent = definition.label;
  setDotState(footerDot, definition);

  if (footerIcon) {
    footerIcon.className = `ti ${definition.iconClass || 'ti-circle-filled'}`;
  }
}

function renderPicker(){
  const picker = document.getElementById('presencePicker');
  if (!picker) return;

  picker.innerHTML = PRESENCE_STATUSES.map((status) => `
    <button class="presence-option" type="button" data-presence="${status.value}">
      <span class="presence-option-dot ${status.dotClass}"></span>
      <span>${status.label}</span>
    </button>
  `).join('');
}

function closePicker(){
  document.getElementById('presencePicker')?.classList.remove('open');
  document.getElementById('agentStatusButton')?.setAttribute('aria-expanded', 'false');
}

function togglePicker(){
  if (hasActiveCall) return;
  const picker = document.getElementById('presencePicker');
  const button = document.getElementById('agentStatusButton');
  if (!picker || !button) return;
  const open = !picker.classList.contains('open');
  picker.classList.toggle('open', open);
  button.setAttribute('aria-expanded', String(open));
}

export function initPresence(){
  userPresence = readStoredPresence();
  renderPicker();
  updatePresenceDisplay();

  document.getElementById('agentStatusButton')?.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePicker();
  });

  document.getElementById('presencePicker')?.addEventListener('click', (event) => {
    const option = event.target.closest('[data-presence]');
    if (!option) return;
    setUserPresence(option.dataset.presence);
    closePicker();
  });

  document.addEventListener('click', closePicker);
}
