import * as THREE from 'three';
import {
  BODY_SIDES,
  FIT,
  box,
  garmentShell,
  scaled,
  sleeveShell,
  type BodyMeasures,
  type GarmentRing,
  type GarmentShellOptions,
  type Section,
} from './ZombieAccessoryGeometry';
import type { AccessoryPart } from './ZombieSkinAccessories';
import type { GarmentHem, ZombieVestment } from './ZombieSkinCatalog';

/**
 * Builders of the medieval clergy garments (ZombieVestment), fitted to the
 * measured walker. Long cloth is `draped` (hips and thighs, see
 * ZombieGarmentDrape) and every cloth part is `fabric`, so a skin's stains
 * and mud weather it. Layers keep growing radii, outermost last: robe,
 * rochet, stole, scapular or chasuble, orphreys, cord or sash.
 */

type VestmentOf<K extends ZombieVestment['kind']> = Extract<ZombieVestment, { kind: K }>;
type VestmentBuilder<K extends ZombieVestment['kind']> = (vestment: VestmentOf<K>, m: BodyMeasures) => AccessoryPart[];

/** Depth of the vertical folds at the hem, as a radius fraction. */
const ROBE_FOLDS = 0.07;
const PANEL_FOLDS = 0.06;
/** Half the angular width of a chasuble panel; the sides stay open for the arms. */
const CHASUBLE_HALF_ARC = Math.PI * 0.36;
const SCAPULAR_HALF_ARC = Math.PI * 0.17;
/** How much higher the chasuble hem hangs at the open sides than at the center point. */
const CHASUBLE_HEM_RISE = 0.09;
/** Radial gap of an overlay (orphrey, stole) over the cloth beneath it. */
const OVERLAY_GAP = 0.02;

function hemHeight(m: BodyMeasures, hem: GarmentHem): number {
  const ankle = Math.max(m.feet.Left.max.y, m.feet.Right.max.y) + 0.04;
  if (hem === 'ankle') return ankle;
  return hem === 'knee' ? m.kneeY - 0.02 : (m.kneeY + ankle) / 2;
}

/** Waist-to-hem skirt rings; `grow` widens an outer layer. */
function robeRings(m: BodyMeasures, hemY: number, grow = 1): GarmentRing[] {
  const rings: GarmentRing[] = [
    { section: scaled(m.waist, 1.1 * grow, 1.12 * grow), y: m.waistY + 0.02 },
    { section: scaled(m.legs, 1.12 * grow, 1.25 * grow), y: m.hipBottomY - 0.14 },
  ];
  if (hemY < m.kneeY - 0.08) rings.push({ section: scaled(m.legs, 1.25 * grow, 1.45 * grow), y: m.kneeY });
  rings.push({ section: scaled(m.legs, 1.45 * grow, 1.7 * grow), y: hemY });
  return rings;
}

/** Shoulder-to-hem rings of an over-garment hanging front and back (chasuble, scapular). */
function panelRings(m: BodyMeasures, hemY: number): GarmentRing[] {
  return [
    { section: { ...m.chest, rx: m.chest.rx * 0.6, rz: m.chest.rz * 0.64 }, y: m.shoulderY + 0.02 },
    { section: scaled(m.chest, 1.2, 1.24), y: m.shoulderY - 0.045 },
    { section: scaled(m.chest, 1.24, 1.3), y: m.shoulderY - 0.2 },
    { section: scaled(m.waist, 1.32, 1.32), y: m.waistY },
    { section: scaled(m.legs, 1.32, 1.46), y: m.hipBottomY - 0.14 },
    { section: scaled(m.legs, 1.44, 1.62), y: hemY },
  ];
}

/** `rings` pushed out past their deepest folds, for cloth laid over them. */
function overlayRings(rings: readonly GarmentRing[], folds: number, gap = OVERLAY_GAP): GarmentRing[] {
  const last = Math.max(1, rings.length - 1);
  return rings.map((ring, row) => {
    const grow = 1 + folds * (row / last) + gap / Math.max(ring.section.rx, ring.section.rz);
    return { section: scaled(ring.section, grow), y: ring.y };
  });
}

