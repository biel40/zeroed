export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential approach. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export interface AnalogStickResult {
  /** Normalized axes, -1..1 on both, dead-zone shaped. */
  readonly x: number;
  readonly y: number;
  /** Clamped knob offset in px, for positioning the joystick visual. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Maps a virtual-joystick finger offset to analog axes. Deflection beyond
 * the radius is clamped (fast swipes never exceed full input), and the dead
 * zone is rescaled into a smooth 0..1 ramp so the stick has no jump at the
 * dead-zone edge. Screen-space Y grows downward; callers flip Y as needed.
 */
export function analogStick(
  dx: number,
  dy: number,
  radius: number,
  deadZone: number,
): AnalogStickResult {
  const distance = Math.hypot(dx, dy);
  const travel = Math.min(distance, radius);
  const dirX = distance > 0 ? dx / distance : 0;
  const dirY = distance > 0 ? dy / distance : 0;
  const magnitude = travel / radius;
  const strength = magnitude < deadZone ? 0 : (magnitude - deadZone) / (1 - deadZone);
  return {
    // Guard against signed zero (-0) leaking into the axes.
    x: strength === 0 ? 0 : dirX * strength,
    y: strength === 0 ? 0 : dirY * strength,
    offsetX: dirX * travel,
    offsetY: dirY * travel,
  };
}
