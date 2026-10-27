import type { FlameWeaponConfig } from '../weapons/WeaponTypes';

/** Horizontal radius of a zombie body the stream can lick, metres. */
const BODY_RADIUS = 0.35;
/** Span of the body above its feet that the stream can reach. */
const BODY_BOTTOM = 0.2;
const BODY_TOP = 1.8;

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FlameCandidate {
  /** Feet position. */
  readonly position: Point3;
}

/** A scorched zombie and how far from the nozzle it stands. */
export interface FlameHit<T> {
  target: T;
  distance: number;
}

/**
 * Bodies inside the stream: within `reach` metres of `origin` and inside
 * the cone around `direction` (normalised), widened by the body's own
 * radius so a zombie right at the nozzle is never missed. Each body is
 * tested at the height of its torso nearest to the stream's axis. Writes
 * the nearest `config.maxTargets` into `out` (reused, cleared first) and
 * returns it. Line of sight is the caller's job.
 */
export function selectFlameTargets<T extends FlameCandidate>(
  origin: Point3,
  direction: Point3,
  reach: number,
  candidates: Iterable<T>,
  config: Pick<FlameWeaponConfig, 'coneHalfAngle' | 'maxTargets'>,
  out: FlameHit<T>[],
): FlameHit<T>[] {
  out.length = 0;
  for (const target of candidates) {
    const feet = target.position;
    const dx = feet.x - origin.x;
    const dz = feet.z - origin.z;
    const along = dx * direction.x + dz * direction.z;
    if (along <= 0) continue;
    // Height of the stream's axis over the body, clamped to the body.
    const horizontal = Math.hypot(direction.x, direction.z);
    const axisY = origin.y + (horizontal > 1e-4 ? direction.y * (Math.hypot(dx, dz) / horizontal) : 0);
    const y = Math.min(feet.y + BODY_TOP, Math.max(feet.y + BODY_BOTTOM, axisY));
    const dy = y - origin.y;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > reach + BODY_RADIUS || distance < 1e-4) continue;
    const cos = (dx * direction.x + dy * direction.y + dz * direction.z) / distance;
    const allowance = Math.asin(Math.min(1, BODY_RADIUS / distance));
    if (cos < Math.cos(Math.min(Math.PI / 2, config.coneHalfAngle + allowance))) continue;
    insertNearest(out, target, distance, config.maxTargets);
  }
  return out;
}

function insertNearest<T>(out: FlameHit<T>[], target: T, distance: number, max: number): void {
  if (max <= 0) return;
  if (out.length >= max && distance >= out[out.length - 1].distance) return;
  let index = out.length;
  while (index > 0 && out[index - 1].distance > distance) index--;
  if (out.length >= max) out.pop();
  out.splice(index, 0, { target, distance });
}
