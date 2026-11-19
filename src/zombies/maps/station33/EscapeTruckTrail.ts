import * as THREE from 'three';
import { BILLBOARD_NOISE, BillboardLayer, type BillboardParticle } from '../../../rendering/BillboardParticles';
import { AXLES, EXHAUST_TIP, FRONT, WHEEL_TRACK } from './EscapeTruckLayout';

/** What the trail follows at one instant (a subset of `EscapeDrivePose`). */
export interface TruckTrailInput {
  readonly time: number;
  readonly distance: number;
  readonly speed: number;
  readonly engine: number;
}

/** Diesel smoke out of the exhaust: puffs per cycle, seconds each lives, metres across as it leaves and how fast it spreads. */
const EXHAUST = { count: 10, life: 1.3, size: 0.28, growth: 0.95, rise: 0.45, drift: 0.35 } as const;
/** Snow thrown up behind the rear wheels once the truck is moving. */
const SPRAY = { count: 12, life: 0.75, size: 0.45, growth: 1.5, throwUp: 1.5, gravity: 2.2, trail: 0.55, minSpeed: 2, fullSpeed: 9 } as const;
/** Down the road the trail fades out: it has no fog, and deep in the fog it would glow on. */
const FAR_FADE = { from: 40, to: 80 } as const;
/** Seeds below this are smoke, above it snow (the shader tells them apart). */
const SNOW_SEED = 0.5;

const TRAIL_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vAge;
  varying float vSeed;
  ${BILLBOARD_NOISE}
  void main() {
    float radius = length(vUv - 0.5) * 2.0;
    float puff = smoothstep(1.0, 0.15, radius) * (0.55 + 0.45 * fbm(vUv * 3.0 + vSeed * 17.0 + uTime * 0.35));
    float fade = smoothstep(0.0, 0.12, vAge) * (1.0 - vAge);
    bool snow = vSeed >= ${SNOW_SEED.toFixed(1)};
    vec3 color = snow ? vec3(0.6, 0.65, 0.72) : vec3(0.11, 0.115, 0.13);
    float alpha = puff * fade * (snow ? 0.42 : 0.5);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * Age of the `index`-th of `count` particles cycling every `life` seconds,
 * `time` seconds in: staggered evenly so one leaves every `life / count`.
 */
export function trailParticleAge(index: number, count: number, life: number, time: number): number {
  const age = (time + (index * life) / count) % life;
  return age < 0 ? age + life : age;
}

/**
 * The truck's wake, as one billboard draw: diesel smoke curling out of the
 * exhaust while the engine runs, and snow thrown up behind the rear wheels
 * as it picks up speed. Positions follow the pose deterministically (no
 * simulation state): each particle leaves on a fixed cadence and trails
 * back at the truck's current speed, as if left behind on the road.
 */
export class EscapeTruckTrail {
  private readonly layer: BillboardLayer;
  private readonly particles: BillboardParticle[] = [];
  /** The first particles are smoke, the rest snow. */
  private readonly exhaustCount: number;

  /** `parent` must be in world space: billboards are drawn from their positions alone. */
  public constructor(parent: THREE.Object3D, reducedEffects: boolean) {
    const exhaust = reducedEffects ? Math.ceil(EXHAUST.count / 2) : EXHAUST.count;
    const spray = reducedEffects ? Math.ceil(SPRAY.count / 2) : SPRAY.count;
    for (let index = 0; index < exhaust + spray; index++) {
      const smoke = index < exhaust;
      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 1,
        life: 1,
        size: 0,
        growth: 0,
        seed: smoke ? (index / exhaust) * (SNOW_SEED - 0.01) : SNOW_SEED + ((index - exhaust) / spray) * (1 - SNOW_SEED - 0.01),
        spin: index * 2.4,
        spinRate: 0,
      });
    }
    this.exhaustCount = exhaust;
    this.layer = new BillboardLayer('surface-truck-trail', this.particles.length, TRAIL_FRAGMENT, false);
    parent.add(this.layer.mesh);
  }

  /** Places the wake behind a truck whose rig stands at `rig` (world space, facing -z). */
  public update(input: TruckTrailInput, rig: THREE.Vector3): void {
    const fade = 1 - THREE.MathUtils.smoothstep(input.distance, FAR_FADE.from, FAR_FADE.to);
    const smoke = input.engine * fade;
    const spray = THREE.MathUtils.smoothstep(input.speed, SPRAY.minSpeed, SPRAY.fullSpeed) * fade;
    const sprayCount = this.particles.length - this.exhaustCount;
    for (let index = 0; index < this.particles.length; index++) {
      const particle = this.particles[index];
      if (index < this.exhaustCount) this.placeSmoke(particle, index, smoke, input, rig);
      else this.placeSpray(particle, index - this.exhaustCount, sprayCount, spray, input, rig);
    }
    this.layer.write(this.particles, input.time);
  }

  private placeSmoke(particle: BillboardParticle, index: number, level: number, input: TruckTrailInput, rig: THREE.Vector3): void {
    const age = trailParticleAge(index, this.exhaustCount, EXHAUST.life, input.time);
    particle.life = EXHAUST.life;
    particle.age = level > 0 ? age : EXHAUST.life;
    particle.size = EXHAUST.size * level;
    particle.growth = EXHAUST.growth * level;
    particle.position.set(
      rig.x + EXHAUST_TIP.x + age * EXHAUST.drift,
      rig.y + EXHAUST_TIP.y + age * EXHAUST.rise,
      rig.z + FRONT + EXHAUST_TIP.fromNose + age * (input.speed + 0.3),
    );
  }

  private placeSpray(particle: BillboardParticle, index: number, count: number, level: number, input: TruckTrailInput, rig: THREE.Vector3): void {
    const age = trailParticleAge(index, count, SPRAY.life, input.time);
    const side = index % 2 === 0 ? -1 : 1;
    particle.life = SPRAY.life;
    particle.age = level > 0 ? age : SPRAY.life;
    particle.size = SPRAY.size * level;
    particle.growth = SPRAY.growth * level;
    particle.position.set(
      rig.x + side * (WHEEL_TRACK + 0.05 + age * 0.5),
      rig.y + 0.15 + age * (SPRAY.throwUp - SPRAY.gravity * age),
      rig.z + FRONT + AXLES[2] + 0.5 + age * input.speed * SPRAY.trail,
    );
  }
}
