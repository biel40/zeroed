import { describe, expect, it } from 'vitest';
import { hudNoticeDurationMs } from '../src/ui/HudNotice';

describe('HUD notice reading time', () => {
  it.each(['', 'OK', 'PUNTOS INSUFICIENTES', 'A'.repeat(40)])('gives short messages at least four seconds: %s', (title) => {
    expect(hudNoticeDurationMs(title)).toBe(4000);
  });

  it('increases reading time with both the title and its detail', () => {
    const title = 'A'.repeat(50);
    expect(hudNoticeDurationMs(title)).toBe(4550);
    expect(hudNoticeDurationMs(title, 'B'.repeat(30))).toBe(6255);
    expect(hudNoticeDurationMs('A'.repeat(80))).toBeGreaterThan(hudNoticeDurationMs(title));
  });

  it('caps even very long messages at eight seconds', () => {
    expect(hudNoticeDurationMs('A'.repeat(112))).toBe(7960);
    expect(hudNoticeDurationMs('A'.repeat(113))).toBe(8000);
    expect(hudNoticeDurationMs('A'.repeat(500), 'B'.repeat(500))).toBe(8000);
  });

  it('counts rendered whitespace once and ignores leading and trailing whitespace', () => {
    const title = 'PUNTOS INSUFICIENTES';
    const detail = 'SE NECESITAN 1000 PTS';
    expect(hudNoticeDurationMs(` \n${title}\t `, ` ${detail.replaceAll(' ', ' \n\t ')} `))
      .toBe(hudNoticeDurationMs(title, detail));
    expect(hudNoticeDurationMs('A'.repeat(50), ' \n\t ')).toBe(hudNoticeDurationMs('A'.repeat(50)));
  });
});
