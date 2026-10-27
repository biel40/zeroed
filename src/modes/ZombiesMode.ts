import * as THREE from 'three';
import { t } from '../i18n/i18n';
import { actionKey, doorPrompt, wallBuyPrompt, weaponCaseLocked, weaponCasePrompt } from '../ui/InteractionPrompts';
import { ZOMBIE_MAPS, type ZombieMapId } from '../config/zombieMaps';
import type { MusicTrackName } from '../audio/MusicManager';
import { WEAPON_DEFINITIONS, ZOMBIES_WEAPON_PRELOAD } from '../config/weapons';
import { PlayerEconomy } from '../game/PlayerEconomy';
import { PlayerHealth } from '../game/PlayerHealth';
import { DeveloperCommand } from '../game/DeveloperCommand';
import { DeveloperConsoleCommands } from '../game/DeveloperConsoleCommands';
import type { HitTarget } from '../shooting/HitTarget';
import type { Weapon } from '../weapons/Weapon';
import type { EnergyWeaponConfig, WeaponId } from '../weapons/WeaponTypes';
import { Knife, knifeDamageForRound } from '../weapons/Knife';
import { KnifeCombat } from '../weapons/KnifeCombat';
import type { MeleeArmDriver } from '../weapons/ViewArms';
import { ChainLightning } from '../zombies/ChainLightning';
import { EnergyProjectiles } from '../zombies/EnergyProjectiles';
import { MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, MysteryBoxMachine } from '../zombies/MysteryBox';
import { mysteryBoxFootprint } from '../zombies/MysteryBoxFootprint';
import { MysteryBoxView } from '../zombies/MysteryBoxView';
import { RoundManager } from '../zombies/RoundManager';
import { Zombie } from '../zombies/Zombie';
import { ZOMBIE_TYPE_CONFIGS, type ZombieHitPart } from '../zombies/ZombieConfig';
import {
  CHAIN_ZAP_DAMAGE,
  PLAYER_HIT_INVULN,
  PLAYER_MAX_HP,
  PLAYER_REGEN_DELAY,
  PLAYER_REGEN_RATE,
  RAYGUN_UNLOCK_KILLS,
  ZOMBIE_ATTACK_DAMAGE,
  ZEUS_MACHINE_CHARGE_REACH,
  ZEUS_MACHINE_CHARGE_SECONDS,
  ZOMBIES_RESERVE_AMMO,
} from '../zombies/ZombieConfig';
import { ZombieFootsteps } from '../zombies/ZombieFootsteps';
import { ZombieManager } from '../zombies/ZombieManager';
import { dressZombieSources } from '../zombies/skins/ZombieSkinBuilder';
import type { ZombieKillSource } from '../zombies/ZombieDeath';
import { RITUAL_SCARE_TIMELINE } from '../zombies/secret-room/SecretRoomSystem';
import { WindowBarrier } from '../zombies/barriers/WindowBarrier';
import { PointDoor } from '../zombies/doors/PointDoor';
import type { WallBuy } from '../zombies/wallbuys/WallBuy';
import { hasSoulRitual, type ZombieArena } from '../zombies/maps/ZombieArena';
import type {
  ArenaAmmoRefill,
  ArenaCompletionInteraction,
  ArenaEnding,
  ArenaRitualInteraction,
  ArenaSoulLampInteraction,
  ArenaWeaponPickup,
  ArenaWeaponStation,
} from '../zombies/maps/ZombieArena';
import { ZombiesRunFlow } from '../zombies/ZombiesRunFlow';
import type { GameMode, ModeContext } from './GameMode';
import { ZombiesGasMask } from './ZombiesGasMask';
import { ZombiesPowerSwitch } from './ZombiesPowerSwitch';
import { ZombiesRings } from './ZombiesRings';
import { ZombiesFlames } from './ZombiesFlames';
import { ZombiesCrystalRecovery } from './ZombiesCrystalRecovery';
import { cameraSpatialCue, voicePoint, type SpatialCue } from '../audio/SpatialCue';
import { IntroCinematic } from '../rendering/IntroCinematic';
import { CodeLockDialog } from '../ui/CodeLockDialog';

/** Camera-shake tuning: how much one zombie hit rattles the view. */
const HIT_TRAUMA = 0.55;
const TRAUMA_DECAY = 2.1;
const SHAKE_MAX_ANGLE = 0.04;
/** Distant moans drift in every few seconds, never on a fixed rhythm. */
const MOAN_MIN_DELAY = 6;
const MOAN_SPREAD = 9;
/** A key still held from starting the run must not also skip its intro. */
const INTRO_SKIP_GUARD = 0.6;

/**
 * Zombies mode: infinite rounds, a hard-capped pooled horde, player HP with
 * brief post-hit invulnerability, game over / restart, and the mode-only
 * Ray Gun firing visible energy bolts with splash damage. The map registry
 * builds the arena (geometry, interactions, ambience and ending); the mode
 * owns the run and its progression.
 */
export class ZombiesMode implements GameMode {
  readonly id = 'zombies' as const;
  /** Every handout the mode can give is preloaded, the map's exclusives included: no loads mid-game. */
  readonly weaponIds: readonly WeaponId[];
  /** Zombies starts with the M1911 alone; better guns come from the box. */
  readonly startingInventory: readonly WeaponId[] = ['m1911'];
  /** Two-weapon carry limit, enforced by the shared inventory. */
  readonly maxWeapons = 2;

  /**
   * Every Zombies weapon runs a finite reserve (generous tier). The mode
   * table ZOMBIES_RESERVE_AMMO wins over the shared definition (so the
   * M1911 gets 64 in zombies while keeping 8/64 by definition); weapons
   * not listed — the Tesla — keep their definition reserve.
   */
  reserveAmmoFor(id: WeaponId): number | undefined {
    return ZOMBIES_RESERVE_AMMO[id] ?? WEAPON_DEFINITIONS[id].reserveAmmo;
  }

