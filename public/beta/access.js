import { BETA_EMAILS } from './emails.js';
const ACCESS_KEY = 'zeroed.betaAccess';

export function hasBetaAccess() {
  try { return BETA_EMAILS.includes(sessionStorage.getItem(ACCESS_KEY)); }
  catch { return false; }
}

export function acceptBetaEmail(email) {
  const normalized = email.trim().toLowerCase();
  if (!BETA_EMAILS.includes(normalized)) return false;
  sessionStorage.setItem(ACCESS_KEY, normalized);
  return true;
}
