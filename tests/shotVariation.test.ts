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
