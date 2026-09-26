import type { CoopPlayerId, PlayerLifeState } from '../../network/Protocol';

export const DOWNED_DURATION = 20;
export const REVIVE_DURATION = 2;
export const REVIVE_RANGE = 2;
export const REVIVE_HEALTH_PERCENT = 0.4;
/** The prone avatar extends away from its standing network anchor. */
const DOWNED_BODY_HALF_LENGTH = 0.9;

/** Horizontal distance to the visible prone body, rather than only its former standing origin. */
export function isDownedBodyInRange(
  reviverX: number, reviverZ: number, targetX: number, targetZ: number, targetYaw: number,
): boolean {
  const forwardX = -Math.sin(targetYaw);
  const forwardZ = -Math.cos(targetYaw);
  const dx = reviverX - targetX;
  const dz = reviverZ - targetZ;
  const along = Math.max(-DOWNED_BODY_HALF_LENGTH,
    Math.min(DOWNED_BODY_HALF_LENGTH, dx * forwardX + dz * forwardZ));
  return Math.hypot(dx - along * forwardX, dz - along * forwardZ) <= REVIVE_RANGE;
}

/** Match-authoritative life cycle. Time is advanced only by the host simulation. */
export class CoopRevive {
  state: PlayerLifeState = 'alive';
  bleedRemaining = 0;
  reviver: CoopPlayerId | null = null;
  reviveElapsed = 0;

  down(): boolean {
    if (this.state !== 'alive') return false;
    this.state = 'downed';
    this.bleedRemaining = DOWNED_DURATION;
    return true;
  }

  start(reviver: CoopPlayerId): boolean {
    if (this.state !== 'downed' || this.reviver !== null) return false;
    this.reviver = reviver;
    this.reviveElapsed = 0;
    return true;
  }

  cancel(): void {
    this.reviver = null;
    this.reviveElapsed = 0;
  }

  /** Bleed-out wins if both deadlines are crossed in one host tick. */
  update(dt: number, reviverValid: boolean): 'revived' | 'dead' | null {
    if (this.state !== 'downed') return null;
    this.bleedRemaining = Math.max(0, this.bleedRemaining - dt);
    if (this.bleedRemaining === 0) {
      this.state = 'dead';
      this.cancel();
      return 'dead';
    }
    if (this.reviver !== null && !reviverValid) this.cancel();
    if (this.reviver !== null) {
      this.reviveElapsed += dt;
      if (this.reviveElapsed >= REVIVE_DURATION) {
        this.reset();
        return 'revived';
      }
    }
    return null;
  }

  reset(): void {
    this.state = 'alive';
    this.bleedRemaining = 0;
    this.cancel();
  }
}
