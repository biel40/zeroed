import * as THREE from 'three';
import { clamp, damp } from '../utils/math';
import { SpringRecoil } from './SpringRecoil';
import type { Weapon } from './Weapon';
import type { ViewModelConfig, WeaponDefinition } from './WeaponTypes';

const FLASH_DURATION = 0.045;
/** Bore line as a fraction of the sight line height (rifle geometry heuristic). */
const BORE_HEIGHT_FRACTION = 0.65;
const SWAY_PER_PIXEL = 0.0016;
const SWAY_LIMIT = 0.02;
const SWAY_SMOOTHING = 9;

let flashTexture: THREE.CanvasTexture | null = null;

function getFlashTexture(): THREE.CanvasTexture {
  if (flashTexture) return flashTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,244,205,1)');
  gradient.addColorStop(0.35, 'rgba(255,183,82,0.9)');
  gradient.addColorStop(1, 'rgba(255,122,24,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  flashTexture = new THREE.CanvasTexture(canvas);
  return flashTexture;
}

/**
 * Quaternius GLBs ship with flat-color standard materials named by part
 * ("Wood", "DarkMetal", "Glass"…). Mapping those names to tuned PBR values
 * is what makes the models read as metal/wood/polymer under the env map.
 */
function tuneGlbMaterials(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = false;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const name = material.name.toLowerCase();

      if (name.includes('glass')) {
        material.transparent = true;
        material.opacity = 0.35;
        material.roughness = 0.05;
        material.metalness = 0;
        material.envMapIntensity = 1.6;
      } else if (name.includes('darkmetal')) {
        material.metalness = 0.85;
        material.roughness = 0.42;
      } else if (name.includes('metal')) {
        material.metalness = 0.8;
        material.roughness = 0.38;
      } else if (name.includes('darkwood')) {
        material.metalness = 0;
        material.roughness = 0.78;
      } else if (name.includes('wood')) {
        material.metalness = 0;
        material.roughness = 0.72;
      } else if (name.includes('black')) {
        material.metalness = 0.3;
        material.roughness = 0.5;
      } else if (name.includes('grey')) {
        material.metalness = 0.55;
        material.roughness = 0.5;
      } else if (name.includes('green')) {
        material.metalness = 0.15;
        material.roughness = 0.6;
      } else {
        // "Main", "MainDark", "MainLight" and anything unknown: parkerized steel.
        material.metalness = 0.7;
        material.roughness = 0.48;
      }
      material.envMapIntensity = name.includes('glass') ? 1.6 : 1.1;
      material.needsUpdate = true;
    }
  });
}

interface BuiltProcedural {
  group: THREE.Group;
  muzzlePosition: THREE.Vector3;
  ejectionPosition: THREE.Vector3;
  sightY: number;
  /** Emissive materials that pulse over time; only the Ray Gun uses this. */
  energyMaterials?: THREE.MeshStandardMaterial[];
}

/**
 * Ray Gun view model: an original retro-futuristic homage built from
 * primitives — brushed-metal body, brass accents, glowing accelerator rings
 * around a tapered barrel and a caged power cell on top. No external assets.
 */
