import { BarrelHeat } from './BarrelHeat';
import { RecoilController } from './RecoilController';
import type {
  FireMode,
  ReloadType,
  WeaponDefinition,
  WeaponEvent,
  WeaponFrameInput,
  WeaponState,
} from './WeaponTypes';
import { lerp, moveToward } from '../utils/math';

/** Seconds a full weapon inspection lasts. */
export const INSPECT_TIME = 3.6;

/**
 * Pure weapon logic: fire cadence, ammo, reload, bolt cycling, ADS blend and
 * spread bloom. Contains no Three.js code so it can be unit tested directly.
 * Rendering and audio subscribe through the drained event queue.
 */
export class Weapon {
  readonly recoil: RecoilController;
  /** Barrel temperature: drives the overheat glow, smoke and spread bonus. */
  readonly heat: BarrelHeat;
  ammoInMagazine: number;
  /** Remaining reserve rounds; null means a bottomless reserve. */
  reserveAmmo: number | null;
  fireMode: FireMode;
  /** 0 = hip fire, 1 = fully aimed. */
  adsAlpha = 0;
  /**
   * Multiplier on reload durations, set by the mode (a reload ring halves
   * it). Applies from the next reload; animation and sounds follow progress.
   */
  reloadTimeScale = 1;
  /** Events produced during the last update; drain with clearEvents(). */
  readonly pendingEvents: WeaponEvent[] = [];

  private readonly initialReserve: number | null;
  private weaponState: WeaponState = 'ready';
  private cooldown = 0;
  private stateTimer = 0;
  private stateDuration = 0;
  private activeReloadType: ReloadType | null = null;
  private reloadAfterEquip = false;
  private bloom = 0;
  private prevTrigger = false;
  /** Seconds into the running inspection; null when the weapon is not being inspected. */
  private inspectTimer: number | null = null;
  private secondsSinceShot = Infinity;

  constructor(
    readonly definition: WeaponDefinition,
    rng: () => number = Math.random,
    /**
     * Mode-provided reserve override. When present (even as undefined →
     * bottomless) it wins over definition.reserveAmmo, letting a mode make a
     * weapon finite (Zombies) or bottomless (Range) without mutating the
     * shared definition. Omit the argument to use the definition value.
     */
    reserveOverride?: number,
  ) {
    this.recoil = new RecoilController(definition.recoil, rng);
    this.heat = new BarrelHeat(definition.heat);
    this.ammoInMagazine = definition.magazineSize;
    // arguments.length distinguishes "no override passed" from an explicit
    // undefined override — the former keeps the definition, the latter
    // forces a bottomless reserve.
    this.initialReserve =
      arguments.length >= 3 ? (reserveOverride ?? null) : (definition.reserveAmmo ?? null);
    this.reserveAmmo = this.initialReserve;
    this.fireMode = definition.defaultFireMode;
  }

  get state(): WeaponState {
    return this.weaponState;
  }

  get reloadType(): ReloadType | null {
    return this.activeReloadType;
  }

  /** 0 → 1 progress of the current timed state (reload, bolt cycle, equip). */
  get stateProgress(): number {
    if (this.stateDuration <= 0) return 1;
    return 1 - this.stateTimer / this.stateDuration;
  }

  /**
   * 0 → 1 progress of the running inspection, or null. Inspecting is purely
   * visual: it never blocks firing, aiming or reloading, any of which ends it.
   */
  get inspectProgress(): number | null {
    return this.inspectTimer === null ? null : this.inspectTimer / INSPECT_TIME;
  }

  /** Starts an inspection from a ready, unaimed weapon. */
  inspect(): boolean {
    if (this.weaponState !== 'ready' || this.adsAlpha > 0 || this.inspectTimer !== null) return false;
    this.inspectTimer = 0;
    return true;
  }

  cancelInspect(): void {
    this.inspectTimer = null;
  }

