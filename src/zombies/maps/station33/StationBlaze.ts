import * as THREE from 'three';
import type { QualityLevel } from '../../../core/DeviceProfile';
import { seededRandom } from '../shared/ProceduralNoise';
import { PROTOCOL33_SNOWFALL } from '../Station33Config';
import { blazeAge, blazeGlow, blazeLevel, type BlazeParticle, createBlazeParticles, type EscapeBlazeConfig } from './EscapeBlaze';
import { makeSoftSpot } from './Station33Atmosphere';

/** Particles of each layer by device quality, how long each one lives, and their size in metres. */
const LAYERS = {
  flames: { count: { low: 140, medium: 260, high: 420 }, life: { min: 0.7, max: 1.3 }, size: 2.8 },
  embers: { count: { low: 50, medium: 110, high: 180 }, life: { min: 1.8, max: 3.2 }, size: 0.22 },
  smoke: { count: { low: 24, medium: 48, high: 72 }, life: { min: 5, max: 8 }, size: 11 },
} as const;
/** How much harder than the snow the heat and smoke are carried along the yard's wind. */
const DRIFT = 4;
const WIND_X = PROTOCOL33_SNOWFALL.wind.x * DRIFT;
const WIND_Z = PROTOCOL33_SNOWFALL.wind.z * DRIFT;
/** Flame colour along its life, white-hot at the root, through orange and deep red, out to nothing. */
const HEAT: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 0.85, 0.5], [0.4, 1, 0.42, 0.08], [0.75, 0.5, 0.08, 0.02], [1, 0, 0, 0],
];
const EMBER_COLOR = { r: 1, g: 0.55, b: 0.15 } as const;
/** Smoke lit orange by the fire under it, going dark grey as it climbs. */
const SMOKE_LIT = new THREE.Color(0x5c3220);
const SMOKE_DARK = new THREE.Color(0x15161a);
const SMOKE_OPACITY = 0.55;
/** The orange the sky over the station takes, as a billboard over the middle of the blaze. */
const SKY_GLOW = { color: 0xff5a1e, width: 130, height: 70, lift: 16, opacity: 0.55 } as const;
/** The stairhead floodlight's firelight, and its flicker. */
const FIRE_LIGHT = new THREE.Color(0xff6a24);
const BLAZE_SEED = 4201;

/**
 * The map side of `EscapeBlaze` in the filmed ending: flames, embers and
 * smoke as three point clouds bound to the blaze's sources, a glow on the
 * sky over the station and the stairhead floodlight turned to flickering
 * firelight. All of it ignores the fog, so the fire reads from far down
 * the road. Buffers are filled in place every frame; hidden until `start`
 * and again after `reset`.
 */
export class StationBlaze {
  private readonly root = new THREE.Group();
  private readonly flames: THREE.Points;
  private readonly embers: THREE.Points;
  private readonly smoke: THREE.Points;
  private readonly glow: THREE.Sprite;
  private readonly flameParticles: ReadonlyArray<BlazeParticle>;
  private readonly emberParticles: ReadonlyArray<BlazeParticle>;
  private readonly smokeParticles: ReadonlyArray<BlazeParticle>;
  private readonly levels: Float32Array;
  private readonly lightColor = new THREE.Color();
  private readonly scratch = new THREE.Color();
  /** Seconds since boarding, or null before the ending. */
  private elapsed: number | null = null;

