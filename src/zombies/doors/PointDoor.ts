export type DoorState = 'locked' | 'unlocked';

export interface PointDoorConfig {
  readonly cost: number;
  readonly prompt?: string;
  readonly requiredMessage?: string;
}

export interface PointDoorActivation {
  readonly cost: number;
  readonly success: boolean;
}

/**
 * Pure logic for a point-unlock door. Mirrors the Mystery Box spending
 * pattern: atomic deduction, one unlock only.
 */
export class PointDoor {
  readonly id: string;
  readonly position: { readonly x: number; readonly z: number };
  readonly outward: { readonly x: number; readonly z: number };
  readonly y: number;
  readonly floor: number;

  private _state: DoorState = 'locked';

  constructor(
    id: string,
    x: number,
    z: number,
    outwardX: number,
    outwardZ: number,
    private readonly config: PointDoorConfig,
    y = 0,
    floor = 0,
  ) {
    this.id = id;
    this.position = { x, z };
    this.outward = { x: outwardX, z: outwardZ };
    this.y = y;
    this.floor = floor;
  }

  get state(): DoorState {
    return this._state;
  }

  get isLocked(): boolean {
    return this._state === 'locked';
  }

  get cost(): number {
    return this.config.cost;
  }

  /**
   * Attempt to unlock. The caller must pass a spend function that returns
   * true when the player can afford the cost. This keeps `PlayerEconomy`
   * as the single source of truth for points.
   */
  tryUnlock(spend: (cost: number) => boolean): PointDoorActivation {
    if (this._state !== 'locked') return { cost: 0, success: true };
    const success = spend(this.config.cost);
    if (success) this._state = 'unlocked';
    return { cost: this.config.cost, success };
  }

  get prompt(): string | undefined {
    return this.config.prompt;
  }

  get requiredMessage(): string | undefined {
    return this.config.requiredMessage;
  }

  reset(): void {
    this._state = 'locked';
  }
}
