import { startCall } from './call-manager.js';
import { createContact, deleteContact, getContacts, searchContacts, updateContact } from './contact-store.js';

let activeContactId = null;
let currentQuery = '';

function escapeHtml(value) {
  return String(value).replace(/[&<>"]|'/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function contactCardTemplate(contact){
  const company = contact.company ? `<span class="contact-company">${escapeHtml(contact.company)}</span>` : '';
  const favorite = contact.favorite ? '<span class="contact-favorite" title="Favorite"><i class="ti ti-star-filled" aria-hidden="true"></i></span>' : '';

  return `
    <div class="list-item contact-card" data-contact-id="${escapeHtml(contact.id)}">
      <span class="avatar contact-avatar" aria-hidden="true"><i class="ti ti-user"></i></span>
      <span class="contact-details">
        <strong>${escapeHtml(contact.name)} ${favorite}</strong>
        <span class="contact-number">${escapeHtml(contact.number)}</span>
        ${company}
      </span>
      <span class="contact-actions">
        <button class="contact-icon-btn contact-call-btn" type="button" data-contact-call="${escapeHtml(contact.number)}" aria-label="Call ${escapeHtml(contact.name)}">
          <i class="ti ti-phone" aria-hidden="true"></i>
        </button>
        <button class="contact-icon-btn contact-edit-btn" type="button" data-contact-edit="${escapeHtml(contact.id)}" aria-label="Edit ${escapeHtml(contact.name)}">
          <i class="ti ti-pencil" aria-hidden="true"></i>
        </button>
      </span>
    </div>
  `;
}

function getVisibleContacts() {
  return currentQuery ? searchContacts(currentQuery) : getContacts();
}

function setFormContact(contact = null) {
  activeContactId = contact?.id || null;
  document.getElementById('contactFormTitle').textContent = contact ? 'Edit Contact' : 'Add Contact';
  document.getElementById('contactName').value = contact?.name || '';
  document.getElementById('contactNumber').value = contact?.number || '';
  document.getElementById('contactCompany').value = contact?.company || '';
  document.getElementById('contactFavorite').checked = Boolean(contact?.favorite);
  document.getElementById('deleteContactBtn').hidden = !contact;
}

function openContactSheet(contact = null) {
  setFormContact(contact);
  document.getElementById('contactSheetBackdrop').classList.add('open');
  document.getElementById('contactSheet').classList.add('open');
  setTimeout(() => document.getElementById('contactName')?.focus(), 50);
}

function closeContactSheet() {
  document.getElementById('contactSheetBackdrop').classList.remove('open');
  document.getElementById('contactSheet').classList.remove('open');
}

function readFormPayload() {
  return {
    name: document.getElementById('contactName').value,
    number: document.getElementById('contactNumber').value,
    company: document.getElementById('contactCompany').value,
    favorite: document.getElementById('contactFavorite').checked
  };
}

function handleSave(event) {
  event.preventDefault();
  const payload = readFormPayload();

  try {
    if (activeContactId) updateContact(activeContactId, payload);
    else createContact(payload);
    closeContactSheet();
    renderContacts();
  } catch (error) {
    alert(error.message);
  }
}

function handleDelete() {
  if (!activeContactId) return;
  if (!confirm('Delete this contact?')) return;
  deleteContact(activeContactId);
  closeContactSheet();
  renderContacts();
}

export function renderContacts(){
  const contactsEl = document.getElementById('contacts');
  const contacts = getVisibleContacts();

  contactsEl.innerHTML = contacts.length
    ? contacts.map(contactCardTemplate).join('')
    : '<div class="empty-state">No contacts found.</div>';
}

export function initContacts(){
  document.getElementById('addContactBtn').addEventListener('click', () => openContactSheet());
  document.getElementById('contactSearch').addEventListener('input', (event) => {
    currentQuery = event.target.value;
    renderContacts();
  });

  document.getElementById('contacts').addEventListener('click', (event) => {
    const callBtn = event.target.closest('[data-contact-call]');
    if (callBtn) {
      startCall(callBtn.dataset.contactCall);
      return;
    }

    const editBtn = event.target.closest('[data-contact-edit]');
    if (editBtn) {
      const contact = getContacts().find((item) => item.id === editBtn.dataset.contactEdit);
      if (contact) openContactSheet(contact);
    }
  });

  document.getElementById('contactForm').addEventListener('submit', handleSave);
  document.getElementById('deleteContactBtn').addEventListener('click', handleDelete);
  document.getElementById('closeContactSheet').addEventListener('click', closeContactSheet);
  document.getElementById('cancelContactForm').addEventListener('click', closeContactSheet);
  document.getElementById('contactSheetBackdrop').addEventListener('click', closeContactSheet);

  renderContacts();
}
