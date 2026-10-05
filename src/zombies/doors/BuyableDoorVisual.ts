import * as THREE from 'three';
import { projectBoxUVs } from '../maps/BurnedMansionMaterials';

const PLANK_COUNT = 5;
const PLANK_THICK = 0.09;
const BRACE_THICK = 0.035;
const ACCENT = 0xffb84a;

/** Brief shake + glow flash before the door bursts. */
const WINDUP = 0.16;
/** Debris keeps flying until this point, then shrinks away. */
const SHRINK_START = 1.05;
const BREAK_DURATION = 1.55;
const GRAVITY = 9.8;

export interface BuyableDoorVisualOptions {
  readonly width: number;
  readonly height: number;
  readonly cost: number;
  /** Textured map wood; must carry `userData.metersPerTile` for box UVs. */
  readonly woodMaterial?: THREE.MeshStandardMaterial;
  readonly reducedEffects?: boolean;
}

interface DebrisPiece {
  readonly object: THREE.Object3D;
  readonly home: THREE.Vector3;
  readonly homeRotation: THREE.Euler;
  readonly velocity: THREE.Vector3;
  readonly spin: THREE.Vector3;
  readonly spread: number;
}

interface Particle {
  readonly velocity: THREE.Vector3;
  life: number;
}

type BreakPhase = 'locked' | 'breaking' | 'gone';

/**
 * Presentation-only dressing for a paid door: a boarded, padlocked slab with
 * a glowing price plaque on both faces so the purchase reads from whichever
 * side the player arrives. On unlock it shakes, flashes and bursts into
 * tumbling debris with dust and a gold spark spray. Gameplay (colliders,
 * topology) never waits on this animation.
 */
export class BuyableDoorVisual {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly debris: DebrisPiece[] = [];
  private readonly shackles: THREE.Mesh[] = [];
  private readonly padlocks: THREE.Group[] = [];
  private readonly plaques: THREE.Mesh[] = [];
  private readonly glowMaterial: THREE.MeshBasicMaterial;
  private readonly plaqueMaterial: THREE.MeshBasicMaterial;
  private readonly dust: THREE.Sprite[] = [];
  private readonly dustParticles: Particle[] = [];
  private readonly sparks: THREE.Points;
  private readonly sparkParticles: Particle[] = [];
  private readonly sparkMaterial: THREE.PointsMaterial;
  private phase: BreakPhase = 'locked';
  private elapsed = 0;
  private pulseTime = 0;

