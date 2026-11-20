import { CRYPT_LANDING, CRYPT_STAIR, CRYPT_STAIR_X } from '../../DieKathedraleCatacombsConfig';

/** What the observer's place asks of the two levels: how far underground the mood is, and which level can be seen. */
export interface UndergroundPresence {
  /** 0 in the cathedral, 1 on the catacomb floor, blended down the stair. */
  depth: number;
  showCathedral: boolean;
  showCatacombs: boolean;
}

/** Eye heights where the underground mood starts and is complete: the stair's top step and its foot. */
const MOOD_EYE_Y = { start: 1.2, full: -3.8 } as const;
/** Below this eye height the observer is down in the catacombs, wherever they stand. */
const BELOW_GROUND_EYE_Y = -2.5;
/** With the crypt gate open, the catacombs show to anyone this close to the stair's head (they can be seen down the flight). */
const STAIR_SIGHT_RADIUS = 18;
/** The roof and upper flights cannot see through the floor over the crypt. */
const STAIR_SIGHT_EYE_MAX = 3.5;

/** The stair and its landing: from here both levels can be in view. */
function inStairway(x: number, z: number): boolean {
  return x >= CRYPT_LANDING.minX - 0.6 && x <= CRYPT_LANDING.maxX + 0.6
    && z >= CRYPT_LANDING.minZ && z <= CRYPT_STAIR.headZ + 0.3;
}

/**
 * Decides, from where the observer's eye is, how deep the underground mood
 * runs and which level needs drawing: the cathedral is hidden once the
 * observer is down in the catacombs past the stair's landing, the
 * catacombs while the observer is up in the cathedral, unless the crypt
 * gate is open and the stair is near enough to look down. Pure and
 * allocation free; writes into `out`.
 */
export function undergroundPresence(observer: { readonly x: number; readonly y: number; readonly z: number }, cryptOpen: boolean, out: UndergroundPresence): UndergroundPresence {
  const t = (MOOD_EYE_Y.start - observer.y) / (MOOD_EYE_Y.start - MOOD_EYE_Y.full);
  const clamped = Math.min(1, Math.max(0, t));
  out.depth = clamped * clamped * (3 - 2 * clamped);
  const atCryptHeight = observer.y <= STAIR_SIGHT_EYE_MAX;
  const stairway = atCryptHeight && inStairway(observer.x, observer.z);
  const belowGround = observer.y < BELOW_GROUND_EYE_Y;
  out.showCathedral = !belowGround || stairway;
  const nearStair = atCryptHeight
    && Math.hypot(observer.x - CRYPT_STAIR_X, observer.z - CRYPT_STAIR.headZ) < STAIR_SIGHT_RADIUS;
  out.showCatacombs = belowGround || stairway || (cryptOpen && nearStair);
  return out;
}
