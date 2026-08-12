import * as THREE from 'three';
import type { EnergyWeaponConfig } from '../weapons/WeaponTypes';

const MAX_PROJECTILES = 12;
const MAX_BURSTS = 8;
const BURST_LIFETIME = 0.35;
const TRAIL_LENGTH = 1.4;
const PROJECTILE_RADIUS = 0.07;
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
  config: EnergyWeaponConfig | null;
  core: THREE.Mesh;
  coreMaterial: THREE.MeshBasicMaterial;
  glow: THREE.Sprite;
  glowMaterial: THREE.SpriteMaterial;
  trail: THREE.Mesh;
  trailMaterial: THREE.MeshBasicMaterial;
}

interface Burst {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  life: number;
  maxRadius: number;
  active: boolean;
}

let glowTexture: THREE.CanvasTexture | null = null;

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
 * Ray Gun projectiles: visible energy bolts traveling in a straight line
 * (no gravity), pooled and segment-raycast against the shared collider
 * array — the exact same pattern as BallisticsSystem, but with its own
 * identity: glowing core + halo + additive trail, and a pooled energy burst
 * with a single shared point light on impact (no light spam).
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
      ) => void)
    | null = null;

  private readonly bolts: EnergyBolt[] = [];
  private readonly bursts: Burst[] = [];
  private readonly burstLight: THREE.PointLight;
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly segmentOrigin = new THREE.Vector3();
  private readonly segmentDirection = new THREE.Vector3();
  private boltCursor = 0;
  private burstCursor = 0;

  constructor(
    private readonly colliders: THREE.Object3D[],
    parent: THREE.Object3D,
  ) {
    const coreGeometry = new THREE.SphereGeometry(PROJECTILE_RADIUS, 10, 8);
    const trailGeometry = new THREE.BoxGeometry(0.045, 0.045, TRAIL_LENGTH);

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
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.setScalar(0.42);
      const trail = new THREE.Mesh(trailGeometry, trailMaterial);
      trail.frustumCulled = false;
      core.visible = false;
      glow.visible = false;
      trail.visible = false;
      parent.add(core, glow, trail);
      this.bolts.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        dx: 0,
        dy: 0,
        dz: 1,
        travelled: 0,
        config: null,
        core,
        coreMaterial,
        glow,
        glowMaterial,
        trail,
        trailMaterial,
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

    // One shared light for energy bursts — intensity decays fast, never
    // more than a single dynamic light contributed by this system.
    this.burstLight = new THREE.PointLight(0x63f2a4, 0, 11, 1.8);
    parent.add(this.burstLight);
  }

  fire(origin: THREE.Vector3, direction: THREE.Vector3, config: EnergyWeaponConfig): void {
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
    bolt.config = config;
    bolt.coreMaterial.color.setHex(config.color);
    bolt.glowMaterial.color.setHex(config.color);
    bolt.trailMaterial.color.setHex(config.color);
    bolt.core.visible = true;
    bolt.glow.visible = true;
    bolt.trail.visible = true;
  }

  update(dt: number): void {
    for (const bolt of this.bolts) {
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
        const hit = this.hits[0];
        bolt.active = false;
        this.hideBolt(bolt);
        this.spawnBurst(hit.point, config);
        this.onImpact?.(hit.point, config, hit.object, bolt.travelled);
      } else if (bolt.travelled >= 80) {
        bolt.active = false;
        this.hideBolt(bolt);
        this.segmentOrigin.set(bolt.x, bolt.y, bolt.z);
        this.spawnBurst(this.segmentOrigin, config);
        this.onImpact?.(this.segmentOrigin, config, null, bolt.travelled);
      } else {
        bolt.core.position.set(bolt.x, bolt.y, bolt.z);
        bolt.glow.position.set(bolt.x, bolt.y, bolt.z);
        bolt.trail.position
          .set(bolt.x, bolt.y, bolt.z)
          .addScaledVector(this.segmentDirection, -TRAIL_LENGTH / 2);
        bolt.trail.quaternion.setFromUnitVectors(Z_AXIS, this.segmentDirection);
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

    this.burstLight.intensity =
      this.burstLight.intensity > 0.02
        ? this.burstLight.intensity * Math.exp(-18 * dt)
        : 0;
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

  private hideBolt(bolt: EnergyBolt): void {
    bolt.core.visible = false;
    bolt.glow.visible = false;
    bolt.trail.visible = false;
  }
}
