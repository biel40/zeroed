import { describe, expect, it } from 'vitest';
import { resolveTouchZone, TOUCH_LAYOUT } from '../src/player/touchLayout';

/** A typical portrait phone viewport in CSS pixels. */
const PORTRAIT = { width: 390, height: 844 };
/** The same phone rotated. */
const LANDSCAPE = { width: 844, height: 390 };

describe('resolveTouchZone — portrait', () => {
  const { width, height } = PORTRAIT;

  it('claims the bottom-left corner for movement (resting left thumb)', () => {
    expect(resolveTouchZone(60, 700, width, height)).toBe('move');
    expect(resolveTouchZone(width * 0.4, height * 0.9, width, height)).toBe('move');
  });

  it('leaves the whole right side to the camera, top to bottom', () => {
    expect(resolveTouchZone(width * 0.6, 100, width, height)).toBe('look');
    expect(resolveTouchZone(width * 0.6, height * 0.5, width, height)).toBe('look');
    expect(resolveTouchZone(width - 5, height - 5, width, height)).toBe('look');
  });

  it('keeps the upper-left HUD area inert', () => {
    expect(resolveTouchZone(40, 60, width, height)).toBe('none');
    expect(resolveTouchZone(width * 0.2, height * 0.3, width, height)).toBe('none');
  });

  it('splits exactly on the configured fractions', () => {
    const edgeX = width * TOUCH_LAYOUT.moveZoneWidth;
    const edgeY = height * TOUCH_LAYOUT.moveZoneTop;
    expect(resolveTouchZone(edgeX - 1, edgeY + 1, width, height)).toBe('move');
    expect(resolveTouchZone(edgeX + 1, edgeY + 1, width, height)).toBe('look');
    expect(resolveTouchZone(edgeX - 1, edgeY - 1, width, height)).toBe('none');
  });

  it('keeps a camera area far larger than the movement pad', () => {
    const moveArea = TOUCH_LAYOUT.moveZoneWidth * (1 - TOUCH_LAYOUT.moveZoneTop);
    expect(moveArea).toBeLessThan(0.35);
  });
});

describe('resolveTouchZone — landscape', () => {
  const { width, height } = LANDSCAPE;

  it('raises the movement pad, because a short viewport has no room below', () => {
    // 35 % height in landscape is inside the pad, but remains inert in portrait.
    expect(resolveTouchZone(80, height * 0.35, width, height)).toBe('move');
    expect(resolveTouchZone(80, PORTRAIT.height * 0.35, PORTRAIT.width, PORTRAIT.height)).toBe(
      'none',
    );
  });

  it('still reserves the right side for the camera', () => {
    expect(resolveTouchZone(width * 0.7, height * 0.9, width, height)).toBe('look');
  });
});

describe('resolveTouchZone — degenerate viewports', () => {
  it('never claims movement when the canvas has no measurable size', () => {
    // Happens on the very first frame / while hidden: must not produce NaN math.
    expect(resolveTouchZone(0, 0, 0, 0)).toBe('look');
    expect(resolveTouchZone(10, 10, -1, 500)).toBe('look');
  });
});
