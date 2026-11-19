import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { MANSION_AMBIENCE, MANSION_AMBIENT_EVENTS } from '../src/zombies/maps/BurnedMansionConfig';
import { STATION33_AMBIENCE } from '../src/zombies/maps/Station33Config';

function param() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

/** Records every node so tests can follow the graph without a browser. */
class FakeAudioContext {
  public static last: FakeAudioContext | null = null;
  public state: AudioContextState = 'running';
  public currentTime = 0;
  public readonly sampleRate = 8;
  public readonly destination = {};
  public readonly gains: Array<{ gain: ReturnType<typeof param>; connect: ReturnType<typeof vi.fn> }> = [];
  public readonly sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  public readonly suspend = vi.fn(async () => { this.state = 'suspended'; });
  public readonly resume = vi.fn(async () => { this.state = 'running'; });
  public readonly close = vi.fn(async () => { this.state = 'closed'; });

  public constructor() {
    FakeAudioContext.last = this;
  }

  public createGain() {
    const node = { gain: param(), connect: vi.fn() };
    this.gains.push(node);
    return node;
  }

  public createBiquadFilter() {
    return { type: '', frequency: param(), Q: param(), connect: vi.fn() };
  }

  public createStereoPanner() {
    return { pan: param(), connect: vi.fn() };
  }

  public createBuffer() {
    return { getChannelData: () => new Float32Array(8) };
  }

  public async decodeAudioData(data: ArrayBuffer): Promise<Pick<AudioBuffer, 'duration'>> {
    return { duration: new Uint8Array(data)[0] / 10 };
  }

