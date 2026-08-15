export type BarrierState = 'intact' | 'damaged' | 'destroyed' | 'repairing';

export interface BarrierBoard {
  /** 0 = destroyed, >0 = intact/damaged. */
  hp: number;
  readonly maxHp: number;
}

export interface WindowBarrierConfig {
  readonly boardCount: number;
  readonly boardHp: number;
  /** Seconds between rebuilding one board while holding repair. */
  readonly repairInterval: number;
  /** Max boards that award points per round (per window). */
  readonly repairRewardCap: number;
}

export interface RepairResult {
  readonly boardsRepaired: number;
  readonly rewardableBoards: number;
}

/**
 * Pure logic for a boarded window. Zombies attack boards one at a time;
 * the player rebuilds them at a fixed interval. Rewards are capped per
 * round to prevent infinite farming.
 */
export class WindowBarrier {
  readonly id: string;
  readonly position: { readonly x: number; readonly z: number };
  /** Outward normal: zombies spawn on this side. */
  readonly outward: { readonly x: number; readonly z: number };
  readonly y: number;
  readonly floor: number;
  readonly boards: ReadonlyArray<BarrierBoard>;

  private _state: BarrierState = 'intact';
  private repairTimer = 0;
  private repairedThisRound = 0;
  private mutableBoards: BarrierBoard[];

  constructor(
    id: string,
    x: number,
    z: number,
    outwardX: number,
    outwardZ: number,
    private readonly config: WindowBarrierConfig,
    y = 1.15,
    floor = 0,
  ) {
    this.id = id;
    this.position = { x, z };
    this.outward = { x: outwardX, z: outwardZ };
    this.y = y;
    this.floor = floor;
    this.mutableBoards = Array.from({ length: config.boardCount }, () => ({
      hp: config.boardHp,
      maxHp: config.boardHp,
    }));
    this.boards = this.mutableBoards;
  }

  get state(): BarrierState {
    return this._state;
  }

  get isOpen(): boolean {
    return this.mutableBoards.every((b) => b.hp <= 0);
  }

  get intactCount(): number {
    return this.mutableBoards.reduce((acc, b) => acc + (b.hp > 0 ? 1 : 0), 0);
  }

  get destroyedCount(): number {
    return this.mutableBoards.reduce((acc, b) => acc + (b.hp <= 0 ? 1 : 0), 0);
  }

  /** True when at least one board is destroyed but not all. */
  get isDamaged(): boolean {
    return this.destroyedCount > 0 && !this.isOpen;
  }

  /**
   * Apply damage to the first intact board. Returns the number of boards
   * destroyed by this blow (0 or 1 with these numbers).
   */
  damage(amount: number): number {
    if (this.isOpen) return 0;
    for (const board of this.mutableBoards) {
      if (board.hp <= 0) continue;
      board.hp = Math.max(0, board.hp - amount);
      if (board.hp <= 0) {
        this.updateState();
        return 1;
      }
      this.updateState();
      return 0;
    }
    return 0;
  }

  /**
   * Progress repair while the player holds the input. Rebuilds one board
   * every `repairInterval` seconds. Only the first `repairRewardCap` boards
   * rebuilt this round award points.
   */
  repair(dt: number): RepairResult {
    if (this.destroyedCount === 0) {
      // Nothing to repair.
      this._state = 'intact';
      return { boardsRepaired: 0, rewardableBoards: 0 };
    }

    this.repairTimer += dt;
    this._state = 'repairing';
    let repaired = 0;
    while (this.repairTimer >= this.config.repairInterval) {
      this.repairTimer -= this.config.repairInterval;
      const rebuilt = this.rebuildOneBoard();
      if (!rebuilt) break;
      repaired++;
    }

    const rewardable = Math.min(repaired, Math.max(0, this.config.repairRewardCap - this.repairedThisRound));
    this.repairedThisRound += repaired;
    return { boardsRepaired: repaired, rewardableBoards: rewardable };
  }

  /** Stops any in-progress repair (call when the player releases interact). */
  stopRepair(): void {
    this.repairTimer = 0;
    this._state = this.isOpen ? 'destroyed' : this.isDamaged ? 'damaged' : 'intact';
  }

  /** Call at the start of each round to reset the reward cap. */
  resetRoundCap(): void {
    this.repairedThisRound = 0;
  }

  private rebuildOneBoard(): boolean {
    for (const board of this.mutableBoards) {
      if (board.hp <= 0) {
        board.hp = board.maxHp;
        this.updateState();
        return true;
      }
    }
    return false;
  }

  private updateState(): void {
    if (this.isOpen) {
      this._state = 'destroyed';
      return;
    }
    if (this.repairTimer > 0) {
      this._state = 'repairing';
      return;
    }
    this._state = this.isDamaged ? 'damaged' : 'intact';
  }
}