  private ctx!: ModeContext;
  private arena!: ZombieArena;
  private zombies!: ZombieManager;
  private energy!: EnergyProjectiles;
  private chain!: ChainLightning;
  private flames!: ZombiesFlames;
  private footsteps!: ZombieFootsteps;
  private box: MysteryBoxMachine | null = null;
  private boxView: MysteryBoxView | null = null;
  /** Ring purchases and effects; maps without ring machines simply never sell one. */
  private rings: ZombiesRings | null = null;
  /** The map's wearable gas mask; null on maps without one. */
  private gasMask: ZombiesGasMask | null = null;
  private powerSwitch: ZombiesPowerSwitch | null = null;
  private codeLockDialog: CodeLockDialog | null = null;
  private crystalRecoveries: ZombiesCrystalRecovery[] = [];
  private readonly rounds = new RoundManager();
  private readonly health = new PlayerHealth(
    PLAYER_MAX_HP,
    PLAYER_HIT_INVULN,
    PLAYER_REGEN_DELAY,
    PLAYER_REGEN_RATE,
  );
  /** Centralized Points wallet: every reward and purchase routes through it. */
  private readonly economy = new PlayerEconomy();
  private totalDamage = 0;
  private kills = 0;
  private headshots = 0;
  private rayGunUnlocked = false;
  private godModeEnabled = false;
  private readonly godModeCommand = new DeveloperCommand('MOTDRULES');
  private readonly developerCommands = new DeveloperConsoleCommands();
  private gameOver = false;
  /** Dead, but the game-over panel waits for the death fall to finish. */
  private gameOverPending = false;
  private readonly runFlow = new ZombiesRunFlow();
  /** The map's opening cinematic; played once, on the first gameplay start. */
  private intro: IntroCinematic | null = null;
  private introPlayed = false;
  /** Arena colliders currently registered in `ctx.hitColliders`. */
  private arenaStaticColliders = new Set<THREE.Object3D>();
  private trauma = 0;
  private shakeSeed = 0;
  private moanTimer = MOAN_MIN_DELAY;
  /** Barrier the player is currently repairing, if any. */
  private activeRepairBarrier: WindowBarrier | null = null;
  /** Reused by the box/door/barrier facing check; avoids per-frame allocation. */
  private readonly tmpDirection = new THREE.Vector3();
  private readonly tmpAudioPosition = new THREE.Vector3();
  private readonly knife = new Knife();
  private readonly knifeCombat = new KnifeCombat();

  constructor(readonly mapId: ZombieMapId = 'burned-mansion') {
    this.weaponIds = [...ZOMBIES_WEAPON_PRELOAD, ...ZOMBIE_MAPS[mapId].exclusiveWeapons];
  }

  /** The map's gameplay bed; Game starts it once the match begins. */
  get gameplayMusic(): MusicTrackName | null {
    return this.arena?.ambience.musicTrack ?? null;
  }

  init(ctx: ModeContext): void {
    this.ctx = ctx;

    this.arena = ZOMBIE_MAPS[this.mapId].createArena(ctx.scene, ctx.profile);

    this.arena.init();
    ctx.scene.add(this.arena.group);
    this.intro = this.arena.intro ? new IntroCinematic(this.arena.intro) : null;

    // The arena owns static ballistics geometry; zombies add dynamic hitboxes.
    ctx.hitColliders.length = 0;
    ctx.hitColliders.push(...this.arena.colliders);
    this.arenaStaticColliders = new Set(this.arena.colliders);

    this.zombies = new ZombieManager(
      Math.random,
      dressZombieSources(ctx.assets.getZombieModels(), { skins: this.arena.zombieSkins, eyes: this.arena.zombieEyes }),
      // Static shadow maps (mobile) must not have moving casters.
      !ctx.profile.useReducedEffects,
      this.arena.spawnPoints,
      this.arena.barriers,
      this.arena.floorTransitions,
    );
    this.zombies.setNavigationBounds(this.arena.navigationBounds);
    ctx.player.setBodyColliders(this.zombies.actives);
    const boxPlacement = this.arena.mysteryBoxPlacement;
    this.zombies.setBodyObstacles(boxPlacement ? [mysteryBoxFootprint(boxPlacement)] : []);
    this.zombies.registerColliders(ctx.hitColliders);
    this.zombies.setWallColliders(this.arena.wallColliders ?? []);
    this.zombies.onZombieKilled = (zombie, headshot, source, dropPosition) => {
      for (const recovery of this.crystalRecoveries) recovery.onKilled(zombie, dropPosition);
      this.onZombieKilled(
        headshot,
        { x: zombie.position.x, y: zombie.position.y, z: zombie.position.z },
        zombie.floor,
        source,
        ZOMBIE_TYPE_CONFIGS[zombie.typeId].killRewardMultiplier,
      );
    };
    this.zombies.onZombieDamaged = (damage) => { this.totalDamage += damage; };
    this.zombies.onPlayerAttack = (damage, _target, attacker) => this.onPlayerHit(damage, voicePoint(attacker.position));
    this.zombies.onZombieSpawned = (zombie) => ctx.audio.playZombieSpawn(this.spatialCueFor(voicePoint(zombie.position)));
    this.zombies.onZombieAttack = (zombie) =>
      ctx.audio.playZombieAttack(this.spatialCueFor(voicePoint(zombie.position)), zombie.typeId === 'brute');
    this.zombies.onBarrierImpact = (barrier) => ctx.audio.playBarrierBreak(
      this.spatialCueFor({ x: barrier.position.x, y: barrier.y, z: barrier.position.z }),
    );
    this.arena.onBarrierBoardRebuilt = () => ctx.audio.playRepairBoard();
    this.arena.onAmbientCue = (cue) => ctx.audio.playAmbientCue(cue, this.spatialCueFor(cue.position));
    ctx.scene.add(this.zombies.group);
    this.arena.onTopologyChanged = () => this.syncArenaTopology();
    if (hasSoulRitual(this.arena)) {
      this.arena.onSoulAbsorbed = (position) => ctx.audio.playSoulAbsorb(this.spatialCueFor(position));
      this.arena.onSoulLampCompleted = (position) => ctx.audio.playSoulLampComplete(this.spatialCueFor(position));
      this.arena.onSecretRoomUnlocked = (position) => ctx.audio.playSecretRoomUnlock(this.spatialCueFor(position));
      this.arena.onRitualScare = (position) =>
        ctx.audio.playRitualScare(this.spatialCueFor(position), RITUAL_SCARE_TIMELINE);
      this.arena.onRitualImpact = () => {
        this.trauma = 1;
      };
    }

    this.energy = new EnergyProjectiles(ctx.hitColliders, ctx.scene);
    this.energy.onImpact = (point, config, object, distance) =>
      this.onEnergyImpact(point, config, object, distance);
    this.chain = new ChainLightning(ctx.scene);
    this.flames = new ZombiesFlames(ctx, this.zombies, this.economy, () => this.arena.colliders,
      (id) => this.developerCommands.damageScale(id));
    this.footsteps = new ZombieFootsteps(ctx.scene, ctx.player.camera);
    this.knife.onSwing = () => ctx.audio.playKnifeSwing();
    this.knife.onImpact = () => this.applyKnifeImpact();
    ctx.player.camera.add(this.knife.root);

    this.rings = new ZombiesRings(ctx, this.arena.ringMachines ?? [], this.economy, this.health);
    this.gasMask = this.arena.gasMaskRack ? new ZombiesGasMask(ctx, this.arena.gasMaskRack) : null;
    this.powerSwitch = this.arena.powerSwitch ? new ZombiesPowerSwitch(ctx, this.arena.powerSwitch) : null;
    this.crystalRecoveries = (this.arena.weaponStations ?? [])
      .filter((station) => station.requiresStartupCrystal)
      .map((station) => new ZombiesCrystalRecovery(ctx, station));

    if (boxPlacement) {
      this.box = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING);
      this.boxView = new MysteryBoxView(ctx.assets, boxPlacement.position, MYSTERY_BOX_POOL);
      this.boxView.group.rotation.y = boxPlacement.yaw;
      ctx.scene.add(this.boxView.group);
    }