/** Section of a garment at height `y`, interpolated between its rings (listed top to bottom). */
function ringAt(rings: readonly GarmentRing[], y: number): Section {
  for (let row = 1; row < rings.length; row++) {
    const upper = rings[row - 1];
    const lower = rings[row];
    if (y < lower.y && row < rings.length - 1) continue;
    const t = THREE.MathUtils.clamp((upper.y - y) / (upper.y - lower.y), 0, 1);
    const lerp = (a: number, b: number): number => a + (b - a) * t;
    return {
      x: lerp(upper.section.x, lower.section.x),
      z: lerp(upper.section.z, lower.section.z),
      rx: lerp(upper.section.rx, lower.section.rx),
      rz: lerp(upper.section.rz, lower.section.rz),
    };
  }
  return rings[0].section;
}

/** Hem raised towards the panel sides, so it hangs to a point at its center. */
function pointedHem(center: number, halfArc: number, rise: number): (angle: number) => number {
  return (angle) => {
    const offset = Math.abs(Math.atan2(Math.sin(angle - center), Math.cos(angle - center))) / halfArc;
    return rise * offset * offset;
  };
}

function draped(geometry: THREE.BufferGeometry, color: number): AccessoryPart {
  return { geometry, color, bone: 'Hips', draped: true, fabric: true };
}

/** Front (center 0) and back (center π) panels of the same rings; `hemRise` points their hems. */
function frontAndBack(
  rings: readonly GarmentRing[], halfArc: number, color: number, options: GarmentShellOptions, hemRise = 0,
): AccessoryPart[] {
  return [0, Math.PI].map((center) => draped(garmentShell(rings, {
    ...options, start: center - halfArc, arc: halfArc * 2, hemLift: hemRise > 0 ? pointedHem(center, halfArc, hemRise) : undefined,
  }), color));
}

/** A vertical strip down the middle of each panel. */
function centerStrips(rings: readonly GarmentRing[], halfArc: number, color: number, hemRise: number): AccessoryPart[] {
  return [0, Math.PI].map((center) => draped(garmentShell(rings, {
    segments: 2, start: center - halfArc, arc: halfArc * 2,
    hemLift: hemRise > 0 ? pointedHem(center, CHASUBLE_HALF_ARC, hemRise) : undefined,
  }), color));
}

/** The head band every hat sits on: skull section just above the brow. */
function hatBand(m: BodyMeasures): Section {
  return scaled(m.crown, FIT * 1.04);
}

/**
 * One mitre horn: a curved shield over half the skull (front or back) that
 * narrows to a point leaning forward or back, so the side shows the cleft.
 */
function mitreHorn(m: BodyMeasures, facing: 1 | -1): THREE.BufferGeometry {
  const band = hatBand(m);
  const at = (y: number, lean: number, sx: number, sz: number): GarmentRing => ({
    section: { x: band.x, z: band.z + facing * band.rz * lean, rx: band.rx * sx, rz: band.rz * sz }, y: m.browY + y,
  });
  return garmentShell(
    [at(0.29, 0.55, 0.04, 0.3), at(0.21, 0.22, 0.62, 0.75), at(0.11, 0, 1, 1), at(-0.005, 0, 1, 1)],
    { segments: 6, start: facing > 0 ? -Math.PI / 2 : Math.PI / 2, arc: Math.PI },
  );
}

