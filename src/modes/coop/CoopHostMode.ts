import * as THREE from 'three';
import { WEAPON_DEFINITIONS } from '../../config/weapons';
import { PlayerEconomy } from '../../game/PlayerEconomy';
import { PlayerHealth } from '../../game/PlayerHealth';
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
import type { Zombie } from '../../zombies/Zombie';
import { PLAYER_MAX_HP } from '../../zombies/ZombieConfig';
import { ZombieManager, type ZombiePlayerTarget } from '../../zombies/ZombieManager';
import { RoundManager } from '../../zombies/RoundManager';
import type { GameMode, ModeContext } from '../GameMode';
import { CoopWorld } from './CoopWorld';

const COOP_WEAPONS: readonly WeaponId[] = ['m1911'];
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
  public readonly startingInventory = COOP_WEAPONS;
  public readonly maxWeapons = 1;
  public readonly sharedSimulation = true;

  private ctx!: ModeContext;
  private world!: CoopWorld;
  private zombies!: ZombieManager;
  private guestAvatar!: RemotePlayer;
  private readonly rounds = new RoundManager();
  private readonly players: Readonly<Record<CoopPlayerId, PlayerRecord>> = {
    host: createRecord(),
    guest: createRecord(),
  };
  private readonly shots = new ShotValidator(
    WEAPON_DEFINITIONS.m1911.magazineSize + 1,
    WEAPON_DEFINITIONS.m1911.rpm / 60,
  );
  private readonly targets: ZombiePlayerTarget[] = [];
  private readonly guestTarget = { id: 'guest' as const, x: 0, y: EYE_HEIGHT, z: 0, floor: 0 };
  private readonly tmpDirection = new THREE.Vector3();
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

  public constructor(private readonly connection: CoopConnection) {}

  public init(ctx: ModeContext): void {
    this.ctx = ctx;
    this.world = new CoopWorld(ctx);
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
    this.zombies.onZombieKilled = (zombie, headshot) => this.onZombieKilled(zombie, headshot);
    this.zombies.onPlayerAttack = (damage, target) => this.onPlayerAttacked(damage, target ?? 'host');
    ctx.scene.add(this.zombies.group);

    this.guestAvatar = new RemotePlayer(createRemoteAvatar(ctx.assets.getPlayerModel(), !ctx.profile.useReducedEffects));
    ctx.scene.add(this.guestAvatar.root);

    ctx.hud.setZombiesPanelVisible(true);
    ctx.hud.setCoopPresentation('host');
    ctx.hud.setZombiesRestartHandler(() => this.onRestartRequested());
    this.connection.onMessage = (message) => this.handleMessage(message);
    this.connection.onClose = () => {
      this.onGuestLeft();
      ctx.hud.showRoundBanner('CONNECTION LOST', 'THE MATCH CONTINUES OFFLINE');
    };
    this.pushHud();
  }

  public update(dt: number): void {
    this.world.update(dt);
    if (this.hostStarted && this.phase === 'waiting' && (this.guestReady || !this.guestConnected)) {
      this.phase = 'playing';
    }
    if (this.phase === 'playing') this.simulate(dt);
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

  public onWeaponFired(_weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    this.send({
      type: 'playerShoot',
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
    });
    return false;
  }

  public onGameplayStarted(): void {
    this.hostStarted = true;
    if (this.phase === 'waiting' && this.guestConnected && !this.guestReady) {
      this.ctx.hud.showRoundBanner('WAITING FOR PARTNER');
    }
  }

  public onPointerUnlock(): boolean {
    return this.gameOverShown;
  }

  public isGameplayInputEnabled(): boolean {
    return this.phase !== 'gameOver' && !this.players.host.health.isDead;
  }

  public onInteract(): void {
    if (!this.isGameplayInputEnabled()) return;
    const door = this.world.findFacingDoor();
    if (door) this.purchaseDoor('host', door.id);
  }

  public onMeleeAttack(): void { /* The co-op slice is M1911-only. */ }

  public getInteractPrompt(): string | null {
    if (!this.isGameplayInputEnabled()) return null;
    const door = this.world.findFacingDoor();
    return door ? this.world.doorPrompt(door) : null;
  }

  /** Only the authority restarts; the guest follows through `matchRestart`. */
  public onRestartRequested(): void {
    this.resetMatch();
    this.send({ type: 'matchRestart' });
    this.sendMatchState();
    this.ctx.lockPointer();
  }

  public onExit(): void {
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
        if (this.phase !== 'gameOver' && !this.players.guest.health.isDead && this.shots.tryShoot(defaultNow())) {
          this.guestAvatar.playFire();
        }
        break;
      case 'zombieHitClaim':
        this.acceptHitClaim(message.zombieId, message.part === 'head');
        break;
      case 'doorPurchase':
        this.purchaseDoor('guest', message.doorId);
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

  private processRounds(): void {
    for (const event of this.rounds.pendingEvents) {
      if (event.type === 'roundStarted') {
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
    if (!bounds || !COOP_WEAPONS.includes(state.weapon)) return;
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
    this.guestAvatar.push(accepted);
  }

  private acceptHitClaim(zombieId: number, headshot: boolean): void {
    const state = this.guestState;
    if (this.phase !== 'playing' || !state || this.players.guest.health.isDead) return;
    const zombie = this.zombies.findByNetworkId(zombieId);
    if (!zombie || !zombie.isAlive) return;
    const weapon = WEAPON_DEFINITIONS[state.weapon];
    const distance = Math.hypot(zombie.position.x - state.x, zombie.position.z - state.z);
    if (distance > weapon.projectile.maxDistance + 2) return;
    if (!this.shots.tryConsumeHit(defaultNow())) return;
    this.applyBulletDamage('guest', zombie, headshot, weapon.damage, state.x, state.z);
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

  private onZombieKilled(zombie: Zombie, headshot: boolean): void {
    const killer = this.players[this.shooter];
    killer.kills++;
    if (headshot) killer.headshots++;
    killer.economy.awardKill(headshot);
    this.send({ type: 'zombieDeath', zombieId: this.zombies.networkIdOf(zombie), killer: this.shooter });
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
    const available = !!door && door.isLocked && this.phase !== 'gameOver' && !record.health.isDead
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

  private onGuestJoined(): void {
    this.guestConnected = true;
    this.guestReady = false;
    this.guestState = null;
    resetRecord(this.players.guest);
    this.shots.reset();
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

  private resetMatch(): void {
    this.rounds.reset();
    this.zombies.reset();
    this.world.reset();
    this.world.placeLocalPlayer('host');
    resetRecord(this.players.host);
    resetRecord(this.players.guest);
    this.ctx.resetArsenal();
    this.shots.reset();
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
