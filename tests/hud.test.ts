import { describe, expect, it } from 'vitest';
import { roundMarks } from '../src/ui/SurvivalPresentation';

describe('Zombies HUD round formatting', () => {
  it.each([1, 4, 9, 14, 49, 944, 1994, 3999, 4000])('keeps round %i readable with bounded scratches', (round) => {
    const markup = roundMarks(round);
    if (round <= 10) {
      expect(markup).not.toContain('round-number');
      expect(markup.match(/<i>/g)).toHaveLength(round);
    } else {
      expect(markup).toContain('<span class="round-number">' + round + '</span>');
    }
    expect(markup.match(/<i>/g)?.length).toBeLessThanOrEqual(10);
  });
});
