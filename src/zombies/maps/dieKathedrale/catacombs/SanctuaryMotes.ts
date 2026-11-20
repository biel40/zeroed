import * as THREE from 'three';
import type { QualityLevel } from '../../../../core/DeviceProfile';
import { CATACOMB_FLOOR_Y, SANCTUARY, SANCTUARY_MOTE_COUNT, WIND_ACCENT_COLOR } from '../../DieKathedraleCatacombsConfig';
import { seededRandom } from '../../shared/ProceduralNoise';
import { makeSoftSpot } from '../../shared/SoftSpotTexture';

/** Radii the motes keep from the pedestal's axis, and the heights they drift between. */
const ORBIT = { inner: 1.4, outer: 4.8, low: 0.3, high: 3.6 } as const;

/**
 * A few pale motes turning slowly round the shrine's pedestal and rising and
 * sinking as they go: the only thing that moves there. Restrained on
 * purpose, a dim additive point per mote. Buffers are allocated once.
 */
export class SanctuaryMotes {
  private readonly points: THREE.Points;
  private readonly radius: Float32Array;
  private readonly height: Float32Array;
  private readonly phase: Float32Array;
  private readonly speed: Float32Array;
  private time = 0;

  public constructor(group: THREE.Group, quality: QualityLevel) {
    const count = SANCTUARY_MOTE_COUNT[quality];
    const random = seededRandom(7601);
    this.radius = new Float32Array(count);
    this.height = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.speed = new Float32Array(count);
    for (let mote = 0; mote < count; mote++) {
      this.radius[mote] = THREE.MathUtils.lerp(ORBIT.inner, ORBIT.outer, Math.sqrt(random()));
      this.height[mote] = THREE.MathUtils.lerp(ORBIT.low, ORBIT.high, random());
      this.phase[mote] = random() * Math.PI * 2;
      // Nearer the axis turns faster, as in an eddy; always the same way round.
      this.speed[mote] = 0.12 + 0.4 / this.radius[mote] + random() * 0.05;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({
      name: 'die-kathedrale_wind_motes', size: 0.05, map: makeSoftSpot(16), color: WIND_ACCENT_COLOR,
      transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.name = 'die-kathedrale-sanctuary-motes';
    // The motes never leave the shrine: keep its bounds so the renderer can cull them with it.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(SANCTUARY.x, CATACOMB_FLOOR_Y + ORBIT.high / 2, SANCTUARY.z), ORBIT.outer + 0.5);
    group.add(this.points);
    this.update(0);
  }

  public update(dt: number): void {
    this.time += Math.max(0, dt);
    const position = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    for (let mote = 0; mote < this.radius.length; mote++) {
      const angle = this.phase[mote] + this.time * this.speed[mote];
      const radius = this.radius[mote] + Math.sin(this.time * 0.3 + this.phase[mote]) * 0.15;
      array[mote * 3] = SANCTUARY.x + Math.cos(angle) * radius;
      array[mote * 3 + 1] = CATACOMB_FLOOR_Y + this.height[mote] + Math.sin(this.time * 0.45 + this.phase[mote] * 2) * 0.35;
      array[mote * 3 + 2] = SANCTUARY.z + Math.sin(angle) * radius;
    }
    position.needsUpdate = true;
  }

  public reset(): void {
    this.time = 0;
    this.update(0);
  }
}
