import * as THREE from 'three';
import type { ZombieMapId } from '../config/zombieMaps';
import { WEAPON_DEFINITIONS, ZOMBIES_WEAPON_PRELOAD } from '../config/weapons';
import { PlayerEconomy } from '../game/PlayerEconomy';
import { PlayerHealth } from '../game/PlayerHealth';
import { DeveloperCommand } from '../game/DeveloperCommand';
import type { HitTarget } from '../shooting/HitTarget';
import type { Weapon } from '../weapons/Weapon';
import type { EnergyWeaponConfig, WeaponId } from '../weapons/WeaponTypes';
import { KNIFE_RANGE, Knife, knifeDamageForRound } from '../weapons/Knife';
import { ChainLightning } from '../zombies/ChainLightning';
import { EnergyProjectiles } from '../zombies/EnergyProjectiles';
import { MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, MysteryBoxMachine } from '../zombies/MysteryBox';
import { MysteryBoxView } from '../zombies/MysteryBoxView';
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
  ZOMBIE_ATTACK_DAMAGE,
  ZOMBIES_RESERVE_AMMO,
} from '../zombies/ZombieConfig';
import { ZombieFootsteps } from '../zombies/ZombieFootsteps';
import { ZombieManager, type ZombieKillSource } from '../zombies/ZombieManager';
import { BurnedMansionArena } from '../zombies/maps/BurnedMansionArena';
import { WindowBarrier } from '../zombies/barriers/WindowBarrier';
import { PointDoor } from '../zombies/doors/PointDoor';
import type { WallBuy } from '../zombies/wallbuys/WallBuy';
import { ClassicArena } from '../zombies/maps/ClassicArena';
import type { ZombieArena } from '../zombies/maps/ZombieArena';
import type {
  ArenaAmmoRefill,
  ArenaRitualInteraction,
  ArenaSoulLampInteraction,
  ArenaWeaponPickup,
} from '../zombies/maps/ZombieArena';
import type { ArenaCompletionInteraction } from '../zombies/maps/ZombieArena';
import { ZombiesRunFlow } from '../zombies/ZombiesRunFlow';
import type { GameMode, ModeContext } from './GameMode';
import { standardTargetHitEffects } from './hitEffects';

