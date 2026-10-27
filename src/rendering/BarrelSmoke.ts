import * as THREE from 'three';
import type { Effects } from './Effects';
import type { MuzzleSmokeConfig } from '../weapons/WeaponTypes';
import { lerp } from '../utils/math';

const SHOT_SMOKE_TINT = 0xdedede;
const SHOT_SMOKE_SIZE = 0.26;
/** A hot barrel smokes this much bigger on every shot. */
const HOT_SHOT_SIZE_BONUS = 0.9;
const WISP_TINT = 0xb4b4b4;
/** Seconds between lingering wisps: barely hot → fully overheated. */
const WISP_INTERVAL_WARM = 0.32;
const WISP_INTERVAL_HOT = 0.08;
const WISP_SIZE_WARM = 0.1;
const WISP_SIZE_HOT = 0.22;
/**
 * Sideways distance (m) of the first brake-vented cloud from the muzzle; each
 * further pair lands farther out. Keeps the clouds out of a scope's narrow view.
 */
const VENT_OFFSET = 0.32;
const VENT_STEP = 0.14;
const VENT_JITTER = 0.06;

/**
 * Muzzle smoke of a ballistic weapon. Each shot leaves a gas puff, larger the
 * hotter the barrel, and an overheated barrel keeps trailing wisps from the
 * muzzle until it cools. A MuzzleSmokeConfig adds heavy clouds vented to both
 * sides and scales everything up. Draws through the pooled Effects puffs.
 */
export class BarrelSmoke {
  private wispTimer = 0;
  private readonly vent = new THREE.Vector3();

  constructor(private readonly effects: Effects) {}

  /** `heat` is the 0 → 1 visible overheat (BarrelHeat.intensity); `right` is the camera's world right axis. */
  onShot(muzzle: THREE.Vector3, heat: number, right: THREE.Vector3, smoke?: MuzzleSmokeConfig): void {
    const scale = smoke?.scale ?? 1;
    const size = SHOT_SMOKE_SIZE * scale * (1 + heat * HOT_SHOT_SIZE_BONUS);
    this.effects.puff(muzzle, SHOT_SMOKE_TINT, size);
    if (!smoke) return;
    for (let i = 0; i < smoke.puffs; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const distance = VENT_OFFSET + Math.floor(i / 2) * VENT_STEP;
      this.vent.copy(muzzle).addScaledVector(right, side * distance);
      this.vent.x += (Math.random() * 2 - 1) * VENT_JITTER;
      this.vent.y += (Math.random() * 2 - 1) * VENT_JITTER;
      this.vent.z += (Math.random() * 2 - 1) * VENT_JITTER;
      this.effects.puff(this.vent, SHOT_SMOKE_TINT, size * (0.8 + Math.random() * 0.4), smoke.life);
    }
  }

  /** `smokeScale` is MuzzleSmokeConfig.scale (1 for ordinary weapons). */
  update(dt: number, muzzle: THREE.Vector3, heat: number, smokeScale: number = 1): void {
    if (heat <= 0.01) {
      this.wispTimer = 0;
      return;
    }
    this.wispTimer -= dt;
    if (this.wispTimer > 0) return;
    this.wispTimer = lerp(WISP_INTERVAL_WARM, WISP_INTERVAL_HOT, heat);
    this.effects.puff(muzzle, WISP_TINT, lerp(WISP_SIZE_WARM, WISP_SIZE_HOT, heat) * smokeScale);
  }
}
