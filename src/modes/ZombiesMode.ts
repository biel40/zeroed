import * as THREE from 'three';
import { WEAPON_DEFINITIONS, ZOMBIES_WEAPON_PRELOAD } from '../config/weapons';
import { PlayerEconomy } from '../game/PlayerEconomy';
import { PlayerHealth } from '../game/PlayerHealth';
import type { HitTarget } from '../shooting/HitTarget';
import type { Weapon } from '../weapons/Weapon';
import type { EnergyWeaponConfig, WeaponId } from '../weapons/WeaponTypes';
import { ChainLightning } from '../zombies/ChainLightning';
import { EnergyProjectiles } from '../zombies/EnergyProjectiles';
import {
  MYSTERY_BOX_PLACEMENT,
  MYSTERY_BOX_POOL,
  MYSTERY_BOX_TUNING,
  MysteryBoxMachine,
} from '../zombies/MysteryBox';
import { MysteryBoxView } from '../zombies/MysteryBoxView';
import { NightEnvironment } from '../zombies/NightEnvironment';
import { RoundManager } from '../zombies/RoundManager';
import { Zombie } from '../zombies/Zombie';
import type { ZombieHitPart } from '../zombies/ZombieConfig';
import {
  CHAIN_ZAP_DAMAGE,
  PLAYER_HIT_INVULN,
  PLAYER_MAX_HP,
  PLAYER_REGEN_DELAY,
  PLAYER_REGEN_RATE,
  RAYGUN_UNLOCK_KILLS,
  TESLA_UNLOCK_KILLS,
  ZOMBIES_RESERVE_AMMO,
} from '../zombies/ZombieConfig';
import { ZombieManager } from '../zombies/ZombieManager';
import type { GameMode, ModeContext } from './GameMode';
import { standardTargetHitEffects } from './hitEffects';

/** Camera-shake tuning: how much one zombie hit rattles the view. */
const HIT_TRAUMA = 0.42;
const TRAUMA_DECAY = 1.6;
const SHAKE_MAX_ANGLE = 0.035;
/** Distant moans drift in every few seconds, never on a fixed rhythm. */
const MOAN_MIN_DELAY = 6;
const MOAN_SPREAD = 9;

/**
 * Zombies mode: infinite rounds, a hard-capped pooled horde, player HP with
 * brief post-hit invulnerability, game over / restart, and the mode-only
 * Ray Gun firing visible energy bolts with splash damage. The mode owns the
 * night atmosphere (moonlight, fog, practicals, ambience) — the shooting
 * range stays sunny because each mode applies its own environment.
 */
export class ZombiesMode implements GameMode {
  readonly id = 'zombies' as const;
  /** Every handout the mode can give is preloaded: no loads mid-game. */
  readonly weaponIds: readonly WeaponId[] = ZOMBIES_WEAPON_PRELOAD;
  /** Zombies starts with the M1911 alone; better guns come from the box. */
  readonly startingInventory: readonly WeaponId[] = ['m1911'];
  /** Two-weapon carry limit, enforced by the shared inventory. */
  readonly maxWeapons = 2;

  /**
   * Every Zombies weapon runs a finite reserve (generous tier). The mode
   * table ZOMBIES_RESERVE_AMMO wins over the shared definition (so the
   * M1911 gets 112 in zombies while keeping 8/32 by definition); weapons
   * not listed — the Tesla — keep their definition reserve. The range
   * never calls this — it stays bottomless.
   */
  reserveAmmoFor(id: WeaponId): number | undefined {
    return ZOMBIES_RESERVE_AMMO[id] ?? WEAPON_DEFINITIONS[id].reserveAmmo;
  }

