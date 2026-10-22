import * as THREE from 'three';
import type { QualityLevel } from '../../../core/DeviceProfile';
import { seededRandom } from '../shared/ProceduralNoise';
import { CONSIGNA, VESTIBULE } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { ceilingHeightAt, vaultHeightAt } from './VaultProfile';

const DUST_COUNT: Readonly<Record<QualityLevel, number>> = { low: 30, medium: 60, high: 90 };
/** Extra motes over the luggage-office hall, seeded apart so the vestibule's stay put. */
const CONSIGNA_DUST_COUNT: Readonly<Record<QualityLevel, number>> = { low: 10, medium: 20, high: 30 };
const STEAM_PUFFS: Readonly<Record<QualityLevel, number>> = { low: 2, medium: 3, high: 5 };
/**
 * Seepage points in the ceilings; the third one is the hole the vault
 * plaster fell from, the last two soak the luggage office.
 */
const DRIP_SOURCES = [
  { x: -1.2, z: 7.3, interval: 2.3 },
  { x: 2.7, z: 12.2, interval: 3.1 },
  { x: 4.6, z: 15.0, interval: 1.7 },
  { x: 16.1, z: 11.6, interval: 2.6 },
  { x: 19.6, z: 16.7, interval: 1.9 },
] as const;
/** Severed cables hanging out of the ceilings: anchor, length and sway phase. */
const HANGING_CABLES = [
  { x: 4.4, z: 14.8, length: 1.6, phase: 0.4 },
  { x: 4.9, z: 15.3, length: 1.1, phase: 2.2 },
  { x: -5.2, z: 6.2, length: 1.3, phase: 4.1 },
  { x: 12.3, z: 9.1, length: 0.9, phase: 3.0 },
] as const;
/** The fluorescent fixture that tore loose from its slot and hangs by one chain. */
const DANGLING_FIXTURE = { x: 2, z: 6.75, chain: 0.9 } as const;
const STEAM_SOURCE = new THREE.Vector3(VESTIBULE.maxX - 0.2, 3.45, 15.6);
const GRAVITY = 9.8;
const TREMOR_SWAY = 3.2;
const TREMOR_DUST = 5;

interface Swinging {
  readonly pivot: THREE.Object3D;
  readonly phase: number;
  readonly amplitude: number;
  readonly frequency: number;
}

interface Drip {
  readonly x: number;
  readonly z: number;
  readonly top: number;
  readonly interval: number;
  timer: number;
  falling: boolean;
  y: number;
  speed: number;
}

interface SteamPuff {
  readonly sprite: THREE.Sprite;
  age: number;
  readonly life: number;
  readonly driftX: number;
}

/** Soft round alpha spot shared by dust motes and steam. */
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
 * Cheap motion that keeps the dead station alive: drifting dust, drips
 * into puddles, swaying cables and a dangling lamp, a leaking steam pipe.
 * Buffers are allocated once; `tremor` (a distant train) stirs all of it.
 */
export class Station33Atmosphere {
  private readonly dust: THREE.Points;
  private readonly dustBase: Float32Array;
  private readonly dustPhase: Float32Array;
  private readonly drops: THREE.Points;
  private readonly drips: Drip[];
  private readonly swinging: Swinging[] = [];
  private readonly steam: SteamPuff[] = [];
  private time = 0;
  private tremorRemaining = 0;
  private tremorDuration = 1;

