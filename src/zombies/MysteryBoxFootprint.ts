import * as THREE from 'three';
import { MYSTERY_BOX_SIZE } from './MysteryBox';
import type { MysteryBoxPlacement } from './maps/ZombieArena';

/**
 * Solid volume of the closed Mystery Box at its map placement: base rails,
 * front hardware and lid, not the floating reward. Players and zombies are
 * both stopped by it on every map.
 */
export function mysteryBoxFootprint(placement: MysteryBoxPlacement): THREE.Box3 {
  const { position, yaw } = placement;
  const halfWidth = MYSTERY_BOX_SIZE.width / 2 + 0.09;
  const halfDepth = MYSTERY_BOX_SIZE.depth / 2 + 0.11;
  return new THREE.Box3(
    new THREE.Vector3(-halfWidth, 0, -halfDepth),
    new THREE.Vector3(halfWidth, MYSTERY_BOX_SIZE.bodyHeight + 0.36, halfDepth),
  ).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(position.x, position.y, position.z));
}
