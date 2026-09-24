import { WEAPON_DEFINITIONS, ZOMBIES_WEAPON_PRELOAD } from '../../config/weapons';
import type { WeaponId } from '../../weapons/WeaponTypes';
import { ZOMBIES_RESERVE_AMMO } from '../../zombies/ZombieConfig';

/** Shared loadout contract for both co-op clients and host validation. */
export const COOP_WEAPONS: readonly WeaponId[] = ZOMBIES_WEAPON_PRELOAD;
export const COOP_STARTING_WEAPONS: readonly WeaponId[] = ['m1911'];

export function coopReserveAmmo(id: WeaponId): number | undefined {
  return ZOMBIES_RESERVE_AMMO[id] ?? WEAPON_DEFINITIONS[id].reserveAmmo;
}
