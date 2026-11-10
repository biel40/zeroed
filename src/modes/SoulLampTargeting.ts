import * as THREE from 'three';
import type { PlayerController } from '../player/PlayerController';
import type { ArenaSoulLampInteraction, ZombieArena } from '../zombies/maps/ZombieArena';

/** Shared by the interaction prompt and USE in solo and co-op. */
export class SoulLampTargeting {
  private readonly eye = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly intersection = new THREE.Vector3();

  public findFacing(arena: ZombieArena, player: PlayerController): ArenaSoulLampInteraction | null {
    const lamps = arena.soulLampInteractions;
    if (!lamps?.length) return null;

    const position = player.rig.position;
    player.camera.getWorldDirection(this.forward);
    player.camera.getWorldPosition(this.eye);
    let best: ArenaSoulLampInteraction | null = null;
    let bestDot = -1;
    for (const lamp of lamps) {
      if (lamp.activated || lamp.floor !== player.floor) continue;
      const dx = lamp.position.x - position.x;
      const dz = lamp.position.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > lamp.useRange) continue;
      const dot = distance < 1e-3 ? 1 : (this.forward.x * dx + this.forward.z * dz) / distance;
      if (dot >= lamp.lookDotMin && dot > bestDot
        && this.isVisibleFrom(arena, lamp, this.eye.x, this.eye.y, this.eye.z)) {
        best = lamp;
        bestDot = dot;
      }
    }
    return best;
  }

  public isVisibleFrom(arena: ZombieArena, lamp: ArenaSoulLampInteraction, x: number, y: number, z: number): boolean {
    const walls = arena.wallColliders;
    if (!walls?.length) return true;

    const { origin, direction } = this.ray;
    origin.set(x, y, z);
    direction.set(lamp.position.x, lamp.position.y, lamp.position.z).sub(origin);
    const distanceSq = direction.lengthSq();
    if (distanceSq === 0) return true;
    direction.normalize();
    for (const wall of walls) {
      const hit = this.ray.intersectBox(wall, this.intersection);
      if (hit && hit.distanceToSquared(origin) < distanceSq) return false;
    }
    return true;
  }
}
