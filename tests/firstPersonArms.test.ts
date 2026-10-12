import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { ARM_DETAIL, FirstPersonArm } from '../src/weapons/FirstPersonArm';
import { KNIFE_ATTACK_DURATION, KNIFE_HIDE_PROGRESS, KNIFE_SHOW_PROGRESS, Knife } from '../src/weapons/Knife';
import { ViewArms } from '../src/weapons/ViewArms';
import { Weapon } from '../src/weapons/Weapon';
import { WeaponView } from '../src/weapons/WeaponView';
import type { WeaponDefinition, WeaponId } from '../src/weapons/WeaponTypes';

const originalDocument = globalThis.document;

beforeAll(() => {
  const context = {
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillStyle: '',
    fillRect: () => undefined,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document,
  });
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
  else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

const WEAPONS = Object.keys(WEAPON_DEFINITIONS) as WeaponId[];
const DT = 1 / 60;
const TOLERANCE = 0.005;

interface Rig {
  camera: THREE.PerspectiveCamera;
  weapon: Weapon;
  view: WeaponView;
  arms: ViewArms;
}

function rig(definition: WeaponDefinition): Rig {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.08, 700);
  const weapon = new Weapon(definition, () => 0.5);
  const view = new WeaponView(definition, null);
  view.root.visible = true;
  const arms = new ViewArms();
  camera.add(view.root, arms.root);
  camera.updateMatrixWorld(true);
  return { camera, weapon, view, arms };
}

function frame({ weapon, view, arms }: Rig, options: { ads?: boolean; lowering?: number; melee?: Knife | null } = {}): void {
  weapon.update(DT, { trigger: false, ads: options.ads ?? false });
  view.update(DT, weapon, 0, 0, 0, options.lowering ?? options.melee?.firearmLowering ?? 0);
  arms.update(DT, view, options.melee ?? null);
}

/** Distance between the glove's grip point and the weapon's target for that hand. */
function gripError({ view, arms }: Rig, side: 'left' | 'right'): number {
  const target = new THREE.Vector3();
  view.hands.read(side, target, new THREE.Quaternion(), new THREE.Vector3());
  return arms[side].getGripWorldPosition(new THREE.Vector3()).distanceTo(target);
}

/**
 * Interior elbow angle, and whether the elbow points the natural way: below
 * the shoulder-wrist line or out to the arm's own side, never up and inward.
 */
function elbowShape(arm: FirstPersonArm): { angle: number; natural: boolean } {
  const shoulder = arm.getShoulderWorldPosition(new THREE.Vector3());
  const elbow = arm.getElbowWorldPosition(new THREE.Vector3());
  const wrist = arm.getWristWorldPosition(new THREE.Vector3());
  const angle = shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow));
  const line = new THREE.Line3(shoulder, wrist);
  const closest = line.closestPointToPoint(elbow, true, new THREE.Vector3());
  const offset = elbow.sub(closest);
  const outward = arm.side === 'right' ? offset.x : -offset.x;
  return { angle, natural: offset.y < 0 || outward > 0 };
}

describe('Weapon hand anchors', () => {
  it('declares both hands on every weapon except the one-handed Ray Gun', () => {
    for (const id of WEAPONS) {
      const hands = WEAPON_DEFINITIONS[id].view.hands;
      expect(hands.right, id).toBeDefined();
      if (id === 'raygun') expect(hands.left, id).toBeUndefined();
      else expect(hands.left, id).toBeDefined();
    }
  });

  it.each(WEAPONS)('%s: both gloves reach their grips at the hip, in ADS and fully lowered', (id) => {
    const definition = WEAPON_DEFINITIONS[id];
    for (const options of [{}, { ads: true }, { lowering: 1 }]) {
      const setup = rig(definition);
      for (let step = 0; step < 90; step++) frame(setup, options);
      if (!setup.view.root.visible) {
        // A full scope hides the rifle, and the gloves with it.
        expect(definition.scoped && options.ads).toBe(true);
        expect(setup.arms.right.root.visible || setup.arms.left.root.visible).toBe(false);
        continue;
      }
      expect(gripError(setup, 'right'), `${id} right ${JSON.stringify(options)}`).toBeLessThan(TOLERANCE);
      expect(setup.arms.right.root.visible).toBe(true);
      if (definition.view.hands.left) {
        expect(gripError(setup, 'left'), `${id} left ${JSON.stringify(options)}`).toBeLessThan(TOLERANCE);
      }
      expect(setup.arms.left.root.visible).toBe(definition.view.hands.left !== undefined);
    }
  });

  it.each(WEAPONS)('%s: elbows bend naturally, never hyperextended or inverted', (id) => {
    const definition = WEAPON_DEFINITIONS[id];
    for (const options of [{}, { ads: true }, { lowering: 1 }]) {
      const setup = rig(definition);
      for (let step = 0; step < 90; step++) frame(setup, options);
      if (!setup.view.root.visible) continue;
      for (const arm of definition.view.hands.left ? [setup.arms.right, setup.arms.left] : [setup.arms.right]) {
        const { angle, natural } = elbowShape(arm);
        expect(angle, `${id} ${arm.side}`).toBeGreaterThan(THREE.MathUtils.degToRad(25));
        expect(angle, `${id} ${arm.side}`).toBeLessThan(THREE.MathUtils.degToRad(176));
        expect(natural, `${id} ${arm.side} elbow direction`).toBe(true);
      }
    }
  });
});

