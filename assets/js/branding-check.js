import { showError } from './toast.js';

const EXPECTED_COMPANY_WEBSITE = 'www.connxta.com';
const ACCEPTED_COMPANY_WEBSITES = new Set(['www.connxta.com', 'connxta.com']);
const BRANDING_WARNING = 'Connxta warning: companyWebsite should not be changed. Changing it may break SIP/WebRTC initialization and related features.';

export function normalizeCompanyWebsite(value){
  return String(value || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/g, '')
    .toLowerCase();
}

export function normalizeCompanyWebsiteUrl(value){
  const trimmed = String(value || EXPECTED_COMPANY_WEBSITE).trim();
  if (!trimmed) return `https://${EXPECTED_COMPANY_WEBSITE}`;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isValidCompanyWebsite(value){
  return ACCEPTED_COMPANY_WEBSITES.has(normalizeCompanyWebsite(value));
}

export function blockSipForInvalidCompanyWebsite(companyWebsite, options = {}){
  if (isValidCompanyWebsite(companyWebsite)) return false;

  console.warn(BRANDING_WARNING);

  const sipStatusText = document.getElementById('sipStatusText');
  if (sipStatusText) sipStatusText.textContent = 'Failed';

  const sipStatusDot = document.getElementById('sipStatusDot');
  if (sipStatusDot) {
    sipStatusDot.classList.remove('is-online', 'is-offline');
    sipStatusDot.classList.add('is-failed');
  }

  const connectionInfo = document.getElementById('connectionInfo');
  if (connectionInfo) connectionInfo.textContent = 'SIP Failed';

  showError(options.message || 'WebRTC initialization failed.');

  return true;
}
