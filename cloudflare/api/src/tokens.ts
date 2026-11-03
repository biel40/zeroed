export type RandomBytes = (length: number) => Uint8Array;

const TOKEN_BYTES = 32;
const ID_BYTES = 16;

/** An unguessable bearer secret, safe in URLs. Only its hash is stored. */
export function generateToken(randomBytes: RandomBytes): string {
  const bytes = randomBytes(TOKEN_BYTES);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Same format as `lower(hex(randomblob(16)))`, which the beta seed uses. */
export function generateId(randomBytes: RandomBytes): string {
  return toHex(randomBytes(ID_BYTES));
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
