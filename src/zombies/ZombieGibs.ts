import * as THREE from 'three';
import { GibWallFrame, type GibWallContact, type GibWalls } from './GibWalls';
import { stepBloodDrop, type BloodDrop } from './BloodDropMotion';
import { bloodGeometry, bloodMaterial } from './ZombieBloodAssets';

/** Upright body space, like ZombieDeathPose: +z forward, +x the zombie's left, metres on a walker. */
type Vec3 = readonly [number, number, number];

interface GibPieceSpec {
  readonly shape: 'head' | 'chunk' | 'limb';
  /** Where the piece sat on the standing body. */
  readonly at: Vec3;
  /** Half extents of the piece. */
  readonly size: Vec3;
  readonly material: 'skin' | 'cloth';
  /** Torn end that shows the red wound: +1 the top of the piece, -1 its bottom. */
  readonly wound: 1 | -1;
}

/** The body broken at the neck, waist, hips, shoulders, elbows, wrists, knees and ankles. */
const BODY_PIECES: readonly GibPieceSpec[] = [
  { shape: 'head', at: [0, 1.6, 0.02], size: [0.11, 0.13, 0.12], material: 'skin', wound: -1 },
  { shape: 'chunk', at: [0, 1.3, 0], size: [0.2, 0.16, 0.13], material: 'cloth', wound: -1 },
  { shape: 'chunk', at: [0, 1.04, 0], size: [0.18, 0.12, 0.12], material: 'skin', wound: 1 },
  { shape: 'chunk', at: [0, 0.86, 0], size: [0.18, 0.09, 0.12], material: 'cloth', wound: 1 },
  { shape: 'limb', at: [0.25, 1.28, 0.04], size: [0.05, 0.14, 0.05], material: 'skin', wound: 1 },
  { shape: 'limb', at: [-0.25, 1.28, 0.04], size: [0.05, 0.14, 0.05], material: 'skin', wound: 1 },
  { shape: 'limb', at: [0.29, 1.04, 0.14], size: [0.042, 0.13, 0.042], material: 'skin', wound: 1 },
  { shape: 'limb', at: [-0.29, 1.04, 0.14], size: [0.042, 0.13, 0.042], material: 'skin', wound: 1 },
  { shape: 'limb', at: [0.1, 0.6, 0], size: [0.07, 0.19, 0.07], material: 'cloth', wound: 1 },
  { shape: 'limb', at: [-0.1, 0.6, 0], size: [0.07, 0.19, 0.07], material: 'cloth', wound: 1 },
  { shape: 'limb', at: [0.1, 0.22, 0], size: [0.055, 0.19, 0.055], material: 'cloth', wound: 1 },
  { shape: 'limb', at: [-0.1, 0.22, 0], size: [0.055, 0.19, 0.055], material: 'cloth', wound: 1 },
  { shape: 'chunk', at: [0.31, 0.86, 0.2], size: [0.045, 0.06, 0.03], material: 'skin', wound: 1 },
  { shape: 'chunk', at: [-0.31, 0.86, 0.2], size: [0.045, 0.06, 0.03], material: 'skin', wound: 1 },
  { shape: 'chunk', at: [0.1, 0.05, 0.05], size: [0.05, 0.045, 0.1], material: 'cloth', wound: 1 },
  { shape: 'chunk', at: [-0.1, 0.05, 0.05], size: [0.05, 0.045, 0.1], material: 'cloth', wound: 1 },
];
/** Loose flesh scraps thrown from the torso. */
const GORE_BITS = 34;
/** Blood drops that splat flat where they land, on the floor or on a wall. */
const BLOOD_DROPS = 70;
/** Height the body bursts from: pieces fly away from this point. */
const BURST_CENTER_Y = 1.1;
/** Speed (m/s) the round throws the remains along its path: a minimum plus a random extra. */
const PIECE_PUSH = 12;
const PIECE_PUSH_RANGE = 6;
/** How hard pieces are also flung outwards from the burst centre, per metre of offset. */
const RADIAL_PUSH = 5;
/** Tumble rate (rad/s) of body pieces and of the smaller scraps and drops. */
const PIECE_SPIN = 20;
const SCRAP_SPIN = 28;
/** Red spray clouds left hanging in the air where the body burst. */
const MIST_CLOUDS = 12;
const MIST_LIFE = 1.1;
const MIST_SIZE = 0.45;
/** A cloud grows to this many times its starting size as it thins out. */
const MIST_GROWTH = 2.8;
const MIST_OPACITY = 0.85;
/** Drift (m/s) of the clouds along the shot; air slows it down. */
const MIST_DRIFT = 2.2;
const MIST_DRAG = 2;
/** Radius a mist cloud keeps from walls. */
const MIST_RADIUS = 0.1;
const MIST_COLOR = 0x7a0706;
/** Side of the generated soft round mist texture, in texels. */
const MIST_TEXTURE_SIZE = 32;
/** Blood pool spreading on the floor where the zombie stood. */
const POOL_RADIUS = 0.6;
const POOL_GROW_TIME = 0.8;
const GRAVITY = 9.8;
/** Landing speed below which a piece stops bouncing and lies still. */
const SETTLE_SPEED = 1.2;
const BOUNCE = 0.3;
/** Share of its speed a piece keeps bouncing back off a wall. */
const WALL_BOUNCE = 0.25;
const GROUND_FRICTION = 0.65;
const AIR_DRAG = 0.4;

