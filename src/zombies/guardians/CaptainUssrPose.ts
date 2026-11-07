/** Left and right of the body: index 0 is the shield side (+x, the body faces +z). */
export type Sides<T> = readonly [left: T, right: T];

/**
 * Measurements of CAPITÁN URSS, metres: the hip pivot over the feet, the
 * hip joints beside it, leg and arm bones, the waist (spine pivot) over
 * the hips and the shoulders and neck over the waist. The thigh, shin and
 * ankle add up to the hips, so a straight leg stands on the ground.
 */
export const CAPTAIN_USSR_BODY = {
  hips: 1.08,
  hipX: 0.15,
  thigh: 0.5,
  shin: 0.48,
  /** Ankle joint over the sole. */
  ankle: 0.1,
  waist: 0.12,
  shoulderY: 0.62,
  shoulderX: 0.36,
  upperArm: 0.36,
  forearm: 0.34,
  /** Wrist to the middle of the fist. */
  hand: 0.07,
  headY: 0.8,
} as const;

/**
 * Channels of a pose, indices into a `Pose`. Body offsets are metres in
 * the root frame; angles are radians. The pelvis (`pitch` forward, `roll`
 * towards the right, `twist` to the left) and the spine and head over it;
 * the arms (negative pitch swings an arm forward, positive roll swings it
 * towards +x, negative elbow bends it); the feet (ankle in the root frame:
 * sideways, forward, lift off the ground, sole pitch toes down); and the
 * shield's mount in the spine's frame while it is held.
 */
export const POSE = {
  lunge: 0, sway: 1, drop: 2,
  pitch: 3, roll: 4, twist: 5,
  spinePitch: 6, spineYaw: 7, spineRoll: 8,
  headPitch: 9, headYaw: 10, jaw: 11,
  shoulderPitch: [12, 13], shoulderRoll: [14, 15], elbow: [16, 17],
  footX: [18, 19], footZ: [20, 21], footY: [22, 23], footPitch: [24, 25],
  shieldX: 26, shieldY: 27, shieldZ: 28, shieldYaw: 29, shieldPitch: 30, shieldRoll: 31,
} as const;

export const POSE_CHANNELS = 32;

/** One value per `POSE` channel. */
export type Pose = Float64Array;

export function createPose(): Pose {
  return new Float64Array(POSE_CHANNELS);
}

/** A channel's spring: `stiffness` (1/s², how hard it pulls) and `damping` (ratio; under 1 overshoots). */
export interface SpringTuning {
  readonly stiffness: number;
  readonly damping: number;
}

/**
 * Heavy body, lighter limbs, a quick head and jaw, and feet that follow
 * their marks closely. Slightly underdamped everywhere but the feet, so
 * every stop carries a little of its momentum past the mark.
 */
export const CAPTAIN_USSR_SPRINGS: readonly SpringTuning[] = (() => {
  const springs: SpringTuning[] = Array.from({ length: POSE_CHANNELS }, () => ({ stiffness: 160, damping: 0.72 }));
  const tune = (channels: readonly number[], stiffness: number, damping: number): void => {
    for (const channel of channels) springs[channel] = { stiffness, damping };
  };
  tune([POSE.lunge, POSE.sway, POSE.drop, POSE.pitch, POSE.roll, POSE.twist], 130, 0.68);
  tune([POSE.spinePitch, POSE.spineYaw, POSE.spineRoll], 170, 0.6);
  tune([POSE.headPitch, POSE.headYaw, POSE.jaw], 240, 0.58);
  tune([...POSE.shoulderPitch, ...POSE.shoulderRoll, ...POSE.elbow], 210, 0.66);
  tune([...POSE.footX, ...POSE.footZ, ...POSE.footY, ...POSE.footPitch], 420, 0.95);
  tune([POSE.shieldX, POSE.shieldY, POSE.shieldZ, POSE.shieldYaw, POSE.shieldPitch, POSE.shieldRoll], 190, 0.62);
  return springs;
})();

/** Longest step the integrator takes: stiff channels stay stable at any frame rate. */
const MAX_STEP = 1 / 120;
/** A hitch longer than this is treated as this long. */
const MAX_FRAME = 0.1;

/**
 * Drives a pose towards its target with one damped spring per channel, so
 * the body has weight: it accelerates into a pose, overshoots a little and
 * settles. Hits are velocity kicks on top. Semi-implicit Euler in fixed
 * substeps; allocation-free.
 */
export class PoseSpring {
  /** The current pose. */
  public readonly value: Pose = createPose();
  private readonly velocity: Pose = createPose();
  /** The target of the last update: where a kick swings about. */
  private readonly goal: Pose = createPose();
  private readonly omega: Float64Array;
  private readonly zeta: Float64Array;

  public constructor(tuning: readonly SpringTuning[]) {
    if (tuning.length !== POSE_CHANNELS) throw new Error('A pose spring needs one tuning per channel');
    this.omega = Float64Array.from(tuning, (spring) => Math.sqrt(spring.stiffness));
    this.zeta = Float64Array.from(tuning, (spring) => spring.damping);
  }

  /** Chases `target` for `dt` seconds; `agility` speeds every spring up (a strike) or slows it (a slump). */
  public update(target: Pose, dt: number, agility = 1): void {
    this.goal.set(target);
    let left = Math.min(MAX_FRAME, Math.max(0, dt));
    while (left > 1e-9) {
      const step = Math.min(MAX_STEP, left);
      left -= step;
      for (let channel = 0; channel < POSE_CHANNELS; channel++) {
        const omega = this.omega[channel] * agility;
        const pull = omega * omega * (target[channel] - this.value[channel]);
        const drag = 2 * this.zeta[channel] * omega * this.velocity[channel];
        this.velocity[channel] += (pull - drag) * step;
        this.value[channel] += this.velocity[channel] * step;
      }
    }
  }

  /**
   * A jolt: sets `channel` swinging as if struck at `speed` (units per
   * second) from its mark. A channel already swinging that wide is left
   * alone, so a stream of kicks (flames) keeps it writhing without ever
   * piling up past the strongest one.
   */
  public kick(channel: number, speed: number): void {
    const omega = this.omega[channel];
    const offset = this.value[channel] - this.goal[channel];
    const swing = Math.hypot(offset, this.velocity[channel] / omega);
    const wanted = Math.abs(speed) / omega;
    if (swing >= wanted) return;
    this.velocity[channel] = Math.sign(speed) * omega * Math.sqrt(wanted * wanted - offset * offset);
  }

  /** Jumps to `target`, at rest. */
  public snap(target: Pose): void {
    this.value.set(target);
    this.goal.set(target);
    this.velocity.fill(0);
  }

  public reset(): void {
    this.value.fill(0);
    this.goal.fill(0);
    this.velocity.fill(0);
  }
}
