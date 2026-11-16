import * as THREE from 'three';
import {
  BODY_SIDES,
  FIT,
  box,
  garmentShell,
  scaled,
  sleeveShell,
  type BodyMeasures,
  type BodySide,
  type GarmentRing,
  type GarmentShellOptions,
  type Section,
} from './ZombieAccessoryGeometry';
import type { GarmentPattern } from './ZombieGarmentPatterns';
import type { AccessoryPart } from './ZombieSkinAccessories';
import type { GarmentHem, ZombieVestment } from './ZombieSkinCatalog';

/**
 * Builders of the medieval cathedral garments (ZombieVestment), fitted to the
 * measured walker. Long cloth is `draped` (hips and thighs, see
 * ZombieGarmentDrape) and every cloth part is `fabric`, so a skin's stains
 * and mud weather it. Layers keep growing radii, outermost last: robe, stole,
 * scapular, chasuble or surcoat, orphreys and crosses, cord or belt; on the
 * head the wimple sits under the veil.
 */

type VestmentOf<K extends ZombieVestment['kind']> = Extract<ZombieVestment, { kind: K }>;
type VestmentBuilder<K extends ZombieVestment['kind']> = (vestment: VestmentOf<K>, m: BodyMeasures) => AccessoryPart[];

/** Depth of the vertical folds at the hem, as a radius fraction. */
const ROBE_FOLDS = 0.07;
const PANEL_FOLDS = 0.06;
/** Half the angular width of a chasuble panel; the sides stay open for the arms. */
const CHASUBLE_HALF_ARC = Math.PI * 0.36;
/** A bishop's ample chasuble falls over the shoulders and upper arms. */
const AMPLE_CHASUBLE_HALF_ARC = Math.PI * 0.44;
const SCAPULAR_HALF_ARC = Math.PI * 0.17;
/** A surcoat is cut wider than a chasuble, leaving only narrow side slits for the mail. */
const SURCOAT_HALF_ARC = Math.PI * 0.4;
const DALMATIC_HALF_ARC = Math.PI * 0.42;
/** Angular width of the gold band down each edge of a trimmed scapular. */
const SCAPULAR_TRIM_ARC = 0.1;
/** How much higher the chasuble hem hangs at the open sides than at the center point. */
const CHASUBLE_HEM_RISE = 0.09;
/** Radial gap of an overlay (orphrey, stole) over the cloth beneath it. */
const OVERLAY_GAP = 0.02;

function hemHeight(m: BodyMeasures, hem: GarmentHem): number {
  const ankle = Math.max(m.feet.Left.max.y, m.feet.Right.max.y) + 0.04;
  if (hem === 'ankle') return ankle;
  return hem === 'knee' ? m.kneeY - 0.02 : (m.kneeY + ankle) / 2;
}

/** Waist-to-hem skirt rings; `grow` widens a skirt worn over another (a rochet over a cassock). */
function robeRings(m: BodyMeasures, hemY: number, grow = 1): GarmentRing[] {
  const rings: GarmentRing[] = [
    { section: scaled(m.waist, 1.1 * grow, 1.12 * grow), y: m.waistY + 0.02 },
    { section: scaled(m.legs, 1.12 * grow, 1.25 * grow), y: m.hipBottomY - 0.14 },
  ];
  if (hemY < m.kneeY - 0.08) rings.push({ section: scaled(m.legs, 1.25 * grow, 1.45 * grow), y: m.kneeY });
  rings.push({ section: scaled(m.legs, 1.45 * grow, 1.7 * grow), y: hemY });
  return rings;
}

/** How much wider an over-skirt is cut than the robe under it, clearing its folds. */
const OVER_ROBE_GROW = 1.14;

