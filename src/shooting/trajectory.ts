/**
 * Lightweight projectile integration. Semi-implicit Euler with optional
 * linear drag; good enough for believable drop and time of flight at range
 * distances, and cheap enough to run per substep without allocations.
 */
export interface TrajectoryState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  travelled: number;
}

export function createTrajectory(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  speed: number,
): TrajectoryState {
  return {
    x: ox,
    y: oy,
    z: oz,
    vx: dx * speed,
    vy: dy * speed,
    vz: dz * speed,
    travelled: 0,
  };
}

export function stepTrajectory(
  state: TrajectoryState,
  dt: number,
  gravity: number,
  drag: number,
): void {
  const dragFactor = drag > 0 ? Math.max(0, 1 - drag * dt) : 1;
  state.vx *= dragFactor;
  state.vy = state.vy * dragFactor - gravity * dt;
  state.vz *= dragFactor;

  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z += state.vz * dt;
  state.travelled += Math.sqrt(state.vx * state.vx + state.vy * state.vy + state.vz * state.vz) * dt;
}

/** Flat-fire approximation: how far the bullet falls below the line of sight. */
export function dropAtDistance(distance: number, muzzleVelocity: number, gravity: number): number {
  const t = distance / muzzleVelocity;
  return 0.5 * gravity * t * t;
}

export function timeOfFlight(distance: number, muzzleVelocity: number): number {
  return distance / muzzleVelocity;
}
