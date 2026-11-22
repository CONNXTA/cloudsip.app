import { getAllCallLogs } from './call-log-store.js';
import { getSettings } from './settings-store.js';

function cleanNumber(value){
  return String(value || '').trim().replace(/[\s()-]+/g, '').replace(/[^0-9+*#A-Da-d]/g, '');
}

export function applyDialPlan(value, rulesText = getSettings().dialPlanRules){
  const number = cleanNumber(value);
  if (!number) return '';

  const rules = String(rulesText || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const rule of rules) {
    const separator = rule.indexOf('=>');
    if (separator < 1) continue;
    const pattern = rule.slice(0, separator).trim();
    const replacement = rule.slice(separator + 2).trim();
    try {
      const expression = new RegExp(pattern);
      if (expression.test(number)) return cleanNumber(number.replace(expression, replacement));
    } catch (error) {
      console.warn('Invalid dial-plan rule', { pattern, error });
    }
  }

  return number;
}

export function recentDialedNumbers(limit = 3){
  const seen = new Set();
  const numbers = [];
  for (const log of getAllCallLogs()) {
    if (log.direction !== 'outbound') continue;
    const number = cleanNumber(log.remoteNumber);
    if (!number || seen.has(number)) continue;
    seen.add(number);
    numbers.push(number);
    if (numbers.length >= limit) break;
  }
  return numbers;
}

export function lastDialedNumber(){
  return recentDialedNumbers(1)[0] || '';
}
