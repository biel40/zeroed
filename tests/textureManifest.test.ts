import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEXTURE_MANIFEST } from '../src/assets/AssetManager';

describe('shipped surface textures', () => {
  // Maps bake their own surfaces in code; only the preloaded manifest ships as files.
  it('ships every JPEG texture the asset manager preloads', () => {
    expect(TEXTURE_MANIFEST.length).toBeGreaterThan(0);
    for (const name of TEXTURE_MANIFEST) {
      const bytes = readFileSync(new URL(`../public/assets/textures/${name}`, import.meta.url));
      expect(bytes.length).toBeGreaterThan(100);
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
    }
  });
});