/** The part of `rings` between two heights, cut to them, for a strip laid over the cloth. */
function ringsBetween(rings: readonly GarmentRing[], top: number, bottom: number): GarmentRing[] {
  return [
    { section: ringAt(rings, top), y: top },
    ...rings.filter((ring) => ring.y < top && ring.y > bottom),
    { section: ringAt(rings, bottom), y: bottom },
  ];
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

function draped(geometry: THREE.BufferGeometry, color: number, pattern?: GarmentPattern): AccessoryPart {
  return { geometry, color, bone: 'Hips', draped: true, fabric: true, pattern };
}

/** Cloth riding one bone whole (hoods, sleeves, mitre). */
function rigid(geometry: THREE.BufferGeometry, color: number, bone: string, pattern?: GarmentPattern): AccessoryPart {
  return { geometry, color, bone, fabric: true, pattern };
}

/** Front (center 0) and back (center π) panels of the same rings; `hemRise` points their hems. */
function frontAndBack(
  rings: readonly GarmentRing[], halfArc: number, color: number, pattern: GarmentPattern, options: GarmentShellOptions, hemRise = 0,
): AccessoryPart[] {
  return [0, Math.PI].map((center) => draped(garmentShell(rings, {
    ...options, start: center - halfArc, arc: halfArc * 2, hemLift: hemRise > 0 ? pointedHem(center, halfArc, hemRise) : undefined,
  }), color, pattern));
}

/** A vertical strip down the middle of each panel, its hem following a panel `panelHalfArc` wide. */
function centerStrips(
  rings: readonly GarmentRing[], halfArc: number, panelHalfArc: number, color: number, hemRise: number,
): AccessoryPart[] {
  return [0, Math.PI].map((center) => draped(garmentShell(rings, {
    segments: 2, start: center - halfArc, arc: halfArc * 2,
    hemLift: hemRise > 0 ? pointedHem(center, panelHalfArc, hemRise) : undefined,
  }), color, 'embroidery'));
}

/** The head band every hat sits on: skull section just above the brow. */
function hatBand(m: BodyMeasures): Section {
  return scaled(m.crown, FIT * 1.04);
}

/**
 * One mitre horn: a curved shield over half the skull (front or back) that
 * narrows to a point leaning forward or back, so the side shows the cleft.
 */
function mitreHorn(m: BodyMeasures, facing: 1 | -1, broken: boolean): THREE.BufferGeometry {
  const band = hatBand(m);
  const at = (y: number, lean: number, sx: number, sz: number): GarmentRing => ({
    section: { x: band.x, z: band.z + facing * band.rz * lean, rx: band.rx * sx, rz: band.rz * sz }, y: m.browY + y,
  });
  const start = facing > 0 ? -Math.PI / 2 : Math.PI / 2;
  if (!broken) {
    return garmentShell(
      [at(0.3, 0.55, 0.04, 0.3), at(0.22, 0.22, 0.62, 0.75), at(0.11, 0, 1, 1), at(-0.005, 0, 1, 1)],
      { segments: 6, start, arc: Math.PI },
    );
  }
  // Snapped below the point: rings listed bottom up so the frayed "hem" (and
  // the ragged pattern's tears) is the torn top edge; the stump sags aside.
  const stump = garmentShell(
    [at(-0.005, 0, 1, 1), at(0.11, 0, 1, 1), at(0.17, 0.1, 0.84, 0.9)],
    { segments: 6, start, arc: Math.PI, tatter: 0.06, seed: 47 },
  );
  const hinge = new THREE.Vector3(band.x, m.browY + 0.05, band.z + facing * band.rz);
  return stump.applyMatrix4(new THREE.Matrix4()
    .makeTranslation(hinge.x, hinge.y, hinge.z)
    .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(facing * 0.18, 0, -0.2)))
    .multiply(new THREE.Matrix4().makeTranslation(-hinge.x, -hinge.y, -hinge.z)));
}

/**
 * Closed hood rounded over the crown, open at the face and resting on the
 * shoulders (veil, mail coif); `ease` below 1 fits it tighter to the skull.
 */
function fittedHood(m: BodyMeasures, color: number, pattern: GarmentPattern, ease: number, folds: number, seed: number): AccessoryPart {
  const band = hatBand(m);
  const loose = (scale: number): number => 1 + (scale - 1) * ease;
  const at = (y: number, sx: number, sz: number, dz: number): GarmentRing => ({
    section: { x: band.x, z: band.z + dz, rx: band.rx * loose(sx), rz: band.rz * loose(sz) }, y,
  });
  const rings = [
    at(m.crownTop + 0.01 + 0.02 * ease, 0.08, 0.08, -0.01),
    at(m.crownTop + 0.005 + 0.01 * ease, 0.7, 0.75, -0.01),
    at(m.browY + 0.05, 1.3, 1.34, -0.005),
    at(m.browY - 0.02, 1.36, 1.4, 0.02 * ease),
    at(m.browY - 0.14, 1.42, 1.38, 0),
    { section: scaled(m.chest, loose(1.44), loose(1.52)), y: m.shoulderY - 0.04 },
  ];
  const opening = Math.PI * 0.28;
  return rigid(
    garmentShell(rings, { segments: 12, start: opening, arc: Math.PI * 2 - opening * 2, folds, tatter: 0.02, seed }),
    color, 'Head', pattern,
  );
}

/** Short cape over the shoulders and upper chest, under a hood; torn at the hem. */
function shoulderCape(m: BodyMeasures, color: number, seed: number): AccessoryPart {
  return draped(garmentShell(capeRings(m), { segments: 14, folds: 0.05, tatter: 0.04, seed, hemLift: capeHemLift }), color, 'ragged');
}

function capeRings(m: BodyMeasures): GarmentRing[] {
  return [
    { section: scaled(m.chest, 1.3, 1.38), y: m.shoulderY },
    { section: scaled(m.chest, 1.5, 1.56), y: m.shoulderY - 0.1 },
    { section: scaled(m.chest, 1.58, 1.62), y: m.shoulderY - 0.24 },
  ];
}

/** A cape hangs shorter over the arms, which reach out from under it. */
function capeHemLift(angle: number): number {
  return 0.06 * Math.abs(Math.sin(angle));
}

/** The belt line every belt and hanging item sits on: outside panels and robes, at the waist. */
function beltSection(m: BodyMeasures): Section {
  return ringAt(overlayRings(panelRings(m, hemHeight(m, 'shin')), PANEL_FOLDS, 0.016), m.waistY);
}

/** Point on the belt line at `angle` (0 front, left positive), pushed out by `gap`, at height `y`. */
function onBelt(belt: Section, angle: number, gap: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(belt.x + Math.sin(angle) * (belt.rx + gap), y, belt.z + Math.cos(angle) * (belt.rz + gap));
}

