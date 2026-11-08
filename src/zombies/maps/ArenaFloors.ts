import { EYE_HEIGHT, type FloorTransitionZone } from '../../player/PlayerController';
import type { ZombieNavigationBounds } from './ZombieArena';

/**
 * Physical floor height of a logical floor: its navigation bounds first,
 * then the portal that leads onto it, else ground level. Shared by the
 * horde, dropped quest items and thrown grenades so every client agrees.
 */
export function arenaFloorHeight(
  bounds: ReadonlyArray<ZombieNavigationBounds>,
  transitions: ReadonlyArray<FloorTransitionZone>,
  floor: number,
): number {
  const entry = bounds.find((candidate) => candidate.floor === floor);
  if (entry?.baseY !== undefined) return entry.baseY;
  const portal = transitions.find((transition) => transition.targetFloor === floor);
  return portal ? portal.targetY - EYE_HEIGHT : 0;
}