    // The arena owns where the player stands and how far they can move.
    ctx.player.setBounds(this.arena.playerBounds);
    if (this.arena.useWallCollision) {
      if (this.arena.wallColliders) ctx.player.setWallColliders(this.arena.wallColliders);
      if (this.arena.floorTransitions) ctx.player.setFloorTransitions(this.arena.floorTransitions);
    }
    this.placePlayerAtSpawn();

    ctx.hud.setZombiesPanelVisible(true);
    ctx.hud.setCreditsMainMenuHandler(() => this.finishRun());
    this.pushHudState();
  }

  update(dt: number): void {
    this.rings?.updateJingle(this.runAcceptsInput());
    // The view model must never survive a transition that stops gameplay.
    // Some of these states return before the normal end-of-swing cleanup.
    if (!this.isGameplayInputEnabled() && this.knife.enabled) this.knife.reset();
    if (this.runFlow.state === 'ENDING') {
      this.arena.update(dt, this.ctx.player?.rig.position);
      if (this.runFlow.update(dt)) {
        this.ctx.audio.stopEndingAudio();
        this.ctx.hud.showCredits();
      }
      return;
    }
    if (this.runFlow.state === 'CREDITS' || this.runFlow.state === 'FINISHED') return;
    this.updateIntro(dt);

    // The horde keeps shambling behind the game-over screen; it just can't
    // hurt anyone anymore.
    if (this.runAcceptsInput()) {
      this.health.update(dt);
      this.rounds.update(dt, this.zombies.aliveCount);
      this.processRoundEvents();
      this.updateRepair(dt);
      this.updateAmbience(dt);
    }

    const playerPos = this.ctx.player.rig.position;
    if (this.runAcceptsInput()) {
      for (const recovery of this.crystalRecoveries) recovery.update(dt, this.zombies.actives);
    }
    this.knife.setEnabled(this.knife.isAttacking);
    this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    this.zombies.update(
      dt,
      playerPos.x,
      playerPos.z,
      this.ctx.player.floor,
      playerPos.y,
      this.tmpDirection.x,
      this.tmpDirection.z,
    );
    this.knife.update(dt, false, this.ctx.player.speed01);
    if (!this.knife.isAttacking) this.knife.setEnabled(false);
    this.energy.update(dt);
    this.flames.update(dt, this.runAcceptsInput());
    for (const station of this.arena.weaponStations ?? []) station.setOwned(this.ctx.hasWeapon(station.weaponId));
    this.chain.update(dt);
    this.footsteps.update(dt, this.zombies.actives, this.ctx.audio.rawContext);
    this.arena.update(dt, playerPos);
    let objective: string | null = null;
    if (this.runAcceptsInput()) {
      for (const recovery of this.crystalRecoveries) {
        objective = recovery.objective();
        if (objective !== null) break;
      }
    }
    this.ctx.hud.setObjective?.(objective);
    if (this.box && this.boxView) {
      this.box.update(dt);
      this.boxView.update(dt, this.box);
      this.processBoxEvents();
    }
    this.rings?.update(dt);
    this.gasMask?.update(dt);
    this.updateCameraShake(dt);
    this.updateGameOverReveal();
    this.pushHudState();
  }

  onTargetHit(
    _target: HitTarget,
    distance: number,
    point: THREE.Vector3,
    _normal: THREE.Vector3,
    object: THREE.Object3D,
    weapon: Weapon,
  ): void {
    if (!this.runAcceptsInput()) return;
    const zombie = object.userData.zombie as Zombie | undefined;

    if (!zombie) return;

    const part = (object.userData.hitPart as ZombieHitPart | undefined) ?? 'torso';
    const headshot = part === 'head';
    this.ctx.stats.registerHit(distance);
    this.ctx.hud.showHitmarker(headshot);
    if (headshot) this.ctx.audio.playHeadshotHit();
    else this.ctx.audio.playZombieHit();
    this.ctx.effects.puff(point, 0x6e1d16, 0.2);
    const lethal = this.zombies.damageZombie(
      zombie,
      part,
      weapon.definition.damage * this.developerCommands.damageScale(weapon.definition.id),
      weapon.definition.id,
    );
    // A surviving headshot pays 150 here; lethal hits pay through the kill
    // callback instead, so a direct hit is rewarded exactly once.
    if (!lethal) this.economy.awardHit(headshot);
  }

  /** The Ray Gun bypasses hitscan ballistics and fires a visible bolt; a flame weapon scorches its cone. */
  onWeaponFired(weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    if (!this.runAcceptsInput()) return true;
    if (weapon.definition.flame) {
      this.flames.fire(weapon, origin, direction);
      return true;
    }
    const energy = weapon.definition.energy;
    if (!energy) return false;
    this.energy.fire(origin, direction, energy);
    return true;
  }

  /** The knife, or the hands putting the gas mask or a ring on, withhold fire and ADS. */
  usesFallbackAttack(): boolean {
    return this.isGameplayInputEnabled() && !!this.ctx
      && (this.knife.isAttacking || this.handsBusy());
  }

  getFallbackWeaponName(): string | null {
    return this.isGameplayInputEnabled() && !!this.ctx && this.knife.isAttacking ? t('hud.knife') : null;
  }

  getMeleeArm(): MeleeArmDriver | null {
    return this.knife.enabled ? this.knife : (this.gasMask?.armDriver ?? this.rings?.armDriver ?? null);
  }

  /** The hands are putting the gas mask or a new ring on. */
  private handsBusy(): boolean {
    return (this.gasMask?.isAnimating ?? false) || (this.rings?.isDonning ?? false);
  }

  public onMeleeAttack(): void {
    if (!this.isGameplayInputEnabled() || this.handsBusy()) return;
    this.knife.setEnabled(true);
    this.knife.trigger();
  }

  /** Resolve the visible slash against one unobstructed body in its frontal arc. */
  private applyKnifeImpact(): void {
    if (!this.usesFallbackAttack()) return;
    this.ctx.player.camera.updateWorldMatrix(true, false);
    this.zombies.group.updateMatrixWorld(true);
    this.ctx.player.camera.getWorldPosition(this.tmpAudioPosition);
    this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    const impact = this.knifeCombat.findImpact(
      this.tmpAudioPosition, this.tmpDirection, this.ctx.player.floor, this.ctx.hitColliders,
    );
    if (!impact) return;
    const zombie = impact.object.userData.zombie as Zombie | undefined;
    if (!zombie?.isAlive || zombie.floor !== this.ctx.player.floor) return;

    this.ctx.stats.registerHit(impact.distance);
    this.ctx.hud.showHitmarker();
    this.ctx.audio.playKnifeHit();
    this.ctx.effects.puff(impact.point, 0x6e1d16, 0.24);
    const damage = knifeDamageForRound(zombie.maxHp, this.rounds.round);
    const lethal = this.zombies.damageZombie(zombie, 'torso', damage, 'knife');
    if (!lethal) {
      this.economy.awardHit(false);
    }
  }

  /** The intro starts with the first gameplay frame, never on a resume. */
  onGameplayStarted(): void {
    if (!this.intro || this.introPlayed) return;
    this.introPlayed = true;
    const { presentation, duration } = this.intro.definition;
    this.intro.start(this.ctx.player.camera);
    this.arena.startIntro?.();
    this.ctx.hud.showIntro(presentation, duration, () => this.endIntro());
  }

  /** Pausing mid-intro skips it (the run resumes in first person) and silences the ring jingle. */
  onLocalPauseChanged(paused: boolean): void {
    if (!paused) return;
    this.endIntro();
    this.rings?.updateJingle(false);
  }

  /** While the intro plays, the shell renders its camera instead of the player's. */
  getCinematicCamera(): THREE.Camera | null {
    return this.intro?.isPlaying ? this.intro.camera : null;
  }

  /** Skip the pause screen while the game-over panel is up. */
  onPointerUnlock(): boolean {
    return !!this.codeLockDialog || this.gameOver || !this.runFlow.acceptsGameplay;
  }

  isSimulationPaused(): boolean { return this.codeLockDialog !== null; }

  onExit(): void {
    this.codeLockDialog?.dispose();
    this.codeLockDialog = null;
  }

  /** Shell gate for movement, weapons and interactions: closed while getting back up. */
  isGameplayInputEnabled(): boolean {
    return !this.codeLockDialog && this.runAcceptsInput() && !(this.rings?.isGettingUp ?? false);
  }

  /** Getting back up after a Resurrection ring: the player can look around, nothing else. */
  isDownedLookEnabled(): boolean {
    return this.rings?.isGettingUp ?? false;
  }

  /** The run itself is live: rounds, health, kills and hits keep resolving. */
  private runAcceptsInput(): boolean {
    return !this.gameOver && this.runFlow.acceptsGameplay && !this.intro?.isPlaying;
  }

  /** E pressed: door unlock > barrier repair > soul lamp > ritual > gas mask > power switch > purchases (rings among them). */
  onInteract(): void {
    if (!this.isGameplayInputEnabled()) return;

    const door = this.findFacingDoor();
    if (door && door.isLocked) {
      const result = door.tryUnlock((cost: number) => this.economy.spend(cost));
      if (result.success) {
        this.onDoorUnlocked(door);
      } else {
        this.ctx.hud.flashNotEnoughPoints();
        if (door.requiredMessage) this.ctx.hud.showRoundBanner(t(door.requiredMessage, { cost: door.cost }));
        else this.ctx.hud.showRoundBanner(t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost: result.cost }));
      }
      return;
    }

    // Repair is processed while USE is held in updateRepair(); consuming the
    // press here keeps activation priority identical to the visible prompt.
    const barrier = this.findRepairableBarrier();
    if (barrier && barrier.isDamaged) return;

    const soulLamp = this.findFacingSoulLamp();
    if (soulLamp) {
      soulLamp.activate();
      return;
    }

    const ritual = this.findFacingRitualCircle();
    if (ritual) {
      ritual.activate();
      return;
    }

    // Both need the right hand: the mask waits for the knife, or a ring going on, to finish.
    if (!this.knife.isAttacking && !(this.rings?.isDonning ?? false) && this.gasMask?.interact()) return;

    if (this.powerSwitch?.interact()) {
      for (const recovery of this.crystalRecoveries) recovery.update(0, this.zombies.actives);
      return;
    }
    for (const recovery of this.crystalRecoveries) if (recovery.pickUp()) return;

    const wallBuy = this.findFacingWallBuy();
    if (wallBuy) {
      this.purchaseWeaponOffer(wallBuy);
      return;
    }

    const station = this.findFacingWeaponStation();
    if (station) {
      const recovery = this.crystalRecoveries.find((entry) => entry.station.id === station.id);
      if (recovery?.interactAtStation()) return;
      // Unpowered, it waits silently: the prompt already says what is missing.
      if (station.powered && this.purchaseWeaponOffer(station)) station.activate();
      return;
    }

    const pickup = this.findFacingWeaponPickup();
    if (pickup) {
      if (pickup.codeLock?.locked) {
        const lock = pickup.codeLock;
        this.ctx.input.releaseAll();
        this.ctx.hud.setInteractionPrompt(null);
        this.codeLockDialog = new CodeLockDialog((code) => lock.unlock(code), () => {
          this.codeLockDialog = null;
          this.ctx.input.releaseAll();
          this.ctx.lockPointer();
        });
        this.ctx.unlockPointer();
        return;
      }
      if (weaponCaseLocked(pickup, this.kills)) {
        this.ctx.hud.showRoundBanner(weaponCasePrompt(pickup, this.kills, this.ctx.profile.useTouchControls));
        return;
      }
      if (!this.ctx.canGrantWeapon(pickup.weaponId)) {
        throw new Error(`Map pickup "${pickup.id}" references a weapon that is not preloaded`);
      }
      if (!this.economy.spend(pickup.cost)) {
        this.ctx.hud.flashNotEnoughPoints();
        this.ctx.hud.showRoundBanner(t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost: pickup.cost }));
        return;
      }
      if (this.ctx.grantWeapon(pickup.weaponId)) {
        pickup.claim();
        if (pickup.weaponId === 'raygun') this.rayGunUnlocked = true;
        this.ctx.audio.playMysteryBoxPickup();
        this.pushHudState();
      } else {
        throw new Error(`Map pickup "${pickup.id}" could not deliver after validation`);
      }
      return;
    }

    const ammoRefill = this.findFacingAmmoRefill();
    if (ammoRefill) {
      this.purchaseAmmoRefill(ammoRefill);
      return;
    }

    if (this.rings?.interact()) return;

    const completion = this.findFacingCompletionInteraction();
    if (completion) {
      if (!this.economy.canAfford(completion.cost)) {
        this.ctx.hud.flashNotEnoughPoints();
        this.ctx.hud.showRoundBanner(t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost: completion.cost }));
        return;
      }
      if (!this.runFlow.beginEnding(completion.ending.duration)) return;
      if (!this.economy.spend(completion.cost)) throw new Error('Completion purchase became unaffordable');
      this.beginEnding(completion.ending);
      return;
    }

    if (!this.box || !this.playerInBoxRange()) return;
    if (this.box.state === 'closed') {
      // Charge at activation time. spend() is atomic and tryActivate() only
      // fires from 'closed', so repeated E presses during the animation can
      // never double-charge: the box is no longer closed on the next press.
      if (!this.economy.spend(MYSTERY_BOX_TUNING.cost)) {
        this.ctx.hud.flashNotEnoughPoints();
        this.ctx.hud.showRoundBanner(t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost: MYSTERY_BOX_TUNING.cost }));
        return;
      }
      this.box.tryActivate(this.weaponIds.filter((id) => this.ctx.hasWeapon(id)));
      return;
    }
    if (this.box.state === 'awaitingPickup') {
      const id = this.box.tryPickup();
      if (id) this.ctx.grantWeapon(id);
    }
  }

  /** Center-screen prompt: door > barrier repair > wall buy > box. */
  getInteractPrompt(): string | null {
    if (!this.isGameplayInputEnabled()) return null;
    const touch = this.ctx.profile.useTouchControls;
    const key = actionKey(touch);

    const door = this.findFacingDoor();
    if (door && door.isLocked) return doorPrompt(door, touch);

    const barrier = this.findRepairableBarrier();
    if (barrier && barrier.isDamaged) {
      return t('prompt.repairBarricade', { key: actionKey(touch, true) });
    }

    const soulLamp = this.findFacingSoulLamp();
    if (soulLamp) return t('prompt.lightLamp', { key });

    const ritual = this.findFacingRitualCircle();
    if (ritual) return t('prompt.ritual', { key });

    const gasMaskPrompt = this.gasMask?.prompt();
    if (gasMaskPrompt) return gasMaskPrompt;

    const powerSwitchPrompt = this.powerSwitch?.prompt();
    if (powerSwitchPrompt) return powerSwitchPrompt;
    for (const recovery of this.crystalRecoveries) {
      const prompt = recovery.pickupPrompt();
      if (prompt) return prompt;
    }

    const wallBuy = this.findFacingWallBuy();
    if (wallBuy) {
      return wallBuyPrompt(WEAPON_DEFINITIONS[wallBuy.weaponId].name, this.ctx.hasWeapon(wallBuy.weaponId), wallBuy, touch);
    }

    const station = this.findFacingWeaponStation();
    if (station) {
      const recovery = this.crystalRecoveries.find((entry) => entry.station.id === station.id);
      if (recovery?.locked) return recovery.stationPrompt();
      const weapon = WEAPON_DEFINITIONS[station.weaponId].name;
      return station.powered
        ? wallBuyPrompt(weapon, this.ctx.hasWeapon(station.weaponId), station, touch, station.ammoPromptKey)
        : t('prompt.weaponNeedsPower', { weapon });
    }

    const pickup = this.findFacingWeaponPickup();
    if (pickup) return weaponCasePrompt(pickup, this.kills, this.ctx.profile.useTouchControls);

    const ammoRefill = this.findFacingAmmoRefill();
    if (ammoRefill) return t('prompt.pickup', { label: ammoRefill.interactionLabel, key });

    const ringPrompt = this.rings?.prompt();
    if (ringPrompt) return ringPrompt;

    const completion = this.findFacingCompletionInteraction();
    if (completion) return t('prompt.activateFinal', { key, cost: completion.cost });

    if (!this.box || !this.playerInBoxRange()) return null;
    switch (this.box.state) {
      case 'closed':
        return MYSTERY_BOX_TUNING.cost > 0
          ? t('prompt.mysteryBoxCost', { key, cost: MYSTERY_BOX_TUNING.cost })
          : t('prompt.mysteryBox', { key });
      case 'awaitingPickup': {
        const result = this.box.result;
        return result ? t('prompt.takeWeapon', { key, weapon: WEAPON_DEFINITIONS[result].name }) : null;
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
    const placement = this.arena.mysteryBoxPlacement;
    if (!placement) return false;
    if (placement.floor !== undefined && placement.floor !== this.ctx.player.floor) return false;
    const playerPos = this.ctx.player.rig.position;
    const boxPos = placement.position;
    const dx = boxPos.x - playerPos.x;
    const dz = boxPos.z - playerPos.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > placement.useRange * placement.useRange) return false;

    const camera = this.ctx.player.camera;
    const forward = camera.getWorldDirection(this.tmpDirection);
    const distance = Math.sqrt(distanceSq);
    if (distance < 1e-3) return true; // standing on top of it counts as facing
    const dot = (forward.x * dx + forward.z * dz) / distance;
    return dot >= placement.lookDotMin;
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
          this.ctx.audio.playMysteryBoxReveal(
            MYSTERY_BOX_POOL.some(
              (entry) => entry.weaponId === event.weaponId && entry.rarity !== 'standard',
            ),
          );
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

  private findFacingDoor(): PointDoor | null {
    if (!this.arena || this.arena.doors.length === 0) return null;
    const playerPos = this.ctx.player.rig.position;
    const camera = this.ctx.player.camera;
    const forward = camera.getWorldDirection(this.tmpDirection);

    let best: PointDoor | null = null;
    let bestDot = 0.6;
    for (const door of this.arena.doors) {
      if (!door.isLocked) continue;
      if (door.floor !== this.ctx.player.floor) continue;
      const dx = door.position.x - playerPos.x;
      const dz = door.position.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 2.5 * 2.5) continue;
      const distance = Math.sqrt(distSq);
      const dot = distance < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / distance;
      if (dot > bestDot) {
        bestDot = dot;
        best = door;
      }
    }
    return best;
  }

  private findFacingWallBuy(): WallBuy | null {
    if (!this.arena || this.arena.wallBuys.length === 0) return null;
    const playerPos = this.ctx.player.rig.position;
    const forward = this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    let best: WallBuy | null = null;
    let bestDot = -1;
    for (const wallBuy of this.arena.wallBuys) {
      if (wallBuy.floor !== this.ctx.player.floor) continue;
      const dx = wallBuy.position.x - playerPos.x;
      const dz = wallBuy.position.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > wallBuy.useRange * wallBuy.useRange) continue;
      const distance = Math.sqrt(distSq);
      const dot = distance < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / distance;
      if (dot >= wallBuy.lookDotMin && dot > bestDot) {
        bestDot = dot;
        best = wallBuy;
      }
    }
    return best;
  }

  private findFacingSoulLamp(): ArenaSoulLampInteraction | null {
    const lamps = this.arena?.soulLampInteractions ?? [];
    if (lamps.length === 0) return null;
    const playerPos = this.ctx.player.rig.position;
    const forward = this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    let best: ArenaSoulLampInteraction | null = null;
    let bestDot = -1;
    for (const lamp of lamps) {
      if (lamp.activated || lamp.floor !== this.ctx.player.floor) continue;
      const dx = lamp.position.x - playerPos.x;
      const dz = lamp.position.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > lamp.useRange * lamp.useRange) continue;
      const distance = Math.sqrt(distSq);
      const dot = distance < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / distance;
      if (dot >= lamp.lookDotMin && dot > bestDot) {
        bestDot = dot;
        best = lamp;
      }
    }
    return best;
  }

  private findFacingRitualCircle(): ArenaRitualInteraction | null {
    const ritual = this.arena?.ritualInteraction;
    if (!ritual?.available || ritual.floor !== this.ctx.player.floor) return null;
    const playerPos = this.ctx.player.rig.position;
    const dx = ritual.position.x - playerPos.x;
    const dz = ritual.position.z - playerPos.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > ritual.useRange * ritual.useRange) return null;
    const forward = this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    const distance = Math.sqrt(distanceSq);
    const dot = distance < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / distance;
    return dot >= ritual.lookDotMin ? ritual : null;
  }

  private findFacingWeaponPickup(): ArenaWeaponPickup | null {
    if (!this.arena) return null;
    const pickups = this.arena.weaponPickups ?? [];
    if (pickups.length === 0) return null;
    const playerPos = this.ctx.player.rig.position;
    const forward = this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    let best: ArenaWeaponPickup | null = null;
    let bestDot = -1;
    for (const pickup of pickups) {
      if (!pickup.available || pickup.floor !== this.ctx.player.floor) continue;
      if (pickup.requiredDoorId) {
        const door = this.arena.doors.find((candidate) => candidate.id === pickup.requiredDoorId);
        if (!door || door.isLocked) continue;
      }
      const dx = pickup.position.x - playerPos.x;
      const dz = pickup.position.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > pickup.useRange * pickup.useRange) continue;
      const distance = Math.sqrt(distSq);
      const dot = distance < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / distance;
      if (dot >= pickup.lookDotMin && dot > bestDot) {
        bestDot = dot;
        best = pickup;
      }
    }
    return best;
  }

  private findFacingWeaponStation(): ArenaWeaponStation | null {
    const stations = this.arena?.weaponStations ?? [];
    if (stations.length === 0) return null;
    const playerPos = this.ctx.player.rig.position;
    const forward = this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    let best: ArenaWeaponStation | null = null;
    let bestDot = -1;
    for (const station of stations) {
      if (station.floor !== this.ctx.player.floor) continue;
      const dx = station.position.x - playerPos.x;
      const dz = station.position.z - playerPos.z;
      const distance = Math.hypot(dx, dz);
      if (distance > station.useRange) continue;
      const dot = distance < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / distance;
      if (dot >= station.lookDotMin && dot > bestDot) {
        bestDot = dot;
        best = station;
      }
    }
    return best;
  }

  private findFacingAmmoRefill(): ArenaAmmoRefill | null {
    if (!this.arena) return null;
    const refills = this.arena.ammoRefills ?? [];
    if (refills.length === 0) return null;
    const playerPos = this.ctx.player.rig.position;
    const forward = this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    let best: ArenaAmmoRefill | null = null;
    let bestDot = -1;
    for (const refill of refills) {
      if (refill.floor !== this.ctx.player.floor) continue;
      const dx = refill.position.x - playerPos.x;
      const dz = refill.position.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > refill.useRange * refill.useRange) continue;
      const distance = Math.sqrt(distSq);
      const dot = distance < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / distance;
      if (dot >= refill.lookDotMin && dot > bestDot) {
        bestDot = dot;
        best = refill;
      }
    }
    return best;
  }

  private findFacingCompletionInteraction(): ArenaCompletionInteraction | null {
    const interaction = this.arena?.completionInteraction;
    if (!interaction || interaction.floor !== this.ctx.player.floor) return null;
    if (interaction.requiredDoorId) {
      const door = this.arena.doors.find((candidate) => candidate.id === interaction.requiredDoorId);
      if (!door || door.isLocked) return null;
    }
    const playerPos = this.ctx.player.rig.position;
    const dx = interaction.position.x - playerPos.x;
    const dz = interaction.position.z - playerPos.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq > interaction.useRange * interaction.useRange) return null;
    const forward = this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    const distance = Math.sqrt(distanceSq);
    const dot = distance < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / distance;
    return dot >= interaction.lookDotMin ? interaction : null;
  }

  /**
   * A weapon for sale on a wall buy or a weapon station: bought once, then
   * its ammunition refilled for its owner. Returns true when it delivered.
   */
  private purchaseWeaponOffer(
    offer: Pick<WallBuy, 'id' | 'weaponId' | 'price' | 'ammoPrice'> | ArenaWeaponStation,
  ): boolean {
    const owned = this.ctx.hasWeapon(offer.weaponId);
    if (!owned && !this.ctx.canGrantWeapon(offer.weaponId)) {
      throw new Error(`Weapon offer "${offer.id}" references a weapon that is not preloaded`);
    }
    if (owned && !this.ctx.canRefillWeaponAmmo(offer.weaponId)) {
      this.ctx.hud.showRoundBanner(t('banner.ammoFull'), WEAPON_DEFINITIONS[offer.weaponId].name);
      return false;
    }
    const cost = owned ? offer.ammoPrice : offer.price;
    if (!this.economy.spend(cost)) {
      this.ctx.hud.flashNotEnoughPoints();
      this.ctx.hud.showRoundBanner(t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost }));
      return false;
    }
    const delivered = owned
      ? this.ctx.refillWeaponAmmo(offer.weaponId)
      : this.ctx.grantWeapon(offer.weaponId);
    if (!delivered) throw new Error(`Weapon offer "${offer.id}" could not deliver after validation`);
    this.pushHudState();
    return true;
  }

  private purchaseAmmoRefill(refill: ArenaAmmoRefill): void {
    if (!this.ctx.canRefillEquippedWeaponAmmo()) {
      this.ctx.hud.showRoundBanner(t('banner.ammoFull'));
      return;
    }
    if (!this.economy.spend(refill.cost)) {
      this.ctx.hud.flashNotEnoughPoints();
      this.ctx.hud.showRoundBanner(t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost: refill.cost }));
      return;
    }
    if (!this.ctx.refillEquippedWeaponAmmo()) {
      throw new Error(`Ammo refill "${refill.id}" could not deliver after validation`);
    }
    refill.activate();
    this.ctx.audio.playMysteryBoxPickup();
    this.pushHudState();
  }

  private findRepairableBarrier(): WindowBarrier | null {
    if (!this.arena || this.arena.barriers.length === 0) return null;
    const playerPos = this.ctx.player.rig.position;
    const camera = this.ctx.player.camera;
    const forward = camera.getWorldDirection(this.tmpDirection);

    let best: WindowBarrier | null = null;
    let bestDot = 0.45;
    for (const barrier of this.arena.barriers) {
      if (!barrier.isDamaged) continue;
      if (barrier.floor !== this.ctx.player.floor) continue;
      const dx = barrier.position.x - playerPos.x;
      const dz = barrier.position.z - playerPos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 2.2 * 2.2) continue;
      const distance = Math.sqrt(distSq);
      const dot = distance < 1e-3 ? 1 : (forward.x * dx + forward.z * dz) / distance;
      if (dot > bestDot) {
        bestDot = dot;
        best = barrier;
      }
    }
    return best;
  }

  private updateRepair(dt: number): void {
    const input = this.ctx.input;
    const interacting = input.isDown('KeyE');

    // Cancel repair on fire, weapon swap, or if the held button was released.
    const cancel =
      !interacting ||
      input.leftButtonDown ||
      input.wasPressed('Digit1') ||
      input.wasPressed('Digit2') ||
      input.wasPressed('TouchFire');

    if (cancel) {
      if (this.activeRepairBarrier) {
        this.activeRepairBarrier.stopRepair();
        this.activeRepairBarrier = null;
      }
      return;
    }

    const barrier = this.findRepairableBarrier();
    if (!barrier) {
      this.activeRepairBarrier?.stopRepair();
      this.activeRepairBarrier = null;
      return;
    }

    if (this.activeRepairBarrier && this.activeRepairBarrier !== barrier) {
      this.activeRepairBarrier.stopRepair();
    }

    this.activeRepairBarrier = barrier;

    const result = barrier.repair(dt);
    for (let i = 0; i < result.rewardableBoards; i++) {
      this.economy.awardRepair();
    }
  }

  private onDoorUnlocked(door: PointDoor): void {
    this.ctx.audio.playDoorUnlock();
    // The arena reports the new layout through onTopologyChanged.
    this.arena.activateDoor(door.id);
  }

  private syncArenaTopology(): void {
    this.arena.refreshSpawnPoints();
    this.arena.refreshColliders();
    // Remove only old static map objects: live zombie hitboxes share this array.
    for (let index = this.ctx.hitColliders.length - 1; index >= 0; index--) {
      if (this.arenaStaticColliders.has(this.ctx.hitColliders[index])) {
        this.ctx.hitColliders.splice(index, 1);
      }
    }
    this.ctx.hitColliders.push(...this.arena.colliders);
    this.arenaStaticColliders = new Set(this.arena.colliders);
    if (this.arena.wallColliders) this.ctx.player.setWallColliders(this.arena.wallColliders);
    this.zombies.setSpawnPoints(this.arena.spawnPoints);
    this.zombies.setBarriers(this.arena.barriers);
    this.zombies.registerColliders(this.ctx.hitColliders);
    this.zombies.setWallColliders(this.arena.wallColliders ?? []);
  }

  private processRoundEvents(): void {
    const playerPos = this.ctx.player.rig.position;
    for (const event of this.rounds.pendingEvents) {
      switch (event.type) {
        case 'roundStarted':
          this.ctx.hud.showRoundBanner(t('banner.round', { round: event.round }));
          this.ctx.audio.playRoundSting();
          this.ctx.audio.music.playRoundStartOnce();
          if (this.arena) {
            for (const barrier of this.arena.barriers) barrier.resetRoundCap();
          }
          break;
        case 'spawnDue':
          if (
            this.zombies &&
            !this.zombies.spawnZombie(event.config, playerPos.x, playerPos.z, event.round)
          ) {
            // Corpses still occupy pool slots and invalid map spawns are
            // rejected. Neither case may silently shorten the round.
            this.rounds.requeueSpawn();
          }
          break;
        case 'roundComplete':
          this.ctx.hud.showRoundBanner(t('banner.roundComplete', { round: event.round }));
          break;
      }
    }

    this.rounds.clearEvents();
  }

  private onZombieKilled(
    headshot: boolean,
    deathPosition?: { readonly x: number; readonly y: number; readonly z: number },
    floor?: number,
    source?: ZombieKillSource,
    rewardMultiplier = 1,
  ): void {
    if (!this.runAcceptsInput()) return;
    this.kills++;
    for (const pickup of this.arena?.weaponPickups ?? []) pickup.setKillProgress?.(this.kills);

    if (headshot) {
      this.headshots++;
    }

    // A lethal headshot already has a strong dedicated impact. Layering the
    // generic death growl at the same instant masks its short crack.
    if (source === 'raygun') {
      this.ctx.audio.playRayVaporize?.();
    } else if (source === 'barrett') {
      this.ctx.audio.playZombieShatter();
    } else if (source === 'fakel') {
      this.ctx.audio.playZombieIncinerate();
    } else if (!headshot) {
      this.ctx.audio.playZombieDeath();
    }

    // Rewards are mutually exclusive: the risky knife finisher beats a
    // headshot, and neither stacks with the ordinary kill payout.
    if (source === 'knife') this.economy.awardKnifeKill(rewardMultiplier);
    else this.economy.awardKill(headshot, rewardMultiplier);
    if (deathPosition && floor !== undefined && hasSoulRitual(this.arena)) {
      this.arena.captureSoul(deathPosition, floor);
    }
    if (!this.rayGunUnlocked && this.kills >= RAYGUN_UNLOCK_KILLS) {
      this.unlockRayGun();
    }
  }

  private spatialCueFor(position: { readonly x: number; readonly y: number; readonly z: number }): SpatialCue {
    return cameraSpatialCue(this.ctx.player.camera, position);
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
    this.ctx.hud.showRoundBanner(t('banner.raygunUnlocked'), t('banner.kills', { kills: RAYGUN_UNLOCK_KILLS }));
    this.ctx.audio.playMysteryBoxReveal(true);
  }

  public onKeyInput(key: string): void {
    if (this.intro?.isPlaying) {
      if (this.intro.time >= INTRO_SKIP_GUARD) this.endIntro();
      return;
    }
    if (!this.godModeEnabled && this.godModeCommand.push(key)) this.activateGodMode();
  }

  private activateGodMode(): void {
    this.godModeEnabled = true;
    this.rayGunUnlocked = true;
    this.health.setInvincible(true);
    this.economy.setUnlimitedSpending(true);
    if (hasSoulRitual(this.arena)) this.arena.unlockSecretRoom();
    this.ctx.grantWeapon('raygun');
    this.ctx.setWeaponInfiniteReserve('raygun');
    this.ctx.grantWeapon('tesla');
    this.ctx.setWeaponInfiniteReserve('tesla');
    this.ctx.hud.showRoundBanner(t('banner.godMode'), t('dev.hint'));
    this.ctx.audio.playTeslaUnlock();
  }

  isDeveloperConsoleEnabled(): boolean {
    return this.godModeEnabled && this.runAcceptsInput();
  }

  executeDeveloperCommand(line: string): string {
    if (!this.isDeveloperConsoleEnabled()) return t('dev.unavailable');
    return this.developerCommands.execute(line, {
      equip: (id) => this.ctx.grantWeapon(id, true),
      ring: (id) => {
        if (!this.rings) return false;
        this.rings.grant(id);
        return true;
      },
      refill: () => this.ctx.refillEquippedWeaponAmmo(),
      infiniteAmmo: () => { this.ctx.setWeaponInfiniteReserve(this.ctx.getEquippedWeaponId()); },
      equipped: () => this.ctx.getEquippedWeaponId(),
      invincible: (enabled) => this.health.setInvincible(enabled),
    });
  }

  private onPlayerHit(damage: number, from?: { readonly x: number; readonly y: number; readonly z: number }): void {
    if (!this.runAcceptsInput()) return;
    if (!this.health.damage(damage)) return;
    this.ctx.audio.playPlayerHurt(from && this.spatialCueFor(from));
    this.ctx.hud.flashDamage();
    // Trauma-based shake: offsets pile up and decay smoothly.
    this.trauma = Math.min(1, this.trauma + HIT_TRAUMA);
    if (!this.health.isDead) return;
    // A charged Resurrection ring takes the death instead: the run goes on,
    // and the horde ignores the player for as long as they are protected.
    const protectedFor = this.rings?.tryResurrect(this.health) ?? null;
    if (protectedFor === null) {
      this.endGame();
      return;
    }
    this.trauma = 1;
    this.zombies.ignoreHost(protectedFor);
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
      // Moans come from a real zombie, so the ambience doubles as a radar.
      const moaner = this.randomLivingZombie();
      if (moaner) this.ctx.audio.playDistantMoan(this.spatialCueFor(voicePoint(moaner.position)));
    }
  }

  private randomLivingZombie(): Zombie | null {
    const living = [...this.zombies.actives].filter((zombie) => zombie.isAlive);
    return living.length > 0 ? living[Math.floor(Math.random() * living.length)] : null;
  }

  private onEnergyImpact(
    point: THREE.Vector3,
    config: EnergyWeaponConfig,
    object: THREE.Object3D | null,
    distance: number,
  ): void {
    if (!this.runAcceptsInput()) return;
    const zombie = object?.userData.zombie as Zombie | undefined;
    const isTesla = config.color === WEAPON_DEFINITIONS.tesla.energy?.color;

    // Tesla: electric discharge that chains to nearby zombies. No splash;
    // the damage travels zombie-to-zombie, which is the whole point.
    if (isTesla && zombie && zombie.isAlive) {
      this.ctx.audio.playTeslaShot();
      this.ctx.stats.registerHit(distance);
      const part = (object?.userData.hitPart as ZombieHitPart | undefined) ?? 'torso';
      const headshot = part === 'head';
      this.ctx.hud.showHitmarker(headshot);
      if (headshot) this.ctx.audio.playHeadshotHit();
      const chain = this.zombies.applyChainLightning(zombie,
        CHAIN_ZAP_DAMAGE * this.developerCommands.damageScale('tesla'), part);
      if (headshot && zombie.isAlive) this.economy.awardHit(true);
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

    // A Tesla bolt that strikes the environment grounds out: an electric
    // crack, no chain (the design chains zombie-to-zombie, never from dirt).
    // Grounded into a ring machine waiting for power, it runs it for a while.
    if (isTesla) {
      this.ctx.audio.playTeslaShot();
      const machine = this.rings?.energizeMachineAt(point, ZEUS_MACHINE_CHARGE_SECONDS, ZEUS_MACHINE_CHARGE_REACH);
      if (machine) {
        const muzzle = this.ctx.player.camera.getWorldPosition(this.tmpDirection);
        const { x, y, z } = machine.position;
        this.chain.discharge([muzzle.clone(), new THREE.Vector3(x, y, z)]);
        this.ctx.audio.playTeslaChain(1);
      }
      return;
    }

    this.ctx.audio.playRayImpact();

    const raygun = WEAPON_DEFINITIONS.raygun;
    if (zombie && zombie.isAlive) {
      const part = (object?.userData.hitPart as ZombieHitPart | undefined) ?? 'torso';
      const headshot = part === 'head';
      this.ctx.stats.registerHit(distance);
      this.ctx.hud.showHitmarker(headshot);
      if (headshot) this.ctx.audio.playHeadshotHit();
      const lethal = this.zombies.damageZombie(zombie, part,
        raygun.damage * this.developerCommands.damageScale('raygun'), 'raygun');
      if (!lethal) this.economy.awardHit(headshot);
    }
    // Splash includes the directly-hit zombie: the Ray Gun fantasy is that
    // a bullseye on a packed horde is devastating.
    this.zombies.applySplash(point, config.splashRadius,
      config.splashDamage * this.developerCommands.damageScale('raygun'));
  }

  /** Death: the body collapses in first person; the verdict waits for the fall to land. */
  private endGame(): void {
    if (!this.runFlow.gameOver()) return;
    this.gameOver = true;
    this.gameOverPending = true;
    if (typeof this.ctx.audio.stopMusic === 'function') this.ctx.audio.stopMusic();
    else this.ctx.audio.music?.stop?.();
    this.ctx.player.playDeathFall();
    this.ctx.hud.showDeathFilter();
  }

  private updateGameOverReveal(): void {
    if (!this.gameOverPending || !this.ctx.player.deathFallFinished) return;
    this.gameOverPending = false;
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
    this.onExit();
    this.endIntro();
    this.gameOver = false;
    this.gameOverPending = false;
    this.runFlow.reset();
    this.totalDamage = 0;
    this.kills = 0;
    this.headshots = 0;
    this.rayGunUnlocked = false;
    this.godModeEnabled = false;
    this.developerCommands.reset();
    this.godModeCommand.reset();
    this.economy.reset();
    this.health.reset();
    this.rings?.reset();
    this.gasMask?.reset();
    this.rounds.reset();
    this.energy?.reset();
    this.flames?.reset();
    for (const recovery of this.crystalRecoveries) recovery.reset();
    this.ctx.hud.setObjective?.(null);
    if (this.zombies) this.zombies.reset();
    this.footsteps?.reset();
    if (this.arena) {
      this.arena.reset();
      this.syncArenaTopology();
    }
    this.activeRepairBarrier = null;
    this.knife.reset();
    if (typeof this.ctx.audio.stopMusic === 'function') this.ctx.audio.stopMusic();
    else this.ctx.audio.music?.stop?.();
    // Fresh run: M1911 with 8 / 32, no box weapons, box back to closed.
    this.box?.reset();
    this.ctx.resetArsenal();
    if (this.arena && this.ctx.player) this.placePlayerAtSpawn();
    this.ctx.hud.hideGameOver();
    this.ctx.hud.hideEnding?.();
    this.ctx.hud.setHudVisible?.(true);
    this.pushHudState();
    this.ctx.lockPointer();
  }

  private updateIntro(dt: number): void {
    if (!this.intro?.isPlaying) return;
    if (this.intro.update(dt, this.ctx.player.camera)) this.handOverFromIntro();
  }

  /** Skip, pause or restart: cuts a playing intro straight to first person. */
  private endIntro(): void {
    if (!this.intro?.isPlaying) return;
    this.intro.stop();
    this.handOverFromIntro();
  }

  private handOverFromIntro(): void {
    this.arena.finishIntro?.();
    this.ctx.hud.hideIntro();
  }

  private placePlayerAtSpawn(): void {
    const spawn = this.arena.playerSpawn;
    this.ctx.player.teleport(spawn.x, spawn.y, spawn.z, spawn.floor, this.arena.playerBounds);
  }

  private beginEnding(ending: ArenaEnding): void {
    this.activeRepairBarrier?.stopRepair();
    this.activeRepairBarrier = null;
    this.knife.reset();
    this.rounds.clearEvents();
    this.zombies.reset();
    if (typeof this.ctx.audio.stopMusic === 'function') this.ctx.audio.stopMusic();
    else this.ctx.audio.music?.stop?.();
    this.ctx.audio.stopWind?.();
    this.ctx.audio.startEndingAudio(ending.audio);
    this.ctx.hud.setInteractionPrompt(null);
    this.pushHudState();
    this.ctx.hud.showEnding(this.rounds.round, ending.presentation);
    this.ctx.unlockPointer();
  }

  private finishRun(): void {
    if (!this.runFlow.finish()) return;
    this.ctx.returnToMainMenu();
  }

  private pushHudState(): void {
    this.ctx.hud.updateZombies({
      round: this.rounds.round,
      hp: this.health.hp,
      maxHp: this.health.maxHp,
      lethalHitDamage: ZOMBIE_ATTACK_DAMAGE,
      kills: this.kills,
      headshots: this.headshots,
      points: this.economy.points,
      totalPoints: this.economy.totalEarned,
      totalDamage: this.totalDamage,
      lamps: (this.arena?.soulLampInteractions ?? []).map((lamp) => lamp.completed),
    });
  }
}