/** Small metal ring standing in the plane facing `angle`. */
function hoop(center: THREE.Vector3, radius: number, angle: number): THREE.BufferGeometry {
  return new THREE.TorusGeometry(radius, radius * 0.22, 4, 10).toNonIndexed()
    .applyMatrix4(new THREE.Matrix4().makeRotationY(angle)).translate(center.x, center.y, center.z);
}

/** Open cloak or cope: from the shoulders to `hemY`, closed at the back, open at the front. */
const CLOAK_OPENING = Math.PI * 0.3;

function cloakRings(m: BodyMeasures, hemY: number): GarmentRing[] {
  return [
    { section: { ...m.chest, rx: m.chest.rx * 0.85, rz: m.chest.rz * 0.9 }, y: m.shoulderY + 0.03 },
    { section: scaled(m.chest, 1.62, 1.68), y: m.shoulderY - 0.05 },
    { section: scaled(m.chest, 1.68, 1.72), y: m.shoulderY - 0.22 },
    { section: scaled(m.waist, 1.85, 1.8), y: m.waistY },
    { section: scaled(m.legs, 1.62, 1.78), y: m.hipBottomY - 0.14 },
    { section: scaled(m.legs, 1.86, 2.02), y: hemY },
  ];
}

/** A cross of strips laid over the front of a panel, from `top` down to `bottom`. */
function breastCross(rings: readonly GarmentRing[], top: number, bottom: number, color: number, width: number): AccessoryPart[] {
  const barTop = top - (top - bottom) * 0.22;
  const half = (y: number): number => width / (2 * Math.max(ringAt(rings, y).rx, 0.05));
  return [
    draped(garmentShell(ringsBetween(rings, top, bottom), { segments: 2, start: -half(barTop), arc: half(barTop) * 2 }), color, 'weave'),
    draped(garmentShell(ringsBetween(rings, barTop, barTop - width), {
      segments: 6, start: -half(barTop) * 4.2, arc: half(barTop) * 8.4,
    }), color, 'weave'),
  ];
}

/** Point at `angle` on the section of `rings` at height `y`, pushed out by `gap`. */
function surfacePoint(rings: readonly GarmentRing[], angle: number, y: number, gap: number): THREE.Vector3 {
  const section = ringAt(rings, y);
  return new THREE.Vector3(section.x + Math.sin(angle) * (section.rx + gap), y, section.z + Math.cos(angle) * (section.rz + gap));
}

/** A rope end hanging from the girdle at `angle`, down to `bottom`, with knots and a frayed tassel. */
function ropeEnd(robe: readonly GarmentRing[], angle: number, top: number, bottom: number, rope: number): AccessoryPart[] {
  const end = [top, bottom].map((y) => ({ section: ringAt(robe, y), y }));
  const knots = [0.3, 0.62].map((t) => draped(box([0.028, 0.028, 0.028], surfacePoint(robe, angle, top + (bottom - top) * t, 0.01)), rope));
  const knotPoint = surfacePoint(robe, angle, bottom, 0.012);
  const tasselPoint = surfacePoint(robe, angle, bottom - 0.09, 0.012);
  const tassel = garmentShell([
    { section: { x: knotPoint.x, z: knotPoint.z, rx: 0.012, rz: 0.012 }, y: bottom },
    { section: { x: tasselPoint.x, z: tasselPoint.z, rx: 0.026, rz: 0.026 }, y: bottom - 0.09 },
  ], { segments: 6, tatter: 0.03, seed: Math.round(angle * 10) });
  return [
    draped(garmentShell(end, { segments: 2, start: angle - 0.04, arc: 0.08 }), rope, 'rope'),
    ...knots,
    draped(tassel, rope, 'rope'),
  ];
}

/** Tube around one bind-pose arm segment (along x), `inset` meters in from its inner and outer ends. */
function armShell(
  arm: THREE.Box3, side: BodySide, r0: number, r1: number, inset: readonly [number, number], options: GarmentShellOptions,
): THREE.BufferGeometry {
  const outward = side === 'Left' ? 1 : -1;
  const inner = outward > 0 ? arm.min.x : arm.max.x;
  const outer = outward > 0 ? arm.max.x : arm.min.x;
  return sleeveShell(
    inner + outward * inset[0], outer - outward * inset[1],
    (arm.min.y + arm.max.y) / 2, (arm.min.z + arm.max.z) / 2, r0, r1, options,
  );
}

function armRadius(arm: THREE.Box3): number {
  return Math.max(arm.max.y - arm.min.y, arm.max.z - arm.min.z) / 2;
}

