import * as THREE from 'three';
import { PROTOCOL33_SURFACE_AMBIENCE } from '../Station33Config';

const { backgroundColor, fog, hemisphereLight, blend } = PROTOCOL33_SURFACE_AMBIENCE;
const SURFACE_BACKGROUND = new THREE.Color(backgroundColor);
const SURFACE_FOG = new THREE.Color(fog.color);
const SURFACE_SKY = new THREE.Color(hemisphereLight.skyColor);
const SURFACE_GROUND = new THREE.Color(hemisphereLight.groundColor);
/** Smallest blend change worth touching the scene for. */
const BLEND_EPSILON = 0.002;

/**
 * Blends the scene from the station's air to the surface's as the observer
 * climbs the escape stair, editing the existing fog, background and
 * hemisphere in place (no allocation per frame). The arena calls
 * `capture` whenever it re-applies the station's mood (power, reset).
 */
export class SurfaceMood {
  private readonly stationBackground = new THREE.Color();
  private readonly stationFog = new THREE.Color();
  private readonly stationSky = new THREE.Color();
  private readonly stationGround = new THREE.Color();
  private stationDensity = 0;
  private stationIntensity = 0;
  private blend = 0;

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly hemisphere: THREE.HemisphereLight,
    private readonly reducedEffects: boolean,
  ) {}

  /** Remembers the station's mood just applied to the scene and re-blends over it. */
  public capture(): void {
    const sceneFog = this.scene.fog as THREE.FogExp2;
    this.stationBackground.copy(this.scene.background as THREE.Color);
    this.stationFog.copy(sceneFog.color);
    this.stationDensity = sceneFog.density;
    this.stationSky.copy(this.hemisphere.color);
    this.stationGround.copy(this.hemisphere.groundColor);
    this.stationIntensity = this.hemisphere.intensity;
    this.apply();
  }

  /** Follows the observer's eye height; below the stair's upper half it is the station. */
  public update(eyeY: number | undefined): void {
    if (eyeY === undefined) return;
    const target = THREE.MathUtils.clamp((eyeY - blend.from) / (blend.to - blend.from), 0, 1);
    const settled = target === 0 || target === 1;
    if (target === this.blend || (!settled && Math.abs(target - this.blend) < BLEND_EPSILON)) return;
    this.blend = target;
    this.apply();
  }

  /** Back underground (call before the arena re-applies its mood). */
  public reset(): void {
    this.blend = 0;
  }

  private apply(): void {
    const sceneFog = this.scene.fog as THREE.FogExp2;
    const t = this.blend;
    (this.scene.background as THREE.Color).lerpColors(this.stationBackground, SURFACE_BACKGROUND, t);
    sceneFog.color.lerpColors(this.stationFog, SURFACE_FOG, t);
    sceneFog.density = THREE.MathUtils.lerp(this.stationDensity, fog.density, t);
    this.hemisphere.color.lerpColors(this.stationSky, SURFACE_SKY, t);
    this.hemisphere.groundColor.lerpColors(this.stationGround, SURFACE_GROUND, t);
    const surfaceIntensity = this.reducedEffects ? hemisphereLight.reducedIntensity : hemisphereLight.intensity;
    this.hemisphere.intensity = THREE.MathUtils.lerp(this.stationIntensity, surfaceIntensity, t);
  }
}
