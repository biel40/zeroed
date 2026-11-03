const LOGIN_FRAGMENT = /^#login=([A-Za-z0-9_-]+)$/;

/**
 * The token of a login link (`https://zeroed.es/#login=<token>`). It travels in
 * the fragment so it never reaches the game host's logs.
 */
export function readLoginToken(hash: string): string | null {
  return LOGIN_FRAGMENT.exec(hash)?.[1] ?? null;
}
