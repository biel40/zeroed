import * as THREE from 'three';
import { F1GrenadeModel } from '../../../weapons/F1GrenadeModel';
import { WALL_BUY_OUTLINE_MATERIAL } from '../../wallbuys/WallBuyView';
import type { ArenaGrenadeBuy } from '../ZombieArena';

/** Map-owned placement of a grenade wall; the pouch and its refill belong to the mode. */
export interface GrenadeWallBuyPlacement extends ArenaGrenadeBuy {
  /** Turns the outline to face the room (0 faces +Z), like a weapon wall buy. */
  readonly yaw: number;
}

/** The chalk F-1s are drawn this many times life size, flattened against the wall. */
const OUTLINE_SCALE = 3;
const OUTLINE_DEPTH = 0.18;
/** Two grenades side by side, leaning apart: x offset (m) and tilt (rad). */
const PAIR: ReadonlyArray<readonly [number, number]> = [[-0.1, 0.22], [0.1, -0.22]];

/**
 * A grenade wall: the luminous outline of a pair of F-1s in the same glow
 * as the weapon wall buys, 2 cm off the wall face. Returns the placement the
 * mode reads; the outline itself is pure decoration.
 */
export function buildGrenadeWallBuy(parent: THREE.Group, placement: GrenadeWallBuyPlacement): ArenaGrenadeBuy {
  const group = new THREE.Group();
  group.name = `grenade-buy:${placement.id}`;
  group.userData.mapRole = 'grenade-buy';
  group.position.set(placement.position.x, placement.position.y, placement.position.z);
  group.rotation.y = placement.yaw;
  for (const [x, tilt] of PAIR) {
    const outline = new F1GrenadeModel(false, WALL_BUY_OUTLINE_MATERIAL);
    outline.root.position.x = x;
    outline.root.rotation.z = tilt;
    outline.root.scale.set(OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE * OUTLINE_DEPTH);
    group.add(outline.root);
  }
  parent.add(group);
  return placement;
}