/** Skin and cloth tones before the instance tint multiplies them. */
const SKIN_BASE = 0x9a9478;
const CLOTH_BASE = 0x463d33;
const GORE_COLOR = 0x5c0806;

interface GibParticle {
  readonly mesh: THREE.Mesh;
  readonly velocity: THREE.Vector3;
  readonly spin: THREE.Vector3;
  /** Half extents as built; `baseScale` is the shown scale before the fade (a landed drop is flattened). */
  readonly size: THREE.Vector3;
  readonly baseScale: THREE.Vector3;
  /** Centre height above a surface it lies on. */
  rest: number;
  resting: boolean;
  /** Drops flatten into a splat where they land. */
  readonly splats: boolean;
  readonly blood: BloodDrop | null;
}

interface MistCloud {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  readonly velocity: THREE.Vector3;
  size: number;
}

// Unit shapes shared by every zombie's gibs; scaled per piece.
let chunkGeometry: THREE.BufferGeometry | null = null;
let headGeometry: THREE.BufferGeometry | null = null;
let limbGeometry: THREE.BufferGeometry | null = null;
let poolGeometry: THREE.BufferGeometry | null = null;
let goreMaterial: THREE.MeshStandardMaterial | null = null;
let mistTexture: THREE.DataTexture | null = null;

function shapeGeometry(shape: GibPieceSpec['shape']): THREE.BufferGeometry {
  if (shape === 'head') return (headGeometry ??= new THREE.IcosahedronGeometry(1, 1));
  if (shape === 'limb') return (limbGeometry ??= new THREE.CylinderGeometry(1, 0.85, 2, 7));
  return (chunkGeometry ??= new THREE.DodecahedronGeometry(1, 0));
}

/** Flat unit disc lying on the floor. */
function sharedPoolGeometry(): THREE.BufferGeometry {
  return (poolGeometry ??= new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2));
}

function sharedGore(): THREE.MeshStandardMaterial {
  return (goreMaterial ??= new THREE.MeshStandardMaterial({ color: GORE_COLOR, roughness: 0.35, metalness: 0 }));
}