  constructor(private readonly options: BuyableDoorVisualOptions) {
    const { width, height } = options;
    this.group.add(this.body);

    const wood = options.woodMaterial
      ?? new THREE.MeshStandardMaterial({ color: 0x6b5442, roughness: 0.88, metalness: 0.02 });
    const metersPerTile = (wood.userData.metersPerTile as number | undefined) ?? 1.25;
    const plankWidth = width / PLANK_COUNT;
    for (let index = 0; index < PLANK_COUNT; index++) {
      // Deterministic per-plank variation keeps resets identical.
      const jitter = Math.sin(index * 12.9898) * 0.5;
      const plankHeight = height - Math.abs(jitter) * 0.07;
      const geometry = new THREE.BoxGeometry(plankWidth - 0.012, plankHeight, PLANK_THICK);
      projectBoxUVs(geometry, plankWidth, plankHeight, PLANK_THICK, metersPerTile, index * 0.37, jitter);
      const plank = new THREE.Mesh(geometry, wood);
      plank.position.set(-width / 2 + plankWidth * (index + 0.5), plankHeight / 2, jitter * 0.01);
      plank.rotation.z = jitter * 0.012;
      this.addDebris(plank, 1);
    }

    const strapMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3532, roughness: 0.62, metalness: 0.7 });
    const brassMaterial = new THREE.MeshStandardMaterial({
      color: 0xc29a45,
      emissive: 0x3d2a06,
      roughness: 0.32,
      metalness: 0.85,
    });
    this.glowMaterial = new THREE.MeshBasicMaterial({
      map: makeEdgeGlowTexture(),
      color: ACCENT,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.plaqueMaterial = new THREE.MeshBasicMaterial({
      map: makePlaqueTexture(options.cost),
      transparent: true,
      toneMapped: false,
    });

    const braceGeometry = new THREE.BoxGeometry(width - 0.08, 0.15, BRACE_THICK);
    const strapAngle = Math.atan2(height * 0.4, width - 0.24);
    const strapLength = Math.hypot(height * 0.4, width - 0.24);
    const strapGeometry = new THREE.BoxGeometry(strapLength, 0.07, 0.02);
    const glowGeometry = new THREE.PlaneGeometry(width, height);
    const plaqueGeometry = new THREE.PlaneGeometry(0.64, 0.32);
    const strapCenterY = height * 0.45;

    for (const side of [1, -1]) {
      const face = side * PLANK_THICK / 2;
      const braceZ = face + side * BRACE_THICK / 2;
      for (const y of [0.38, height - 0.24]) {
        const brace = new THREE.Mesh(braceGeometry, wood);
        brace.position.set(0, y, braceZ);
        this.addDebris(brace, 1.15);
      }

      // Crossed iron straps held by the padlock: the universal "locked" read.
      for (const direction of [1, -1]) {
        const strap = new THREE.Mesh(strapGeometry, strapMaterial);
        strap.position.set(0, strapCenterY, face + side * 0.012);
        strap.rotation.z = direction * strapAngle;
        this.addDebris(strap, 0.8);
      }

      const padlock = new THREE.Group();
      const lockBody = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.15, 0.06), brassMaterial);
      const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 6, 14, Math.PI), strapMaterial);
      shackle.position.y = 0.075;
      padlock.add(lockBody, shackle);
      padlock.position.set(0, strapCenterY - 0.12, face + side * 0.05);
      this.padlocks.push(padlock);
      this.shackles.push(shackle);
      this.addDebris(padlock, 1.4);

      const glow = new THREE.Mesh(glowGeometry, this.glowMaterial);
      glow.position.set(0, height / 2, face + side * (BRACE_THICK + 0.006));
      if (side < 0) glow.rotation.y = Math.PI;
      glow.renderOrder = 2;
      this.body.add(glow);

      const plaque = new THREE.Mesh(plaqueGeometry, this.plaqueMaterial);
      plaque.position.set(0, height * 0.74, face + side * (BRACE_THICK + 0.012));
      if (side < 0) plaque.rotation.y = Math.PI;
      plaque.renderOrder = 3;
      this.plaques.push(plaque);
      this.body.add(plaque);
    }

    const dustMaterial = new THREE.SpriteMaterial({
      map: makeSoftDotTexture(),
      color: 0x8f7d68,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const dustCount = options.reducedEffects ? 3 : 6;
    for (let index = 0; index < dustCount; index++) {
      const sprite = new THREE.Sprite(dustMaterial.clone());
      sprite.visible = false;
      this.dust.push(sprite);
      this.dustParticles.push({ velocity: new THREE.Vector3(), life: 0 });
      this.group.add(sprite);
    }

    const sparkCount = options.reducedEffects ? 14 : 28;
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sparkCount * 3), 3));
    this.sparkMaterial = new THREE.PointsMaterial({
      map: makeSoftDotTexture(),
      color: 0xffd47a,
      size: 0.075,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.sparks = new THREE.Points(sparkGeometry, this.sparkMaterial);
    this.sparks.visible = false;
    this.sparks.frustumCulled = false;
    for (let index = 0; index < sparkCount; index++) {
      this.sparkParticles.push({ velocity: new THREE.Vector3(), life: 0 });
    }
    this.group.add(this.sparks);
  }

  /** Returns true on the frame the break animation finishes. */
  update(dt: number, unlocked: boolean): boolean {
    if (this.phase === 'gone') return false;
    if (this.phase === 'locked') {
      if (!unlocked) {
        this.updateIdle(dt);
        return false;
      }
      this.phase = 'breaking';
      this.elapsed = 0;
    }

    const previous = this.elapsed;
    this.elapsed = Math.min(BREAK_DURATION, this.elapsed + dt);
    const e = this.elapsed;

    if (e < WINDUP) {
      const k = e / WINDUP;
      const shake = (1 - k) * 0.025;
      this.body.position.set(Math.sin(e * 95) * shake, Math.cos(e * 77) * shake * 0.5, 0);
      this.glowMaterial.opacity = 0.6 + k * 0.4;
      this.glowMaterial.color.setHex(ACCENT).lerp(WHITE, k * 0.6);
      for (const plaque of this.plaques) plaque.scale.setScalar(1 + k * 0.22);
      for (const shackle of this.shackles) shackle.position.y = 0.075 + k * 0.045;
    } else {
      if (previous < WINDUP) this.burst();
      this.body.position.set(0, 0, 0);
      const t = e - WINDUP;
      this.glowMaterial.opacity = Math.max(0, 1 - t / 0.35);
      this.plaqueMaterial.opacity = Math.max(0, 1 - t / 0.25);
      for (const plaque of this.plaques) plaque.scale.setScalar(1.22 + t * 1.4);
      this.updateDebris(dt, e);
      this.updateParticles(dt);
    }

    if (e < BREAK_DURATION) return false;
    this.phase = 'gone';
    this.group.visible = false;
    return true;
  }

  reset(): void {
    this.phase = 'locked';
    this.elapsed = 0;
    this.pulseTime = 0;
    this.group.visible = true;
    this.body.position.set(0, 0, 0);
    for (const piece of this.debris) {
      piece.object.position.copy(piece.home);
      piece.object.rotation.copy(piece.homeRotation);
      piece.object.scale.setScalar(1);
      piece.object.visible = true;
    }
    for (const shackle of this.shackles) shackle.position.y = 0.075;
    for (const plaque of this.plaques) plaque.scale.setScalar(1);
    this.plaqueMaterial.opacity = 1;
    this.glowMaterial.color.setHex(ACCENT);
    this.glowMaterial.opacity = 0.6;
    for (const sprite of this.dust) sprite.visible = false;
    this.sparks.visible = false;
  }

  private addDebris(object: THREE.Object3D, spread: number): void {
    object.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    this.body.add(object);
    this.debris.push({
      object,
      home: object.position.clone(),
      homeRotation: object.rotation.clone(),
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      spread,
    });
  }

  /** Slow breathing glow and a lazy padlock sway while the door is for sale. */
  private updateIdle(dt: number): void {
    this.pulseTime += dt;
    const wave = Math.sin(this.pulseTime * 2.6);
    this.glowMaterial.opacity = 0.48 + wave * 0.2;
    const plaqueLevel = 0.88 + Math.max(0, wave) * 0.12;
    this.plaqueMaterial.color.setRGB(plaqueLevel, plaqueLevel, plaqueLevel);
    const sway = Math.sin(this.pulseTime * 1.7) * 0.06;
    for (const padlock of this.padlocks) padlock.rotation.z = sway;
  }

  /** Launches every piece away from the buyer (+Z faces the newly opened room). */
  private burst(): void {
    const { width, height } = this.options;
    for (const piece of this.debris) {
      const lateral = piece.home.x / (width / 2);
      piece.velocity.set(
        lateral * 1.1 * piece.spread + randomRange(-0.45, 0.45),
        randomRange(0.9, 2.3) * piece.spread,
        randomRange(1.7, 3.3),
      );
      piece.spin.set(randomRange(-5, 5), randomRange(-4, 4), randomRange(-6, 6));
    }

    for (let index = 0; index < this.dust.length; index++) {
      const sprite = this.dust[index];
      const particle = this.dustParticles[index];
      sprite.position.set(randomRange(-width / 2, width / 2), randomRange(0.15, height * 0.6), randomRange(-0.1, 0.4));
      sprite.scale.setScalar(0.5);
      (sprite.material as THREE.SpriteMaterial).opacity = 0.5;
      sprite.visible = true;
      particle.velocity.set(randomRange(-0.25, 0.25), randomRange(0.15, 0.4), randomRange(0.2, 0.9));
      particle.life = 0;
    }

    const positions = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < this.sparkParticles.length; index++) {
      const particle = this.sparkParticles[index];
      // Sparks fan out from both price plaques so the buyer always sees them.
      const side = index % 2 === 0 ? -1 : 1;
      positions.setXYZ(index, randomRange(-0.25, 0.25), height * 0.74, side * 0.12);
      particle.velocity.set(randomRange(-1.6, 1.6), randomRange(0.6, 2.6), side * randomRange(0.6, 2));
      particle.life = 0;
    }
    positions.needsUpdate = true;
    this.sparkMaterial.opacity = 1;
    this.sparks.visible = true;
  }

  private updateDebris(dt: number, elapsed: number): void {
    const shrink = elapsed > SHRINK_START
      ? Math.max(0, 1 - (elapsed - SHRINK_START) / (BREAK_DURATION - SHRINK_START))
      : 1;
    this.group.updateWorldMatrix(true, false);
    const floorY = this.group.matrixWorld.elements[13];
    for (const piece of this.debris) {
      const { object, velocity, spin } = piece;
      velocity.y -= GRAVITY * dt;
      object.position.addScaledVector(velocity, dt);
      object.rotation.x += spin.x * dt;
      object.rotation.y += spin.y * dt;
      object.rotation.z += spin.z * dt;
      object.scale.setScalar(Math.max(0.001, shrink));
      object.updateWorldMatrix(true, false);
      const penetration = floorY - DEBRIS_BOUNDS.setFromObject(object).min.y;
      if (penetration > 0 && velocity.y < 0) {
        // Clatter on the floor: one damped bounce, then slide to a stop.
        object.position.y += penetration;
        velocity.y *= -0.28;
        velocity.x *= 0.55;
        velocity.z *= 0.55;
        spin.multiplyScalar(0.5);
      }
    }
  }

  private updateParticles(dt: number): void {
    for (let index = 0; index < this.dust.length; index++) {
      const sprite = this.dust[index];
      if (!sprite.visible) continue;
      const particle = this.dustParticles[index];
      particle.life += dt;
      const k = Math.min(1, particle.life / 1.3);
      sprite.position.addScaledVector(particle.velocity, dt);
      sprite.scale.setScalar(0.5 + k * 1.5);
      (sprite.material as THREE.SpriteMaterial).opacity = 0.5 * (1 - k);
      if (k >= 1) sprite.visible = false;
    }

    if (!this.sparks.visible) return;
    const positions = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < this.sparkParticles.length; index++) {
      const particle = this.sparkParticles[index];
      particle.life += dt;
      particle.velocity.y -= 4.5 * dt;
      positions.setXYZ(
        index,
        positions.getX(index) + particle.velocity.x * dt,
        positions.getY(index) + particle.velocity.y * dt,
        positions.getZ(index) + particle.velocity.z * dt,
      );
    }
    positions.needsUpdate = true;
    const life = this.sparkParticles[0]?.life ?? 1;
    this.sparkMaterial.opacity = Math.max(0, 1 - life / 0.9);
    if (this.sparkMaterial.opacity <= 0) this.sparks.visible = false;
  }
}

