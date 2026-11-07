import { toHex, type RandomBytes } from './tokens';

/** Workers cap PBKDF2 at 100 000 iterations. */
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const SCHEME = 'pbkdf2-sha256';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** A password the API accepts: a string within the length limits, kept exactly as typed. */
export function isAcceptablePassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH && value.length <= MAX_PASSWORD_LENGTH;
}

/** `pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>`. */
export async function hashPassword(password: string, randomBytes: RandomBytes): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  return `${SCHEME}$${ITERATIONS}$${toHex(salt)}$${toHex(await derive(password, salt, ITERATIONS))}`;
}

/** False for a wrong password or a stored value in an unknown format. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterationsText, saltHex, hashHex] = stored.split('$');
  const iterations = Number(iterationsText);
  if (scheme !== SCHEME || !Number.isInteger(iterations) || iterations <= 0 || !saltHex || !hashHex) return false;
  const actual = await derive(password, fromHex(saltHex), iterations);
  return constantTimeEqual(actual, fromHex(hashHex));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