  constructor(private readonly context: Station33BuildContext, lighting: Station33Lighting) {
    const spot = makeSoftSpot(16);
    const quality = context.profile.quality;
    const random = seededRandom(3407);

    const dustCount = DUST_COUNT[quality];
    const totalDust = dustCount + CONSIGNA_DUST_COUNT[quality];
    this.dustBase = new Float32Array(totalDust * 3);
    this.dustPhase = new Float32Array(totalDust);
    for (let index = 0; index < dustCount; index++) {
      this.dustBase[index * 3] = THREE.MathUtils.lerp(VESTIBULE.minX + 0.5, VESTIBULE.maxX - 0.5, random());
      this.dustBase[index * 3 + 1] = 0.3 + random() * 3.8;
      this.dustBase[index * 3 + 2] = THREE.MathUtils.lerp(VESTIBULE.minZ + 0.5, VESTIBULE.maxZ - 0.5, random());
      this.dustPhase[index] = random() * Math.PI * 2;
    }
    const consignaRandom = seededRandom(3413);
    const { hall } = CONSIGNA;
    for (let index = dustCount; index < totalDust; index++) {
      this.dustBase[index * 3] = THREE.MathUtils.lerp(hall.minX + 0.5, hall.maxX - 0.5, consignaRandom());
      this.dustBase[index * 3 + 1] = 0.3 + consignaRandom() * (CONSIGNA.ceilingHeight - 0.5);
      this.dustBase[index * 3 + 2] = THREE.MathUtils.lerp(hall.minZ + 0.5, hall.maxZ - 0.5, consignaRandom());
      this.dustPhase[index] = consignaRandom() * Math.PI * 2;
    }
    this.dust = this.makePoints('station33-dust', this.dustBase.slice(), new THREE.PointsMaterial({
      name: 'station33_dust', size: 0.035, map: spot, color: 0xb8c2b8, transparent: true, opacity: 0.45, depthWrite: false,
    }));

    this.drips = DRIP_SOURCES.map((source) => ({
      x: source.x,
      z: source.z,
      top: ceilingHeightAt(source.x) - 0.05,
      interval: source.interval,
      timer: random() * source.interval,
      falling: false,
      y: 0,
      speed: 0,
    }));
    this.drops = this.makePoints('station33-drops', new Float32Array(this.drips.length * 3), new THREE.PointsMaterial({
      name: 'station33_drops', size: 0.05, map: spot, color: 0xa9c4c4, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    for (const drip of this.drips) {
      const puddle = new THREE.PlaneGeometry(0.9, 0.7).rotateX(-Math.PI / 2).rotateY(drip.x).translate(drip.x, 0.007, drip.z);
      context.batch.add(puddle, context.materials.puddle);
    }

    for (const cable of HANGING_CABLES) this.addCable(cable.x, cable.z, cable.length, cable.phase);
    this.addDanglingFixture(lighting);
    this.addSteam(spot, STEAM_PUFFS[quality], random);
    this.update(0);
  }

  /** A train passing far below: dust shakes loose and everything hanging swings harder. */
  tremor(duration: number): void {
    this.tremorDuration = Math.max(0.1, duration);
    this.tremorRemaining = this.tremorDuration;
  }

  update(dt: number): void {
    this.time += Math.max(0, dt);
    this.tremorRemaining = Math.max(0, this.tremorRemaining - dt);
    const shake = this.tremorRemaining > 0 ? Math.sin(Math.PI * this.tremorRemaining / this.tremorDuration) : 0;
    this.updateDust(shake);
    this.updateDrips(dt);
    for (const swing of this.swinging) {
      const amplitude = swing.amplitude * (1 + shake * TREMOR_SWAY);
      swing.pivot.rotation.z = Math.sin(this.time * swing.frequency + swing.phase) * amplitude;
      swing.pivot.rotation.x = Math.sin(this.time * swing.frequency * 0.7 + swing.phase * 1.3) * amplitude * 0.6;
    }
    this.updateSteam(dt);
  }

  reset(): void {
    this.time = 0;
    this.tremorRemaining = 0;
    for (const drip of this.drips) {
      drip.falling = false;
      drip.timer = drip.interval * 0.5;
    }
    for (let index = 0; index < this.steam.length; index++) this.steam[index].age = (index / this.steam.length) * this.steam[index].life;
    this.update(0);
  }

  private makePoints(name: string, positions: Float32Array, material: THREE.PointsMaterial): THREE.Points {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(geometry, material);
    points.name = name;
    // Particles wander inside the hall; skip per-frame bounds updates.
    points.frustumCulled = false;
    this.context.group.add(points);
    return points;
  }

  private updateDust(shake: number): void {
    const attribute = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    const fall = (this.time * (0.04 + shake * 0.04 * TREMOR_DUST)) % 4;
    for (let index = 0; index < this.dustPhase.length; index++) {
      const phase = this.dustPhase[index];
      const offset = index * 3;
      positions[offset] = this.dustBase[offset] + Math.sin(this.time * 0.13 + phase) * 0.35;
      let y = this.dustBase[offset + 1] - fall;
      if (y < 0.2) y += 4;
      positions[offset + 1] = y;
      positions[offset + 2] = this.dustBase[offset + 2] + Math.cos(this.time * 0.11 + phase * 1.7) * 0.35;
    }
    (this.dust.material as THREE.PointsMaterial).opacity = 0.45 + shake * 0.35;
    attribute.needsUpdate = true;
  }

  private updateDrips(dt: number): void {
    const attribute = this.drops.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < this.drips.length; index++) {
      const drip = this.drips[index];
      if (drip.falling) {
        drip.speed += GRAVITY * dt;
        drip.y -= drip.speed * dt;
        if (drip.y <= 0.02) drip.falling = false;
      } else {
        drip.timer -= dt;
        if (drip.timer <= 0) {
          drip.timer = drip.interval * (0.8 + 0.4 * ((index * 0.37 + this.time) % 1));
          drip.falling = true;
          drip.y = drip.top;
          drip.speed = 0;
        }
      }
      // A resting drop hides inside the vault until it falls.
      attribute.setXYZ(index, drip.x, drip.falling ? drip.y : drip.top + 0.2, drip.z);
    }
    attribute.needsUpdate = true;
  }

  private addCable(x: number, z: number, length: number, phase: number): void {
    const pivot = new THREE.Group();
    pivot.position.set(x, ceilingHeightAt(x) - 0.02, z);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.08, -length * 0.4, 0.05),
      new THREE.Vector3(-0.05, -length * 0.8, -0.04),
      new THREE.Vector3(0.12, -length, 0.06),
    ]);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 5), this.context.materials.rubber);
    cable.name = 'hanging-cable';
    pivot.add(cable);
    this.context.group.add(pivot);
    this.swinging.push({ pivot, phase, amplitude: 0.07, frequency: 1.1 + phase * 0.1 });
  }

  /** Housing and tubes hanging nose-down from a single chain, still flickering. */
  private addDanglingFixture(lighting: Station33Lighting): void {
    const { materials } = this.context;
    const pivot = new THREE.Group();
    pivot.position.set(DANGLING_FIXTURE.x + 0.5, vaultHeightAt(DANGLING_FIXTURE.x) - 0.02, DANGLING_FIXTURE.z - 0.7);
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, DANGLING_FIXTURE.chain, 4), materials.greySteel);
    chain.position.y = -DANGLING_FIXTURE.chain / 2;
    const fixture = new THREE.Group();
    fixture.position.y = -DANGLING_FIXTURE.chain;
    fixture.rotation.x = 1.15;
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 1.75), materials.greySteel);
    housing.position.z = 0.85;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 1.5, 8).rotateX(Math.PI / 2), lighting.circuitMaterial('failing'));
    tube.position.set(0.06, -0.06, 0.85);
    fixture.add(housing, tube);
    pivot.add(chain, fixture);
    pivot.name = 'dangling-fixture';
    this.context.group.add(pivot);
    this.swinging.push({ pivot, phase: 1.3, amplitude: 0.05, frequency: 0.8 });
  }

  /** Pipe along the east wall with a cracked joint venting faint steam. */
  private addSteam(spot: THREE.Texture, count: number, random: () => number): void {
    const { batch, materials } = this.context;
    const pipe = new THREE.CylinderGeometry(0.07, 0.07, VESTIBULE.maxZ - VESTIBULE.minZ, 10).rotateX(Math.PI / 2);
    pipe.translate(STEAM_SOURCE.x, STEAM_SOURCE.y, (VESTIBULE.minZ + VESTIBULE.maxZ) / 2);
    batch.add(pipe, materials.greySteel);
    for (let index = 0; index < 6; index++) {
      batch.addBox(materials.greySteel, STEAM_SOURCE.x + 0.1, STEAM_SOURCE.y, VESTIBULE.minZ + 1.5 + index * 3, 0.05, 0.2, 0.06);
    }
    const material = new THREE.SpriteMaterial({ name: 'station33_steam', map: spot, color: 0xc9d2cf, transparent: true, opacity: 0, depthWrite: false });
    for (let index = 0; index < count; index++) {
      // Sprites stay visible (opacity animates) so the shader compiles before the match.
      const sprite = new THREE.Sprite(material.clone());
      sprite.name = 'steam-puff';
      this.context.group.add(sprite);
      const life = 2.6 + random() * 1.2;
      this.steam.push({ sprite, age: (index / count) * life, life, driftX: -0.25 - random() * 0.25 });
    }
  }

  private updateSteam(dt: number): void {
    for (const puff of this.steam) {
      puff.age = (puff.age + dt) % puff.life;
      const t = puff.age / puff.life;
      puff.sprite.position.set(STEAM_SOURCE.x + puff.driftX * t * 2, STEAM_SOURCE.y + t * 0.7, STEAM_SOURCE.z + Math.sin(t * 5) * 0.08);
      puff.sprite.scale.setScalar(0.25 + t * 1.1);
      (puff.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(Math.PI * t) * 0.22;
    }
  }
}
