import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptBetaEmail, hasBetaAccess } from '../public/beta/access.js';
import { canAccessZombieMap } from '../src/config/zombieMaps';

describe('temporary beta map access', () => {
  afterEach(() => vi.unstubAllGlobals());

  function storage(initial: string | null = null): Map<string, string> {
    const values = new Map<string, string>();
    if (initial !== null) values.set('zeroed.betaAccess', initial);
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string): string | null => values.get(key) ?? null,
      setItem: (key: string, value: string): void => { values.set(key, value); },
    });
    return values;
  }

  it('keeps Burned Mansion public and denies Station 33 without an allowed session', () => {
    storage();
    expect(hasBetaAccess()).toBe(false);
    expect(canAccessZombieMap('burned-mansion', hasBetaAccess())).toBe(true);
    expect(canAccessZombieMap('station-33', hasBetaAccess())).toBe(false);
    expect(canAccessZombieMap('unknown', true)).toBe(false);
  });

  it('normalizes an existing beta email and restores its session', () => {
    const values = storage();
    expect(acceptBetaEmail('  ANAVILMOY@GMAIL.COM  ')).toBe(true);
    expect(values.get('zeroed.betaAccess')).toBe('anavilmoy@gmail.com');
    expect(hasBetaAccess()).toBe(true);
    expect(canAccessZombieMap('station-33', hasBetaAccess())).toBe(true);
  });

  it('rejects unlisted emails and unlisted stored sessions', () => {
    const values = storage('unlisted@example.com');
    expect(hasBetaAccess()).toBe(false);
    expect(acceptBetaEmail('unlisted@example.com')).toBe(false);
    expect(values.get('zeroed.betaAccess')).toBe('unlisted@example.com');
  });

  it('does not grant access when session storage is unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: (): never => { throw new Error('Storage disabled'); },
      setItem: (): never => { throw new Error('Storage disabled'); },
    });
    expect(hasBetaAccess()).toBe(false);
    expect(() => acceptBetaEmail('bielet40@gmail.com')).toThrow('Storage disabled');
  });
});
