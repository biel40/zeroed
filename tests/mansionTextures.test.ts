import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Burned Mansion surface assets', () => {
  it('ships the JPEG textures loaded directly by the mansion materials', () => {
    for (const set of ['concrete', 'brown_planks_03']) {
      for (const kind of ['diff', 'nor', 'rough']) {
        const file = new URL(`../public/assets/textures/${set}_${kind}.jpg`, import.meta.url);
        const bytes = readFileSync(file);
        expect(bytes.length).toBeGreaterThan(100);
        expect(bytes[0]).toBe(0xff);
        expect(bytes[1]).toBe(0xd8);
      }
    }
  });
});
