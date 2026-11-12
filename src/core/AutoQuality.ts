import type { QualityLevel } from './DeviceProfile';

/** Tiers the automatic mode may pick: Ultra Max stays opt-in. */
export type AutoQualityLevel = Exclude<QualityLevel, 'ultraMax'>;

/** What the WebGL probe could read; null when no context could be created. */
export interface GpuSignals {
  readonly webgl2: boolean;
  readonly maxTextureSize: number;
  /** The browser only grants WebGL with a major performance caveat (software or blocklisted GPU). */
  readonly majorPerformanceCaveat: boolean;
  /** Unmasked renderer string when exposed. Only used to spot software rasterizers. */
  readonly renderer: string | null;
}

/** Hardware hints for the first automatic tier. Every field may be unknown. */
export interface DeviceSignals {
  readonly isMobile: boolean;
  /** GB as reported by `navigator.deviceMemory` (Chromium only, capped at 8). */
  readonly deviceMemory: number | null;
  readonly hardwareConcurrency: number | null;
  readonly reducedMotion: boolean;
  /** Physical pixels of the screen at the highest pixel ratio the game renders. */
  readonly renderPixels: number | null;
  readonly gpu: GpuSignals | null;
}

export type QualityStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const AUTO_QUALITY_STORAGE_KEY = 'zeroed.autoQuality';

const AUTO_LEVELS: readonly AutoQualityLevel[] = ['low', 'medium', 'high'];
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;
/** Around a 4K screen: enough pixels to keep a machine that is not clearly strong off High. */
const HIGH_DEMAND_PIXELS = 7_000_000;
const STRONG_DESKTOP_THREADS = 8;

interface StoredAutoQuality {
  readonly fingerprint: string;
  readonly level: AutoQualityLevel;
}

/** Browser storage when available; blocked site data degrades to an in-session choice. */
export function browserQualityStorage(): QualityStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * First tier for a device. Unknown values never count against a desktop, which
 * scales down at runtime anyway, but keep a phone off High.
 */
export function classifyDevice(signals: DeviceSignals): AutoQualityLevel {
  const { isMobile, deviceMemory: memory, hardwareConcurrency: threads, gpu } = signals;
  if (gpu && (gpu.majorPerformanceCaveat || (gpu.renderer !== null && SOFTWARE_RENDERER.test(gpu.renderer)))) return 'low';

  if (isMobile) {
    const weakGpu = gpu !== null && (!gpu.webgl2 || gpu.maxTextureSize < 4096);
    if (weakGpu || (memory !== null && memory <= 2) || (threads !== null && threads <= 4)) return 'low';
    const flagship = memory !== null && memory >= 8 && threads !== null && threads >= 8 && gpu?.webgl2 === true;
    return flagship && !signals.reducedMotion ? 'high' : 'medium';
  }

  if ((memory !== null && memory <= 2) || (threads !== null && threads <= 2)) return 'low';
  const weakGpu = gpu !== null && (!gpu.webgl2 || gpu.maxTextureSize < 8192);
  const modest = (memory !== null && memory <= 4) || (threads !== null && threads <= 4);
  const heavyScreen = signals.renderPixels !== null && signals.renderPixels >= HIGH_DEMAND_PIXELS
    && (threads === null || threads < STRONG_DESKTOP_THREADS);
  return weakGpu || modest || heavyScreen || signals.reducedMotion ? 'medium' : 'high';
}

/**
 * The automatic tier: the stored one while the rendering environment matches
 * (keeping earlier downgrades), otherwise a fresh detection that is stored.
 */
export function resolveAutoQuality(
  signals: DeviceSignals,
  storage: QualityStorage | null = browserQualityStorage(),
): AutoQualityLevel {
  const fingerprint = environmentFingerprint(signals);
  const stored = readStored(storage);
  if (stored?.fingerprint === fingerprint) return stored.level;
  const level = classifyDevice(signals);
  writeStored(storage, { fingerprint, level });
  return level;
}

/** Stores the tier below `current` for this environment and returns it; Low is the floor. */
export function recordAutoQualityDowngrade(
  signals: DeviceSignals,
  current: AutoQualityLevel,
  storage: QualityStorage | null = browserQualityStorage(),
): AutoQualityLevel {
  const level = AUTO_LEVELS[Math.max(0, AUTO_LEVELS.indexOf(current) - 1)];
  writeStored(storage, { fingerprint: environmentFingerprint(signals), level });
  return level;
}

/** Every signal the classification reads: any change means a different environment. */
function environmentFingerprint(signals: DeviceSignals): string {
  const { gpu } = signals;
  return JSON.stringify([
    signals.isMobile, signals.deviceMemory, signals.hardwareConcurrency, signals.reducedMotion, signals.renderPixels,
    gpu && [gpu.webgl2, gpu.maxTextureSize, gpu.majorPerformanceCaveat, gpu.renderer],
  ]);
}

function readStored(storage: QualityStorage | null): StoredAutoQuality | null {
  try {
    const raw = storage?.getItem(AUTO_QUALITY_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredAutoQuality> | null;
    if (typeof value?.fingerprint !== 'string' || !AUTO_LEVELS.includes(value.level as AutoQualityLevel)) return null;
    return { fingerprint: value.fingerprint, level: value.level as AutoQualityLevel };
  } catch {
    return null;
  }
}

function writeStored(storage: QualityStorage | null, value: StoredAutoQuality): void {
  try {
    storage?.setItem(AUTO_QUALITY_STORAGE_KEY, JSON.stringify(value));
  } catch { /* The level still applies to this session. */ }
}
