/** World-space motion of one cosmetic hat; independent of rendering and gameplay. */
export interface HatMotion {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  resting: boolean;
}

/** One bounded simulation step, with a small bounce followed by ground friction. */
export function stepHatMotion(state: HatMotion, dt: number, floor: number, restHeight: number): void {
  if (state.resting || dt <= 0) return;
  state.vy -= 9.8 * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;
  state.z += state.vz * dt;
  if (state.y > floor + restHeight) return;
  state.y = floor + restHeight;
  if (state.vy < -1.2) {
    state.vy *= -0.26;
    state.vx *= 0.55;
    state.vz *= 0.55;
  } else {
    state.vx = state.vy = state.vz = 0;
    state.resting = true;
  }
}
