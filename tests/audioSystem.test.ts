import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { MusicManager } from '../src/audio/MusicManager';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Game } from '../src/core/Game';

describe('MusicManager', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('triggers the round-start music track on every roundStarted event', async () => {
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
    expect(playRoundStartOnce).toHaveBeenCalledTimes(1);
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

  it('reuses a single intro and loop player and lets the round-start track play out uncut', () => {
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
    // No auto-cut timer: the round-start track is left alone until something
    // else (pause/stop) touches it.
    expect(pauses.filter((src) => src.includes('zombies_round_start.mp3'))).toHaveLength(0);

    music.startBackgroundLoop();
    music.startBackgroundLoop();
    expect(plays.filter((src) => src.includes('zombies_background_loop.mp3'))).toHaveLength(1);

    music.pause();
    music.resume();
    expect(pauses.length).toBeGreaterThan(0);
    expect(plays.length).toBeGreaterThanOrEqual(2);
  });

  it('does not resume the background loop after stopBackgroundLoop is followed by resume', () => {
    const plays: string[] = [];

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
      });
    }

    vi.stubGlobal('Audio', FakeAudio);
    const music = new MusicManager();

    // Pause menu music starts, then the player resumes gameplay: stopping the
    // loop must not leave it eligible for the generic resume() call right
    // after (that was the bug that kept it playing through the whole match).
    music.startBackgroundLoop();
    music.stopBackgroundLoop();
    music.resume();

    expect(plays.filter((src) => src.includes('zombies_background_loop.mp3'))).toHaveLength(1);
  });
});

describe('Game pause resume', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests fullscreen from the mobile start gesture', () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('document', {
      fullscreenElement: null,
      documentElement: { requestFullscreen },
    });
    const game: any = Object.create((Game as any).prototype);
    game.audio = {
      resume: vi.fn(),
      music: { stopBackgroundLoop: vi.fn() },
      loadMysteryBoxOpenAsset: vi.fn().mockResolvedValue(undefined),
    };
    game.profile = { isMobile: true, useTouchControls: true };
    game.input = { requestPointerLock: vi.fn() };
    game.hud = { hidePauseMenu: vi.fn(), hideStartScreen: vi.fn(), setHudVisible: vi.fn() };

    game.start();

    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it('keeps gameplay paused until pointer lock is confirmed', () => {
    const game: any = Object.create((Game as any).prototype);
    game.paused = true;
    game.gameplayStarted = true;
    game.profile = { isMobile: false, useTouchControls: false };
    game.audio = {
      resume: vi.fn(),
      pauseMusic: vi.fn(),
      music: { stopBackgroundLoop: vi.fn() },
      loadMysteryBoxOpenAsset: vi.fn().mockResolvedValue(undefined),
    };
    game.input = { requestPointerLock: vi.fn() };
    game.hud = { showPauseMenu: vi.fn() };

    (Game as any).prototype.resume.call(game);

    expect(game.paused).toBe(true);
    expect(game.pointerLockRequested).toBe(true);
    expect(game.input.requestPointerLock).toHaveBeenCalledOnce();
  });

  it('resumes only after a fresh lock, even if an older unlock arrives first', () => {
    const game: any = Object.create((Game as any).prototype);
    game.paused = true;
    game.pointerLockRequested = true;
    game.gameplayStarted = true;
    game.profile = { useTouchControls: false };
    game.audio = { music: { stopBackgroundLoop: vi.fn() } };
    game.audio.resumeMusic = vi.fn();
    game.hud = {
      hidePauseMenu: vi.fn(),
      hideStartScreen: vi.fn(),
      setHudVisible: vi.fn(),
    };

    (Game as any).prototype.handlePointerLockChange.call(game, false);

    expect(game.paused).toBe(true);
    expect(game.pointerLockRequested).toBe(true);

    (Game as any).prototype.handlePointerLockChange.call(game, true);

    expect(game.paused).toBe(false);
    expect(game.pointerLockRequested).toBe(false);
    expect(game.hud.hidePauseMenu).toHaveBeenCalledOnce();
  });

  it('keeps a restart recoverable until desktop lock is confirmed', () => {
    const game: any = Object.create((Game as any).prototype);
    game.paused = true;
    game.gameplayStarted = true;
    game.profile = { isMobile: false, useTouchControls: false };
    game.audio = {
      resume: vi.fn(),
      pauseMusic: vi.fn(),
      stopMusic: vi.fn(),
      music: { stopBackgroundLoop: vi.fn() },
      loadMysteryBoxOpenAsset: vi.fn().mockResolvedValue(undefined),
    };
    game.input = { requestPointerLock: vi.fn() };
    game.hud = { showPauseMenu: vi.fn() };
    game.mode = {};

    (Game as any).prototype.restartRun.call(game);

    expect(game.paused).toBe(true);
    expect(game.hud.showPauseMenu).toHaveBeenCalledOnce();
    expect(game.input.requestPointerLock).toHaveBeenCalledOnce();
  });

  it('pauses an active desktop game when the real pointer lock is lost', () => {
    const game: any = Object.create((Game as any).prototype);
    game.paused = false;
    game.pointerLockRequested = false;
    game.gameplayStarted = true;
    game.profile = { useTouchControls: false };
    game.mode = { onPointerUnlock: vi.fn().mockReturnValue(false) };
    game.pause = vi.fn();

    (Game as any).prototype.handlePointerLockChange.call(game, false);

    expect(game.pause).toHaveBeenCalledOnce();
  });

  it('does not open pause over a mode-owned game-over screen', () => {
    const game: any = Object.create((Game as any).prototype);
    game.paused = false;
    game.pointerLockRequested = false;
    game.gameplayStarted = true;
    game.profile = { useTouchControls: false };
    game.mode = { onPointerUnlock: vi.fn().mockReturnValue(true) };
    game.pause = vi.fn();

    (Game as any).prototype.handlePointerLockChange.call(game, false);

    expect(game.pause).not.toHaveBeenCalled();
  });
});

