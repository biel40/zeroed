import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { EYE_HEIGHT } from '../src/player/PlayerController';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { ZombieArena } from '../src/zombies/maps/ZombieArena';
import { installCanvasDocument, makeContext } from './coopHarness';

const param = () => ({ value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });

/** Just enough Web Audio to build the jingle chain and count what it creates. */
class FakeAudioContext {
  readonly sampleRate = 8000;
  readonly state = 'running';
  readonly currentTime = 0;
  readonly destination = {};
  readonly sources: Array<{ buffer: { length: number } | null; loop: boolean; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = [];
  createGain() { return { gain: param(), connect: vi.fn() }; }
  createBiquadFilter() { return { type: '', frequency: param(), Q: param(), connect: vi.fn() }; }
  createStereoPanner() { return { pan: param(), connect: vi.fn() }; }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  createBufferSource() {
    const source = { buffer: null, loop: false, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    this.sources.push(source);
    return source;
  }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

describe('Ring machine jingle (audio)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts one seamless loop the first time it is audible, then only retunes it', () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no jingle file'))));
    const audio = new AudioSystem({ preload: vi.fn(), stopEndingAudio: vi.fn() } as never);
    audio.resume();
    const ctx = (audio as unknown as { ctx: FakeAudioContext }).ctx;
    const before = ctx.sources.length;

    audio.setRingJingle(0, 0, 0);
    expect(ctx.sources.length).toBe(before);

    audio.setRingJingle(1, 0.4, 0.2);
    expect(ctx.sources.length).toBe(before + 1);
    const loop = ctx.sources[before];
    expect(loop.loop).toBe(true);
    expect(loop.buffer!.length).toBe(8 * ctx.sampleRate);
    expect(loop.start).toHaveBeenCalledOnce();

    for (let frame = 0; frame < 60; frame++) audio.setRingJingle(frame % 2, 0, 0);
    expect(ctx.sources.length).toBe(before + 1);

    audio.dispose();
    expect(loop.stop).toHaveBeenCalled();
  });
});

describe('Ring machine jingle (Station 33)', () => {
  let restoreDocument: () => void;
  beforeAll(() => { restoreDocument = installCanvasDocument(); });
  afterAll(() => restoreDocument());

  function startRun() {
    const side = makeContext();
    const mode = new ZombiesMode('station-33');
    mode.init(side.ctx);
    const internals = mode as unknown as { arena: ZombieArena; rings: { updateJingle(audible: boolean): void } };
    return { side, mode, internals };
  }

  it('plays at the locker, fades with distance and is silent from the vestibule', () => {
    const { side, internals } = startRun();
    const [machine] = internals.arena.ringMachines!;
    const volumeAt = (x: number, z: number): number => {
      side.player.teleport(x, EYE_HEIGHT, z, 0);
      side.player.rig.updateMatrixWorld(true);
      internals.rings.updateJingle(true);
      return vi.mocked(side.ctx.audio.setRingJingle).mock.lastCall![0];
    };
    expect(volumeAt(machine.position.x - 1, machine.position.z)).toBe(1);
    const midway = volumeAt(machine.position.x - 6, machine.position.z);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(1);
    expect(volumeAt(6, 8.8)).toBe(0);
    expect(volumeAt(0, 15.2)).toBe(0);
  });

  it('falls silent when gameplay stops or the game is paused', () => {
    const { side, mode, internals } = startRun();
    const [machine] = internals.arena.ringMachines!;
    side.player.teleport(machine.position.x - 1, EYE_HEIGHT, machine.position.z, 0);
    side.player.rig.updateMatrixWorld(true);
    internals.rings.updateJingle(false);
    expect(side.ctx.audio.setRingJingle).toHaveBeenLastCalledWith(0, 0, 0);
    internals.rings.updateJingle(true);
    mode.onLocalPauseChanged(true);
    expect(side.ctx.audio.setRingJingle).toHaveBeenLastCalledWith(0, 0, 0);
  });
});
