import * as THREE from 'three';
import {
  FIT,
  box,
  doubleSided,
  frontOf,
  loft,
  measure,
  scaled,
  slab,
  star,
  RING_SEGMENTS,
  type BodyMeasures,
} from './ZombieAccessoryGeometry';
import type { ZombieBodyFrame } from './ZombieBodyFrame';
import { buildVestmentParts, isVestment } from './ZombieClergyGarments';
import type { GarmentPattern } from './ZombieGarmentPatterns';
import type { ZombieAccessory, ZombieVestment } from './ZombieSkinCatalog';

/** One flat-colored piece, in body-frame meters; rigid on `bone` unless draped. */
export interface AccessoryPart {
  /** Non-indexed triangles. */
  readonly geometry: THREE.BufferGeometry;
  readonly color: number;
  readonly bone: string;
  /** A complete loose hat, including its badge; hoods stay sewn to the coat. */
  readonly detachableHat?: boolean;
  /** Long cloth skinned to the torso and both thighs instead of `bone` (see ZombieGarmentDrape). */
  readonly draped?: boolean;
  /** Cloth the skin's stains and mud weather (see ZombieGarmentWear). */
  readonly fabric?: boolean;
  /** Surface pattern from the garment atlas; needs pattern UVs (garment shells have them). */
  readonly pattern?: GarmentPattern;
}

/** Hats knocked off by the first head hit, with everything sewn onto them. */
const DETACHABLE_HATS: ReadonlySet<ZombieAccessory['kind']> = new Set([
  'sideCap', 'peakedCap', 'helmet', 'furHat', 'mitre', 'biretta', 'pilgrimHat',
]);

/** Accessories built here; vestments have their own builders (ZombieClergyGarments). */
type UniformAccessory = Exclude<ZombieAccessory, ZombieVestment>;
type UniformKind = UniformAccessory['kind'];
type AccessoryOf<K extends UniformKind> = Extract<UniformAccessory, { kind: K }>;
type AccessoryBuilder<K extends UniformKind> = (accessory: AccessoryOf<K>, m: BodyMeasures) => AccessoryPart[];