describe('Glove fingers', () => {
  it('eases between poses without jumping', () => {
    const arm = new FirstPersonArm('right');
    arm.setHandPose('rifleGrip', 1);
    const start = Float32Array.from(arm.poseValues);
    arm.setHandPose('magazineGrab', 1);
    const end = Float32Array.from(arm.poseValues);
    const total = Math.max(...start.map((value, slot) => Math.abs(end[slot] - value)));
    arm.setHandPose('rifleGrip', 1);

    const blend = 1 - Math.exp(-22 * DT);
    let previous = Float32Array.from(arm.poseValues);
    for (let step = 0; step < 40; step++) {
      arm.setHandPose('magazineGrab', blend);
      const current = arm.poseValues;
      const jump = Math.max(...current.map((value, slot) => Math.abs(value - previous[slot])));
      expect(jump).toBeLessThanOrEqual(total * blend + 1e-6);
      previous = Float32Array.from(current);
    }
    expect(Math.max(...previous.map((value, slot) => Math.abs(value - end[slot])))).toBeLessThan(0.01);
  });

  it('stays within the mobile and desktop budgets: four draw calls per arm', () => {
    const triangles = (detail: (typeof ARM_DETAIL)[keyof typeof ARM_DETAIL]) => {
      const geometry = new FirstPersonArm('right', detail).mesh.geometry;
      expect(geometry.groups).toHaveLength(4);
      return (geometry.index as THREE.BufferAttribute).count / 3;
    };
    expect(triangles(ARM_DETAIL.desktop)).toBeLessThanOrEqual(3500);
    expect(triangles(ARM_DETAIL.mobile)).toBeLessThanOrEqual(2000);
    expect(triangles(ARM_DETAIL.lowMemory)).toBeLessThanOrEqual(2000);
  });
});

describe('Knife hand-off', () => {
  function knifeRig(id: WeaponId = 'm4a1'): Rig & { knife: Knife } {
    const setup = rig(WEAPON_DEFINITIONS[id]);
    const knife = new Knife();
    setup.camera.add(knife.root);
    knife.setEnabled(true);
    for (let step = 0; step < 10; step++) frame(setup);
    return { ...setup, knife };
  }

  it('moves the right hand from the grip to the knife and back', () => {
    const setup = knifeRig();
    const { knife, arms } = setup;
    expect(gripError(setup, 'right')).toBeLessThan(TOLERANCE);
    knife.trigger();
    let sawKnifeHold = false;
    const handle = new THREE.Vector3();
    while (knife.isAttacking) {
      knife.update(DT, false, 0);
      frame(setup, { melee: knife });
      if (knife.armWeight === 1) {
        knife.readHandTarget(handle, new THREE.Quaternion(), new THREE.Vector3());
        expect(arms.right.getGripWorldPosition(new THREE.Vector3()).distanceTo(handle)).toBeLessThan(TOLERANCE);
        sawKnifeHold = true;
      }
      // The left hand never lets go of the lowered weapon.
      expect(gripError(setup, 'left')).toBeLessThan(TOLERANCE);
    }
    expect(sawKnifeHold).toBe(true);
    knife.setEnabled(false);
    frame(setup);
    expect(gripError(setup, 'right')).toBeLessThan(TOLERANCE);
  });

  it('never shows the knife while the hand is on the weapon grip', () => {
    const setup = knifeRig();
    const { knife } = setup;
    knife.trigger();
    let shown = 0;
    while (knife.isAttacking) {
      knife.update(DT, false, 0);
      frame(setup, { melee: knife });
      if (knife.knifeVisible) {
        shown++;
        expect(knife.armWeight).toBe(1);
      }
    }
    expect(shown).toBeGreaterThan(20);
  });

  it.each([KNIFE_SHOW_PROGRESS, KNIFE_HIDE_PROGRESS])('swaps the knife in and out off screen (progress %f)', (progress) => {
    for (const aspect of [16 / 9, 21 / 9]) {
      const setup = knifeRig();
      const { knife, camera, arms } = setup;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      knife.trigger();
      knife.update(progress * KNIFE_ATTACK_DURATION, false, 0);
      frame(setup, { melee: knife });
      camera.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      const model = knife.root.getObjectByName('knife-model')!;
      const hand = new THREE.Sphere(arms.right.getGripWorldPosition(new THREE.Vector3()), 0.07);
      expect(frustum.intersectsBox(new THREE.Box3().setFromObject(model, true))).toBe(false);
      expect(frustum.intersectsSphere(hand)).toBe(false);
    }
  });
});

