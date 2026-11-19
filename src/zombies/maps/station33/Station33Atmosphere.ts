import * as THREE from 'three';
import { makeSoftSpot } from '../shared/SoftSpotTexture';
import type { QualityLevel } from '../../../core/DeviceProfile';
import { seededRandom } from '../shared/ProceduralNoise';
import { COCHERAS, CONSIGNA, KOVKA, MILICIA, STATION33_DRIP_SOURCES as DRIP_SOURCES, STATION33_PUDDLE, SUBESTACION, TALLER, TALLER_CRANE, VESTIBULE } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { ceilingHeightAt, VESTIBULE_VAULT } from './VaultProfile';

interface DustVolume {
  readonly room: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
  readonly count: Readonly<Record<QualityLevel, number>>;
  /** Top of the band the motes start in. */
  readonly ceiling: number;
  /** Each room has its own seed, so adding a room never moves another's motes. */
  readonly seed: number;
}

/** Motes over the vestibule, the luggage-office hall, the train sheds, the machine room, the militia post, the workshop and the KOVKA chamber. */
const DUST_VOLUMES: ReadonlyArray<DustVolume> = [
  { room: VESTIBULE, count: { low: 30, medium: 60, high: 90, ultraMax: 135 }, ceiling: 4.1, seed: 3407 },
  { room: CONSIGNA.hall, count: { low: 10, medium: 20, high: 30, ultraMax: 45 }, ceiling: CONSIGNA.ceilingHeight - 0.2, seed: 3413 },
  { room: COCHERAS.hall, count: { low: 20, medium: 40, high: 60, ultraMax: 90 }, ceiling: 4.1, seed: 3419 },
  { room: SUBESTACION.hall, count: { low: 10, medium: 20, high: 30, ultraMax: 45 }, ceiling: 4.1, seed: 3421 },
  { room: MILICIA.hall, count: { low: 8, medium: 16, high: 24, ultraMax: 36 }, ceiling: MILICIA.ceilingHeight - 0.2, seed: 3423 },
  { room: TALLER.hall, count: { low: 10, medium: 20, high: 30, ultraMax: 45 }, ceiling: TALLER.ceilingHeight - 0.2, seed: 3427 },
  { room: KOVKA.hall, count: { low: 12, medium: 24, high: 40, ultraMax: 60 }, ceiling: KOVKA.wallHeight, seed: 3431 },
];
const STEAM_PUFFS: Readonly<Record<QualityLevel, number>> = { low: 2, medium: 3, high: 5, ultraMax: 8 };
/** Severed cables hanging out of the ceilings: anchor, length and sway phase. */
const HANGING_CABLES = [
  { x: 4.4, z: 14.8, length: 1.6, phase: 0.4 },
  { x: 4.9, z: 15.3, length: 1.1, phase: 2.2 },
  { x: -5.2, z: 6.2, length: 1.3, phase: 4.1 },
  { x: 12.3, z: 9.1, length: 0.9, phase: 3.0 },
  { x: 12.9, z: -13.2, length: 2.1, phase: 1.1 },
  { x: 18.6, z: -18.4, length: 1.5, phase: 3.6 },
  { x: 12.0, z: -44.2, length: 1.3, phase: 0.9 },
  { x: 9.3, z: -31.6, length: 0.7, phase: 2.7 },
  { x: 7.2, z: -53.6, length: 1.0, phase: 1.7 },
  { x: -13.4, z: -42.8, length: 2.2, phase: 0.6 },
  { x: -23.6, z: -61.2, length: 2.6, phase: 2.4 },
  { x: -7.4, z: -52.4, length: 1.8, phase: 4.6 },
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

export { makeSoftSpot } from '../shared/SoftSpotTexture';

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
    const random = seededRandom(3401);

    const totalDust = DUST_VOLUMES.reduce((sum, volume) => sum + volume.count[quality], 0);
    this.dustBase = new Float32Array(totalDust * 3);
    this.dustPhase = new Float32Array(totalDust);
    let mote = 0;
    for (const { room, count, ceiling, seed } of DUST_VOLUMES) {
      const roomRandom = seededRandom(seed);
      for (let index = 0; index < count[quality]; index++, mote++) {
        this.dustBase[mote * 3] = THREE.MathUtils.lerp(room.minX + 0.5, room.maxX - 0.5, roomRandom());
        this.dustBase[mote * 3 + 1] = 0.3 + roomRandom() * (ceiling - 0.3);
        this.dustBase[mote * 3 + 2] = THREE.MathUtils.lerp(room.minZ + 0.5, room.maxZ - 0.5, roomRandom());
        this.dustPhase[mote] = roomRandom() * Math.PI * 2;
      }
    }
    this.dust = this.makePoints('station33-dust', this.dustBase.slice(), new THREE.PointsMaterial({
      name: 'station33_dust', size: 0.035, map: spot, color: 0xb8c2b8, transparent: true, opacity: 0.45, depthWrite: false,
    }));

    this.drips = DRIP_SOURCES.map((source) => ({
      x: source.x,
      z: source.z,
      top: ceilingHeightAt(source.x, source.z) - 0.05,
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
      const puddle = new THREE.PlaneGeometry(STATION33_PUDDLE.halfWidth * 2, STATION33_PUDDLE.halfDepth * 2).rotateX(-Math.PI / 2).rotateY(drip.x).translate(drip.x, 0.007, drip.z);
      context.batch.add(puddle, context.materials.puddle);
    }

    for (const cable of HANGING_CABLES) this.addCable(cable.x, cable.z, cable.length, cable.phase);
    this.addDanglingFixture(lighting);
    this.addCraneHook();
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
    pivot.position.set(x, ceilingHeightAt(x, z) - 0.02, z);
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
    pivot.position.set(DANGLING_FIXTURE.x + 0.5, VESTIBULE_VAULT.heightAt(DANGLING_FIXTURE.x) - 0.02, DANGLING_FIXTURE.z - 0.7);
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

  /** The workshop crane's chain and hook, swinging slowly under the parked hoist. */
  private addCraneHook(): void {
    const { materials } = this.context;
    const { hoistX, hoistY, hookY, bridgeZ } = TALLER_CRANE;
    const pivot = new THREE.Group();
    pivot.position.set(hoistX, hoistY, bridgeZ);
    const chainLength = hoistY - hookY - 0.25;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, chainLength, 6), materials.greySteel);
    chain.position.y = -chainLength / 2;
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.1), materials.hazardPaint);
    block.position.y = -chainLength - 0.08;
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 6, 14, Math.PI * 1.5), materials.greySteel);
    hook.position.y = -(hoistY - hookY) + 0.07;
    hook.rotation.z = Math.PI * 0.75;
    pivot.add(chain, block, hook);
    pivot.name = 'workshop-crane-hook';
    this.context.group.add(pivot);
    this.swinging.push({ pivot, phase: 0.6, amplitude: 0.035, frequency: 0.7 });
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
