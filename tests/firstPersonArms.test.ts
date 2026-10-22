import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { RING_DEFINITIONS, RING_FINGERS } from '../src/game/rings/RingCatalog';
import { ARM_DETAIL, FirstPersonArm } from '../src/weapons/FirstPersonArm';
import { FINGER_LAYOUT, FINGERS, HAND_POSES, PHALANX_TAPER } from '../src/weapons/HandPoses';
import { KNIFE_ATTACK_DURATION, KNIFE_HIDE_PROGRESS, KNIFE_SHOW_PROGRESS, Knife } from '../src/weapons/Knife';
import { ViewArms } from '../src/weapons/ViewArms';
import { Weapon } from '../src/weapons/Weapon';
import { WeaponView } from '../src/weapons/WeaponView';
import type { HandGripConfig, WeaponDefinition, WeaponId } from '../src/weapons/WeaponTypes';

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
  view.hands.read(side, target, new THREE.Quaternion());
  return arms[side].getGripWorldPosition(new THREE.Vector3()).distanceTo(target);
}

/**
 * Interior elbow angle, and whether the elbow sits the natural way: the
 * forearm drops from the hand to it and it stays out on the arm's own side,
 * never rising toward the eye or crossing in front of the other hand.
 */
function elbowShape(arm: FirstPersonArm): { angle: number; natural: boolean } {
  const shoulder = arm.getShoulderWorldPosition(new THREE.Vector3());
  const elbow = arm.getElbowWorldPosition(new THREE.Vector3());
  const wrist = arm.getWristWorldPosition(new THREE.Vector3());
  const angle = shoulder.clone().sub(elbow).angleTo(wrist.clone().sub(elbow));
  const outward = arm.side === 'right' ? elbow.x - wrist.x : wrist.x - elbow.x;
  return { angle, natural: elbow.y < wrist.y && outward > 0 };
}

/** Wrist bend between the forearm and the knuckles, and the glove's roll against the forearm. */
function wristShape(arm: FirstPersonArm): { bend: number; twist: number } {
  const forearm = arm.getWristWorldPosition(new THREE.Vector3()).sub(arm.getElbowWorldPosition(new THREE.Vector3()));
  const wrist = arm.mesh.skeleton.bones[2];
  const knuckles = new THREE.Vector3(0, 0, -1).applyQuaternion(wrist.getWorldQuaternion(new THREE.Quaternion()));
  // Twist part of the wrist's local rotation about its own length (Z).
  const twist = 2 * Math.atan2(wrist.quaternion.z, wrist.quaternion.w);
  return { bend: forearm.angleTo(knuckles), twist: Math.atan2(Math.sin(twist), Math.cos(twist)) };
}

