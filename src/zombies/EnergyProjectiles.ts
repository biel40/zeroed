import * as THREE from 'three';
import { resolveSegmentHit } from '../shooting/BallisticsSystem';
import type { EnergyWeaponConfig } from '../weapons/WeaponTypes';

const MAX_PROJECTILES = 12;
const RINGS_PER_BOLT = 3;
const MAX_BURSTS = 8;
const MAX_SCORCH_DECALS = 16;
const MAX_PLASMA_PARTICLES = 96;
const IMPACT_PARTICLE_COUNT = 14;
const BURST_LIFETIME = 0.35;
const SCORCH_LIFETIME = 2.2;
const TRAIL_LENGTH = 1.4;
const TRAIL_RADIUS = 0.05;
const PROJECTILE_RADIUS = 0.07;
const GLOW_SCALE = 0.42;
const RAYGUN_RING_RED = 0xff3b1f;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface EnergyBolt {
  active: boolean;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  travelled: number;
  trailEmitAccumulator: number;
  config: EnergyWeaponConfig | null;
  sourceId: number;
  core: THREE.Mesh;
  coreMaterial: THREE.MeshBasicMaterial;
  glow: THREE.Sprite;
  glowMaterial: THREE.SpriteMaterial;
  trail: THREE.Mesh;
  trailMaterial: THREE.MeshBasicMaterial;
  rings: THREE.Mesh[];
  ringMaterials: THREE.MeshBasicMaterial[];
}

interface Burst {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  life: number;
  maxRadius: number;
  active: boolean;
}

interface ScorchDecal {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  active: boolean;
}

interface PlasmaParticle {
  active: boolean;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
}

let glowTexture: THREE.CanvasTexture | null = null;
let scorchTexture: THREE.DataTexture | null = null;

function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  return glowTexture;
}

/**
 * Procedural plasma burn texture: dark charred core surrounded by an
 * incandescent plasma ring that fades smoothly at the outer edge.
 * Built with DataTexture so it requires zero DOM canvas primitives in tests.
 */
function getScorchTexture(): THREE.DataTexture {
  if (scorchTexture) return scorchTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = (y + 0.5) / size * 2 - 1;
      const r = Math.hypot(nx, ny);
      const idx = (y * size + x) * 4;
      if (r >= 1) {
        data[idx + 3] = 0;
        continue;
      }
      const charCore = Math.max(0, 1 - r * 1.45);
      const ringDelta = (r - 0.52) / 0.16;
      const ring = Math.exp(-(ringDelta * ringDelta));
      const outerFade = 1 - THREE.MathUtils.smoothstep(r, 0.65, 1.0);
      // White/tinted ring over dark scorched center
      data[idx] = Math.min(255, Math.round(18 + ring * 195));
      data[idx + 1] = Math.min(255, Math.round(24 + ring * 245));
      data[idx + 2] = Math.min(255, Math.round(16 + ring * 165));
      data[idx + 3] = Math.min(255, Math.round(Math.max(charCore * 0.85, ring * 0.92) * outerFade * 255));
    }
  }
  scorchTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  scorchTexture.magFilter = THREE.LinearFilter;
  scorchTexture.minFilter = THREE.LinearFilter;
  scorchTexture.needsUpdate = true;
  return scorchTexture;
}

/**
 * Ray Gun & Wonder Weapon projectiles: visible energy bolts traveling in a
 * straight line (no gravity), pooled and segment-raycast against the shared
 * collider array. Features:
 *  - Bright plasma core + unstable halo + 3 concentric red/green energy rings
 *  - Tapered additive streak + instanced plasma wake/trail particles
 *  - Impact plasma particle burst + temporary projected scorch/burn mark decal
 *  - Single shared PointLight for impact illumination
 */