/** Soft white disc, opaque at the centre and fading to the rim; built from data so it needs no canvas. */
function sharedMistTexture(): THREE.DataTexture {
  if (mistTexture) return mistTexture;
  const side = MIST_TEXTURE_SIZE;
  const data = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const radius = Math.hypot(((x + 0.5) / side) * 2 - 1, ((y + 0.5) / side) * 2 - 1);
      const alpha = Math.max(0, 1 - radius) ** 2;
      data.set([255, 255, 255, Math.round(alpha * 255)], (y * side + x) * 4);
    }
  }
  mistTexture = new THREE.DataTexture(data, side, side);
  mistTexture.needsUpdate = true;
  return mistTexture;
}

function spread(range: number): number {
  return (Math.random() * 2 - 1) * range;
}

/**
 * A zombie blown apart by a heavy round: body pieces with red torn ends,
 * flesh scraps and blood drops thrown away from the impact, a red spray
 * hanging briefly where the body burst and a pool spreading under it.
 * Pieces bounce off the map walls (GibWalls), drops splat on walls and
 * floor, and everything comes to rest on the floor or on top of furniture.
 * Lives in the zombie's group but simulates in a world-aligned frame; the
 * owner drives burst(), update() and hide().
 */
export class ZombieGibs {
  readonly group = new THREE.Group();
  private readonly particles: GibParticle[] = [];
  private readonly mist: MistCloud[] = [];
  private readonly pool: THREE.Mesh;
  private mistAge = Infinity;
  private poolAge = Infinity;
  private readonly wallFrame = new GibWallFrame();
  private readonly previous = new THREE.Vector3();
  private readonly ownMaterials: THREE.Material[] = [];