const BUILDERS: { readonly [K in ZombieVestment['kind']]: VestmentBuilder<K> } = {
  robe: ({ cloth, hem, layer = 0, tatter = 0.03 }, m) => {
    const rings = robeRings(m, hemHeight(m, hem), layer === 1 ? 1.12 : 1);
    return [draped(garmentShell(rings, { folds: ROBE_FOLDS, tatter, seed: layer + 3 }), cloth)];
  },

  chasuble: ({ cloth, orphrey }, m) => {
    const rings = panelRings(m, m.kneeY - 0.02);
    const trim = overlayRings(rings, PANEL_FOLDS);
    const crossY = m.shoulderY - 0.1;
    const bar = [crossY, crossY - 0.065].map((y) => ({ section: ringAt(trim, y), y }));
    return [
      ...frontAndBack(rings, CHASUBLE_HALF_ARC, cloth, { folds: PANEL_FOLDS, tatter: 0.025, seed: 5 }, CHASUBLE_HEM_RISE),
      // Column orphreys down both panels and a cross bar over the breast.
      ...centerStrips(trim, 0.17, orphrey, CHASUBLE_HEM_RISE),
      draped(garmentShell(bar, { segments: 8, start: -CHASUBLE_HALF_ARC, arc: CHASUBLE_HALF_ARC * 2 }), orphrey),
    ];
  },

  stole: ({ cloth }, m) => {
    // Hangs from under the chasuble to mid-shin, over the alb's folds.
    const robe = overlayRings(robeRings(m, hemHeight(m, 'ankle')), ROBE_FOLDS);
    const ends = [m.hipBottomY - 0.14, hemHeight(m, 'shin') - 0.04].map((y) => ({ section: ringAt(robe, y), y }));
    return [-1, 1].map((side) => draped(garmentShell(ends, {
      segments: 2, start: side * 0.17 - 0.07, arc: 0.14, tatter: 0.035, seed: side + 11,
    }), cloth));
  },

  mitre: ({ cloth, orphrey }, m) => {
    const band = hatBand(m);
    const lappet = (side: -1 | 1): THREE.BufferGeometry => box(
      [0.045, 0.2, 0.008],
      new THREE.Vector3(band.x + side * 0.035, m.browY - 0.09, band.z - band.rz - 0.006),
      new THREE.Euler(-0.12, 0, 0),
    );
    const circulus = [m.browY + 0.045, m.browY - 0.008].map((y) => ({ section: scaled(band, 1.03), y }));
    const titulus = (facing: 1 | -1): THREE.BufferGeometry => garmentShell(
      [0.2, -0.005].map((y) => ({ section: { ...scaled(band, 1.03), rx: band.rx * (y > 0.1 ? 0.66 : 1.03) }, y: m.browY + y })),
      { segments: 2, start: (facing > 0 ? 0 : Math.PI) - 0.22, arc: 0.44 },
    );
    return [
      { geometry: mitreHorn(m, 1), color: cloth, bone: 'Head', fabric: true },
      { geometry: mitreHorn(m, -1), color: cloth, bone: 'Head', fabric: true },
      { geometry: garmentShell(circulus, { segments: 12 }), color: orphrey, bone: 'Head', fabric: true },
      { geometry: titulus(1), color: orphrey, bone: 'Head', fabric: true },
      { geometry: titulus(-1), color: orphrey, bone: 'Head', fabric: true },
      { geometry: lappet(-1), color: cloth, bone: 'Head', fabric: true },
      { geometry: lappet(1), color: cloth, bone: 'Head', fabric: true },
    ];
  },

  biretta: ({ cloth, tuft }, m) => {
    const band = hatBand(m);
    const top = m.browY + 0.105;
    const ridge = (size: readonly [number, number, number], x: number, z: number): AccessoryPart => ({
      geometry: box(size, new THREE.Vector3(band.x + x, top + 0.018, band.z + z)), color: cloth, bone: 'Head', fabric: true,
    });
    return [
      { geometry: box([band.rx * 2.04, 0.11, band.rz * 2.04], new THREE.Vector3(band.x, top - 0.055, band.z)), color: cloth, bone: 'Head', fabric: true },
      ridge([0.012, 0.036, band.rz * 1.5], band.rx * 0.55, 0),
      ridge([0.012, 0.036, band.rz * 1.5], -band.rx * 0.55, 0),
      ridge([band.rx * 1.1, 0.036, 0.012], 0, -band.rz * 0.55),
      { geometry: box([0.035, 0.03, 0.035], new THREE.Vector3(band.x, top + 0.03, band.z)), color: tuft, bone: 'Head', fabric: true },
    ];
  },

  mozzetta: ({ cloth, buttons }, m) => {
    const rings: GarmentRing[] = [
      { section: { ...m.chest, rx: m.chest.rx * 0.62, rz: m.chest.rz * 0.66 }, y: m.shoulderY + 0.02 },
      { section: scaled(m.chest, 1.32, 1.34), y: m.shoulderY - 0.04 },
      { section: scaled(m.chest, 1.4, 1.44), y: m.shoulderY - 0.17 },
    ];
    // Shorter over the arms, which reach out from under it.
    const hemLift = (angle: number): number => 0.05 * Math.abs(Math.sin(angle));
    const front = ringAt(overlayRings(rings, 0.03, 0.006), m.shoulderY - 0.1);
    const parts = [draped(garmentShell(rings, { folds: 0.03, tatter: 0.015, seed: 17, hemLift }), cloth)];
    for (let index = 0; index < 3; index++) {
      const y = m.shoulderY - 0.035 - index * 0.042;
      parts.push({
        geometry: box([0.014, 0.014, 0.01], new THREE.Vector3(front.x, y, ringAt(rings, y).z + ringAt(rings, y).rz * 1.03 + 0.008)),
        color: buttons, bone: 'Spine2',
      });
    }
    return parts;
  },

  sash: ({ cloth }, m) => {
    const rochet = overlayRings(robeRings(m, hemHeight(m, 'knee'), 1.12), ROBE_FOLDS);
    const band = [m.waistY + 0.035, m.waistY - 0.035].map((y) => ({ section: scaled(m.waist, 1.4, 1.42), y }));
    const tails = [m.waistY - 0.03, m.kneeY + 0.08].map((y) => ({ section: ringAt(rochet, y), y }));
    return [
      draped(garmentShell(band, { segments: 12 }), cloth),
      draped(garmentShell(tails, { segments: 2, start: 1.15, arc: 0.16, tatter: 0.03, seed: 23 }), cloth),
    ];
  },

  pectoralCross: ({ metal }, m) => {
    const y = m.shoulderY - 0.19;
    const z = m.chest.z + m.chest.rz * 1.42 + 0.01;
    const chain = (side: -1 | 1): THREE.BufferGeometry => {
      const from = new THREE.Vector3(m.chest.x + side * m.chest.rx * 0.5, m.shoulderY + 0.01, m.chest.z + m.chest.rz * 0.9);
      const to = new THREE.Vector3(m.chest.x, y + 0.045, z);
      const tilt = Math.atan2(to.x - from.x, from.y - to.y);
      return box([0.006, from.distanceTo(to), 0.006], from.clone().lerp(to, 0.5), new THREE.Euler(0, 0, tilt));
    };
    return [
      { geometry: box([0.014, 0.085, 0.01], new THREE.Vector3(m.chest.x, y, z)), color: metal, bone: 'Spine2' },
      { geometry: box([0.055, 0.014, 0.01], new THREE.Vector3(m.chest.x, y + 0.018, z)), color: metal, bone: 'Spine2' },
      { geometry: chain(-1), color: metal, bone: 'Spine2' },
      { geometry: chain(1), color: metal, bone: 'Spine2' },
    ];
  },

  cowl: ({ cloth }, m) => {
    const band = hatBand(m);
    const at = (y: number, sx: number, sz: number, dz: number): GarmentRing => ({
      section: { x: band.x, z: band.z + dz, rx: band.rx * sx, rz: band.rz * sz }, y,
    });
    // Peaked at the back, brim pulled forward over the brow, falling onto the shoulders.
    const rings = [
      at(m.crownTop + 0.06, 0.15, 0.15, -0.06),
      at(m.browY + 0.06, 1.28, 1.32, -0.005),
      at(m.browY - 0.01, 1.36, 1.42, 0.035),
      at(m.browY - 0.14, 1.42, 1.38, 0.01),
      // Wider than the scapular's shoulders, which it covers.
      { section: scaled(m.chest, 1.34, 1.42), y: m.shoulderY - 0.04 },
    ];
    const opening = Math.PI * 0.3;
    return [{
      geometry: garmentShell(rings, { segments: 14, start: opening, arc: Math.PI * 2 - opening * 2, folds: 0.04, tatter: 0.02, seed: 29 }),
      color: cloth, bone: 'Head', fabric: true,
    }];
  },

  scapular: ({ cloth }, m) => {
    const rings = overlayRings(panelRings(m, hemHeight(m, 'shin')), 0, 0.004);
    return frontAndBack(rings, SCAPULAR_HALF_ARC, cloth, { segments: 4, folds: 0.04, tatter: 0.04, seed: 31 });
  },

  cord: ({ rope }, m) => {
    const scapular = overlayRings(panelRings(m, hemHeight(m, 'shin')), 0.04, 0.012);
    const girdle = [m.waistY + 0.012, m.waistY - 0.012].map((y) => ({ section: ringAt(scapular, m.waistY), y }));
    const robe = overlayRings(robeRings(m, hemHeight(m, 'ankle')), ROBE_FOLDS, 0.012);
    const end = [m.waistY - 0.01, m.kneeY + 0.06].map((y) => ({ section: ringAt(robe, y), y }));
    const knots = [0.25, 0.55, 0.85].map((t) => {
      const y = m.waistY - 0.01 + (m.kneeY + 0.06 - m.waistY + 0.01) * t;
      const section = ringAt(robe, y);
      const angle = 0.84;
      return draped(box([0.03, 0.03, 0.03], new THREE.Vector3(
        section.x + Math.sin(angle) * section.rx, y, section.z + Math.cos(angle) * section.rz,
      )), rope);
    });
    return [
      draped(garmentShell(girdle, { segments: 12 }), rope),
      draped(garmentShell(end, { segments: 2, start: 0.8, arc: 0.08 }), rope),
      ...knots,
    ];
  },

  wideSleeves: ({ cloth, tatter = 0.01 }, m) => BODY_SIDES.map((side) => {
    const arm = m.forearms[side];
    const outward = side === 'Left' ? 1 : -1;
    const elbow = outward > 0 ? arm.min.x : arm.max.x;
    const wrist = outward > 0 ? arm.max.x : arm.min.x;
    const radius = Math.max(arm.max.y - arm.min.y, arm.max.z - arm.min.z) / 2;
    const geometry = sleeveShell(
      elbow + outward * 0.03, wrist - outward * 0.015,
      (arm.min.y + arm.max.y) / 2, (arm.min.z + arm.max.z) / 2,
      radius * 1.35, radius * 2.6, { folds: 0.08, tatter, seed: outward + 41 },
    );
    return { geometry, color: cloth, bone: `${side}ForeArm`, fabric: true };
  }),

  sandals: ({ leather }, m) => BODY_SIDES.flatMap((side) => {
    const foot = m.feet[side];
    const x = (foot.min.x + foot.max.x) / 2;
    const width = foot.max.x - foot.min.x + 0.012;
    const length = foot.max.z - foot.min.z + 0.01;
    const z = (foot.min.z + foot.max.z) / 2;
    return [
      { geometry: box([width, 0.014, length], new THREE.Vector3(x, 0.005, z)), color: leather, bone: `${side}Foot` },
      { geometry: box([width + 0.004, 0.012, 0.022], new THREE.Vector3(x, 0.05, z - length * 0.05)), color: leather, bone: `${side}Foot` },
      { geometry: box([width + 0.004, 0.012, 0.022], new THREE.Vector3(x, 0.035, z + length * 0.22)), color: leather, bone: `${side}Foot` },
    ];
  }),
};

export function buildVestmentParts<K extends ZombieVestment['kind']>(vestment: VestmentOf<K>, measures: BodyMeasures): AccessoryPart[] {
  return (BUILDERS[vestment.kind] as VestmentBuilder<K>)(vestment, measures);
}

const VESTMENT_KINDS: ReadonlySet<string> = new Set(Object.keys(BUILDERS));

export function isVestment(accessory: { readonly kind: string }): accessory is ZombieVestment {
  return VESTMENT_KINDS.has(accessory.kind);
}
