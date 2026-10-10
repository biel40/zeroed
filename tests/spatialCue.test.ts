import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { cameraSpatialCue, muffleCutoff, spatialCue, spatialMuffle, voicePoint } from '../src/audio/SpatialCue';

/**
 * Directional zombie audio: the cue must tell left from right, front from
 * back and this floor from another one, with no scene or AudioContext.
 * Listener at eye height looking down -Z (Three.js camera default).
 */
const EYE = { x: 0, y: 1.7, z: 0 };
const FORWARD = { x: 0, y: 0, z: -1 };

describe('spatialCue', () => {
  it('pans toward the side the source is on', () => {
    expect(spatialCue(EYE, FORWARD, { x: 5, y: 1.7, z: 0 }).pan).toBeCloseTo(1);
    expect(spatialCue(EYE, FORWARD, { x: -5, y: 1.7, z: 0 }).pan).toBeCloseTo(-1);
    expect(spatialCue(EYE, FORWARD, { x: 0, y: 1.7, z: -5 }).pan).toBeCloseTo(0);
  });

  it('muffles sources behind the listener so front and back differ', () => {
    const front = spatialCue(EYE, FORWARD, { x: 0, y: 1.7, z: -5 });
    const side = spatialCue(EYE, FORWARD, { x: 5, y: 1.7, z: 0 });
    const behind = spatialCue(EYE, FORWARD, { x: 0, y: 1.7, z: 5 });
    expect(front.muffle).toBe(0);
    expect(side.muffle).toBe(0);
    expect(behind.muffle).toBeGreaterThan(0.5);
    // Same pan, so without the muffle front and back would sound identical.
    expect(behind.pan).toBeCloseTo(front.pan);
  });

  it('muffles a zombie on another floor but not one on the same floor', () => {
    const sameFloor = spatialCue(EYE, FORWARD, voicePoint({ x: 0, y: 0, z: -5 }));
    const upstairs = spatialCue(EYE, FORWARD, voicePoint({ x: 0, y: 3.4, z: -5 }));
    const bunker = spatialCue(EYE, FORWARD, voicePoint({ x: 0, y: -3.4, z: -5 }));
    expect(sameFloor.muffle).toBe(0);
    expect(upstairs.muffle).toBeGreaterThan(0.8);
    expect(bunker.muffle).toBeGreaterThan(0.8);
  });

  it('exposes the same muffle without building a cue (per-frame footsteps)', () => {
    for (const source of [{ x: 0, y: 1.7, z: 5 }, { x: 3, y: 4.9, z: -2 }, { x: -2, y: 1.7, z: 1 }]) {
      expect(spatialMuffle(EYE, FORWARD, source)).toBe(spatialCue(EYE, FORWARD, source).muffle);
    }
  });

  it('fades with distance but keeps far threats audible', () => {
    const near = spatialCue(EYE, FORWARD, { x: 0, y: 1.7, z: -1 });
    const mid = spatialCue(EYE, FORWARD, { x: 0, y: 1.7, z: -10 });
    const far = spatialCue(EYE, FORWARD, { x: 0, y: 1.7, z: -200 });
    expect(near.attenuation).toBe(1);
    expect(mid.attenuation).toBeLessThan(near.attenuation);
    expect(far.attenuation).toBeCloseTo(0.18);
  });

  it('stays centered and open for a source at the listener or a vertical gaze', () => {
    expect(spatialCue(EYE, FORWARD, EYE)).toEqual({ pan: 0, attenuation: 1, muffle: 0 });
    expect(spatialCue(EYE, { x: 0, y: -1, z: 0 }, { x: 4, y: 1.7, z: 0 }).pan).toBe(0);
  });

  it('reads the first-person camera orientation', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 0);
    camera.rotation.y = Math.PI; // now facing +Z
    camera.updateMatrixWorld(true);
    expect(cameraSpatialCue(camera, { x: 0, y: 1.7, z: 5 }).muffle).toBe(0);
    expect(cameraSpatialCue(camera, { x: 0, y: 1.7, z: -5 }).muffle).toBeGreaterThan(0.5);
    expect(cameraSpatialCue(camera, { x: -5, y: 1.7, z: 0 }).pan).toBeCloseTo(1);
  });
});

describe('muffleCutoff', () => {
  it('closes monotonically from fully open to a dull low-pass', () => {
    expect(muffleCutoff(0)).toBe(20000);
    expect(muffleCutoff(0.5)).toBeLessThan(muffleCutoff(0.2));
    expect(muffleCutoff(1)).toBeCloseTo(750);
    expect(muffleCutoff(5)).toBeCloseTo(750);
  });
});

describe('AudioSystem spatial bus', () => {
  function fakeAudio() {
    const nodes: Array<{ kind: string; node: any }> = [];
    const param = () => ({ value: 0 });
    const ctx = {
      createGain: () => {
        const node = { gain: param(), connect: vi.fn() };
        nodes.push({ kind: 'gain', node });
        return node;
      },
      createBiquadFilter: () => {
        const node = { type: '', frequency: param(), Q: param(), connect: vi.fn() };
        nodes.push({ kind: 'filter', node });
        return node;
      },
      createStereoPanner: () => {
        const node = { pan: param(), connect: vi.fn() };
        nodes.push({ kind: 'panner', node });
        return node;
      },
    };
    return { audio: { ctx, master: {}, noise: {} }, nodes };
  }

  it('routes a cue from behind through a low-pass before the gain', () => {
    const system = new AudioSystem() as any;
    const { audio, nodes } = fakeAudio();
    const input = system.spatialBus(audio, { pan: -0.4, attenuation: 0.7, muffle: 0.6 });
    const filter = nodes.find((entry) => entry.kind === 'filter')!.node;
    const gain = nodes.find((entry) => entry.kind === 'gain')!.node;
    expect(input.pan.value).toBeCloseTo(-0.4);
    expect(input.connect).toHaveBeenCalledWith(filter);
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.value).toBeCloseTo(muffleCutoff(0.6));
    expect(filter.connect).toHaveBeenCalledWith(gain);
    expect(gain.gain.value).toBeCloseTo(0.7);
  });

  it('skips the filter for open cues and honors a minimum attenuation', () => {
    const system = new AudioSystem() as any;
    const { audio, nodes } = fakeAudio();
    system.spatialBus(audio, { pan: 0, attenuation: 0.2, muffle: 0 }, 0.6);
    expect(nodes.some((entry) => entry.kind === 'filter')).toBe(false);
    expect(nodes.find((entry) => entry.kind === 'gain')!.node.gain.value).toBeCloseTo(0.6);
  });
});
