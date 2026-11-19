import { WALK_BOB } from '../config/walkBob';
import { clamp, damp } from '../utils/math';

const FULL_CYCLE = Math.PI * 2;
/** Below this fraction of walking pace the body counts as standing (movement damping never reaches exactly zero). */
const STILL_SPEED_FRACTION = 0.02;
const SETTLED_INTENSITY = 1e-4;
/** Exponential rate that covers 95 % of a fade in `transitionTime`. */
const BLEND_RATE = 3 / WALK_BOB.transitionTime;
/** Faster than this many times walking pace is not walking but a jump in position (teleport, snap): the cycle ignores it. */
const DISCONTINUITY_PACE = 4;

/** Where the body is in its walk: read by the head and weapon bob and the footsteps. */
export interface WalkGaitSample {
  /** Radians through the stride; each multiple of π is a footfall. */
  readonly phase: number;
  /** 0 standing or in the air, 1 at full walking pace; fades in and out smoothly. */
  readonly intensity: number;
  /** Footfalls so far: it goes up by one as a foot lands (odd and even alternate the feet). */
  readonly footfalls: number;
}

export const STILL_GAIT: WalkGaitSample = { phase: 0, intensity: 0, footfalls: 0 };

/**
 * Walking cycle driven by the ground actually covered, so its cadence follows
 * real movement (walls, slowdowns, aiming) at any frame rate.
 */
export class WalkGait implements WalkGaitSample {
  private stridePhase = 0;
  private strength = 0;
  private landed = 0;

  public constructor(private readonly walkSpeed: number) {}

  public get phase(): number { return this.stridePhase; }
  public get intensity(): number { return this.strength; }
  public get footfalls(): number { return this.landed; }

  /** `distance`: horizontal metres moved this frame; `grounded` false while airborne or otherwise off one's feet. */
  public update(dt: number, distance: number, grounded: boolean): void {
    if (dt <= 0 || distance > dt * this.walkSpeed * DISCONTINUITY_PACE) return;
    const pace = grounded ? clamp(distance / dt / this.walkSpeed, 0, 1) : 0;
    const target = pace < STILL_SPEED_FRACTION ? 0 : pace;
    this.strength = damp(this.strength, target, BLEND_RATE, dt);
    if (target === 0 && this.strength < SETTLED_INTENSITY) this.strength = 0;
    if (target === 0) return;
    const next = this.stridePhase + distance / WALK_BOB.stepLength * Math.PI;
    // One footfall per frame at most: a long hitch never plays a burst of steps.
    if (Math.floor(next / Math.PI) > Math.floor(this.stridePhase / Math.PI)) this.landed++;
    this.stridePhase = next % FULL_CYCLE;
  }

  /** Back to a standing start (teleport, respawn): the next footfall is a full step away. */
  public reset(): void {
    this.stridePhase = 0;
    this.strength = 0;
  }
}
