import { describe, expect, it } from 'vitest';
import { formatRomanRound } from '../src/ui/HUD';

describe('Zombies HUD round formatting', () => {
  it.each([
    [1, 'I'],
    [4, 'IV'],
    [9, 'IX'],
    [14, 'XIV'],
    [49, 'XLIX'],
    [944, 'CMXLIV'],
    [1994, 'MCMXCIV'],
    [3999, 'MMMCMXCIX'],
  ])('formats round %i as %s', (round, expected) => {
    expect(formatRomanRound(round)).toBe(expected);
  });

  it('falls back to arabic digits beyond the compact Roman range', () => {
    expect(formatRomanRound(4000)).toBe('4000');
  });
});