/** Signed distance from a weapon-space point to a grip's held part (a rounded prism). */
function holdDistance(grip: HandGripConfig, point: THREE.Vector3): number {
  const length = new THREE.Vector3(...grip.hold!.axis).normalize();
  const across = new THREE.Vector3(1, 0, 0).addScaledVector(length, -length.x).normalize();
  const through = new THREE.Vector3().crossVectors(length, across);
  const offset = point.clone().sub(new THREE.Vector3(...grip.position));
  const [width, depth] = grip.hold!.size;
  const corner = Math.min(width, depth) / 2 * 0.7;
  const qu = Math.abs(offset.dot(across)) - (width / 2 - corner);
  const qv = Math.abs(offset.dot(through)) - (depth / 2 - corner);
  return Math.hypot(Math.max(qu, 0), Math.max(qv, 0)) + Math.min(Math.max(qu, qv), 0) - corner;
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

  it.each(WEAPONS)('%s: forearms continue the hands, wrists barely bend and never twist', (id) => {
    const definition = WEAPON_DEFINITIONS[id];
    for (const options of [{}, { ads: true }]) {
      const setup = rig(definition);
      for (let step = 0; step < 90; step++) frame(setup, options);
      if (!setup.view.root.visible) continue;
      for (const arm of definition.view.hands.left ? [setup.arms.right, setup.arms.left] : [setup.arms.right]) {
        const { bend, twist } = wristShape(arm);
        expect(bend, `${id} ${arm.side} wrist bend`).toBeLessThan(THREE.MathUtils.degToRad(32));
        expect(Math.abs(twist), `${id} ${arm.side} wrist twist`).toBeLessThan(THREE.MathUtils.degToRad(5));
      }
    }
  });

  it.each(WEAPONS)('%s: wrapping fingers rest on the held part and the index on the trigger', (id) => {
    const definition = WEAPON_DEFINITIONS[id];
    const setup = rig(definition);
    for (let step = 0; step < 90; step++) frame(setup);
    for (const side of ['right', 'left'] as const) {
      const grip = definition.view.hands[side];
      if (!grip?.hold) continue;
      const bones = setup.arms[side].mesh.skeleton.bones;
      const local = (bone: number, length: number) => setup.view.root.worldToLocal(bones[bone].localToWorld(new THREE.Vector3(0, 0, -length)));
      for (const name of HAND_POSES[grip.pose].wrap ?? []) {
        const finger = FINGERS.indexOf(name);
        const { lengths, radius } = FINGER_LAYOUT[name];
        const depths = lengths.map((length, segment) => holdDistance(grip, local(3 + finger * 3 + segment, length)) - radius * PHALANX_TAPER ** segment);
        // Glove padding may sink a few millimetres; the finger must touch somewhere.
        expect(Math.min(...depths), `${id} ${side} ${name} sinks`).toBeGreaterThan(-0.006);
        expect(Math.min(...depths), `${id} ${side} ${name} floats`).toBeLessThan(0.004);
      }
      if (grip.trigger) {
        const { lengths, radius } = FINGER_LAYOUT.index;
        const pad = local(5, lengths[2] * 0.6);
        expect(pad.distanceTo(new THREE.Vector3(...grip.trigger)), `${id} trigger finger`).toBeLessThan(radius + 0.008);
      }
    }
  });

  it.each(WEAPONS)('%s: the gloves stay under the sight line when aiming', (id) => {
    const definition = WEAPON_DEFINITIONS[id];
    const setup = rig(definition);
    for (let step = 0; step < 90; step++) frame(setup, { ads: true });
    const sightLine = definition.view.sightHeight * definition.view.scale;
    for (const side of ['right', 'left'] as const) {
      if (!definition.view.hands[side]) continue;
      for (const bone of setup.arms[side].mesh.skeleton.bones.slice(3)) {
        const tip = setup.view.root.worldToLocal(bone.localToWorld(new THREE.Vector3(0, 0, -0.02)));
        expect(tip.y, `${id} ${side} ${bone.name}`).toBeLessThan(sightLine - 0.015);
      }
    }
  });
});