  /**
   * True while the trigger keeps a cadence going: the last shot left less
   * than one and a half shot intervals ago. A continuous weapon (flame
   * stream) reads it as "the stream is on".
   */
  get isFiring(): boolean {
    return this.secondsSinceShot <= (60 / this.definition.rpm) * 1.5;
  }

  get currentBloom(): number {
    return this.bloom;
  }

  currentSpread(): number {
    const s = this.definition.spread;
    return lerp(s.hipBase, s.adsBase, this.adsAlpha) + this.bloom + this.heat.spreadBonus;
  }

  update(dt: number, input: WeaponFrameInput): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.secondsSinceShot += dt;
    this.recoil.update(dt);
    const wasLocked = this.heat.overheated;
    this.heat.update(dt);
    if (wasLocked && !this.heat.overheated && this.definition.heat?.warning !== undefined) {
      this.pendingEvents.push({ type: 'cooledDown' });
    }
    this.bloom = Math.max(0, this.bloom - this.definition.spread.bloomRecovery * dt);

    const canAim = this.weaponState === 'ready' || this.weaponState === 'cycling';
    const adsTarget = input.ads && canAim ? 1 : 0;
    this.adsAlpha = moveToward(this.adsAlpha, adsTarget, this.definition.ads.speed * dt);
    this.updateInspection(dt, input);