  public createBufferSource() {
    const node = { buffer: null, loop: false, playbackRate: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    this.sources.push(node);
    return node;
  }

  public createOscillator() {
    const node = { type: '', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    this.sources.push(node);
    return node;
  }
}

function startedSystem(): { audio: AudioSystem; ctx: FakeAudioContext } {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  const audio = new AudioSystem();
  audio.resume();
  return { audio, ctx: FakeAudioContext.last! };
}

/** The ambience bus is the second gain the graph creates, right after the master. */
function ambienceGain(ctx: FakeAudioContext) {
  return ctx.gains[1].gain;
}

afterEach(() => {
  FakeAudioContext.last = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Map ambient beds', () => {
  it('waits for the audio graph, then fades the requested bed in and out without leaking sources', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const audio = new AudioSystem();
    audio.setAmbientBed('wind');
    expect(FakeAudioContext.last).toBeNull();

    audio.resume();
    const ctx = FakeAudioContext.last!;
    const bedSources = [...ctx.sources];
    expect(bedSources.length).toBeGreaterThan(0);
    expect(bedSources.every((source) => source.start.mock.calls.length === 1)).toBe(true);

    audio.setAmbientBed('wind');
    expect(ctx.sources).toHaveLength(bedSources.length);

    audio.setAmbientBed('mains-hum');
    expect(bedSources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    // Stopped after a fade, never cut on the spot.
    expect(bedSources[0].stop.mock.calls[0][0]).toBeGreaterThan(ctx.currentTime);

    const humSources = ctx.sources.slice(bedSources.length);
    audio.dispose();
    expect(humSources.every((source) => source.stop.mock.calls.length === 1)).toBe(true);
    expect(ctx.close).toHaveBeenCalledOnce();
  });

  it('gives each map its own bed', () => {
    expect(MANSION_AMBIENCE.ambientBed).toBe('wind');
    expect(STATION33_AMBIENCE.ambientBed).toBe('mains-hum');
  });
});

describe('Ambience mix', () => {
  it('drops into a quiet break when a round ends and builds back on the next one', () => {
    const { audio, ctx } = startedSystem();
    const gain = ambienceGain(ctx);

    audio.playRoundEndCue();
    const breakLevel = gain.setTargetAtTime.mock.calls.at(-1)![0];
    expect(breakLevel).toBeGreaterThan(0);
    expect(breakLevel).toBeLessThan(0.5);

    audio.playRoundStartCue();
    const [roundLevel, , timeConstant] = gain.setTargetAtTime.mock.calls.at(-1)!;
    expect(roundLevel).toBe(1);
    // A slow build-up, not a jump.
    expect(timeConstant).toBeGreaterThan(1);
  });

  it('starts a round without a synthetic sting; the round MP3 is the only cue', () => {
    const { audio, ctx } = startedSystem();
    const sources = ctx.sources.length;

    audio.playRoundStartCue();

    expect(ctx.sources.length).toBe(sources);
  });

  it('hushes the ambience while paused and restores the current round level', () => {
    const { audio, ctx } = startedSystem();
    const gain = ambienceGain(ctx);
    audio.playRoundEndCue();
    const breakLevel = gain.setTargetAtTime.mock.calls.at(-1)![0];

    audio.setAmbienceSuspended(true);
    expect(gain.setTargetAtTime.mock.calls.at(-1)![0]).toBe(0);
    // Pausing twice adds no automation.
    const calls = gain.setTargetAtTime.mock.calls.length;
    audio.setAmbienceSuspended(true);
    expect(gain.setTargetAtTime.mock.calls).toHaveLength(calls);

    audio.setAmbienceSuspended(false);
    expect(gain.setTargetAtTime.mock.calls.at(-1)![0]).toBe(breakLevel);
  });

  it('routes map cues through the ambience bus and zombie voices around it', () => {
    const { audio, ctx } = startedSystem();
    const system = audio as any;
    const busSpy = vi.spyOn(system, 'spatialBus');
    audio.playAmbientCue({ sound: 'wood-creak' }, { pan: 0, attenuation: 1, muffle: 0 });
    expect(busSpy.mock.calls[0][3]).toBe(ctx.gains[1]);
    const voiceGainIndex = ctx.gains.length;
    audio.playZombieMoan({ pan: 0, attenuation: 1, muffle: 0 });
    expect(ctx.gains[voiceGainIndex].connect).toHaveBeenCalledWith(ctx.gains[0]);
  });
});

describe('Backgrounding', () => {
  function fakeDocument() {
    const listeners = new Map<string, () => void>();
    return {
      visibilityState: 'visible',
      addEventListener: vi.fn((type: string, listener: () => void) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string) => listeners.delete(type)),
      fire(state: 'visible' | 'hidden') {
        this.visibilityState = state;
        listeners.get('visibilitychange')?.();
      },
      listeners,
    };
  }

  it('suspends the effects context while hidden and resumes only what it suspended', () => {
    const document = fakeDocument();
    vi.stubGlobal('document', document);
    const { audio, ctx } = startedSystem();

    document.fire('hidden');
    expect(ctx.suspend).toHaveBeenCalledOnce();
    document.fire('visible');
    expect(ctx.resume).toHaveBeenCalledOnce();

    // A context that was never running stays as the user gesture left it.
    ctx.state = 'suspended';
    document.fire('hidden');
    document.fire('visible');
    expect(ctx.suspend).toHaveBeenCalledOnce();
    expect(ctx.resume).toHaveBeenCalledOnce();

    audio.dispose();
    expect(document.listeners.has('visibilitychange')).toBe(false);
  });
});

describe('Zombie voice budget', () => {
  it('caps a horde of distant groans but keeps room for the zombie at arm\'s length', () => {
    const { audio } = startedSystem();
    const busSpy = vi.spyOn(audio as any, 'spatialBus');
    const far = { pan: 0, attenuation: 0.2, muffle: 0 };
    for (let index = 0; index < 12; index++) audio.playZombieSpawn(far);
    const farVoices = busSpy.mock.calls.length;
    expect(farVoices).toBeGreaterThan(0);
    expect(farVoices).toBeLessThan(5);

    audio.playZombieSpawn({ pan: 0.2, attenuation: 0.95, muffle: 0 });
    expect(busSpy.mock.calls).toHaveLength(farVoices + 1);
  });

  it('keeps a recorded voice slot for the full clip and still reserves space for nearby threats', async () => {
    stubZombieVoiceFiles({ 'spawn_1.mp3': 25 });
    const { audio, ctx } = startedSystem();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const sources = vi.spyOn(ctx, 'createBufferSource');
    const far = { pan: -0.4, attenuation: 0.2, muffle: 0.5 };
    const near = { pan: 0.2, attenuation: 0.95, muffle: 0 };

    for (let index = 0; index < 3; index++) audio.playZombieSpawn(far);
    expect(sources).toHaveBeenCalledTimes(3);

    ctx.currentTime = 1;
    audio.playZombieSpawn(far);
    expect(sources).toHaveBeenCalledTimes(3);
    audio.playZombieSpawn(near);
    expect(sources).toHaveBeenCalledTimes(4);

    ctx.currentTime = 2.5;
    audio.playZombieSpawn(far);
    expect(sources).toHaveBeenCalledTimes(5);
  });
});

function stubZombieVoiceFiles(clips: Readonly<Record<string, number>>) {
  const fetchSample = vi.fn(async (url: string) => {
    const durationTenths = clips[url.split('/').at(-1)!];
    return durationTenths === undefined
      ? { ok: false, status: 404 }
      : { ok: true, arrayBuffer: async () => Uint8Array.of(durationTenths).buffer };
  });
  vi.stubGlobal('fetch', fetchSample);
  return fetchSample;
}

describe('Recorded zombie voices', () => {
  it('falls back while loading, then cycles through the available recordings on the spatial bus', async () => {
    const fetchSample = stubZombieVoiceFiles({ 'moan_1.mp3': 12, 'moan_3.mp3': 15 });
    const { audio, ctx } = startedSystem();
    const cue = { pan: -0.5, attenuation: 0.7, muffle: 0.4 };
    const oscillators = vi.spyOn(ctx, 'createOscillator');
    audio.playZombieMoan(cue);
    expect(oscillators).toHaveBeenCalled();

    await new Promise<void>((resolve) => setImmediate(resolve));
    audio.resume();
    const panners = vi.spyOn(ctx, 'createStereoPanner');
    const sources = vi.spyOn(ctx, 'createBufferSource');
    oscillators.mockClear();
    for (const time of [3, 6, 9]) {
      ctx.currentTime = time;
      audio.playZombieMoan(cue);
    }

    expect(oscillators).not.toHaveBeenCalled();
    expect(sources.mock.results.map(({ value }) => value.buffer)).toEqual([
      { duration: 1.2 }, { duration: 1.5 }, { duration: 1.2 },
    ]);
    expect(panners.mock.results.map(({ value }) => value.pan.value)).toEqual([-0.5, -0.5, -0.5]);
    expect(fetchSample).toHaveBeenCalledTimes(4);
  });

  it('moves and damps the playing sample without retriggering it', async () => {
    stubZombieVoiceFiles({ 'moan_1.mp3': 15 });
    const { audio, ctx } = startedSystem();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const panners = vi.spyOn(ctx, 'createStereoPanner');
    const filters = vi.spyOn(ctx, 'createBiquadFilter');
    const sources = vi.spyOn(ctx, 'createBufferSource');
    const playback = audio.playZombieMoan({ pan: 0.7, attenuation: 0.95, muffle: 0 })!;
    const { pan } = panners.mock.results[0].value;
    const { frequency } = filters.mock.results[0].value;
    expect(pan.value).toBe(0.7);
    expect(ctx.gains[3].gain.value).toBeGreaterThan(0.4);

    ctx.currentTime = 0.2;
    expect(playback.update({ pan: -0.8, attenuation: 0.6, muffle: 0.6 })).toBe(true);
    expect(pan.setTargetAtTime).toHaveBeenCalledWith(-0.8, 0.2, expect.any(Number));
    expect(frequency.setTargetAtTime.mock.calls[0][0]).toBeLessThan(frequency.value);
    expect(ctx.gains[2].gain.setTargetAtTime).toHaveBeenCalledWith(0.6, 0.2, expect.any(Number));
    expect(sources).toHaveBeenCalledOnce();

    ctx.currentTime = 1.5;
    expect(playback.update({ pan: 0, attenuation: 1, muffle: 0 })).toBe(false);
  });
});

describe('Teammate gunfire', () => {
  it('plays the report from the teammate position without the local gun foley', () => {
    const { audio } = startedSystem();
    const system = audio as any;
    const busSpy = vi.spyOn(system, 'spatialBus');
    const tailSpy = vi.spyOn(system, 'playShotTail');
    const clangSpy = vi.spyOn(system, 'metalClang');
    const cue = { pan: -0.7, attenuation: 0.4, muffle: 0.3 };

    audio.playRemoteShot(WEAPON_DEFINITIONS.m1911.audio, cue);

    expect(busSpy).toHaveBeenCalledOnce();
    expect(busSpy.mock.calls[0][1]).toBe(cue);
    expect(tailSpy).not.toHaveBeenCalled();
    expect(clangSpy).not.toHaveBeenCalled();
  });
});

describe('Burned Mansion ambience events', () => {
  it('spaces its sounds with long silences', () => {
    expect(MANSION_AMBIENT_EVENTS.length).toBeGreaterThan(2);
    for (const event of MANSION_AMBIENT_EVENTS) {
      expect(event.minInterval).toBeGreaterThanOrEqual(30);
      expect(event.maxInterval).toBeGreaterThan(event.minInterval);
      expect(event.initialDelay).toBeGreaterThan(0);
    }
  });
});
