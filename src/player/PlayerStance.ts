/** Gameplay posture, independent of camera animation and incapacitation. */
export type PlayerStance = 'standing' | 'crouched' | 'prone';

export const STANCE: Readonly<Record<PlayerStance, { readonly eyeHeight: number; readonly speed: number }>> = {
  standing: { eyeHeight: 1.7, speed: 1 },
  crouched: { eyeHeight: 1.1, speed: 0.55 },
  prone: { eyeHeight: 0.45, speed: 0.25 },
};

export function isPlayerStance(value: unknown): value is PlayerStance {
  return value === 'standing' || value === 'crouched' || value === 'prone';
}

/** Pressing a posture again stands up; jump from either low posture only stands up. */
export function requestedStance(current: PlayerStance, crouch: boolean, prone: boolean, jump: boolean): PlayerStance {
  if (prone) return current === 'prone' ? 'standing' : 'prone';
  if (crouch) return current === 'crouched' ? 'standing' : 'crouched';
  return jump ? 'standing' : current;
}

/** Network positions retain the standing eye anchor used by maps and floor transitions. */
export function stanceEyeOffset(stance: PlayerStance = 'standing'): number {
  return STANCE[stance].eyeHeight - STANCE.standing.eyeHeight;
}
