import type { ZombieBodyRegion } from './wounds/ZombieBodyRegion';

/** Accent channels, radians in the body root's axes (x: pitch, negative leans back; z: roll, positive lifts its left). */
export const AccentChannel = {
  HeadPitch: 0,
  HeadRoll: 1,
  LeftShoulderPitch: 2,
  LeftShoulderRoll: 3,
  RightShoulderPitch: 4,
  RightShoulderRoll: 5,
  TorsoPitch: 6,
  TorsoRoll: 7,
} as const;
export type AccentChannel = typeof AccentChannel[keyof typeof AccentChannel];
const CHANNELS = 8;

/** Angular frequency (1/s) of the critically damped return: peak after 1/ω = 100 ms, settled in ~0.5 s. */
const OMEGA = 10;
/** Hard bound per channel, whatever the hit rate: no stacking into contortions. */
export const ACCENT_CHANNEL_LIMIT = 0.55;
const CHANNEL_LIMIT = ACCENT_CHANNEL_LIMIT;
/** Below this every channel counts as at rest and the owner can skip the pose work. */
const REST_EPSILON = 1e-4;
/** Peak angle (rad) of the lightest and heaviest bullet: readable at range, never a stagger. */
const LIGHT_PEAK = 0.16;
const HEAVY_PEAK = 0.42;

/**
 * Localized, purely cosmetic flinch layered over the authored animation:
 * the head snaps on a head hit, the struck shoulder is thrown back on an
 * arm hit, the torso buckles towards a hit leg. One critically damped
 * spring per channel, solved in closed form, so it never oscillates,
 * never depends on the frame rate and always returns to exactly zero.
 * It never touches the legs, the locomotion clock or any gameplay state.
 */
export class ZombieHitAccent {
  private readonly angle = new Float32Array(CHANNELS);
  private readonly velocity = new Float32Array(CHANNELS);
  private resting = true;

  /** True while any channel is still displaced. */
  public get active(): boolean {
    return !this.resting;
  }

  /** Current angle of one channel, radians. */
  public value(channel: AccentChannel): number {
    return this.angle[channel];
  }

  /**
   * A confirmed bullet in `region` on `side` (+1 the body's left, -1 its
   * right), travelling along body-local (travelX, travelZ); `weight` is the
   * round's cosmetic heft, 0 (light) .. 1 (heavy).
   */
  public hit(region: ZombieBodyRegion, side: -1 | 0 | 1, travelX: number, travelZ: number, weight: number): void {
    const peak = LIGHT_PEAK + (HEAVY_PEAK - LIGHT_PEAK) * Math.min(1, Math.max(0, weight));
    // Shots from the front travel backwards (travelZ < 0). Upright parts
    // (head, torso) tip back with a negative pitch; limbs hanging or reaching
    // forward from the shoulder swing back and down with a positive one.
    const back = travelZ < 0 ? -1 : 1;
    const limbBack = -back;
    const away = -Math.sign(travelX) || 0;
    switch (region) {
      case 'head':
        // The head snaps with the round and the chest follows a little.
        this.impulse(AccentChannel.HeadPitch, back * peak * 1.3);
        this.impulse(AccentChannel.HeadRoll, away * peak * 0.7);
        this.impulse(AccentChannel.TorsoPitch, back * peak * 0.3);
        break;
      case 'arm':
        if (side >= 0) {
          this.impulse(AccentChannel.LeftShoulderPitch, limbBack * peak * 1.4);
          this.impulse(AccentChannel.LeftShoulderRoll, peak * 0.8);
        }
        if (side <= 0) {
          this.impulse(AccentChannel.RightShoulderPitch, limbBack * peak * 1.4);
          this.impulse(AccentChannel.RightShoulderRoll, -peak * 0.8);
        }
        // The chest turns away from the struck arm.
        this.impulse(AccentChannel.TorsoRoll, side * peak * 0.25);
        break;
      case 'leg':
        // The body dips forward and sags towards the hit leg; the legs keep their gait.
        this.impulse(AccentChannel.TorsoPitch, peak * 0.8);
        this.impulse(AccentChannel.TorsoRoll, -side * peak * 0.6);
        break;
      case 'torso':
        // The chest is punched back and twists with the round; the struck shoulder jolts.
        this.impulse(AccentChannel.TorsoPitch, back * peak * 0.7);
        this.impulse(AccentChannel.TorsoRoll, away * peak * 0.35);
        this.impulse(AccentChannel.HeadPitch, -back * peak * 0.3);
        if (side >= 0) this.impulse(AccentChannel.LeftShoulderPitch, limbBack * peak * 0.7);
        if (side <= 0) this.impulse(AccentChannel.RightShoulderPitch, limbBack * peak * 0.7);
        break;
    }
    this.resting = false;
  }

  /** Advances every channel by `dt` seconds along the exact critically damped curve. */
  public update(dt: number): void {
    if (this.resting || dt <= 0) return;
    const decay = Math.exp(-OMEGA * dt);
    let moving = false;
    for (let channel = 0; channel < CHANNELS; channel++) {
      const x = this.angle[channel];
      const v = this.velocity[channel];
      if (x === 0 && v === 0) continue;
      const slope = v + OMEGA * x;
      const nextX = (x + slope * dt) * decay;
      const nextV = (v - OMEGA * slope * dt) * decay;
      const bounded = Math.max(-CHANNEL_LIMIT, Math.min(CHANNEL_LIMIT, nextX));
      const settled = Math.abs(bounded) < REST_EPSILON && Math.abs(nextV) < REST_EPSILON * OMEGA;
      this.angle[channel] = settled ? 0 : bounded;
      this.velocity[channel] = settled ? 0 : nextV;
      if (!settled) moving = true;
    }
    this.resting = !moving;
  }

  public reset(): void {
    this.angle.fill(0);
    this.velocity.fill(0);
    this.resting = true;
  }

  /** Velocity that makes a channel at rest peak at `peak` radians (critically damped: peak = v0 / (ω·e)). */
  private impulse(channel: AccentChannel, peak: number): void {
    const limit = CHANNEL_LIMIT * OMEGA * Math.E;
    this.velocity[channel] = Math.max(-limit, Math.min(limit, this.velocity[channel] + peak * OMEGA * Math.E));
  }
}
