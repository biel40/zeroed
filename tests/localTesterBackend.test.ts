import { describe, expect, it, vi } from 'vitest';
import type { AccountBackend } from '../src/account/AccountApi';
import { LocalTesterBackend } from '../src/account/LocalTesterBackend';
import { WebAccount, type AccountStorage } from '../src/account/WebAccount';
import { PRODUCT_IDS } from '../src/config/products';

function remoteBackend(): AccountBackend & { [K in keyof AccountBackend]: ReturnType<typeof vi.fn> } {
  return {
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
  it('issues login tokens only for local testers, ignoring case and spaces', () => {
    const backend = new LocalTesterBackend(remoteBackend(), ['tester@example.com']);
    expect(backend.loginTokenFor(' Tester@Example.com ')).not.toBeNull();
    expect(backend.loginTokenFor('player@example.com')).toBeNull();
  });

  it('signs a local tester in with every product and the beta badge without the account server', async () => {
    const remote = remoteBackend();
    const backend = new LocalTesterBackend(remote, ['tester@example.com']);
    const storage = memoryStorage();
    const account = new WebAccount(backend, storage, backend);

    expect(await account.requestLogin('tester@example.com', 'es')).toBe('signed-in');
    expect(account.getEmail()).toBe('tester@example.com');
    expect(account.isBetaTester()).toBe(true);
    for (const product of PRODUCT_IDS) expect(account.owns(product)).toBe(true);

    // A reload keeps the session: refreshing it never asks the server.
    const restored = new WebAccount(backend, storage, backend);
    await restored.refresh();
    expect(restored.owns('map.station-33')).toBe(true);

    await restored.signOut();
    expect(restored.getEmail()).toBeNull();
    for (const method of Object.values(remote)) expect(method).not.toHaveBeenCalled();
  });

  it('forwards every other player to the account server', async () => {
    const remote = remoteBackend();
    const backend = new LocalTesterBackend(remote, ['tester@example.com']);
    const account = new WebAccount(backend, memoryStorage(), backend);

    expect(await account.requestLogin('player@example.com', 'en')).toBe('sent');
    expect(remote.requestLogin).toHaveBeenCalledWith('player@example.com', 'en');
    expect(await account.completeLogin('link-1')).toBe('signed-in');
    expect(remote.verifyLogin).toHaveBeenCalledWith('link-1');
    expect(remote.fetchEntitlements).toHaveBeenCalledWith('remote-session');
    expect(account.owns('map.station-33')).toBe(false);
    await account.signOut();
    expect(remote.logout).toHaveBeenCalledWith('remote-session');
  });

  it('keeps the mailed link flow when no local login is given', async () => {
    const remote = remoteBackend();
    const backend = new LocalTesterBackend(remote, ['tester@example.com']);
    const account = new WebAccount(backend, memoryStorage());
    expect(await account.requestLogin('tester@example.com', 'en')).toBe('sent');
    expect(account.getEmail()).toBeNull();
  });
});
