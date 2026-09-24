import * as THREE from 'three';
import { WEAPON_DEFINITIONS } from '../../config/weapons';
import { PlayerEconomy } from '../../game/PlayerEconomy';
import { PlayerHealth } from '../../game/PlayerHealth';
import { WeaponInventory } from '../../game/WeaponInventory';
import type { CoopConnection } from '../../network/CoopConnection';
import { defaultNow } from '../../network/Interpolation';
import {
  parseGuestMessage,
  type CoopPlayerId,
  type HostMessage,
  type IncomingMessage,
  type MatchPhase,
  type PlayerMatchStats,
  type PlayerNetState,
  type ZombieNetState,
} from '../../network/Protocol';
import { ShotValidator } from '../../network/ShotValidator';
import { EYE_HEIGHT } from '../../player/PlayerController';
import { RemotePlayer } from '../../rendering/RemotePlayer';
import { createRemoteAvatar } from '../../rendering/RemotePlayerAvatar';
import type { HitTarget } from '../../shooting/HitTarget';
import type { Weapon } from '../../weapons/Weapon';
import type { WeaponId } from '../../weapons/WeaponTypes';
import { KNIFE_ATTACK_DURATION, KNIFE_RANGE, Knife, knifeDamageForRound } from '../../weapons/Knife';
import { MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, MysteryBoxMachine } from '../../zombies/MysteryBox';
import { MysteryBoxView } from '../../zombies/MysteryBoxView';
import { EnergyProjectiles } from '../../zombies/EnergyProjectiles';
import { ChainLightning } from '../../zombies/ChainLightning';
import type { Zombie } from '../../zombies/Zombie';
import { CHAIN_ZAP_DAMAGE, PLAYER_MAX_HP, RAYGUN_UNLOCK_KILLS } from '../../zombies/ZombieConfig';
import type { EnergyWeaponConfig } from '../../weapons/WeaponTypes';
import { ZombieManager, type ZombiePlayerTarget } from '../../zombies/ZombieManager';
import { RoundManager } from '../../zombies/RoundManager';
import { ZombiesRunFlow } from '../../zombies/ZombiesRunFlow';
import type { WindowBarrier } from '../../zombies/barriers/WindowBarrier';
import type { GameMode, ModeContext } from '../GameMode';
import { CoopWorld } from './CoopWorld';
import { COOP_STARTING_WEAPONS, COOP_WEAPONS, coopReserveAmmo } from './CoopWeapons';

const MATCH_STATE_INTERVAL = 1 / 15;
/** Upper bound for guest movement between two accepted states (walk speed is 4.6 m/s). */
const MAX_REMOTE_SPEED = 9;
const MOVEMENT_SLACK = 0.75;
const BOUNDS_MARGIN = 1;

interface PlayerRecord {
  readonly health: PlayerHealth;
  readonly economy: PlayerEconomy;
  kills: number;
  headshots: number;
}

function createRecord(): PlayerRecord {
  return { health: new PlayerHealth(PLAYER_MAX_HP, 0.9, 5, 8), economy: new PlayerEconomy(), kills: 0, headshots: 0 };
}

function resetRecord(record: PlayerRecord): void {
  record.health.reset();
  record.economy.reset();
  record.kills = 0;
  record.headshots = 0;
}

function stats(record: PlayerRecord): PlayerMatchStats {
  return {
    hp: record.health.hp,
    points: record.economy.points,
    kills: record.kills,
    headshots: record.headshots,
    alive: !record.health.isDead,
  };
}

