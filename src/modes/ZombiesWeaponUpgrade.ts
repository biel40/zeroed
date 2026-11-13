import * as THREE from 'three';
import type { PlayerEconomy } from '../game/PlayerEconomy';
import { WeaponUpgrades } from '../game/WeaponUpgrades';
import { t } from '../i18n/i18n';
import { actionKey } from '../ui/InteractionPrompts';
import type { WeaponShotLooks } from '../weapons/WeaponShotLook';
import type { WeaponCatalog, WeaponId } from '../weapons/WeaponTypes';
import type { ArenaUpgradeMachine } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';

/** The weapon handed to the machine and whether its forge has finished. */
interface ForgeOrder {
  readonly weapon: WeaponId;
  ready: boolean;
}

/**
 * The map's weapon upgrade machine in a single-player run: facing it with a
 * weapon in hand, the prompt names the weapon and the price; paying takes
 * the weapon out of the inventory (the other one stays in hand) into the
 * machine's forge. When the forge ends the weapon waits on show until the
 * player uses the machine again to take it back into its slot: only then
 * does it hit harder and carry a larger magazine and reserve for the rest of
 * the run, come back refilled and wear the map's finish. Each weapon is forged once and the machine holds one
 * weapon at a time. `ZombiesMode` delegates every upgrade concern here and
 * asks it for the damage multiplier of each weapon.
 */
export class ZombiesWeaponUpgrade {
  private readonly upgrades: WeaponUpgrades;
  /** Weapon in the machine, from payment until it is taken back. */
  private order: ForgeOrder | null = null;
  private readonly forward = new THREE.Vector3();

  public constructor(
    private readonly ctx: ModeContext,
    private readonly machine: ArenaUpgradeMachine,
    private readonly economy: PlayerEconomy,
    private readonly weapons: WeaponCatalog,
  ) {
    this.upgrades = new WeaponUpgrades(machine.damageMultiplier);
  }

  /** Prompt while facing the machine, else null. */
  public prompt(): string | null {
    if (!this.facingMachine()) return null;
    const key = actionKey(this.ctx.profile.useTouchControls);
    if (this.order) {
      const weapon = this.weapons[this.order.weapon].name;
      return this.order.ready ? t('prompt.upgradeCollect', { weapon, key }) : t('prompt.upgradeForging', { weapon });
    }
    if (!this.machine.powered) return t('prompt.upgradeNeedsPower');
    const id = this.ctx.getEquippedWeaponId();
    const weapon = this.weapons[id].name;
    if (this.upgrades.has(id)) return t('prompt.upgradeDone', { weapon });
    if (!this.ctx.canStoreWeapon(id)) return t('prompt.upgradeNeedsSecondWeapon', { weapon });
    return t('prompt.upgradeWeapon', { weapon, key, cost: this.machine.cost });
  }

  /**
   * USE pressed: takes back a forged weapon, or pays for and starts forging
   * the weapon in hand. False when the machine is not faced.
   */
  public interact(): boolean {
    if (!this.facingMachine()) return false;
    if (this.order) {
      if (this.order.ready) this.collect();
      return true;
    }
    const id = this.ctx.getEquippedWeaponId();
    // Unpowered, already forged or the last weapon in hand: the prompt already says why.
    if (!this.machine.powered || this.upgrades.has(id) || !this.ctx.canStoreWeapon(id)) return true;
    if (!this.economy.spend(this.machine.cost)) {
      this.ctx.hud.flashNotEnoughPoints();
      this.ctx.hud.showNotice('denied', t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost: this.machine.cost }));
      return true;
    }
    if (!this.ctx.storeWeapon(id)) throw new Error(`Weapon "${id}" could not be handed to the upgrade machine after validation`);
    this.order = { weapon: id, ready: false };
    this.machine.forge(id);
    this.ctx.audio.playMysteryBoxOpen();
    return true;
  }

  /** Announces the forged weapon once the machine's forge has run; it is never handed over by itself. */
  public update(): void {
    if (!this.order || this.order.ready || this.machine.busy) return;
    this.order.ready = true;
    this.ctx.audio.playMysteryBoxReveal(true);
    this.ctx.hud.showNotice('info', t('banner.weaponReady', { weapon: this.weapons[this.order.weapon].name }));
  }

  /** True while `id` is in the machine, forging or waiting to be taken. */
  public holds(id: WeaponId): boolean {
    return this.order?.weapon === id;
  }

  /** Whether `id` has been forged and taken back this run. */
  public isUpgraded(id: WeaponId): boolean {
    return this.upgrades.has(id);
  }

  /** Damage multiplier of `id`: the machine's once forged, else 1. */
  public damageScale(id: WeaponId): number {
    return this.upgrades.damageScale(id);
  }

  /** How `id`'s shots look once forged (the machine's finish), else null: they keep the weapon's own. */
  public shotLooks(id: WeaponId): WeaponShotLooks | null {
    return this.upgrades.has(id) ? this.machine.finish.shots ?? null : null;
  }

  /** A restart forgets every forge and the weapon left in the machine; the shell resets the arsenal. */
  public reset(): void {
    this.upgrades.reset();
    this.order = null;
  }

  /** The forged weapon goes back into its slot, upgraded, its capacity grown and refilled, dressed in the finish. */
  private collect(): void {
    const id = this.ctx.retrieveStoredWeapon();
    if (!id) throw new Error('The upgrade machine held a weapon the inventory had not stored');
    this.order = null;
    this.machine.collect();
    this.upgrades.upgrade(id);
    // Larger magazine and reserve first, so the refill fills them.
    this.ctx.setWeaponCapacityScale(id, this.machine.ammoMultiplier);
    this.ctx.refillWeaponAmmo(id);
    this.ctx.setWeaponFinish(id, this.machine.finish);
    this.ctx.audio.playMysteryBoxPickup();
    this.ctx.hud.showNotice('info', t('banner.weaponUpgraded', { weapon: this.weapons[id].name }));
  }

  private facingMachine(): boolean {
    const player = this.ctx.player;
    const { position, floor, useRange, lookDotMin } = this.machine;
    if (floor !== player.floor) return false;
    const dx = position.x - player.rig.position.x;
    const dz = position.z - player.rig.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > useRange) return false;
    const forward = player.camera.getWorldDirection(this.forward);
    return distance < 1e-3 || (forward.x * dx + forward.z * dz) / distance >= lookDotMin;
  }
}
