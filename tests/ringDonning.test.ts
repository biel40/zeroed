import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { RING_DEFINITIONS } from '../src/game/rings/RingCatalog';
import { RING_DONNING_DURATION, RingDonning, ringDistanceFromSeat } from '../src/weapons/RingDonning';
import { ViewArms } from '../src/weapons/ViewArms';
import { Weapon } from '../src/weapons/Weapon';
import { WeaponView } from '../src/weapons/WeaponView';

const ARMOR = RING_DEFINITIONS.armor;
const DT = 1 / 60;
const FRAMES = Math.ceil(RING_DONNING_DURATION / DT) + 2;

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

interface Sample {
  progress: number;
  ringVisible: boolean;
  ring: THREE.Vector3;
  pinch: THREE.Vector3;
  leftWrist: THREE.Vector3;
  rightWrist: THREE.Vector3;
  onScreen: boolean;
}

/** Plays a whole donning on the M4A1 view and samples the hands and the ring every frame. */
function playDonning(): { samples: Sample[]; arms: ViewArms; view: WeaponView; ringMesh: THREE.Mesh } {
  const definition = WEAPON_DEFINITIONS.m4a1;
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.08, 700);
  const weapon = new Weapon(definition, () => 0.5);
  const view = new WeaponView(definition, null);
  view.root.visible = true;
  const arms = new ViewArms();
  camera.add(view.root, arms.root);
  camera.updateMatrixWorld(true);
  const donning = new RingDonning(camera, arms.rings);
  const ringMesh = arms.root.getObjectByName(`hand-ring-right-${ARMOR.finger}`) as THREE.Mesh;

  const frame = (): void => {
    weapon.update(DT, { trigger: false, ads: false });
    view.update(DT, weapon, 0, 0, 0, donning.firearmLowering);
    arms.update(DT, view, donning.isAnimating ? donning : null);
  };
  for (let index = 0; index < 30; index++) frame();

  arms.rings.show(ARMOR.finger, 'charged', ARMOR.glowColor);
  donning.start(ARMOR.finger);
  const samples: Sample[] = [];
  for (let index = 0; index < FRAMES; index++) {
    donning.update(DT);
    frame();
    camera.updateMatrixWorld(true);
    const ring = ringMesh.getWorldPosition(new THREE.Vector3());
    const ndc = ring.clone().project(camera);
    samples.push({
      progress: Math.min(1, ((index + 1) * DT) / RING_DONNING_DURATION),
      ringVisible: ringMesh.visible,
      ring,
      pinch: arms.left.getGripWorldPosition(new THREE.Vector3()),
      leftWrist: arms.left.getWristWorldPosition(new THREE.Vector3()),
      rightWrist: arms.right.getWristWorldPosition(new THREE.Vector3()),
      onScreen: Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9 && ndc.z < 1,
    });
  }
  for (let index = 0; index < 30; index++) frame();
  return { samples, arms, view, ringMesh };
}

describe('Putting a ring on', () => {
  it('runs the ring from past the fingertip down to its seat', () => {
    const toTip = 0.08;
    expect(ringDistanceFromSeat(0, toTip)).toBeGreaterThan(toTip);
    expect(ringDistanceFromSeat(0.42, toTip)).toBeCloseTo(toTip, 6);
    expect(ringDistanceFromSeat(0.66, toTip)).toBe(0);
    expect(ringDistanceFromSeat(1, toTip)).toBe(0);
  });

  it('keeps the ring out of sight until the left hand brings it, in its pinch and on screen', () => {
    const { samples } = playDonning();
    expect(samples[0].ringVisible).toBe(false);
    const carried = samples.filter((sample) => sample.ringVisible && sample.progress < 0.66);
    expect(carried.length).toBeGreaterThan(20);
    for (const sample of carried) {
      expect(sample.ring.distanceTo(sample.pinch), `progress ${sample.progress.toFixed(2)}`).toBeLessThan(0.005);
    }
    // Once the hand is up, the whole slide plays on screen.
    for (const sample of samples.filter((candidate) => candidate.progress > 0.32 && candidate.progress < 0.72)) {
      expect(sample.onScreen, `progress ${sample.progress.toFixed(2)}`).toBe(true);
    }
  });

  it('keeps both hands apart while they work on the ring', () => {
    const { samples } = playDonning();
    for (const sample of samples) {
      expect(sample.leftWrist.distanceTo(sample.rightWrist), `progress ${sample.progress.toFixed(2)}`).toBeGreaterThan(0.06);
    }
  });

  it('seats the ring on its finger and returns both hands to the weapon', () => {
    const { arms, view, ringMesh } = playDonning();
    expect(arms.rings.isWorn(ARMOR.finger)).toBe(true);
    const seat = arms.right.ringSeat(ARMOR.finger);
    expect(ringMesh.parent).toBe(seat.bone);
    expect(ringMesh.position.z).toBeCloseTo(-seat.along, 6);
    for (const side of ['left', 'right'] as const) {
      const target = new THREE.Vector3();
      view.hands.read(side, target, new THREE.Quaternion());
      expect(arms[side].getGripWorldPosition(new THREE.Vector3()).distanceTo(target), side).toBeLessThan(0.005);
    }
  });
});
