import type * as THREE from 'three';
import type { CoopConnection } from '../../network/CoopConnection';
import {
  parseHostMessage,
  type GuestMessage,
  type HostMessage,
  type IncomingMessage,
  type MatchState,
} from '../../network/Protocol';
import { RemotePlayer } from '../../rendering/RemotePlayer';
import { createRemoteAvatar } from '../../rendering/RemotePlayerAvatar';
import type { HitTarget } from '../../shooting/HitTarget';
import type { Weapon } from '../../weapons/Weapon';
import type { WeaponId } from '../../weapons/WeaponTypes';
import type { Zombie } from '../../zombies/Zombie';
import { PLAYER_MAX_HP } from '../../zombies/ZombieConfig';
import { ZombieReplica } from '../../zombies/ZombieReplica';
import type { GameMode, ModeContext } from '../GameMode';
import { CoopWorld } from './CoopWorld';

const COOP_WEAPONS: readonly WeaponId[] = ['m1911'];
const PLAYER_STATE_INTERVAL = 1 / 20;
const INITIAL_MATCH_TIMEOUT = 10;

/**
 * Co-op replica. The guest simulates only its own first-person player and
 * weapon (ammo is player-owned); every shared decision — rounds, spawns,
 * zombie AI, damage, deaths, points, doors — arrives from the host. Local
 * bullets still fly for responsiveness, but a zombie hit is only a claim the
 * host validates and applies once.
 */
export class CoopGuestMode implements GameMode {
  public readonly id = 'zombies' as const;
  public readonly weaponIds = COOP_WEAPONS;
  public readonly startingInventory = COOP_WEAPONS;
  public readonly maxWeapons = 1;
  public readonly sharedSimulation = true;

  private ctx!: ModeContext;
  private world!: CoopWorld;
  private replica!: ZombieReplica;
  private hostAvatar!: RemotePlayer;
  private match: MatchState | null = null;
  /** Host round as last announced (event) or snapshotted; the guest never advances it. */
  private round = 0;
  private playing = false;
  private hostLost = false;
  private gameOverShown = false;
  private sendElapsed = 0;
  private initialMatchWait = 0;

  public constructor(private readonly connection: CoopConnection) {}

  public init(ctx: ModeContext): void {
    this.ctx = ctx;
    this.world = new CoopWorld(ctx);
    this.world.placeLocalPlayer('guest');
    const castShadows = !ctx.profile.useReducedEffects;
    this.replica = new ZombieReplica(ctx.assets.getZombieModels(), castShadows, ctx.hitColliders);
    ctx.scene.add(this.replica.group);
    this.hostAvatar = new RemotePlayer(createRemoteAvatar(ctx.assets.getPlayerModel(), castShadows));
    ctx.scene.add(this.hostAvatar.root);
    ctx.hud.setZombiesPanelVisible(true);
    ctx.hud.setCoopPresentation('guest');
    ctx.hud.setZombiesRestartHandler(() => ctx.returnToMainMenu());
    this.connection.onMessage = (message) => this.handleMessage(message);
    this.connection.onClose = () => this.onHostLost('CONNECTION LOST');
    this.pushHud();
  }

  public update(dt: number): void {
    this.world.update(dt);
    this.replica.update(dt);
    this.hostAvatar.update(dt);
    if (this.playing && !this.hostLost) {
      if (!this.match) {
        this.initialMatchWait += dt;
        if (this.initialMatchWait >= INITIAL_MATCH_TIMEOUT) {
          this.onHostLost('MATCH NOT SYNCHRONIZED');
          this.pushHud();
          return;
        }
      }
      this.sendElapsed += dt;
      if (this.sendElapsed >= PLAYER_STATE_INTERVAL) {
        this.sendElapsed = 0;
        this.send({ type: 'playerState', state: this.world.localPlayerState() });
      }
    }
    this.pushHud();
  }

  public onTargetHit(_target: HitTarget, distance: number, _point: THREE.Vector3,
    _normal: THREE.Vector3, object: THREE.Object3D): void {
    const zombie = object.userData.zombie as Zombie | undefined;
    const zombieId = zombie ? this.replica.networkIdOf(zombie) : null;
    if (zombieId === null || this.hostLost) return;
    const headshot = object.userData.hitPart === 'head';
    this.ctx.stats.registerHit(distance);
    this.ctx.hud.showHitmarker(headshot);
    this.send({ type: 'zombieHitClaim', zombieId, part: headshot ? 'head' : 'torso' });
  }

  /** Local ballistics stay on for impacts and hit claims; the host owns the damage. */
  public onWeaponFired(_weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    this.send({
      type: 'playerShoot',
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
    });
    return false;
  }

  public onGameplayStarted(): void {
    this.playing = true;
    this.initialMatchWait = 0;
    this.send({ type: 'ready' });
  }

  /** The game-over panel owns the cursor; otherwise ESC opens the local menu. */
  public onPointerUnlock(): boolean {
    return this.gameOverShown && !this.hostLost;
  }

