import * as THREE from 'three';
import type { HandPoseId } from './WeaponTypes';

export const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;
export type FingerName = (typeof FINGERS)[number];

/**
 * Knuckle position relative to the wrist, phalanx lengths and radius per
 * finger (right hand). The radius is the proximal phalanx's reach from its
 * bone line to the pad: what a held part touches.
 */
export const FINGER_LAYOUT: Readonly<Record<FingerName, {
  readonly base: readonly [number, number, number];
  readonly lengths: readonly [number, number, number];
  readonly radius: number;
}>> = {
  index: { base: [0.001, 0.03, -0.092], lengths: [0.044, 0.027, 0.022], radius: 0.0094 },
  middle: { base: [0.001, 0.0098, -0.096], lengths: [0.048, 0.03, 0.023], radius: 0.0097 },
  ring: { base: [0.001, -0.0102, -0.093], lengths: [0.045, 0.028, 0.022], radius: 0.0091 },
  pinky: { base: [0.0, -0.029, -0.085], lengths: [0.036, 0.022, 0.019], radius: 0.0081 },
};
/** Each phalanx is this much thinner than the one before it. */
export const PHALANX_TAPER = 0.87;

/** Curl of the three phalanges (radians, toward the palm) and side spread. */
export interface FingerPose {
  readonly curl: readonly [number, number, number];
  readonly spread: number;
}

/**
 * Finger pose of a right hand. Hand frame: the wrist is the origin, the
 * fingers point -Z, the thumb side is +Y and the palm faces -X. The left
 * hand mirrors X.
 */
export interface HandPose {
  readonly index: FingerPose;
  readonly middle: FingerPose;
  readonly ring: FingerPose;
  readonly pinky: FingerPose;
  /**
   * Thumb base rotation (XYZ Euler; Z rolls the thumb about its own length,
   * its nail facing +X like a finger's back at 0) and the curl of its two
   * phalanges toward the pad. A real thumb is rolled onto its side, so its
   * pad meets what it holds and its nail faces outward.
   */
  readonly thumb: { readonly base: readonly [number, number, number]; readonly curl: readonly [number, number] };
  /** Center of the held part relative to the wrist. */
  readonly grip: readonly [number, number, number];
  /** Fingers that close around the held part when its size is known. */
  readonly wrap?: readonly FingerName[];
}

const finger = (c1: number, c2: number, c3: number, spread = 0): FingerPose => ({ curl: [c1, c2, c3], spread });

/** Rifle grip thumb: around the backstrap, then forward along the far flank, pad on it and nail out. */
const WRAPPED_THUMB: HandPose['thumb'] = { base: [0.305, 1.065, 3], curl: [0.57, 0.51] };
/**
 * Pistol thumbs-forward grip: the web high under the beavertail, the knuckle
 * on the frame's rear corner and the thumb straight down the far flank at the
 * thumb safety, toward the muzzle, pad on the frame and nail facing out.
 */
const PISTOL_THUMB: HandPose['thumb'] = { base: [1.463, 1.001, 1.785], curl: [1.07, 0.379] };

/** Wrapped around a pistol or rifle grip with the index on the trigger. */
const triggerGrip = (index: FingerPose, thumb: HandPose['thumb']): HandPose => ({
  index,
  middle: finger(1.22, 1.28, 1.05, 0),
  ring: finger(1.26, 1.12, 1.05, -0.04),
  pinky: finger(1.18, 0.8, 0.45, -0.08),
  thumb,
  grip: [-0.032, -0.004, -0.064],
  wrap: ['middle', 'ring', 'pinky'],
});

