/** Physical surface categories used for impact effects and sounds. */
export type SurfaceType = 'metal' | 'paper' | 'concrete' | 'dirt' | 'wood';

/** Structural interface so the shooting layer never imports range code. */
export interface HitTarget {
  /** Whether bullet-hole decals should stick to this target. */
  readonly acceptsDecals: boolean;
  readonly surface: SurfaceType;
  onHit(): void;
}
