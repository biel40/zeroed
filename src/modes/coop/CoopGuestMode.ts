import * as THREE from 'three';
import { WEAPON_DEFINITIONS } from '../../config/weapons';
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
import { KNIFE_RANGE, Knife } from '../../weapons/Knife';
import { MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, MysteryBoxMachine } from '../../zombies/MysteryBox';
import { MysteryBoxView } from '../../zombies/MysteryBoxView';
import { EnergyProjectiles } from '../../zombies/EnergyProjectiles';
import { ChainLightning } from '../../zombies/ChainLightning';
import type { Zombie } from '../../zombies/Zombie';
import { PLAYER_MAX_HP } from '../../zombies/ZombieConfig';
import { ZombieReplica } from '../../zombies/ZombieReplica';
import type { GameMode, ModeContext } from '../GameMode';
import { CoopWorld } from './CoopWorld';
import { COOP_STARTING_WEAPONS, COOP_WEAPONS, coopReserveAmmo } from './CoopWeapons';

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
  public readonly startingInventory = COOP_STARTING_WEAPONS;
  public readonly maxWeapons = 2;
  public readonly sharedSimulation = true;
  public readonly reserveAmmoFor = coopReserveAmmo;

  private ctx!: ModeContext;
  private world!: CoopWorld;
  private replica!: ZombieReplica;
  private energy!: EnergyProjectiles;
  private chain!: ChainLightning;
  private hostAvatar!: RemotePlayer;
  private readonly box = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING);
  private boxView!: MysteryBoxView;
  private match: MatchState | null = null;
  /** Host round as last announced (event) or snapshotted; the guest never advances it. */
  private round = 0;
  private playing = false;
  private hostLost = false;
  private gameOverShown = false;
  private sendElapsed = 0;
  private initialMatchWait = 0;
  private wallBuyPending = false;
  private wallBuyWait = 0;
  private boxPending = false;
  private boxWait = 0;
  private readonly knife = new Knife();
  private readonly knifeRaycaster = new THREE.Raycaster();
  private readonly knifeOrigin = new THREE.Vector3();
  private readonly knifeDirection = new THREE.Vector3();

  public constructor(private readonly connection: CoopConnection) {}

  public init(ctx: ModeContext): void {
    this.ctx = ctx;
    this.world = new CoopWorld(ctx);
    this.boxView = new MysteryBoxView(ctx.assets, this.world.arena.mysteryBoxPlacement.position, MYSTERY_BOX_POOL);
    this.boxView.group.rotation.y = this.world.arena.mysteryBoxPlacement.yaw;
    ctx.scene.add(this.boxView.group);
    this.world.placeLocalPlayer('guest');
    const castShadows = !ctx.profile.useReducedEffects;
    this.replica = new ZombieReplica(ctx.assets.getZombieModels(), castShadows, ctx.hitColliders);
    ctx.scene.add(this.replica.group);
    this.energy = new EnergyProjectiles(ctx.hitColliders, ctx.scene);
    this.energy.onImpact = (_point, config) => {
      if (config === WEAPON_DEFINITIONS.tesla.energy) ctx.audio.playTeslaShot();
      else ctx.audio.playRayImpact();
    };
    this.chain = new ChainLightning(ctx.scene);
    this.knife.onSwing = () => ctx.audio.playKnifeSwing();
    this.knife.onImpact = () => this.applyKnifeImpact();
    ctx.player.camera.add(this.knife.root);
    this.hostAvatar = new RemotePlayer(createRemoteAvatar(ctx.assets.getPlayerModel(), castShadows));
    ctx.scene.add(this.hostAvatar.root);
    ctx.hud.setZombiesPanelVisible(true);
    ctx.hud.setCoopPresentation('guest');
    ctx.hud.setZombiesRestartHandler(() => ctx.returnToMainMenu());
    ctx.hud.setCreditsMainMenuHandler(() => ctx.returnToMainMenu());
    this.connection.onMessage = (message) => this.handleMessage(message);
    this.connection.onClose = () => this.onHostLost('CONNECTION LOST');
    this.pushHud();
  }

  public update(dt: number): void {
    if (this.boxPending) {
      this.boxWait += dt;
      if (this.boxWait >= 5) {
        this.boxPending = false;
        this.ctx.hud.showRoundBanner('BOX NOT CONFIRMED');
      }
    }
    if (this.wallBuyPending) {
      this.wallBuyWait += dt;
      if (this.wallBuyWait >= 5) {
        this.wallBuyPending = false;
        this.ctx.hud.showRoundBanner('PURCHASE NOT CONFIRMED');
      }
    }
    if (!this.isGameplayInputEnabled() && this.knife.enabled) this.knife.reset();
    this.knife.setEnabled(this.knife.isAttacking);
    this.knife.update(dt, false, this.ctx.player.speed01);
    if (!this.knife.isAttacking) this.knife.setEnabled(false);
    this.world.update(dt);
    this.boxView.update(dt, this.box);
    this.replica.update(dt);
    this.energy.update(dt);
    this.chain.update(dt);
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
    _normal: THREE.Vector3, object: THREE.Object3D, weapon: Weapon): void {
    const zombie = object.userData.zombie as Zombie | undefined;
    const zombieId = zombie ? this.replica.networkIdOf(zombie) : null;
    if (zombieId === null || this.hostLost) return;
    const headshot = object.userData.hitPart === 'head';
    this.ctx.stats.registerHit(distance);
    this.ctx.hud.showHitmarker(headshot);
    this.send({ type: 'zombieHitClaim', weapon: weapon.definition.id, zombieId, part: headshot ? 'head' : 'torso' });
  }

  /** Local shots render immediately; the host owns all special-weapon damage. */
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
    this.playing = true;
    this.initialMatchWait = 0;
    this.send({ type: 'ready' });
  }

  /** The game-over panel owns the cursor; otherwise ESC opens the local menu. */
  public onPointerUnlock(): boolean {
    return !this.hostLost && (this.gameOverShown || this.match?.phase === 'ending' || this.match?.phase === 'credits');
  }

  public isGameplayInputEnabled(): boolean {
    return this.playing && !this.hostLost && this.match?.phase === 'playing' && this.match.stats.guest.alive;
  }

  public onInteract(): void {
    if (!this.isGameplayInputEnabled()) return;
    const door = this.world.findFacingDoor();
    if (door) { this.send({ type: 'doorPurchase', doorId: door.id }); return; }
    if (this.world.findRepairableBarrier()) return;
    const equippedWeapon = this.ctx.getEquippedWeaponId();
    const lamp = this.world.findFacingSoulLamp();
    if (lamp) { this.send({ type: 'mapUse', kind: 'lamp', id: lamp.id, equippedWeapon }); return; }
    const ritual = this.world.findFacingRitual();
    if (ritual) { this.send({ type: 'mapUse', kind: 'ritual', id: ritual.id, equippedWeapon }); return; }
    const wallBuy = this.world.findFacingWallBuy();
    if (wallBuy) {
      if (this.wallBuyPending) return;
      const refill = this.ctx.hasWeapon(wallBuy.weaponId);
      if (refill && !this.ctx.canRefillWeaponAmmo(wallBuy.weaponId)) {
        this.ctx.hud.showRoundBanner('AMMO FULL', WEAPON_DEFINITIONS[wallBuy.weaponId].name);
        return;
      }
      this.wallBuyPending = true;
      this.wallBuyWait = 0;
      this.send({ type: 'wallBuyPurchase', wallBuyId: wallBuy.id, refill, equippedWeapon });
      return;
    }
    const pickup = this.world.findFacingPickup();
    if (pickup) { this.send({ type: 'mapUse', kind: 'pickup', id: pickup.id, equippedWeapon }); return; }
    const refill = this.world.findFacingAmmoRefill();
    if (refill) {
      if (!this.ctx.canRefillEquippedWeaponAmmo()) { this.ctx.hud.showRoundBanner('AMMO FULL'); return; }
      this.send({ type: 'mapUse', kind: 'ammo', id: refill.id, equippedWeapon });
      return;
    }
    const completion = this.world.findFacingCompletion();
    if (completion) { this.send({ type: 'mapUse', kind: 'completion', id: completion.id, equippedWeapon }); return; }
    if (this.world.isLocalInBoxRange() && !this.boxPending) {
      this.boxPending = true;
      this.boxWait = 0;
      this.send({ type: 'boxUse', action: this.box.state === 'awaitingPickup' ? 'pickup' : 'activate', equippedWeapon });
    }
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
    const key = this.ctx.profile.useTouchControls ? 'Tap USE' : 'Press E';
    if (this.world.findRepairableBarrier()) return `REPAIR BARRICADE\n${this.ctx.profile.useTouchControls ? 'Hold USE' : 'Hold E'}`;
    if (this.world.findFacingSoulLamp()) return `ACTIVATE SOUL LAMP\n${key}`;
    if (this.world.findFacingRitual()) return `TOUCH THE RITUAL CIRCLE\n${key}`;
    const wallBuy = this.world.findFacingWallBuy();
    if (wallBuy) return this.world.wallBuyPrompt(wallBuy, this.ctx.hasWeapon(wallBuy.weaponId));
    const pickup = this.world.findFacingPickup();
    if (pickup) return `${pickup.interactionLabel}\n${key}`;
    const refill = this.world.findFacingAmmoRefill();
    if (refill) return `${refill.interactionLabel}\n${key}`;
    const completion = this.world.findFacingCompletion();
    if (completion) return `ACTIVATE FINAL\n${key} — ${completion.cost} PTS`;
    if (!this.world.isLocalInBoxRange()) return null;
    if (this.box.state === 'closed') return `MYSTERY BOX\n${key} — ${MYSTERY_BOX_TUNING.cost} PTS`;
    if (this.box.state === 'awaitingPickup' && this.match?.box.owner === 'guest' && this.box.result) {
      return `${key} to take ${WEAPON_DEFINITIONS[this.box.result].name}`;
    }
    return null;
  }

  public onExit(): void {
    this.knife.reset();
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
        if (WEAPON_DEFINITIONS[message.weapon].energy) {
          this.energy.fire(new THREE.Vector3(message.origin.x, message.origin.y, message.origin.z),
            new THREE.Vector3(message.direction.x, message.direction.y, message.direction.z),
            WEAPON_DEFINITIONS[message.weapon].energy!);
        }
        break;
      case 'teslaChain':
        this.chain.discharge(message.points.map((point) => new THREE.Vector3(point.x, point.y, point.z)));
        this.ctx.audio.playTeslaChain(Math.max(0, message.points.length - 1));
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
      case 'wallBuyDelivered':
        this.wallBuyPending = false;
        if (message.refill) this.ctx.refillWeaponAmmo(message.weapon);
        else this.ctx.grantWeapon(message.weapon);
        break;
      case 'wallBuyFailed':
        this.wallBuyPending = false;
        if (message.reason === 'insufficientPoints') {
          this.ctx.hud.flashNotEnoughPoints();
          this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS');
        } else if (message.reason === 'ammoFull') this.ctx.hud.showRoundBanner('AMMO FULL');
        else this.ctx.hud.showRoundBanner('PURCHASE UNAVAILABLE');
        break;
      case 'boxGranted':
        this.boxPending = false;
        this.ctx.grantWeapon(message.weapon);
        this.ctx.audio.playMysteryBoxPickup();
        break;
      case 'milestoneWeapon':
        this.ctx.grantWeapon(message.weapon);
        this.ctx.hud.showRoundBanner('RAY GUN UNLOCKED');
        this.ctx.audio.playMysteryBoxReveal(true);
        break;
      case 'boxFailed':
        this.boxPending = false;
        if (message.reason === 'insufficientPoints') {
          this.ctx.hud.flashNotEnoughPoints();
          this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS', `${MYSTERY_BOX_TUNING.cost} PTS NEEDED`);
        } else if (message.reason === 'reserved') this.ctx.hud.showRoundBanner('BOX RESERVED FOR PARTNER');
        else this.ctx.hud.showRoundBanner('BOX UNAVAILABLE');
        break;
      case 'mapUsed':
        if (message.kind === 'lamp') this.world.arena.soulLampInteractions.find((entry) => entry.id === message.id)?.activate();
        else if (message.kind === 'ritual') this.world.arena.ritualInteraction.activate();
        else if (message.kind === 'pickup') {
          this.world.arena.weaponPickups.find((entry) => entry.id === message.id)?.claim();
          if (message.buyer === 'guest' && message.weapon) this.ctx.grantWeapon(message.weapon);
        } else if (message.kind === 'ammo') {
          this.world.arena.ammoRefills.find((entry) => entry.id === message.id)?.activate();
          if (message.buyer === 'guest' && message.weapon) this.ctx.refillWeaponAmmo(message.weapon);
        }
        break;
      case 'mapUseFailed':
        if (message.reason === 'insufficientPoints') this.ctx.hud.showRoundBanner('NOT ENOUGH POINTS');
        else if (message.reason === 'ammoFull') this.ctx.hud.showRoundBanner('AMMO FULL');
        else this.ctx.hud.showRoundBanner('UNAVAILABLE');
        break;
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
    const previousBox = this.box.snapshot();
    const previousPhase = this.match?.phase;
    this.match = state;
    this.initialMatchWait = 0;
    this.round = state.round;
    this.hostAvatar.push(state.host);
    this.hostAvatar.setAlive(state.stats.host.alive);
    this.replica.applyStates(state.t, state.zombies);
    this.world.applyOpenDoors(state.openDoorIds);
    this.world.applyBarrierStates(state.barriers);
    this.world.arena.applySecretSnapshot(state.secret);
    for (const id of state.claimedPickupIds) this.world.arena.weaponPickups.find((entry) => entry.id === id)?.claim();
    this.box.applySnapshot(state.box);
    if (previousBox.phase !== state.box.phase) {
      this.boxPending = false;
      if (state.box.phase === 'opening') this.ctx.audio.playMysteryBoxOpen();
      else if (state.box.phase === 'awaitingPickup') this.ctx.audio.playMysteryBoxReveal(
        MYSTERY_BOX_POOL.some((entry) => entry.weaponId === state.box.result && entry.rarity !== 'standard'));
      else if (state.box.phase === 'closing') this.ctx.audio.playMysteryBoxClose();
    } else if (state.box.phase === 'rolling' && previousBox.displayWeapon !== state.box.displayWeapon) {
      this.ctx.audio.playMysteryBoxTick();
    }
    if (state.phase === 'gameOver') this.showGameOver(state);
    else if (previousPhase !== state.phase && state.phase === 'ending') {
      this.ctx.hud.showEnding(state.round);
      this.ctx.unlockPointer();
    } else if (previousPhase !== state.phase && state.phase === 'credits') this.ctx.hud.showCredits();
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
    this.knife.reset();
    this.wallBuyPending = false;
    this.boxPending = false;
    this.box.reset();
    this.energy.reset();
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

  private applyKnifeImpact(): void {
    if (!this.usesFallbackAttack()) return;
    const camera = this.ctx.player.camera;
    camera.updateWorldMatrix(true, false);
    this.replica.group.updateMatrixWorld(true);
    camera.getWorldPosition(this.knifeOrigin);
    camera.getWorldDirection(this.knifeDirection);
    this.knifeRaycaster.set(this.knifeOrigin, this.knifeDirection);
    this.knifeRaycaster.near = 0;
    this.knifeRaycaster.far = KNIFE_RANGE;
    const impact = this.knifeRaycaster.intersectObjects(this.ctx.hitColliders, false)[0];
    const zombie = impact?.object.userData.zombie as Zombie | undefined;
    const zombieId = zombie ? this.replica.networkIdOf(zombie) : null;
    if (!zombie?.isAlive || zombie.floor !== this.ctx.player.floor || zombieId === null) return;
    this.ctx.stats.registerHit(impact.distance);
    this.ctx.hud.showHitmarker();
    this.ctx.audio.playKnifeHit();
    this.ctx.effects.puff(impact.point, 0x6e1d16, 0.24);
    this.send({ type: 'knifeHitClaim', zombieId });
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