/** Three decimals keep snapshots compact without visible precision loss. */
function quantize(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Co-op match authority. The host browser alone runs rounds, spawning,
 * zombie AI and targeting, damage, deaths, health, points and doors; the
 * guest sends inputs and requests, and receives state plus one-shot events.
 * Nothing here pauses the match: the host's local menu only gates the host's
 * own input (see `sharedSimulation`).
 */
export class CoopHostMode implements GameMode {
  public readonly id = 'zombies' as const;
  public readonly weaponIds = COOP_WEAPONS;
  public readonly startingInventory = COOP_STARTING_WEAPONS;
  public readonly maxWeapons = 2;
  public readonly sharedSimulation = true;
  public readonly reserveAmmoFor = coopReserveAmmo;

  private ctx!: ModeContext;
  private world!: CoopWorld;
  private zombies!: ZombieManager;
  private energy!: EnergyProjectiles;
  private chain!: ChainLightning;
  private guestAvatar!: RemotePlayer;
  private readonly box = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING);
  private boxView!: MysteryBoxView;
  private boxOwner: CoopPlayerId | null = null;
  private readonly rounds = new RoundManager();
  private readonly runFlow = new ZombiesRunFlow();
  private readonly players: Readonly<Record<CoopPlayerId, PlayerRecord>> = {
    host: createRecord(),
    guest: createRecord(),
  };
  private readonly guestInventory = new WeaponInventory(COOP_STARTING_WEAPONS, 2);
  private readonly shots = new Map<WeaponId, ShotValidator>(COOP_WEAPONS.map((id) => [
    id, new ShotValidator(WEAPON_DEFINITIONS[id].magazineSize + 1, WEAPON_DEFINITIONS[id].rpm / 60),
  ]));
  private readonly targets: ZombiePlayerTarget[] = [];
  private readonly guestTarget = { id: 'guest' as const, x: 0, y: EYE_HEIGHT, z: 0, floor: 0 };
  private readonly tmpDirection = new THREE.Vector3();
  private readonly knife = new Knife();
  private readonly knifeRaycaster = new THREE.Raycaster();
  private readonly knifeOrigin = new THREE.Vector3();
  private lastGuestKnife = -Infinity;
  private phase: MatchPhase = 'waiting';
  private hostStarted = false;
  private guestConnected = true;
  private guestReady = false;
  /** Last validated guest state; authority reads this, rendering interpolates. */
  private guestState: PlayerNetState | null = null;
  /** Attribution for kills resolved inside ZombieManager.damageZombie(). */
  private shooter: CoopPlayerId = 'host';
  private spawnAnchorGuest = false;
  private broadcastElapsed = 0;
  private gameOverShown = false;
  private readonly activeRepair: Record<CoopPlayerId, WindowBarrier | null> = { host: null, guest: null };
  private lastGuestStateAt = -Infinity;
  private readonly rayGunUnlocked: Record<CoopPlayerId, boolean> = { host: false, guest: false };

  public constructor(private readonly connection: CoopConnection) {}

  public init(ctx: ModeContext): void {
    this.ctx = ctx;
    this.world = new CoopWorld(ctx);
    this.boxView = new MysteryBoxView(ctx.assets, this.world.arena.mysteryBoxPlacement.position, MYSTERY_BOX_POOL);
    this.boxView.group.rotation.y = this.world.arena.mysteryBoxPlacement.yaw;
    ctx.scene.add(this.boxView.group);
    this.world.placeLocalPlayer('host');
    const arena = this.world.arena;
    this.zombies = new ZombieManager(Math.random, ctx.assets.getZombieModels(), !ctx.profile.useReducedEffects,
      arena.spawnPoints, arena.barriers, arena.floorTransitions);
    this.zombies.setNavigationBounds(arena.navigationBounds);
    this.zombies.registerColliders(ctx.hitColliders);
    this.world.onTopologyChanged = () => {
      this.zombies.setSpawnPoints(arena.spawnPoints);
      this.zombies.setBarriers(arena.barriers);
      this.zombies.registerColliders(ctx.hitColliders);
    };
    this.zombies.onZombieSpawned = (zombie) => this.send({ type: 'zombieSpawn', zombie: this.zombieState(zombie) });
    this.zombies.onZombieAttack = (zombie, target) => {
      this.send({ type: 'zombieAttack', zombieId: this.zombies.networkIdOf(zombie), target });
    };
    this.zombies.onZombieKilled = (zombie, headshot, source) => this.onZombieKilled(zombie, headshot, source);
    this.zombies.onPlayerAttack = (damage, target) => this.onPlayerAttacked(damage, target ?? 'host');
    this.zombies.onBruteAttack = () => ctx.audio.playBruteRoar();
    this.zombies.onBarrierImpact = () => ctx.audio.playBarrierBreak();
    ctx.scene.add(this.zombies.group);
    this.energy = new EnergyProjectiles(ctx.hitColliders, ctx.scene);
    this.energy.onImpact = (point, config, object, distance, sourceId) =>
      this.onEnergyImpact(point, config, object, distance, sourceId === 1 ? 'guest' : 'host');
    this.chain = new ChainLightning(ctx.scene);
    this.knife.onSwing = () => ctx.audio.playKnifeSwing();
    this.knife.onImpact = () => this.applyLocalKnifeImpact();
    ctx.player.camera.add(this.knife.root);

    this.guestAvatar = new RemotePlayer(createRemoteAvatar(ctx.assets.getPlayerModel(), !ctx.profile.useReducedEffects));
    ctx.scene.add(this.guestAvatar.root);

    ctx.hud.setZombiesPanelVisible(true);
    ctx.hud.setCoopPresentation('host');
    ctx.hud.setZombiesRestartHandler(() => this.onRestartRequested());
    ctx.hud.setCreditsMainMenuHandler(() => ctx.returnToMainMenu());
    this.connection.onMessage = (message) => this.handleMessage(message);
    this.connection.onClose = () => {
      this.onGuestLeft();
      ctx.hud.showRoundBanner('CONNECTION LOST', 'THE MATCH CONTINUES OFFLINE');
    };
    this.pushHud();
  }

  public update(dt: number): void {
    if (!this.isGameplayInputEnabled() && this.knife.enabled) this.knife.reset();
    this.knife.setEnabled(this.knife.isAttacking);
    this.knife.update(dt, false, this.ctx.player.speed01);
    if (!this.knife.isAttacking) this.knife.setEnabled(false);
    this.world.update(dt);
    this.box.update(dt);
    this.boxView.update(dt, this.box);
    this.processBoxEvents();
    if (this.hostStarted && this.phase === 'waiting' && (this.guestReady || !this.guestConnected)) {
      this.phase = 'playing';
    }
    if (this.phase === 'playing') {
      this.simulate(dt);
      this.updateRepairs(dt);
    }
    if (this.phase === 'ending' && this.runFlow.update(dt)) {
      this.phase = 'credits';
      this.ctx.hud.showCredits();
      this.sendMatchState();
    }
    this.energy.update(dt);
    this.chain.update(dt);
    this.guestAvatar.setAlive(!this.players.guest.health.isDead);
    this.guestAvatar.update(dt);
    this.broadcastElapsed += dt;
    if (this.broadcastElapsed >= MATCH_STATE_INTERVAL) {
      this.broadcastElapsed = 0;
      this.sendMatchState();
    }
    this.pushHud();
  }

  public onTargetHit(_target: HitTarget, distance: number, _point: THREE.Vector3,
    _normal: THREE.Vector3, object: THREE.Object3D, weapon: Weapon): void {
    const zombie = object.userData.zombie as Zombie | undefined;
    if (!zombie || this.phase !== 'playing') return;
    const headshot = object.userData.hitPart === 'head';
    this.ctx.stats.registerHit(distance);
    this.ctx.hud.showHitmarker(headshot);
    const position = this.ctx.player.rig.position;
    this.applyBulletDamage('host', zombie, headshot, weapon.definition.damage, position.x, position.z);
  }

  public onWeaponFired(weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    this.send({
      type: 'playerShoot', weapon: weapon.definition.id,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
    });
    if (!weapon.definition.energy) return false;
    this.energy.fire(origin, direction, weapon.definition.energy);
    return true;
  }

  public onGameplayStarted(): void {
    this.hostStarted = true;
    if (this.phase === 'waiting' && this.guestConnected && !this.guestReady) {
      this.ctx.hud.showRoundBanner('WAITING FOR PARTNER');
    }
  }

  public onPointerUnlock(): boolean {
    return this.gameOverShown || this.phase === 'ending' || this.phase === 'credits';
  }

  public isGameplayInputEnabled(): boolean {
    return (this.phase === 'waiting' || this.phase === 'playing') && !this.players.host.health.isDead;
  }

  public onInteract(): void {
    if (!this.isGameplayInputEnabled()) return;
    const door = this.world.findFacingDoor();
    if (door) { this.purchaseDoor('host', door.id); return; }
    if (this.world.findRepairableBarrier()) return;
    const equipped = this.ctx.getEquippedWeaponId();
    const lamp = this.world.findFacingSoulLamp();
    if (lamp) { this.useMap('host', 'lamp', lamp.id, equipped); return; }
    const ritual = this.world.findFacingRitual();
    if (ritual) { this.useMap('host', 'ritual', ritual.id, equipped); return; }
    const wallBuy = this.world.findFacingWallBuy();
    if (wallBuy) { this.purchaseWallBuy('host', wallBuy.id, this.ctx.hasWeapon(wallBuy.weaponId)); return; }
    const pickup = this.world.findFacingPickup();
    if (pickup) { this.useMap('host', 'pickup', pickup.id, equipped); return; }
    const refill = this.world.findFacingAmmoRefill();
    if (refill) { this.useMap('host', 'ammo', refill.id, equipped); return; }
    const completion = this.world.findFacingCompletion();
    if (completion) { this.useMap('host', 'completion', completion.id, equipped); return; }
    if (this.world.isLocalInBoxRange()) this.useBox('host', this.box.state === 'awaitingPickup' ? 'pickup' : 'activate', equipped);
  }

  public usesFallbackAttack(): boolean { return this.isGameplayInputEnabled() && this.knife.isAttacking; }

  public getFallbackWeaponName(): string | null { return this.usesFallbackAttack() ? 'KNIFE' : null; }

  public onMeleeAttack(): void {
    if (!this.isGameplayInputEnabled()) return;
    this.knife.setEnabled(true);
    this.knife.trigger();
  }

  public getInteractPrompt(): string | null {
    if (!this.isGameplayInputEnabled()) return null;
    const door = this.world.findFacingDoor();
    if (door) return this.world.doorPrompt(door);
    const tapKey = this.ctx.profile.useTouchControls ? 'Tap USE' : 'Press E';
    if (this.world.findRepairableBarrier()) return `REPAIR BARRICADE\n${this.ctx.profile.useTouchControls ? 'Hold USE' : 'Hold E'}`;
    if (this.world.findFacingSoulLamp()) return `ACTIVATE SOUL LAMP\n${tapKey}`;
    if (this.world.findFacingRitual()) return `TOUCH THE RITUAL CIRCLE\n${tapKey}`;
    const wallBuy = this.world.findFacingWallBuy();
    if (wallBuy) return this.world.wallBuyPrompt(wallBuy, this.ctx.hasWeapon(wallBuy.weaponId));
    const pickup = this.world.findFacingPickup();
    if (pickup) return `${pickup.interactionLabel}\n${tapKey}`;
    const refill = this.world.findFacingAmmoRefill();
    if (refill) return `${refill.interactionLabel}\n${tapKey}`;
    const completion = this.world.findFacingCompletion();
    if (completion) return `ACTIVATE FINAL\n${tapKey} — ${completion.cost} PTS`;
    return this.boxPrompt('host');
  }

  /** Only the authority restarts; the guest follows through `matchRestart`. */
  public onRestartRequested(): void {
    this.resetMatch();
    this.send({ type: 'matchRestart' });
    this.sendMatchState();
    this.ctx.lockPointer();
  }

  public onExit(): void {
    this.knife.reset();
    this.connection.dispose();
    this.guestAvatar.dispose();
    this.ctx.hud.clearCoopPresentation();
  }

  private handleMessage(raw: IncomingMessage): void {
    if (raw.type === 'peerJoined') {
      this.onGuestJoined();
      return;
    }
    if (raw.type === 'peerLeft') {
      this.onGuestLeft();
      this.ctx.hud.showRoundBanner('PARTNER DISCONNECTED');
      return;
    }
    if (!this.guestConnected) return;
    const message = parseGuestMessage(raw);
    if (!message) return;
    switch (message.type) {
      case 'ready':
        this.guestReady = true;
        this.sendMatchState();
        break;
      case 'playerState':
        this.acceptGuestState(message.state);
        break;
      case 'playerShoot':
        if (this.phase === 'playing' && !this.players.guest.health.isDead
          && this.guestInventory.has(message.weapon) && this.shots.get(message.weapon)?.tryShoot(defaultNow())) {
          this.guestAvatar.playFire();
          const config = WEAPON_DEFINITIONS[message.weapon].energy;
          const state = this.guestState;
          const length = Math.hypot(message.direction.x, message.direction.y, message.direction.z);
          if (config && state && length > 0.8 && length < 1.2) {
            this.energy.fire(new THREE.Vector3(state.x, state.y, state.z),
              new THREE.Vector3(message.direction.x / length, message.direction.y / length,
                message.direction.z / length), config, 1);
          }
        }
        break;
      case 'zombieHitClaim':
        this.acceptHitClaim(message.weapon, message.zombieId, message.part === 'head');
        break;
      case 'knifeHitClaim':
        this.acceptKnifeClaim(message.zombieId);
        break;
      case 'doorPurchase':
        this.purchaseDoor('guest', message.doorId);
        break;
      case 'wallBuyPurchase':
        this.purchaseWallBuy('guest', message.wallBuyId, message.refill, message.equippedWeapon);
        break;
      case 'boxUse':
        this.useBox('guest', message.action, message.equippedWeapon);
        break;
      case 'mapUse':
        this.useMap('guest', message.kind, message.id, message.equippedWeapon);
        break;
    }
  }

  private simulate(dt: number): void {
    const host = this.players.host;
    const guest = this.players.guest;
    host.health.update(dt);
    guest.health.update(dt);
    this.rounds.update(dt, this.zombies.aliveCount);
    this.processRounds();

    this.targets.length = 0;
    if (this.guestConnected && this.guestState && !guest.health.isDead) {
      this.guestTarget.x = this.guestState.x;
      this.guestTarget.y = this.guestState.y;
      this.guestTarget.z = this.guestState.z;
      this.guestTarget.floor = this.guestState.floor;
      this.targets.push(this.guestTarget);
    }
    const position = this.ctx.player.rig.position;
    this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    this.zombies.update(dt, position.x, position.z, this.ctx.player.floor, position.y,
      this.tmpDirection.x, this.tmpDirection.z, this.targets, !host.health.isDead);

    if (host.health.isDead && (guest.health.isDead || !this.guestConnected)) this.endMatch();
  }

  private updateRepairs(dt: number): void {
    const input = this.ctx.input;
    const hostBarrier = input.isDown('KeyE') && !input.leftButtonDown
      && !input.wasPressed('Digit1') && !input.wasPressed('Digit2')
      && !input.wasPressed('TouchFire') && !this.players.host.health.isDead
      ? this.world.findRepairableBarrier() : null;
    this.repairFor('host', hostBarrier, dt);
    const state = this.guestState;
    const requested = state?.repairBarrierId;
    const guestBarrier = this.guestConnected && state && requested
      && defaultNow() - this.lastGuestStateAt < 0.25 && !this.players.guest.health.isDead
      ? this.world.arena.barriers.find((barrier) => barrier.id === requested
        && this.world.isRemoteAtBarrier(barrier, state)) ?? null : null;
    this.repairFor('guest', guestBarrier, dt);
  }

  private repairFor(player: CoopPlayerId, barrier: WindowBarrier | null, dt: number): void {
    if (this.activeRepair[player] !== barrier) this.activeRepair[player]?.stopRepair();
    this.activeRepair[player] = barrier;
    if (!barrier) return;
    const result = barrier.repair(dt);
    for (let index = 0; index < result.rewardableBoards; index++) this.players[player].economy.awardRepair();
  }

  private processRounds(): void {
    for (const event of this.rounds.pendingEvents) {
      if (event.type === 'roundStarted') {
        for (const barrier of this.world.arena.barriers) barrier.resetRoundCap();
        this.ctx.hud.showRoundBanner(`ROUND ${event.round}`);
        this.ctx.audio.playRoundSting();
        this.send({ type: 'roundStart', round: event.round });
      } else if (event.type === 'spawnDue') {
        const anchor = this.spawnAnchor();
        if (!this.zombies.spawnZombie(event.config, anchor.x, anchor.z, event.round)) this.rounds.requeueSpawn();
      } else if (event.type === 'roundComplete') {
        this.ctx.hud.showRoundBanner(`ROUND ${event.round} COMPLETE`);
        this.send({ type: 'roundEnd', round: event.round });
      }
    }
    this.rounds.clearEvents();
  }

  /** Spawns alternate between living players so both see pressure. */
  private spawnAnchor(): { readonly x: number; readonly z: number } {
    this.spawnAnchorGuest = !this.spawnAnchorGuest;
    const guestAvailable = this.guestConnected && this.guestState && !this.players.guest.health.isDead;
    if (guestAvailable && (this.spawnAnchorGuest || this.players.host.health.isDead)) {
      return this.guestState as PlayerNetState;
    }
    return this.ctx.player.rig.position;
  }

  private acceptGuestState(state: PlayerNetState): void {
    const bounds = this.world.arena.navigationBounds.find((entry) => entry.floor === state.floor);
    if (!bounds || !this.guestInventory.has(state.weapon)) return;
    if (state.x < bounds.minX - BOUNDS_MARGIN || state.x > bounds.maxX + BOUNDS_MARGIN
      || state.z < bounds.minZ - BOUNDS_MARGIN || state.z > bounds.maxZ + BOUNDS_MARGIN
      || state.y < bounds.baseY + 0.5 || state.y > bounds.baseY + EYE_HEIGHT + 2.5) return;
    const previous = this.guestState;
    let accepted = state;
    if (previous) {
      if (state.t <= previous.t) return;
      const dx = state.x - previous.x;
      const dz = state.z - previous.z;
      const distance = Math.hypot(dx, dz);
      const allowed = MAX_REMOTE_SPEED * Math.min(1, state.t - previous.t) + MOVEMENT_SLACK;
      // Clamp toward the claim instead of rejecting it: the host view always converges.
      if (distance > allowed) {
        const scale = allowed / distance;
        accepted = { ...state, x: previous.x + dx * scale, z: previous.z + dz * scale };
      }
    }
    this.guestState = accepted;
    this.lastGuestStateAt = defaultNow();
    const index = this.guestInventory.weapons.indexOf(state.weapon);
    if (index >= 0) this.guestInventory.switchTo(index);
    this.guestAvatar.push(accepted);
  }

  private acceptHitClaim(weaponId: WeaponId, zombieId: number, headshot: boolean): void {
    const state = this.guestState;
    if (this.phase !== 'playing' || !state || this.players.guest.health.isDead
      || !this.guestInventory.has(weaponId)) return;
    const zombie = this.zombies.findByNetworkId(zombieId);
    if (!zombie || !zombie.isAlive) return;
    const weapon = WEAPON_DEFINITIONS[weaponId];
    if (weapon.energy) return;
    const distance = Math.hypot(zombie.position.x - state.x, zombie.position.z - state.z);
    if (distance > weapon.projectile.maxDistance + 2) return;
    if (!this.shots.get(weaponId)?.tryConsumeHit(defaultNow())) return;
    this.applyBulletDamage('guest', zombie, headshot, weapon.damage, state.x, state.z);
  }

  private applyLocalKnifeImpact(): void {
    if (!this.usesFallbackAttack() || this.phase !== 'playing') return;
    const camera = this.ctx.player.camera;
    camera.updateWorldMatrix(true, false);
    this.zombies.group.updateMatrixWorld(true);
    camera.getWorldPosition(this.knifeOrigin);
    camera.getWorldDirection(this.tmpDirection);
    this.knifeRaycaster.set(this.knifeOrigin, this.tmpDirection);
    this.knifeRaycaster.near = 0;
    this.knifeRaycaster.far = KNIFE_RANGE;
    const impact = this.knifeRaycaster.intersectObjects(this.ctx.hitColliders, false)[0];
    const zombie = impact?.object.userData.zombie as Zombie | undefined;
    if (!zombie?.isAlive || zombie.floor !== this.ctx.player.floor) return;
    this.ctx.stats.registerHit(impact.distance);
    this.ctx.hud.showHitmarker();
    this.ctx.audio.playKnifeHit();
    this.ctx.effects.puff(impact.point, 0x6e1d16, 0.24);
    this.applyKnifeDamage('host', zombie);
  }

  private acceptKnifeClaim(zombieId: number): void {
    const state = this.guestState;
    if (this.phase !== 'playing' || !state || this.players.guest.health.isDead) return;
    const now = defaultNow();
    if (now - this.lastGuestKnife < KNIFE_ATTACK_DURATION) return;
    const zombie = this.zombies.findByNetworkId(zombieId);
    if (!zombie?.isAlive || zombie.floor !== state.floor) return;
    if (Math.hypot(zombie.position.x - state.x, zombie.position.z - state.z) > KNIFE_RANGE + 0.5) return;
    this.lastGuestKnife = now;
    this.applyKnifeDamage('guest', zombie);
  }

  private applyKnifeDamage(shooter: CoopPlayerId, zombie: Zombie): void {
    this.shooter = shooter;
    const damage = knifeDamageForRound(zombie.maxHp, this.rounds.round);
    const lethal = this.zombies.damageZombie(zombie, 'torso', damage, 'knife');
    this.shooter = 'host';
    if (!lethal) this.players[shooter].economy.awardHit(false);
    if (!lethal) {
      const position = shooter === 'host' ? this.ctx.player.rig.position : this.guestState;
      this.send({ type: 'zombieHit', zombieId: this.zombies.networkIdOf(zombie), headshot: false,
        amount: damage, fromX: position?.x ?? 0, fromZ: position?.z ?? 0 });
    }
  }

  /** The single place bullet damage is applied, for both players' shots. */
  private applyBulletDamage(shooter: CoopPlayerId, zombie: Zombie, headshot: boolean,
    damage: number, fromX: number, fromZ: number): void {
    this.shooter = shooter;
    const lethal = this.zombies.damageZombie(zombie, headshot ? 'head' : 'torso', damage);
    this.shooter = 'host';
    if (lethal) return;
    this.players[shooter].economy.awardHit(headshot);
    this.send({
      type: 'zombieHit', zombieId: this.zombies.networkIdOf(zombie), headshot,
      amount: damage, fromX: quantize(fromX), fromZ: quantize(fromZ),
    });
  }

  private onEnergyImpact(point: THREE.Vector3, config: EnergyWeaponConfig,
    object: THREE.Object3D | null, distance: number, shooter: CoopPlayerId): void {
    if (this.phase !== 'playing') return;
    const zombie = object?.userData.zombie as Zombie | undefined;
    const part = object?.userData.hitPart === 'head' ? 'head' : 'torso';
    const before = new Map<Zombie, number>();
    for (const active of this.zombies.actives) if (active.isAlive) before.set(active, active.hp);
    this.shooter = shooter;
    if (config === WEAPON_DEFINITIONS.tesla.energy) {
      if (zombie?.isAlive) {
        const chain = this.zombies.applyChainLightning(zombie, CHAIN_ZAP_DAMAGE, part);
        if (part === 'head' && zombie.isAlive) this.players[shooter].economy.awardHit(true);
        const muzzle = shooter === 'host' ? this.ctx.player.camera.getWorldPosition(new THREE.Vector3())
          : this.guestState ? new THREE.Vector3(this.guestState.x, this.guestState.y, this.guestState.z) : point.clone();
        const points = [muzzle, ...chain.map((entry) =>
          new THREE.Vector3(entry.position.x, entry.position.y + 1.1, entry.position.z))];
        this.chain.discharge(points);
        this.send({ type: 'teslaChain', points: points.map((entry) =>
          ({ x: entry.x, y: entry.y, z: entry.z })) });
        this.ctx.audio.playTeslaChain(chain.length);
      }
      this.ctx.audio.playTeslaShot();
    } else {
      this.ctx.audio.playRayImpact();
      if (zombie?.isAlive) {
        const lethal = this.zombies.damageZombie(zombie, part, WEAPON_DEFINITIONS.raygun.damage);
        if (!lethal) this.players[shooter].economy.awardHit(part === 'head');
      }
      this.zombies.applySplash(point, config.splashRadius, config.splashDamage);
    }
    this.shooter = 'host';
    for (const [target, hp] of before) {
      if (target.isAlive && target.hp < hp) {
        this.send({ type: 'zombieHit', zombieId: this.zombies.networkIdOf(target),
          headshot: target === zombie && part === 'head', amount: hp - target.hp,
          fromX: point.x, fromZ: point.z });
      }
    }
    if (shooter === 'host' && zombie) {
      this.ctx.stats.registerHit(distance);
      this.ctx.hud.showHitmarker(part === 'head');
    }
  }

  private onZombieKilled(zombie: Zombie, headshot: boolean, source: 'default' | 'knife'): void {
    const shooter = this.shooter;
    const killer = this.players[shooter];
    killer.kills++;
    if (headshot) killer.headshots++;
    if (source === 'knife') killer.economy.awardKnifeKill();
    else killer.economy.awardKill(headshot);
    this.world.arena.captureSoul(zombie.position, zombie.floor);
    this.send({ type: 'zombieDeath', zombieId: this.zombies.networkIdOf(zombie), killer: shooter });
    if (!this.rayGunUnlocked[shooter] && killer.kills >= RAYGUN_UNLOCK_KILLS) {
      this.rayGunUnlocked[shooter] = true;
      if (shooter === 'host') {
        this.ctx.grantWeapon('raygun');
        this.ctx.hud.showRoundBanner('RAY GUN UNLOCKED', `${RAYGUN_UNLOCK_KILLS} KILLS`);
        this.ctx.audio.playMysteryBoxReveal(true);
      } else {
        if (this.guestState) {
          const index = this.guestInventory.weapons.indexOf(this.guestState.weapon);
          if (index >= 0) this.guestInventory.switchTo(index);
        }
        this.guestInventory.grant('raygun');
        this.send({ type: 'milestoneWeapon', weapon: 'raygun' });
      }
    }
  }

  private onPlayerAttacked(damage: number, target: CoopPlayerId): void {
    if (target === 'guest') {
      if (this.guestConnected && this.players.guest.health.damage(damage)) this.send({ type: 'playerDamaged', damage });
      return;
    }
    if (this.players.host.health.damage(damage)) {
      this.ctx.audio.playPlayerHurt();
      this.ctx.hud.flashDamage();
    }
  }

  /**
   * Door purchase, identical for both players: validate the door is still
   * closed, charge ONLY the buyer atomically, open it for everyone and
   * broadcast. A second simultaneous request finds the door open and pays nothing.
   */
  private purchaseDoor(buyer: CoopPlayerId, doorId: string): void {
    const door = this.world.findDoor(doorId);
    const record = this.players[buyer];
    const buyerState = buyer === 'guest' ? this.guestState : null;
    const available = !!door && door.isLocked && (this.phase === 'waiting' || this.phase === 'playing') && !record.health.isDead
      && (buyer === 'host' || (!!buyerState && this.world.isDoorInRemoteReach(door, buyerState)));
    if (!door || !available) {
      if (buyer === 'guest') this.send({ type: 'doorPurchaseFailed', doorId, reason: 'unavailable' });
      return;
    }
    if (!this.world.unlockDoor(door, (cost) => record.economy.spend(cost))) {
      if (buyer === 'host') this.world.showDoorDenied(door);
      else this.send({ type: 'doorPurchaseFailed', doorId, reason: 'insufficientPoints' });
      return;
    }
    this.send({ type: 'doorOpened', doorId, buyer });
    this.sendMatchState();
  }

  private purchaseWallBuy(buyer: CoopPlayerId, wallBuyId: string, refill: boolean,
    equippedWeapon?: WeaponId): void {
    const wallBuy = this.world.findWallBuy(wallBuyId);
    const remote = buyer === 'guest';
    const owned = wallBuy ? (remote ? this.guestInventory.has(wallBuy.weaponId) : this.ctx.hasWeapon(wallBuy.weaponId)) : false;
    const inReach = wallBuy && (remote
      ? !!this.guestState && this.world.isWallBuyInRemoteReach(wallBuy, this.guestState)
      : this.world.findFacingWallBuy() === wallBuy);
    if (!wallBuy || !inReach || (this.phase !== 'waiting' && this.phase !== 'playing')
      || this.players[buyer].health.isDead || refill !== owned
      || (remote && (!equippedWeapon || !this.guestInventory.has(equippedWeapon)))) {
      if (remote) this.send({ type: 'wallBuyFailed', reason: 'unavailable' });
      return;
    }
    if (!remote && owned && !this.ctx.canRefillWeaponAmmo(wallBuy.weaponId)) {
      this.ctx.hud.showRoundBanner('AMMO FULL', WEAPON_DEFINITIONS[wallBuy.weaponId].name);
      return;
    }
    const cost = owned ? wallBuy.ammoPrice : wallBuy.price;
    if (!this.players[buyer].economy.spend(cost)) {
      if (remote) this.send({ type: 'wallBuyFailed', reason: 'insufficientPoints' });
      else {
        this.ctx.hud.flashNotEnoughPoints();
        this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS', `${cost} PTS NEEDED`);
      }
      return;
    }
    if (remote) {
      if (!owned) {
        this.guestInventory.switchTo(this.guestInventory.weapons.indexOf(equippedWeapon as WeaponId));
        this.guestInventory.grant(wallBuy.weaponId);
      }
      this.send({ type: 'wallBuyDelivered', weapon: wallBuy.weaponId, refill: owned });
      this.sendMatchState();
    } else {
      const delivered = owned ? this.ctx.refillWeaponAmmo(wallBuy.weaponId) : this.ctx.grantWeapon(wallBuy.weaponId);
      if (!delivered) throw new Error(`Wall buy "${wallBuy.id}" could not deliver after validation`);
    }
  }

  private useMap(buyer: CoopPlayerId, kind: 'lamp' | 'ritual' | 'pickup' | 'ammo' | 'completion',
    id: string, equippedWeapon: WeaponId): void {
    const remote = buyer === 'guest';
    const state = this.guestState;
    const record = this.players[buyer];
    const validWeapon = remote ? this.guestInventory.has(equippedWeapon) : this.ctx.hasWeapon(equippedWeapon);
    const item = kind === 'lamp' ? this.world.arena.soulLampInteractions.find((entry) => entry.id === id)
      : kind === 'ritual' ? this.world.arena.ritualInteraction.id === id ? this.world.arena.ritualInteraction : null
        : kind === 'pickup' ? this.world.arena.weaponPickups.find((entry) => entry.id === id)
          : kind === 'ammo' ? this.world.arena.ammoRefills.find((entry) => entry.id === id)
            : this.world.arena.completionInteraction.id === id ? this.world.arena.completionInteraction : null;
    const facing = kind === 'lamp' ? this.world.findFacingSoulLamp()
      : kind === 'ritual' ? this.world.findFacingRitual()
        : kind === 'pickup' ? this.world.findFacingPickup()
          : kind === 'ammo' ? this.world.findFacingAmmoRefill() : this.world.findFacingCompletion();
    const reachable = !!item && (remote ? !!state && this.world.isRemoteInReach(item, state)
      : facing?.id === id);
    if (!reachable || !validWeapon || this.phase !== 'playing' || record.health.isDead) {
      if (remote) this.send({ type: 'mapUseFailed', reason: 'unavailable' });
      return;
    }
    if (kind === 'lamp') {
      const lamp = this.world.arena.soulLampInteractions.find((entry) => entry.id === id)!;
      if (!lamp.activate()) return;
      this.send({ type: 'mapUsed', kind, id, buyer });
    } else if (kind === 'ritual') {
      if (!this.world.arena.ritualInteraction.activate()) return;
      this.send({ type: 'mapUsed', kind, id, buyer });
    } else if (kind === 'pickup') {
      const pickup = this.world.arena.weaponPickups.find((entry) => entry.id === id)!;
      if (!pickup.available || (pickup.requiredDoorId && this.world.findDoor(pickup.requiredDoorId)?.isLocked)) return;
      if (!record.economy.spend(pickup.cost)) {
        this.mapDenied(remote, pickup.cost);
        return;
      }
      pickup.claim();
      if (pickup.weaponId === 'raygun') this.rayGunUnlocked[buyer] = true;
      if (remote) {
        this.guestInventory.switchTo(this.guestInventory.weapons.indexOf(equippedWeapon));
        this.guestInventory.grant(pickup.weaponId);
      } else this.ctx.grantWeapon(pickup.weaponId);
      this.ctx.audio.playMysteryBoxPickup();
      this.send({ type: 'mapUsed', kind, id, buyer, weapon: pickup.weaponId });
    } else if (kind === 'ammo') {
      const refill = this.world.arena.ammoRefills.find((entry) => entry.id === id)!;
      if (!remote && !this.ctx.canRefillEquippedWeaponAmmo()) {
        this.ctx.hud.showRoundBanner('AMMO FULL');
        return;
      }
      if (!record.economy.spend(refill.cost)) {
        this.mapDenied(remote, refill.cost);
        return;
      }
      refill.activate();
      if (!remote) this.ctx.refillEquippedWeaponAmmo();
      this.ctx.audio.playMysteryBoxPickup();
      this.send({ type: 'mapUsed', kind, id, buyer, weapon: equippedWeapon });
    } else {
      const completion = this.world.arena.completionInteraction;
      if (completion.requiredDoorId && this.world.findDoor(completion.requiredDoorId)?.isLocked) return;
      if (!record.economy.spend(completion.cost)) {
        this.mapDenied(remote, completion.cost);
        return;
      }
      this.beginEnding();
    }
    this.sendMatchState();
  }

  private mapDenied(remote: boolean, cost: number): void {
    if (remote) this.send({ type: 'mapUseFailed', reason: 'insufficientPoints' });
    else {
      this.ctx.hud.flashNotEnoughPoints();
      this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS', `${cost} PTS NEEDED`);
    }
  }

  private boxPrompt(player: CoopPlayerId): string | null {
    if (!this.world.isLocalInBoxRange()) return null;
    const key = this.ctx.profile.useTouchControls ? 'Tap USE' : 'Press E';
    if (this.box.state === 'closed') return `MYSTERY BOX\n${key} — ${MYSTERY_BOX_TUNING.cost} PTS`;
    if (this.box.state === 'awaitingPickup' && this.boxOwner === player && this.box.result) {
      return `${key} to take ${WEAPON_DEFINITIONS[this.box.result].name}`;
    }
    return null;
  }

  private useBox(buyer: CoopPlayerId, action: 'activate' | 'pickup', equippedWeapon: WeaponId): void {
    const remote = buyer === 'guest';
    const inReach = remote ? !!this.guestState && this.world.isRemoteInBoxRange(this.guestState)
      : this.world.isLocalInBoxRange();
    const validWeapon = remote ? this.guestInventory.has(equippedWeapon) : this.ctx.hasWeapon(equippedWeapon);
    if (!inReach || !validWeapon || this.phase !== 'playing' || this.players[buyer].health.isDead) {
      if (remote) this.send({ type: 'boxFailed', reason: 'unavailable' });
      return;
    }
    if (action === 'activate') {
      if (!this.box.canUse) {
        if (remote) this.send({ type: 'boxFailed', reason: 'unavailable' });
        return;
      }
      if (!this.players[buyer].economy.spend(MYSTERY_BOX_TUNING.cost)) {
        if (remote) this.send({ type: 'boxFailed', reason: 'insufficientPoints' });
        else {
          this.ctx.hud.flashNotEnoughPoints();
          this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS', `${MYSTERY_BOX_TUNING.cost} PTS NEEDED`);
        }
        return;
      }
      this.box.tryActivate(equippedWeapon);
      this.boxOwner = buyer;
      this.sendMatchState();
      return;
    }
    if (this.box.state !== 'awaitingPickup' || !this.box.result || this.boxOwner !== buyer) {
      if (remote) this.send({ type: 'boxFailed', reason: this.boxOwner !== buyer ? 'reserved' : 'unavailable' });
      return;
    }
    const weapon = this.box.tryPickup();
    if (!weapon) return;
    if (remote) {
      this.guestInventory.switchTo(this.guestInventory.weapons.indexOf(equippedWeapon));
      this.guestInventory.grant(weapon);
      this.send({ type: 'boxGranted', weapon });
    } else if (!this.ctx.grantWeapon(weapon)) {
      throw new Error(`Mystery Box could not deliver ${weapon}`);
    }
    this.boxOwner = null;
    this.sendMatchState();
  }

  private processBoxEvents(): void {
    for (const event of this.box.pendingEvents) {
      switch (event.type) {
        case 'opened': this.ctx.audio.playMysteryBoxOpen(); break;
        case 'rollTick': this.ctx.audio.playMysteryBoxTick(); break;
        case 'result': this.ctx.audio.playMysteryBoxReveal(
          MYSTERY_BOX_POOL.some((entry) => entry.weaponId === event.weaponId && entry.rarity !== 'standard')); break;
        case 'pickedUp': this.ctx.audio.playMysteryBoxPickup(); break;
        case 'expired':
          this.boxOwner = null;
          this.ctx.audio.playMysteryBoxClose();
          break;
        case 'closed': this.ctx.audio.playMysteryBoxClose(); break;
      }
    }
    this.box.clearEvents();
  }

  private onGuestJoined(): void {
    this.guestConnected = true;
    this.guestReady = false;
    this.guestState = null;
    resetRecord(this.players.guest);
    this.guestInventory.reset(COOP_STARTING_WEAPONS);
    for (const validator of this.shots.values()) validator.reset();
    this.lastGuestKnife = -Infinity;
    this.guestAvatar.clear();
    this.ctx.hud.showRoundBanner('PARTNER JOINED');
    this.sendMatchState();
  }

  /** Zombies retarget on their next update: the guest is no longer a candidate. */
  private onGuestLeft(): void {
    this.guestConnected = false;
    this.guestReady = false;
    this.guestState = null;
    this.guestAvatar.clear();
    this.activeRepair.guest?.stopRepair();
    this.activeRepair.guest = null;
    if (this.boxOwner === 'guest') this.boxOwner = null;
  }

  private endMatch(): void {
    if (this.phase === 'gameOver') return;
    this.phase = 'gameOver';
    this.sendMatchState();
    this.gameOverShown = true;
    const host = this.players.host;
    this.ctx.hud.showGameOver({ round: this.rounds.round, kills: host.kills, headshots: host.headshots });
    this.ctx.unlockPointer();
  }

  private beginEnding(): void {
    if (!this.runFlow.beginEnding()) return;
    this.phase = 'ending';
    this.knife.reset();
    this.rounds.clearEvents();
    this.zombies.reset();
    this.energy.reset();
    this.ctx.audio.stopMusic?.();
    this.ctx.audio.stopWind?.();
    this.ctx.hud.setInteractionPrompt(null);
    this.ctx.hud.showEnding(this.rounds.round);
    this.ctx.unlockPointer();
    this.sendMatchState();
  }

  private resetMatch(): void {
    this.knife.reset();
    this.lastGuestKnife = -Infinity;
    this.rounds.reset();
    this.runFlow.reset();
    this.zombies.reset();
    this.energy.reset();
    this.world.reset();
    this.activeRepair.host = null;
    this.activeRepair.guest = null;
    this.world.placeLocalPlayer('host');
    resetRecord(this.players.host);
    resetRecord(this.players.guest);
    this.ctx.resetArsenal();
    this.box.reset();
    this.boxOwner = null;
    this.rayGunUnlocked.host = false;
    this.rayGunUnlocked.guest = false;
    this.guestInventory.reset(COOP_STARTING_WEAPONS);
    for (const validator of this.shots.values()) validator.reset();
    this.phase = 'waiting';
    this.guestReady = false;
    this.guestState = null;
    this.guestAvatar.clear();
    this.gameOverShown = false;
    this.ctx.hud.hideGameOver();
  }

  private zombieState(zombie: Zombie): ZombieNetState {
    return {
      id: this.zombies.networkIdOf(zombie),
      type: zombie.typeId,
      x: quantize(zombie.position.x),
      y: quantize(zombie.position.y),
      z: quantize(zombie.position.z),
      yaw: quantize(zombie.group.rotation.y),
      floor: zombie.floor,
      scale: quantize(zombie.group.scale.x),
      hp: zombie.hp,
      maxHp: zombie.maxHp,
      state: zombie.state,
    };
  }

  private sendMatchState(): void {
    if (!this.guestConnected) return;
    const zombies: ZombieNetState[] = [];
    for (const zombie of this.zombies.actives) zombies.push(this.zombieState(zombie));
    this.send({
      type: 'matchState',
      state: {
        t: defaultNow(),
        phase: this.phase,
        round: this.rounds.round,
        host: this.world.localPlayerState(),
        stats: { host: stats(this.players.host), guest: stats(this.players.guest) },
        zombies,
        openDoorIds: this.world.openDoorIds,
        barriers: this.world.barrierStates(),
        box: { ...this.box.snapshot(), owner: this.boxOwner },
        secret: this.world.arena.secretSnapshot,
        claimedPickupIds: this.world.arena.weaponPickups.filter((pickup) => !pickup.available).map((pickup) => pickup.id),
      },
    });
  }

  private send(message: HostMessage): void {
    if (this.guestConnected) this.connection.send(message);
  }

  private pushHud(): void {
    const host = this.players.host;
    this.ctx.hud.updateZombies({
      round: this.rounds.round,
      hp: host.health.hp,
      maxHp: PLAYER_MAX_HP,
      lethalHitDamage: 25,
      kills: host.kills,
      headshots: host.headshots,
      points: host.economy.points,
    });
  }
}
