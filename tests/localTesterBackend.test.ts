import { describe, expect, it, vi } from 'vitest';
import type { AccountBackend } from '../src/account/AccountApi';
import { LocalTesterBackend } from '../src/account/LocalTesterBackend';
import { WebAccount, type AccountStorage } from '../src/account/WebAccount';
import { PRODUCT_IDS } from '../src/config/products';

function remoteBackend(): AccountBackend & { [K in keyof AccountBackend]: ReturnType<typeof vi.fn> } {
  return {
    register: vi.fn(async () => ({ token: 'new-session', email: 'new@example.com' })),
    changePassword: vi.fn(async () => 'changed' as const),
    signInWithPassword: vi.fn(async () => ({ token: 'remote-session', email: 'player@example.com' })),
    signInWithGoogle: vi.fn(async () => ({ token: 'google-session', email: 'player@gmail.com' })),
    requestLogin: vi.fn(async () => 'sent' as const),
    verifyLogin: vi.fn(async () => ({ token: 'remote-session', email: 'player@example.com' })),
    fetchEntitlements: vi.fn(async () => ({ email: 'player@example.com', products: [], beta: false })),
    logout: vi.fn(async () => undefined),
  };
}

function memoryStorage(): AccountStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe('local tester backend', () => {
  it('signs a local tester in with any password, every product and the beta badge without the account server', async () => {
    const remote = remoteBackend();
    const backend = new LocalTesterBackend(remote, ['tester@example.com']);
    const storage = memoryStorage();
    const account = new WebAccount(backend, storage);

    expect(await account.register(' Tester@Example.com ', 'whatever')).toBe('signed-in');
    expect(await account.signInWithPassword('tester@example.com', 'anything else')).toBe('signed-in');
    expect(await account.changePassword('new one')).toBe('changed');
    expect(account.getEmail()).toBe('tester@example.com');
    expect(account.isBetaTester()).toBe(true);
    for (const product of PRODUCT_IDS) expect(account.owns(product)).toBe(true);

    // A reload keeps the session: refreshing it never asks the server.
    const restored = new WebAccount(backend, storage);
    await restored.refresh();
    expect(restored.owns('map.station-33')).toBe(true);

    await restored.signOut();
    expect(restored.getEmail()).toBeNull();
    for (const method of Object.values(remote)) expect(method).not.toHaveBeenCalled();
  });

  it('forwards every other player and every Google or link sign-in to the account server', async () => {
    const remote = remoteBackend();
    const backend = new LocalTesterBackend(remote, ['tester@example.com']);
    const account = new WebAccount(backend, memoryStorage());

    expect(await account.signInWithPassword('player@example.com', 'secret password')).toBe('signed-in');
    expect(remote.signInWithPassword).toHaveBeenCalledWith('player@example.com', 'secret password');
    expect(remote.fetchEntitlements).toHaveBeenCalledWith('remote-session');
    expect(account.owns('map.station-33')).toBe(false);
    await account.signOut();
    expect(remote.logout).toHaveBeenCalledWith('remote-session');

    expect(await account.register('new@example.com', 'secret password')).toBe('signed-in');
    expect(remote.register).toHaveBeenCalledWith('new@example.com', 'secret password');
    expect(await account.changePassword('another one')).toBe('changed');
    expect(remote.changePassword).toHaveBeenCalledWith('new-session', 'another one');
    expect(await account.signInWithGoogle('credential')).toBe('signed-in');
    expect(remote.signInWithGoogle).toHaveBeenCalledWith('credential');
    expect(await account.requestLogin('tester@example.com', 'en')).toBe('sent');
    expect(remote.requestLogin).toHaveBeenCalledWith('tester@example.com', 'en');
    expect(await account.completeLogin('link-1')).toBe('signed-in');
    expect(remote.verifyLogin).toHaveBeenCalledWith('link-1');
  });
});
