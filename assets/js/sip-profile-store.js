const STORAGE_KEY = 'cloudsip_phone_profiles';
const ACTIVE_PROFILE_KEY = 'cloudsip_phone_active_profile';

function readProfiles(){
  try {
    const profiles = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(profiles) ? profiles : [];
  } catch (error) {
    console.warn('Unable to read SIP profiles', error);
    return [];
  }
}

function writeProfiles(profiles){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function createId(){
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getSipProfiles(){
  return readProfiles();
}

export function getActiveSipProfileId(){
  return localStorage.getItem(ACTIVE_PROFILE_KEY) || '';
}

export function saveSipProfile(name, settings, profileId = ''){
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('Profile name is required');
  const profiles = readProfiles();
  const id = profileId || createId();
  const storedSettings = settings?.rememberPassword === false ? { ...settings, password: '' } : settings;
  const profile = { id, name: trimmedName, settings: storedSettings, updatedAt: new Date().toISOString() };
  const index = profiles.findIndex((item) => item.id === id);
  if (index >= 0) profiles[index] = profile;
  else profiles.push(profile);
  writeProfiles(profiles);
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  return profile;
}

export function loadSipProfile(profileId){
  const profile = readProfiles().find((item) => item.id === profileId);
  if (!profile) return null;
  localStorage.setItem(ACTIVE_PROFILE_KEY, profile.id);
  return profile;
}

export function deleteSipProfile(profileId){
  const profiles = readProfiles().filter((item) => item.id !== profileId);
  writeProfiles(profiles);
  if (getActiveSipProfileId() === profileId) localStorage.removeItem(ACTIVE_PROFILE_KEY);
}
