import * as THREE from 'three';
import type { QualityLevel } from '../../../core/DeviceProfile';
import { seededRandom } from '../shared/ProceduralNoise';
import { PROTOCOL33_SNOWFALL, PROTOCOL33_SURFACE_AMBIENCE } from '../Station33Config';
import { makeSoftSpot } from './Station33Atmosphere';

const { volume, flakes, fallSpeed, wind, sway } = PROTOCOL33_SNOWFALL;
const SPAN = { x: volume.maxX - volume.minX, y: volume.maxY - volume.minY, z: volume.maxZ - volume.minZ } as const;
/** Below this eye height the observer is underground and the snow neither falls nor draws. */
const VISIBLE_FROM_EYE_Y = PROTOCOL33_SURFACE_AMBIENCE.blend.from;
const SNOWFALL_SEED = 3803;

/** Where a flake starts, how fast it sinks and where it is in its sway. */
export interface Snowflake {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly speed: number;
  readonly phase: number;
}

function wrap(value: number, min: number, span: number): number {
  return min + ((((value - min) % span) + span) % span);
}

/** Where `flake` is `time` seconds into the fall: sinking, drifting downwind, swaying, wrapped into the volume. */
export function snowflakePosition(flake: Snowflake, time: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    wrap(flake.x + wind.x * time + Math.sin(time * 0.7 + flake.phase) * sway, volume.minX, SPAN.x),
    wrap(flake.y - flake.speed * time, volume.minY, SPAN.y),
    wrap(flake.z + wind.z * time + Math.cos(time * 0.5 + flake.phase * 1.3) * sway, volume.minZ, SPAN.z),
  );
}

/**
 * Snow falling over the surface yard as one point cloud. Flakes are drawn
 * once (from `random`, injectable for tests) and moved in place every
 * frame; the cloud hides and stops while the observer is underground.
 */
export class SurfaceSnowfall {
  public readonly points: THREE.Points;
  private readonly flakes: ReadonlyArray<Snowflake>;
  private readonly scratch = new THREE.Vector3();
  private time = 0;

  public constructor(parent: THREE.Object3D, quality: QualityLevel, random: () => number = seededRandom(SNOWFALL_SEED)) {
    this.flakes = Array.from({ length: flakes[quality] }, () => ({
      x: volume.minX + random() * SPAN.x,
      y: volume.minY + random() * SPAN.y,
      z: volume.minZ + random() * SPAN.z,
      speed: THREE.MathUtils.lerp(fallSpeed.min, fallSpeed.max, random()),
      phase: random() * Math.PI * 2,
    }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.flakes.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({
      name: 'station33_snowfall', size: 0.07, map: makeSoftSpot(16), color: 0xe4ecf2, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.points.name = 'surface-snowfall';
    // Flakes wrap around the whole volume; skip per-frame bounds updates.
    this.points.frustumCulled = false;
    this.points.visible = false;
    parent.add(this.points);
    this.place();
  }

  /** Lets the snow fall `dt` seconds while `eyeY` is on the surface or the upper flight. */
  public update(dt: number, eyeY: number | undefined): void {
    const visible = eyeY !== undefined && eyeY >= VISIBLE_FROM_EYE_Y;
    this.points.visible = visible;
    if (!visible) return;
    this.time += Math.max(0, dt);
    this.place();
  }

  public reset(): void {
    this.time = 0;
    this.points.visible = false;
    this.place();
  }

  private place(): void {
    const attribute = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < this.flakes.length; index++) {
      const { x, y, z } = snowflakePosition(this.flakes[index], this.time, this.scratch);
      attribute.setXYZ(index, x, y, z);
    }
    attribute.needsUpdate = true;
  }
}
