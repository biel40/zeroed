const ALLOWED_EMAIL = 'bielet40@gmail.com';
const ACCESS_KEY = 'zeroed.betaAccess';

export function hasBetaAccess() {
  try { return sessionStorage.getItem(ACCESS_KEY) === ALLOWED_EMAIL; }
  catch { return false; }
}

export function acceptBetaEmail(email) {
  if (email.trim().toLowerCase() !== ALLOWED_EMAIL) return false;
  sessionStorage.setItem(ACCESS_KEY, ALLOWED_EMAIL);
  return true;
}
