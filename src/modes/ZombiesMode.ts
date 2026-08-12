import type * as THREE from 'three';
import { WEAPON_DEFINITIONS, ZOMBIES_WEAPON_ORDER } from '../config/weapons';
import { PlayerHealth } from '../game/PlayerHealth';
import type { HitTarget } from '../shooting/HitTarget';
import type { Weapon } from '../weapons/Weapon';
import type { EnergyWeaponConfig, WeaponId } from '../weapons/WeaponTypes';
import { EnergyProjectiles } from '../zombies/EnergyProjectiles';
import { RoundManager } from '../zombies/RoundManager';
import { Zombie } from '../zombies/Zombie';
import type { ZombieHitPart } from '../zombies/ZombieConfig';
import { PLAYER_HIT_INVULN, PLAYER_MAX_HP } from '../zombies/ZombieConfig';
import { ZombieManager } from '../zombies/ZombieManager';
import type { GameMode, ModeContext } from './GameMode';
import { standardTargetHitEffects } from './hitEffects';

/**
 * Zombies mode: infinite rounds, a hard-capped pooled horde, player HP with
 * brief post-hit invulnerability, game over / restart, and the mode-only
 * Ray Gun firing visible energy bolts with splash damage. Everything lives
 * here; the shared Game shell only routes events in.
 */
export class ZombiesMode implements GameMode {
  readonly id = 'zombies' as const;
  readonly weaponIds: readonly WeaponId[] = ZOMBIES_WEAPON_ORDER;

  private ctx!: ModeContext;
  private zombies!: ZombieManager;
  private energy!: EnergyProjectiles;
  private readonly rounds = new RoundManager();
  private readonly health = new PlayerHealth(PLAYER_MAX_HP, PLAYER_HIT_INVULN);
  private kills = 0;
  private headshots = 0;
  private gameOver = false;

  init(ctx: ModeContext): void {
    this.ctx = ctx;

    this.zombies = new ZombieManager();
    this.zombies.registerColliders(ctx.hitColliders);
    this.zombies.onZombieKilled = (_zombie, headshot) => this.onZombieKilled(headshot);
    this.zombies.onPlayerAttack = (damage) => this.onPlayerHit(damage);
    ctx.scene.add(this.zombies.group);

    this.energy = new EnergyProjectiles(ctx.hitColliders, ctx.scene);
    this.energy.onImpact = (point, config, object, distance) =>
      this.onEnergyImpact(point, config, object, distance);

    ctx.hud.setRangeStatsVisible(false);
    ctx.hud.setZombiesPanelVisible(true);
    ctx.hud.setZombiesRestartHandler(() => this.restart());
    this.pushHudState();
  }

  update(dt: number): void {
    // The horde keeps shambling behind the game-over screen; it just can't
    // hurt anyone anymore.
    if (!this.gameOver) {
      this.health.update(dt);
      this.rounds.update(dt, this.zombies.aliveCount);
      this.processRoundEvents();
    }

    const playerPos = this.ctx.player.rig.position;
    this.zombies.update(dt, playerPos.x, playerPos.z);
    this.energy.update(dt);
    this.pushHudState();
  }

  onTargetHit(
    target: HitTarget,
    distance: number,
    point: THREE.Vector3,
    normal: THREE.Vector3,
    object: THREE.Object3D,
    weapon: Weapon,
  ): void {
    if (this.gameOver) return;
    const zombie = object.userData.zombie as Zombie | undefined;

    // Range props stay decorative and keep their classic feedback.
    if (!zombie) {
      this.ctx.stats.registerHit(distance);
      this.ctx.hud.showHitmarker();
      standardTargetHitEffects(this.ctx.audio, this.ctx.effects, target, point, normal, object);
      return;
    }

    this.ctx.stats.registerHit(distance);
    this.ctx.hud.showHitmarker();
    this.ctx.audio.playZombieHit();
    this.ctx.effects.puff(point, 0x6e1d16, 0.2);
    const part = (object.userData.hitPart as ZombieHitPart | undefined) ?? 'torso';
    this.zombies.damageZombie(
      zombie,
      part,
      weapon.definition.damage,
      weapon.definition.headshotMultiplier,
    );
  }

  /** The Ray Gun bypasses hitscan ballistics and fires a visible bolt. */
  onWeaponFired(weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    const energy = weapon.definition.energy;
    if (!energy) return false;
    this.energy.fire(origin, direction, energy);
    return true;
  }

  /** Skip the pause screen while the game-over panel is up. */
  onPointerUnlock(): boolean {
    return this.gameOver;
  }

  private processRoundEvents(): void {
    const playerPos = this.ctx.player.rig.position;
    for (const event of this.rounds.pendingEvents) {
      switch (event.type) {
        case 'roundStarted':
          this.ctx.hud.showRoundBanner(`ROUND ${event.round}`);
          this.ctx.audio.playRoundSting();
          break;
        case 'spawnDue':
          // The pool returning false means we are at the alive cap; the
          // RoundManager already accounts for that, so this never fails.
          this.zombies.spawnZombie(event.config, playerPos.x, playerPos.z);
          break;
        case 'roundComplete':
          this.ctx.hud.showRoundBanner(`ROUND ${event.round} COMPLETE`, 'GET READY');
          break;
      }
    }
    this.rounds.clearEvents();
  }

  private onZombieKilled(headshot: boolean): void {
    this.kills++;
    if (headshot) this.headshots++;
    this.ctx.audio.playZombieDeath();
  }

  private onPlayerHit(damage: number): void {
    if (this.gameOver) return;
    if (!this.health.damage(damage)) return;
    this.ctx.audio.playPlayerHurt();
    this.ctx.hud.flashDamage();
    if (this.health.isDead) this.endGame();
  }

  private onEnergyImpact(
    point: THREE.Vector3,
    config: EnergyWeaponConfig,
    object: THREE.Object3D | null,
    distance: number,
  ): void {
    this.ctx.audio.playRayImpact();
    if (this.gameOver) return;

    const raygun = WEAPON_DEFINITIONS.raygun;
    const zombie = object?.userData.zombie as Zombie | undefined;
    if (zombie && zombie.isAlive) {
      const part = (object?.userData.hitPart as ZombieHitPart | undefined) ?? 'torso';
      this.ctx.stats.registerHit(distance);
      this.ctx.hud.showHitmarker();
      this.zombies.damageZombie(zombie, part, raygun.damage, raygun.headshotMultiplier);
    }
    // Splash includes the directly-hit zombie: the Ray Gun fantasy is that
    // a bullseye on a packed horde is devastating.
    this.zombies.applySplash(point, config.splashRadius, config.splashDamage);
  }

  private endGame(): void {
    this.gameOver = true;
    this.ctx.hud.showGameOver({
      round: this.rounds.round,
      kills: this.kills,
      headshots: this.headshots,
    });
    this.ctx.unlockPointer();
  }

  private restart(): void {
    this.gameOver = false;
    this.kills = 0;
    this.headshots = 0;
    this.health.reset();
    this.rounds.reset();
    this.zombies.reset();
    this.ctx.hud.hideGameOver();
    this.pushHudState();
    this.ctx.lockPointer();
  }

  private pushHudState(): void {
    this.ctx.hud.updateZombies({
      round: this.rounds.round,
      alive: this.zombies.aliveCount,
      pending: this.rounds.pendingSpawnCount,
      hp: this.health.hp,
      maxHp: this.health.maxHp,
      kills: this.kills,
      headshots: this.headshots,
    });
  }
}
