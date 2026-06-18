export const $ = (id) => document.getElementById(id);

export function formatTime(sec){
  const m = String(Math.floor(sec / 60)).padStart(2,'0');
  const s = String(sec % 60).padStart(2,'0');
  return `${m}:${s}`;
}

export function showView(name){
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(`view-${name}`).classList.add('active');

  document.querySelectorAll('.nav[data-nav]').forEach(btn => {
    btn.classList.toggle(
      'active',
      btn.dataset.nav === name ||
      (name === 'call' && btn.dataset.nav === 'dial') ||
      (name === 'thread' && btn.dataset.nav === 'logs')
    );
  });

  document.dispatchEvent(new CustomEvent('viewchange', { detail: { view: name } }));
}

export function updateNumberDisplay(state){
  const el = $('numberDisplay');
  el.textContent = state.typed || 'Enter number...';
  el.classList.toggle('has-value', state.typed.length > 0);
}

export function openSheet(){
  $('stackSheet').classList.add('open');
  $('sheetBackdrop').classList.add('open');
}

export function closeSheet(){
  $('stackSheet').classList.remove('open');
  $('sheetBackdrop').classList.remove('open');
}