describe('Reload hands', () => {
  function reloading(id: WeaponId, progress: number): Rig {
    const definition = WEAPON_DEFINITIONS[id];
    const setup = rig(definition);
    setup.weapon.ammoInMagazine = 0;
    setup.weapon.reload();
    const steps = Math.round((progress * definition.reloadTime) / DT);
    for (let step = 0; step < steps; step++) frame(setup);
    return setup;
  }

  it('carries the support hand with the magazine and back to the handguard', () => {
    const reload = WEAPON_DEFINITIONS.m4a1.view.reloadAnim!;
    const magazineOf = (setup: Rig) => setup.view.root.getObjectByName('m4a1-magazine')!.getWorldPosition(new THREE.Vector3());
    const leftGrip = (setup: Rig) => setup.arms.left.getGripWorldPosition(new THREE.Vector3());
    const anchor = (() => {
      const setup = rig(WEAPON_DEFINITIONS.m4a1);
      for (let step = 0; step < 10; step++) frame(setup);
      return leftGrip(setup);
    })();

    const pulling = reloading('m4a1', (reload.magOut + reload.magDrop) / 2);
    expect(leftGrip(pulling).distanceTo(magazineOf(pulling))).toBeLessThan(0.06);
    expect(gripError(pulling, 'left')).toBeLessThan(TOLERANCE);

    const fetching = reloading('m4a1', (reload.magDrop + reload.magIn) / 2);
    expect(leftGrip(fetching).distanceTo(anchor)).toBeGreaterThan(0.2);

    const seating = reloading('m4a1', (reload.magIn + reload.magSeat) / 2);
    expect(leftGrip(seating).distanceTo(magazineOf(seating))).toBeLessThan(0.06);
  });

  it('puts the hands straight back on their grips when a reload is interrupted', () => {
    const setup = reloading('m4a1', 0.5);
    setup.view.reset();
    setup.weapon.equip();
    frame(setup);
    expect(gripError(setup, 'left')).toBeLessThan(TOLERANCE);
    expect(gripError(setup, 'right')).toBeLessThan(TOLERANCE);
    const target = new THREE.Vector3();
    setup.view.hands.read('left', target, new THREE.Quaternion(), new THREE.Vector3());
    const anchor = WEAPON_DEFINITIONS.m4a1.view.hands.left!.position;
    expect(setup.view.root.worldToLocal(target).distanceTo(new THREE.Vector3(...anchor))).toBeLessThan(1e-6);
  });

  it('works the L96 bolt with the right hand between shots', () => {
    const definition = WEAPON_DEFINITIONS.l96;
    const setup = rig(definition);
    for (let step = 0; step < 30; step++) frame(setup);
    const restingGrip = new THREE.Vector3();
    setup.view.hands.read('right', restingGrip, new THREE.Quaternion(), new THREE.Vector3());
    setup.weapon.update(DT, { trigger: true, ads: false });
    setup.weapon.clearEvents();
    let farthest = 0;
    while (setup.weapon.state === 'cycling') {
      frame(setup);
      farthest = Math.max(farthest, setup.arms.right.getGripWorldPosition(new THREE.Vector3()).distanceTo(restingGrip));
    }
    expect(farthest).toBeGreaterThan(0.05);
  });
});