export const HAND_POSES: Readonly<Record<HandPoseId, HandPose>> = {
  // Thick knife handle: the thumb's pad locks over the index.
  fist: {
    index: finger(1.32, 1.3, 0.9, 0.03),
    middle: finger(1.38, 1.3, 0.88),
    ring: finger(1.42, 1.32, 0.86, -0.03),
    pinky: finger(1.48, 1.32, 0.82, -0.07),
    thumb: { base: [-0.4, 1.02, 3.78], curl: [0.62, 0.42] },
    grip: [-0.047, -0.004, -0.066],
  },
  pistolGrip: triggerGrip(finger(0.3, 0.62, 0.32, 0.06), PISTOL_THUMB),
  rifleGrip: triggerGrip(finger(0.26, 0.58, 0.29, 0.07), WRAPPED_THUMB),
  // Semi-pistol wrist of a wooden stock: three fingers close on its neck,
  // the index reaches the trigger and the thumb stays behind the receiver.
  stockGrip: {
    index: finger(0.26, 0.58, 0.29, 0.07),
    middle: finger(1.25, 1.35, 0.95),
    ring: finger(1.3, 1.3, 0.95, -0.04),
    pinky: finger(1.35, 1.2, 0.9, -0.08),
    thumb: { base: [-0.007, 1.476, 1.878], curl: [0.998, 1.023] },
    grip: [-0.032, -0.004, -0.064],
    wrap: ['middle', 'ring', 'pinky'],
  },
  // A grip with no trigger in reach: the index closes on it with the rest.
  handleGrip: { ...triggerGrip(finger(1.15, 1.2, 0.9, 0.06), WRAPPED_THUMB), wrap: FINGERS },
  // Cupped under a handguard from below, wrist low: the fingers climb its
  // far side and the thumb lies along its near side toward the muzzle.
  supportHandguard: {
    index: finger(0.9, 0.84, 0.7, 0.02),
    middle: finger(1.2, 0.74, 0.68, 0),
    ring: finger(1.38, 0.5, 0.75, -0.03),
    pinky: finger(1.46, 0.3, 0.4, -0.07),
    thumb: { base: [0.99, 0.513, 2.4], curl: [0.05, 0.05] },
    grip: [-0.047, 0.004, -0.062],
    wrap: FINGERS,
  },
  // Thumbs forward: wrapped over the shooting hand's fingers, the thumb
  // along the frame under the shooting thumb.
  supportPistol: {
    index: finger(1.12, 1.0, 0.62, 0.03),
    middle: finger(1.18, 1.04, 0.64),
    ring: finger(1.22, 1.06, 0.64, -0.04),
    pinky: finger(1.26, 1.06, 0.62, -0.08),
    thumb: { base: [0.802, -0.086, 1.655], curl: [0.548, 0.178] },
    grip: [-0.042, -0.006, -0.07],
    wrap: FINGERS,
  },
  magazineGrab: {
    index: finger(1.02, 0.92, 0.58, 0.04),
    middle: finger(1.06, 0.94, 0.6),
    ring: finger(1.1, 0.96, 0.6, -0.04),
    pinky: finger(1.14, 0.96, 0.58, -0.08),
    thumb: { base: [-0.2, 0.92, 3.53], curl: [0.34, 0.24] },
    grip: [-0.03, 0, -0.07],
    wrap: FINGERS,
  },
  // Support hand on a wide magazine well (Vector): palm flat on the near
  // flank, fingers round the front onto the far flank, and the thumb laid
  // forward along the near flank under the charging handle (swung off the
  // palm so it never enters the part) instead of closing round a magazine.
  supportMagwell: {
    index: finger(1.02, 0.92, 0.58, 0.04),
    middle: finger(1.06, 0.94, 0.6),
    ring: finger(1.1, 0.96, 0.6, -0.04),
    pinky: finger(1.14, 0.96, 0.58, -0.08),
    thumb: { base: [0.8, -0.18, 1], curl: [0.08, 0.16] },
    grip: [-0.03, 0, -0.07],
    wrap: FINGERS,
  },
  // Thumb and index pinch a knob pad to pad; the other fingers tuck in.
  boltPinch: {
    index: finger(0.78, 0.88, 0.56, 0.08),
    middle: finger(1.22, 1.2, 0.8),
    ring: finger(1.36, 1.28, 0.84, -0.04),
    pinky: finger(1.46, 1.34, 0.84, -0.08),
    thumb: { base: [-0.26, 0.86, 3.53], curl: [0.46, 0.32] },
    grip: [-0.022, 0.034, -0.112],
  },
  relaxed: {
    index: finger(0.28, 0.32, 0.2, 0.07),
    middle: finger(0.32, 0.36, 0.22, 0.01),
    ring: finger(0.36, 0.4, 0.24, -0.05),
    pinky: finger(0.42, 0.42, 0.28, -0.11),
    // The thumb rests beside the index, nail turned to the side.
    thumb: { base: [0.45, 0.5, 1.8], curl: [0.12, 0.16] },
    grip: [-0.03, -0.006, -0.07],
  },
  // Held up to take a ring: fingers fanned out, the middle one dead straight
  // so a ring slides from its tip to its seat along one line.
  openHand: {
    index: finger(0.06, 0.05, 0.03, 0.16),
    middle: finger(0, 0, 0, 0),
    ring: finger(0.1, 0.08, 0.05, -0.15),
    pinky: finger(0.16, 0.12, 0.08, -0.28),
    thumb: { base: [0.45, 0.5, 1.8], curl: [0.12, 0.16] },
    grip: [-0.03, -0.006, -0.07],
  },
};

