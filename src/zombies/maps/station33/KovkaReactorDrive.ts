/**
 * How the KOVKA reactor answers a forge, in seconds and 0..1 levels:
 * - `idleCharge` .. 1: the charge it spins up to as the forge starts, and
 *   the crescendo it builds to by the end (eased by `riseRate` per second).
 * - `windDown`: seconds it takes to run down and go dark once it ends.
 * - `spin`: iris turn rate, radians per second, at no charge and full charge.
 * - `firstSurge`, `surgeInterval`: when it throbs (a `surge`) during the
 *   forge, none after `lastSurgeShare` of it, so the last never steps on
 *   the discharge.
 * - `flashDecay`: per second, how fast the discharge flash fades.
 */
export const KOVKA_REACTOR_DRIVE = {
  idleCharge: 0.5,
  riseRate: 2.2,
  windDown: 2.5,
  spin: { min: 0.35, max: 6.5 },
  firstSurge: 1.4,
  surgeInterval: 1.5,
  lastSurgeShare: 0.92,
  flashDecay: 1.6,
} as const;

/** What the reactor voices: a throb while it forges, the discharge as the forge ends. */
export type KovkaReactorEvent = 'surge' | 'discharge';

/**
 * The KOVKA reactor's state through a forge, deterministic and free of
 * Three.js: it spins up as the forge starts, builds its charge to a
 * crescendo as the forge nears its end, throbs at fixed beats, discharges
 * when the forge ends and runs down until it goes dark. A reset (restart)
 * goes dark at once, with no discharge. Its view (`KovkaReactorForge`)
 * and its sounds read it.
 */
export class KovkaReactorDrive {
  private chargeLevel = 0;
  private spinAngle = 0;
  private flashLevel = 0;
  private forgeTime = 0;
  private nextSurge: number = KOVKA_REACTOR_DRIVE.firstSurge;
  private forging = false;

  /** 0..1 charge: how hard the iris spins and how bright the reactor burns. */
  public get charge(): number {
    return this.chargeLevel;
  }

  /** Iris angle, radians, in 0..2π. */
  public get spin(): number {
    return this.spinAngle;
  }

  /** 0..1 flash of the discharge that ends a forge. */
  public get flash(): number {
    return this.flashLevel;
  }

  /** True while anything of the reactor's activity still shows. */
  public get active(): boolean {
    return this.chargeLevel > 0 || this.flashLevel > 0;
  }

  /**
   * Advances `dt` seconds. `forgeProgress` is the forge's 0..1 progress
   * while it runs and null otherwise; `onEvent` hears the surges and the
   * discharge.
   */
  public update(dt: number, forgeProgress: number | null, onEvent?: (event: KovkaReactorEvent) => void): void {
    const step = Math.max(0, dt);
    const { idleCharge, riseRate, windDown, spin, surgeInterval, lastSurgeShare, flashDecay } = KOVKA_REACTOR_DRIVE;
    const forging = forgeProgress !== null;
    if (forging) {
      if (!this.forging) {
        this.forgeTime = 0;
        this.nextSurge = KOVKA_REACTOR_DRIVE.firstSurge;
      }
      this.forgeTime += step;
      const progress = Math.min(1, Math.max(0, forgeProgress));
      const target = idleCharge + (1 - idleCharge) * progress * progress * (3 - 2 * progress);
      this.chargeLevel += (target - this.chargeLevel) * (1 - Math.exp(-riseRate * step));
      if (this.forgeTime >= this.nextSurge && progress < lastSurgeShare) {
        this.nextSurge += surgeInterval;
        onEvent?.('surge');
      }
    } else {
      if (this.forging) {
        this.flashLevel = 1;
        onEvent?.('discharge');
      }
      this.chargeLevel = Math.max(0, this.chargeLevel - step / windDown);
    }
    this.forging = forging;
    this.flashLevel = Math.max(0, this.flashLevel - flashDecay * step);
    const rate = this.chargeLevel > 0 ? spin.min + (spin.max - spin.min) * this.chargeLevel : 0;
    this.spinAngle = (this.spinAngle + rate * step) % (Math.PI * 2);
  }

  /** Restart: dark and still, and a forge cut short never discharges. */
  public reset(): void {
    this.chargeLevel = 0;
    this.spinAngle = 0;
    this.flashLevel = 0;
    this.forgeTime = 0;
    this.nextSurge = KOVKA_REACTOR_DRIVE.firstSurge;
    this.forging = false;
  }
}
