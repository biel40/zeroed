import * as THREE from 'three';
import { defaultNow } from '../../network/Interpolation';
import type { BarrierNetState, CoopPlayerId, PlayerNetState } from '../../network/Protocol';
import type { PointDoor } from '../../zombies/doors/PointDoor';
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
}
