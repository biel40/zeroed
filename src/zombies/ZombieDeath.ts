import type { WeaponId } from '../weapons/WeaponTypes';
import { shapePreservingTangent } from './ZombieAttackMotion';

/** What dealt the lethal blow. Rewards only distinguish the knife. */
export type ZombieKillSource = WeaponId | 'knife';

export const ZOMBIE_DEATH_STYLES = [
  'knockback', 'stumble', 'riddled', 'headshot', 'slash', 'blast', 'shock',
] as const;
/** Visual death performance; gameplay timing is identical for every style. */
export type ZombieDeathStyle = typeof ZOMBIE_DEATH_STYLES[number];

const WEAPON_DEATH_STYLES: Record<ZombieKillSource, ZombieDeathStyle> = {
  knife: 'slash',
  m1911: 'knockback',
  l96: 'knockback',
  m4a1: 'riddled',
  mp5: 'riddled',
  vector: 'riddled',
  ppsh41: 'riddled',
  ak47: 'riddled',
  m60: 'riddled',
  raygun: 'blast',
  tesla: 'shock',
};

/**
 * Picks the death from the killing blow. `pushZ` is the body-local forward
 * component of the impact direction: a shot in the back topples the body
 * forward instead of throwing it towards the shooter.
 */
export function resolveZombieDeathStyle(
  source: ZombieKillSource | undefined,
  headshot: boolean,
  pushZ: number,
): ZombieDeathStyle {
  const style = source ? WEAPON_DEATH_STYLES[source] : 'knockback';
  if (headshot && style !== 'slash' && style !== 'shock') return 'headshot';
  if ((style === 'knockback' || style === 'blast') && pushZ > 0.35) return 'stumble';
  return style;
}

export function isZombieDeathStyle(value: unknown): value is ZombieDeathStyle {
  return (ZOMBIE_DEATH_STYLES as readonly unknown[]).includes(value);
}

/**
 * One sampled frame of a death, in upright body space: +z forward, +x the
 * zombie's left, distances as fractions of the model height.
 */
export interface ZombieDeathPose {
  /** Fraction of the standing hip height lost: 1 would rest the hips on the floor. */
  drop: number;
  /** Hips travel forward and sway to its left. */
  travel: number;
  sway: number;
  /**
   * Whole body about the hips: + pitch tips forward, + roll to its right,
   * + yaw turns left. ±π/2 pitch lays the torso flat whatever the rig's hunch.
   */
  pitch: number;
  roll: number;
  yaw: number;
  /** Upper-body curl (+ forward) and twist layered on the spine. */
  spine: number;
  twist: number;
  /** Head nod (+ chin down), tilt (+ to its right) and turn (+ left). */
  nod: number;
  tilt: number;
  turn: number;
  /** 1 keeps the feet planted so the knees buckle; 0 lets the legs ride the hips. */
  plant: number;
  /** Relaxed knee bend once the legs ride the hips. */
  knees: number;
  /** Hand targets; x points away from the body midline. */
  readonly left: [number, number, number];
  readonly right: [number, number, number];
}

export type ZombieDeathFall = 'back' | 'forward' | 'side';

type Curve = (t: number) => number;
type Channel = Exclude<keyof ZombieDeathPose, 'left' | 'right'>;

export interface ZombieDeathProfile {
  /** Authored fall length; the corpse then holds the last frame. */
  readonly duration: number;
  /** Where the body ends up relative to where it stood. */
  readonly fall: ZombieDeathFall;
  /** Turns the fall towards the impact (single shots, blasts); impacts are ignored otherwise. */
  readonly followsImpact: boolean;
  /** Keyed channels; missing ones stay at rest (feet planted, no offsets). */
  readonly channels: Partial<Record<Channel, Curve>>;
  /** Symmetric hand path, fractions of height: outward, up, forward. */
  readonly hand: readonly [Curve, Curve, Curve];
  /** Optional non-keyed layer (impacts, tremors, asymmetric hands). */
  readonly layer?: (t: number, pose: ZombieDeathPose) => void;
}

