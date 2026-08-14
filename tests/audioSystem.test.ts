import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { MusicManager } from '../src/audio/MusicManager';
import { Game } from '../src/core/Game';

describe('MusicManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not trigger the round-start music track from the roundStarted event', async () => {
    const { ZombiesMode } = await import('../src/modes/ZombiesMode');
    const mode: any = new ZombiesMode();
    const playRoundStartOnce = vi.fn();

    mode.ctx = {
      player: { rig: { position: { x: 0, z: 0 } } },
      hud: { showRoundBanner: vi.fn() },
      audio: {
        playRoundSting: vi.fn(),
        music: { playRoundStartOnce },
      },
    };
    mode.rounds = {
      pendingEvents: [{ type: 'roundStarted', round: 1, config: {} }],
      clearEvents: vi.fn(),
    };

    mode['processRoundEvents']();

    expect(mode.ctx.audio.playRoundSting).toHaveBeenCalledTimes(1);
    expect(playRoundStartOnce).not.toHaveBeenCalled();
  });

  it('preloads both zombie music tracks as soon as the audio system resumes', () => {
    const created: string[] = [];

    class FakeAudioContext {
      sampleRate = 44100;
      state = 'running';
      destination = {};

      createGain() {
        return {
          gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        };
      }

      createBufferSource() {
        return {
          buffer: null as AudioBuffer | null,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
      }

      createBuffer() {
        return {
          getChannelData: () => new Float32Array(1),
        };
      }

      createBiquadFilter() {
        return {
          type: 'lowpass',
          frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          Q: { value: 0 },
          connect: vi.fn(),
        };
      }

      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
      }

      resume = vi.fn(async () => {
        this.state = 'running';
      });
    }

    class FakeAudio {
      public currentTime = 0;
      public volume = 1;
      public loop = false;
      public paused = true;
      public ended = false;
      public readyState = 0;

      constructor(public readonly src: string) {
        created.push(src);
      }

      play = vi.fn(() => {
        this.paused = false;
        this.ended = false;
        this.readyState = 4;
        return Promise.resolve();
      });

      pause = vi.fn(() => {
        this.paused = true;
      });

      load = vi.fn(() => {
        this.readyState = 4;
      });
    }

    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('Audio', FakeAudio);

    const audio = new AudioSystem();
    audio.resume();

    expect(created).toEqual(
      expect.arrayContaining([
        expect.stringContaining('zombies_round_start.mp3'),
        expect.stringContaining('zombies_background_loop.mp3'),
      ]),
    );
  });

  it('reuses a single intro and loop player while slicing the intro to 3 seconds', () => {
    vi.useFakeTimers();
    const plays: string[] = [];
    const pauses: string[] = [];

    class FakeAudio {
      public currentTime = 0;
      public volume = 1;
      public loop = false;
      public paused = true;
      public ended = false;

      constructor(public readonly src: string) {}

      play = vi.fn(() => {
        this.paused = false;
        this.ended = false;
        plays.push(this.src);
        return Promise.resolve();
      });

      pause = vi.fn(() => {
        this.paused = true;
        pauses.push(this.src);
      });
    }

    vi.stubGlobal('Audio', FakeAudio);
    const music = new MusicManager();

    music.playRoundStartOnce();
    music.playRoundStartOnce();
    expect(plays.filter((src) => src.includes('zombies_round_start.mp3'))).toHaveLength(1);

    music.startBackgroundLoop();
    music.startBackgroundLoop();
    expect(plays.filter((src) => src.includes('zombies_background_loop.mp3'))).toHaveLength(1);

    music.pause();
    music.resume();
    expect(pauses.length).toBeGreaterThan(0);
    expect(plays.length).toBeGreaterThanOrEqual(2);

    vi.advanceTimersByTime(3000);
    expect(pauses.filter((src) => src.includes('zombies_round_start.mp3'))).toHaveLength(2);
  });
});

describe('Game pause resume', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('ignores stale pointer unlock events while the pause menu is resuming', () => {
    const game: any = Object.create((Game as any).prototype);
    game.paused = false;
    game.pointerLockResumeGuard = true;
    game.pause = vi.fn();

    (Game as any).prototype.handlePointerLockChange.call(game, false);

    expect(game.pause).not.toHaveBeenCalled();
  });

  it('hides the start screen when the lock is granted inside the guard window', () => {
    const game: any = Object.create((Game as any).prototype);
    game.paused = false;
    game.pointerLockResumeGuard = true;
    game.pointerLockGuardTimer = null;
    game.profile = { useTouchControls: false };
    game.hud = { hideStartScreen: vi.fn(), setHudVisible: vi.fn() };
    game.pause = vi.fn();

    (Game as any).prototype.handlePointerLockChange.call(game, true);

    expect(game.hud.hideStartScreen).toHaveBeenCalled();
  });
});

describe('AudioSystem mystery box open sound', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads the MP3 asset and plays it when the box opens', async () => {
    const starts: Array<{ source: string; buffer: AudioBuffer | null }> = [];

    class FakeAudioContext {
      sampleRate = 44100;
      state = 'running';
      destination = {};

      createGain() {
        return {
          gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        };
      }

      createBufferSource() {
        return {
          buffer: null as AudioBuffer | null,
          connect: vi.fn(),
          start: vi.fn(function (this: { buffer: AudioBuffer | null }) {
            starts.push({ source: 'buffer', buffer: this.buffer ?? null });
          }),
          stop: vi.fn(),
        };
      }

      createBuffer() {
        return {
          getChannelData: () => new Float32Array(1),
        };
      }

      createBiquadFilter() {
        return {
          type: 'lowpass',
          frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          Q: { value: 0 },
          connect: vi.fn(),
        };
      }

      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
      }

      decodeAudioData = vi.fn(async () => ({}) as AudioBuffer);
      resume = vi.fn(async () => {
        this.state = 'running';
      });
    }

    // @ts-expect-error: test-only browser API stub for Vitest
    globalThis.AudioContext = FakeAudioContext;

    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const audio = new AudioSystem();
    audio.resume();

    await audio.loadMysteryBoxOpenAsset();
    audio.playMysteryBoxOpen();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('mystery_box_open.mp3'));
    expect(starts.length).toBeGreaterThan(0);
  });
});
