import { WEAPON_DEFINITIONS } from './weapons';
import type { ViewModelConfig, WeaponCatalog, WeaponDefinition, WeaponId } from '../weapons/WeaponTypes';

/**
 * A map-specific identity for a shared weapon: its own name and view model
 * over the very same id, stats, ammunition, audio, effects and reload
 * timings. Inventories, the Mystery Box and the network keep using the id.
 */
export interface WeaponReskin {
  readonly name: string;
  /** Merged over the base view; whatever it omits stays the base weapon's. */
  readonly view: Partial<ViewModelConfig>;
}

/** The shared catalog with the given weapons reskinned; every other entry is the shared definition itself. */
export function reskinWeapons(reskins: Partial<Record<WeaponId, WeaponReskin>>): WeaponCatalog {
  const catalog: Record<WeaponId, WeaponDefinition> = { ...WEAPON_DEFINITIONS };
  for (const [id, reskin] of Object.entries(reskins) as [WeaponId, WeaponReskin][]) {
    const base = WEAPON_DEFINITIONS[id];
    catalog[id] = { ...base, name: reskin.name, view: { ...base.view, ...reskin.view } };
  }
  return catalog;
}

/**
 * Soviet PTRS-41 look of the Barrett .50 (Station 33). Its geometry keeps
 * the Barrett's shoulder, grip, magazine and charging-handle anchors, so
 * the right hand, reload and rack animations are the Barrett's own; only
 * the support hand moves from the wide shroud onto the slim barrel.
 */
export const PTRS41_RESKIN: WeaponReskin = {
  name: 'PTRS-41',
  view: {
    frame: 'ptrs41',
    // Blued receiver steel; the accent is the stock and grip birch.
    bodyColor: 0x2c3033,
    accentColor: 0x7a4322,
    // Slim PU-style optic sits lower than the Barrett's tactical scope.
    sightHeight: 0.078,
    hands: {
      ...WEAPON_DEFINITIONS.barrett.view.hands,
      // Wrapped under the barrel and the gas cylinder above it, just ahead of the receiver.
      left: {
        position: [0, 0.006, -0.37], axis: [-0.375, -0.167, -0.912], palm: [-0.53, 0.846, 0.063], pose: 'supportHandguard',
        hold: { size: [0.042, 0.066], axis: [0, 0, -1] },
      },
    },
  },
};
