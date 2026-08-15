import { describe, expect, it } from 'vitest';
import { getDeviceProfile } from '../src/core/DeviceProfile';

describe('Device profile compatibility', () => {
  it('reduces GPU cost automatically on mobile devices', () => {
    const profile = getDeviceProfile({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 10 Pro XL Build/SDK) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
      hardwareConcurrency: 8,
      deviceMemory: 6,
      matchMedia: () => ({
        matches: true,
      }),
    });

    expect(profile.isMobile).toBe(true);
    expect(profile.pixelRatioLimit).toBeLessThanOrEqual(1.5);
    expect(profile.shadowQuality).toBeLessThanOrEqual(1);
    expect(profile.useReducedEffects).toBe(true);
  });

  it('keeps desktop configuration intact when pointer is fine', () => {
    const profile = getDeviceProfile({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      maxTouchPoints: 0,
      hardwareConcurrency: 16,
      deviceMemory: 16,
      matchMedia: () => ({ matches: false }),
    });

    expect(profile.isMobile).toBe(false);
    expect(profile.pixelRatioLimit).toBeGreaterThan(1);
    expect(profile.useTouchControls).toBe(false);
  });

  it('uses coarse-pointer capability without relying on a mobile user agent', () => {
    const profile = getDeviceProfile({
      userAgent: 'Custom embedded browser',
      maxTouchPoints: 2,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      matchMedia: (query) => ({ matches: query === '(pointer: coarse)' }),
    });

    expect(profile.useTouchControls).toBe(true);
    expect(profile.isTouch).toBe(true);
  });

  it('keeps mouse controls on a fine-pointer desktop with a touch screen', () => {
    const profile = getDeviceProfile({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      maxTouchPoints: 10,
      hardwareConcurrency: 12,
      deviceMemory: 16,
      matchMedia: () => ({ matches: false }),
    });

    expect(profile.isTouch).toBe(true);
    expect(profile.useTouchControls).toBe(false);
  });
});
