import { describe, expect, it } from 'vitest';
import { analogStick } from '../src/utils/math';

const RADIUS = 62;
const DEAD_ZONE = 0.14;

describe('analogStick (virtual joystick mapping)', () => {
  it('returns zero inside the dead zone so a resting thumb never drifts', () => {
    const stick = analogStick(3, -3, RADIUS, DEAD_ZONE);
    expect(stick.x).toBe(0);
    expect(stick.y).toBe(0);
    // The knob visual still tracks the finger 1:1 inside the radius.
    expect(stick.offsetX).toBeCloseTo(3, 5);
    expect(stick.offsetY).toBeCloseTo(-3, 5);
  });

  it('reaches full deflection at the radius edge', () => {
    const stick = analogStick(RADIUS, 0, RADIUS, DEAD_ZONE);
    expect(stick.x).toBeCloseTo(1, 5);
    expect(stick.y).toBe(0);
  });

  it('clamps deflection beyond the radius without exceeding 1', () => {
    const stick = analogStick(500, 500, RADIUS, DEAD_ZONE);
    expect(Math.hypot(stick.x, stick.y)).toBeCloseTo(1, 5);
    expect(Math.hypot(stick.offsetX, stick.offsetY)).toBeCloseTo(RADIUS, 5);
  });

  it('ramps smoothly from the dead-zone edge with no jump', () => {
    const justOutside = analogStick(RADIUS * (DEAD_ZONE + 0.001), 0, RADIUS, DEAD_ZONE);
    expect(justOutside.x).toBeGreaterThan(0);
    expect(justOutside.x).toBeLessThan(0.01);
  });

  it('keeps direction while scaling magnitude', () => {
    const stick = analogStick(0, -RADIUS / 2, RADIUS, DEAD_ZONE);
    expect(stick.x).toBe(0);
    expect(stick.y).toBeLessThan(0);
    expect(stick.y).toBeGreaterThan(-1);
  });
});
