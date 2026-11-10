import type { VisualRecoilConfig } from './WeaponTypes';

/**
 * Longest integration step. Stiff, lightly damped springs drift with the
 * frame rate under a single semi-implicit Euler step per frame; fixed
 * sub-steps make 30 fps and 144 fps settle along the same curve.
 */
const MAX_STEP = 1 / 240;

/**
 * Purely visual recoil layer for the view model: a damped spring per channel
 * (backward translation, pitch, roll). Independent from gameplay recoil —
 * the camera recoil in RecoilController is untouched. Pure TypeScript so the
 * settling behavior is unit-testable.
 */
export class SpringRecoil {
  /** Backward translation in meters (negative = towards the shooter). */
  public offset = 0;
  /** Upward rotation in radians. */
  public pitch = 0;
  /** Roll in radians (random direction per shot). */
  public roll = 0;

  private offsetVelocity = 0;
  private pitchVelocity = 0;
  private rollVelocity = 0;

  public constructor(
    private readonly config: VisualRecoilConfig,
    private readonly rng: () => number = Math.random,
  ) {}

  /** One shot; `scale` multiplies every impulse (sustained fire, the player's weapon-kick setting). */
  public kick(scale = 1): void {
    this.offsetVelocity -= this.config.kickImpulse * scale;
    this.pitchVelocity += this.config.pitchImpulse * scale;
    this.rollVelocity += (this.rng() * 2 - 1) * this.config.rollImpulse * scale;
  }

  public update(dt: number): void {
    if (dt <= 0) return;
    const steps = Math.ceil(dt / MAX_STEP);
    const step = dt / steps;
    for (let i = 0; i < steps; i++) this.integrate(step);
  }

  public reset(): void {
    this.offset = 0;
    this.pitch = 0;
    this.roll = 0;
    this.offsetVelocity = 0;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;
  }

  private integrate(dt: number): void {
    const { stiffness, damping } = this.config;

    this.offsetVelocity += (-stiffness * this.offset - damping * this.offsetVelocity) * dt;
    this.offset += this.offsetVelocity * dt;

    this.pitchVelocity += (-stiffness * this.pitch - damping * this.pitchVelocity) * dt;
    this.pitch += this.pitchVelocity * dt;

    this.rollVelocity += (-stiffness * this.roll - damping * this.rollVelocity) * dt;
    this.roll += this.rollVelocity * dt;
  }
}