describe('Glove fingers', () => {
  it('eases between poses without jumping', () => {
    const arm = new FirstPersonArm('right');
    arm.setHandPose(HAND_POSES.rifleGrip, 1);
    const start = Float32Array.from(arm.poseValues);
    arm.setHandPose(HAND_POSES.magazineGrab, 1);
    const end = Float32Array.from(arm.poseValues);
    const total = Math.max(...start.map((value, slot) => Math.abs(end[slot] - value)));
    arm.setHandPose(HAND_POSES.rifleGrip, 1);

    const blend = 1 - Math.exp(-22 * DT);
    let previous = Float32Array.from(arm.poseValues);
    for (let step = 0; step < 40; step++) {
      arm.setHandPose(HAND_POSES.magazineGrab, blend);
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
    setup.view.hands.read('left', target, new THREE.Quaternion());
    const anchor = WEAPON_DEFINITIONS.m4a1.view.hands.left!.position;
    expect(setup.view.root.worldToLocal(target).distanceTo(new THREE.Vector3(...anchor))).toBeLessThan(1e-6);
  });

  it('works the L96 bolt with the right hand between shots', () => {
    const definition = WEAPON_DEFINITIONS.l96;
    const setup = rig(definition);
    for (let step = 0; step < 30; step++) frame(setup);
    const restingGrip = new THREE.Vector3();
    setup.view.hands.read('right', restingGrip, new THREE.Quaternion());
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

describe('Hand rings', () => {
  const GLOW = 0x3fd8c8;

  /** Highest point of a worn ring in the weapon's own space. */
  function ringTop(view: WeaponView, mesh: THREE.Mesh): number {
    const position = mesh.geometry.getAttribute('position');
    const point = new THREE.Vector3();
    let top = -Infinity;
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index);
      top = Math.max(top, view.root.worldToLocal(mesh.localToWorld(point)).y);
    }
    return top;
  }

  it('hangs one ring per finger on the right glove, hidden until worn, on every detail tier', () => {
    for (const detail of Object.values(ARM_DETAIL)) {
      const arms = new ViewArms(detail);
      for (const finger of RING_FINGERS) {
        expect(arms.rings.isWorn(finger)).toBe(false);
        expect(arms.root.getObjectByName(`hand-ring-right-${finger}`)!.parent).toBe(arms.right.ringSeat(finger).bone);
      }
      arms.rings.show(RING_DEFINITIONS.resurrection.finger, 'charged', GLOW);
      expect(RING_FINGERS.filter((finger) => arms.rings.isWorn(finger))).toEqual(['ring']);
      arms.rings.show('ring', 'spent', GLOW);
      expect(arms.rings.isWorn('ring')).toBe(true);
      arms.rings.clear();
      expect(RING_FINGERS.some((finger) => arms.rings.isWorn(finger))).toBe(false);
    }
  });

  it('shows every ring for the shader warm-up only, compressed into the view-model depth range', () => {
    const arms = new ViewArms();
    arms.rings.show('ring', 'charged', GLOW);
    arms.rings.setWarmup(true);
    expect(RING_FINGERS.every((finger) => arms.rings.isWorn(finger))).toBe(true);
    for (const finger of RING_FINGERS) {
      const mesh = arms.root.getObjectByName(`hand-ring-right-${finger}`) as THREE.Mesh;
      for (const material of mesh.material as THREE.Material[]) expect(material.onBeforeCompile).toBeTypeOf('function');
    }
    arms.rings.setWarmup(false);
    expect(RING_FINGERS.filter((finger) => arms.rings.isWorn(finger))).toEqual(['ring']);
  });

  it.each(WEAPONS)('%s: worn rings never move a finger and stay under the sight line when aiming', (id) => {
    const definition = WEAPON_DEFINITIONS[id];
    const plain = rig(definition);
    const ringed = rig(definition);
    for (const finger of RING_FINGERS) ringed.arms.rings.show(finger, 'charged', GLOW);
    for (const options of [{}, { ads: true }]) {
      for (let step = 0; step < 90; step++) {
        frame(plain, options);
        frame(ringed, options);
      }
      expect(Array.from(ringed.arms.right.poseValues)).toEqual(Array.from(plain.arms.right.poseValues));
      const bones = (setup: Rig) => setup.arms.right.mesh.skeleton.bones.map((bone) => bone.getWorldPosition(new THREE.Vector3()));
      const expected = bones(plain);
      bones(ringed).forEach((position, index) => expect(position.distanceTo(expected[index])).toBeLessThan(1e-9));
    }
    if (!ringed.view.root.visible) return;
    const sightLine = definition.view.sightHeight * definition.view.scale;
    for (const finger of RING_FINGERS) {
      const mesh = ringed.arms.root.getObjectByName(`hand-ring-right-${finger}`) as THREE.Mesh;
      expect(ringTop(ringed.view, mesh), `${id} ${finger} ring`).toBeLessThan(sightLine - 0.015);
    }
  });
});
