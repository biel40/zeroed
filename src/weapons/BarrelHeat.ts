import type { BarrelHeatConfig } from './WeaponTypes';
import { clamp } from '../utils/math';

/** Default pause after the last shot before the barrel starts shedding heat. */
const COOL_DELAY = 0.25;
/** Heat level where the overheat starts to show (glow, smoke, spread). */
const OVERHEAT_START = 0.35;

/**
 * Barrel temperature of one weapon: every shot adds heat and the barrel
 * cools linearly once the trigger rests. Only sustained rapid fire climbs
 * past OVERHEAT_START; the resulting `intensity` drives the muzzle glow,
 * the extra smoke and the spread bonus. A `lockout` barrel that reaches
 * full heat stays `overheated` (unable to fire) until it has cooled
 * completely. A weapon without a config never heats. Pure logic, no Three.js.
 */
export class BarrelHeat {
  private heat = 0;
  private sinceShot = Infinity;
  private locked = false;

  constructor(private readonly config: BarrelHeatConfig | undefined) {}

  /** Raw temperature, 0 (cold) → 1 (fully overheated). */
  get level(): number {
    return this.heat;
  }

  /** 0 → 1 visible overheat: zero until OVERHEAT_START, smooth above it. */
  get intensity(): number {
    const t = clamp((this.heat - OVERHEAT_START) / (1 - OVERHEAT_START), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /** True while a lockout barrel refuses to fire. */
  get overheated(): boolean {
    return this.locked;
  }

  /** Extra dispersion (radians) added on top of base spread and bloom. */
  get spreadBonus(): number {
    return this.config ? this.config.maxSpreadBonus * this.intensity : 0;
  }

  onShot(): void {
    if (!this.config) return;
    this.heat = Math.min(1, this.heat + 1 / this.config.shotsToOverheat);
    this.sinceShot = 0;
    if (this.config.lockout && this.heat >= 1) this.locked = true;
  }

  update(dt: number): void {
    if (!this.config || this.heat <= 0) return;
    this.sinceShot += dt;
    if (this.sinceShot < (this.config.coolDelay ?? COOL_DELAY)) return;
    this.heat = Math.max(0, this.heat - dt / this.config.coolTime);
    if (this.heat <= 0) this.locked = false;
  }

  reset(): void {
    this.heat = 0;
    this.sinceShot = Infinity;
    this.locked = false;
  }
}
