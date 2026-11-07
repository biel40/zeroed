import { describe, expect, it, vi } from 'vitest';
import { GoogleCertsKeySource } from '../cloudflare/api/src/googleIdToken';

function certsResponse(keyIds: string[], maxAgeSeconds: number): Response {
  return new Response(JSON.stringify({ keys: keyIds.map((kid) => ({ kid, kty: 'RSA', n: kid, e: 'AQAB' })) }), {
    headers: { 'cache-control': `public, max-age=${maxAgeSeconds}` },
  });
}

describe('Google certs key source', () => {
  it('caches the keys for their max-age and refetches once for an unknown key', async () => {
    let now = 0;
    let published = ['a'];
    const fetchFn = vi.fn(async () => certsResponse(published, 600));
    const keys = new GoogleCertsKeySource(() => now, fetchFn);

    expect((await keys.getKey('a'))?.n).toBe('a');
    expect((await keys.getKey('a'))?.n).toBe('a');
    expect(fetchFn).toHaveBeenCalledOnce();

    published = ['a', 'b'];
    expect((await keys.getKey('b'))?.n).toBe('b');
    expect(await keys.getKey('missing')).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(3);

    now = 601_000;
    published = ['c'];
    expect(await keys.getKey('a')).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('rejects when Google cannot be reached', async () => {
    const keys = new GoogleCertsKeySource(() => 0, async () => new Response(null, { status: 503 }));
    await expect(keys.getKey('a')).rejects.toThrow();
  });
});