  private ctx!: ModeContext;
  private zombies!: ZombieManager;
  private energy!: EnergyProjectiles;
  private chain!: ChainLightning;
  private night: NightEnvironment | null = null;
  private box: MysteryBoxMachine | null = null;
  private boxView: MysteryBoxView | null = null;
  private readonly rounds = new RoundManager();
  private readonly health = new PlayerHealth(
    PLAYER_MAX_HP,
    PLAYER_HIT_INVULN,
    PLAYER_REGEN_DELAY,
    PLAYER_REGEN_RATE,
  );
  /** Centralized Points wallet: every reward and purchase routes through it. */
  private readonly economy = new PlayerEconomy();
  private kills = 0;
  private headshots = 0;
  private rayGunUnlocked = false;
  private teslaUnlocked = false;
  private gameOver = false;
  private trauma = 0;
  private shakeSeed = 0;
  private moanTimer = MOAN_MIN_DELAY;
  /** Reused by the box facing check; avoids per-frame allocation. */
  private readonly tmpDirection = new THREE.Vector3();

  init(ctx: ModeContext): void {
    this.ctx = ctx;

    this.zombies = new ZombieManager(
      Math.random,
      // Only the small walker category exists; nothing else is requested.
      { walker: ctx.assets.getZombieModel('walker') },
      // Static shadow maps (mobile) must not have moving casters.
      !ctx.profile.useReducedEffects,
    );
    this.zombies.registerColliders(ctx.hitColliders);
    this.zombies.onZombieKilled = (_zombie, headshot) => this.onZombieKilled(headshot);
    this.zombies.onPlayerAttack = (damage) => this.onPlayerHit(damage);
    ctx.scene.add(this.zombies.group);

    this.energy = new EnergyProjectiles(ctx.hitColliders, ctx.scene);
    this.energy.onImpact = (point, config, object, distance) =>
      this.onEnergyImpact(point, config, object, distance);
    this.chain = new ChainLightning(ctx.scene);

    // Day → night: sky, fog, moonlight, practicals and the ambient bed.
    this.night = new NightEnvironment(ctx.scene, ctx.range, ctx.setExposure, ctx.profile);
    ctx.audio.startWind();

    // The Mystery Box: main weapon progression, exclusive to this mode.
    // The audio duration provider keeps the reveal synced to the real MP3.
    this.box = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, Math.random, () =>
      ctx.audio.getMysteryBoxOpenDuration(),
    );
    this.boxView = new MysteryBoxView(ctx.assets, MYSTERY_BOX_PLACEMENT.position, MYSTERY_BOX_POOL);
    ctx.scene.add(this.boxView.group);

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
      this.updateAmbience(dt);
    }

    const playerPos = this.ctx.player.rig.position;
    this.zombies.update(dt, playerPos.x, playerPos.z);
    this.energy.update(dt);
    this.chain.update(dt);
    this.night?.update(dt);
    if (this.box && this.boxView) {
      this.box.update(dt);
      this.boxView.update(dt, this.box);
      this.processBoxEvents();
    }
    this.updateCameraShake(dt);
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
    const lethal = this.zombies.damageZombie(
      zombie,
      part,
      weapon.definition.damage,
      weapon.definition.headshotMultiplier,
    );
    // Non-lethal hits pay +10; a lethal hit pays its kill reward instead
    // (via onZombieKilled), so one bullet never double-dips.
    if (!lethal) this.economy.awardHit();
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

  /** E pressed: use the box when closed, take the result when offered. */
  onInteract(): void {
    if (this.gameOver || !this.box || !this.playerInBoxRange()) return;
    if (this.box.state === 'closed') {
      // Charge at activation time. spend() is atomic and tryActivate() only
      // fires from 'closed', so repeated E presses during the animation can
      // never double-charge: the box is no longer closed on the next press.
      if (!this.economy.spend(MYSTERY_BOX_TUNING.cost)) {
        this.ctx.hud.flashNotEnoughPoints();
        this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS', `${MYSTERY_BOX_TUNING.cost} PTS NEEDED`);
        return;
      }
      this.box.tryActivate();
      return;
    }
    if (this.box.state === 'awaitingPickup') {
      const id = this.box.tryPickup();
      if (id) this.ctx.grantWeapon(id);
    }
  }

  /** Center-screen prompt: only near the box, and only when it is usable. */
  getInteractPrompt(): string | null {
    if (this.gameOver || !this.box || !this.playerInBoxRange()) return null;
    const key = this.ctx.profile.useTouchControls ? 'Tap USE' : 'Press E';
    switch (this.box.state) {
      case 'closed':
        return MYSTERY_BOX_TUNING.cost > 0
          ? `MYSTERY BOX\n${key} — ${MYSTERY_BOX_TUNING.cost} PTS`
          : `MYSTERY BOX\n${key}`;
      case 'awaitingPickup': {
        const result = this.box.result;
        return result ? `${key} to take ${WEAPON_DEFINITIONS[result].name}` : null;
      }
      default:
        return null;
    }
  }

  /**
   * Interaction gate: the player must stand close AND roughly face the
   * crate, so the box can never be triggered from across the map.
   */
  private playerInBoxRange(): boolean {
    const playerPos = this.ctx.player.rig.position;
    const boxPos = MYSTERY_BOX_PLACEMENT.position;
    const dx = boxPos.x - playerPos.x;
    const dz = boxPos.z - playerPos.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > MYSTERY_BOX_PLACEMENT.useRange * MYSTERY_BOX_PLACEMENT.useRange) return false;

    const camera = this.ctx.player.camera;
    const forward = camera.getWorldDirection(this.tmpDirection);
    const distance = Math.sqrt(distanceSq);
    if (distance < 1e-3) return true; // standing on top of it counts as facing
    const dot = (forward.x * dx + forward.z * dz) / distance;
    return dot >= MYSTERY_BOX_PLACEMENT.lookDotMin;
  }

  /** Box events drive only audio; visuals read the machine directly. */
  private processBoxEvents(): void {
    if (!this.box) return;
    for (const event of this.box.pendingEvents) {
      switch (event.type) {
        case 'opened':
          this.ctx.audio.playMysteryBoxOpen();
          break;
        case 'rollTick':
          this.ctx.audio.playMysteryBoxTick();
          break;
        case 'result':
          this.ctx.audio.playMysteryBoxReveal(event.weaponId === 'raygun');
          break;
        case 'pickedUp':
          this.ctx.audio.playMysteryBoxPickup();
          break;
        case 'expired':
        case 'closed':
          this.ctx.audio.playMysteryBoxClose();
          break;
      }
    }
    this.box.clearEvents();
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
    // Kill reward: headshot (+100) replaces the normal kill (+50); the two
    // never stack for one death. Splash/chain kills arrive here too, so all
    // kill points flow through this single call.
    this.economy.awardKill(headshot);
    if (!this.teslaUnlocked && this.kills >= TESLA_UNLOCK_KILLS) this.unlockTesla();
    if (!this.rayGunUnlocked && this.kills >= RAYGUN_UNLOCK_KILLS) this.unlockRayGun();
  }

  /**
   * 100-kill milestone: the ZEUS-77 is granted outright (the inventory's
   * slot-cap rules apply), announced with the round banner and an electric
   * sting. The flag makes the handout fire exactly once per run; restart()
   * re-arms it. Same proven pattern as the Ray Gun milestone below.
   */
  private unlockTesla(): void {
    this.teslaUnlocked = true;
    this.ctx.grantWeapon('tesla');
    this.ctx.hud.showRoundBanner('ZEUS-77 UNLOCKED', `${TESLA_UNLOCK_KILLS} KILLS`);
    this.ctx.audio.playTeslaUnlock();
  }

  /**
   * 115-kill milestone: the Ray Gun is granted outright (the inventory's
   * slot-cap rules apply), announced with the round banner and the box's
   * Ray Gun reveal sting. The flag makes the handout fire exactly once per
   * run; restart() re-arms it.
   */
  private unlockRayGun(): void {
    this.rayGunUnlocked = true;
    this.ctx.grantWeapon('raygun');
    this.ctx.hud.showRoundBanner('RAY GUN UNLOCKED', `${RAYGUN_UNLOCK_KILLS} KILLS`);
    this.ctx.audio.playMysteryBoxReveal(true);
  }

  private onPlayerHit(damage: number): void {
    if (this.gameOver) return;
    if (!this.health.damage(damage)) return;
    this.ctx.audio.playPlayerHurt();
    this.ctx.hud.flashDamage();
    // Trauma-based shake: offsets pile up and decay smoothly.
    this.trauma = Math.min(1, this.trauma + HIT_TRAUMA);
    if (this.health.isDead) this.endGame();
  }

  /**
   * Decaying rotational noise layered on the camera after PlayerController
   * has written its recoil pose (mode.update runs later in the frame).
   */
  private updateCameraShake(dt: number): void {
    if (this.trauma <= 0) return;
    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    this.shakeSeed += dt * 34;
    const amount = this.trauma * this.trauma * SHAKE_MAX_ANGLE;
    const camera = this.ctx.player.camera;
    camera.rotation.x += Math.sin(this.shakeSeed * 1.1) * amount;
    camera.rotation.y += Math.sin(this.shakeSeed * 0.9 + 1.7) * amount;
    camera.rotation.z += Math.sin(this.shakeSeed * 1.3 + 3.1) * amount * 0.6;
  }

  private updateAmbience(dt: number): void {
    this.moanTimer -= dt;
    if (this.moanTimer <= 0) {
      this.moanTimer = MOAN_MIN_DELAY + Math.random() * MOAN_SPREAD;
      this.ctx.audio.playDistantMoan();
    }
  }

  private onEnergyImpact(
    point: THREE.Vector3,
    config: EnergyWeaponConfig,
    object: THREE.Object3D | null,
    distance: number,
  ): void {
    if (this.gameOver) return;
    const zombie = object?.userData.zombie as Zombie | undefined;
    const isTesla = config.color === WEAPON_DEFINITIONS.tesla.energy?.color;

    // Tesla: electric discharge that chains to nearby zombies. No splash;
    // the damage travels zombie-to-zombie, which is the whole point.
    if (isTesla && zombie && zombie.isAlive) {
      this.ctx.audio.playTeslaShot();
      this.ctx.stats.registerHit(distance);
      this.ctx.hud.showHitmarker();
      const chain = this.zombies.applyChainLightning(zombie, CHAIN_ZAP_DAMAGE);
      this.ctx.audio.playTeslaChain(chain.length);
      // Arc from the muzzle through each electrocuted zombie in order.
      const muzzle = this.ctx.player.camera.getWorldPosition(this.tmpDirection);
      const points: THREE.Vector3[] = [muzzle.clone()];
      for (const z of chain) {
        points.push(new THREE.Vector3(z.position.x, z.position.y + 1.1, z.position.z));
      }
      this.chain.discharge(points);
      return;
    }

    // A Tesla bolt that strikes the environment just grounds out: an electric
    // crack, no chain (the design chains zombie-to-zombie, never from dirt).
    if (isTesla) {
      this.ctx.audio.playTeslaShot();
      return;
    }

    this.ctx.audio.playRayImpact();

    const raygun = WEAPON_DEFINITIONS.raygun;
    if (zombie && zombie.isAlive) {
      const part = (object?.userData.hitPart as ZombieHitPart | undefined) ?? 'torso';
      this.ctx.stats.registerHit(distance);
      this.ctx.hud.showHitmarker();
      const lethal = this.zombies.damageZombie(zombie, part, raygun.damage, raygun.headshotMultiplier);
      if (!lethal) this.economy.awardHit();
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

  /** Pause-menu RESTART: reset the run and resume (re-locks the pointer). */
  onRestartRequested(): void {
    this.restart();
  }

  private restart(): void {
    this.gameOver = false;
    this.kills = 0;
    this.headshots = 0;
    this.rayGunUnlocked = false;
    this.teslaUnlocked = false;
    this.economy.reset();
    this.health.reset();
    this.rounds.reset();
    this.zombies.reset();
    // Fresh run: M1911 with 8 / 32, no box weapons, box back to closed.
    this.box?.reset();
    this.ctx.resetArsenal();
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
      points: this.economy.points,
    });
  }
}