export class EnergyProjectiles {
  /**
   * Fired when a bolt hits something or reaches max distance. The object is
   * the raycast hit (a zombie hitbox carries userData.zombie / hitPart) or
   * null for a mid-air expiry; distance is the bolt's total travel.
   */
  onImpact:
    | ((
        point: THREE.Vector3,
        config: EnergyWeaponConfig,
        object: THREE.Object3D | null,
        distance: number,
        sourceId: number,
      ) => void)
    | null = null;

  private readonly bolts: EnergyBolt[] = [];
  private readonly bursts: Burst[] = [];
  private readonly scorchDecals: ScorchDecal[] = [];
  private readonly particles: PlasmaParticle[] = [];
  private readonly particleMesh: THREE.InstancedMesh;
  private readonly particleGeometry: THREE.BufferGeometry;
  private readonly particleMaterial: THREE.MeshBasicMaterial;
  private readonly coreGeometry: THREE.BufferGeometry;
  private readonly trailGeometry: THREE.BufferGeometry;
  private readonly ringGeometry: THREE.BufferGeometry;
  private readonly scorchGeometry: THREE.BufferGeometry;
  private readonly burstLight: THREE.PointLight;
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly segmentOrigin = new THREE.Vector3();
  private readonly segmentDirection = new THREE.Vector3();
  private readonly tmpNormal = new THREE.Vector3();
  private readonly tmpLookTarget = new THREE.Vector3();
  private readonly tmpLocalPoint = new THREE.Vector3();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpNormalMatrix = new THREE.Matrix3();
  private readonly tmpColor = new THREE.Color();
  private readonly tmpAltColor = new THREE.Color();
  private boltCursor = 0;
  private burstCursor = 0;
  private scorchCursor = 0;
  private particleCursor = 0;
  private time = 0;

