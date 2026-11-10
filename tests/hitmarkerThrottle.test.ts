import { describe, expect, it } from 'vitest';
import { HITMARKER_MERGE_WINDOW, HitmarkerThrottle } from '../src/ui/HitmarkerThrottle';

const HIT = { headshot: false, lethal: false };
const HEADSHOT = { headshot: true, lethal: false };
const KILL = { headshot: false, lethal: true };

describe('HitmarkerThrottle', () => {
  it('shows the first hit and merges same-strength hits inside the window', () => {
    const throttle = new HitmarkerThrottle();
    expect(throttle.accept(HIT, 1)).toBe(true);
    expect(throttle.accept(HIT, 1 + HITMARKER_MERGE_WINDOW * 0.5)).toBe(false);
    expect(throttle.accept(HIT, 1 + HITMARKER_MERGE_WINDOW)).toBe(true);
  });

  it('lets a stronger confirmation replace the marker inside the window', () => {
    const throttle = new HitmarkerThrottle();
    expect(throttle.accept(HIT, 2)).toBe(true);
    expect(throttle.accept(HEADSHOT, 2.01)).toBe(true);
    expect(throttle.accept(KILL, 2.02)).toBe(true);
    expect(throttle.accept({ headshot: true, lethal: true }, 2.03)).toBe(true);
    expect(throttle.accept(HEADSHOT, 2.04)).toBe(false);
  });

  it('caps a full-auto stream to one restart per window', () => {
    const throttle = new HitmarkerThrottle();
    let shown = 0;
    // 1200 rpm for one second, every round on target.
    for (let shot = 0; shot < 20; shot++) if (throttle.accept(HIT, shot * 0.05 * 0.999)) shown++;
    expect(shown).toBeLessThanOrEqual(Math.ceil(1 / HITMARKER_MERGE_WINDOW));
    expect(shown).toBeGreaterThan(0);
  });
});
