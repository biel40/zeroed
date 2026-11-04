import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EndingCinematic } from '../src/rendering/EndingCinematic';
import { EVACUATION_ENDING_DURATION, EVACUATION_ENDING_TIMELINE as BEAT } from '../src/zombies/evacuation/EvacuationEndingTimeline';
import { Station33Arena } from '../src/zombies/maps/Station33Arena';
import {
  PROTOCOL33_DEPARTURE,
  PROTOCOL33_ENDING,
  PROTOCOL33_ESCAPE_HORDE,
  PROTOCOL33_SURFACE_Y,
  PROTOCOL33_TRUCK,
} from '../src/zombies/maps/Station33Config';
import type { ArenaAmbush } from '../src/zombies/maps/ZombieArena';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function makeArena(): Station33Arena {
  const arena = new Station33Arena(new THREE.Scene(), TEST_PROFILE);
  arena.init();
  return arena;
}

function named(arena: Station33Arena, name: string): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  arena.group.traverse((object) => { if (object.name === name) found.push(object); });
  return found;
}

/** Plays the departure for `seconds` in arena frames. */
function play(arena: Station33Arena, seconds: number, step = 0.05): void {
  for (let time = 0; time < seconds - 1e-9; time += step) arena.update(step);
}

describe('Station 33 filmed escape', () => {
  it('films the whole ending, its shots ending as the credits rise', () => {
    const shots = PROTOCOL33_ENDING.shots ?? [];
    expect(shots.length).toBeGreaterThan(1);
    const filmed = shots.reduce((total, shot) => total + shot.duration, 0);
    expect(filmed).toBeCloseTo(BEAT.credits, 6);
    expect(PROTOCOL33_ENDING.duration).toBe(EVACUATION_ENDING_DURATION);
    for (const shot of shots) {
      for (const key of shot.keys) {
        expect(key.time).toBeGreaterThanOrEqual(0);
        expect(key.time).toBeLessThanOrEqual(shot.duration + 1e-9);
      }
    }
  });

  it('keeps the camera above the ground and clear of every solid of the yard', () => {
    const arena = makeArena();
    arena.group.updateMatrixWorld(true);
    const solids = arena.colliders.map((object) => new THREE.Box3().setFromObject(object).expandByScalar(0.1));
    const player = new THREE.PerspectiveCamera(75, 16 / 9, 0.08, 700);
    const cinematic = new EndingCinematic(PROTOCOL33_ENDING.shots ?? []);
    cinematic.start(player);
    for (let time = 0; time < BEAT.credits; time += 0.05) {
      const position = cinematic.camera.position;
      expect(position.y, `t=${time.toFixed(2)}`).toBeGreaterThan(PROTOCOL33_SURFACE_Y + 0.25);
      for (const box of solids) expect(box.containsPoint(position), `t=${time.toFixed(2)}`).toBe(false);
      cinematic.update(0.05, player);
    }
  });

  it('waits parked at the gate until the ending starts', () => {
    const arena = makeArena();
    const [truck] = named(arena, 'surface-truck');
    play(arena, 6);
    expect(truck.position.z).toBe(PROTOCOL33_TRUCK.z);
    for (const leaf of named(arena, 'surface-gate-leaf')) expect(leaf.rotation.y).toBeCloseTo(0, 12);
  });

  it('rams the gate open and drives off down the road, carrying its beacon light', () => {
    const arena = makeArena();
    const [truck] = named(arena, 'surface-truck');
    const leaves = named(arena, 'surface-gate-leaf');
    expect(leaves).toHaveLength(2);
    const beacon = truck.children.find((child) => child instanceof THREE.PointLight);
    expect(beacon).toBeDefined();
    arena.startEnding();
    play(arena, BEAT.gateImpact - 0.1);
    expect(truck.position.z).toBeLessThan(PROTOCOL33_TRUCK.z);
    for (const leaf of leaves) expect(leaf.rotation.y).toBeCloseTo(0, 12);
    play(arena, 2);
    expect(Math.abs(leaves[0].rotation.y)).toBeGreaterThan(1);
    expect(leaves[0].rotation.y).toBeCloseTo(-leaves[1].rotation.y, 9);
    play(arena, 20);
    expect(truck.position.z).toBeCloseTo(PROTOCOL33_TRUCK.z - PROTOCOL33_DEPARTURE.maxDistance, 6);
  });

  it('asks for the horde at the stairhead once the truck has gone, retrying a refused spot', () => {
    const arena = makeArena();
    const asked: ArenaAmbush[] = [];
    let refuse = true;
    arena.onEndingZombie = (spot) => {
      asked.push(spot);
      if (!refuse) return true;
      refuse = false;
      return false;
    };
    play(arena, 12);
    expect(asked).toHaveLength(0);
    arena.startEnding();
    play(arena, PROTOCOL33_ESCAPE_HORDE.from - 0.1);
    expect(asked).toHaveLength(0);
    play(arena, 20);
    expect(asked).toHaveLength(PROTOCOL33_ESCAPE_HORDE.count + 1);
    for (const spot of asked) {
      expect(spot.floor).toBe(1);
      expect(spot.position.z).toBe(PROTOCOL33_ESCAPE_HORDE.doorway.z);
    }
    arena.reset();
    play(arena, 20);
    expect(asked).toHaveLength(PROTOCOL33_ESCAPE_HORDE.count + 1);
  });

  it('parks the truck again and shuts the gate on a new run', () => {
    const arena = makeArena();
    const [truck] = named(arena, 'surface-truck');
    arena.startEnding();
    play(arena, 10);
    arena.reset();
    expect(truck.position.z).toBe(PROTOCOL33_TRUCK.z);
    expect(truck.rotation.x).toBe(0);
    for (const leaf of named(arena, 'surface-gate-leaf')) expect(leaf.rotation.y).toBeCloseTo(0, 12);
    play(arena, 6);
    expect(truck.position.z).toBe(PROTOCOL33_TRUCK.z);
  });
});
