import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EndingCinematic } from '../src/rendering/EndingCinematic';
import type { ArenaEndingShot } from '../src/zombies/maps/ZombieArena';

const SHOTS: ReadonlyArray<ArenaEndingShot> = [
  {
    duration: 2,
    keys: [
      { time: 0, position: { x: 0, y: 1, z: 0 }, target: { x: 0, y: 1, z: -10 } },
      { time: 2, position: { x: 4, y: 1, z: 0 }, target: { x: 4, y: 1, z: -10 } },
    ],
  },
  {
    duration: 3,
    keys: [
      { time: 0, position: { x: 50, y: 10, z: 50 }, target: { x: 0, y: 0, z: 0 } },
      { time: 3, position: { x: 50, y: 20, z: 50 }, target: { x: 0, y: 0, z: 0 } },
    ],
  },
];

function playerCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 500);
}

describe('EndingCinematic', () => {
  it('films each shot along its own keys', () => {
    const cinematic = new EndingCinematic(SHOTS);
    const player = playerCamera();
    cinematic.start(player);
    expect(cinematic.isPlaying).toBe(true);
    expect(cinematic.camera.position.toArray()).toEqual([0, 1, 0]);
    cinematic.update(1, player);
    expect(cinematic.camera.position.x).toBeCloseTo(2);
    expect(cinematic.camera.position.z).toBeCloseTo(0);
  });

  it('cuts hard to the next shot instead of travelling between them', () => {
    const cinematic = new EndingCinematic(SHOTS);
    const player = playerCamera();
    cinematic.start(player);
    cinematic.update(1.99, player);
    expect(cinematic.camera.position.x).toBeLessThan(5);
    cinematic.update(0.02, player);
    expect(cinematic.camera.position.x).toBeCloseTo(50);
    expect(cinematic.camera.position.y).toBeGreaterThanOrEqual(10);
  });

  it('holds the last frame once every shot has played', () => {
    const cinematic = new EndingCinematic(SHOTS);
    const player = playerCamera();
    cinematic.start(player);
    cinematic.update(30, player);
    expect(cinematic.camera.position.toArray()).toEqual([50, 20, 50]);
    expect(cinematic.isPlaying).toBe(true);
    cinematic.stop();
    expect(cinematic.isPlaying).toBe(false);
  });

  it('shakes deterministically, only in shots that ask for it', () => {
    const shaken: ReadonlyArray<ArenaEndingShot> = [{ ...SHOTS[0], shake: 0.05 }];
    const sample = (shots: ReadonlyArray<ArenaEndingShot>): THREE.Vector3 => {
      const cinematic = new EndingCinematic(shots);
      const player = playerCamera();
      cinematic.start(player);
      cinematic.update(0.7, player);
      return cinematic.camera.position.clone();
    };
    const calm = sample(SHOTS);
    const first = sample(shaken);
    expect(first.distanceTo(calm)).toBeGreaterThan(0);
    expect(first.distanceTo(calm)).toBeLessThanOrEqual(0.05 * Math.sqrt(3) + 1e-9);
    expect(sample(shaken).equals(first)).toBe(true);
  });

  it('follows the player camera lens', () => {
    const cinematic = new EndingCinematic(SHOTS);
    const player = playerCamera();
    cinematic.start(player);
    player.aspect = 4 / 3;
    cinematic.update(0.1, player);
    expect(cinematic.camera.aspect).toBeCloseTo(4 / 3);
    expect(cinematic.camera.fov).toBe(70);
  });
});