// --- Fitting the fingers to a held part -------------------------------------

/**
 * A held part seen from the hand frame (right-hand convention): a prism
 * through `center` whose section is a rounded rectangle spanning
 * `halfWidth` along `across` and `halfDepth` along `through` (unit vectors
 * normal to the part's length).
 */
export interface HeldPart {
  readonly center: THREE.Vector3;
  readonly across: THREE.Vector3;
  readonly through: THREE.Vector3;
  readonly halfWidth: number;
  readonly halfDepth: number;
  /** Fingers never rise past `height` (from `center`) along the unit `normal`. */
  readonly ceiling?: { readonly normal: THREE.Vector3; readonly height: number };
}

/** Palm surface (-X) and the line a wrapped part's front face sits behind (-Z). */
const PALM_SURFACE = 0.017;
const KNUCKLE_FACE = 0.086;
/** Soft pad a closed finger may press into the part. */
const SQUEEZE = 0.003;
/** Corner radius of a section, as a share of its smaller half extent. */
const ROUNDING = 0.7;
const CURL_RANGE: readonly (readonly [number, number])[] = [[-0.1, 1.65], [0, 1.85], [0, 1.3]];
/** Coarse curl grid step; coordinate descent refines the best cell. */
const COARSE_STEP = 0.2;
/** A distal joint bends with the middle one (they share a tendon), about this much. */
const DISTAL_SHARE = 0.7;
/** Cost, in meters of gap per radian, of leaving the authored curls and of breaking that coupling. */
const STYLE_COST = 0.004;
const COUPLING_COST = 0.012;
const SAMPLES = [0.35, 0.7, 1];
const SPREAD_LIMIT = 0.3;
/** A trigger blade: thin across the weapon, a little deeper along it. */
const BLADE_HALF_WIDTH = 0.003;
const BLADE_HALF_DEPTH = 0.004;

/** Distance from the section's center to its tangent line facing `direction`. */
function sectionReach(part: Omit<HeldPart, 'center'>, direction: THREE.Vector3): number {
  const corner = Math.min(part.halfWidth, part.halfDepth) * ROUNDING;
  const u = direction.dot(part.across);
  const v = direction.dot(part.through);
  return (part.halfWidth - corner) * Math.abs(u) + (part.halfDepth - corner) * Math.abs(v) + corner * Math.hypot(u, v);
}

/**
 * Grip point that rests the part flush on the palm with its front face
 * just behind the knuckles; the height along the hand stays the pose's.
 */
export function holdGripPoint(pose: HandPose, section: Omit<HeldPart, 'center'>): [number, number, number] {
  const palm = sectionReach(section, new THREE.Vector3(1, 0, 0));
  const front = sectionReach(section, new THREE.Vector3(0, 0, 1));
  return [-(PALM_SURFACE + palm - SQUEEZE / 2), pose.grip[1], -(KNUCKLE_FACE - front)];
}

/**
 * Closes the pose's wrapping fingers on `part` so each phalanx rests on its
 * surface, and lays the index pad on the trigger when given (hand frame,
 * with the weapon's across and front-back directions). Each finger is solved
 * in its own curl plane, staying close to the authored curls.
 */
export function fitHandPose(
  pose: HandPose,
  part: HeldPart | null,
  trigger: { readonly point: THREE.Vector3; readonly across: THREE.Vector3; readonly through: THREE.Vector3 } | null,
): HandPose {
  const fitted: Record<FingerName, FingerPose> = { index: pose.index, middle: pose.middle, ring: pose.ring, pinky: pose.pinky };
  if (part) {
    for (const name of pose.wrap ?? []) fitted[name] = fitFinger(name, pose[name], part, [0, 1, 2]);
  }
  if (trigger) {
    const blade: HeldPart = {
      center: trigger.point, across: trigger.across, through: trigger.through, halfWidth: BLADE_HALF_WIDTH, halfDepth: BLADE_HALF_DEPTH,
    };
    const base = FINGER_LAYOUT.index.base;
    // Tilt the finger's curl plane up or down onto the blade.
    const spread = THREE.MathUtils.clamp(Math.atan2(trigger.point.y - base[1], base[2] - trigger.point.z), -SPREAD_LIMIT, SPREAD_LIMIT);
    fitted.index = fitFinger('index', { curl: pose.index.curl, spread }, blade, [2]);
  }
  return { ...pose, ...fitted };
}

const offset = new THREE.Vector3();
const planeZ = new THREE.Vector3();
const NO_CEILING = { c0: 0, cx: 0, cz: 0, limit: Infinity };

