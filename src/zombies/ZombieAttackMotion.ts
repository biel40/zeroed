import { ZOMBIE_ATTACK_DURATION, ZOMBIE_ATTACK_HIT_MOMENT, ZOMBIE_BARRIER_ATTACK_HIT_MOMENT } from './ZombieConfig';

const MELEE_CONTACT = ZOMBIE_ATTACK_HIT_MOMENT / ZOMBIE_ATTACK_DURATION;
const WINDOW_CONTACT = ZOMBIE_BARRIER_ATTACK_HIT_MOMENT / ZOMBIE_ATTACK_DURATION;
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
export function shapePreservingTangent(before: number, after: number): number {
  if (before * after <= 0) return 0;
  return Math.sign(before) * Math.min(Math.abs((before + after) * 0.5), 2 * Math.abs(before), 2 * Math.abs(after));
}

function sample(
  t: number, windupTime: number, contactTime: number, followTime: number,
  start: number, windup: number, contact: number, follow: number, end: number,
): number {
  const a = (windup - start) / windupTime;
  const b = (contact - windup) / (contactTime - windupTime);
  const c = (follow - contact) / (followTime - contactTime);
  const d = (end - follow) / (1 - followTime);
  let from: number, to: number, velocityFrom: number, velocityTo: number, duration: number, u: number;
  if (t < windupTime) {
    from = start; to = windup; velocityFrom = 0; velocityTo = shapePreservingTangent(a, b);
    duration = windupTime; u = Math.max(0, t) / duration;
  } else if (t < contactTime) {
    from = windup; to = contact; velocityFrom = shapePreservingTangent(a, b); velocityTo = shapePreservingTangent(b, c);
    duration = contactTime - windupTime; u = (t - windupTime) / duration;
  } else if (t < followTime) {
    from = contact; to = follow; velocityFrom = shapePreservingTangent(b, c); velocityTo = shapePreservingTangent(c, d);
    duration = followTime - contactTime; u = (t - contactTime) / duration;
  } else {
    from = follow; to = end; velocityFrom = shapePreservingTangent(c, d); velocityTo = 0;
    duration = 1 - followTime; u = Math.min(1, (t - followTime) / duration);
  }
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * from + (u3 - 2 * u2 + u) * duration * velocityFrom
    + (-2 * u3 + 3 * u2) * to + (u3 - u2) * duration * velocityTo;
}

/** Cock one arm, sweep through contact, let its weight carry across, recover. */
export function sampleMeleeMotion(t: number, start: number, windup: number, contact: number, follow: number, end: number): number {
  // Keep the swipe compact after impact; the remaining cycle eases back to rest.
  const followTime = MELEE_CONTACT + 0.14 / ZOMBIE_ATTACK_DURATION;
  return sample(t, MELEE_CONTACT * 0.66, MELEE_CONTACT, followTime, start, windup, contact, follow, end);
}

/** Compact wind-up behind the board, strike, then pull through recovery. */
export function sampleWindowMotion(t: number, start: number, grab: number, contact: number, pull: number, end: number): number {
  return sample(t, 0.36, WINDOW_CONTACT, 0.82, start, grab, contact, pull, end);
}
