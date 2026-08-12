import type { VisualRecoilConfig } from './WeaponTypes';

/**
 * Purely visual recoil layer for the view model: a damped spring per channel
 * (backward translation, pitch, roll). Independent from gameplay recoil —
 * the camera recoil in RecoilController is untouched. Pure TypeScript so the
 * settling behavior is unit-testable.
 */
export class SpringRecoil {
  /** Backward translation in meters (negative = towards the shooter). */
  offset = 0;
  /** Upward rotation in radians. */
  pitch = 0;
  /** Roll in radians (random direction per shot). */
  roll = 0;

  private offsetVelocity = 0;
  private pitchVelocity = 0;
  private rollVelocity = 0;

  constructor(
    private readonly config: VisualRecoilConfig,
    private readonly rng: () => number = Math.random,
  ) {}

  kick(): void {
    this.offsetVelocity -= this.config.kickImpulse;
    this.pitchVelocity += this.config.pitchImpulse;
    this.rollVelocity += (this.rng() * 2 - 1) * this.config.rollImpulse;
  }

  update(dt: number): void {
    const { stiffness, damping } = this.config;

    this.offsetVelocity += (-stiffness * this.offset - damping * this.offsetVelocity) * dt;
    this.offset += this.offsetVelocity * dt;

    this.pitchVelocity += (-stiffness * this.pitch - damping * this.pitchVelocity) * dt;
    this.pitch += this.pitchVelocity * dt;

    this.rollVelocity += (-stiffness * this.roll - damping * this.rollVelocity) * dt;
    this.roll += this.rollVelocity * dt;
  }

  reset(): void {
    this.offset = 0;
    this.pitch = 0;
    this.roll = 0;
    this.offsetVelocity = 0;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;
  }
}
