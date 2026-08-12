import type { RecoilConfig } from './WeaponTypes';

/**
 * Accumulates per-shot recoil as a pitch/yaw offset and recovers it
 * exponentially after a short delay. The vertical component is mostly
 * deterministic so the player can learn to compensate; horizontal carries
 * the controlled randomness.
 */
export class RecoilController {
  /** Accumulated upward offset, radians. */
  pitch = 0;
  /** Accumulated sideways offset, radians. */
  yaw = 0;
  private timeSinceKick = Number.POSITIVE_INFINITY;

  constructor(
    private readonly config: RecoilConfig,
    private readonly rng: () => number = Math.random,
  ) {}

  kick(scale = 1): void {
    const c = this.config;
    const verticalVariance = 1 - c.kickVariance * 0.5 + this.rng() * c.kickVariance;
    this.pitch += c.verticalKick * verticalVariance * scale;

    const randomPart = (this.rng() * 2 - 1) * (1 - Math.abs(c.horizontalBias));
    this.yaw += c.horizontalKick * (c.horizontalBias + randomPart) * scale;

    this.timeSinceKick = 0;
  }

  update(dt: number): void {
    this.timeSinceKick += dt;
    if (this.timeSinceKick < this.config.recoveryDelay) return;

    const decay = Math.exp(-this.config.recoverySpeed * dt);
    this.pitch *= decay;
    this.yaw *= decay;

    if (Math.abs(this.pitch) < 1e-6) this.pitch = 0;
    if (Math.abs(this.yaw) < 1e-6) this.yaw = 0;
  }

  reset(): void {
    this.pitch = 0;
    this.yaw = 0;
    this.timeSinceKick = Number.POSITIVE_INFINITY;
  }
}
