import * as THREE from 'three';

/** What a body needs to know about an opening to climb through it. WindowBarrier satisfies it. */
export interface VaultOpening {
  readonly position: { readonly x: number; readonly z: number };
  /** Outward normal: the climb starts on this side. */
  readonly outward: { readonly x: number; readonly z: number };
  readonly floor: number;
  /** Height of the sill above the floor; 0 for doorway-like openings. */
  readonly sill: number;
  readonly isOpen: boolean;
}

/**
 * Geometry of the climb, in metres along the opening's outward normal from
 * its wall line (positive outside). It starts just inside the barrier
 * approach point (0.9 m out) and ends past the breach point (0.6 m in).
 */
export const WINDOW_VAULT = {
  startDepth: 0.8,
  endDepth: -0.75,
  /** A body further sideways than this from the opening's centre walks beside it, not through it. */
  halfWidth: 0.85,
  /** Lower sills are stepped over by the walk cycle alone. */
  minSill: 0.1,
  /** Height the hips clear above the sill at the top of the climb. */
  clearance: 0.04,
  /** How far the landing dips below the floor-level stance. */
  landingDip: 0.05,
} as const;

/** Body pose layered over the walk cycle while climbing; angles in radians. */
export interface WindowVaultPose {
  /** Root rise in metres (negative while the landing absorbs). */
  lift: number;
  /** Whole-body tip towards the opening. */
  rootPitch: number;
  /** Spine bend over the sill. */
  torsoPitch: number;
  /** Sideways roll as one leg leads over the sill (sign picked per body). */
  roll: number;
  /** 0..1 weight of the hands planted on the sill. */
  reach: number;
}

const { smoothstep } = THREE.MathUtils;

/** Signed depth of a point from the opening's wall line, or null when it is beside the opening. */
export function openingDepth(opening: VaultOpening, x: number, z: number): number | null {
  const dx = x - opening.position.x;
  const dz = z - opening.position.z;
  const lateral = Math.abs(dx * -opening.outward.z + dz * opening.outward.x);
  return lateral > WINDOW_VAULT.halfWidth ? null : dx * opening.outward.x + dz * opening.outward.z;
}

/** 0 at the start of the climb, 1 once the body is clear inside. */
export function vaultProgress(depth: number): number {
  return THREE.MathUtils.clamp((WINDOW_VAULT.startDepth - depth) / (WINDOW_VAULT.startDepth - WINDOW_VAULT.endDepth), 0, 1);
}

/**
 * The open window a body is about to climb through: it must stand outside
 * the wall, in front of a sill worth climbing, on the opening's floor.
 * Bodies already inside never start a climb, so walking past an open window
 * from the room side leaves them on the floor.
 */
export function findVaultStart(openings: ReadonlyArray<VaultOpening>, x: number, z: number, floor: number): VaultOpening | null {
  for (const opening of openings) {
    if (!opening.isOpen || opening.floor !== floor || opening.sill < WINDOW_VAULT.minSill) continue;
    const depth = openingDepth(opening, x, z);
    if (depth !== null && depth <= WINDOW_VAULT.startDepth && depth > 0.2) return opening;
  }
  return null;
}

/**
 * Climb choreography by progress: the body hunches and reaches for the
 * sill, hauls its weight up onto it, rolls over the leading leg, drops
 * inside and absorbs the landing.
 */
export function windowVaultPose(progress: number, sill: number, out: WindowVaultPose): WindowVaultPose {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  const up = smoothstep(p, 0.16, 0.4) * (1 - smoothstep(p, 0.6, 0.8));
  const landing = p > 0.76 && p < 0.96 ? Math.sin(Math.PI * (p - 0.76) / 0.2) : 0;
  out.lift = (sill + WINDOW_VAULT.clearance) * up - WINDOW_VAULT.landingDip * landing;
  out.rootPitch = 0.1 * smoothstep(p, 0.1, 0.35) * (1 - smoothstep(p, 0.55, 0.8));
  out.torsoPitch = 0.5 * smoothstep(p, 0.05, 0.34) * (1 - smoothstep(p, 0.56, 0.86)) + 0.14 * landing;
  out.roll = 0.09 * Math.sin(Math.PI * smoothstep(p, 0.25, 0.75));
  out.reach = smoothstep(p, 0.08, 0.28) * (1 - smoothstep(p, 0.52, 0.66));
  return out;
}
