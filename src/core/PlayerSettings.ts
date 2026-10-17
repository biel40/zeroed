/**
 * Player preferences adjustable at any time (main menu or pause menu). Values
 * are remembered in `localStorage`; consumers read them when they need them
 * or subscribe with `onSettingsChange` to apply them live.
 */
export interface PlayerSettings {
  /** 0..1 multipliers over the mixed levels; master scales both channels. */
  readonly masterVolume: number;
  readonly effectsVolume: number;
  readonly musicVolume: number;
  /** Multiplier over the base mouse/touch look speed. */
  readonly lookSensitivity: number;
  /** Extra multiplier over each weapon's own aiming sensitivity. */
  readonly adsSensitivity: number;
  readonly invertY: boolean;
  /** Hip-fire vertical field of view in degrees; aiming keeps each weapon's zoom. */
  readonly fieldOfView: number;
}

export type NumericSetting = {
  [K in keyof PlayerSettings]: PlayerSettings[K] extends number ? K : never;
}[keyof PlayerSettings];

export interface SettingRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export const SETTING_RANGES: Readonly<Record<NumericSetting, SettingRange>> = {
  masterVolume: { min: 0, max: 1, step: 0.05 },
  effectsVolume: { min: 0, max: 1, step: 0.05 },
  musicVolume: { min: 0, max: 1, step: 0.05 },
  lookSensitivity: { min: 0.1, max: 3, step: 0.05 },
  adsSensitivity: { min: 0.1, max: 2, step: 0.05 },
  fieldOfView: { min: 65, max: 95, step: 1 },
};

export const DEFAULT_SETTINGS: PlayerSettings = {
  masterVolume: 1,
  effectsVolume: 1,
  musicVolume: 1,
  lookSensitivity: 1,
  adsSensitivity: 1,
  invertY: false,
  fieldOfView: 75,
};

const STORAGE_KEY = 'zeroed.settings';

/** Fills missing or invalid fields with defaults and clamps numbers to their range. */
export function sanitizeSettings(raw: unknown): PlayerSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const settings: Record<string, number | boolean> = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(SETTING_RANGES) as NumericSetting[]) {
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const { min, max } = SETTING_RANGES[key];
    settings[key] = Math.min(max, Math.max(min, value));
  }
  if (typeof source.invertY === 'boolean') settings.invertY = source.invertY;
  return settings as unknown as PlayerSettings;
}

function storedSettings(): PlayerSettings {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return sanitizeSettings(value ? JSON.parse(value) : null);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let current: PlayerSettings = storedSettings();
const listeners = new Set<() => void>();

export function getSettings(): PlayerSettings {
  return current;
}

/** Applies a partial change, remembers it for later visits and notifies listeners. */
export function updateSettings(patch: Partial<PlayerSettings>): void {
  current = sanitizeSettings({ ...current, ...patch });
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch { /* The change still applies to this session. */ }
  for (const listener of listeners) listener();
}

export function resetSettings(): void {
  updateSettings(DEFAULT_SETTINGS);
}

export function onSettingsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Final gain factor for sound effects (master × effects). */
export function effectsGain(settings: PlayerSettings = current): number {
  return settings.masterVolume * settings.effectsVolume;
}

/** Final gain factor for music (master × music). */
export function musicGain(settings: PlayerSettings = current): number {
  return settings.masterVolume * settings.musicVolume;
}
