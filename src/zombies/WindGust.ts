import type { WindWeaponConfig } from '../weapons/WeaponTypes';
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

function insertNearest<T>(out: WindGustHit<T>[], hit: WindGustHit<T>, max: number): void {
  let index = out.length;
  while (index > 0 && out[index - 1].distance > hit.distance) index--;
  if (out.length >= max) out.pop();
  out.splice(index, 0, hit);
}