function buildRaygun(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  const glowColor = config.energyColor ?? 0x63f2a4;

  const body = new THREE.MeshStandardMaterial({
    color: config.bodyColor,
    roughness: 0.34,
    metalness: 0.85,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: config.accentColor,
    roughness: 0.3,
    metalness: 0.9,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.55, metalness: 0.4 });
  const energyMaterials: THREE.MeshStandardMaterial[] = [];
  const makeGlow = (): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({
      color: 0x0b0e12,
      roughness: 0.4,
      metalness: 0.2,
      emissive: glowColor,
      emissiveIntensity: 1.5,
    });
    energyMaterials.push(material);
    return material;
  };

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    rz = 0,
  ): void => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.rotation.z = rz;
    group.add(mesh);
  };

  // Grip and receiver.
  add(new THREE.BoxGeometry(0.042, 0.115, 0.052), dark, 0, -0.078, 0.055, 0.32);
  add(new THREE.BoxGeometry(0.058, 0.07, 0.21), body, 0, 0, -0.01);
  // Brass fin strips along the receiver — pure pulp sci-fi.
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.004, 0.05, 0.16), brass, side * 0.032, 0.012, -0.01);
  }

  // Tapered barrel with glowing accelerator rings.
  add(new THREE.CylinderGeometry(0.024, 0.015, 0.18, 12), body, 0, 0.006, -0.2, Math.PI / 2);
  const ringGeometry = new THREE.TorusGeometry(0.028, 0.0065, 8, 18);
  for (const z of [-0.145, -0.2, -0.255]) {
    add(ringGeometry, makeGlow(), 0, 0.006, z);
  }
  // Emitter tip.
  add(new THREE.SphereGeometry(0.019, 10, 8), makeGlow(), 0, 0.006, -0.295);

  // Caged power cell on top: glowing sphere inside a brass frame.
  add(new THREE.SphereGeometry(0.024, 12, 10), makeGlow(), 0, 0.062, 0.01);
  add(new THREE.TorusGeometry(0.03, 0.004, 6, 16), brass, 0, 0.062, 0.01, Math.PI / 2);
  add(new THREE.BoxGeometry(0.008, 0.028, 0.008), brass, 0, 0.032, 0.01);

  // Rear coil housing + iron sights.
  add(new THREE.CylinderGeometry(0.026, 0.03, 0.07, 10), brass, 0, 0.004, 0.115, Math.PI / 2);
  add(new THREE.BoxGeometry(0.006, 0.02, 0.006), dark, 0, 0.062, -0.11);
  add(new THREE.BoxGeometry(0.026, 0.018, 0.01), dark, 0, 0.06, 0.09);

  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0.006, -0.31),
    ejectionPosition: new THREE.Vector3(0.035, 0, 0.02),
    sightY: 0.068,
    energyMaterials,
  };
}

/**
 * Procedural fallback / M60 model built from primitives. Kept deliberately
 * simple; the GLB path is the primary one for the other weapons.
 */
function buildProcedural(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: config.bodyColor,
    roughness: 0.5,
    metalness: 0.55,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: config.accentColor,
    roughness: 0.65,
    metalness: 0.25,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.55, metalness: 0.4 });

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    rx = 0,
    rz = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.rotation.z = rz;
    group.add(mesh);
    return mesh;
  };

  const bulk = config.bulk;
  const width = 0.062 * bulk;
  const height = 0.085 * bulk;
  const barrelMidZ = -config.receiverLength / 2 - config.barrelLength / 2;

  add(new THREE.BoxGeometry(width, height, config.receiverLength), body, 0, 0, 0);
  add(
    new THREE.CylinderGeometry(config.barrelRadius, config.barrelRadius, config.barrelLength, 10),
    dark,
    0,
    config.barrelRadius * 0.6,
    barrelMidZ,
    Math.PI / 2,
  );
  add(
    new THREE.BoxGeometry(width * 0.9, height * 0.72, config.barrelLength * 0.55),
    accent,
    0,
    0.005,
    -config.receiverLength / 2 - config.barrelLength * 0.3,
  );

  const stockMaterial = config.magazine === 'internal' ? accent : dark;
  add(
    new THREE.BoxGeometry(width * 0.85, height * 0.9, config.stockLength),
    stockMaterial,
    0,
    -0.012,
    config.receiverLength / 2 + config.stockLength / 2 - 0.02,
  );
  add(
    new THREE.BoxGeometry(width * 0.68, 0.095, 0.036),
    dark,
    0,
    -height / 2 - 0.04,
    config.receiverLength / 2 - 0.05,
    0.35,
  );

  switch (config.magazine) {
    case 'straight':
      add(new THREE.BoxGeometry(width * 0.72, 0.13, 0.05), dark, 0, -height / 2 - 0.062, -0.02, 0.08);
      break;
    case 'curved':
      add(new THREE.BoxGeometry(width * 0.7, 0.09, 0.046), dark, 0, -height / 2 - 0.042, -0.028, 0.3);
      add(new THREE.BoxGeometry(width * 0.7, 0.09, 0.042), dark, 0, -height / 2 - 0.1, -0.062, 0.62);
      break;
    case 'box': {
      // M60: ammo box, feed tray with visible rounds, bipod and carry handle.
      add(new THREE.BoxGeometry(width * 1.35, 0.1, 0.12), accent, -0.025, -height / 2 - 0.05, -0.02);
      const roundGeometry = new THREE.CylinderGeometry(0.004, 0.004, 0.02, 6);
      const brass = new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.35, metalness: 0.85 });
      for (let i = 0; i < 5; i++) {
        add(roundGeometry, brass, -0.01 - i * 0.008, height / 2 + 0.004, -0.045, Math.PI / 2);
      }
      add(new THREE.BoxGeometry(0.012, 0.05, 0.012), dark, 0, height / 2 + 0.028, -0.02); // carry handle post
      add(new THREE.BoxGeometry(0.02, 0.012, 0.1), dark, 0, height / 2 + 0.056, -0.02); // carry handle grip
      const legGeometry = new THREE.CylinderGeometry(0.004, 0.004, 0.16, 6);
      add(legGeometry, dark, -0.02, -height / 2 - 0.07, barrelMidZ - 0.05, 0.35);
      add(legGeometry, dark, 0.02, -height / 2 - 0.07, barrelMidZ - 0.05, 0.35);
      break;
    }
    case 'internal':
      add(new THREE.BoxGeometry(width * 0.8, 0.04, 0.09), accent, 0, -height / 2 - 0.016, -0.01);
      break;
  }

  if (config.optic === 'scope') {
    add(new THREE.CylinderGeometry(0.021, 0.021, 0.16, 12), dark, 0, config.sightHeight, -0.01, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.027, 0.027, 0.035, 12), dark, 0, config.sightHeight, -0.095, Math.PI / 2);
    add(new THREE.BoxGeometry(0.012, 0.03, 0.012), dark, 0, config.sightHeight - 0.034, 0.03);
    add(new THREE.BoxGeometry(0.012, 0.03, 0.012), dark, 0, config.sightHeight - 0.034, -0.05);
  } else {
    add(new THREE.BoxGeometry(0.03, 0.024, 0.014), dark, 0, config.sightHeight - 0.012, config.receiverLength / 2 - 0.01);
    add(new THREE.BoxGeometry(0.007, 0.026, 0.007), dark, 0, config.sightHeight - 0.013, barrelMidZ - config.barrelLength / 2 + 0.03);
  }

  group.scale.setScalar(config.scale);

  const sightY = config.sightHeight * config.scale;
  const muzzleZ = (-config.receiverLength / 2 - config.barrelLength) * config.scale;
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, config.barrelRadius * 0.6 * config.scale, muzzleZ),
    ejectionPosition: new THREE.Vector3((width / 2) * config.scale, 0.01, -0.02),
    sightY,
  };
}

