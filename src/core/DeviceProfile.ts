import { browserQualityStorage, classifyDevice, type DeviceSignals, type GpuSignals, type QualityStorage } from './AutoQuality';

/** `ultraMax` is opt-in only: detection never picks it. */
export const QUALITY_LEVELS = ['low', 'medium', 'high', 'ultraMax'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];
/** The settings choice: a fixed tier, or `auto` to let the game pick and lower it. */
export type QualityPreference = QualityLevel | 'auto';

export interface DeviceProfile {
  readonly isMobile: boolean;
  readonly isTouch: boolean;
  readonly isLowMemory: boolean;
  /** Rendering tier: the player's fixed choice, else the automatic one. */
  readonly quality: QualityLevel;
  readonly pixelRatioLimit: number;
  readonly shadowQuality: 0 | 1 | 2;
  readonly useReducedEffects: boolean;
  readonly useTouchControls: boolean;
  readonly anisotropyLimit: number;
  /** HDR post-processing, local reflections and procedural surface detail. */
  readonly useAdvancedRendering: boolean;
}

type DeviceNavigator = Partial<Navigator> & {
  matchMedia?: (query: string) => { matches: boolean };
  deviceMemory?: number;
};

type QualitySettings = Pick<DeviceProfile,
  'pixelRatioLimit' | 'shadowQuality' | 'useReducedEffects' | 'anisotropyLimit' | 'useAdvancedRendering'>;

const QUALITY_SETTINGS: Record<QualityLevel, QualitySettings> = {
  low: { pixelRatioLimit: 1, shadowQuality: 0, useReducedEffects: true, anisotropyLimit: 2, useAdvancedRendering: false },
  medium: { pixelRatioLimit: 1.5, shadowQuality: 1, useReducedEffects: true, anisotropyLimit: 2, useAdvancedRendering: false },
  high: { pixelRatioLimit: 2, shadowQuality: 2, useReducedEffects: false, anisotropyLimit: 8, useAdvancedRendering: false },
  ultraMax: { pixelRatioLimit: 2, shadowQuality: 2, useReducedEffects: false, anisotropyLimit: 16, useAdvancedRendering: true },
};

/** Highest pixel ratio any tier renders at. */
export const MAX_PIXEL_RATIO = Math.max(...QUALITY_LEVELS.map((level) => QUALITY_SETTINGS[level].pixelRatioLimit));

const QUALITY_STORAGE_KEY = 'zeroed.quality';

interface NavigatorTraits {
  readonly isMobile: boolean;
  readonly isTouch: boolean;
  readonly useTouchControls: boolean;
  readonly reducedMotion: boolean;
  readonly deviceMemory: number | null;
  readonly hardwareConcurrency: number | null;
}

export function isQualityLevel(value: unknown): value is QualityLevel {
  return typeof value === 'string' && (QUALITY_LEVELS as readonly string[]).includes(value);
}

export function isQualityPreference(value: unknown): value is QualityPreference {
  return value === 'auto' || isQualityLevel(value);
}

/** The quality chosen in the menu; Auto when nothing (or nothing valid) was saved. */
export function getQualityPreference(storage: QualityStorage | null = browserQualityStorage()): QualityPreference {
  try {
    const value = storage?.getItem(QUALITY_STORAGE_KEY);
    // The former local Ultra tier now shares Ultra Max's effects and name.
    if (value === 'ultra') return 'ultraMax';
    return isQualityPreference(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function setQualityPreference(
  preference: QualityPreference,
  storage: QualityStorage | null = browserQualityStorage(),
): void {
  try {
    storage?.setItem(QUALITY_STORAGE_KEY, preference);
  } catch { /* The choice still applies to this session. */ }
}

/** Hardware hints for automatic quality, from the navigator plus the optional GPU and screen probes. */
export function readDeviceSignals(
  navigatorLike: DeviceNavigator = navigator as DeviceNavigator,
  gpu: GpuSignals | null = null,
  renderPixels: number | null = null,
): DeviceSignals {
  const { isMobile, reducedMotion, deviceMemory, hardwareConcurrency } = readNavigatorTraits(navigatorLike);
  return { isMobile, deviceMemory, hardwareConcurrency, reducedMotion, renderPixels, gpu };
}

/** Keep the most expensive tier opt-in and limited to devices classified as High. */
export function getAvailableQualityLevels(
  navigatorLike: DeviceNavigator = navigator as DeviceNavigator,
): readonly QualityLevel[] {
  return classifyDevice(readDeviceSignals(navigatorLike)) === 'high'
    ? QUALITY_LEVELS
    : QUALITY_LEVELS.filter((level) => level !== 'ultraMax');
}

/** `quality` null classifies the device from the navigator alone. */
export function getDeviceProfile(
  navigatorLike: DeviceNavigator = navigator as DeviceNavigator,
  quality: QualityLevel | null = null,
): DeviceProfile {
  const traits = readNavigatorTraits(navigatorLike);
  const memory = traits.deviceMemory ?? 8;
  const threads = traits.hardwareConcurrency ?? 8;
  const detectedQuality = classifyDevice(readDeviceSignals(navigatorLike));
  const level = quality === 'ultraMax' && detectedQuality !== 'high'
    ? 'high'
    : quality ?? detectedQuality;

  return {
    isMobile: traits.isMobile,
    isTouch: traits.isTouch,
    isLowMemory: memory <= 6 || threads <= 4,
    quality: level,
    ...QUALITY_SETTINGS[level],
    useTouchControls: traits.useTouchControls,
  };
}

function readNavigatorTraits(navigatorLike: DeviceNavigator): NavigatorTraits {
  const userAgent = navigatorLike.userAgent ?? '';
  const touchPoints = navigatorLike.maxTouchPoints ?? 0;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent);
  const matchMedia = navigatorLike.matchMedia ??
    (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia.bind(window)
      : undefined);
  const coarsePointer = matchMedia?.('(pointer: coarse)').matches ?? false;
  // Capability is authoritative. The UA is only a fallback for old mobile
  // WebViews that report touch points but do not expose pointer media queries.
  const useTouchControls = coarsePointer || (touchPoints > 0 && mobileUserAgent);
  return {
    isMobile: useTouchControls,
    isTouch: touchPoints > 0 || coarsePointer,
    useTouchControls,
    reducedMotion: matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    deviceMemory: typeof navigatorLike.deviceMemory === 'number' ? navigatorLike.deviceMemory : null,
    hardwareConcurrency: typeof navigatorLike.hardwareConcurrency === 'number' && navigatorLike.hardwareConcurrency > 0
      ? navigatorLike.hardwareConcurrency
      : null,
  };
}
