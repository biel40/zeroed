import * as THREE from 'three';
import type { QualityLevel } from '../../../core/DeviceProfile';
import { seededRandom } from '../shared/ProceduralNoise';
import {
  MANSION_BANQUET_HALL,
  MANSION_BUNKER_CEILING_Y,
  MANSION_BUNKER_Y,
  MANSION_EAST_WALL_X,
  MANSION_GROUND_CEILING_Y,
  MANSION_SECRET_ROOM,
} from '../BurnedMansionConfig';
import { CHAR_EMBER_INTENSITY } from '../BurnedMansionMaterials';
import type { MansionBuildContext } from './MansionBuildContext';

const ASH_COUNT: Readonly<Record<QualityLevel, number>> = { low: 40, medium: 70, high: 110 };
const EMBER_COUNT: Readonly<Record<QualityLevel, number>> = { low: 8, medium: 14, high: 22 };
const SMOKE_PUFFS: Readonly<Record<QualityLevel, number>> = { low: 3, medium: 5, high: 8 };
const BUNKER_DUST_COUNT: Readonly<Record<QualityLevel, number>> = { low: 20, medium: 35, high: 50 };

/** Ground-floor air volume, inside the outer walls. */
const HOUSE = { minX: -6.8, maxX: MANSION_EAST_WALL_X - 0.4, minZ: -7.8, maxZ: 9.8 } as const;
const BUNKER = { minX: MANSION_SECRET_ROOM.entranceX + 0.3, maxX: MANSION_EAST_WALL_X - 0.5, minZ: -9.2, maxZ: 1.7 } as const;
/**
 * Where embers still lift off: the scorched start-room ceiling, the stair
 * shaft, the east-hall cabinet, the burnt end of the banquet table and the
 * logs in the banquet fireplace.
 */
const EMBER_SOURCES = [
  new THREE.Vector3(-3.7, 0.4, 5.2),
  new THREE.Vector3(6.65, 0.2, -5.6),
  new THREE.Vector3(0.6, 0.3, -6.1),
  new THREE.Vector3(6.2, 0.2, 5.0),
  new THREE.Vector3(MANSION_BANQUET_HALL.table.x + 1.2, 0.8, MANSION_BANQUET_HALL.table.z + 0.1),
  new THREE.Vector3(MANSION_BANQUET_HALL.chimney.frontX - 0.25, 0.35, MANSION_BANQUET_HALL.chimney.z),
] as const;
const EMBER_COLOR = new THREE.Color(0xff7a2e);
const ASH_FALL_SPEED = 0.05;

interface Ember {
  readonly source: THREE.Vector3;
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly life: number;
  readonly rise: number;
  age: number;
}

interface SmokePuff {
  readonly sprite: THREE.Sprite;
  readonly origin: THREE.Vector3;
  readonly driftX: number;
  readonly driftZ: number;
  readonly life: number;
  age: number;
}

