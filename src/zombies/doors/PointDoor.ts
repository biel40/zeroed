import type { TranslationKey } from '../../i18n/i18n';

export type DoorState = 'locked' | 'unlocked';

/** Slab every point door fills; maps cut wall openings of this size. */
export const POINT_DOOR_SIZE = { width: 1.6, height: 2.1, thickness: 0.12 } as const;

/**
 * A condition that takes a door off sale whatever the player can pay (a
 * hatch that waits for the map's power). The door keeps its price.
 */
export interface PointDoorSeal {
  /** True while the door cannot be bought. */
  isSealed(): boolean;
  /** Prompt and denial shown instead of the price while sealed; receives `{door}`. */
  readonly message: TranslationKey;
}

export interface PointDoorConfig {
  readonly cost: number;
  /** Custom action text shown instead of the generic unlock prompt. */
  readonly prompt?: TranslationKey;
  /** Denial banner; receives the door `cost`. */
  readonly requiredMessage?: TranslationKey;
  readonly seal?: PointDoorSeal;
}

export interface PointDoorActivation {
  readonly cost: number;
  readonly success: boolean;
  /** The door refused because it is sealed: nothing was charged. */
  readonly sealed?: boolean;
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
    if (this.isSealed) return { cost: this.config.cost, success: false, sealed: true };
    const success = spend(this.config.cost);
    if (success) this._state = 'unlocked';
    return { cost: this.config.cost, success };
  }

  /** True while the door's seal keeps it off sale. */
  get isSealed(): boolean {
    return this.config.seal?.isSealed() ?? false;
  }

  get sealMessage(): TranslationKey | undefined {
    return this.config.seal?.message;
  }

  get prompt(): TranslationKey | undefined {
    return this.config.prompt;
  }

  get requiredMessage(): TranslationKey | undefined {
    return this.config.requiredMessage;
  }

  reset(): void {
    this._state = 'locked';
  }
}