/** Camera-shake tuning: how much one zombie hit rattles the view. */
const HIT_TRAUMA = 0.55;
const TRAUMA_DECAY = 2.1;
const SHAKE_MAX_ANGLE = 0.04;
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
   * M1911 gets 64 in zombies while keeping 8/64 by definition); weapons
   * not listed — the Tesla — keep their definition reserve. The range
   * never calls this — it stays bottomless.
   */
  reserveAmmoFor(id: WeaponId): number | undefined {
    return ZOMBIES_RESERVE_AMMO[id] ?? WEAPON_DEFINITIONS[id].reserveAmmo;
  }

  private ctx!: ModeContext;
  private arena!: ZombieArena;
  private zombies!: ZombieManager;
  private energy!: EnergyProjectiles;
  private chain!: ChainLightning;
  private footsteps!: ZombieFootsteps;
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
  private godModeEnabled = false;
  private readonly godModeCommand = new DeveloperCommand('MOTDRULES');
  private gameOver = false;
  private readonly runFlow = new ZombiesRunFlow();
  private mansionStaticColliders = new Set<THREE.Object3D>();
  private trauma = 0;
  private shakeSeed = 0;
  private moanTimer = MOAN_MIN_DELAY;
  /** Barrier the player is currently repairing, if any. */
  private activeRepairBarrier: WindowBarrier | null = null;
  /** Reused by the box/door/barrier facing check; avoids per-frame allocation. */
  private readonly tmpDirection = new THREE.Vector3();
  private readonly tmpAudioPosition = new THREE.Vector3();
  private readonly knife = new Knife();
  private readonly knifeRaycaster = new THREE.Raycaster();

  constructor(private readonly mapId: ZombieMapId = 'classic') { }

  init(ctx: ModeContext): void {
    this.ctx = ctx;

    if (this.mapId === 'burned-mansion') {
      // Hide the default sunny range; the mansion brings its own geometry.
      ctx.range.group.visible = false;
      this.arena = new BurnedMansionArena(ctx.scene, ctx.profile);
    } else {
      this.arena = new ClassicArena(ctx.range, ctx.scene, ctx.setExposure, ctx.profile);
    }

    this.arena.init();
    ctx.scene.add(this.arena.group);

    // Replace ballistics colliders with the arena's geometry. For the classic
    // map this is equivalent to the range colliders; for the mansion it swaps
    // in the mansion walls.
    ctx.hitColliders.length = 0;
    ctx.hitColliders.push(...this.arena.colliders);
    this.mansionStaticColliders = new Set(this.arena.colliders);

    this.zombies = new ZombieManager(
      Math.random,
      ctx.assets.getZombieModels(),
      // Static shadow maps (mobile) must not have moving casters.
      !ctx.profile.useReducedEffects,
      this.arena.spawnPoints,
      this.arena.barriers,
      this.arena.floorTransitions,
    );
    this.zombies.setNavigationBounds(this.arena.navigationBounds);
    this.zombies.registerColliders(ctx.hitColliders);
    this.zombies.setNavigationDebug(new URLSearchParams(window.location.search).has('zombieNavDebug'));
    this.zombies.onZombieKilled = (zombie, headshot, source) => this.onZombieKilled(
      headshot,
      { x: zombie.position.x, y: zombie.position.y, z: zombie.position.z },
      zombie.floor,
      source,
    );
    this.zombies.onPlayerAttack = (damage) => this.onPlayerHit(damage);
    this.zombies.onBruteAttack = () => ctx.audio.playBruteRoar();
    this.zombies.onBarrierImpact = () => ctx.audio.playBarrierBreak();
    this.arena.onBarrierBoardRebuilt = () => ctx.audio.playRepairBoard();
    ctx.scene.add(this.zombies.group);
    if (this.arena instanceof BurnedMansionArena) {
      this.arena.onTopologyChanged = () => this.syncMansionArena(this.mansionStaticColliders);
      this.arena.onSoulAbsorbed = (position) => {
        const spatial = this.spatialCueFor(position);
        ctx.audio.playSoulAbsorb(spatial.pan, spatial.attenuation);
      };
      this.arena.onSoulLampCompleted = (position) => {
        const spatial = this.spatialCueFor(position);
        ctx.audio.playSoulLampComplete(spatial.pan, spatial.attenuation);
      };
      this.arena.onSecretRoomUnlocked = (position) => {
        const spatial = this.spatialCueFor(position);
        ctx.audio.playSecretRoomUnlock(spatial.pan, spatial.attenuation);
        ctx.hud.showRoundBanner('A HIDDEN CHAMBER OPENS');
      };
      this.arena.onRitualScare = (position) => {
        const spatial = this.spatialCueFor(position);
        ctx.audio.playRitualScare(spatial.pan, spatial.attenuation);
      };
    }

    this.energy = new EnergyProjectiles(ctx.hitColliders, ctx.scene);
    this.energy.onImpact = (point, config, object, distance) =>
      this.onEnergyImpact(point, config, object, distance);
    this.chain = new ChainLightning(ctx.scene);
    this.footsteps = new ZombieFootsteps(ctx.scene, ctx.player.camera);
    this.knife.onSwing = () => ctx.audio.playKnifeSwing();
    this.knife.onImpact = () => this.applyKnifeImpact();
    ctx.player.camera.add(this.knife.root);

    if (this.mapId === 'classic') {
      ctx.audio.startWind();
    }

    // The Mystery Box: main weapon progression, exclusive to this mode.
    this.box = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING);
    this.boxView = new MysteryBoxView(
      ctx.assets,
      this.arena.mysteryBoxPlacement.position,
      MYSTERY_BOX_POOL,
    );
    this.boxView.group.rotation.y = this.arena.mysteryBoxPlacement.yaw;
    ctx.scene.add(this.boxView.group);

    // Player wall collision / floor transitions for the mansion.
    if (this.arena.useWallCollision) {
      if (this.arena.playerBounds) ctx.player.setBounds(this.arena.playerBounds);
      if (this.arena.wallColliders) ctx.player.setWallColliders(this.arena.wallColliders);
      if (this.arena.floorTransitions) ctx.player.setFloorTransitions(this.arena.floorTransitions);
      const spawn = this.arena.playerSpawn ?? { x: 0, y: 1.7, z: 0, floor: 0 };
      ctx.player.teleport(spawn.x, spawn.y, spawn.z, spawn.floor, this.arena.playerBounds);
    }

    ctx.hud.setZombiesPanelVisible(true);
    ctx.hud.setZombiesRestartHandler(() => this.restart());
    ctx.hud.setCreditsMainMenuHandler(() => this.finishRun());
    this.pushHudState();
  }

  update(dt: number): void {
    // The view model must never survive a transition that stops gameplay.
    // Some of these states return before the normal end-of-swing cleanup.
    if (!this.isGameplayInputEnabled() && this.knife.enabled) this.knife.reset();
    if (this.runFlow.state === 'ENDING') {
      this.arena.update(dt, this.ctx.player?.rig.position);
      if (this.runFlow.update(dt)) this.ctx.hud.showCredits();
      return;
    }
    if (this.runFlow.state === 'CREDITS' || this.runFlow.state === 'FINISHED') return;

    // The horde keeps shambling behind the game-over screen; it just can't
    // hurt anyone anymore.
    if (this.isGameplayInputEnabled()) {
      this.health.update(dt);
      this.rounds.update(dt, this.zombies.aliveCount);
      this.processRoundEvents();
      this.updateRepair(dt);
      this.updateAmbience(dt);
    }

    const playerPos = this.ctx.player.rig.position;
    const fallbackOnly = this.isGameplayInputEnabled() && !this.ctx.hasUsableWeapon();
    const knifeEnabled = fallbackOnly || this.knife.isAttacking;
    this.knife.setEnabled(knifeEnabled);
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
    this.knife.update(dt, fallbackOnly && this.ctx.input.leftButtonDown, this.ctx.player.speed01);
    if (!fallbackOnly && !this.knife.isAttacking) this.knife.setEnabled(false);
    this.energy.update(dt);
    this.chain.update(dt);
    this.footsteps.update(dt, this.zombies.actives, this.ctx.audio.rawContext);
    this.arena.update(dt, playerPos);
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
    if (!this.isGameplayInputEnabled()) return;
    const zombie = object.userData.zombie as Zombie | undefined;

    // Range props stay decorative and keep their classic feedback.
    if (!zombie) {
      this.ctx.stats.registerHit(distance);
      this.ctx.hud.showHitmarker();
      standardTargetHitEffects(this.ctx.audio, this.ctx.effects, target, point, normal, object);
      return;
    }

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
      weapon.definition.damage,
    );
    // A surviving headshot pays 150 here; lethal hits pay through the kill
    // callback instead, so a direct hit is rewarded exactly once.
    if (!lethal) this.economy.awardHit(headshot);
  }

  /** The Ray Gun bypasses hitscan ballistics and fires a visible bolt. */
  onWeaponFired(weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    if (!this.isGameplayInputEnabled()) return true;
    const energy = weapon.definition.energy;
    if (!energy) return false;
    this.energy.fire(origin, direction, energy);
    return true;
  }

  usesFallbackAttack(): boolean {
    return this.isGameplayInputEnabled() && !!this.ctx
      && (!this.ctx.hasUsableWeapon() || this.knife.isAttacking);
  }

  getFallbackWeaponName(): string | null {
    return this.usesFallbackAttack() ? 'KNIFE' : null;
  }

  public onMeleeAttack(): void {
    if (!this.isGameplayInputEnabled()) return;
    this.knife.setEnabled(true);
    this.knife.trigger();
  }

  /** The center ray gives melee the same occlusion rules as firearms: a wall
   * or a nearer zombie consumes the first contact before anything behind it. */
  private applyKnifeImpact(): void {
    if (!this.usesFallbackAttack()) return;
    this.ctx.player.camera.updateWorldMatrix(true, false);
    this.zombies.group.updateMatrixWorld(true);
    this.ctx.player.camera.getWorldPosition(this.tmpAudioPosition);
    this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    this.knifeRaycaster.set(this.tmpAudioPosition, this.tmpDirection);
    this.knifeRaycaster.near = 0;
    this.knifeRaycaster.far = KNIFE_RANGE;
    const impact = this.knifeRaycaster.intersectObjects(this.ctx.hitColliders, false)[0];
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

  /** Skip the pause screen while the game-over panel is up. */
  onPointerUnlock(): boolean {
    return this.gameOver || !this.runFlow.acceptsGameplay;
  }

  isGameplayInputEnabled(): boolean {
    return !this.gameOver && this.runFlow.acceptsGameplay;
  }

  /** E pressed: door unlock > barrier repair > soul lamp > purchases. */
  onInteract(): void {
    if (!this.isGameplayInputEnabled()) return;

    const door = this.findFacingDoor();
    if (door && door.isLocked) {
      const result = door.tryUnlock((cost: number) => this.economy.spend(cost));
      if (result.success) {
        this.onDoorUnlocked(door);
      } else {
        this.ctx.hud.flashNotEnoughPoints();
        if (door.requiredMessage) this.ctx.hud.showRoundBanner(door.requiredMessage);
        else this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS', `${result.cost} PTS NEEDED`);
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

    const wallBuy = this.findFacingWallBuy();
    if (wallBuy) {
      this.purchaseWallBuy(wallBuy);
      return;
    }

    const pickup = this.findFacingWeaponPickup();
    if (pickup) {
      if (!this.ctx.canGrantWeapon(pickup.weaponId)) {
        throw new Error(`Map pickup "${pickup.id}" references a weapon that is not preloaded`);
      }
      if (!this.economy.spend(pickup.cost)) {
        this.ctx.hud.flashNotEnoughPoints();
        this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS', `${pickup.cost} PTS NEEDED`);
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

    const completion = this.findFacingCompletionInteraction();
    if (completion) {
      if (!this.economy.canAfford(completion.cost)) {
        this.ctx.hud.flashNotEnoughPoints();
        this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS', `${completion.cost} PTS NEEDED`);
        return;
      }
      if (!this.runFlow.beginEnding()) return;
      if (!this.economy.spend(completion.cost)) throw new Error('Completion purchase became unaffordable');
      this.beginEnding();
      return;
    }

    if (!this.box || !this.playerInBoxRange()) return;
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

  /** Center-screen prompt: door > barrier repair > wall buy > box. */
  getInteractPrompt(): string | null {
    if (!this.isGameplayInputEnabled()) return null;
    const key = this.ctx.profile.useTouchControls ? 'Hold USE' : 'Hold E';
    const tapKey = this.ctx.profile.useTouchControls ? 'Tap USE' : 'Press E';

    const door = this.findFacingDoor();
    if (door && door.isLocked) {
      if (door.prompt) return `USE — ${door.prompt} — ${door.cost} PTS`;
      return `UNLOCK ${door.id.toUpperCase().replace(/-/g, ' ')}\n${tapKey} — ${door.cost} PTS`;
    }

    const barrier = this.findRepairableBarrier();
    if (barrier && barrier.isDamaged) {
      return `REPAIR BARRICADE\n${key}`;
    }

    const soulLamp = this.findFacingSoulLamp();
    if (soulLamp) return `ACTIVATE SOUL LAMP\n${tapKey}`;

    const ritual = this.findFacingRitualCircle();
    if (ritual) return `TOUCH THE RITUAL CIRCLE\n${tapKey}`;

    const wallBuy = this.findFacingWallBuy();
    if (wallBuy) {
      const owned = this.ctx.hasWeapon(wallBuy.weaponId);
      const label = WEAPON_DEFINITIONS[wallBuy.weaponId].name;
      return owned
        ? `${tapKey} — ${label} Ammo — ${wallBuy.ammoPrice} PTS`
        : `${tapKey} — Buy ${label} — ${wallBuy.price} PTS`;
    }

    const pickup = this.findFacingWeaponPickup();
    if (pickup) return `${pickup.interactionLabel}\n${tapKey}`;

    const ammoRefill = this.findFacingAmmoRefill();
    if (ammoRefill) return `${ammoRefill.interactionLabel}\n${tapKey}`;

    const completion = this.findFacingCompletionInteraction();
    if (completion) return `ACTIVATE FINAL\n${tapKey} — ${completion.cost} PTS`;

    if (!this.box || !this.playerInBoxRange()) return null;
    switch (this.box.state) {
      case 'closed':
        return MYSTERY_BOX_TUNING.cost > 0
          ? `MYSTERY BOX\n${tapKey} — ${MYSTERY_BOX_TUNING.cost} PTS`
          : `MYSTERY BOX\n${tapKey}`;
      case 'awaitingPickup': {
        const result = this.box.result;
        return result ? `${tapKey} to take ${WEAPON_DEFINITIONS[result].name}` : null;
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

  private purchaseWallBuy(wallBuy: WallBuy): void {
    const owned = this.ctx.hasWeapon(wallBuy.weaponId);
    if (!owned && !this.ctx.canGrantWeapon(wallBuy.weaponId)) {
      throw new Error(`Wall buy "${wallBuy.id}" references a weapon that is not preloaded`);
    }
    if (owned && !this.ctx.canRefillWeaponAmmo(wallBuy.weaponId)) {
      this.ctx.hud.showRoundBanner('AMMO FULL', WEAPON_DEFINITIONS[wallBuy.weaponId].name);
      return;
    }
    const cost = owned ? wallBuy.ammoPrice : wallBuy.price;
    if (!this.economy.spend(cost)) {
      this.ctx.hud.flashNotEnoughPoints();
      this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS', `${cost} PTS NEEDED`);
      return;
    }
    const delivered = owned
      ? this.ctx.refillWeaponAmmo(wallBuy.weaponId)
      : this.ctx.grantWeapon(wallBuy.weaponId);
    if (!delivered) throw new Error(`Wall buy "${wallBuy.id}" could not deliver after validation`);
    this.pushHudState();
  }

  private purchaseAmmoRefill(refill: ArenaAmmoRefill): void {
    if (!this.ctx.canRefillEquippedWeaponAmmo()) {
      this.ctx.hud.showRoundBanner('AMMO FULL');
      return;
    }
    if (!this.economy.spend(refill.cost)) {
      this.ctx.hud.flashNotEnoughPoints();
      this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS', `${refill.cost} PTS NEEDED`);
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
    if (this.arena instanceof BurnedMansionArena) {
      const previousStaticColliders = new Set(this.arena.colliders);
      if (this.arena.activateDoor(door.id) && door.id !== 'nuclear-bunker') {
        this.syncMansionArena(previousStaticColliders);
      }
    }
  }

  private syncMansionArena(previousStaticColliders: ReadonlySet<THREE.Object3D>): void {
    if (!(this.arena instanceof BurnedMansionArena)) return;
    this.arena.refreshSpawnPoints();
    this.arena.refreshColliders();
    // Remove only old static map objects: live zombie hitboxes share this array.
    for (let index = this.ctx.hitColliders.length - 1; index >= 0; index--) {
      if (previousStaticColliders.has(this.ctx.hitColliders[index])) {
        this.ctx.hitColliders.splice(index, 1);
      }
    }
    this.ctx.hitColliders.push(...this.arena.colliders);
    this.mansionStaticColliders = new Set(this.arena.colliders);
    this.ctx.player.setWallColliders(this.arena.wallColliders);
    this.zombies.setSpawnPoints(this.arena.spawnPoints);
    this.zombies.setBarriers(this.arena.barriers);
    this.zombies.registerColliders(this.ctx.hitColliders);
  }

  private processRoundEvents(): void {
    const playerPos = this.ctx.player.rig.position;
    for (const event of this.rounds.pendingEvents) {
      switch (event.type) {
        case 'roundStarted':
          this.ctx.hud.showRoundBanner(`ROUND ${event.round}`);
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
          this.ctx.hud.showRoundBanner(`ROUND ${event.round} COMPLETE`);
          break;
      }
    }

    this.rounds.clearEvents();
  }

  private onZombieKilled(
    headshot: boolean,
    deathPosition?: { readonly x: number; readonly y: number; readonly z: number },
    floor?: number,
    source: ZombieKillSource = 'default',
  ): void {
    if (!this.isGameplayInputEnabled()) return;
    this.kills++;

    if (headshot) {
      this.headshots++;
    }

    // A lethal headshot already has a strong dedicated impact. Layering the
    // generic death growl at the same instant masks its short crack.
    if (!headshot) {
      this.ctx.audio.playZombieDeath();
    }

    // Rewards are mutually exclusive: the risky knife finisher beats a
    // headshot, and neither stacks with the ordinary kill payout.
    if (source === 'knife') this.economy.awardKnifeKill();
    else this.economy.awardKill(headshot);
    if (deathPosition && floor !== undefined && this.arena instanceof BurnedMansionArena) {
      this.arena.captureSoul(deathPosition, floor);
    }
    if (!this.rayGunUnlocked && this.kills >= RAYGUN_UNLOCK_KILLS) {
      this.unlockRayGun();
    }
  }

  private spatialCueFor(position: THREE.Vector3): { pan: number; attenuation: number } {
    this.ctx.player.camera.getWorldPosition(this.tmpAudioPosition);
    this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    const dx = position.x - this.tmpAudioPosition.x;
    const dy = position.y - this.tmpAudioPosition.y;
    const dz = position.z - this.tmpAudioPosition.z;
    const horizontalDistance = Math.hypot(dx, dz);
    const distance = Math.hypot(horizontalDistance, dy);
    const rightX = -this.tmpDirection.z;
    const rightZ = this.tmpDirection.x;
    const pan = horizontalDistance > 0.001
      ? THREE.MathUtils.clamp((dx * rightX + dz * rightZ) / horizontalDistance, -1, 1)
      : 0;
    const attenuation = THREE.MathUtils.clamp(1 / (1 + Math.max(0, distance - 2) * 0.12), 0.18, 1);
    return { pan, attenuation };
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

  public onKeyInput(key: string): void {
    if (!this.godModeEnabled && this.godModeCommand.push(key)) this.activateGodMode();
  }

  private activateGodMode(): void {
    this.godModeEnabled = true;
    this.health.setInvincible(true);
    this.economy.setUnlimitedSpending(true);
    this.ctx.grantWeapon('tesla');
    this.ctx.setWeaponInfiniteReserve('tesla');
    this.ctx.hud.showRoundBanner('GOD MODE ENABLED', 'MOTDRULES');
    this.ctx.audio.playTeslaUnlock();
  }

  private onPlayerHit(damage: number): void {
    if (!this.isGameplayInputEnabled()) return;
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
    if (!this.isGameplayInputEnabled()) return;
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
      const chain = this.zombies.applyChainLightning(zombie, CHAIN_ZAP_DAMAGE, part);
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
      const headshot = part === 'head';
      this.ctx.stats.registerHit(distance);
      this.ctx.hud.showHitmarker(headshot);
      if (headshot) this.ctx.audio.playHeadshotHit();
      const lethal = this.zombies.damageZombie(zombie, part, raygun.damage);
      if (!lethal) this.economy.awardHit(headshot);
    }
    // Splash includes the directly-hit zombie: the Ray Gun fantasy is that
    // a bullseye on a packed horde is devastating.
    this.zombies.applySplash(point, config.splashRadius, config.splashDamage);
  }

  private endGame(): void {
    if (!this.runFlow.gameOver()) return;
    this.gameOver = true;
    if (typeof this.ctx.audio.stopMusic === 'function') this.ctx.audio.stopMusic();
    else this.ctx.audio.music?.stop?.();
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
    this.runFlow.reset();
    this.kills = 0;
    this.headshots = 0;
    this.rayGunUnlocked = false;
    this.godModeEnabled = false;
    this.godModeCommand.reset();
    this.economy.reset();
    this.health.reset();
    this.rounds.reset();
    if (this.zombies) this.zombies.reset();
    this.footsteps?.reset();
    if (this.arena instanceof BurnedMansionArena) {
      const previousStaticColliders = new Set(this.arena.colliders);
      this.arena.reset();
      this.syncMansionArena(previousStaticColliders);
    } else if (this.arena) {
      this.arena.reset();
    }
    this.activeRepairBarrier = null;
    this.knife.reset();
    if (typeof this.ctx.audio.stopMusic === 'function') this.ctx.audio.stopMusic();
    else this.ctx.audio.music?.stop?.();
    // Fresh run: M1911 with 8 / 32, no box weapons, box back to closed.
    this.box?.reset();
    this.ctx.resetArsenal();
    if (this.arena?.useWallCollision && this.arena.playerBounds && this.ctx.player?.teleport) {
      const spawn = this.arena.playerSpawn ?? { x: 0, y: 1.7, z: 0, floor: 0 };
      this.ctx.player.teleport(spawn.x, spawn.y, spawn.z, spawn.floor, this.arena.playerBounds);
    }
    this.ctx.hud.hideGameOver();
    this.ctx.hud.hideEnding?.();
    this.ctx.hud.setHudVisible?.(true);
    this.pushHudState();
    this.ctx.lockPointer();
  }

  private beginEnding(): void {
    this.activeRepairBarrier?.stopRepair();
    this.activeRepairBarrier = null;
    this.knife.reset();
    this.rounds.clearEvents();
    this.zombies.reset();
    if (typeof this.ctx.audio.stopMusic === 'function') this.ctx.audio.stopMusic();
    else this.ctx.audio.music?.stop?.();
    this.ctx.audio.stopWind?.();
    this.ctx.hud.setInteractionPrompt(null);
    this.pushHudState();
    this.ctx.hud.showEnding(this.rounds.round);
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
    });
  }
}