function fitFinger(name: FingerName, start: FingerPose, part: HeldPart, touching: readonly number[]): FingerPose {
  const { base, lengths, radius } = FINGER_LAYOUT[name];
  // Curl plane: the knuckle's XZ plane tilted by the spread. A point (x, z)
  // of it maps linearly onto the section's (across, through) coordinates.
  planeZ.set(0, -Math.sin(start.spread), Math.cos(start.spread));
  offset.set(...base).sub(part.center);
  const u0 = offset.dot(part.across);
  const v0 = offset.dot(part.through);
  const ux = part.across.x;
  const uz = planeZ.dot(part.across);
  const vx = part.through.x;
  const vz = planeZ.dot(part.through);
  const corner = Math.min(part.halfWidth, part.halfDepth) * ROUNDING;
  const innerU = part.halfWidth - corner;
  const innerV = part.halfDepth - corner;
  const surface = (x: number, z: number): number => {
    const qu = Math.abs(u0 + x * ux + z * uz) - innerU;
    const qv = Math.abs(v0 + x * vx + z * vz) - innerV;
    return Math.hypot(Math.max(qu, 0), Math.max(qv, 0)) + Math.min(Math.max(qu, qv), 0) - corner;
  };
  // Height of a curl-plane point along the ceiling's normal, and its limit.
  const ceiling = part.ceiling ? {
    c0: offset.dot(part.ceiling.normal), cx: part.ceiling.normal.x, cz: planeZ.dot(part.ceiling.normal), limit: part.ceiling.height,
  } : NO_CEILING;

  // Gap or overlap of each phalanx with the surface, plus style terms; gives
  // up as soon as it exceeds `limit`.
  const cost = (curls: readonly number[], limit = Infinity): number => {
    let x = 0;
    let z = 0;
    let angle = 0;
    let total = COUPLING_COST * Math.abs(curls[2] - DISTAL_SHARE * curls[1]);
    for (let segment = 0; segment < 3; segment++) {
      angle += curls[segment];
      const dx = -Math.sin(angle) * lengths[segment];
      const dz = -Math.cos(angle) * lengths[segment];
      const thickness = radius * PHALANX_TAPER ** segment;
      let depth = Infinity;
      let rise = -Infinity;
      for (const t of SAMPLES) {
        depth = Math.min(depth, surface(x + dx * t, z + dz * t) - thickness);
        rise = Math.max(rise, ceiling.c0 + (x + dx * t) * ceiling.cx + (z + dz * t) * ceiling.cz + thickness - ceiling.limit);
      }
      if (depth < -SQUEEZE) total += 30 * (-SQUEEZE - depth);
      if (rise > 0) total += 30 * rise;
      if (touching.includes(segment)) total += Math.abs(depth + SQUEEZE / 2);
      total += STYLE_COST * Math.abs(curls[segment] - start.curl[segment]);
      if (total >= limit) return total;
      x += dx;
      z += dz;
    }
    return total;
  };

  // Coarse grid over the whole range, then coordinate descent.
  const best = [...start.curl];
  let bestCost = cost(best);
  const cells = CURL_RANGE.map(([low, high]) => Math.floor((high - low) / COARSE_STEP));
  const trial = [0, 0, 0];
  for (let a = 0; a <= cells[0]; a++) {
    trial[0] = CURL_RANGE[0][0] + a * COARSE_STEP;
    for (let b = 0; b <= cells[1]; b++) {
      trial[1] = CURL_RANGE[1][0] + b * COARSE_STEP;
      for (let c = 0; c <= cells[2]; c++) {
        trial[2] = CURL_RANGE[2][0] + c * COARSE_STEP;
        const value = cost(trial, bestCost);
        if (value < bestCost) {
          bestCost = value;
          best.splice(0, 3, ...trial);
        }
      }
    }
  }
  for (const fine of [0.06, 0.02, 0.008]) {
    for (let pass = 0; pass < 3; pass++) {
      for (let joint = 0; joint < 3; joint++) {
        for (const direction of [-1, 1]) {
          for (;;) {
            const previous = best[joint];
            best[joint] = THREE.MathUtils.clamp(previous + direction * fine, CURL_RANGE[joint][0], CURL_RANGE[joint][1]);
            const value = cost(best, bestCost);
            if (value < bestCost - 1e-9) {
              bestCost = value;
            } else {
              best[joint] = previous;
              break;
            }
          }
        }
      }
    }
  }
  return { curl: [best[0], best[1], best[2]], spread: start.spread };
}