const CHANNELS: readonly Channel[] = [
  'drop', 'travel', 'sway', 'pitch', 'roll', 'yaw', 'spine', 'twist', 'nod', 'tilt', 'turn', 'plant', 'knees',
];

export function createZombieDeathPose(): ZombieDeathPose {
  const pose = { left: [0, 0, 0], right: [0, 0, 0] } as unknown as ZombieDeathPose;
  for (const channel of CHANNELS) pose[channel] = 0;
  return pose;
}

/** Samples a profile at normalized time t into a reusable pose. */
export function sampleZombieDeath(profile: ZombieDeathProfile, t: number, pose: ZombieDeathPose): void {
  for (const channel of CHANNELS) pose[channel] = profile.channels[channel]?.(t) ?? (channel === 'plant' ? 1 : 0);
  for (let axis = 0; axis < 3; axis++) pose.left[axis] = pose.right[axis] = profile.hand[axis](t);
  profile.layer?.(t, pose);
}

/** Marks a key where the body hits the floor (see `curve`). */
const IMPACT = true;
type Key = readonly [time: number, value: number, impact?: typeof IMPACT];

/**
 * Monotone cubic through normalized keys: continuous velocity, no overshoot.
 * IMPACT keys break that continuity on purpose: the body arrives at full speed
 * and leaves on a ballistic rebound (a 2x-slope tangent traces a parabola to a
 * resting neighbour) instead of easing to a stop just above the floor.
 */
function curve(...keys: Key[]): Curve {
  const last = keys.length - 1;
  const slopes = keys.slice(1).map(([time, value], i) => (value - keys[i][1]) / (time - keys[i][0]));
  const outgoing = keys.map((_, i) => (i === 0 || i === last ? 0 : shapePreservingTangent(slopes[i - 1], slopes[i])));
  const incoming = [...outgoing];
  keys.forEach(([, , impact], i) => {
    if (!impact || i === 0) return;
    incoming[i] = 2 * slopes[i - 1];
    outgoing[i] = i === last ? 0 : 2 * slopes[i];
  });
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[last][0]) return keys[last][1];
    let i = 0;
    while (t > keys[i + 1][0]) i++;
    const [t0, from] = keys[i];
    const [t1, to] = keys[i + 1];
    const h = t1 - t0;
    const u = (t - t0) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * from + (u3 - 2 * u2 + u) * h * outgoing[i]
      + (-2 * u3 + 3 * u2) * to + (u3 - u2) * h * incoming[i + 1];
  };
}

/** Deterministic, slightly irregular trembling in -1..1. */
function tremor(t: number, cycles: number): number {
  const phase = t * cycles * Math.PI * 2;
  return Math.sin(phase) * 0.6 + Math.sin(phase * 1.73 + 1.1) * 0.4;
}

/** Sharp alternating jolts with a quick rise and an exponential settle, like rounds landing. */
function impacts(t: number, count: number): number {
  const phase = t * count;
  const index = Math.floor(phase);
  const local = phase - index;
  const envelope = local < 0.15 ? local / 0.15 : Math.exp(-(local - 0.15) * 5);
  return envelope * (index % 2 === 0 ? 1 : -0.75) * (0.65 + 0.35 * Math.abs(Math.sin(index * 12.9898)));
}

// Hands hang at the sides at t=0, matching the living guard the fall blends from.
const HANG: Key[] = [[0, 0.2], [0, 0.49], [0, 0.07]];
const handPath = (x: Key[], y: Key[], z: Key[]): readonly [Curve, Curve, Curve] =>
  [curve(HANG[0], ...x), curve(HANG[1], ...y), curve(HANG[2], ...z)];

const riddledShake = curve([0, 1], [0.55, 0.8], [0.75, 0.2], [1, 0]);
const shockShake = curve([0, 0], [0.06, 1], [0.55, 1], [0.65, 0.3], [0.8, 0]);
const slashClutch = curve([0, 0], [0.18, 1], [1, 1]);