/**
 * First-person view model. Purely visual: hip/ADS pose blending, mouse sway,
 * movement bob, spring-based visual recoil and state animations. All values
 * come from ViewModelConfig so each weapon keeps its own personality.
 */
export class WeaponView {
  readonly root = new THREE.Group();
  private readonly muzzle = new THREE.Object3D();
  private readonly ejectionPort = new THREE.Object3D();
  private readonly flash: THREE.Mesh;
  private readonly spring: SpringRecoil;
  private readonly hipPosition: THREE.Vector3;
  private readonly adsPosition: THREE.Vector3;
  private flashTime = 0;
  private bobPhase = 0;
  private swayX = 0;
  private swayY = 0;
  private pulseTime = 0;
  private readonly energyMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(
    private readonly definition: WeaponDefinition,
    model: THREE.Group | null,
  ) {
    const view = definition.view;
    this.spring = new SpringRecoil(view.visualRecoil);
    this.hipPosition = new THREE.Vector3(view.hip[0], view.hip[1], view.hip[2]);

    if (model && view.modelLength !== undefined && view.modelYaw !== undefined) {
      const sightY = this.attachGlbModel(model, view);
      this.adsPosition = new THREE.Vector3(view.ads[0], -sightY + view.ads[1], view.ads[2]);
    } else {
      const built = view.energyColor !== undefined ? buildRaygun(view) : buildProcedural(view);
      this.root.add(built.group);
      this.muzzle.position.copy(built.muzzlePosition);
      this.ejectionPort.position.copy(built.ejectionPosition);
      this.adsPosition = new THREE.Vector3(view.ads[0], -built.sightY + view.ads[1], view.ads[2]);
      if (built.energyMaterials) this.energyMaterials.push(...built.energyMaterials);
    }
    this.root.add(this.muzzle, this.ejectionPort);

    const flashMaterial = new THREE.MeshBasicMaterial({
      map: getFlashTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    // Energy weapons tint the muzzle flash to their bolt color.
    if (view.energyColor !== undefined) flashMaterial.color.setHex(view.energyColor);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMaterial);
    this.flash.visible = false;
    this.muzzle.add(this.flash);

    this.root.position.copy(this.hipPosition);
    this.root.visible = false;
  }

  /** Attaches the GLB normalized to real-world length; returns the sight line height. */
  private attachGlbModel(model: THREE.Group, view: ViewModelConfig): number {
    tuneGlbMaterials(model);

    const rawBox = new THREE.Box3().setFromObject(model);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    const scale = (view.modelLength as number) / rawSize.x;
    model.scale.setScalar(scale);

    // Center the thickness axis on the pivot; keep the authored grip origin.
    const rawCenter = rawBox.getCenter(new THREE.Vector3());
    model.position.z = -rawCenter.z * scale;

    const oriented = new THREE.Group();
    oriented.rotation.y = view.modelYaw as number;
    oriented.add(model);
    this.root.add(oriented);

    const box = new THREE.Box3().setFromObject(oriented);
    const sightY = box.max.y;
    this.muzzle.position.set(0, sightY * BORE_HEIGHT_FRACTION, box.min.z);
    this.ejectionPort.position.set(box.max.x + 0.01, sightY * 0.35, box.min.z * 0.25);
    return sightY;
  }

  /** Called by Game on every shot event. */
  onShot(): void {
    this.flashTime = FLASH_DURATION;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flash.visible = true;
    this.spring.kick();
  }

  getMuzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.muzzle.getWorldPosition(out);
  }

  getEjectionWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.ejectionPort.getWorldPosition(out);
  }

  update(
    dt: number,
    weapon: Weapon,
    speed01: number,
    mouseDeltaX: number,
    mouseDeltaY: number,
  ): void {
    const view = this.definition.view;
    const ads = weapon.adsAlpha;

    // 1. Base pose: hip ↔ ADS.
    this.root.position.lerpVectors(this.hipPosition, this.adsPosition, ads);
    this.root.rotation.set(0, 0, 0);

    // 2. Mouse sway: smoothed lag behind the camera, heavily reduced in ADS.
    const swayScale = view.sway * (1 - ads * 0.8);
    const targetX = clamp(-mouseDeltaX * SWAY_PER_PIXEL, -SWAY_LIMIT, SWAY_LIMIT) * swayScale;
    const targetY = clamp(-mouseDeltaY * SWAY_PER_PIXEL, -SWAY_LIMIT, SWAY_LIMIT) * swayScale;
    this.swayX = damp(this.swayX, targetX, SWAY_SMOOTHING, dt);
    this.swayY = damp(this.swayY, targetY, SWAY_SMOOTHING, dt);
    this.root.position.x += this.swayX;
    this.root.position.y += this.swayY;
    this.root.rotation.y += this.swayX * 1.2;
    this.root.rotation.x += this.swayY * 0.8;

    // 3. Movement bob, scaled by speed and suppressed while aiming.
    const bobScale = view.bob * (1 - ads * 0.85) * speed01;
    if (bobScale > 0.001) {
      this.bobPhase += dt * (5 + speed01 * 5);
      this.root.position.x += Math.sin(this.bobPhase) * 0.005 * bobScale;
      this.root.position.y += Math.abs(Math.cos(this.bobPhase)) * 0.004 * bobScale;
      this.root.rotation.z += Math.sin(this.bobPhase) * 0.012 * bobScale;
    }

    // 4. Independent visual recoil layer (spring).
    this.spring.update(dt);
    this.root.position.z += this.spring.offset;
    this.root.rotation.x += this.spring.pitch;
    this.root.rotation.z += this.spring.roll;

    // 5. State-driven animations.
    switch (weapon.state) {
      case 'reloading': {
        const curve = Math.sin(weapon.stateProgress * Math.PI);
        this.root.position.y -= curve * 0.13;
        this.root.rotation.x -= curve * 0.45;
        this.root.rotation.z += curve * 0.35;
        break;
      }
      case 'equipping': {
        const remaining = 1 - weapon.stateProgress;
        this.root.position.y -= remaining * 0.28;
        this.root.rotation.x += remaining * 0.6;
        break;
      }
      case 'cycling': {
        const curve = Math.sin(weapon.stateProgress * Math.PI);
        this.root.position.z += curve * 0.035;
        this.root.rotation.x -= curve * 0.12;
        break;
      }
      default:
        break;
    }

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.flash.visible = false;
    }

    // Ray Gun power cell and rings pulse gently at all times.
    if (this.energyMaterials.length > 0) {
      this.pulseTime += dt;
      const pulse = 1.35 + Math.sin(this.pulseTime * 5) * 0.45;
      for (const material of this.energyMaterials) material.emissiveIntensity = pulse;
    }

    // Inside a real scope you would not see the rifle body at all.
    this.root.visible = !(this.definition.scoped && ads > 0.86);
  }
}