const BUILDERS: { readonly [K in ZombieVestment['kind']]: VestmentBuilder<K> } = {
  robe: ({ cloth, hem, tatter = 0.03, surface = 'ragged', lace, over = false }, m) => {
    const hemY = hemHeight(m, hem);
    const rings = robeRings(m, hemY, over ? OVER_ROBE_GROW : 1);
    const parts = [draped(garmentShell(rings, { folds: ROBE_FOLDS, tatter, seed: over ? 4 : 3 }), cloth, surface)];
    if (lace !== undefined) {
      // An openwork band laid over the bottom of the skirt, scalloped at the hem.
      const band = ringsBetween(overlayRings(rings, ROBE_FOLDS, 0.01), hemY + 0.16, hemY);
      parts.push(draped(garmentShell(band, { segments: 16 }), lace, 'lace'));
    }
    return parts;
  },

  chasuble: ({ cloth, orphrey, ample = false }, m) => {
    const rings = panelRings(m, m.kneeY - 0.02);
    const trim = overlayRings(rings, PANEL_FOLDS);
    const halfArc = ample ? AMPLE_CHASUBLE_HALF_ARC : CHASUBLE_HALF_ARC;
    const crossY = m.shoulderY - 0.1;
    const bar = [crossY, crossY - 0.07].map((y) => ({ section: ringAt(trim, y), y }));
    const parts = [
      ...frontAndBack(rings, halfArc, cloth, 'ragged', { folds: PANEL_FOLDS, tatter: 0.025, seed: 5 }, CHASUBLE_HEM_RISE),
      // Column orphreys down both panels and a cross bar over the breast.
      ...centerStrips(trim, ample ? 0.24 : 0.17, halfArc, orphrey, CHASUBLE_HEM_RISE),
      draped(garmentShell(bar, { segments: 8, start: -halfArc, arc: halfArc * 2 }), orphrey, 'embroidery'),
    ];
    if (ample) {
      // A gold border along the whole hem of both panels.
      const border = ringsBetween(trim, m.kneeY + 0.08, m.kneeY - 0.02);
      for (const center of [0, Math.PI]) {
        parts.push(draped(garmentShell(border, {
          segments: 12, start: center - halfArc, arc: halfArc * 2, hemLift: pointedHem(center, halfArc, CHASUBLE_HEM_RISE),
        }), orphrey, 'embroidery'));
      }
    }
    return parts;
  },

  stole: ({ cloth }, m) => {
    // Hangs from under the chasuble to mid-shin, over the alb's folds and lace.
    const robe = overlayRings(robeRings(m, hemHeight(m, 'ankle')), ROBE_FOLDS, OVERLAY_GAP + 0.012);
    const ends = ringsBetween(robe, m.hipBottomY - 0.14, hemHeight(m, 'shin') - 0.04);
    return [-1, 1].map((side) => draped(garmentShell(ends, {
      segments: 2, start: side * 0.17 - 0.08, arc: 0.16, tatter: 0.035, seed: side + 11,
    }), cloth, 'embroidery'));
  },

  mitre: ({ cloth, orphrey, broken = false }, m) => {
    const band = hatBand(m);
    const lappet = (side: -1 | 1): THREE.BufferGeometry => box(
      [0.045, 0.2, 0.008],
      new THREE.Vector3(band.x + side * 0.035, m.browY - 0.09, band.z - band.rz - 0.006),
      new THREE.Euler(-0.12, 0, 0),
    );
    const circulus = [m.browY + 0.05, m.browY - 0.008].map((y) => ({ section: scaled(band, 1.03), y }));
    const titulus = (facing: 1 | -1): THREE.BufferGeometry => garmentShell(
      [0.2, -0.005].map((y) => ({ section: { ...scaled(band, 1.03), rx: band.rx * (y > 0.1 ? 0.66 : 1.03) }, y: m.browY + y })),
      { segments: 2, start: (facing > 0 ? 0 : Math.PI) - 0.24, arc: 0.48 },
    );
    return [
      rigid(mitreHorn(m, 1, broken), cloth, 'Head', broken ? 'ragged' : 'weave'),
      rigid(mitreHorn(m, -1, false), cloth, 'Head', 'weave'),
      rigid(garmentShell(circulus, { segments: 12 }), orphrey, 'Head', 'embroidery'),
      // A broken front horn tore its band away with it.
      ...(broken ? [] : [rigid(titulus(1), orphrey, 'Head', 'embroidery')]),
      rigid(titulus(-1), orphrey, 'Head', 'embroidery'),
      rigid(lappet(-1), orphrey, 'Head'),
      rigid(lappet(1), orphrey, 'Head'),
    ];
  },

  veil: ({ cloth }, m) => {
    // The fall rides the upper spine, outside the scapular, and ends above the
    // small of the back, where the run's hip swing would stretch it.
    const fall: GarmentRing[] = [
      { section: scaled(m.chest, 1.46, 1.54), y: m.shoulderY - 0.02 },
      { section: scaled(m.chest, 1.42, 1.5), y: m.shoulderY - 0.14 },
      { section: scaled(m.chest, 1.42, 1.52), y: m.shoulderY - 0.3 },
    ];
    return [
      // Loose over the wimple and its bib.
      fittedHood(m, cloth, 'weave', 1, 0.03, 53),
      draped(garmentShell(fall, { segments: 10, start: Math.PI * 0.55, arc: Math.PI * 0.9, folds: 0.05, tatter: 0.07, seed: 59 }), cloth, 'ragged'),
    ];
  },

  coif: ({ mail }, m) => [fittedHood(m, mail, 'chainmail', 0.88, 0, 71)],

  wimple: ({ cloth }, m) => {
    const band = hatBand(m);
    const at = (y: number, sx: number, sz: number): GarmentRing => ({
      section: { x: band.x, z: band.z, rx: band.rx * sx, rz: band.rz * sz }, y,
    });
    const opening = Math.PI * 0.24;
    // Frames the forehead and cheeks, closes under the chin and down the neck.
    const frame = [at(m.browY + 0.05, 1.14, 1.18), at(m.browY - 0.1, 1.2, 1.2)];
    const chin = [at(m.browY - 0.1, 1.2, 1.2), at(m.shoulderY + 0.005, 1.1, 1.1)];
    const bib: GarmentRing[] = [
      { section: { ...m.chest, rx: m.chest.rx * 0.78, rz: m.chest.rz * 0.8 }, y: m.shoulderY + 0.02 },
      { section: scaled(m.chest, 1.3, 1.36), y: m.shoulderY - 0.06 },
      { section: scaled(m.chest, 1.4, 1.46), y: m.shoulderY - 0.16 },
    ];
    return [
      rigid(garmentShell(frame, { segments: 14, start: opening, arc: Math.PI * 2 - opening * 2 }), cloth, 'Head', 'weave'),
      rigid(garmentShell(chin, { segments: 14 }), cloth, 'Head', 'weave'),
      draped(garmentShell(bib, { segments: 14, folds: 0.02, tatter: 0.02, seed: 61 }), cloth, 'weave'),
    ];
  },

  surcoat: ({ cloth, cross }, m) => {
    const rings = panelRings(m, hemHeight(m, 'shin'));
    const trim = overlayRings(rings, PANEL_FOLDS);
    return [
      ...frontAndBack(rings, SURCOAT_HALF_ARC, cloth, 'ragged', { folds: PANEL_FOLDS, tatter: 0.05, seed: 67 }),
      ...breastCross(trim, m.shoulderY - 0.06, m.waistY - 0.12, cross, 0.085),
    ];
  },

  swordBelt: ({ leather, buckle }, m) => {
    const ring = beltSection(m);
    const belt = [m.waistY + 0.03, m.waistY - 0.03].map((y) => ({ section: ring, y }));
    const pouchAngle = -1.05;
    // Stiff leather rides the hips whole, like the uniform belts.
    return [
      { geometry: garmentShell(belt, { segments: 14 }), color: leather, bone: 'Hips' },
      { geometry: box([0.075, 0.065, 0.016], new THREE.Vector3(ring.x, m.waistY, ring.z + ring.rz + 0.008)), color: buckle, bone: 'Hips' },
      {
        geometry: box([0.08, 0.1, 0.035], new THREE.Vector3(
          ring.x + Math.sin(pouchAngle) * (ring.rx + 0.02), m.waistY - 0.07, ring.z + Math.cos(pouchAngle) * (ring.rz + 0.02),
        )),
        color: leather, bone: 'Hips',
      },
    ];
  },

  mailSleeves: ({ mail }, m) => BODY_SIDES.flatMap((side) => {
    const upper = m.upperArms[side];
    const fore = m.forearms[side];
    return [
      rigid(armShell(upper, side, armRadius(upper) * 1.12, armRadius(upper) * 1.08, [0.01, 0], { segments: 10 }), mail, `${side}Arm`, 'chainmail'),
      // The forearm ends in a loose, rusted cuff over the wrist.
      rigid(armShell(fore, side, armRadius(fore) * 1.2, armRadius(fore) * 1.4, [0, 0.01], { segments: 10, tatter: 0.012, seed: 73 }),
        mail, `${side}ForeArm`, 'chainmail'),
    ];
  }),

  boots: ({ leather }, m) => BODY_SIDES.map((side) => {
    const shin = m.shins[side];
    const center = { x: (shin.min.x + shin.max.x) / 2, z: (shin.min.z + shin.max.z) / 2 };
    const radius = Math.max(shin.max.x - shin.min.x, shin.max.z - shin.min.z) / 2;
    const ring = (y: number, scale: number): GarmentRing => ({ section: { ...center, rx: radius * scale, rz: radius * scale }, y });
    // Tall riding boot: a turned-down cuff just under the knee over a snug shaft.
    const top = shin.max.y - 0.07;
    return rigid(
      garmentShell([ring(top, 1.42), ring(top - 0.05, 1.3), ring(top - 0.07, 1.16), ring(shin.min.y + 0.02, 1.16)], { segments: 10 }),
      leather, `${side}Leg`,
    );
  }),

  pectoralCross: ({ metal }, m) => {
    const y = m.shoulderY - 0.21;
    const z = m.chest.z + m.chest.rz * 1.5 + 0.012;
    const chain = (side: -1 | 1): THREE.BufferGeometry => {
      const from = new THREE.Vector3(m.chest.x + side * m.chest.rx * 0.5, m.shoulderY + 0.01, m.chest.z + m.chest.rz * 0.9);
      const to = new THREE.Vector3(m.chest.x, y + 0.05, z);
      const tilt = Math.atan2(to.x - from.x, from.y - to.y);
      return box([0.006, from.distanceTo(to), 0.006], from.clone().lerp(to, 0.5), new THREE.Euler(0, 0, tilt));
    };
    return [
      { geometry: box([0.016, 0.1, 0.012], new THREE.Vector3(m.chest.x, y, z)), color: metal, bone: 'Spine2' },
      { geometry: box([0.064, 0.016, 0.012], new THREE.Vector3(m.chest.x, y + 0.022, z)), color: metal, bone: 'Spine2' },
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
      at(m.crownTop + 0.07, 0.15, 0.15, -0.07),
      at(m.browY + 0.06, 1.3, 1.34, -0.005),
      at(m.browY - 0.01, 1.38, 1.46, 0.045),
      at(m.browY - 0.14, 1.44, 1.4, 0.015),
      // Wider than the scapular's shoulders, which it covers.
      { section: scaled(m.chest, 1.34, 1.42), y: m.shoulderY - 0.04 },
    ];
    const opening = Math.PI * 0.3;
    return [
      rigid(garmentShell(rings, { segments: 14, start: opening, arc: Math.PI * 2 - opening * 2, folds: 0.04, tatter: 0.02, seed: 29 }),
        cloth, 'Head', 'weave'),
      shoulderCape(m, cloth, 37),
    ];
  },

  scapular: ({ cloth, surface = 'ragged', trim }, m) => {
    const rings = overlayRings(panelRings(m, hemHeight(m, 'shin')), 0, 0.004);
    const parts = frontAndBack(rings, SCAPULAR_HALF_ARC, cloth, surface, { segments: 4, folds: 0.04, tatter: 0.04, seed: 31 });
    if (trim !== undefined) {
      // Gold bands down both edges of each panel.
      const edges = overlayRings(rings, 0.04, 0.006);
      for (const center of [0, Math.PI]) {
        for (const side of [-1, 1]) {
          const start = side < 0 ? center - SCAPULAR_HALF_ARC : center + SCAPULAR_HALF_ARC - SCAPULAR_TRIM_ARC;
          parts.push(draped(garmentShell(edges, { segments: 1, start, arc: SCAPULAR_TRIM_ARC }), trim, 'embroidery'));
        }
      }
    }
    return parts;
  },

  biretta: ({ cloth, tuft }, m) => {
    const band = hatBand(m);
    const top = m.browY + 0.105;
    const ridge = (size: readonly [number, number, number], x: number, z: number): AccessoryPart =>
      rigid(box(size, new THREE.Vector3(band.x + x, top + 0.018, band.z + z)), cloth, 'Head');
    return [
      rigid(box([band.rx * 2.04, 0.11, band.rz * 2.04], new THREE.Vector3(band.x, top - 0.055, band.z)), cloth, 'Head'),
      ridge([0.012, 0.036, band.rz * 1.5], band.rx * 0.55, 0),
      ridge([0.012, 0.036, band.rz * 1.5], -band.rx * 0.55, 0),
      ridge([band.rx * 1.1, 0.036, 0.012], 0, -band.rz * 0.55),
      rigid(box([0.035, 0.03, 0.035], new THREE.Vector3(band.x, top + 0.03, band.z)), tuft, 'Head'),
    ];
  },

  pilgrimHat: ({ felt, shell }, m) => {
    const band = hatBand(m);
    const crownHeight = 0.1;
    const brim = new THREE.CylinderGeometry(0.21, 0.2, 0.014, 18).toNonIndexed().translate(band.x, m.browY + 0.02, band.z);
    const crown = new THREE.CylinderGeometry(band.rx * 0.95, band.rx * 1.06, crownHeight, 12).toNonIndexed()
      .scale(1, 1, band.rz / band.rx).translate(band.x, m.browY + 0.02 + crownHeight / 2, band.z);
    // The scallop shell of the pilgrim's way, pinned to the turned-up front of the brim.
    const scallop = new THREE.SphereGeometry(0.03, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed()
      .scale(1, 0.35, 1).rotateX(Math.PI / 2).translate(band.x, m.browY + 0.07, band.z + band.rz * 1.08 + 0.006);
    const turnUp = box([0.2, 0.06, 0.012], new THREE.Vector3(band.x, m.browY + 0.05, band.z + 0.19), new THREE.Euler(-0.5, 0, 0));
    return [
      rigid(brim, felt, 'Head'),
      rigid(crown, felt, 'Head'),
      rigid(turnUp, felt, 'Head'),
      rigid(scallop, shell, 'Head'),
    ];
  },

  cape: ({ cloth, trim, cross }, m) => {
    const rings = capeRings(m);
    const parts = [shoulderCape(m, cloth, 83)];
    const outside = overlayRings(rings, 0.05, 0.008);
    if (trim !== undefined) {
      const band = ringsBetween(outside, m.shoulderY - 0.18, m.shoulderY - 0.24);
      parts.push(draped(garmentShell(band, { segments: 14, hemLift: capeHemLift }), trim, 'embroidery'));
    }
    if (cross !== undefined) parts.push(...breastCross(outside, m.shoulderY - 0.03, m.shoulderY - 0.2, cross, 0.05));
    return parts;
  },

  cloak: ({ cloth, surface = 'ragged', orphrey, hem }, m) => {
    const rings = cloakRings(m, hemHeight(m, hem));
    const arc = Math.PI * 2 - CLOAK_OPENING * 2;
    const parts = [draped(garmentShell(rings, {
      segments: 18, start: CLOAK_OPENING, arc, folds: 0.06, tatter: 0.05, seed: 89,
    }), cloth, surface)];
    if (orphrey !== undefined) {
      // A cope: gold bands down both open edges and a shield hanging on the back.
      const trim = overlayRings(rings, 0.06, 0.008);
      const edge = 0.26;
      parts.push(
        draped(garmentShell(trim, { segments: 2, start: CLOAK_OPENING, arc: edge }), orphrey, 'embroidery'),
        draped(garmentShell(trim, { segments: 2, start: Math.PI * 2 - CLOAK_OPENING - edge, arc: edge }), orphrey, 'embroidery'),
        draped(garmentShell(ringsBetween(trim, m.shoulderY - 0.06, m.shoulderY - 0.4), {
          segments: 6, start: Math.PI - 0.45, arc: 0.9, hemLift: pointedHem(Math.PI, 0.45, 0.1), tatter: 0.02, seed: 97,
        }), orphrey, 'embroidery'),
      );
    }
    return parts;
  },

  dalmatic: ({ cloth, surface, trim }, m) => {
    const rings = panelRings(m, m.kneeY - 0.04);
    const outside = overlayRings(rings, PANEL_FOLDS, 0.008);
    const parts = frontAndBack(rings, DALMATIC_HALF_ARC, cloth, surface, { folds: PANEL_FOLDS, tatter: 0.03, seed: 101 });
    for (const center of [0, Math.PI]) {
      // Two clavi down each panel and a band along its hem.
      for (const side of [-1, 1]) {
        parts.push(draped(garmentShell(outside, { segments: 1, start: center + side * 0.62 - 0.06, arc: 0.12 }), trim, 'embroidery'));
      }
      const band = ringsBetween(outside, m.kneeY + 0.04, m.kneeY - 0.04);
      parts.push(draped(garmentShell(band, { segments: 10, start: center - DALMATIC_HALF_ARC, arc: DALMATIC_HALF_ARC * 2 }), trim, 'embroidery'));
    }
    return parts;
  },

  legWraps: ({ cloth }, m) => BODY_SIDES.map((side) => {
    const shin = m.shins[side];
    const center = { x: (shin.min.x + shin.max.x) / 2, z: (shin.min.z + shin.max.z) / 2 };
    const radius = Math.max(shin.max.x - shin.min.x, shin.max.z - shin.min.z) / 2;
    const ring = (y: number, scale: number): GarmentRing => ({ section: { ...center, rx: radius * scale, rz: radius * scale }, y });
    const top = shin.max.y - 0.05;
    return rigid(
      garmentShell([ring(top, 1.2), ring((top + shin.min.y) / 2, 1.14), ring(shin.min.y + 0.01, 1.18)], { segments: 10, tatter: 0.015, seed: 107 }),
      cloth, `${side}Leg`, 'rope',
    );
  }),

  pilgrimGear: ({ leather, gourd }, m) => {
    const belt = beltSection(m);
    // A scrip on the left hip on a strap rising across the chest under the cape, and a gourd on the right.
    const bagCenter = onBelt(belt, 1.15, 0.035, m.waistY - 0.12);
    const strapTop = onBelt(belt, -0.5, 0.01, m.shoulderY - 0.24);
    const strapBottom = onBelt(belt, 0.95, 0.02, m.waistY - 0.04);
    const strapLength = strapTop.distanceTo(strapBottom);
    const strap = box([0.03, strapLength, 0.008], strapTop.clone().lerp(strapBottom, 0.5),
      new THREE.Euler(0, 0, Math.atan2(strapBottom.x - strapTop.x, strapTop.y - strapBottom.y)));
    const gourdCenter = onBelt(belt, -1.2, 0.05, m.waistY - 0.13);
    const gourdBody = new THREE.SphereGeometry(0.05, 8, 6).toNonIndexed().scale(1, 1.25, 1).translate(gourdCenter.x, gourdCenter.y, gourdCenter.z);
    const gourdNeck = new THREE.SphereGeometry(0.03, 6, 4).toNonIndexed().translate(gourdCenter.x, gourdCenter.y + 0.075, gourdCenter.z);
    return [
      { geometry: strap, color: leather, bone: 'Spine' },
      { geometry: box([0.17, 0.15, 0.06], bagCenter, new THREE.Euler(0, 1.15, 0)), color: leather, bone: 'Hips' },
      { geometry: box([0.17, 0.06, 0.065], bagCenter.clone().setY(bagCenter.y + 0.06), new THREE.Euler(0.15, 1.15, 0)), color: leather, bone: 'Hips' },
      { geometry: gourdBody, color: gourd, bone: 'Hips' },
      { geometry: gourdNeck, color: gourd, bone: 'Hips' },
    ];
  },

  girdleBook: ({ cover, clasp }, m) => {
    // A book bound to hang from the belt, tilted against the left thigh.
    const center = onBelt(beltSection(m), 0.85, 0.03, m.waistY - 0.15);
    const tilt = new THREE.Euler(0.1, 0.85, 0.08);
    return [
      { geometry: box([0.13, 0.17, 0.04], center, tilt), color: cover, bone: 'Hips' },
      { geometry: box([0.03, 0.04, 0.046], center.clone().setY(center.y + 0.02), tilt), color: clasp, bone: 'Hips' },
      { geometry: box([0.012, 0.09, 0.012], center.clone().setY(m.waistY - 0.03), tilt), color: cover, bone: 'Hips' },
    ];
  },

  keys: ({ metal }, m) => {
    const belt = beltSection(m);
    const angle = -0.55;
    const ring = onBelt(belt, angle, 0.02, m.waistY - 0.06);
    const parts: AccessoryPart[] = [{ geometry: hoop(ring, 0.035, angle), color: metal, bone: 'Hips' }];
    [-0.03, 0, 0.03].forEach((offset, index) => {
      const length = 0.11 + index * 0.02;
      const keyTop = onBelt(belt, angle + offset * 2, 0.025, m.waistY - 0.09);
      const shaft = keyTop.clone().setY(keyTop.y - length / 2);
      parts.push(
        { geometry: hoop(keyTop.clone().setY(keyTop.y - 0.015), 0.018, angle), color: metal, bone: 'Hips' },
        { geometry: box([0.01, length, 0.008], shaft, new THREE.Euler(0, angle, offset * 3)), color: metal, bone: 'Hips' },
        { geometry: box([0.028, 0.02, 0.008], shaft.clone().setY(keyTop.y - length + 0.012), new THREE.Euler(0, angle, 0)), color: metal, bone: 'Hips' },
      );
    });
    return parts;
  },

  lantern: ({ metal, glass }, m) => {
    // Hung from the belt on the left side, clear of the stride.
    const angle = 1.2;
    const center = onBelt(beltSection(m), angle, 0.07, m.waistY - 0.2);
    const turn = new THREE.Euler(0, angle, 0);
    const parts: AccessoryPart[] = [
      { geometry: box([0.07, 0.1, 0.07], center, turn), color: glass, bone: 'Hips' },
      { geometry: box([0.09, 0.014, 0.09], center.clone().setY(center.y + 0.057), turn), color: metal, bone: 'Hips' },
      { geometry: box([0.09, 0.014, 0.09], center.clone().setY(center.y - 0.057), turn), color: metal, bone: 'Hips' },
      { geometry: new THREE.ConeGeometry(0.05, 0.05, 6).toNonIndexed().translate(center.x, center.y + 0.088, center.z), color: metal, bone: 'Hips' },
      { geometry: hoop(center.clone().setY(center.y + 0.13), 0.022, angle), color: metal, bone: 'Hips' },
    ];
    for (const corner of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
      const offset = new THREE.Vector3(corner[0] * 0.037, 0, corner[1] * 0.037).applyEuler(turn);
      parts.push({ geometry: box([0.008, 0.1, 0.008], center.clone().add(offset), turn), color: metal, bone: 'Hips' });
    }
    return parts;
  },

  crozier: ({ metal }, m) => {
    // Planted at her right side; the walker's animations leave no hand free to hold it.
    const belt = beltSection(m);
    const x = belt.x - belt.rx - 0.17;
    const z = belt.z + 0.06;
    const top = m.crownTop + 0.15;
    const staff = new THREE.CylinderGeometry(0.012, 0.014, top - 0.12, 6).toNonIndexed().translate(x, (top + 0.12) / 2, z);
    const knop = new THREE.SphereGeometry(0.028, 8, 6).toNonIndexed().translate(x, top - 0.18, z);
    const crook = new THREE.TorusGeometry(0.07, 0.013, 5, 14, Math.PI * 1.5).toNonIndexed()
      .rotateZ(-Math.PI / 2).translate(x + 0.07, top, z);
    return [
      { geometry: staff, color: metal, bone: 'Hips' },
      { geometry: knop, color: metal, bone: 'Hips' },
      { geometry: crook, color: metal, bone: 'Hips' },
    ];
  },

  cord: ({ rope }, m) => {
    const scapular = overlayRings(panelRings(m, hemHeight(m, 'shin')), 0.04, 0.012);
    const girdle = [m.waistY + 0.014, m.waistY - 0.014].map((y) => ({ section: ringAt(scapular, m.waistY), y }));
    const robe = overlayRings(robeRings(m, hemHeight(m, 'ankle')), ROBE_FOLDS, 0.014);
    // Two ends knotted at the front, one to the knee and one below it.
    return [
      draped(garmentShell(girdle, { segments: 12 }), rope, 'rope'),
      ...ropeEnd(robe, 0.62, m.waistY - 0.01, m.kneeY + 0.04, rope),
      ...ropeEnd(robe, 0.86, m.waistY - 0.01, m.kneeY - 0.1, rope),
    ];
  },

  wideSleeves: ({ cloth, tatter = 0.01, surface = 'ragged' }, m) => BODY_SIDES.map((side) => {
    const arm = m.forearms[side];
    const radius = armRadius(arm);
    const geometry = armShell(arm, side, radius * 1.35, radius * 2.7, [0.03, 0.015], { folds: 0.08, tatter, seed: side === 'Left' ? 42 : 40 });
    return rigid(geometry, cloth, `${side}ForeArm`, surface);
  }),
};

export function buildVestmentParts<K extends ZombieVestment['kind']>(vestment: VestmentOf<K>, measures: BodyMeasures): AccessoryPart[] {
  return (BUILDERS[vestment.kind] as VestmentBuilder<K>)(vestment, measures);
}

const VESTMENT_KINDS: ReadonlySet<string> = new Set(Object.keys(BUILDERS));

export function isVestment(accessory: { readonly kind: string }): accessory is ZombieVestment {
  return VESTMENT_KINDS.has(accessory.kind);
}