const BUILDERS: { readonly [K in UniformKind]: AccessoryBuilder<K> } = {
  sideCap: ({ cloth, star: starColor }, m) => {
    const base = scaled(m.crown, FIT * 1.02, FIT * 1.05);
    // Boat shape: full length along the skull, pinched to a ridge on top.
    const ridge = { ...base, rx: base.rx * 0.18, rz: base.rz * 0.92 };
    const y0 = m.browY + 0.03;
    const front = frontOf(base, y0 + 0.03, 0.004);
    return [
      { geometry: loft(base, y0, ridge, m.crownTop + 0.035, { capTop: true }), color: cloth, bone: 'Head' },
      { geometry: star(0.016, front, new THREE.Euler(-0.35, 0, 0)), color: starColor, bone: 'Head' },
    ];
  },

  peakedCap: ({ crown, band, visor, badge }, m) => {
    const bandSection = scaled(m.crown, FIT);
    const bandTop = m.browY + 0.045;
    // The crown flares out over the band and stands higher at the front.
    const top = { ...scaled(m.crown, FIT * 1.2, FIT * 1.12), z: m.crown.z + 0.01 };
    const front = frontOf(bandSection, m.browY + 0.023, 0.004);
    return [
      { geometry: loft(bandSection, m.browY, bandSection, bandTop), color: band, bone: 'Head' },
      { geometry: loft(bandSection, bandTop, top, m.crownTop + 0.02, { capTop: true }), color: crown, bone: 'Head' },
      {
        geometry: slab({ ...bandSection, rz: bandSection.rz + 0.05 }, m.browY + 0.004, 0.008, -Math.PI / 2, Math.PI, 0.016),
        color: visor,
        bone: 'Head',
      },
      { geometry: star(0.014, front), color: badge, bone: 'Head' },
    ];
  },

  helmet: ({ shell, star: starColor }, m) => {
    const rim = scaled(m.crown, FIT * 1.08, FIT * 1.06);
    const dome = new THREE.SphereGeometry(1, RING_SEGMENTS, 4, 0, Math.PI * 2, 0, Math.PI / 2)
      .toNonIndexed()
      .scale(rim.rx, m.crownTop + 0.025 - m.browY, rim.rz)
      .translate(rim.x, m.browY, rim.z);
    const parts: AccessoryPart[] = [
      { geometry: dome, color: shell, bone: 'Head' },
      { geometry: loft(scaled(rim, 1.07), m.browY - 0.02, rim, m.browY), color: shell, bone: 'Head' },
    ];
    if (starColor !== undefined) {
      parts.push({ geometry: star(0.017, frontOf(rim, m.browY + 0.04, -0.012), new THREE.Euler(-0.5, 0, 0)), color: starColor, bone: 'Head' });
    }
    return parts;
  },

  furHat: ({ fur, star: starColor }, m) => {
    const body = scaled(m.crown, FIT * 1.1, FIT * 1.06);
    const y0 = m.browY - 0.01;
    const top = m.crownTop + 0.035;
    const flap = (side: -1 | 1): THREE.BufferGeometry => box(
      [0.02, 0.06, body.rz * 1.4],
      new THREE.Vector3(body.x + side * (body.rx + 0.006), y0 + 0.06, body.z - 0.01),
      new THREE.Euler(0, 0, -side * 0.1),
    );
    return [
      { geometry: loft(body, y0, scaled(body, 0.96), top, { capTop: true }), color: fur, bone: 'Head' },
      // Front flap folded up over the brow, ear flaps tied up on top.
      { geometry: box([body.rx * 1.4, 0.05, 0.024], frontOf(body, y0 + 0.04, 0.003), new THREE.Euler(-0.12, 0, 0)), color: fur, bone: 'Head' },
      { geometry: flap(-1), color: fur, bone: 'Head' },
      { geometry: flap(1), color: fur, bone: 'Head' },
      { geometry: star(0.014, frontOf(body, y0 + 0.043, 0.017), new THREE.Euler(-0.12, 0, 0)), color: starColor, bone: 'Head' },
    ];
  },

  hood: ({ cloth }, m) => {
    // Open at the face: the shell wraps from one cheek round the back to the
    // other, draping wider towards the shoulders. Both faces show through the opening.
    const top = scaled(m.crown, FIT * 1.06);
    const bottom = scaled(m.crown, FIT * 1.2, FIT * 1.04);
    const opening = Math.PI * 0.32;
    const shell = loft(bottom, m.shoulderY + 0.01, top, m.browY + 0.035, {
      capTop: true, start: opening, arc: Math.PI * 2 - opening * 2,
    });
    return [{ geometry: doubleSided(shell), color: cloth, bone: 'Head' }];
  },

  scarf: ({ cloth }, m) => {
    const collar = { ...m.chest, rx: m.chest.rx * 0.62, rz: m.chest.rz * 0.78 };
    const tail = frontOf(m.chest, m.shoulderY - 0.15, 0.012);
    return [
      { geometry: loft(collar, m.shoulderY - 0.035, scaled(collar, 0.82), m.shoulderY + 0.05), color: cloth, bone: 'Spine2' },
      // The loose end hangs down the left breast.
      {
        geometry: box([0.07, 0.22, 0.016], new THREE.Vector3(tail.x + m.chest.rx * 0.35, tail.y, tail.z), new THREE.Euler(0.08, 0, 0.12)),
        color: cloth,
        bone: 'Spine2',
      },
    ];
  },

  canteen: ({ flask }, m) => {
    const ring = scaled(m.waist, FIT);
    const flaskGeometry = new THREE.CylinderGeometry(0.038, 0.038, 0.13, 8).toNonIndexed()
      .translate(ring.x - ring.rx - 0.03, m.waistY - 0.09, ring.z + ring.rz * 0.3);
    return [{ geometry: flaskGeometry, color: flask, bone: 'Hips' }];
  },

  satchel: ({ canvas }, m) => {
    const ring = scaled(m.waist, FIT);
    return [{
      geometry: box([0.035, 0.13, 0.11], new THREE.Vector3(ring.x + ring.rx + 0.02, m.waistY - 0.1, ring.z + ring.rz * 0.25), new THREE.Euler(0, 0, -0.06)),
      color: canvas,
      bone: 'Hips',
    }];
  },

  belt: ({ leather, buckle }, m) => {
    const ring = scaled(m.waist, FIT);
    return [
      { geometry: loft(ring, m.waistY - 0.028, ring, m.waistY + 0.028), color: leather, bone: 'Hips' },
      { geometry: box([0.07, 0.05, 0.014], frontOf(ring, m.waistY, 0.004)), color: buckle, bone: 'Hips' },
    ];
  },

  crossStrap: ({ leather }, m) => {
    const chest = scaled(m.chest, FIT);
    const waist = scaled(m.waist, FIT);
    // Right shoulder (−x) to the left hip, across the chest only: a rigid strap
    // on the hunched back stood out like a stick. The chest half rides the
    // upper spine and the belly half the lower one, so a hunch bends it.
    const segment = (from: THREE.Vector3, to: THREE.Vector3): THREE.BufferGeometry => {
      const tilt = Math.atan2(to.x - from.x, from.y - to.y);
      return box([0.035, from.distanceTo(to) + 0.02, 0.01], from.clone().lerp(to, 0.5), new THREE.Euler(0, 0, tilt));
    };
    const shoulder = new THREE.Vector3(chest.x - chest.rx * 0.5, m.shoulderY - 0.03, chest.z + chest.rz);
    const hip = new THREE.Vector3(waist.x + waist.rx * 0.7, m.waistY + 0.03, waist.z + waist.rz);
    const middle = shoulder.clone().lerp(hip, 0.5);
    return [
      { geometry: segment(shoulder, middle), color: leather, bone: 'Spine2' },
      { geometry: segment(middle, hip), color: leather, bone: 'Spine' },
    ];
  },

  shoulderBoards: ({ cloth, stripe }, m) => {
    const parts: AccessoryPart[] = [];
    for (const side of [-1, 1] as const) {
      const center = new THREE.Vector3(m.chest.x + side * m.chest.rx * 0.82, m.shoulderY - 0.012, m.chest.z + 0.01);
      parts.push(
        { geometry: box([0.11, 0.012, 0.055], center), color: cloth, bone: 'Spine2' },
        { geometry: box([0.1, 0.004, 0.012], center.clone().setY(center.y + 0.008)), color: stripe, bone: 'Spine2' },
      );
    }
    return parts;
  },

  coatRoll: ({ cloth }, m) => {
    // A torus slung from the left shoulder (+x) to under the right arm: its
    // ring turns to face sideways, then tilts up towards the left shoulder.
    const roll = new THREE.TorusGeometry(1, 0.24, 5, 14).toNonIndexed();
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(m.chest.x + 0.02, m.shoulderY - 0.18, m.chest.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, -0.66, 'ZYX')),
      new THREE.Vector3(m.chest.rz * 1.36, 0.22, 0.2),
    );
    return [{ geometry: roll.applyMatrix4(matrix), color: cloth, bone: 'Spine2' }];
  },

  ammoPouches: ({ leather }, m) => {
    const ring = scaled(m.waist, FIT);
    return [-1, 1].map((side) => ({
      geometry: box([0.07, 0.075, 0.035], new THREE.Vector3(ring.x + side * ring.rx * 0.5, m.waistY - 0.01, ring.z + ring.rz * 0.92 + 0.018)),
      color: leather,
      bone: 'Hips',
    }));
  },

  medals: ({ ribbons }, m) => {
    const front = frontOf(m.chest, m.shoulderY - 0.12, 0.006);
    return ribbons.map((color, index) => ({
      geometry: box([0.03, 0.016, 0.008], new THREE.Vector3(
        front.x + m.chest.rx * 0.45 + ((index % 2) - 0.5) * 0.032,
        front.y - Math.floor(index / 2) * 0.019,
        front.z,
      )),
      color,
      bone: 'Spine2',
    }));
  },
};

function partsOf<K extends UniformKind>(accessory: AccessoryOf<K>, measures: BodyMeasures): AccessoryPart[] {
  return (BUILDERS[accessory.kind] as AccessoryBuilder<K>)(accessory, measures);
}

/** Builds every part of the given accessories, fitted to the measured body. */
export function buildAccessoryParts(accessories: readonly ZombieAccessory[], body: ZombieBodyFrame): AccessoryPart[] {
  if (accessories.length === 0) return [];
  const measures = measure(body);
  return accessories.flatMap((accessory) => {
    const detachableHat = DETACHABLE_HATS.has(accessory.kind);
    const parts = isVestment(accessory) ? buildVestmentParts(accessory, measures) : partsOf(accessory, measures);
    return parts.map((part) => ({ ...part, detachableHat }));
  });
}
