import { ZOMBIE_ATTACK_DURATION, ZOMBIE_ATTACK_HIT_MOMENT } from './ZombieConfig';

const CONTACT = ZOMBIE_ATTACK_HIT_MOMENT / ZOMBIE_ATTACK_DURATION;
export const BOARD_PULL_DURATION = 0.18;
export const BOARD_PULL_DISTANCE = 0.34;
export const BOARD_PULL_DROP = 0.12;

/** Shared hand/plank trajectory after the nails release at the damage marker. */
export function boardPullProgress(secondsAfterContact: number): number {
  const t = Math.max(0, Math.min(1, secondsAfterContact / BOARD_PULL_DURATION));
  return t * t * (3 - 2 * t);
}

/** Shape-preserving cubic: continuous velocity through a swipe, without
 * overshooting the contact plane or introducing a pause at every pose key. */
function tangent(before: number, after: number): number {
  if (before * after <= 0) return 0;
  return Math.sign(before) * Math.min(Math.abs((before + after) * 0.5), 2 * Math.abs(before), 2 * Math.abs(after));
}

function sample(
  t: number, windupTime: number,
  start: number, windup: number, contact: number, follow: number, end: number,
): number {
  const a = (windup - start) / windupTime;
  const b = (contact - windup) / (CONTACT - windupTime);
  const c = (follow - contact) / (0.82 - CONTACT);
  const d = (end - follow) / 0.18;
  let from: number, to: number, velocityFrom: number, velocityTo: number, duration: number, u: number;
  if (t < windupTime) {
    from = start; to = windup; velocityFrom = 0; velocityTo = tangent(a, b);
    duration = windupTime; u = Math.max(0, t) / duration;
  } else if (t < CONTACT) {
    from = windup; to = contact; velocityFrom = tangent(a, b); velocityTo = tangent(b, c);
    duration = CONTACT - windupTime; u = (t - windupTime) / duration;
  } else if (t < 0.82) {
    from = contact; to = follow; velocityFrom = tangent(b, c); velocityTo = tangent(c, d);
    duration = 0.82 - CONTACT; u = (t - CONTACT) / duration;
  } else {
    from = follow; to = end; velocityFrom = tangent(c, d); velocityTo = 0;
    duration = 0.18; u = Math.min(1, (t - 0.82) / duration);
  }
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * from + (u3 - 2 * u2 + u) * duration * velocityFrom
    + (-2 * u3 + 3 * u2) * to + (u3 - u2) * duration * velocityTo;
}

/** Cock one arm, sweep through contact, let its weight carry across, recover. */
export function sampleMeleeMotion(t: number, start: number, windup: number, contact: number, follow: number, end: number): number {
  return sample(t, 0.42, start, windup, contact, follow, end);
}

/** Compact wind-up behind the board, strike, then pull through recovery. */
export function sampleWindowMotion(t: number, start: number, grab: number, contact: number, pull: number, end: number): number {
  return sample(t, 0.36, start, grab, contact, pull, end);
}
