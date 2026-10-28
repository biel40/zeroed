import type { WeaponId } from '../../../weapons/WeaponTypes';

export const BARRETT_CHEST_CODE = '1998';

export interface CodeWeaponChestPlacement {
  readonly id: string;
  readonly weaponId: WeaponId;
  readonly code: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly requiredDoorId: string;
}
