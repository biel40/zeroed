import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ArenaAmbientCue } from '../src/zombies/maps/ZombieArena';
import { Station33Arena } from '../src/zombies/maps/Station33Arena';
import {
  KOVKA_FORGE_CUE, KOVKA_FORGE_DISCHARGE_CUE, KOVKA_FORGE_SURGE_CUE, KOVKA_UPGRADE_MACHINE,
} from '../src/zombies/maps/Station33Config';
import { KOVKA_REACTOR_DRIVE, KovkaReactorDrive, type KovkaReactorEvent } from '../src/zombies/maps/station33/KovkaReactorDrive';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

const FORGE = KOVKA_UPGRADE_MACHINE.forgeSeconds;

/** Runs a whole forge at `fps` and then `after` idle seconds, collecting the drive's events. */
function runForge(drive: KovkaReactorDrive, fps: number, after = 0): KovkaReactorEvent[] {
  const events: KovkaReactorEvent[] = [];
  const dt = 1 / fps;
  const record = (event: KovkaReactorEvent): void => { events.push(event); };
  // The machine reports its progress while it forges and null from the frame it is done.
  for (let t = 0; t < FORGE - 1e-9; t += dt) {
    const progress = (t + dt) / FORGE;
    drive.update(dt, progress < 1 - 1e-9 ? progress : null, record);
  }
  for (let t = 0; t < after - 1e-9; t += dt) drive.update(dt, null, record);
  return events;
}

describe('KOVKA reactor drive', () => {
  it('lies dormant while nothing forges', () => {
    const drive = new KovkaReactorDrive();
    drive.update(1, null);
    expect(drive.charge).toBe(0);
    expect(drive.flash).toBe(0);
    expect(drive.active).toBe(false);
  });

  it('spins up as the forge starts and builds to a crescendo before it ends', () => {
    const drive = new KovkaReactorDrive();
    const angle = drive.spin;
    let early = 0;
    for (let t = 0; t < 1.5; t += 1 / 60) drive.update(1 / 60, t / FORGE);
    early = drive.charge;
    expect(early).toBeGreaterThan(0.2);
    expect(drive.spin).not.toBe(angle);
    for (let t = 1.5; t < FORGE - 0.1; t += 1 / 60) drive.update(1 / 60, t / FORGE);
    expect(drive.charge).toBeGreaterThan(early);
    expect(drive.charge).toBeGreaterThan(0.85);
    expect(drive.active).toBe(true);
  });

  it.each([30, 60, 144])('surges at the same beats at %i fps and discharges once when the forge ends', (fps) => {
    const drive = new KovkaReactorDrive();
    const events = runForge(drive, fps);
    const surges = events.filter((event) => event === 'surge').length;
    const expected = Math.floor((FORGE * KOVKA_REACTOR_DRIVE.lastSurgeShare - KOVKA_REACTOR_DRIVE.firstSurge) / KOVKA_REACTOR_DRIVE.surgeInterval) + 1;
    expect(surges).toBe(expected);
    expect(surges).toBeGreaterThanOrEqual(3);
    expect(events.filter((event) => event === 'discharge')).toHaveLength(1);
    expect(events[events.length - 1]).toBe('discharge');
    expect(drive.flash).toBeGreaterThan(0.8);
  });

  it('runs down and goes dark within a few seconds of the discharge', () => {
    const drive = new KovkaReactorDrive();
    runForge(drive, 60, KOVKA_REACTOR_DRIVE.windDown + 1);
    expect(drive.flash).toBe(0);
    expect(drive.charge).toBe(0);
    expect(drive.active).toBe(false);
  });

  it('a reset in the middle of a forge goes dark without a discharge', () => {
    const drive = new KovkaReactorDrive();
    for (let t = 0; t < 3; t += 1 / 60) drive.update(1 / 60, t / FORGE);
    drive.reset();
    const events: KovkaReactorEvent[] = [];
    drive.update(1 / 60, null, (event) => events.push(event));
    expect(events).toEqual([]);
    expect(drive.active).toBe(false);
  });
});

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

const PARTS = ['kovka-reactor-iris', 'kovka-reactor-coil-ring', 'kovka-reactor-arcs', 'kovka-reactor-bloom'] as const;

