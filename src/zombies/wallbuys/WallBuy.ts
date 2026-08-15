import type { WeaponId } from '../../weapons/WeaponTypes';

export type WallBuyWeaponId = Exclude<WeaponId, 'raygun' | 'tesla'>;

export interface WallBuyConfig {
  readonly id: string;
  readonly weaponId: WallBuyWeaponId;
  readonly price: number;
  readonly ammoPrice: number;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly yaw: number;
  readonly floor: number;
  readonly useRange?: number;
  readonly lookDotMin?: number;
}

/** Map-owned purchase point. Economy and inventory remain owned by ZombiesMode. */
export class WallBuy {
  readonly position: WallBuyConfig['position'];
  readonly useRange: number;
  readonly lookDotMin: number;

  constructor(readonly config: WallBuyConfig) {
    if ((config.weaponId as WeaponId) === 'raygun' || (config.weaponId as WeaponId) === 'tesla') {
      throw new Error(`Special weapon "${config.weaponId}" cannot be a wall buy`);
    }
    if (!Number.isFinite(config.price) || config.price < 0) {
      throw new Error(`Invalid weapon price for wall buy "${config.id}"`);
    }
    if (!Number.isFinite(config.ammoPrice) || config.ammoPrice < 0) {
      throw new Error(`Invalid ammo price for wall buy "${config.id}"`);
    }
    this.position = config.position;
    this.useRange = config.useRange ?? 2.2;
    this.lookDotMin = config.lookDotMin ?? 0.5;
  }

  get id(): string {
    return this.config.id;
  }

  get weaponId(): WallBuyWeaponId {
    return this.config.weaponId;
  }

  get price(): number {
    return this.config.price;
  }

  get ammoPrice(): number {
    return this.config.ammoPrice;
  }

  get floor(): number {
    return this.config.floor;
  }
}