/**
 * Hand-keyed performances baked into clips per rig (ZombieMotionClips).
 * Back falls end on the back with arms splayed; forward falls end face down
 * with the head turned aside; every resting pose keeps hands above the floor.
 */
export const ZOMBIE_DEATH_PROFILES: Record<ZombieDeathStyle, ZombieDeathProfile> = {
  // Single heavy round: staggers back a step, arches and lands on its back.
  knockback: {
    duration: 1,
    fall: 'back',
    followsImpact: true,
    channels: {
      drop: curve([0, 0], [0.18, 0.06], [0.4, 0.2], [0.72, 0.86, IMPACT], [0.8, 0.83], [0.88, 0.86, IMPACT], [1, 0.86]),
      travel: curve([0, 0], [0.25, -0.06], [0.72, -0.2], [1, -0.21]),
      pitch: curve([0, 0], [0.22, -0.12], [0.45, -0.45], [0.72, -1.5, IMPACT], [0.8, -1.42], [0.9, -1.52, IMPACT], [1, -1.5]),
      roll: curve([0, 0], [0.7, 0.08], [1, 0.1]),
      spine: curve([0, 0], [0.2, -0.22], [0.5, -0.12], [0.75, 0.08], [1, 0.04]),
      nod: curve([0, 0], [0.12, -0.45], [0.4, -0.25], [0.75, 0.15], [0.85, -0.08], [1, 0.04]),
      tilt: curve([0.78, 0], [1, 0.35]),
      plant: curve([0, 1], [0.45, 1], [0.7, 0.2], [1, 0]),
      knees: curve([0.7, 0], [1, 0.1]),
    },
    hand: handPath([[0.3, 0.26], [0.7, 0.3], [1, 0.32]], [[0.3, 0.6], [0.7, 0.75], [1, 0.72]], [[0.3, 0.12], [1, 0]]),
  },
  // Hit from behind: the head whips back, the legs give and it faceplants.
  stumble: {
    duration: 1.05,
    fall: 'forward',
    followsImpact: true,
    channels: {
      drop: curve([0, 0], [0.25, 0.12], [0.5, 0.4], [0.78, 0.84, IMPACT], [0.86, 0.81], [1, 0.84, IMPACT]),
      travel: curve([0, 0], [0.3, 0.08], [0.78, 0.26], [1, 0.27]),
      pitch: curve([0, 0], [0.3, 0.25], [0.55, 0.7], [0.8, 1.5, IMPACT], [0.88, 1.42], [1, 1.48, IMPACT]),
      spine: curve([0, 0], [0.3, 0.25], [0.7, 0.1], [1, -0.05]),
      nod: curve([0, 0], [0.1, -0.3], [0.4, 0.1], [0.8, -0.3], [1, -0.32]),
      turn: curve([0.72, 0], [1, 0.9]),
      plant: curve([0, 1], [0.35, 1], [0.65, 0.3], [0.85, 0]),
    },
    hand: handPath([[0.5, 0.22], [1, 0.28]], [[0.5, 0.64], [0.85, 0.7], [1, 0.72]], [[0.45, 0.24], [0.8, 0.08], [1, 0.03]]),
  },
  // Sustained fire: every round jolts the torso, it doubles over and slumps forward.
  riddled: {
    duration: 1.35,
    fall: 'forward',
    followsImpact: false,
    channels: {
      drop: curve([0, 0], [0.35, 0.1], [0.6, 0.44], [0.85, 0.82], [1, 0.84]),
      travel: curve([0, 0], [0.4, -0.05], [0.6, -0.04], [0.9, 0.12], [1, 0.13]),
      pitch: curve([0, 0], [0.35, -0.12], [0.55, 0.1], [0.75, 0.7], [0.9, 1.45, IMPACT], [1, 1.42]),
      roll: curve([0.5, 0], [1, 0.3]),
      spine: curve([0, 0], [0.4, -0.15], [0.6, 0.35], [0.9, 0.2], [1, 0.05]),
      nod: curve([0, 0], [0.4, -0.2], [0.6, 0.4], [0.9, -0.1], [1, -0.2]),
      turn: curve([0.75, 0], [1, 0.8]),
      plant: curve([0, 1], [0.6, 1], [0.85, 0.2], [1, 0]),
    },
    hand: handPath([[0.3, 0.28], [0.6, 0.1], [1, 0.18]], [[0.3, 0.6], [0.6, 0.6], [1, 0.55]], [[0.3, 0.12], [0.6, 0.16], [0.9, 0.04], [1, 0.03]]),
    layer(t, pose) {
      const jolt = impacts(t, 11) * riddledShake(t);
      const recoil = Math.abs(jolt);
      pose.pitch -= recoil * 0.06;
      pose.roll += jolt * 0.05;
      pose.spine -= recoil * 0.22;
      pose.twist += jolt * 0.16;
      pose.nod -= recoil * 0.18;
      pose.tilt += jolt * 0.12;
      pose.left[0] += jolt * 0.03;
      pose.right[0] -= jolt * 0.03;
      pose.left[1] += recoil * 0.05;
      pose.right[1] += recoil * 0.04;
    },
  },
  // Lights out: the head snaps back and the body folds straight down, limp.
  headshot: {
    duration: 0.75,
    fall: 'back',
    followsImpact: false,
    channels: {
      drop: curve([0, 0], [0.1, 0.08], [0.45, 0.6], [0.7, 0.86, IMPACT], [0.78, 0.83], [1, 0.86, IMPACT]),
      travel: curve([0, 0], [0.45, -0.04], [1, -0.12]),
      pitch: curve([0, 0], [0.3, -0.05], [0.55, -0.6], [0.75, -1.45, IMPACT], [0.82, -1.38], [1, -1.45, IMPACT]),
      roll: curve([0, 0], [0.5, 0.15], [1, 0.25]),
      spine: curve([0, 0], [0.2, -0.12], [0.45, 0.25], [1, 0.1]),
      nod: curve([0, 0], [0.08, -0.6], [0.2, -0.35], [0.5, 0.2], [0.75, -0.1], [1, 0]),
      tilt: curve([0.6, 0], [1, -0.5]),
      plant: curve([0, 1], [0.5, 1], [0.75, 0.3], [1, 0]),
      knees: curve([0.5, 0], [1, 0.18]),
    },
    hand: handPath([[0.2, 0.24], [1, 0.24]], [[0.3, 0.55], [1, 0.66]], [[1, 0.04]]),
  },
  // The blade spins it to its right; it clutches the cut, kneels and topples aside.
  slash: {
    duration: 1.25,
    fall: 'side',
    followsImpact: false,
    channels: {
      drop: curve([0, 0], [0.3, 0.16], [0.55, 0.5], [0.85, 0.82, IMPACT], [0.92, 0.8], [1, 0.82, IMPACT]),
      travel: curve([0, 0], [0.5, 0.03], [1, 0.06]),
      sway: curve([0, 0], [0.3, -0.06], [1, -0.18]),
      pitch: curve([0, 0], [0.5, 0.15], [0.8, 0.3], [1, 0.1]),
      roll: curve([0, 0], [0.4, 0.08], [0.6, 0.2], [0.85, 1.5, IMPACT], [0.92, 1.42], [1, 1.5, IMPACT]),
      yaw: curve([0, 0], [0.15, -0.35], [0.35, -0.5], [0.7, -0.65], [1, -0.7]),
      spine: curve([0, 0], [0.25, 0.35], [0.6, 0.45], [0.85, 0.2], [1, 0.1]),
      twist: curve([0, 0], [0.1, -0.35], [0.3, -0.2], [1, -0.1]),
      nod: curve([0, 0], [0.1, -0.3], [0.35, 0.35], [0.85, 0.2], [1, 0.1]),
      tilt: curve([0.8, 0], [1, -0.35]),
      plant: curve([0, 1], [0.55, 1], [0.8, 0.25], [1, 0]),
      knees: curve([0.6, 0], [1, 0.25]),
    },
    // The left hand flails, then reaches for the floor.
    hand: handPath([[0.3, 0.3], [0.7, 0.24], [1, 0.18]], [[0.3, 0.62], [1, 0.58]], [[0.4, 0.16], [1, 0.12]]),
    layer(t, pose) {
      // The right hand clutches the cut across the belly.
      const clutch = slashClutch(t);
      pose.right[0] += (-0.04 - pose.right[0]) * clutch;
      pose.right[1] += (0.6 - pose.right[1]) * clutch;
      pose.right[2] += (0.16 - pose.right[2]) * clutch;
    },
  },
  // Ray Gun: lifted off its feet and thrown back, limbs trailing the blast.
  blast: {
    duration: 0.9,
    fall: 'back',
    followsImpact: true,
    channels: {
      drop: curve([0, 0], [0.15, -0.08], [0.35, 0], [0.6, 0.76], [0.68, 0.9, IMPACT], [0.76, 0.83], [0.85, 0.86, IMPACT], [1, 0.86]),
      travel: curve([0, 0], [0.2, -0.12], [0.6, -0.4], [0.75, -0.46], [1, -0.48]),
      pitch: curve([0, 0], [0.15, -0.35], [0.45, -1.1], [0.65, -1.55, IMPACT], [0.75, -1.45], [1, -1.52]),
      roll: curve([0, 0], [0.5, -0.15], [1, -0.2]),
      spine: curve([0, 0], [0.12, -0.35], [0.4, 0.25], [0.68, -0.05], [1, 0.05]),
      nod: curve([0, 0], [0.12, 0.45], [0.4, -0.3], [0.68, 0.25], [0.78, -0.1], [1, 0.08]),
      plant: curve([0, 1], [0.12, 0.6], [0.3, 0]),
      knees: curve([0, 0], [0.3, 0.25], [0.7, 0.1], [1, 0.08]),
    },
    hand: handPath([[0.2, 0.24], [0.5, 0.34], [1, 0.34]], [[0.2, 0.62], [0.5, 0.85], [1, 0.8]], [[0.2, 0.3], [0.5, 0.15], [1, 0.02]]),
  },
  // Tesla: rigid on its toes, arched and trembling, then it crumples forward.
  shock: {
    duration: 1.6,
    fall: 'forward',
    followsImpact: false,
    channels: {
      drop: curve([0, 0], [0.1, -0.05], [0.55, -0.04], [0.7, 0.4], [0.88, 0.84, IMPACT], [0.94, 0.81], [1, 0.84, IMPACT]),
      travel: curve([0, 0], [0.6, -0.02], [1, 0.1]),
      pitch: curve([0, 0], [0.1, -0.1], [0.55, -0.12], [0.7, 0.2], [0.9, 1.4, IMPACT], [1, 1.38]),
      roll: curve([0.55, 0], [1, -0.3]),
      spine: curve([0, 0], [0.1, -0.28], [0.55, -0.25], [0.7, 0.35], [1, 0.05]),
      nod: curve([0, 0], [0.1, -0.4], [0.55, -0.35], [0.72, 0.45], [0.9, -0.2], [1, -0.25]),
      turn: curve([0.75, 0], [1, 0.8]),
      plant: curve([0, 1], [0.7, 1], [0.88, 0.2], [1, 0]),
    },
    hand: handPath([[0.1, 0.3], [0.55, 0.3], [0.7, 0.18], [1, 0.2]], [[0.1, 0.68], [0.55, 0.68], [0.75, 0.55], [1, 0.52]], [[0.1, 0.16], [0.55, 0.16], [0.8, 0.05], [1, 0.03]]),
    layer(t, pose) {
      const shake = shockShake(t);
      const a = tremor(t, 34) * shake;
      const b = tremor(t + 0.37, 29) * shake;
      pose.roll += b * 0.02;
      pose.spine += a * 0.07;
      pose.twist += b * 0.06;
      pose.nod += b * 0.12;
      pose.tilt += a * 0.1;
      pose.left[0] += a * 0.02;
      pose.right[0] -= b * 0.02;
      pose.left[1] += b * 0.025;
      pose.right[1] += a * 0.025;
    },
  },
};
