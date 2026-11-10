import type { RecoilConfig } from './WeaponTypes';

/**
 * Upper bound of the accumulated climb when a weapon does not set its own
 * `maxClimb`: a long uncompensated burst plateaus here instead of dragging
 * the view towards the ceiling.
 */
export const DEFAULT_MAX_RECOIL_CLIMB = 0.35;
/** Sideways drift is capped at this share of the climb cap. */
const YAW_CAP_SHARE = 0.5;

/**
 * Accumulates per-shot recoil as a pitch/yaw offset and recovers it
 * exponentially after a short delay. The vertical component is mostly
 * deterministic so the player can learn to compensate; horizontal carries
 * the controlled randomness. Deliberate aim against the kick is absorbed
 * (see `absorbCompensation`), so recovery never drags the view past where
 * the player pulled it.
 */
export class RecoilController {
  /** Accumulated upward offset, radians. */
  public pitch = 0;
  /** Accumulated sideways offset, radians. */
  public yaw = 0;
  private timeSinceKick = Number.POSITIVE_INFINITY;
  private readonly maxPitch: number;
  private readonly maxYaw: number;

  public constructor(
    private readonly config: RecoilConfig,
    private readonly rng: () => number = Math.random,
  ) {
    this.maxPitch = config.maxClimb ?? DEFAULT_MAX_RECOIL_CLIMB;
    this.maxYaw = this.maxPitch * YAW_CAP_SHARE;
  }

  public kick(scale = 1): void {
    const c = this.config;
    const verticalVariance = 1 - c.kickVariance * 0.5 + this.rng() * c.kickVariance;
    this.pitch = Math.min(this.maxPitch, this.pitch + c.verticalKick * verticalVariance * scale);

    const randomPart = (this.rng() * 2 - 1) * (1 - Math.abs(c.horizontalBias));
    const yaw = this.yaw + c.horizontalKick * (c.horizontalBias + randomPart) * scale;
    this.yaw = Math.max(-this.maxYaw, Math.min(this.maxYaw, yaw));

    this.timeSinceKick = 0;
  }

  /**
   * The player moved the view by (pitchDelta, yawDelta) this frame. The part
   * that opposes the pending recoil is taken out of it and returned, so the
   * caller moves its own aim back by the same amount: the view the player
   * sees this frame is unchanged, but recovery no longer pulls past the
   * compensated aim.
   */
  public absorbCompensation(pitchDelta: number, yawDelta: number, out: { pitch: number; yaw: number }): void {
    out.pitch = RecoilController.opposing(this.pitch, pitchDelta);
    out.yaw = RecoilController.opposing(this.yaw, yawDelta);
    this.pitch -= out.pitch;
    this.yaw -= out.yaw;
  }

  public update(dt: number): void {
    this.timeSinceKick += dt;
    if (this.timeSinceKick < this.config.recoveryDelay) return;

    const decay = Math.exp(-this.config.recoverySpeed * dt);
    this.pitch *= decay;
    this.yaw *= decay;

    if (Math.abs(this.pitch) < 1e-6) this.pitch = 0;
    if (Math.abs(this.yaw) < 1e-6) this.yaw = 0;
  }

  public reset(): void {
    this.pitch = 0;
    this.yaw = 0;
    this.timeSinceKick = Number.POSITIVE_INFINITY;
  }

  /** Share of `delta` that moves `offset` back towards zero, never past it. */
  private static opposing(offset: number, delta: number): number {
    if (offset > 0 && delta < 0) return Math.min(offset, -delta);
    if (offset < 0 && delta > 0) return Math.max(offset, -delta);
    return 0;
  }
}
