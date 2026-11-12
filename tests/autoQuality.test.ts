import { describe, expect, it } from 'vitest';
import {
  AUTO_QUALITY_STORAGE_KEY,
  classifyDevice,
  recordAutoQualityDowngrade,
  resolveAutoQuality,
  type DeviceSignals,
  type QualityStorage,
} from '../src/core/AutoQuality';
import { AutoQualityGovernor } from '../src/core/AutoQualityGovernor';
import { getQualityPreference, setQualityPreference } from '../src/core/DeviceProfile';

const DESKTOP_GPU = { webgl2: true, maxTextureSize: 16384, majorPerformanceCaveat: false, renderer: 'ANGLE (NVIDIA)' };
const PHONE_GPU = { webgl2: true, maxTextureSize: 8192, majorPerformanceCaveat: false, renderer: 'Adreno (TM) 740' };

function signals(overrides: Partial<DeviceSignals> = {}): DeviceSignals {
  return {
    isMobile: false,
    deviceMemory: 8,
    hardwareConcurrency: 16,
    reducedMotion: false,
    renderPixels: 2_073_600,
    gpu: DESKTOP_GPU,
    ...overrides,
  };
}

class MemoryStorage implements QualityStorage {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  public setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('Device classification', () => {
  it('rates a low-end Android phone Low', () => {
    expect(classifyDevice(signals({ isMobile: true, deviceMemory: 2, hardwareConcurrency: 8, gpu: PHONE_GPU }))).toBe('low');
    expect(classifyDevice(signals({ isMobile: true, deviceMemory: 4, hardwareConcurrency: 4, gpu: PHONE_GPU }))).toBe('low');
  });

  it('rates a mid-range Android phone Medium and a high-end one High', () => {
    expect(classifyDevice(signals({ isMobile: true, deviceMemory: 4, hardwareConcurrency: 8, gpu: PHONE_GPU }))).toBe('medium');
    expect(classifyDevice(signals({ isMobile: true, deviceMemory: 8, hardwareConcurrency: 8, gpu: PHONE_GPU }))).toBe('high');
  });

  it('rates a capable desktop High and a modest one Medium or Low', () => {
    expect(classifyDevice(signals())).toBe('high');
    expect(classifyDevice(signals({ deviceMemory: 4, hardwareConcurrency: 4 }))).toBe('medium');
    expect(classifyDevice(signals({ deviceMemory: 2, hardwareConcurrency: 2 }))).toBe('low');
  });

  it('rates software or blocklisted rendering Low whatever the CPU', () => {
    expect(classifyDevice(signals({ gpu: { ...DESKTOP_GPU, majorPerformanceCaveat: true } }))).toBe('low');
    expect(classifyDevice(signals({ gpu: { ...DESKTOP_GPU, renderer: 'Google SwiftShader' } }))).toBe('low');
  });

  it('keeps a high demand display off High unless the machine is clearly strong', () => {
    const fourK = 3840 * 2160;
    expect(classifyDevice(signals({ renderPixels: fourK, hardwareConcurrency: 6 }))).toBe('medium');
    expect(classifyDevice(signals({ renderPixels: fourK, hardwareConcurrency: 16 }))).toBe('high');
  });

  it('never trusts missing data enough to pick High on a phone', () => {
    const iPhone = signals({ isMobile: true, deviceMemory: null, hardwareConcurrency: null, renderPixels: null, gpu: null });
    expect(classifyDevice(iPhone)).toBe('medium');
  });

  it('does not penalize a desktop browser that hides its hardware', () => {
    expect(classifyDevice(signals({ deviceMemory: null, hardwareConcurrency: null, renderPixels: null, gpu: null }))).toBe('high');
  });
});

describe('Automatic quality persistence', () => {
  it('detects once and reuses the stored level while the environment is unchanged', () => {
    const storage = new MemoryStorage();
    expect(resolveAutoQuality(signals(), storage)).toBe('high');
    expect(storage.getItem(AUTO_QUALITY_STORAGE_KEY)).not.toBeNull();

    expect(recordAutoQualityDowngrade(signals(), 'high', storage)).toBe('medium');
    expect(resolveAutoQuality(signals(), storage)).toBe('medium');
  });

  it('downgrades one step at a time and stops at Low', () => {
    const storage = new MemoryStorage();
    expect(recordAutoQualityDowngrade(signals(), 'high', storage)).toBe('medium');
    expect(recordAutoQualityDowngrade(signals(), 'medium', storage)).toBe('low');
    expect(recordAutoQualityDowngrade(signals(), 'low', storage)).toBe('low');
    expect(resolveAutoQuality(signals(), storage)).toBe('low');
  });

  it('detects again when the rendering environment changes', () => {
    const storage = new MemoryStorage();
    recordAutoQualityDowngrade(signals(), 'high', storage);
    const newGpu = signals({ gpu: { ...DESKTOP_GPU, renderer: 'ANGLE (AMD)' } });
    expect(resolveAutoQuality(newGpu, storage)).toBe('high');
  });

  it('ignores a corrupted or foreign stored state', () => {
    const storage = new MemoryStorage();
    storage.setItem(AUTO_QUALITY_STORAGE_KEY, '{not json');
    expect(resolveAutoQuality(signals(), storage)).toBe('high');
    storage.setItem(AUTO_QUALITY_STORAGE_KEY, JSON.stringify({ fingerprint: 'x', level: 'ultraMax' }));
    expect(resolveAutoQuality(signals(), storage)).toBe('high');
  });

  it('keeps working without storage', () => {
    expect(resolveAutoQuality(signals(), null)).toBe('high');
    expect(recordAutoQualityDowngrade(signals(), 'high', null)).toBe('medium');
  });
});

describe('Quality preference', () => {
  it('preserves a saved legacy Ultra choice under the unified Ultra Max tier', () => {
    const storage = new MemoryStorage();
    storage.setItem('zeroed.quality', 'ultra');
    expect(getQualityPreference(storage)).toBe('ultraMax');
  });

  it('defaults to Auto and keeps a manual choice untouched by automatic downgrades', () => {
    const storage = new MemoryStorage();
    expect(getQualityPreference(storage)).toBe('auto');

    setQualityPreference('high', storage);
    recordAutoQualityDowngrade(signals(), 'high', storage);
    expect(getQualityPreference(storage)).toBe('high');

    setQualityPreference('auto', storage);
    expect(getQualityPreference(storage)).toBe('auto');
  });

  it('treats an unknown stored value as Auto', () => {
    const storage = new MemoryStorage();
    storage.setItem('zeroed.quality', 'potato');
    expect(getQualityPreference(storage)).toBe('auto');
  });
});

/** Feeds `seconds` of frames at `fps` with a fixed resolution scale. */
function play(governor: AutoQualityGovernor, fps: number, seconds: number, scale: number): void {
  const frames = Math.round(fps * seconds);
  for (let i = 0; i < frames; i++) governor.sample(1 / fps, scale);
}

describe('Automatic quality governor', () => {
  it('asks for a lower tier when frames stay slow despite a reduced resolution', () => {
    let downgrades = 0;
    const governor = new AutoQualityGovernor(() => downgrades++);
    play(governor, 35, 45, 0.5);
    expect(downgrades).toBe(1);
  });

  it('asks for a lower tier when the target is only held at a heavily reduced resolution', () => {
    let downgrades = 0;
    const governor = new AutoQualityGovernor(() => downgrades++);
    play(governor, 60, 45, 0.5);
    expect(downgrades).toBe(1);
  });

  it('stays put while the game holds its target', () => {
    let downgrades = 0;
    const governor = new AutoQualityGovernor(() => downgrades++);
    play(governor, 60, 120, 1);
    play(governor, 55, 120, 0.8);
    expect(downgrades).toBe(0);
  });

  it('ignores slow frames that fewer pixels could not fix (refresh caps, CPU-bound scenes)', () => {
    let downgrades = 0;
    const governor = new AutoQualityGovernor(() => downgrades++);
    play(governor, 30, 120, 1);
    expect(downgrades).toBe(0);
  });

  it('ignores the warm-up and short dips', () => {
    let downgrades = 0;
    const governor = new AutoQualityGovernor(() => downgrades++);
    play(governor, 20, 8, 0.5);
    for (let i = 0; i < 10; i++) {
      play(governor, 30, 3, 0.5);
      play(governor, 60, 12, 1);
    }
    expect(downgrades).toBe(0);
  });

  it('restarts its warm-up after a pause', () => {
    let downgrades = 0;
    const governor = new AutoQualityGovernor(() => downgrades++);
    play(governor, 60, 30, 1);
    governor.reset();
    // The first seconds after resuming may hitch and are not judged.
    play(governor, 10, 1, 0.5);
    play(governor, 60, 60, 1);
    expect(downgrades).toBe(0);
  });

  it('asks only once per match, so quality never oscillates', () => {
    let downgrades = 0;
    const governor = new AutoQualityGovernor(() => downgrades++);
    play(governor, 30, 300, 0.5);
    expect(downgrades).toBe(1);
  });
});
