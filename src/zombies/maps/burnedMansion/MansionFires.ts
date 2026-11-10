import * as THREE from 'three';
import { MANSION_SMOULDERING_FIRES, type MansionSmoulderingFire } from '../BurnedMansionConfig';
import {
  createFireParticles,
  fireFadeIn,
  fireHeatColor,
  fireParticleAge,
  firelightFlicker,
  type FireParticle,
} from '../shared/FireParticles';
import { seededRandom } from '../shared/ProceduralNoise';
import { makeSoftSpot } from './MansionAtmosphere';
import type { MansionBuildContext } from './MansionBuildContext';

/** Flame particles shared by every fire, how long each lives, and its size against its fire's radius. */
const FLAMES = { count: 150, life: { min: 0.45, max: 0.9 }, sizePerRadius: 1.1 } as const;
/** Sparks lifting off the fires, beyond the house-wide embers of `MansionAtmosphere`. */
const SPARKS = { count: 48, life: { min: 1.6, max: 2.8 }, size: 0.028, climb: 3 } as const;
const SPARK_COLOR = { r: 1, g: 0.5, b: 0.16 } as const;
/** Warm halo around each fire, standing in for the bloom the renderer does not have. */
const GLOW = { color: 0xff6a24, sizePerRadius: 5, opacity: 0.32, lift: 0.4 } as const;
const FIRELIGHT = { color: 0xff7a32, decay: 1.8, lift: 0.6 } as const;
const FIRES_SEED = 5641;

interface FireView {
  readonly fire: MansionSmoulderingFire;
  readonly flames: THREE.Points;
  readonly particles: ReadonlyArray<FireParticle>;
  readonly glow: THREE.Sprite;
  readonly light: THREE.PointLight | null;
  /** Keeps neighbouring fires from flickering in step. */
  readonly phase: number;
}

/**
 * Ultra quality's live fire: flames, sparks, a warm halo and flickering
 * firelight at each of `MANSION_SMOULDERING_FIRES`. Buffers are filled in
 * place every frame; nothing here is solid or casts shadows. Firelight
 * keeps its authored intensity in `baseIntensityOf`, so the arena's light
 * budget ranks it without the flicker reordering lights.
 */
export class MansionFires {
  private readonly root = new THREE.Group();
  private readonly views: FireView[] = [];
  private readonly sparks: THREE.Points;
  private readonly sparkParticles: ReadonlyArray<FireParticle>;
  private readonly baseIntensities = new Map<THREE.PointLight, number>();
  private readonly scratch = new THREE.Color();
  private time = 0;

  public constructor(context: MansionBuildContext, random: () => number = seededRandom(FIRES_SEED)) {
    this.root.name = 'mansion-fires';
    const spot = makeSoftSpot(32);
    const fires = MANSION_SMOULDERING_FIRES;
    const flameParticles = createFireParticles(FLAMES.count, fires, FLAMES.life, random);
    fires.forEach((fire, index) => {
      const particles = flameParticles.filter((particle) => particle.source === index);
      this.views.push({
        fire,
        particles,
        flames: this.addFlames(fire, particles.length, spot),
        glow: this.addGlow(fire, spot),
        light: this.addLight(fire),
        phase: index * 2.1,
      });
    });
    this.sparkParticles = createFireParticles(SPARKS.count, fires, SPARKS.life, random);
    this.sparks = glowingCloud('mansion-fire-sparks', this.sparkParticles.length, SPARKS.size, spot);
    this.root.add(this.sparks);
    context.group.add(this.root);
    this.apply();
  }

  /** Authored intensity of one of these fires' lights, or undefined for any other light. */
  public baseIntensityOf(light: THREE.PointLight): number | undefined {
    return this.baseIntensities.get(light);
  }

  public update(dt: number): void {
    this.time += Math.max(0, dt);
    this.apply();
  }

  public reset(): void {
    this.time = 0;
    this.apply();
  }

  private addFlames(fire: MansionSmoulderingFire, count: number, spot: THREE.Texture): THREE.Points {
    const flames = glowingCloud(`mansion-fire-flames:${fire.id}`, count, fire.radius * FLAMES.sizePerRadius, spot);
    this.root.add(flames);
    return flames;
  }

