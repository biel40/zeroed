/** One phase's reinforcements: seconds between groups (0: none), zombies per group, and the most zombies alive (all of them) it calls them up to. */
export interface GuardianReinforcementGroup {
  readonly every: number;
  readonly size: number;
  readonly cap: number;
}

export interface GuardianReinforcementTuning {
  /** Per phase, 1 to 3. */
  readonly phases: readonly [GuardianReinforcementGroup, GuardianReinforcementGroup, GuardianReinforcementGroup];
  /** Seconds from a new phase to its first group. */
  readonly firstDelay: number;
  /** Ceiling on the cap on reduced-effects devices. */
  readonly reducedCap: number;
}

/** CAPITÁN URSS calls no one at first; Containment Protocol sends pairs, LAST ORDER groups of three. */
export const CAPTAIN_USSR_REINFORCEMENTS: GuardianReinforcementTuning = {
  phases: [
    { every: 0, size: 0, cap: 0 },
    { every: 16, size: 2, cap: 4 },
    { every: 12, size: 3, cap: 6 },
  ],
  firstDelay: 3,
  reducedCap: 4,
};

/**
 * The small groups of zombies a guardian's duel calls in. Pure and
 * deterministic: each frame it says how many zombies are due; the caller
 * spawns them. Never past the phase's cap on zombies alive, never while
 * the guardian is in the middle of an attack (`calm` false), and a group
 * that finds no room waits instead of piling up.
 */
export class GuardianReinforcements {
  private phase: 1 | 2 | 3 = 1;
  private timer = 0;

  public constructor(
    private readonly tuning: GuardianReinforcementTuning,
    private readonly reducedEffects: boolean,
  ) {}

  /** Most zombies alive the current phase calls reinforcements up to. */
  public get cap(): number {
    const { cap } = this.tuning.phases[this.phase - 1];
    return this.reducedEffects ? Math.min(cap, this.tuning.reducedCap) : cap;
  }

  /** Zombies to spawn this frame, with `alive` zombies already up. */
  public update(dt: number, phase: 1 | 2 | 3, alive: number, calm: boolean): number {
    if (phase !== this.phase) {
      this.phase = phase;
      this.timer = this.tuning.firstDelay;
    }
    const group = this.tuning.phases[phase - 1];
    if (group.every <= 0 || group.size <= 0) return 0;
    this.timer = Math.max(0, this.timer - Math.max(0, dt));
    if (this.timer > 0 || !calm) return 0;
    const room = this.cap - Math.max(0, alive);
    if (room <= 0) return 0;
    this.timer = group.every;
    return Math.min(group.size, room);
  }

  public reset(): void {
    this.phase = 1;
    this.timer = 0;
  }
}
