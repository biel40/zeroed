const MAX_EMAIL_LENGTH = 254;
// Deliberately narrower than RFC 5322: no quotes or spaces, so a valid address is also safe to embed in seed SQL.
const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** Accounts are keyed by the trimmed, lower-cased address; returns null when it is not a plain email. */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email) ? email : null;
}
