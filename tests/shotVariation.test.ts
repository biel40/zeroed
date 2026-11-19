import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { shotGainScale, shotPlaybackRate } from '../src/audio/ShotVariation';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';

const SPREAD = { pitch: 0.03, volume: 0.05 };

describe('shot variation', () => {
  it('spreads the playback rate evenly around the recorded pitch', () => {
    expect(shotPlaybackRate(SPREAD, () => 0)).toBeCloseTo(0.97);
    expect(shotPlaybackRate(SPREAD, () => 0.5)).toBeCloseTo(1);
    expect(shotPlaybackRate(SPREAD, () => 0.999999)).toBeCloseTo(1.03);
  });

  it('only ever lowers the gain, so overlapping shots never exceed the configured volume', () => {
    expect(shotGainScale(SPREAD, () => 0)).toBeCloseTo(1);
    expect(shotGainScale(SPREAD, () => 0.999999)).toBeCloseTo(0.95);
  });

  it('leaves a weapon without variation untouched', () => {
    expect(shotPlaybackRate(undefined, () => 0)).toBe(1);
    expect(shotGainScale(undefined, () => 0)).toBe(1);
  });
});

describe.each([
  ['AK-47', 'ak47', 'ak47_single_report.wav', 'ak47_auto_report.wav'],
  ['MP5', 'mp5', 'mp5a3_single_report.wav', 'mp5a3_auto_report.wav'],
  ['PPSh-41', 'ppsh41', 'ppsh41_single_shot.wav', 'ppsh41_auto_shot.wav'],
] as const)('%s samples by fire mode', (_name, id, singleFile, autoFile) => {
  afterEach(() => vi.restoreAllMocks());

  const config = WEAPON_DEFINITIONS[id].audio;

  it('ships both configured WAV files', () => {
    expect(config.sampleFile).toBe(singleFile);
    expect(config.autoSampleFile).toBe(autoFile);
    for (const file of [singleFile, autoFile]) {
      const wave = readFileSync(new URL(`../public/assets/audio/${file}`, import.meta.url));
      expect(wave.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wave.toString('ascii', 8, 12)).toBe('WAVE');
    }
  });

  it('precaches both takes and plays one sample per shot in the selected mode', () => {
    const audio = new AudioSystem();
    const system = audio as any;
    const single = { duration: 0.56 };
    const automatic = { duration: 0.096 };
    const optionalSample = vi.spyOn(system, 'optionalSample')
      .mockImplementation((file) => file === autoFile ? automatic : single);
    vi.spyOn(system, 'context').mockReturnValue({ master: {} });
    const playSample = vi.spyOn(system, 'playSample').mockImplementation(() => {});

    audio.preloadShotSample(config);
    expect(optionalSample.mock.calls.flat()).toEqual([singleFile, autoFile]);

    audio.playShot(config, 'auto');
    audio.playShot(config, 'auto');
    audio.playShot(config, 'semi');

    expect(playSample.mock.calls.map(([, sample]) => sample)).toEqual([automatic, automatic, single]);
  });

  it('routes the remote take through the spatial bus and falls back to the report while it loads', () => {
    const audio = new AudioSystem();
    const system = audio as any;
    const bus = {};
    const automatic = { duration: 0.096 };
    const cue = { pan: 0.5, attenuation: 0.4, muffle: 0 };
    const parts = { master: {} };
    vi.spyOn(system, 'context').mockReturnValue(parts);
    vi.spyOn(system, 'spatialBus').mockReturnValue(bus);
    const optionalSample = vi.spyOn(system, 'optionalSample').mockReturnValueOnce(automatic).mockReturnValue(null);
    const playSample = vi.spyOn(system, 'playSample').mockImplementation(() => {});
    const playReport = vi.spyOn(system, 'playReport').mockImplementation(() => {});

    audio.playRemoteShot(config, cue, 'auto');
    audio.playRemoteShot(config, cue, 'auto');

    expect(optionalSample).toHaveBeenCalledWith(autoFile);
    expect(playSample).toHaveBeenCalledExactlyOnceWith(
      parts, automatic, expect.any(Number), 0, bus, expect.any(Number), undefined,
    );
    expect(playReport).toHaveBeenCalledExactlyOnceWith(parts, config, expect.any(Number), bus);
  });
});

describe('M1911 sampled shot', () => {
  afterEach(() => vi.restoreAllMocks());

  function systemWithSample(file: string) {
    const audio = new AudioSystem() as any;
    const parts = { ctx: { currentTime: 4 }, master: {}, ambience: {}, noise: {} };
    audio.context = vi.fn(() => parts);
    audio.optionalSamples.set(file, { duration: 1.2 });
    const playSample = vi.spyOn(audio, 'playSample').mockImplementation(() => {});
    return { audio, parts, playSample };
  }

  it('plays the decoded MP3 at once with a subtle per-shot variation', () => {
    const config = WEAPON_DEFINITIONS.m1911.audio;
    expect(config.sampleFile).toBe('m1911_shot.mp3');
    const { audio, parts, playSample } = systemWithSample('m1911_shot.mp3');
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);

    audio.playShot(config);

    const [, , volume, lead, output, rate] = playSample.mock.calls[0];
    expect(volume).toBeCloseTo(config.volume * 0.95);
    expect(lead).toBe(0);
    expect(output).toBe(parts.master);
    expect(rate).toBeCloseTo(1.03);
  });

  it('keeps the Barrett sample exactly as before', () => {
    const config = WEAPON_DEFINITIONS.barrett.audio;
    const { audio, playSample } = systemWithSample(config.sampleFile!);

    audio.playShot(config);

    const [, , volume, , , rate] = playSample.mock.calls[0];
    expect(volume).toBe(config.volume);
    expect(rate).toBe(1);
  });

  it('varies a teammate M1911 heard through the spatial bus', () => {
    const config = WEAPON_DEFINITIONS.m1911.audio;
    const { audio, playSample } = systemWithSample('m1911_shot.mp3');
    const bus = {};
    vi.spyOn(audio, 'spatialBus').mockReturnValue(bus);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);

    audio.playRemoteShot(config, { pan: 0.5, attenuation: 0.4, muffle: 0 });

    const [, , , , output, rate] = playSample.mock.calls[0];
    expect(output).toBe(bus);
    expect(rate).toBeCloseTo(1.03);
  });
});
