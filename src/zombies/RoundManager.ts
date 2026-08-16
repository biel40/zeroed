import {
  ROUND_BREAK_SECONDS,
  ROUND_START_DELAY,
  roundConfig,
  type RoundConfig,
} from './ZombieConfig';

export type RoundEventType = 'roundStarted' | 'spawnDue' | 'roundComplete';

export interface RoundEvent {
  readonly type: RoundEventType;
  readonly round: number;
  readonly config: RoundConfig;
}

type RoundPhase = 'break' | 'active';

/**
 * Pure round state machine: break → active → break → … forever. It decides
 * WHEN zombies spawn (cadence + alive cap) but knows nothing about Three.js;
 * the caller drains pendingEvents and performs the actual spawns. The alive
 * count is passed in every frame so this class stays fully deterministic and
 * unit-testable.
 */
export class RoundManager {
  /** Events produced during the last update; drain with clearEvents(). */
  readonly pendingEvents: RoundEvent[] = [];
  round = 0;

  private phase: RoundPhase = 'break';
  private timer: number;
  private spawnTimer = 0;
  private pendingSpawns = 0;
  private config: RoundConfig = roundConfig(1);

  constructor(
    private readonly breakDuration = ROUND_BREAK_SECONDS,
    startDelay = ROUND_START_DELAY,
  ) {
    this.timer = startDelay;
  }

  get isActive(): boolean {
    return this.phase === 'active';
  }

  /** Zombies from the current round still waiting to be spawned. */
  get pendingSpawnCount(): number {
    return this.pendingSpawns;
  }

  clearEvents(): void {
    this.pendingEvents.length = 0;
  }

  /** Requeues an emitted spawn that the population pool/map could not place. */
  requeueSpawn(): void {
    if (this.phase === 'active') this.pendingSpawns++;
  }

  /** Back to the pre-round-1 state (used by the game-over restart). */
  reset(startDelay = ROUND_START_DELAY): void {
    this.phase = 'break';
    this.timer = startDelay;
    this.spawnTimer = 0;
    this.pendingSpawns = 0;
    this.round = 0;
    this.config = roundConfig(1);
  }

  update(dt: number, aliveCount: number): void {
    if (this.phase === 'break') {
      this.timer -= dt;
      if (this.timer <= 0) this.startRound();
      return;
    }

    if (this.pendingSpawns > 0) {
      this.spawnTimer -= dt;
      // Spawns issued this frame count towards the cap immediately: the
      // caller's aliveCount only reflects them on the next frame.
      let issuedThisFrame = 0;
      while (
        this.pendingSpawns > 0 &&
        this.spawnTimer <= 0 &&
        aliveCount + issuedThisFrame < this.config.maxAlive
      ) {
        this.pendingEvents.push({ type: 'spawnDue', round: this.round, config: this.config });
        this.pendingSpawns--;
        issuedThisFrame++;
        this.spawnTimer += this.config.spawnInterval;
      }
      return;
    }

    if (aliveCount === 0) {
      this.pendingEvents.push({ type: 'roundComplete', round: this.round, config: this.config });
      this.phase = 'break';
      this.timer = this.breakDuration;
    }
  }

  private startRound(): void {
    this.round++;
    this.config = roundConfig(this.round);
    this.pendingSpawns = this.config.zombieCount;
    this.spawnTimer = 0; // first zombie of the round spawns immediately
    this.phase = 'active';
    this.pendingEvents.push({ type: 'roundStarted', round: this.round, config: this.config });
  }
}
