/** Shots closer than this (s) keep a burst going; slower fire lets the kick settle. */
export const SUSTAINED_FIRE_GAP = 0.2;
/** Consecutive automatic shots that take the extra kick to its cap. */
const RAMP_SHOTS = 14;
/** Extra view-model kick at the cap: the 15th round of a burst kicks 60 % harder than the first. */
export const SUSTAINED_KICK_MAX_BOOST = 0.6;
/** Exponential settle rate (1/s) once the trigger is released. */
const SETTLE_RATE = 5;

/**
 * Purely visual escalation of an automatic weapon's kick in the hands:
 * each round of a sustained burst kicks a little harder, up to a cap, and
 * the extra fades out smoothly (never snaps) once firing stops. A burst
 * started before it settled carries on from where it was. Gameplay recoil,
 * spread and damage never see it.
 */
export class SustainedFireKick {
  private level = 0;
  private sinceShot = Number.POSITIVE_INFINITY;

  /** Current escalation, 0 (fresh) .. 1 (capped). */
  public get intensity(): number {
    return this.level;
  }

  /** Registers a shot and returns the kick multiplier for it (1 .. 1 + SUSTAINED_KICK_MAX_BOOST). */
  public onShot(automatic: boolean): number {
    if (!automatic) this.level = 0;
    else if (this.sinceShot <= SUSTAINED_FIRE_GAP) this.level = Math.min(1, this.level + 1 / RAMP_SHOTS);
    this.sinceShot = 0;
    // Ease-in: the first rounds of a burst feel like single shots; the climb builds after.
    return 1 + SUSTAINED_KICK_MAX_BOOST * this.level * this.level * (3 - 2 * this.level);
  }

  public update(dt: number): void {
    this.sinceShot += dt;
    if (this.level === 0 || this.sinceShot <= SUSTAINED_FIRE_GAP) return;
    this.level *= Math.exp(-SETTLE_RATE * dt);
    if (this.level < 1e-3) this.level = 0;
  }

  public reset(): void {
    this.level = 0;
    this.sinceShot = Number.POSITIVE_INFINITY;
  }
}