    if (this.weaponState !== 'ready') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.completeState();
    }

    const triggerEdge = input.trigger && !this.prevTrigger;
    this.prevTrigger = input.trigger;

    const repeatsWhileHeld = this.fireMode === 'auto' || input.repeatSemiAuto === true;
    const wantsFire = repeatsWhileHeld ? input.trigger : triggerEdge;
    if (wantsFire) this.tryFire(triggerEdge);
  }

  reload(): boolean {
    if (this.weaponState !== 'ready') return false;
    if (this.ammoInMagazine >= this.definition.magazineSize) return false;
    // A finite, empty reserve makes the reload impossible.
    if (this.reserveAmmo !== null && this.reserveAmmo <= 0) return false;
    this.activeReloadType = this.ammoInMagazine === 0 ? 'empty' : 'tactical';
    const duration =
      this.activeReloadType === 'empty'
        ? this.definition.reloadTime
        : this.definition.tacticalReloadTime;
    this.enterState('reloading', duration * this.reloadTimeScale, 'reloadStart');
    return true;
  }

  equip(): void {
    this.activeReloadType = null;
    this.reloadAfterEquip =
      this.ammoInMagazine === 0 && (this.reserveAmmo === null || this.reserveAmmo > 0);
    this.prevTrigger = false;
    this.adsAlpha = 0;
    this.bloom = 0;
    this.secondsSinceShot = Infinity;
    this.heat.reset();
    this.recoil.reset();
    this.enterState('equipping', this.definition.equipTime);
  }

  cycleFireMode(): FireMode | null {
    if (this.definition.fireModes.length < 2) return null;
    this.fireMode = this.fireMode === 'auto' ? 'semi' : 'auto';
    this.pendingEvents.push({ type: 'fireModeChanged' });
    return this.fireMode;
  }

  /**
   * Restores magazine and reserve to their starting values. Used by the
   * zombies restart and by Mystery Box pickups (fresh weapon, fresh ammo).
   */
  resetAmmo(): void {
    this.ammoInMagazine = this.definition.magazineSize;
    this.reserveAmmo = this.initialReserve;
    this.weaponState = 'ready';
    this.stateTimer = 0;
    this.stateDuration = 0;
    this.activeReloadType = null;
    this.reloadAfterEquip = false;
    this.cooldown = 0;
    this.bloom = 0;
    this.adsAlpha = 0;
    this.prevTrigger = false;
    this.inspectTimer = null;
    this.secondsSinceShot = Infinity;
    this.heat.reset();
    this.recoil.reset();
    this.pendingEvents.length = 0;
  }

  get isAmmoFull(): boolean {
    return (
      this.ammoInMagazine === this.definition.magazineSize &&
      (this.reserveAmmo === null || this.reserveAmmo === this.initialReserve)
    );
  }

  /** Replenishes only ammunition, preserving the current firing/reload state. */
  refillAmmo(): boolean {
    if (this.isAmmoFull) return false;
    this.ammoInMagazine = this.definition.magazineSize;
    if (this.reserveAmmo !== null) this.reserveAmmo = this.initialReserve;
    return true;
  }

  public setInfiniteReserve(): void {
    this.reserveAmmo = null;
  }

  clearEvents(): void {
    this.pendingEvents.length = 0;
  }

  private tryFire(triggerEdge: boolean): void {
    if (this.weaponState !== 'ready' || this.cooldown > 0) return;

    if (this.heat.overheated) {
      if (triggerEdge) this.pendingEvents.push({ type: 'overheated' });
      return;
    }

    if (this.ammoInMagazine <= 0) {
      // Dry fire clicks only on a fresh press so full-auto does not spam.
      if (triggerEdge) this.pendingEvents.push({ type: 'dryFire' });
      return;
    }

    this.ammoInMagazine--;
    this.cooldown = 60 / this.definition.rpm;

    const adsScale = lerp(1, this.definition.recoil.adsRecoilMultiplier, this.adsAlpha);
    this.recoil.kick(adsScale);
    this.bloom = Math.min(
      this.definition.spread.maxBloom,
      this.bloom + this.definition.spread.bloomPerShot,
    );
    const heatBefore = this.heat.level;
    this.heat.onShot();
    this.secondsSinceShot = 0;
    this.pendingEvents.push({ type: 'shot' });
    const warning = this.definition.heat?.warning;
    if (warning !== undefined && heatBefore < warning && this.heat.level >= warning) {
      this.pendingEvents.push({ type: 'heatWarning' });
    }
    if (this.heat.overheated) this.pendingEvents.push({ type: 'overheated' });

    if (this.definition.boltAction) {
      this.enterState('cycling', this.definition.boltCycleTime, 'boltStart');
    } else if (this.ammoInMagazine === 0) {
      this.reload();
    }
  }

  /** Advances the inspection; the trigger or the aim interrupt it so the shot is never delayed. */
  private updateInspection(dt: number, input: WeaponFrameInput): void {
    if (this.inspectTimer === null) return;
    if (input.trigger || input.ads) {
      this.inspectTimer = null;
      return;
    }
    this.inspectTimer += dt;
    if (this.inspectTimer >= INSPECT_TIME) this.inspectTimer = null;
  }

  private enterState(state: WeaponState, duration: number, event?: WeaponEvent['type']): void {
    // Reloading, cycling the bolt or equipping take the weapon out of the inspection.
    this.inspectTimer = null;
    this.weaponState = state;
    this.stateTimer = duration;
    this.stateDuration = duration;
    if (event) this.pendingEvents.push({ type: event });
  }

  private completeState(): void {
    const completedState = this.weaponState;
    switch (completedState) {
      case 'reloading': {
        // Draw only what the magazine needs from the reserve; bottomless
        // reserves (null) always refill to full.
        const needed = this.definition.magazineSize - this.ammoInMagazine;
        const taken = this.reserveAmmo === null ? needed : Math.min(needed, this.reserveAmmo);
        this.ammoInMagazine += taken;
        if (this.reserveAmmo !== null) this.reserveAmmo -= taken;
        this.pendingEvents.push({ type: 'reloadEnd' });
        break;
      }
      case 'cycling':
        this.pendingEvents.push({ type: 'boltEnd' });
        break;
      default:
        break;
    }
    this.weaponState = 'ready';
    this.stateTimer = 0;
    this.stateDuration = 0;
    this.activeReloadType = null;
    if (completedState === 'cycling' && this.ammoInMagazine === 0) this.reload();
    if (completedState === 'equipping' && this.reloadAfterEquip) {
      this.reloadAfterEquip = false;
      this.reload();
    }
  }
}