function arenaWithCues(profile = TEST_PROFILE): { arena: Station33Arena; cues: ArenaAmbientCue[] } {
  const arena = new Station33Arena(new THREE.Scene(), profile);
  arena.init();
  arena.switchOnPower();
  const cues: ArenaAmbientCue[] = [];
  arena.onAmbientCue = (cue) => {
    if ([KOVKA_FORGE_CUE, KOVKA_FORGE_SURGE_CUE, KOVKA_FORGE_DISCHARGE_CUE].includes(cue)) cues.push(cue);
  };
  return { arena, cues };
}

const part = (arena: Station33Arena, name: string): THREE.Object3D => {
  const object = arena.group.getObjectByName(name);
  if (!object) throw new Error(`No ${name} on the reactor`);
  return object;
};

describe('KOVKA reactor while the forge runs', () => {
  it('stays dark and still while nothing forges', () => {
    const { arena, cues } = arenaWithCues();
    arena.update(2);
    for (const name of PARTS) expect(part(arena, name).visible, name).toBe(false);
    expect(cues).toEqual([]);
  });

  it('wakes, spins its iris, crackles and hums through the forge, then discharges and runs down', () => {
    const { arena, cues } = arenaWithCues();
    arena.upgradeMachine.forge('m14');
    for (let t = 0; t < 2; t += 1 / 30) arena.update(1 / 30);
    for (const name of PARTS) expect(part(arena, name).visible, name).toBe(true);
    const iris = part(arena, 'kovka-reactor-iris') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const spin = iris.material.uniforms.uSpin.value as number;
    arena.update(1 / 30);
    expect(iris.material.uniforms.uSpin.value).not.toBe(spin);
    expect(iris.material.uniforms.uCharge.value).toBeGreaterThan(0.2);

    for (let t = 2; t < FORGE + 0.2; t += 1 / 30) arena.update(1 / 30);
    expect(arena.upgradeMachine.busy).toBe(false);
    expect(cues[0]).toBe(KOVKA_FORGE_CUE);
    expect(cues.filter((cue) => cue === KOVKA_FORGE_SURGE_CUE).length).toBeGreaterThanOrEqual(3);
    expect(cues[cues.length - 1]).toBe(KOVKA_FORGE_DISCHARGE_CUE);
    expect(cues.filter((cue) => cue === KOVKA_FORGE_DISCHARGE_CUE)).toHaveLength(1);

    for (let t = 0; t < KOVKA_REACTOR_DRIVE.windDown + 1; t += 1 / 30) arena.update(1 / 30);
    for (const name of PARTS) expect(part(arena, name).visible, name).toBe(false);
  });

  it('goes dark on a restart mid-forge, with no discharge', () => {
    const { arena, cues } = arenaWithCues();
    arena.upgradeMachine.forge('m14');
    for (let t = 0; t < 3; t += 1 / 30) arena.update(1 / 30);
    arena.reset();
    arena.update(1 / 30);
    for (const name of PARTS) expect(part(arena, name).visible, name).toBe(false);
    expect(cues).not.toContain(KOVKA_FORGE_DISCHARGE_CUE);
  });

  it('throws fewer arcs on reduced effects', () => {
    const arcs = (reduced: boolean): number => {
      const { arena } = arenaWithCues({ ...TEST_PROFILE, useReducedEffects: reduced });
      return (part(arena, 'kovka-reactor-arcs') as THREE.Mesh).geometry.index!.count;
    };
    expect(arcs(true)).toBeLessThan(arcs(false));
  });

  it('voices its surges and the discharge from the reactor face', () => {
    for (const cue of [KOVKA_FORGE_SURGE_CUE, KOVKA_FORGE_DISCHARGE_CUE]) {
      expect(cue.position.z).toBeGreaterThan(KOVKA_FORGE_CUE.position.z);
      expect(cue.position.x).toBe(KOVKA_FORGE_CUE.position.x);
    }
    expect(KOVKA_FORGE_SURGE_CUE.sound).toBe('forge-surge');
    expect(KOVKA_FORGE_DISCHARGE_CUE.sound).toBe('forge-discharge');
  });
});