  public constructor(
    parent: THREE.Object3D,
    private readonly config: EscapeBlazeConfig,
    private readonly ground: number,
    quality: QualityLevel,
    private readonly light: THREE.PointLight,
    random: () => number = seededRandom(BLAZE_SEED),
  ) {
    this.root.name = 'station-blaze';
    this.levels = new Float32Array(config.sources.length);
    this.lightColor.copy(light.color);
    const spot = makeSoftSpot(32);
    this.flameParticles = createBlazeParticles(LAYERS.flames.count[quality], config, LAYERS.flames.life, random);
    this.emberParticles = createBlazeParticles(LAYERS.embers.count[quality], config, LAYERS.embers.life, random);
    this.smokeParticles = createBlazeParticles(LAYERS.smoke.count[quality], config, LAYERS.smoke.life, random);
    this.smoke = cloud('station-blaze-smoke', this.smokeParticles.length, 4, new THREE.PointsMaterial({
      name: 'station33_blaze_smoke', size: LAYERS.smoke.size, map: spot, vertexColors: true, transparent: true, depthWrite: false, fog: false,
    }));
    this.flames = cloud('station-blaze-flames', this.flameParticles.length, 3, glowingPoints('station33_blaze_flames', LAYERS.flames.size, spot));
    this.embers = cloud('station-blaze-embers', this.emberParticles.length, 3, glowingPoints('station33_blaze_embers', LAYERS.embers.size, spot));
    // Flames over their own smoke.
    this.flames.renderOrder = 1;
    this.embers.renderOrder = 1;
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      name: 'station33_blaze_sky', map: spot, color: SKY_GLOW.color, transparent: true, opacity: 0,
      depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    }));
    this.glow.name = 'station-blaze-sky';
    this.glow.scale.set(SKY_GLOW.width, SKY_GLOW.height, 1);
    this.placeGlow();
    this.root.add(this.smoke, this.flames, this.embers, this.glow);
    this.root.visible = false;
    parent.add(this.root);
  }

  public get burning(): boolean {
    return this.root.visible;
  }

  /** Boarding: the blaze runs on the ending's clock from now. */
  public start(): void {
    this.elapsed = 0;
    this.root.visible = true;
    this.apply(0);
  }

  public update(dt: number): void {
    if (this.elapsed === null) return;
    this.elapsed += Math.max(0, dt);
    this.apply(this.elapsed);
  }

  public reset(): void {
    this.elapsed = null;
    this.root.visible = false;
    this.light.color.copy(this.lightColor);
  }

  private apply(time: number): void {
    const { sources } = this.config;
    for (let index = 0; index < sources.length; index++) this.levels[index] = blazeLevel(time, sources[index], this.config);
    this.placeFlames(time);
    this.placeEmbers(time);
    this.placeSmoke(time);
    const glow = blazeGlow(time, this.config);
    (this.glow.material as THREE.SpriteMaterial).opacity = glow * SKY_GLOW.opacity;
    this.tintLight(time);
  }

  private placeFlames(time: number): void {
    const positions = attribute(this.flames, 'position');
    const colors = attribute(this.flames, 'color');
    for (let index = 0; index < this.flameParticles.length; index++) {
      const particle = this.flameParticles[index];
      const source = this.config.sources[particle.source];
      const level = this.levels[particle.source];
      const age = blazeAge(particle, time);
      const spread = 1 - 0.65 * age;
      positions.setXYZ(
        index,
        source.x + particle.offsetX * spread + Math.sin(time * 2.3 + particle.phase * 9) * 0.3 * age,
        this.ground + source.base + source.height * Math.min(level, 1.8) * age ** 0.85,
        source.z + particle.offsetZ * spread + Math.cos(time * 1.9 + particle.phase * 7) * 0.3 * age,
      );
      heat(age, this.scratch).multiplyScalar(Math.min(level, 1.6) * fadeIn(age));
      colors.setXYZ(index, this.scratch.r, this.scratch.g, this.scratch.b);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }

  private placeEmbers(time: number): void {
    const positions = attribute(this.embers, 'position');
    const colors = attribute(this.embers, 'color');
    for (let index = 0; index < this.emberParticles.length; index++) {
      const particle = this.emberParticles[index];
      const source = this.config.sources[particle.source];
      const burn = Math.min(this.levels[particle.source], 1);
      const age = blazeAge(particle, time);
      const carried = age * particle.life;
      positions.setXYZ(
        index,
        source.x + particle.offsetX + WIND_X * carried + Math.sin(time * 3.1 + particle.phase * 11) * 0.6,
        this.ground + source.base + source.height * (0.5 + 2.4 * age) * burn,
        source.z + particle.offsetZ + WIND_Z * carried + Math.cos(time * 2.7 + particle.phase * 13) * 0.6,
      );
      const glow = (1 - age) * burn * fadeIn(age) * 1.2;
      colors.setXYZ(index, EMBER_COLOR.r * glow, EMBER_COLOR.g * glow, EMBER_COLOR.b * glow);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }

  private placeSmoke(time: number): void {
    const positions = attribute(this.smoke, 'position');
    const colors = attribute(this.smoke, 'color');
    for (let index = 0; index < this.smokeParticles.length; index++) {
      const particle = this.smokeParticles[index];
      const source = this.config.sources[particle.source];
      const burn = Math.min(this.levels[particle.source], 1);
      const age = blazeAge(particle, time);
      const spread = 0.6 + 2.2 * age;
      const carried = age * particle.life;
      positions.setXYZ(
        index,
        source.x + particle.offsetX * spread + WIND_X * carried,
        this.ground + source.base + source.height * 0.7 + age * (26 + source.height),
        source.z + particle.offsetZ * spread + WIND_Z * carried,
      );
      this.scratch.lerpColors(SMOKE_DARK, SMOKE_LIT, (1 - age) ** 2);
      colors.setXYZW(index, this.scratch.r, this.scratch.g, this.scratch.b, SMOKE_OPACITY * Math.sin(Math.PI * age) * burn);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }

  /** The floodlight over the stairhead's door burns with the first source, flaring with it. */
  private tintLight(time: number): void {
    const level = this.levels[0];
    const flicker = 0.82 + 0.18 * (0.6 * Math.sin(time * 17.3) + 0.4 * Math.sin(time * 7.1 + 1.3));
    const flare = 1 + 0.5 * Math.max(0, level - 1);
    this.light.color.lerpColors(this.lightColor, FIRE_LIGHT, Math.min(1, level)).multiplyScalar(level > 0 ? flicker * flare : 1);
  }

  /** Over the middle of the blaze, weighed by the size of each fire. */
  private placeGlow(): void {
    let x = 0;
    let z = 0;
    let total = 0;
    for (const source of this.config.sources) {
      const weight = source.radius * source.height;
      x += source.x * weight;
      z += source.z * weight;
      total += weight;
    }
    this.glow.position.set(x / total, this.ground + SKY_GLOW.lift, z / total);
  }
}

function cloud(name: string, count: number, colorSize: 3 | 4, material: THREE.PointsMaterial): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * colorSize), colorSize).setUsage(THREE.DynamicDrawUsage));
  const points = new THREE.Points(geometry, material);
  points.name = name;
  // Particles rise, drift and recycle all over the blaze; skip per-frame bounds updates.
  points.frustumCulled = false;
  return points;
}

/** Additive points: a particle coloured black adds nothing, so dying ones simply fade out. */
function glowingPoints(name: string, size: number, map: THREE.Texture): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    name, size, map, vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  });
}

function attribute(points: THREE.Points, name: 'position' | 'color'): THREE.BufferAttribute {
  return points.geometry.getAttribute(name) as THREE.BufferAttribute;
}

/** Eases a particle in over the first part of its life, so none pops in at full strength. */
function fadeIn(age: number): number {
  return Math.min(1, age / 0.12);
}

function heat(age: number, out: THREE.Color): THREE.Color {
  let stop = 1;
  while (stop < HEAT.length - 1 && age > HEAT[stop][0]) stop++;
  const [fromAge, r0, g0, b0] = HEAT[stop - 1];
  const [toAge, r1, g1, b1] = HEAT[stop];
  const t = THREE.MathUtils.clamp((age - fromAge) / (toAge - fromAge), 0, 1);
  return out.setRGB(r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t);
}
