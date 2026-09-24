import * as THREE from 'three';
import { defaultNow } from '../../network/Interpolation';
import type { BarrierNetState, CoopPlayerId, PlayerNetState } from '../../network/Protocol';
import type { PointDoor } from '../../zombies/doors/PointDoor';
import type { WallBuy } from '../../zombies/wallbuys/WallBuy';
import type { ArenaAmmoRefill, ArenaCompletionInteraction, ArenaRitualInteraction,
  ArenaSoulLampInteraction, ArenaWeaponPickup } from '../../zombies/maps/ZombieArena';
import type { WindowBarrier } from '../../zombies/barriers/WindowBarrier';
import { WEAPON_DEFINITIONS } from '../../config/weapons';
import { BurnedMansionArena } from '../../zombies/maps/BurnedMansionArena';
import type { ModeContext } from '../GameMode';

const GUEST_SPAWN_OFFSET_X = 1.2;
const DOOR_USE_RANGE = 2.5;
const DOOR_LOOK_DOT = 0.6;
/** Host-side reach for a remote request: latency moved the buyer, facing was checked by their client. */
const REMOTE_DOOR_RANGE = 3.5;

/**
 * Map state shared by both co-op roles: the Burned Mansion arena, collider
 * bookkeeping, doors and barricade boards. It owns no match authority; the
 * host decides who pays and when, and the guest replays those decisions.
 */
export class CoopWorld {
  public readonly arena: BurnedMansionArena;
  /** Host hook: zombie navigation must follow every topology change. */
  public onTopologyChanged: (() => void) | null = null;

  private mapColliders: ReadonlySet<THREE.Object3D>;
  private readonly tmpDirection = new THREE.Vector3();

  public constructor(private readonly ctx: ModeContext) {
    this.arena = new BurnedMansionArena(ctx.scene, ctx.profile);
    this.arena.init();
    this.arena.onBarrierBoardRebuilt = () => ctx.audio.playRepairBoard();
    this.arena.onSoulAbsorbed = (position) => {
      const cue = this.spatialCueFor(position);
      ctx.audio.playSoulAbsorb(cue.pan, cue.attenuation);
    };
    this.arena.onSoulLampCompleted = (position) => {
      const cue = this.spatialCueFor(position);
      ctx.audio.playSoulLampComplete(cue.pan, cue.attenuation);
    };
    this.arena.onSecretRoomUnlocked = (position) => {
      const cue = this.spatialCueFor(position);
      ctx.audio.playSecretRoomUnlock(cue.pan, cue.attenuation);
      ctx.hud.showRoundBanner('A HIDDEN CHAMBER OPENS');
    };
    this.arena.onRitualScare = (position) => {
      const cue = this.spatialCueFor(position);
      ctx.audio.playRitualScare(cue.pan, cue.attenuation);
    };
    ctx.scene.add(this.arena.group);
    ctx.hitColliders.length = 0;
    ctx.hitColliders.push(...this.arena.colliders);
    this.mapColliders = new Set(this.arena.colliders);
    this.arena.onTopologyChanged = () => this.syncTopology();
    ctx.player.setBounds(this.arena.playerBounds);
    ctx.player.setWallColliders(this.arena.wallColliders);
    ctx.player.setFloorTransitions(this.arena.floorTransitions);
  }

  public placeLocalPlayer(slot: CoopPlayerId): void {
    const spawn = this.arena.playerSpawn;
    this.ctx.player.teleport(slot === 'host' ? spawn.x : spawn.x + GUEST_SPAWN_OFFSET_X,
      spawn.y, spawn.z, spawn.floor, this.arena.playerBounds);
  }

  public update(dt: number): void {
    this.arena.update(dt, this.ctx.player.rig.position);
  }

