import type { WeaponDefinition, WeaponId } from './WeaponTypes';

/** A firearm's rounds under a finish: a brief tracer from the muzzle and a retinted flash. */
export interface FirearmShotLook {
  /** Colour of the tracer streak. */
  readonly tracer: number;
  /** Multiplies the muzzle flash's own colours (white keeps them), so its hot core stays the brightest part. */
  readonly flashTint: number;
  /** Colour of the shot's light pulse. */
  readonly light: number;
}

/** Arcs an energy weapon chains between its targets. */
export interface ArcShotLook {
  /** The bright arc itself. */
  readonly core: number;
  /** Charged haze added round the core, so the beam reads in its colour even in the dark. */
  readonly glow: number;
  /** Short forks crackling off it. */
  readonly branch: number;
  /** Dark energy wrapped round the arc, drawn over the scene rather than added to it. */
  readonly shroud: number;
}

/** An energy weapon's bolt (and arcs) under a finish. */
export interface EnergyShotLook {
  /** Hot core of the bolt. */
  readonly core: number;
  /** Halo, streak, rings, particles, scorch and light. */
  readonly color: number;
  /** Second ring and every fourth particle. */
  readonly accent: number;
  /** Dark energy round the bolt; null for none. */
  readonly shroud: number | null;
  /** Arcs the weapon chains, when it does; null keeps its own. */
  readonly arc: ArcShotLook | null;
}

/** A flame weapon's stream, and the core crystal feeding it, under a finish. */
export interface FlameShotLook {
  /** Width of the stream and its rolling fire, as a multiple of the weapon's own; the hit cone keeps its own. */
  readonly width: number;
  /** White-hot heart of the stream and the root of each puff of fire. */
  readonly core: number;
  /** Body of the stream and the young fire. */
  readonly body: number;
  /** Fire as it cools and dies. */
  readonly ember: number;
  /** Ribbons of the crystal's power round the stream, the arcane puffs and the sparks. */
  readonly arcane: number;
  /** The core crystal on the weapon: its glass, the veins of power in it and their hottest threads. */
  readonly crystal: { readonly glass: number; readonly vein: number; readonly hot: number };
}

/** How a finish changes the shots of the weapons wearing it. Data only; maps own it with their finish. */
export interface WeaponShotLooks {
  /** Every conventional firearm. */
  readonly firearm: FirearmShotLook;
  /** Energy weapons by id; one not listed keeps its own bolt. */
  readonly energy: Partial<Record<WeaponId, EnergyShotLook>>;
  /** Flame weapons by id; one not listed keeps its own fire. */
  readonly flame: Partial<Record<WeaponId, FlameShotLook>>;
}

/** The look of a conventional firearm's shots under `looks`; null without them or for energy, flame and wind weapons. */
export function firearmShotLook(
  definition: Pick<WeaponDefinition, 'energy' | 'flame' | 'wind'>,
  looks: WeaponShotLooks | null | undefined,
): FirearmShotLook | null {
  if (!looks || definition.energy || definition.flame || definition.wind) return null;
  return looks.firearm;
}

/** The look of energy weapon `id`'s bolt under `looks`; null keeps its own. */
export function energyShotLook(id: WeaponId, looks: WeaponShotLooks | null | undefined): EnergyShotLook | null {
  return looks?.energy[id] ?? null;
}

/** The look of flame weapon `id`'s stream under `looks`; null keeps its own. */
export function flameShotLook(id: WeaponId, looks: WeaponShotLooks | null | undefined): FlameShotLook | null {
  return looks?.flame[id] ?? null;
}
