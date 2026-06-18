const TOAST_TYPES = new Set(['success', 'error', 'warning', 'info']);

function getToastContainer(){
  let container = document.getElementById('toastContainer');

  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  return container;
}

export function showToast(message, type = 'info', timeout = 3500){
  const text = String(message || '').trim();
  if (!text) return null;

  const toastType = TOAST_TYPES.has(type) ? type : 'info';
  const toast = document.createElement('div');
  toast.className = `toast ${toastType}`;
  toast.setAttribute('role', toastType === 'error' ? 'alert' : 'status');
  toast.textContent = text;

  getToastContainer().appendChild(toast);

  if (timeout > 0) {
    window.setTimeout(() => {
      toast.remove();
    }, timeout);
  }

  return toast;
}

export function showSuccess(message){
  return showToast(message, 'success');
}

export function showError(message){
  return showToast(message, 'error');
}

export function showWarning(message){
  return showToast(message, 'warning');
}

export function showInfo(message){
  return showToast(message, 'info');
}