  private addGlow(fire: MansionSmoulderingFire, spot: THREE.Texture): THREE.Sprite {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      name: 'mansion_fire_glow', map: spot, color: GLOW.color, transparent: true, opacity: GLOW.opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    glow.name = `mansion-fire-glow:${fire.id}`;
    glow.position.set(fire.x, fire.y + fire.height * GLOW.lift, fire.z);
    glow.scale.setScalar(fire.radius * GLOW.sizePerRadius);
    this.root.add(glow);
    return glow;
  }

  private addLight(fire: MansionSmoulderingFire): THREE.PointLight | null {
    if (!fire.light) return null;
    const light = new THREE.PointLight(FIRELIGHT.color, fire.light.intensity, fire.light.distance, FIRELIGHT.decay);
    light.name = `mansion-firelight:${fire.id}`;
    light.position.set(fire.x, fire.y + fire.height * FIRELIGHT.lift, fire.z);
    this.baseIntensities.set(light, fire.light.intensity);
    this.root.add(light);
    return light;
  }

  private apply(): void {
    for (const view of this.views) {
      const flicker = firelightFlicker(this.time, view.phase);
      if (view.light) view.light.intensity = (this.baseIntensities.get(view.light) ?? 0) * flicker;
      (view.glow.material as THREE.SpriteMaterial).opacity = GLOW.opacity * flicker;
      this.placeFlames(view);
    }
    this.placeSparks();
  }

  /** Flames rise from the root, narrowing and swaying as they cool from white-hot to nothing. */
  private placeFlames(view: FireView): void {
    const { fire, particles } = view;
    const positions = attribute(view.flames, 'position');
    const colors = attribute(view.flames, 'color');
    const time = this.time;
    for (let index = 0; index < particles.length; index++) {
      const particle = particles[index];
      const age = fireParticleAge(particle, time);
      const spread = 1 - 0.65 * age;
      const sway = fire.radius * 0.35 * age;
      positions.setXYZ(
        index,
        fire.x + particle.offsetX * spread + Math.sin(time * 2.3 + particle.phase * 9) * sway,
        fire.y + fire.height * age ** 0.85,
        fire.z + particle.offsetZ * spread + Math.cos(time * 1.9 + particle.phase * 7) * sway,
      );
      fireHeatColor(age, this.scratch).multiplyScalar(fireFadeIn(age));
      colors.setXYZ(index, this.scratch.r, this.scratch.g, this.scratch.b);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }

  /** Sparks climb well over their fire, wandering, and dim as they go. */
  private placeSparks(): void {
    const positions = attribute(this.sparks, 'position');
    const colors = attribute(this.sparks, 'color');
    const time = this.time;
    for (let index = 0; index < this.sparkParticles.length; index++) {
      const particle = this.sparkParticles[index];
      const fire = MANSION_SMOULDERING_FIRES[particle.source];
      const age = fireParticleAge(particle, time);
      positions.setXYZ(
        index,
        fire.x + particle.offsetX + Math.sin(time * 3.1 + particle.phase * 11) * 0.12 * age,
        fire.y + fire.height * (0.4 + SPARKS.climb * age),
        fire.z + particle.offsetZ + Math.cos(time * 2.7 + particle.phase * 13) * 0.12 * age,
      );
      const glow = (1 - age) * fireFadeIn(age) * 1.2;
      colors.setXYZ(index, SPARK_COLOR.r * glow, SPARK_COLOR.g * glow, SPARK_COLOR.b * glow);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }
}

/** Additive points: a particle coloured black adds nothing, so dying ones simply fade out. */
function glowingCloud(name: string, count: number, size: number, map: THREE.Texture): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    name: 'mansion_fire', size, map, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  points.name = name;
  // Particles rise and recycle around their fire; skip per-frame bounds updates.
  points.frustumCulled = false;
  return points;
}

function attribute(points: THREE.Points, name: 'position' | 'color'): THREE.BufferAttribute {
  return points.geometry.getAttribute(name) as THREE.BufferAttribute;
}