  constructor(tint: number, private readonly walls: GibWalls) {
    const tintColor = new THREE.Color(tint);
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(SKIN_BASE).multiply(tintColor), roughness: 0.85 });
    const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(CLOTH_BASE).multiply(tintColor), roughness: 0.9 });
    this.ownMaterials.push(skin, cloth);

    for (const spec of BODY_PIECES) {
      const mesh = new THREE.Mesh(shapeGeometry(spec.shape), spec.material === 'skin' ? skin : cloth);
      const wound = new THREE.Mesh(shapeGeometry('chunk'), sharedGore());
      wound.position.y = spec.wound * 0.92;
      wound.scale.set(0.85, 0.28, 0.85);
      mesh.add(wound);
      this.addParticle(mesh, new THREE.Vector3(...spec.size), false);
    }
    for (let i = 0; i < GORE_BITS; i++) {
      const size = 0.03 + Math.random() * 0.04;
      this.addParticle(new THREE.Mesh(shapeGeometry('chunk'), sharedGore()), new THREE.Vector3(size, size * 0.7, size), false);
    }
    for (let i = 0; i < BLOOD_DROPS; i++) {
      const size = 0.014 + Math.random() * 0.018;
      this.addParticle(new THREE.Mesh(bloodGeometry(), bloodMaterial()), new THREE.Vector3(size, size, size), true);
    }
    for (let i = 0; i < MIST_CLOUDS; i++) {
      const material = new THREE.SpriteMaterial({
        map: sharedMistTexture(),
        color: MIST_COLOR,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.group.add(sprite);
      this.ownMaterials.push(material);
      this.mist.push({ sprite, material, velocity: new THREE.Vector3(), size: MIST_SIZE });
    }
    this.pool = new THREE.Mesh(sharedPoolGeometry(), bloodMaterial());
    this.pool.position.y = 0.003;
    this.pool.visible = false;
    this.group.add(this.pool);
    this.group.name = 'zombie-gibs';
    this.group.visible = false;
  }

  /**
   * Throws every piece from the standing body. `pushX`/`pushZ` is the
   * body-local unit direction the round travelled, `yaw` the body's turn
   * and `scale` sizes the pieces to the zombie type's body.
   */
  burst(pushX: number, pushZ: number, scale: number, yaw: number): void {
    // Undo the body's turn so the gibs simulate on world axes, like the wall boxes.
    this.group.rotation.set(0, -yaw, 0);
    this.group.scale.setScalar(scale);
    this.group.visible = true;
    this.group.updateWorldMatrix(true, false);
    this.wallFrame.capture(this.walls, this.group);

    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const frameX = (x: number, z: number): number => x * cos + z * sin;
    const frameZ = (x: number, z: number): number => z * cos - x * sin;
    const length = Math.hypot(pushX, pushZ);
    const localX = length > 0 ? pushX / length : 0;
    const localZ = length > 0 ? pushZ / length : -1;
    const dirX = frameX(localX, localZ);
    const dirZ = frameZ(localX, localZ);

    BODY_PIECES.forEach((spec, index) => {
      const [bodyX, y, bodyZ] = spec.at;
      const x = frameX(bodyX, bodyZ);
      const z = frameZ(bodyX, bodyZ);
      const force = PIECE_PUSH + Math.random() * PIECE_PUSH_RANGE;
      const outward = 1.6 + Math.random() * 1.6;
      const lift = (spec.shape === 'head' ? 5 : 2) + Math.random() * 3;
      this.launch(this.particles[index], x, y, z,
        dirX * force + x * outward * RADIAL_PUSH + spread(1.2),
        lift + (y - BURST_CENTER_Y) * outward,
        dirZ * force + z * outward * RADIAL_PUSH + spread(1.2),
        PIECE_SPIN);
    });
    for (let index = BODY_PIECES.length; index < this.particles.length; index++) {
      const particle = this.particles[index];
      const force = (particle.splats ? 0.75 : 1) * (PIECE_PUSH + Math.random() * PIECE_PUSH_RANGE * 1.5);
      this.launch(particle, spread(0.15), BURST_CENTER_Y + spread(0.25), spread(0.1),
        dirX * force + spread(3), 0.8 + Math.random() * 4.5, dirZ * force + spread(3), SCRAP_SPIN);
    }
    this.mistAge = 0;
    for (const cloud of this.mist) {
      const drift = MIST_DRIFT * (0.5 + Math.random());
      cloud.size = MIST_SIZE * (0.7 + Math.random() * 0.6);
      cloud.sprite.position.set(spread(0.2), BURST_CENTER_Y + spread(0.3), spread(0.2));
      cloud.velocity.set(dirX * drift + spread(0.6), Math.random() * 0.3, dirZ * drift + spread(0.6));
      cloud.sprite.visible = true;
    }
    this.poolAge = 0;
    this.pool.scale.setScalar(0.001);
    this.pool.visible = true;
  }

  /** Steps the flight; `fade` 0 → 1 shrinks the remains away at the end of the corpse time. */
  update(dt: number, fade: number): void {
    const shrink = Math.max(0, 1 - fade);
    for (const particle of this.particles) {
      if (!particle.resting) this.fly(particle, dt);
      particle.mesh.scale.copy(particle.baseScale).multiplyScalar(shrink);
    }
    this.updateMist(dt);
    this.poolAge += dt;
    const spreadOut = 1 - (1 - Math.min(1, this.poolAge / POOL_GROW_TIME)) ** 2;
    this.pool.scale.setScalar(Math.max(0.001, POOL_RADIUS * spreadOut * shrink));
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    for (const material of this.ownMaterials) material.dispose();
  }

  private fly(particle: GibParticle, dt: number): void {
    if (particle.blood) {
      stepBloodDrop(particle.blood, dt, this.wallFrame, 0);
      particle.resting = particle.blood.resting;
      if (particle.resting) particle.mesh.rotation.set(0, 0, 0);
      return;
    }
    let remaining = Math.max(0, dt);
    while (remaining > 0 && !particle.resting) {
      const step = Math.min(remaining, 1 / 120);
      remaining -= step;
      this.flyPiece(particle, step);
    }
  }

  private flyPiece(particle: GibParticle, dt: number): void {
    const { mesh, velocity, spin } = particle;
    this.previous.copy(mesh.position);
    velocity.y -= GRAVITY * dt;
    const drag = Math.max(0, 1 - AIR_DRAG * dt);
    velocity.x *= drag;
    velocity.z *= drag;
    mesh.position.addScaledVector(velocity, dt);
    mesh.rotation.x += spin.x * dt;
    mesh.rotation.y += spin.y * dt;
    mesh.rotation.z += spin.z * dt;

    const contact = this.wallFrame.collide(mesh.position, this.previous, particle.rest);
    if (contact === 'top') {
      if (velocity.y < 0) this.land(particle, mesh.position.y - particle.rest);
      return;
    }
    if (contact) this.hitWall(particle, contact);
    if (!particle.resting && mesh.position.y <= particle.rest && velocity.y < 0) this.land(particle, 0);
  }

  private updateMist(dt: number): void {
    if (this.mistAge >= MIST_LIFE) return;
    this.mistAge += dt;
    const t = Math.min(1, this.mistAge / MIST_LIFE);
    const drag = Math.max(0, 1 - MIST_DRAG * dt);
    for (const cloud of this.mist) {
      const position = cloud.sprite.position;
      this.previous.copy(position);
      cloud.velocity.multiplyScalar(drag);
      position.addScaledVector(cloud.velocity, dt);
      if (this.wallFrame.collide(position, this.previous, MIST_RADIUS)) cloud.velocity.set(0, 0, 0);
      cloud.sprite.scale.setScalar(cloud.size * (1 + t * (MIST_GROWTH - 1)));
      cloud.material.opacity = MIST_OPACITY * (1 - t) ** 2;
      cloud.sprite.visible = t < 1;
    }
  }

  private addParticle(mesh: THREE.Mesh, size: THREE.Vector3, splats: boolean): void {
    mesh.castShadow = false;
    mesh.scale.copy(size);
    this.group.add(mesh);
    const baseScale = size.clone();
    const velocity = new THREE.Vector3();
    this.particles.push({
      mesh,
      velocity,
      spin: new THREE.Vector3(),
      size: size.clone(),
      baseScale,
      rest: Math.min(size.x, size.y, size.z),
      resting: false,
      splats,
      blood: splats ? { position: mesh.position, previous: new THREE.Vector3(), velocity,
        scale: baseScale, radius: size.x, resting: false } : null,
    });
  }

  private launch(
    particle: GibParticle,
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    maxSpin: number,
  ): void {
    const { mesh, size, baseScale } = particle;
    mesh.position.set(x, y, z);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    particle.velocity.set(vx, vy, vz);
    particle.spin.set(spread(maxSpin), spread(maxSpin), spread(maxSpin));
    baseScale.copy(size);
    particle.rest = Math.min(size.x, size.y, size.z);
    particle.resting = false;
    if (particle.blood) particle.blood.resting = false;
  }

  /** Touchdown on the floor (`surface` 0) or on top of a wall box. */
  private land(particle: GibParticle, surface: number): void {
    const { mesh, velocity, spin } = particle;
    mesh.position.y = surface + particle.rest;
    if (-velocity.y < SETTLE_SPEED) {
      particle.resting = true;
      return;
    }
    velocity.y = -velocity.y * BOUNCE;
    velocity.x *= GROUND_FRICTION;
    velocity.z *= GROUND_FRICTION;
    spin.multiplyScalar(0.5);
  }

  /** Solid body pieces bounce back off a wall; blood uses stepBloodDrop. */
  private hitWall(particle: GibParticle, contact: Exclude<GibWallContact, 'top'>): void {
    const { velocity, spin } = particle;
    if (contact === 'x') velocity.x = -velocity.x * WALL_BOUNCE;
    else if (contact === 'z') velocity.z = -velocity.z * WALL_BOUNCE;
    else velocity.x = velocity.z = 0;
    spin.multiplyScalar(0.6);
  }
}
