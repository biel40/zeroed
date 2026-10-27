/**
 * Shaping curves for the view-model choreographies (reload, inspection).
 * Each maps a progress value p over a [start, end] window to a weight.
 */

/** Smooth 0→1→0 curve over [start, end] for a progress value. */
export function pulse(p: number, start: number, end: number): number {
  if (p <= start || p >= end) return 0;
  return Math.sin(((p - start) / (end - start)) * Math.PI);
}

/** 0→1 eased ramp over [start, end]. */
export function ramp(p: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (p - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/** 0→1 over [start, end] gathering speed until it lands: a push or a slam. */
export function accelerate(p: number, start: number, end: number): number {
  return Math.min(1, Math.max(0, (p - start) / (end - start))) ** 2;
}

/** Spring settle over t in [0, 1]: a quick swing that dies out, exactly 0 at both ends. */
export function dampedWobble(t: number): number {
  return Math.exp(-5 * t) * Math.sin(3 * Math.PI * t);
}

/** 0→1 over [start, end] that arrives fast and swings slightly past 1 before settling (ease-out-back). */
export function overshootRamp(p: number, start: number, end: number): number {
  const u = Math.min(1, Math.max(0, (p - start) / (end - start))) - 1;
  return 1 + u * u * (2.2 * u + 1.2);
}

/** Hit envelope over [start, end]: snaps to 1 in its first fifth, then dies away. */
export function impact(p: number, start: number, end: number): number {
  if (p <= start || p >= end) return 0;
  const t = (p - start) / (end - start);
  return t < 0.2 ? Math.sin((t / 0.2) * (Math.PI / 2)) : (1 - (t - 0.2) / 0.8) ** 2;
}
