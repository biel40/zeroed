import { RecoilController } from './RecoilController';
import type {
  FireMode,
  WeaponDefinition,
  WeaponEvent,
  WeaponFrameInput,
  WeaponState,
} from './WeaponTypes';
import { lerp, moveToward } from '../utils/math';

/**
 * Pure weapon logic: fire cadence, ammo, reload, bolt cycling, ADS blend and
 * spread bloom. Contains no Three.js code so it can be unit tested directly.
 * Rendering and audio subscribe through the drained event queue.
 */
export class Weapon {
  readonly recoil: RecoilController;
  ammoInMagazine: number;
  /** Remaining reserve rounds; null = bottomless reserve (Shooting Range). */
  reserveAmmo: number | null;
  fireMode: FireMode;
  /** 0 = hip fire, 1 = fully aimed. */
  adsAlpha = 0;
  /** Events produced during the last update; drain with clearEvents(). */
  readonly pendingEvents: WeaponEvent[] = [];

  private readonly initialReserve: number | null;
  private weaponState: WeaponState = 'ready';
  private cooldown = 0;
  private stateTimer = 0;
  private stateDuration = 0;
  private bloom = 0;
  private prevTrigger = false;

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

  /** 0 → 1 progress of the current timed state (reload, bolt cycle, equip). */
  get stateProgress(): number {
    if (this.stateDuration <= 0) return 1;
    return 1 - this.stateTimer / this.stateDuration;
  }

  get currentBloom(): number {
    return this.bloom;
  }

  currentSpread(): number {
    const s = this.definition.spread;
    return lerp(s.hipBase, s.adsBase, this.adsAlpha) + this.bloom;
  }

  update(dt: number, input: WeaponFrameInput): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.recoil.update(dt);
    this.bloom = Math.max(0, this.bloom - this.definition.spread.bloomRecovery * dt);

    const canAim = this.weaponState === 'ready' || this.weaponState === 'cycling';
    const adsTarget = input.ads && canAim ? 1 : 0;
    this.adsAlpha = moveToward(this.adsAlpha, adsTarget, this.definition.ads.speed * dt);

    if (this.weaponState !== 'ready') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this.completeState();
    }

    const triggerEdge = input.trigger && !this.prevTrigger;
    this.prevTrigger = input.trigger;

    const wantsFire = this.fireMode === 'auto' ? input.trigger : triggerEdge;
    if (wantsFire) this.tryFire(triggerEdge);
  }

  reload(): boolean {
    if (this.weaponState !== 'ready') return false;
    if (this.ammoInMagazine >= this.definition.magazineSize) return false;
    // A finite, empty reserve makes the reload impossible.
    if (this.reserveAmmo !== null && this.reserveAmmo <= 0) return false;
    this.enterState('reloading', this.definition.reloadTime, 'reloadStart');
    return true;
  }

  equip(): void {
    this.prevTrigger = false;
    this.adsAlpha = 0;
    this.bloom = 0;
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
    this.cooldown = 0;
    this.bloom = 0;
    this.adsAlpha = 0;
    this.prevTrigger = false;
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
    this.reserveAmmo = this.initialReserve;
    return true;
  }

  clearEvents(): void {
    this.pendingEvents.length = 0;
  }

  private tryFire(triggerEdge: boolean): void {
    if (this.weaponState !== 'ready' || this.cooldown > 0) return;

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
    this.pendingEvents.push({ type: 'shot' });

    if (this.definition.boltAction) {
      this.enterState('cycling', this.definition.boltCycleTime, 'boltStart');
    } else if (this.ammoInMagazine === 0) {
      this.reload();
    }
  }

  private enterState(state: WeaponState, duration: number, event?: WeaponEvent['type']): void {
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
    if (completedState === 'cycling' && this.ammoInMagazine === 0) this.reload();
  }
}