  constructor(
    private readonly colliders: THREE.Object3D[],
    private readonly parent: THREE.Object3D,
  ) {
    this.coreGeometry = new THREE.SphereGeometry(PROJECTILE_RADIUS, 10, 8);
    // Tapered streak: full width at the bolt (+Z), fading to a point behind.
    this.trailGeometry = new THREE.ConeGeometry(TRAIL_RADIUS, TRAIL_LENGTH, 10, 1, true);
    this.trailGeometry.rotateX(-Math.PI / 2);
    this.ringGeometry = new THREE.TorusGeometry(PROJECTILE_RADIUS * 1.45, 0.015, 8, 18);
    this.scorchGeometry = new THREE.CircleGeometry(0.24, 16);

    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const glowMaterial = new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const trailMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const core = new THREE.Mesh(this.coreGeometry, coreMaterial);
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.setScalar(GLOW_SCALE);
      const trail = new THREE.Mesh(this.trailGeometry, trailMaterial);
      trail.frustumCulled = false;
      core.visible = false;
      glow.visible = false;
      trail.visible = false;
      parent.add(core, glow, trail);

      const rings: THREE.Mesh[] = [];
      const ringMaterials: THREE.MeshBasicMaterial[] = [];
      for (let r = 0; r < RINGS_PER_BOLT; r++) {
        const ringMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.88 - r * 0.14,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        });
        const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
        ring.name = `energy-bolt-ring-${r}`;
        ring.visible = false;
        ring.frustumCulled = false;
        parent.add(ring);
        rings.push(ring);
        ringMaterials.push(ringMaterial);
      }

      this.bolts.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        dx: 0,
        dy: 0,
        dz: 1,
        travelled: 0,
        trailEmitAccumulator: 0,
        config: null,
        sourceId: 0,
        core,
        coreMaterial,
        glow,
        glowMaterial,
        trail,
        trailMaterial,
        rings,
        ringMaterials,
      });
    }

    for (let i = 0; i < MAX_BURSTS; i++) {
      const material = new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      parent.add(sprite);
      this.bursts.push({ sprite, material, life: 0, maxRadius: 2.5, active: false });
    }

    for (let i = 0; i < MAX_SCORCH_DECALS; i++) {
      const material = new THREE.MeshBasicMaterial({
        map: getScorchTexture(),
        color: 0x5cff3a,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.scorchGeometry, material);
      mesh.name = 'energy-scorch-decal';
      mesh.visible = false;
      this.scorchDecals.push({ mesh, material, life: 0, maxLife: SCORCH_LIFETIME, active: false });
    }

    this.particleGeometry = new THREE.IcosahedronGeometry(0.034, 0);
    this.particleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.particleMesh = new THREE.InstancedMesh(
      this.particleGeometry,
      this.particleMaterial,
      MAX_PLASMA_PARTICLES,
    );
    this.particleMesh.name = 'energy-plasma-particles';
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.tmpMatrix.makeScale(0, 0, 0);
    this.tmpColor.setHex(0x5cff3a);
    for (let i = 0; i < MAX_PLASMA_PARTICLES; i++) {
      this.particleMesh.setMatrixAt(i, this.tmpMatrix);
      this.particleMesh.setColorAt(i, this.tmpColor);
      this.particles.push({
        active: false,
        life: 0,
        maxLife: 0.3,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        baseScale: 1,
      });
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    parent.add(this.particleMesh);

    // One shared light for energy bursts — intensity decays fast, never
    // more than a single dynamic light contributed by this system.
    this.burstLight = new THREE.PointLight(0x63f2a4, 0, 11, 1.8);
    parent.add(this.burstLight);
  }

  fire(origin: THREE.Vector3, direction: THREE.Vector3, config: EnergyWeaponConfig, sourceId = 0): void {
    const bolt = this.bolts[this.boltCursor];
    this.boltCursor = (this.boltCursor + 1) % MAX_PROJECTILES;

    bolt.active = true;
    bolt.x = origin.x;
    bolt.y = origin.y;
    bolt.z = origin.z;
    bolt.dx = direction.x;
    bolt.dy = direction.y;
    bolt.dz = direction.z;
    bolt.travelled = 0;
    bolt.trailEmitAccumulator = 0;
    bolt.config = config;
    bolt.sourceId = sourceId;
    bolt.coreMaterial.color.setHex(config.color);
    bolt.glowMaterial.color.setHex(config.color);
    bolt.trailMaterial.color.setHex(config.color);
    bolt.core.position.set(origin.x, origin.y, origin.z);
    bolt.glow.position.set(origin.x, origin.y, origin.z);
    this.segmentDirection.set(direction.x, direction.y, direction.z);
    bolt.trail.position
      .set(origin.x, origin.y, origin.z)
      .addScaledVector(this.segmentDirection, -TRAIL_LENGTH / 2);
    bolt.trail.quaternion.setFromUnitVectors(Z_AXIS, this.segmentDirection);
    bolt.core.visible = true;
    bolt.glow.visible = true;
    bolt.trail.visible = true;

    // Characteristic concentric rings: alternating neon green and crimson-red
    // plasma for the Ray Gun, or electric cyan/white for arc bolts.
    const isRayGun = config.splashRadius > 0;
    const altRingColor = isRayGun ? RAYGUN_RING_RED : 0xffffff;
    for (let r = 0; r < bolt.rings.length; r++) {
      const ring = bolt.rings[r];
      bolt.ringMaterials[r].color.setHex(r === 1 ? altRingColor : config.color);
      ring.position
        .set(origin.x, origin.y, origin.z)
        .addScaledVector(this.segmentDirection, -r * 0.16);
      ring.quaternion.setFromUnitVectors(Z_AXIS, this.segmentDirection);
      ring.scale.setScalar(1 - r * 0.12);
      ring.visible = true;
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (let index = 0; index < this.bolts.length; index++) {
      const bolt = this.bolts[index];
      if (!bolt.active || !bolt.config) continue;
      const config = bolt.config;

      const stepLength = config.projectileSpeed * dt;
      const prevX = bolt.x;
      const prevY = bolt.y;
      const prevZ = bolt.z;
      bolt.x += bolt.dx * stepLength;
      bolt.y += bolt.dy * stepLength;
      bolt.z += bolt.dz * stepLength;
      bolt.travelled += stepLength;

      this.segmentOrigin.set(prevX, prevY, prevZ);
      this.segmentDirection.set(bolt.dx, bolt.dy, bolt.dz);
      this.raycaster.set(this.segmentOrigin, this.segmentDirection);
      this.raycaster.near = 0;
      this.raycaster.far = stepLength + PROJECTILE_RADIUS;

      this.hits.length = 0;
      this.raycaster.intersectObjects(this.colliders, false, this.hits);

      if (this.hits.length > 0) {
        // Same head-priority rule as hitscan ballistics.
        const hit = resolveSegmentHit(this.hits) ?? this.hits[0];
        bolt.active = false;
        this.hideBolt(bolt);
        this.extractWorldNormal(hit, this.segmentDirection, this.tmpNormal);
        this.spawnBurst(hit.point, config);
        this.spawnImpactParticles(hit.point, this.tmpNormal, config);
        this.spawnScorchDecal(hit.point, this.tmpNormal, hit.object, config);
        this.onImpact?.(hit.point, config, hit.object, bolt.travelled, bolt.sourceId);
      } else if (bolt.travelled >= 80) {
        bolt.active = false;
        this.hideBolt(bolt);
        this.segmentOrigin.set(bolt.x, bolt.y, bolt.z);
        this.tmpNormal.set(-bolt.dx, -bolt.dy, -bolt.dz);
        this.spawnBurst(this.segmentOrigin, config);
        this.spawnImpactParticles(this.segmentOrigin, this.tmpNormal, config);
        this.onImpact?.(this.segmentOrigin, config, null, bolt.travelled, bolt.sourceId);
      } else {
        bolt.core.position.set(bolt.x, bolt.y, bolt.z);
        bolt.glow.position.set(bolt.x, bolt.y, bolt.z);
        // Unstable plasma: the halo shimmers instead of holding a fixed size.
        bolt.glow.scale.setScalar(GLOW_SCALE * (1 + Math.sin(this.time * 47 + index * 1.7) * 0.16));
        bolt.trail.position
          .set(bolt.x, bolt.y, bolt.z)
          .addScaledVector(this.segmentDirection, -TRAIL_LENGTH / 2);
        bolt.trail.quaternion.setFromUnitVectors(Z_AXIS, this.segmentDirection);

        for (let r = 0; r < bolt.rings.length; r++) {
          const ring = bolt.rings[r];
          const lag = 0.02 + r * 0.17 + Math.sin(this.time * 32 + r * 1.9) * 0.025;
          ring.position
            .set(bolt.x, bolt.y, bolt.z)
            .addScaledVector(this.segmentDirection, -lag);
          ring.quaternion.setFromUnitVectors(Z_AXIS, this.segmentDirection);
          const pulse = (1 - r * 0.12) * (1 + Math.sin(this.time * 42 + index + r * 2.1) * 0.22);
          ring.scale.setScalar(pulse);
        }

        bolt.trailEmitAccumulator += stepLength;
        while (bolt.trailEmitAccumulator >= 0.45) {
          bolt.trailEmitAccumulator -= 0.45;
          this.spawnWakeParticle(bolt.x, bolt.y, bolt.z, bolt.dx, bolt.dy, bolt.dz, config);
        }
      }
    }

    for (const burst of this.bursts) {
      if (!burst.active) continue;
      burst.life -= dt;
      if (burst.life <= 0) {
        burst.active = false;
        burst.sprite.visible = false;
        burst.material.opacity = 0;
        continue;
      }
      const t = 1 - burst.life / BURST_LIFETIME;
      burst.material.opacity = 0.9 * (1 - t);
      burst.sprite.scale.setScalar(0.4 + t * burst.maxRadius * 2);
    }

    for (const decal of this.scorchDecals) {
      if (!decal.active) continue;
      decal.life -= dt;
      if (decal.life <= 0) {
        decal.active = false;
        decal.mesh.visible = false;
        decal.material.opacity = 0;
        decal.mesh.parent?.remove(decal.mesh);
        continue;
      }
      const ratio = decal.life / decal.maxLife;
      decal.material.opacity = 0.85 * Math.min(1, ratio * 1.6);
    }

    this.updateParticles(dt);

    this.burstLight.intensity =
      this.burstLight.intensity > 0.02
        ? this.burstLight.intensity * Math.exp(-18 * dt)
        : 0;
  }

  reset(): void {
    for (const bolt of this.bolts) {
      bolt.active = false;
      this.hideBolt(bolt);
    }
    for (const burst of this.bursts) {
      burst.active = false;
      burst.sprite.visible = false;
      burst.material.opacity = 0;
    }
    for (const decal of this.scorchDecals) {
      decal.active = false;
      decal.mesh.visible = false;
      decal.material.opacity = 0;
      decal.mesh.parent?.remove(decal.mesh);
    }
    this.tmpMatrix.makeScale(0, 0, 0);
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].active = false;
      this.particles[i].life = 0;
      this.particleMesh.setMatrixAt(i, this.tmpMatrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    this.burstLight.intensity = 0;
  }

  dispose(): void {
    this.reset();
    this.coreGeometry.dispose();
    this.trailGeometry.dispose();
    this.ringGeometry.dispose();
    this.scorchGeometry.dispose();
    this.particleGeometry.dispose();
    this.particleMaterial.dispose();
    for (const bolt of this.bolts) {
      bolt.coreMaterial.dispose();
      bolt.glowMaterial.dispose();
      bolt.trailMaterial.dispose();
      for (const mat of bolt.ringMaterials) mat.dispose();
    }
    for (const burst of this.bursts) burst.material.dispose();
    for (const decal of this.scorchDecals) decal.material.dispose();
  }

  private extractWorldNormal(
    hit: THREE.Intersection,
    fallbackDir: THREE.Vector3,
    out: THREE.Vector3,
  ): void {
    if (hit.face) {
      this.tmpNormalMatrix.getNormalMatrix(hit.object.matrixWorld);
      out.copy(hit.face.normal).applyMatrix3(this.tmpNormalMatrix).normalize();
      return;
    }
    out.copy(fallbackDir).negate().normalize();
  }

  private spawnBurst(point: THREE.Vector3, config: EnergyWeaponConfig): void {
    const burst = this.bursts[this.burstCursor];
    this.burstCursor = (this.burstCursor + 1) % MAX_BURSTS;
    burst.active = true;
    burst.life = BURST_LIFETIME;
    burst.maxRadius = config.splashRadius;
    burst.material.color.setHex(config.color);
    burst.material.opacity = 0.9;
    burst.sprite.position.copy(point);
    burst.sprite.scale.setScalar(0.4);
    burst.sprite.visible = true;

    this.burstLight.color.setHex(config.color);
    this.burstLight.position.copy(point);
    this.burstLight.intensity = 6;
  }

  private spawnScorchDecal(
    point: THREE.Vector3,
    normal: THREE.Vector3,
    object: THREE.Object3D | null,
    config: EnergyWeaponConfig,
  ): void {
    const decal = this.scorchDecals[this.scorchCursor];
    this.scorchCursor = (this.scorchCursor + 1) % MAX_SCORCH_DECALS;
    decal.active = true;
    decal.life = SCORCH_LIFETIME;
    decal.maxLife = SCORCH_LIFETIME;
    decal.material.color.setHex(config.color);
    decal.material.opacity = 0.85;
    decal.mesh.visible = true;

    const targetParent = object?.userData.zombie
      ? (object.userData.zombie.group as THREE.Object3D)
      : object ?? this.parent;

    targetParent.add(decal.mesh);
    this.tmpLocalPoint.copy(point).addScaledVector(normal, 0.008);
    this.tmpLookTarget.copy(this.tmpLocalPoint).add(normal);
    targetParent.worldToLocal(this.tmpLocalPoint);
    targetParent.worldToLocal(this.tmpLookTarget);
    decal.mesh.position.copy(this.tmpLocalPoint);
    decal.mesh.lookAt(this.tmpLookTarget);

    targetParent.getWorldScale(this.tmpScale);
    decal.mesh.scale.set(
      1 / Math.max(Math.abs(this.tmpScale.x), 1e-4),
      1 / Math.max(Math.abs(this.tmpScale.y), 1e-4),
      1 / Math.max(Math.abs(this.tmpScale.z), 1e-4),
    );
  }

  private spawnWakeParticle(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    config: EnergyWeaponConfig,
  ): void {
    const p = this.particles[this.particleCursor];
    const index = this.particleCursor;
    this.particleCursor = (this.particleCursor + 1) % MAX_PLASMA_PARTICLES;

    const angle = index * 2.39996;
    const spread = 0.045;
    p.active = true;
    p.maxLife = 0.22;
    p.life = p.maxLife;
    p.x = x - dx * 0.12 + Math.cos(angle) * spread;
    p.y = y - dy * 0.12 + Math.sin(angle) * spread;
    p.z = z - dz * 0.12;
    p.vx = Math.cos(angle) * 0.35 - dx * 0.4;
    p.vy = Math.sin(angle) * 0.35 + 0.18;
    p.vz = -dz * 0.4;
    p.baseScale = 0.75;

    const isRayGun = config.splashRadius > 0;
    this.tmpColor.setHex(isRayGun && index % 4 === 0 ? RAYGUN_RING_RED : config.color);
    this.particleMesh.setColorAt(index, this.tmpColor);
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  private spawnImpactParticles(
    point: THREE.Vector3,
    normal: THREE.Vector3,
    config: EnergyWeaponConfig,
  ): void {
    const isRayGun = config.splashRadius > 0;
    this.tmpColor.setHex(config.color);
    this.tmpAltColor.setHex(isRayGun ? RAYGUN_RING_RED : 0xffffff);

    for (let i = 0; i < IMPACT_PARTICLE_COUNT; i++) {
      const p = this.particles[this.particleCursor];
      const index = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % MAX_PLASMA_PARTICLES;

      const theta = (i / IMPACT_PARTICLE_COUNT) * Math.PI * 2 + this.time * 3;
      const elevation = 0.25 + (i % 4) * 0.22;
      const speed = 1.6 + (i % 5) * 0.65;
      p.active = true;
      p.maxLife = 0.36;
      p.life = p.maxLife;
      p.x = point.x + normal.x * 0.04;
      p.y = point.y + normal.y * 0.04;
      p.z = point.z + normal.z * 0.04;
      p.vx = (normal.x * elevation + Math.cos(theta) * (1 - elevation * 0.4)) * speed;
      p.vy = (normal.y * elevation + 0.45 + (i % 3) * 0.25) * speed;
      p.vz = (normal.z * elevation + Math.sin(theta) * (1 - elevation * 0.4)) * speed;
      p.baseScale = 1.15 + (i % 3) * 0.35;

      this.particleMesh.setColorAt(index, i % 4 === 0 ? this.tmpAltColor : this.tmpColor);
    }
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
  }

  private updateParticles(dt: number): void {
    let dirty = false;
    const drag = Math.exp(-5.5 * dt);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.tmpMatrix.makeScale(0, 0, 0);
        this.particleMesh.setMatrixAt(i, this.tmpMatrix);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= drag;
      p.vy = p.vy * drag + 0.35 * dt;
      p.vz *= drag;

      const scale = p.baseScale * (p.life / p.maxLife);
      this.tmpMatrix.makeScale(scale, scale, scale);
      this.tmpMatrix.setPosition(p.x, p.y, p.z);
      this.particleMesh.setMatrixAt(i, this.tmpMatrix);
    }
    if (dirty) this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  private hideBolt(bolt: EnergyBolt): void {
    bolt.core.visible = false;
    bolt.glow.visible = false;
    bolt.trail.visible = false;
    for (const ring of bolt.rings) ring.visible = false;
  }
}
