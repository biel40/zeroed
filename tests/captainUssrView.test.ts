import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CaptainUssrState } from '../src/zombies/guardians/CaptainUssrBrain';
import { CAPTAIN_USSR_BODY as B } from '../src/zombies/guardians/CaptainUssrPose';
import { SHIELD_BACK, SHIELD_GRIP } from '../src/zombies/guardians/CaptainUssrShield';
import { CaptainUssrView, type CaptainUssrSnapshot } from '../src/zombies/guardians/CaptainUssrView';

type Boss = { -readonly [K in keyof CaptainUssrSnapshot]: CaptainUssrSnapshot[K] };

const DT = 1 / 60;
const GROUND = 2;
const LEAP_FROM = new THREE.Vector3(0, GROUND + 6, -10);

function boss(overrides: Partial<Boss> = {}): Boss {
  return {
    state: 'stalking', stateProgress: 0, position: { x: 0, z: 0 }, heading: 0, speed: 0,
    shieldHeld: true, shield: { x: 0, z: 0 }, phase: 1, ...overrides,
  };
}

function play(view: CaptainUssrView, snapshot: Boss, seconds: number, each?: (frame: number) => void): void {
  for (let frame = 0; frame < Math.round(seconds / DT); frame++) {
    each?.(frame);
    view.update(DT, snapshot, GROUND, LEAP_FROM);
  }
}

function worldOf(view: CaptainUssrView, name: string, local: THREE.Vector3Like = { x: 0, y: 0, z: 0 }): THREE.Vector3 {
  const joint = view.group.getObjectByName(name)!;
  joint.updateWorldMatrix(true, false);
  return joint.localToWorld(new THREE.Vector3(local.x, local.y, local.z));
}

describe('Captain USSR view', () => {
  it('stands its guard with both soles flat on the ground', () => {
    const view = new CaptainUssrView(false);
    play(view, boss(), 2);
    for (const side of [0, 1]) expect(worldOf(view, `captain-ussr-ankle-${side}`).y).toBeCloseTo(GROUND + B.ankle, 2);
  });

  it('marches without its planted foot sliding over the ground', () => {
    const view = new CaptainUssrView(false);
    const march = boss({ speed: 2.3 });
    play(view, march, 2, () => { march.position = { x: 0, z: march.position.z + march.speed * DT }; });
    let drift = 0;
    const planted: (THREE.Vector3 | null)[] = [null, null];
    play(view, march, 3, () => {
      march.position = { x: 0, z: march.position.z + march.speed * DT };
      for (const side of [0, 1]) {
        const ankle = worldOf(view, `captain-ussr-ankle-${side}`);
        if (ankle.y > GROUND + B.ankle + 0.003) {
          planted[side] = null;
          continue;
        }
        planted[side] ??= ankle.clone();
        drift = Math.max(drift, Math.hypot(ankle.x - planted[side]!.x, ankle.z - planted[side]!.z));
      }
    });
    expect(drift).toBeLessThan(0.05);
  });

  it('grips its shield by the handle', () => {
    const view = new CaptainUssrView(false);
    play(view, boss(), 1.5);
    const fist = worldOf(view, 'captain-ussr-elbow-0', { x: 0, y: -(B.forearm + B.hand), z: 0 });
    const grip = worldOf(view, 'captain-ussr-shield', SHIELD_GRIP);
    expect(fist.distanceTo(grip)).toBeLessThan(0.03);
  });

  it('slams down from its leap once, as a cue, and lands on its feet', () => {
    const view = new CaptainUssrView(false);
    const leap = boss({ state: 'arriving', position: { x: 0, z: 4 } });
    let slams = 0;
    play(view, leap, 1.5, (frame) => {
      leap.stateProgress = Math.min(1, (frame * DT) / 1.5);
      if (view.cues.impact > 0) slams++;
    });
    expect(slams).toBe(1);
    leap.state = 'stalking';
    leap.stateProgress = 0;
    play(view, leap, 2);
    expect(worldOf(view, 'captain-ussr-ankle-0').y).toBeCloseTo(GROUND + B.ankle, 2);
  });

  it('pounds the ground at a charge, each stride a cue', () => {
    const view = new CaptainUssrView(false);
    const charge = boss({ state: 'charging', speed: 11 });
    let footfalls = 0;
    play(view, charge, 1, () => {
      charge.position = { x: 0, z: charge.position.z + charge.speed * DT };
      if (view.cues.footfall > 0) footfalls++;
    });
    expect(footfalls).toBeGreaterThanOrEqual(6);
  });

  it('drops its shield as it dies; the shield rings on the ground and comes to rest flat, face up', () => {
    const view = new CaptainUssrView(false);
    const dying = boss();
    play(view, dying, 1);
    dying.state = 'defeated';
    let clangs = 0;
    play(view, dying, 9, () => { if (view.cues.clang > 0) clangs++; });
    expect(clangs).toBeGreaterThan(0);
    const shield = view.group.getObjectByName('captain-ussr-shield')!;
    expect(shield.position.y).toBeCloseTo(GROUND + SHIELD_BACK, 3);
    expect(new THREE.Vector3(0, 0, 1).applyQuaternion(shield.quaternion).y).toBeCloseTo(1, 3);
    // Face down on the ground by then.
    expect(worldOf(view, 'captain-ussr-body').y).toBeLessThan(GROUND + 0.4);
  });

  it('keeps every joint sound through a whole fight, hits and crashes included', () => {
    const view = new CaptainUssrView(true);
    const fight = boss({ state: 'dormant' });
    view.perch(LEAP_FROM, 0);
    view.roar();
    const states: readonly [CaptainUssrState, number][] = [
      ['dormant', 1.5], ['arriving', 1.5], ['stalking', 1], ['bashWindup', 0.55], ['recovering', 0.6], ['throwWindup', 0.75],
      ['shieldFlight', 1.2], ['recovering', 0.45], ['chargeWindup', 1], ['charging', 1], ['stunned', 3], ['stalking', 1], ['defeated', 4],
    ];
    for (const [state, seconds] of states) {
      fight.state = state;
      fight.shieldHeld = state !== 'shieldFlight';
      fight.speed = state === 'charging' ? 11 : state === 'stalking' ? 2 : 0;
      if (state === 'stunned') view.crash();
      play(view, fight, seconds, (frame) => {
        fight.stateProgress = Math.min(1, (frame * DT) / seconds);
        if (state === 'shieldFlight') fight.shield = { x: Math.sin(frame * DT * 2.6) * 8, z: 0 };
        if (frame % 7 === 0) view.hurt(0.5, frame % 14 === 0 ? 'head' : 'torso', { x: 0.3, y: GROUND + 1.5, z: 1 });
        if (frame % 11 === 0) view.block();
      });
      view.group.updateMatrixWorld(true);
      view.group.traverse((object) => {
        for (const value of object.matrixWorld.elements) expect(Number.isFinite(value), `${state} ${object.name}`).toBe(true);
      });
    }
    view.reset();
    expect(view.group.visible).toBe(false);
    view.dispose();
  });
});