  /** The local player's networked state, sampled from the first-person rig. */
  public localPlayerState(): PlayerNetState {
    const player = this.ctx.player;
    const weapon = this.ctx.getEquippedWeapon();
    player.camera.getWorldDirection(this.tmpDirection);
    const position = player.rig.position;
    return {
      t: defaultNow(),
      x: position.x, y: position.y, z: position.z,
      yaw: player.rig.rotation.y,
      pitch: Math.asin(THREE.MathUtils.clamp(this.tmpDirection.y, -1, 1)),
      floor: player.floor,
      weapon: weapon.definition.id,
      ads: weapon.adsAlpha > 0.5,
      reloading: weapon.state === 'reloading',
      repairBarrierId: this.ctx.input.isDown('KeyE') && !this.ctx.input.leftButtonDown
        ? this.findRepairableBarrier()?.id ?? null : null,
    };
  }

  public findDoor(doorId: string): PointDoor | null {
    return this.arena.doors.find((door) => door.id === doorId) ?? null;
  }

  /** Locked door the local player is close to and facing. */
  public findFacingDoor(): PointDoor | null {
    const player = this.ctx.player;
    const position = player.rig.position;
    player.camera.getWorldDirection(this.tmpDirection);
    let best: PointDoor | null = null;
    let bestDot = DOOR_LOOK_DOT;
    for (const door of this.arena.doors) {
      if (!door.isLocked || door.floor !== player.floor) continue;
      const dx = door.position.x - position.x;
      const dz = door.position.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > DOOR_USE_RANGE) continue;
      const dot = distance < 1e-3 ? 1 : (this.tmpDirection.x * dx + this.tmpDirection.z * dz) / distance;
      if (dot > bestDot) {
        best = door;
        bestDot = dot;
      }
    }
    return best;
  }

  public isDoorInRemoteReach(door: PointDoor, state: PlayerNetState): boolean {
    return door.floor === state.floor
      && Math.hypot(door.position.x - state.x, door.position.z - state.z) <= REMOTE_DOOR_RANGE;
  }

  public findWallBuy(id: string): WallBuy | null {
    return this.arena.wallBuys.find((wallBuy) => wallBuy.id === id) ?? null;
  }

  public findFacingSoulLamp(): ArenaSoulLampInteraction | null {
    return this.findFacing(this.arena.soulLampInteractions.filter((lamp) => !lamp.activated));
  }

  public findRepairableBarrier(): WindowBarrier | null {
    const position = this.ctx.player.rig.position;
    this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    let best: WindowBarrier | null = null;
    let bestDot = 0.45;
    for (const barrier of this.arena.barriers) {
      if (!barrier.isDamaged || barrier.floor !== this.ctx.player.floor) continue;
      const dx = barrier.position.x - position.x;
      const dz = barrier.position.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 2.2) continue;
      const dot = distance < 1e-3 ? 1 : (this.tmpDirection.x * dx + this.tmpDirection.z * dz) / distance;
      if (dot > bestDot) { best = barrier; bestDot = dot; }
    }
    return best;
  }

  public isRemoteAtBarrier(barrier: WindowBarrier, state: PlayerNetState): boolean {
    if (barrier.floor !== state.floor || !barrier.isDamaged) return false;
    const dx = barrier.position.x - state.x;
    const dz = barrier.position.z - state.z;
    const distance = Math.hypot(dx, dz);
    return distance <= 2.7 && (distance < 1e-3
      || (-Math.sin(state.yaw) * dx - Math.cos(state.yaw) * dz) / distance >= 0.35);
  }

  public findFacingRitual(): ArenaRitualInteraction | null {
    const ritual = this.arena.ritualInteraction;
    return ritual.available ? this.findFacing([ritual]) : null;
  }

  public findFacingPickup(): ArenaWeaponPickup | null {
    return this.findFacing(this.arena.weaponPickups.filter((pickup) => pickup.available
      && (!pickup.requiredDoorId || this.findDoor(pickup.requiredDoorId)?.isLocked === false)));
  }

  public findFacingAmmoRefill(): ArenaAmmoRefill | null {
    return this.findFacing(this.arena.ammoRefills);
  }

  public findFacingCompletion(): ArenaCompletionInteraction | null {
    const completion = this.arena.completionInteraction;
    return !completion.requiredDoorId || this.findDoor(completion.requiredDoorId)?.isLocked === false
      ? this.findFacing([completion]) : null;
  }

  public isRemoteInReach(item: { readonly position: { readonly x: number; readonly z: number };
    readonly floor: number; readonly useRange: number; readonly lookDotMin: number }, state: PlayerNetState): boolean {
    if (item.floor !== state.floor) return false;
    const dx = item.position.x - state.x;
    const dz = item.position.z - state.z;
    const distance = Math.hypot(dx, dz);
    return distance <= item.useRange + 0.5 && (distance < 1e-3
      || (-Math.sin(state.yaw) * dx - Math.cos(state.yaw) * dz) / distance >= item.lookDotMin - 0.1);
  }

  private findFacing<T extends { readonly position: { readonly x: number; readonly z: number };
    readonly floor: number; readonly useRange: number; readonly lookDotMin: number }>(items: readonly T[]): T | null {
    const position = this.ctx.player.rig.position;
    this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    let best: T | null = null;
    let bestDot = -1;
    for (const item of items) {
      if (item.floor !== this.ctx.player.floor) continue;
      const dx = item.position.x - position.x;
      const dz = item.position.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > item.useRange) continue;
      const dot = distance < 1e-3 ? 1 : (this.tmpDirection.x * dx + this.tmpDirection.z * dz) / distance;
      if (dot >= item.lookDotMin && dot > bestDot) { best = item; bestDot = dot; }
    }
    return best;
  }

  public findFacingWallBuy(): WallBuy | null {
    const position = this.ctx.player.rig.position;
    this.ctx.player.camera.getWorldDirection(this.tmpDirection);
    let best: WallBuy | null = null;
    let bestDot = -1;
    for (const wallBuy of this.arena.wallBuys) {
      if (wallBuy.floor !== this.ctx.player.floor) continue;
      const dx = wallBuy.position.x - position.x;
      const dz = wallBuy.position.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > wallBuy.useRange) continue;
      const dot = distance < 1e-3 ? 1 : (this.tmpDirection.x * dx + this.tmpDirection.z * dz) / distance;
      if (dot >= wallBuy.lookDotMin && dot > bestDot) {
        best = wallBuy;
        bestDot = dot;
      }
    }
    return best;
  }

  public isWallBuyInRemoteReach(wallBuy: WallBuy, state: PlayerNetState): boolean {
    if (wallBuy.floor !== state.floor) return false;
    const dx = wallBuy.position.x - state.x;
    const dz = wallBuy.position.z - state.z;
    const distance = Math.hypot(dx, dz);
    if (distance > wallBuy.useRange + 0.5) return false;
    return distance < 1e-3 || (-Math.sin(state.yaw) * dx - Math.cos(state.yaw) * dz) / distance
      >= wallBuy.lookDotMin - 0.1;
  }

  public wallBuyPrompt(wallBuy: WallBuy, owned: boolean): string {
    const key = this.ctx.profile.useTouchControls ? 'Tap USE' : 'Press E';
    const label = WEAPON_DEFINITIONS[wallBuy.weaponId].name;
    return owned
      ? `${key} — ${label} Ammo — ${wallBuy.ammoPrice} PTS`
      : `${key} — Buy ${label} — ${wallBuy.price} PTS`;
  }

  public isLocalInBoxRange(): boolean {
    const player = this.ctx.player;
    player.camera.getWorldDirection(this.tmpDirection);
    return this.isBoxInReach(player.floor, player.rig.position.x, player.rig.position.z,
      this.tmpDirection.x, this.tmpDirection.z, 0);
  }

  public isRemoteInBoxRange(state: PlayerNetState): boolean {
    return this.isBoxInReach(state.floor, state.x, state.z,
      -Math.sin(state.yaw), -Math.cos(state.yaw), 0.5);
  }

  private isBoxInReach(floor: number, x: number, z: number, forwardX: number, forwardZ: number,
    slack: number): boolean {
    const box = this.arena.mysteryBoxPlacement;
    if (floor !== box.floor) return false;
    const dx = box.position.x - x;
    const dz = box.position.z - z;
    const distance = Math.hypot(dx, dz);
    return distance <= box.useRange + slack
      && (distance < 1e-3 || (forwardX * dx + forwardZ * dz) / distance >= box.lookDotMin - slack * 0.2);
  }

  public doorPrompt(door: PointDoor): string {
    const key = this.ctx.profile.useTouchControls ? 'Tap USE' : 'Press E';
    return door.prompt
      ? `USE — ${door.prompt} — ${door.cost} PTS`
      : `UNLOCK ${door.id.toUpperCase().replace(/-/g, ' ')}\n${key} — ${door.cost} PTS`;
  }

  public showDoorDenied(door: PointDoor): void {
    this.ctx.hud.flashNotEnoughPoints();
    this.ctx.hud.showRoundBanner(door.requiredMessage ?? 'NOT ENOUGH POINTS',
      door.requiredMessage ? undefined : `${door.cost} PTS NEEDED`);
  }

  /**
   * Opens a locked door for everyone. `spend` charges the buyer atomically;
   * a replicated opening passes a free opener so no wallet is touched.
   */
  public unlockDoor(door: PointDoor, spend: (cost: number) => boolean): boolean {
    if (!door.isLocked || !door.tryUnlock(spend).success) return false;
    if (this.arena.activateDoor(door.id)) {
      this.ctx.audio.playDoorUnlock();
      // The bunker animates open first; the arena reports its topology change later.
      if (door.id !== 'nuclear-bunker') this.syncTopology();
    }
    return true;
  }

  public get openDoorIds(): string[] {
    return this.arena.doors.filter((door) => !door.isLocked).map((door) => door.id);
  }

  public applyOpenDoors(doorIds: readonly string[]): void {
    for (const doorId of doorIds) {
      const door = this.findDoor(doorId);
      if (door?.isLocked) this.unlockDoor(door, () => true);
    }
  }

  public barrierStates(): BarrierNetState[] {
    return this.arena.barriers.map((barrier) => ({
      id: barrier.id,
      boards: barrier.boards.map((board) => board.hp),
    }));
  }

  public applyBarrierStates(states: readonly BarrierNetState[]): void {
    for (const state of states) {
      this.arena.barriers.find((barrier) => barrier.id === state.id)?.applyReplicatedBoards(state.boards);
    }
  }

  public reset(): void {
    this.arena.reset();
    this.syncTopology();
  }

  private syncTopology(): void {
    this.arena.refreshSpawnPoints();
    this.arena.refreshColliders();
    // Only static map objects are swapped: live zombie hitboxes share this array.
    const colliders = this.ctx.hitColliders;
    for (let index = colliders.length - 1; index >= 0; index--) {
      if (this.mapColliders.has(colliders[index])) colliders.splice(index, 1);
    }
    colliders.push(...this.arena.colliders);
    this.mapColliders = new Set(this.arena.colliders);
    this.ctx.player.setWallColliders(this.arena.wallColliders);
    this.onTopologyChanged?.();
  }

  private spatialCueFor(position: THREE.Vector3): { pan: number; attenuation: number } {
    const camera = this.ctx.player.camera;
    const listener = camera.getWorldPosition(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const dx = position.x - listener.x;
    const dy = position.y - listener.y;
    const dz = position.z - listener.z;
    const horizontal = Math.hypot(dx, dz);
    const distance = Math.hypot(horizontal, dy);
    return {
      pan: horizontal > 0.001 ? THREE.MathUtils.clamp((-forward.z * dx + forward.x * dz) / horizontal, -1, 1) : 0,
      attenuation: THREE.MathUtils.clamp(1 / (1 + Math.max(0, distance - 2) * 0.12), 0.18, 1),
    };
  }
}
