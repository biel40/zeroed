import * as THREE from 'three';
import { CATACOMB_MOOD } from '../../DieKathedraleCatacombsConfig';
import type { ArenaAmbience } from '../../ZombieArena';

/** Smallest change in depth worth touching the scene for. */
const DEPTH_STEP = 0.004;

/**
 * Blends the scene's mood between the cathedral's night and the catacombs'
 * (`CATACOMB_MOOD`) by how deep the observer is: haze, the sky-like fill
 * (its strength and its colors) and moonlight. Writes only when the depth changes and allocates nothing then.
 * The scene's fog is re-read every time: the arena replaces it on reset.
 */
export class UndergroundMood {
  private readonly surfaceFog: THREE.Color;
  private readonly cryptFog = new THREE.Color(CATACOMB_MOOD.fogColor);
  private readonly surfaceSky: THREE.Color;
  private readonly surfaceGround: THREE.Color;
  private readonly cryptSky = new THREE.Color(CATACOMB_MOOD.hemisphereSky);
  private readonly cryptGround = new THREE.Color(CATACOMB_MOOD.hemisphereGround);
  private readonly hemisphereIntensity: number;
  private readonly environmentIntensity: number | null;
  private depth = 0;

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly ambience: ArenaAmbience,
    private readonly hemisphere: THREE.HemisphereLight,
    private readonly setMoonShare: (share: number) => void,
    reducedEffects: boolean,
  ) {
    this.surfaceFog = new THREE.Color(ambience.fog.color);
    this.hemisphereIntensity = hemisphere.intensity;
    this.surfaceSky = hemisphere.color.clone();
    this.surfaceGround = hemisphere.groundColor.clone();
    const environment = ambience.environmentIntensity;
    this.environmentIntensity = environment ? (reducedEffects ? environment.reducedIntensity : environment.intensity) : null;
  }

  /** `depth`: 0 on the surface, 1 down in the catacombs. */
  public update(depth: number): void {
    // Small steps wait for a bigger one, but the two ends are always reached exactly.
    const settled = depth === 0 || depth === 1;
    if (depth === this.depth || (!settled && Math.abs(depth - this.depth) < DEPTH_STEP)) return;
    this.apply(depth);
  }

  /** Back to the surface's night, as the run starts. */
  public reset(): void {
    this.apply(0);
  }

  private apply(depth: number): void {
    this.depth = depth;
    const fog = this.scene.fog;
    if (fog instanceof THREE.FogExp2) {
      fog.density = THREE.MathUtils.lerp(this.ambience.fog.density, CATACOMB_MOOD.fogDensity, depth);
      fog.color.lerpColors(this.surfaceFog, this.cryptFog, depth);
    }
    this.hemisphere.intensity = this.hemisphereIntensity * THREE.MathUtils.lerp(1, CATACOMB_MOOD.hemisphereShare, depth);
    this.hemisphere.color.lerpColors(this.surfaceSky, this.cryptSky, depth);
    this.hemisphere.groundColor.lerpColors(this.surfaceGround, this.cryptGround, depth);
    if (this.environmentIntensity !== null) {
      this.scene.environmentIntensity = this.environmentIntensity * THREE.MathUtils.lerp(1, CATACOMB_MOOD.environmentShare, depth);
    }
    this.setMoonShare(THREE.MathUtils.lerp(1, CATACOMB_MOOD.moonShare, depth));
  }
}
