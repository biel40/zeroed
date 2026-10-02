import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = '__Host-zeroed-beta';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const LINK_SECONDS = 15 * 60;
export const enabled = () => process.env.BETA_ENABLED === 'true';

export function normalizeEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function allowed(email) {
  return !!email && (process.env.BETA_ALLOWED_EMAILS ?? '').split(/[,;\s]+/)
    .some((entry) => normalizeEmail(entry) === email);
}

function secret() {
  const value = process.env.BETA_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('Missing beta signing secret');
  return value;
}

export function signToken(email, purpose, seconds, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ email, purpose, expires: Math.floor(now / 1000) + seconds })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}

export function verifyToken(token, purpose, now = Date.now()) {
  try {
    if (typeof token !== 'string' || token.length > 2048) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    const expected = createHmac('sha256', secret()).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(expected, actual)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (claims.purpose !== purpose || !Number.isInteger(claims.expires) || claims.expires <= Math.floor(now / 1000)) return null;
    const email = normalizeEmail(claims.email);
    return allowed(email) ? email : null;
  } catch { return null; }
}

export function sessionEmail(cookies = '') {
  const cookie = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return verifyToken(cookie?.slice(SESSION_COOKIE.length + 1), 'session');
}