describe('AudioSystem reload sound profiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses a distinct reload profile for each weapon style', () => {
    const audio = new AudioSystem() as any;
    const fakeCtx = {
      currentTime: 0,
      sampleRate: 44100,
      state: 'running',
      destination: {},
      createBufferSource: () => ({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }),
      createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
      createBiquadFilter: () => ({
        type: 'bandpass',
        frequency: { value: 0 },
        Q: { value: 0 },
        connect: vi.fn(),
      }),
      createGain: () => ({
        gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }),
      createOscillator: () => ({
        type: 'sine',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }),
    };

    audio.ctx = fakeCtx;
    audio.master = { connect: vi.fn() };
    audio.noiseBuffer = { getChannelData: () => new Float32Array(1) };

    const tickSpy = vi.spyOn(audio, 'tick').mockImplementation(() => {});

    audio.playReloadPhase('magOut', false, 'pistol');
    const pistol = tickSpy.mock.calls[0][1] as number;

    tickSpy.mockClear();
    audio.playReloadPhase('magOut', false, 'rock');
    const rock = tickSpy.mock.calls[0][1] as number;

    expect(rock).toBeLessThan(pistol);
  });

  it('layers a low receiver clack and crisp latch when a reload completes', () => {
    const audio = new AudioSystem() as any;
    const tickSpy = vi.spyOn(audio, 'tick').mockImplementation(() => {});
    const sweepSpy = vi.spyOn(audio, 'sweep').mockImplementation(() => {});

    audio.playReloadComplete(false, 'rifle');

    expect(tickSpy).toHaveBeenCalledTimes(4);
    expect(tickSpy.mock.calls[1][1] as number).toBeGreaterThan(tickSpy.mock.calls[0][1] as number);
    expect(tickSpy.mock.calls[2][0] as number).toBeGreaterThan(tickSpy.mock.calls[0][0] as number);
    expect(tickSpy.mock.calls[3][1] as number).toBeGreaterThan(tickSpy.mock.calls[2][1] as number);
    expect(sweepSpy).toHaveBeenCalledOnce();
  });

  it('routes the authoritative reloadEnd event to the completion sound', () => {
    const playReloadComplete = vi.fn();
    const clearEvents = vi.fn();
    const weapon = {
      definition: WEAPON_DEFINITIONS.m4a1,
      pendingEvents: [{ type: 'reloadEnd' }],
      clearEvents,
    };
    const game: any = Object.create((Game as any).prototype);
    game.mode = { id: 'test' };
    game.inventory = { currentWeapon: 'm4a1' };
    game.arsenal = new Map([['m4a1', { weapon, view: {} }]]);
    game.audio = { playReloadComplete };

    game.processWeaponEvents();

    expect(playReloadComplete).toHaveBeenCalledWith(false, 'rifle');
    expect(clearEvents).toHaveBeenCalledOnce();
  });

  it('gives the M1911 immediate pistol handling audio when reload starts', () => {
    const playReloadStart = vi.fn();
    const clearEvents = vi.fn();
    const weapon = {
      definition: WEAPON_DEFINITIONS.m1911,
      pendingEvents: [{ type: 'reloadStart' }],
      clearEvents,
    };
    const game: any = Object.create((Game as any).prototype);
    game.mode = { id: 'test' };
    game.inventory = { currentWeapon: 'm1911' };
    game.arsenal = new Map([['m1911', { weapon, view: {} }]]);
    game.audio = { playReloadStart };

    game.processWeaponEvents();

    expect(playReloadStart).toHaveBeenCalledWith(false, 'pistol');
    expect(clearEvents).toHaveBeenCalledOnce();
  });

  it('synthesizes two audible mechanical transients for the pistol reload start', () => {
    const audio = new AudioSystem() as any;
    const tickSpy = vi.spyOn(audio, 'tick').mockImplementation(() => {});
    const sweepSpy = vi.spyOn(audio, 'sweep').mockImplementation(() => {});

    audio.playReloadStart(false, 'pistol');

    expect(tickSpy).toHaveBeenCalledTimes(4);
    expect(sweepSpy).toHaveBeenCalledOnce();
    expect(tickSpy.mock.calls[0][2]).toBeGreaterThanOrEqual(0.4);
    expect(tickSpy.mock.calls[2][2]).toBeGreaterThanOrEqual(0.3);
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
