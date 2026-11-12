import * as THREE from 'three';
import type { PlayerEconomy } from '../game/PlayerEconomy';
import { WeaponUpgrades } from '../game/WeaponUpgrades';
import { t } from '../i18n/i18n';
import { actionKey } from '../ui/InteractionPrompts';
import type { WeaponCatalog, WeaponId } from '../weapons/WeaponTypes';
import type { ArenaUpgradeMachine } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';

/**
 * The map's weapon upgrade machine in a single-player run: facing it with a
 * weapon in hand, the prompt names the weapon and the price; paying starts
 * the machine's forge, and when it ends that weapon hits harder for the rest
 * of the run, is refilled and wears the map's finish. Each weapon is forged
 * once. `ZombiesMode` delegates every upgrade concern here and asks it for
 * the damage multiplier of each weapon.
 */
export class ZombiesWeaponUpgrade {
  private readonly upgrades: WeaponUpgrades;
  /** Weapon in the running forge, upgraded once the machine is done. */
  private forging: WeaponId | null = null;
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
    if (!this.machine.powered) return t('prompt.upgradeNeedsPower');
    if (this.forging) return t('prompt.upgradeForging', { weapon: this.weapons[this.forging].name });
    const id = this.ctx.getEquippedWeaponId();
    const weapon = this.weapons[id].name;
    if (this.upgrades.has(id)) return t('prompt.upgradeDone', { weapon });
    return t('prompt.upgradeWeapon', { weapon, key: actionKey(this.ctx.profile.useTouchControls), cost: this.machine.cost });
  }

  /** USE pressed: pays for and starts forging the weapon in hand. False when the machine is not faced. */
  public interact(): boolean {
    if (!this.facingMachine()) return false;
    const id = this.ctx.getEquippedWeaponId();
    // Unpowered, busy or already forged: the prompt already says why.
    if (!this.machine.powered || this.forging || this.upgrades.has(id)) return true;
    if (!this.economy.spend(this.machine.cost)) {
      this.ctx.hud.flashNotEnoughPoints();
      this.ctx.hud.showNotice('denied', t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost: this.machine.cost }));
      return true;
    }
    this.forging = id;
    this.machine.forge(id);
    this.ctx.audio.playMysteryBoxOpen();
    return true;
  }

  /** Delivers the forged weapon once the machine's forge has run. */
  public update(): void {
    if (!this.forging || this.machine.busy) return;
    const id = this.forging;
    this.forging = null;
    this.upgrades.upgrade(id);
    this.ctx.refillWeaponAmmo(id);
    this.ctx.setWeaponFinish(id, this.machine.finish);
    this.ctx.audio.playMysteryBoxReveal(true);
    this.ctx.hud.showNotice('info', t('banner.weaponUpgraded', { weapon: this.weapons[id].name }));
  }

  /** Damage multiplier of `id`: the machine's once forged, else 1. */
  public damageScale(id: WeaponId): number {
    return this.upgrades.damageScale(id);
  }

  /** A restart forgets every forge; the shell takes the finishes off with the arsenal. */
  public reset(): void {
    this.upgrades.reset();
    this.forging = null;
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