const WHITE = new THREE.Color(0xffffff);
const DEBRIS_BOUNDS = new THREE.Box3();

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

let softDotTexture: THREE.CanvasTexture | null = null;

export function makeSoftDotTexture(): THREE.CanvasTexture {
  if (softDotTexture) return softDotTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  softDotTexture = new THREE.CanvasTexture(canvas);
  return softDotTexture;
}

let edgeGlowTexture: THREE.CanvasTexture | null = null;

/** Transparent centre, soft bright rim: an inner glow that traces the door edge. */
function makeEdgeGlowTexture(): THREE.CanvasTexture {
  if (edgeGlowTexture) return edgeGlowTexture;
  const width = 128;
  const height = 168;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.shadowColor = 'rgba(255,255,255,1)';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 5;
  ctx.strokeRect(3, 3, width - 6, height - 6);
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, width - 4, height - 4);
  edgeGlowTexture = new THREE.CanvasTexture(canvas);
  return edgeGlowTexture;
}

function makePlaqueTexture(cost: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.fillStyle = 'rgba(18, 13, 9, 0.94)';
  roundRect(ctx, 6, 6, 244, 116, 16);
  ctx.fill();
  ctx.strokeStyle = '#f2b544';
  ctx.lineWidth = 5;
  roundRect(ctx, 8, 8, 240, 112, 14);
  ctx.stroke();

  // Padlock glyph.
  ctx.fillStyle = '#f2b544';
  ctx.strokeStyle = '#f2b544';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(54, 56, 15, Math.PI, 0);
  ctx.stroke();
  roundRect(ctx, 31, 56, 46, 38, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(18, 13, 9, 0.94)';
  ctx.fillRect(51, 68, 6, 14);

  ctx.fillStyle = '#ffd47a';
  ctx.shadowColor = 'rgba(255, 170, 60, 0.85)';
  ctx.shadowBlur = 10;
  ctx.font = 'bold 60px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${cost}`, 164, 68, 150);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