/** Soft round alpha spot shared by ash, embers, dust and smoke. */
function makeSoftSpot(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const offset = (y * size + x) * 4;
      data.fill(255, offset, offset + 3);
      data[offset + 3] = Math.round(Math.max(0, 1 - distance) ** 2 * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The fire is out but the house still smoulders: ash sifts down, embers
 * lift from the worst burns, smoke banks under the ceilings and the
 * charred wood's fissures breathe. The bunker only has old dust. Buffers
 * are allocated once; nothing here is solid or casts shadows.
 */
export class MansionAtmosphere {
  private readonly ash: THREE.Points;
  private readonly ashBase: Float32Array;
  private readonly ashPhase: Float32Array;
  private readonly embers: THREE.Points;
  private readonly emberState: Ember[] = [];
  private readonly dust: THREE.Points;
  private readonly dustBase: Float32Array;
  private readonly dustPhase: Float32Array;
  private readonly smoke: SmokePuff[] = [];
  private time = 0;

  constructor(private readonly context: MansionBuildContext) {
    const spot = makeSoftSpot(16);
    const quality = context.profile.quality;
    const random = seededRandom(5601);

    const ash = this.scatter(ASH_COUNT[quality], HOUSE, 0.2, MANSION_GROUND_CEILING_Y - 0.1, random);
    this.ashBase = ash.base;
    this.ashPhase = ash.phase;
    this.ash = this.makePoints('mansion-ash', ash.base.slice(), new THREE.PointsMaterial({
      name: 'mansion_ash', size: 0.03, map: spot, color: 0x8d8780, transparent: true, opacity: 0.55, depthWrite: false,
    }));

    const emberCount = EMBER_COUNT[quality];
    for (let index = 0; index < emberCount; index++) {
      const life = 2.5 + random() * 2.5;
      this.emberState.push({
        source: EMBER_SOURCES[index % EMBER_SOURCES.length],
        offsetX: (random() - 0.5) * 1.6,
        offsetZ: (random() - 0.5) * 1.6,
        life,
        rise: 0.35 + random() * 0.35,
        age: random() * life,
      });
    }
    const emberGeometry = new THREE.BufferGeometry();
    emberGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(emberCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    emberGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(emberCount * 3), 3).setUsage(THREE.DynamicDrawUsage));
    // Additive glow: a darker colour reads as a dimmer ember, so fading needs no per-point opacity.
    this.embers = this.attachPoints('mansion-embers', emberGeometry, new THREE.PointsMaterial({
      name: 'mansion_embers', size: 0.045, map: spot, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    }));

    const dust = this.scatter(BUNKER_DUST_COUNT[quality], BUNKER, MANSION_BUNKER_Y + 0.2, MANSION_BUNKER_CEILING_Y - 0.1, seededRandom(5607));
    this.dustBase = dust.base;
    this.dustPhase = dust.phase;
    this.dust = this.makePoints('mansion-bunker-dust', dust.base.slice(), new THREE.PointsMaterial({
      name: 'mansion_bunker_dust', size: 0.03, map: spot, color: 0xb6bab2, transparent: true, opacity: 0.4, depthWrite: false,
    }));

    this.addSmoke(spot, SMOKE_PUFFS[quality], random);
    this.update(0);
  }

  update(dt: number): void {
    this.time += Math.max(0, dt);
    this.updateDrift(this.ash, this.ashBase, this.ashPhase, ASH_FALL_SPEED, 0.2, MANSION_GROUND_CEILING_Y - 0.1);
    this.updateDrift(this.dust, this.dustBase, this.dustPhase, 0.012, MANSION_BUNKER_Y + 0.2, MANSION_BUNKER_CEILING_Y - 0.1);
    this.updateEmbers(dt);
    this.updateSmoke(dt);
    // Fissures in the char breathe slowly, with a faster flicker on top.
    const breath = 0.55 + 0.3 * Math.sin(this.time * 0.8) + 0.15 * Math.sin(this.time * 4.7 + 1.3);
    this.context.materials.charredWood.emissiveIntensity = CHAR_EMBER_INTENSITY * breath;
  }

  reset(): void {
    this.time = 0;
    for (const ember of this.emberState) ember.age = ember.life * ((ember.offsetX + 0.8) / 1.6);
    for (const puff of this.smoke) puff.age = 0;
    this.update(0);
  }

  private scatter(
    count: number,
    area: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number },
    minY: number,
    maxY: number,
    random: () => number,
  ): { base: Float32Array; phase: Float32Array } {
    const base = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    for (let index = 0; index < count; index++) {
      base[index * 3] = THREE.MathUtils.lerp(area.minX, area.maxX, random());
      base[index * 3 + 1] = THREE.MathUtils.lerp(minY, maxY, random());
      base[index * 3 + 2] = THREE.MathUtils.lerp(area.minZ, area.maxZ, random());
      phase[index] = random() * Math.PI * 2;
    }
    return { base, phase };
  }

  private makePoints(name: string, positions: Float32Array, material: THREE.PointsMaterial): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    return this.attachPoints(name, geometry, material);
  }

  private attachPoints(name: string, geometry: THREE.BufferGeometry, material: THREE.PointsMaterial): THREE.Points {
    const points = new THREE.Points(geometry, material);
    points.name = name;
    // Particles wander through the rooms; skip per-frame bounds updates.
    points.frustumCulled = false;
    this.context.group.add(points);
    return points;
  }

  /** Motes sinking at `fallSpeed` with a slow sway, wrapping from `minY` back to `maxY`. */
  private updateDrift(points: THREE.Points, base: Float32Array, phases: Float32Array, fallSpeed: number, minY: number, maxY: number): void {
    const attribute = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    const span = maxY - minY;
    const fall = (this.time * fallSpeed) % span;
    for (let index = 0; index < phases.length; index++) {
      const phase = phases[index];
      const offset = index * 3;
      positions[offset] = base[offset] + Math.sin(this.time * 0.17 + phase) * 0.3;
      let y = base[offset + 1] - fall;
      if (y < minY) y += span;
      positions[offset + 1] = y;
      positions[offset + 2] = base[offset + 2] + Math.cos(this.time * 0.13 + phase * 1.7) * 0.3;
    }
    attribute.needsUpdate = true;
  }

  private updateEmbers(dt: number): void {
    const positions = this.embers.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colors = this.embers.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let index = 0; index < this.emberState.length; index++) {
      const ember = this.emberState[index];
      ember.age = (ember.age + Math.max(0, dt)) % ember.life;
      const t = ember.age / ember.life;
      const wobble = Math.sin(this.time * 3.1 + index * 1.9) * 0.08;
      positions.setXYZ(
        index,
        ember.source.x + ember.offsetX + wobble + t * 0.25,
        ember.source.y + t * ember.rise * ember.life,
        ember.source.z + ember.offsetZ + Math.cos(this.time * 2.3 + index) * 0.08,
      );
      const glow = Math.sin(Math.PI * t) * (0.7 + 0.3 * Math.sin(this.time * 17 + index * 5.3));
      colors.setXYZ(index, EMBER_COLOR.r * glow, EMBER_COLOR.g * glow, EMBER_COLOR.b * glow);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  }

  /** Dark smoke wisps banked under the ground-floor ceiling, drifting and swelling. */
  private addSmoke(spot: THREE.Texture, count: number, random: () => number): void {
    const material = new THREE.SpriteMaterial({ name: 'mansion_smoke', map: spot, color: 0x2b241f, transparent: true, opacity: 0, depthWrite: false });
    for (let index = 0; index < count; index++) {
      // Sprites stay visible (opacity animates) so the shader compiles before the match.
      const sprite = new THREE.Sprite(material.clone());
      sprite.name = 'smoke-wisp';
      this.context.group.add(sprite);
      const life = 9 + random() * 6;
      this.smoke.push({
        sprite,
        origin: new THREE.Vector3(
          THREE.MathUtils.lerp(HOUSE.minX + 1, HOUSE.maxX - 1, random()),
          MANSION_GROUND_CEILING_Y - 0.45 - random() * 0.25,
          THREE.MathUtils.lerp(HOUSE.minZ + 1, HOUSE.maxZ - 1, random()),
        ),
        driftX: (random() - 0.5) * 0.25,
        driftZ: (random() - 0.5) * 0.25,
        life,
        age: (index / count) * life,
      });
    }
  }

  private updateSmoke(dt: number): void {
    for (const puff of this.smoke) {
      puff.age = (puff.age + Math.max(0, dt)) % puff.life;
      const t = puff.age / puff.life;
      puff.sprite.position.set(puff.origin.x + puff.driftX * puff.age, puff.origin.y + t * 0.2, puff.origin.z + puff.driftZ * puff.age);
      puff.sprite.scale.setScalar(1.6 + t * 1.8);
      (puff.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(Math.PI * t) * 0.2;
    }
  }
}
