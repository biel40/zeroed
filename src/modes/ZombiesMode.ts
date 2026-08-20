import * as THREE from 'three';
import { WEAPON_DEFINITIONS, ZOMBIES_WEAPON_PRELOAD } from '../config/weapons';
import { PlayerEconomy } from '../game/PlayerEconomy';
import { PlayerHealth } from '../game/PlayerHealth';
import type { HitTarget } from '../shooting/HitTarget';
import type { Weapon } from '../weapons/Weapon';
import type { EnergyWeaponConfig, WeaponId } from '../weapons/WeaponTypes';
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
  TESLA_UNLOCK_KILLS,
  ZOMBIES_RESERVE_AMMO,
} from '../zombies/ZombieConfig';
import { ZombieFootsteps } from '../zombies/ZombieFootsteps';
import { ZombieManager } from '../zombies/ZombieManager';
import { BurnedMansionArena } from '../zombies/maps/BurnedMansionArena';
import { WindowBarrier } from '../zombies/barriers/WindowBarrier';
import { PointDoor } from '../zombies/doors/PointDoor';
import type { WallBuy } from '../zombies/wallbuys/WallBuy';
import { ClassicArena } from '../zombies/maps/ClassicArena';
import type { ZombieArena } from '../zombies/maps/ZombieArena';
import type { ArenaWeaponPickup } from '../zombies/maps/ZombieArena';
import type { ArenaCompletionInteraction } from '../zombies/maps/ZombieArena';
import { ZombiesRunFlow } from '../zombies/ZombiesRunFlow';
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
  private teslaUnlocked = false;
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

  constructor(private readonly mapId: 'classic' | 'burned-mansion' = 'classic') {}

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
      // Only the small walker category exists; nothing else is requested.
      { walker: ctx.assets.getZombieModel('walker') },
      // Static shadow maps (mobile) must not have moving casters.
      !ctx.profile.useReducedEffects,
      this.arena.spawnPoints,
      this.arena.barriers,
      this.arena.floorTransitions,
    );
    this.zombies.setNavigationBounds(this.arena.navigationBounds);
    this.zombies.registerColliders(ctx.hitColliders);
    this.zombies.setNavigationDebug(new URLSearchParams(window.location.search).has('zombieNavDebug'));
    this.zombies.onZombieKilled = (_zombie, headshot) => this.onZombieKilled(headshot);
    this.zombies.onPlayerAttack = (damage) => this.onPlayerHit(damage);
    ctx.scene.add(this.zombies.group);
    if (this.arena instanceof BurnedMansionArena) {
      this.arena.onTopologyChanged = () => this.syncMansionArena(this.mansionStaticColliders);
    }

    this.energy = new EnergyProjectiles(ctx.hitColliders, ctx.scene);
    this.energy.onImpact = (point, config, object, distance) =>
      this.onEnergyImpact(point, config, object, distance);
    this.chain = new ChainLightning(ctx.scene);
    this.footsteps = new ZombieFootsteps(ctx.scene, ctx.player.camera);

    if (this.mapId === 'classic') {
      ctx.audio.startWind();
    }

    // The Mystery Box: main weapon progression, exclusive to this mode.
    // The audio duration provider keeps the reveal synced to the real MP3.
    this.box = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, Math.random, () =>
      ctx.audio.getMysteryBoxOpenDuration(),
    );
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
    if (this.runFlow.state === 'ENDING') {
      this.arena.update(dt);
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
    this.energy.update(dt);
    this.chain.update(dt);
    this.footsteps.update(dt, this.zombies.actives, this.ctx.audio.rawContext);
    this.arena.update(dt);
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
    if (!this.isGameplayInputEnabled()) return true;
    const energy = weapon.definition.energy;
    if (!energy) return false;
    this.energy.fire(origin, direction, energy);
    return true;
  }

  /** Skip the pause screen while the game-over panel is up. */
  onPointerUnlock(): boolean {
    return this.gameOver || !this.runFlow.acceptsGameplay;
  }

  isGameplayInputEnabled(): boolean {
    return !this.gameOver && this.runFlow.acceptsGameplay;
  }

  /** E pressed: door unlock > barrier repair > wall buy > box use > box pickup. */
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
      if (this.ctx.grantWeapon(pickup.weaponId)) {
        pickup.claim();
        if (pickup.weaponId === 'raygun') this.rayGunUnlocked = true;
        if (pickup.weaponId === 'tesla') this.teslaUnlocked = true;
        this.ctx.audio.playMysteryBoxPickup();
      }
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

    const wallBuy = this.findFacingWallBuy();
    if (wallBuy) {
      const owned = this.ctx.hasWeapon(wallBuy.weaponId);
      const label = WEAPON_DEFINITIONS[wallBuy.weaponId].name;
      return owned
        ? `${tapKey} — ${label} Ammo — ${wallBuy.ammoPrice} PTS`
        : `${tapKey} — Buy ${label} — ${wallBuy.price} PTS`;
    }

    const pickup = this.findFacingWeaponPickup();
    if (pickup) return `USE — Take ${WEAPON_DEFINITIONS[pickup.weaponId].name}`;

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
    if (result.boardsRepaired > 0) {
      this.ctx.audio.playRepairBoard();
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
            !this.zombies.spawnZombie(event.config, playerPos.x, playerPos.z)
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

  private onZombieKilled(headshot: boolean): void {
    if (!this.isGameplayInputEnabled()) return;
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
   * 115-kill milestone: the ZEUS-77 is granted outright (the inventory's
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
   * 75-kill milestone: the Ray Gun is granted outright (the inventory's
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
    this.teslaUnlocked = false;
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
      kills: this.kills,
      headshots: this.headshots,
      points: this.economy.points,
    });
  }
}
