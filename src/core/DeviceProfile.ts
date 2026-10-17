export const QUALITY_LEVELS = ['low', 'medium', 'high'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

export interface DeviceProfile {
  readonly isMobile: boolean;
  readonly isTouch: boolean;
  readonly isLowMemory: boolean;
  /** Rendering tier: the player's saved choice, else the one detected for the device. */
  readonly quality: QualityLevel;
  readonly pixelRatioLimit: number;
  readonly shadowQuality: 0 | 1 | 2;
  readonly useReducedEffects: boolean;
  readonly useTouchControls: boolean;
  readonly anisotropyLimit: number;
}

type DeviceNavigator = Partial<Navigator> & {
  matchMedia?: (query: string) => { matches: boolean };
  deviceMemory?: number;
};

type QualitySettings = Pick<DeviceProfile, 'pixelRatioLimit' | 'shadowQuality' | 'useReducedEffects' | 'anisotropyLimit'>;

const QUALITY_SETTINGS: Record<QualityLevel, QualitySettings> = {
  low: { pixelRatioLimit: 1, shadowQuality: 0, useReducedEffects: true, anisotropyLimit: 2 },
  medium: { pixelRatioLimit: 1.5, shadowQuality: 1, useReducedEffects: true, anisotropyLimit: 2 },
  high: { pixelRatioLimit: 2, shadowQuality: 2, useReducedEffects: false, anisotropyLimit: 8 },
};

const QUALITY_STORAGE_KEY = 'zeroed.quality';

export function isQualityLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
}

/** The quality the player picked in the menu, or null to use the detected one. */
export function getQualityPreference(): QualityLevel | null {
  try {
    const value = globalThis.localStorage?.getItem(QUALITY_STORAGE_KEY);
    return isQualityLevel(value) ? value : null;
  } catch {
    return null;
  }
}

export function setQualityPreference(quality: QualityLevel): void {
  try {
    globalThis.localStorage?.setItem(QUALITY_STORAGE_KEY, quality);
  } catch { /* The choice still applies to this session. */ }
}

export function getDeviceProfile(
  navigatorLike: DeviceNavigator = navigator as DeviceNavigator,
  preferredQuality: QualityLevel | null = null,
): DeviceProfile {
  const userAgent = navigatorLike.userAgent ?? '';
  const touchPoints = navigatorLike.maxTouchPoints ?? 0;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent);
  const matchMedia = navigatorLike.matchMedia ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : undefined);
  const coarsePointer = matchMedia?.('(pointer: coarse)').matches ?? false;
  const reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  // Capability is authoritative. The UA is only a fallback for old mobile
  // WebViews that report touch points but do not expose pointer media queries.
  const useTouchControls = coarsePointer || (touchPoints > 0 && mobileUserAgent);
  const isMobile = useTouchControls;
  const deviceMemory = typeof navigatorLike.deviceMemory === 'number' ? navigatorLike.deviceMemory : 8;
  const hardwareConcurrency = navigatorLike.hardwareConcurrency ?? 8;
  const isLowMemory = deviceMemory <= 6 || hardwareConcurrency <= 4;
  const isTouch = touchPoints > 0 || coarsePointer;
  const detectedQuality: QualityLevel = isMobile && isLowMemory
    ? 'low'
    : isMobile || isLowMemory || reducedMotion ? 'medium' : 'high';
  const quality = preferredQuality ?? detectedQuality;

  return {
    isMobile,
    isTouch,
    isLowMemory,
    quality,
    ...QUALITY_SETTINGS[quality],
    useTouchControls,
  };
}
