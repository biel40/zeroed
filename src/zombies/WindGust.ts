import type { WindConeGustConfig, WindWeaponConfig } from '../weapons/WeaponTypes';
import type { Point3 } from './FlameTargeting';

/** Height above or below the burst within which a body's feet still feel it: one storey never reaches the next. */
const VERTICAL_REACH = 2;

export interface WindGustCandidate {
  /** Feet position. */
  readonly position: Point3;
}

/**
 * A body a wind burst shoves: how far from the impact it stands, its share
 * of the burst (1 at the impact .. `edgePush` at the edge) and the unit
 * horizontal direction it is driven.
 */
export interface WindGustHit<T> {
  target: T;
  distance: number;
  share: number;
  dirX: number;
  dirZ: number;
}

/**
 * Bodies a wind burst at `impact` shoves: every candidate within
 * `burstRadius` of it (horizontally, its feet within a storey of the burst),
 * nearest first, at most `maxTargets`. Each is driven straight away from
 * the shooter, so the burst only ever opens room, never pushes a body back
 * onto them; one standing on the shooter is driven along the shot line.
 * Writes into `out` (reused, cleared first) and returns it. Line of sight
 * and liveness are the caller's job.
 */
export function selectWindGustTargets<T extends WindGustCandidate>(
  impact: Point3,
  shooter: { readonly x: number; readonly z: number },
  candidates: Iterable<T>,
  config: Pick<WindWeaponConfig, 'burstRadius' | 'maxTargets' | 'edgePush'>,
  out: WindGustHit<T>[],
): WindGustHit<T>[] {
  out.length = 0;
  const lineX = impact.x - shooter.x;
  const lineZ = impact.z - shooter.z;
  const lineLength = Math.hypot(lineX, lineZ);
  for (const target of candidates) {
    const feet = target.position;
    if (Math.abs(feet.y - impact.y) > VERTICAL_REACH) continue;
    const distance = Math.hypot(feet.x - impact.x, feet.z - impact.z);
    if (distance >= config.burstRadius) continue;
    if (config.maxTargets <= 0 || (out.length >= config.maxTargets && distance >= out[out.length - 1].distance)) continue;
    let dirX = feet.x - shooter.x;
    let dirZ = feet.z - shooter.z;
    let length = Math.hypot(dirX, dirZ);
    if (length < 1e-4) {
      dirX = lineX;
      dirZ = lineZ;
      length = lineLength;
    }
    if (length < 1e-4) continue;
    const share = config.edgePush + (1 - config.edgePush) * (1 - distance / config.burstRadius);
    insertNearest(out, { target, distance, share, dirX: dirX / length, dirZ: dirZ / length }, config.maxTargets);
  }
  return out;
}

/**
 * Bodies a full draw's gust shoves down the shot line: every candidate
 * whose feet stand within a storey of the impact, at least `startDistance`
 * from it (horizontally, past the burst), no further than `gust.length`
 * beyond that along the unit horizontal shot direction (`dirX`, `dirZ`)
 * and inside the cone of `gust.halfAngle` round it, nearest first, at most
 * `gust.maxTargets`. Each is driven along the shot, its share falling from
 * 1 at the start to `gust.edgePush` at the far end. Writes into `out`
 * (reused, cleared first) and returns it; line of sight and liveness are
 * the caller's job.
 */
export function selectWindConeTargets<T extends WindGustCandidate>(
  impact: Point3,
  dirX: number,
  dirZ: number,
  startDistance: number,
  candidates: Iterable<T>,
  gust: WindConeGustConfig,
  out: WindGustHit<T>[],
): WindGustHit<T>[] {
  out.length = 0;
  const end = startDistance + gust.length;
  const spread = Math.tan(gust.halfAngle);
  for (const target of candidates) {
    const feet = target.position;
    if (Math.abs(feet.y - impact.y) > VERTICAL_REACH) continue;
    const offsetX = feet.x - impact.x;
    const offsetZ = feet.z - impact.z;
    const along = offsetX * dirX + offsetZ * dirZ;
    if (along <= 0 || along > end || Math.hypot(offsetX, offsetZ) < startDistance) continue;
    if (Math.abs(offsetX * dirZ - offsetZ * dirX) > along * spread) continue;
    if (gust.maxTargets <= 0 || (out.length >= gust.maxTargets && along >= out[out.length - 1].distance)) continue;
    const share = 1 - (1 - gust.edgePush) * Math.max(0, along - startDistance) / gust.length;
    insertNearest(out, { target, distance: along, share, dirX, dirZ }, gust.maxTargets);
  }
  return out;
}

function insertNearest<T>(out: WindGustHit<T>[], hit: WindGustHit<T>, max: number): void {
  let index = out.length;
  while (index > 0 && out[index - 1].distance > hit.distance) index--;
  if (out.length >= max) out.pop();
  out.splice(index, 0, hit);
}
