import { smooth } from './CaptainUssrMotion';

/** Hip and knee angles about x: negative hip swings the thigh forward, positive knee folds the shin back. */
export interface LegAngles {
  hip: number;
  knee: number;
}

/**
 * Two-bone IK in the leg's plane: the hip and knee angles that put the
 * ankle at `z` forward and `y` up from the hip (`y` negative below it),
 * the knee always bending forward. A target out of reach gets a straight
 * leg pointing at it. Writes and returns `out`.
 */
export function solveLeg(z: number, y: number, thigh: number, shin: number, out: LegAngles): LegAngles {
  const distance = Math.min(thigh + shin - 1e-6, Math.max(Math.abs(thigh - shin) + 1e-6, Math.hypot(z, y)));
  const kneeCos = (thigh * thigh + shin * shin - distance * distance) / (2 * thigh * shin);
  const hipCos = (thigh * thigh + distance * distance - shin * shin) / (2 * thigh * distance);
  out.knee = Math.PI - Math.acos(clamp(kneeCos, -1, 1));
  out.hip = Math.atan2(-z, -y) - Math.acos(clamp(hipCos, -1, 1));
  return out;
}

/** Farthest a foot strays forward or back of its hip in the march, metres. */
export const GAIT_REACH = 0.48;
/** Foot travel over one stance: grows with speed up to twice the reach. */
const STRIDE = { base: 0.42, perSpeed: 0.2 } as const;
/** Share of a cycle a foot spends planted: a march, easing into a sprint between `runFrom` and `runAt` m/s. */
const STANCE = { walk: 0.62, run: 0.4, runFrom: 3, runAt: 8 } as const;
/** How high the swinging foot clears the ground, metres. */
const LIFT = { base: 0.1, perSpeed: 0.02, max: 0.26 } as const;
/** Sole pitch at heel strike (toes up) and at toe-off (toes down), radians. */
const HEEL_STRIKE = -0.22;
const TOE_OFF = 0.45;
/** How deep the hips sink at each footfall, metres. */
const BOB = 0.035;
/** Speed at which the march shows in full, and how fast it fades in and out (1/s). */
const FULL_MARCH_SPEED = 0.9;
const FADE_RATE = 5;

/**
 * The march of CAPITÁN URSS: from the ground speed it cycles both feet
 * (left at phase 0, right half a cycle behind), each planted for its
 * stance while it slides back exactly as fast as the body goes, then
 * swung forward clear of the ground. Pure and allocation-free; the view
 * adds the offsets to the pose's feet and solves the legs.
 */
export class Gait {
  /** Each foot's offset from its mark, root frame, metres: forward, and lift off the ground. */
  public readonly forward: [number, number] = [0, 0];
  public readonly lift: [number, number] = [0, 0];
  /** Each sole's pitch on top of the pose's (toes down positive). */
  public readonly toe: [number, number] = [0, 0];
  private phase = 0;
  private shown = 0;
  private landed = 0;

  /** 0..1: how much the march shows (0 standing). */
  public get weight(): number {
    return this.shown;
  }

  /** -1..1, positive while the left foot leads: the free arm swings against it. */
  public get swing(): number {
    return Math.cos(this.phase * Math.PI * 2) * this.shown;
  }

  /** Vertical offset of the hips: lowest as each foot lands. */
  public get bob(): number {
    return -BOB * this.shown * (0.5 + 0.5 * Math.cos(this.phase * Math.PI * 4));
  }

  /** A foot landed this frame: how hard (0..1); 0 when none did. */
  public get footfall(): number {
    return this.landed;
  }

  public update(dt: number, speed: number): void {
    const step = Math.max(0, dt);
    const pace = Math.max(0, speed);
    const wanted = smooth(pace / FULL_MARCH_SPEED);
    this.shown += (wanted - this.shown) * (1 - Math.exp(-FADE_RATE * step));
    this.landed = 0;
    if (wanted === 0 && this.shown < 1e-3) {
      this.shown = 0;
      this.forward.fill(0);
      this.lift.fill(0);
      this.toe.fill(0);
      return;
    }
    const stride = Math.min(2 * GAIT_REACH, STRIDE.base + STRIDE.perSpeed * pace);
    const stance = lerp(STANCE.walk, STANCE.run, clamp((pace - STANCE.runFrom) / (STANCE.runAt - STANCE.runFrom), 0, 1));
    const height = Math.min(LIFT.max, LIFT.base + LIFT.perSpeed * pace);
    // One stance lasts as long as the body takes to cover the stride.
    const advance = pace > 0 ? (step * pace * stance) / stride : 0;
    const before = this.phase;
    this.phase = (this.phase + advance) % 1;
    for (let side = 0; side < 2; side++) {
      const lead = side * 0.5;
      const was = (before + lead) % 1;
      const now = (this.phase + lead) % 1;
      if (advance > 0 && now < was) this.landed = Math.max(this.landed, this.shown * clamp(0.4 + pace * 0.08, 0, 1));
      this.placeFoot(side, now, stride, stance, height);
    }
  }

  public reset(): void {
    this.phase = 0;
    this.shown = 0;
    this.landed = 0;
    this.forward.fill(0);
    this.lift.fill(0);
    this.toe.fill(0);
  }

  /** Planted, it slides from in front to behind; swung, it arcs back to the front. */
  private placeFoot(side: number, phase: number, stride: number, stance: number, height: number): void {
    let z: number;
    let lift = 0;
    let toe: number;
    if (phase < stance) {
      const u = phase / stance;
      z = stride / 2 - stride * u;
      toe = u < 0.15 ? HEEL_STRIKE * (1 - u / 0.15) : u > 0.7 ? TOE_OFF * ((u - 0.7) / 0.3) : 0;
    } else {
      const u = (phase - stance) / (1 - stance);
      z = -stride / 2 + stride * smooth(u);
      lift = height * Math.sin(Math.PI * u);
      toe = TOE_OFF * (1 - smooth(u * 1.6)) + HEEL_STRIKE * smooth((u - 0.6) / 0.4);
    }
    this.forward[side] = z * this.shown;
    this.lift[side] = lift * this.shown;
    this.toe[side] = toe * this.shown;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
