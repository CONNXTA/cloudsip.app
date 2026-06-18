const STORAGE_KEY = 'cloudsip_phone_contacts';

function safeParseContacts(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter(isContactLike).map(normalizeContact) : [];
  } catch (_error) {
    return [];
  }
}

function isContactLike(contact) {
  return contact && typeof contact === 'object' && typeof contact.id === 'string';
}

function normalizeContact(contact) {
  return {
    id: String(contact.id),
    name: String(contact.name || '').trim(),
    number: String(contact.number || '').trim(),
    company: String(contact.company || '').trim(),
    favorite: Boolean(contact.favorite),
    createdAt: contact.createdAt || new Date().toISOString(),
    updatedAt: contact.updatedAt || contact.createdAt || new Date().toISOString()
  };
}

function writeContacts(contacts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `contact_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizePayload(payload = {}) {
  return {
    name: String(payload.name || '').trim(),
    number: String(payload.number || '').trim(),
    company: String(payload.company || '').trim(),
    favorite: Boolean(payload.favorite)
  };
}

function sortContacts(contacts) {
  return [...contacts].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export function getContacts() {
  return sortContacts(safeParseContacts(localStorage.getItem(STORAGE_KEY)));
}

export function createContact(payload) {
  const data = sanitizePayload(payload);
  if (!data.name || !data.number) throw new Error('Name and number are required.');

  const now = new Date().toISOString();
  const contact = {
    id: createId(),
    ...data,
    createdAt: now,
    updatedAt: now
  };

  const contacts = [...getContacts(), contact];
  writeContacts(sortContacts(contacts));
  return contact;
}

export function updateContact(id, payload) {
  const data = sanitizePayload(payload);
  if (!data.name || !data.number) throw new Error('Name and number are required.');

  let updatedContact = null;
  const contacts = getContacts().map((contact) => {
    if (contact.id !== id) return contact;
    updatedContact = {
      ...contact,
      ...data,
      updatedAt: new Date().toISOString()
    };
    return updatedContact;
  });

  if (!updatedContact) return null;
  writeContacts(sortContacts(contacts));
  return updatedContact;
}

export function deleteContact(id) {
  const contacts = getContacts();
  const nextContacts = contacts.filter((contact) => contact.id !== id);
  writeContacts(nextContacts);
  return nextContacts.length !== contacts.length;
}

export function searchContacts(query) {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return getContacts();

  return getContacts().filter((contact) => {
    return [contact.name, contact.number, contact.company]
      .some((value) => value.toLowerCase().includes(term));
  });
}

export function toggleFavorite(id) {
  let updatedContact = null;
  const contacts = getContacts().map((contact) => {
    if (contact.id !== id) return contact;
    updatedContact = {
      ...contact,
      favorite: !contact.favorite,
      updatedAt: new Date().toISOString()
    };
    return updatedContact;
  });

  if (!updatedContact) return null;
  writeContacts(sortContacts(contacts));
  return updatedContact;
}