  public isGameplayInputEnabled(): boolean {
    return this.playing && !this.hostLost && this.match !== null && this.match.phase !== 'gameOver' && this.match.stats.guest.alive;
  }

  public onInteract(): void {
    if (!this.isGameplayInputEnabled()) return;
    const door = this.world.findFacingDoor();
    if (door) this.send({ type: 'doorPurchase', doorId: door.id });
  }

  public onMeleeAttack(): void { /* The co-op slice is M1911-only. */ }

  public getInteractPrompt(): string | null {
    if (!this.isGameplayInputEnabled()) return null;
    const door = this.world.findFacingDoor();
    return door ? this.world.doorPrompt(door) : null;
  }

  public onExit(): void {
    this.connection.dispose();
    this.hostAvatar.dispose();
    this.replica.reset();
    this.ctx.hud.clearCoopPresentation();
  }

  private handleMessage(raw: IncomingMessage): void {
    if (raw.type === 'peerLeft') {
      this.onHostLost('HOST LEFT THE MATCH');
      return;
    }
    if (this.hostLost) return;
    const message = parseHostMessage(raw);
    if (message) this.apply(message);
  }

  private apply(message: HostMessage): void {
    switch (message.type) {
      case 'matchState':
        this.applyMatchState(message.state);
        break;
      case 'playerShoot':
        this.hostAvatar.playFire();
        break;
      case 'zombieSpawn':
        this.replica.spawn(message.zombie);
        break;
      case 'zombieAttack':
        this.replicateAttack(message.zombieId, message.target);
        break;
      case 'zombieHit':
        this.replica.hit(message.zombieId, message.headshot, message.amount, message.fromX, message.fromZ);
        break;
      case 'zombieDeath':
        this.replica.kill(message.zombieId);
        break;
      case 'roundStart':
        this.round = message.round;
        this.ctx.hud.showRoundBanner(`ROUND ${message.round}`);
        this.ctx.audio.playRoundSting();
        break;
      case 'roundEnd':
        this.ctx.hud.showRoundBanner(`ROUND ${message.round} COMPLETE`);
        break;
      case 'doorOpened': {
        const door = this.world.findDoor(message.doorId);
        if (door?.isLocked) this.world.unlockDoor(door, () => true);
        break;
      }
      case 'doorPurchaseFailed': {
        const door = this.world.findDoor(message.doorId);
        if (door?.isLocked && message.reason === 'insufficientPoints') this.world.showDoorDenied(door);
        break;
      }
      case 'playerDamaged':
        this.ctx.audio.playPlayerHurt();
        this.ctx.hud.flashDamage();
        break;
      case 'matchRestart':
        this.restartFromHost();
        break;
    }
  }

  private applyMatchState(state: MatchState): void {
    this.match = state;
    this.initialMatchWait = 0;
    this.round = state.round;
    this.hostAvatar.push(state.host);
    this.hostAvatar.setAlive(state.stats.host.alive);
    this.replica.applyStates(state.t, state.zombies);
    this.world.applyOpenDoors(state.openDoorIds);
    this.world.applyBarrierStates(state.barriers);
    if (state.phase === 'gameOver') this.showGameOver(state);
  }

  private replicateAttack(zombieId: number, target: 'host' | 'guest'): void {
    if (target === 'guest') {
      const position = this.ctx.player.rig.position;
      this.replica.attack(zombieId, position.x, position.y, position.z);
      return;
    }
    const host = this.hostAvatar.latest;
    if (host) this.replica.attack(zombieId, host.x, host.y, host.z);
  }

  private restartFromHost(): void {
    this.replica.reset();
    this.world.reset();
    this.world.placeLocalPlayer('guest');
    this.ctx.resetArsenal();
    this.hostAvatar.clear();
    this.match = null;
    this.initialMatchWait = 0;
    this.round = 0;
    if (this.gameOverShown) {
      // The game-over panel released the pointer: a click must re-lock it.
      this.gameOverShown = false;
      this.playing = false;
      this.ctx.hud.hideGameOver();
      this.ctx.hud.showStartScreen(false);
      return;
    }
    if (this.playing) this.send({ type: 'ready' });
  }

  private showGameOver(state: MatchState): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    const guest = state.stats.guest;
    this.ctx.hud.showGameOver({ round: state.round, kills: guest.kills, headshots: guest.headshots });
    this.ctx.unlockPointer();
  }

  /** Without the authority the match cannot continue; the local menu stays usable to leave. */
  private onHostLost(message: string): void {
    if (this.hostLost) return;
    this.hostLost = true;
    this.ctx.hud.showRoundBanner(message, 'OPEN THE MENU TO LEAVE');
    this.ctx.unlockPointer();
  }

  private send(message: GuestMessage): void {
    if (!this.hostLost) this.connection.send(message);
  }

  private pushHud(): void {
    const guest = this.match?.stats.guest;
    this.ctx.hud.updateZombies({
      round: this.round,
      hp: guest?.hp ?? PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      lethalHitDamage: 25,
      kills: guest?.kills ?? 0,
      headshots: guest?.headshots ?? 0,
      points: guest?.points ?? 0,
    });
  }
}
