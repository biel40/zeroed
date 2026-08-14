import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, damp } from '../utils/math';
import type { MagazineDropPool } from './MagazineDrop';
import { ReloadAnimator, type ReloadParts } from './ReloadAnimator';
import { SpringRecoil } from './SpringRecoil';
import type { Weapon } from './Weapon';
import type { ReloadPhase, ViewModelConfig, WeaponDefinition } from './WeaponTypes';

const FLASH_DURATION = 0.045;
/** Bore line as a fraction of the sight line height (rifle geometry heuristic). */
const BORE_HEIGHT_FRACTION = 0.65;
/** Pistol slide blowback: travel in meters and full return time in seconds. */
const SLIDE_TRAVEL = 0.026;
const SLIDE_RETURN_TIME = 0.09;
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
        material.roughness = 0.5;
        material.color.setHex(0x3a2412);
      } else if (name.includes('wood')) {
        // AK furniture: dark walnut laminate, satin sheen — NOT orange toy wood.
        // The GLB ships a light orange baseColor; override to the real finish.
        material.metalness = 0;
        material.roughness = 0.42;
        material.color.setHex(0x4a2e18);
      } else if (name.includes('black')) {
        material.metalness = 0.3;
        material.roughness = 0.5;
      } else if (name.includes('darkgrey')) {
        // AK barrel + front-sight assembly: near-black blued steel.
        material.metalness = 0.9;
        material.roughness = 0.3;
        material.color.multiplyScalar(0.55);
      } else if (name.includes('grey')) {
        // AK receiver / handguard steel: parkerized near-black, like the M1911.
        material.metalness = 0.82;
        material.roughness = 0.38;
        material.color.multiplyScalar(0.6);
      } else if (name.includes('green')) {
        material.metalness = 0.15;
        material.roughness = 0.6;
      } else {
        // "Main", "MainDark", "MainLight" and anything unknown: parkerized steel.
        material.metalness = 0.7;
        material.roughness = 0.48;
      }
      // Metals capture the env map harder than polymer/glass so the finish
      // reads as machined steel under the room IBL, not flat plastic.
      material.envMapIntensity = name.includes('glass') ? 1.6 : material.metalness > 0.6 ? 1.35 : 1.1;
      material.needsUpdate = true;
    }
  });
}

export interface BuiltProcedural {
  group: THREE.Group;
  muzzlePosition: THREE.Vector3;
  ejectionPosition: THREE.Vector3;
  sightY: number;
  /** Emissive materials that pulse over time; only the Ray Gun uses this. */
  energyMaterials?: THREE.MeshStandardMaterial[];
  /** Reload parts the animator drives (magazine, feed cover, handle, cell). */
  reloadParts?: Partial<ReloadParts>;
  /** Pistol slide: kicks back per shot and is racked by the reload charge. */
  slide?: THREE.Object3D;
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

  // Caged power cell on top: glowing sphere inside a brass frame. The cell
  // is the reloadable part — the animator lifts it out of the cage.
  const cell = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), makeGlow());
  cell.position.set(0, 0.062, 0.01);
  group.add(cell);
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
    reloadParts: { magazine: cell },
  };
}

/**
 * ZEUS-77 "Tempest Coil" view model: an original electric Wonder Weapon
 * built from primitives — a dark gunmetal receiver, two exposed copper
 * accelerator coils wrapping the barrel, a glowing capacitor spine, and a
 * fork emitter up front that the chain arcs read as the arc's origin. The
 * capacitor cell on top is the reloadable part (cell-style choreography).
 * Distinct silhouette from the Ray Gun: coils + fork vs. rings + sphere.
 */
function buildTesla(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  const glowColor = config.energyColor ?? 0x7fd4ff;

  const body = new THREE.MeshStandardMaterial({
    color: config.bodyColor,
    roughness: 0.4,
    metalness: 0.8,
  });
  const copper = new THREE.MeshStandardMaterial({
    color: 0xb0603a,
    roughness: 0.32,
    metalness: 0.9,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x11141a, roughness: 0.5, metalness: 0.5 });
  const energyMaterials: THREE.MeshStandardMaterial[] = [];
  const makeGlow = (intensity = 1.6): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({
      color: 0x0a0e14,
      roughness: 0.35,
      metalness: 0.2,
      emissive: glowColor,
      emissiveIntensity: intensity,
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
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.rotation.z = rz;
    group.add(mesh);
    return mesh;
  };

  const sy = config.sightHeight;

  // Grip and receiver block.
  add(new THREE.BoxGeometry(0.04, 0.11, 0.05), dark, 0, -0.08, 0.06, 0.3);
  add(new THREE.BoxGeometry(0.06, 0.072, 0.24), body, 0, 0, -0.01);
  // Angular shoulder stock.
  add(new THREE.BoxGeometry(0.05, 0.08, 0.14), dark, 0, -0.02, 0.17, -0.12);

  // Barrel core with twin copper accelerator coils wrapping it.
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 12), dark, 0, 0.004, -0.22, Math.PI / 2);
  for (const z of [-0.13, -0.19, -0.25, -0.31]) {
    add(new THREE.TorusGeometry(0.032, 0.0075, 8, 16), copper, 0, 0.004, z);
  }
  // Insulating glow rings between the coils.
  for (const z of [-0.16, -0.22, -0.28]) {
    add(new THREE.TorusGeometry(0.03, 0.004, 6, 16), makeGlow(1.3), 0, 0.004, z);
  }

  // Fork emitter: two prongs splayed apart, arcing tips — the chain origin.
  for (const side of [-1, 1]) {
    add(
      new THREE.BoxGeometry(0.008, 0.008, 0.09),
      copper,
      side * 0.02,
      0.004,
      -0.38,
      0,
      side * 0.18,
    );
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), makeGlow(2.2));
    tip.position.set(side * 0.033, 0.004, -0.415);
    group.add(tip);
  }

  // Capacitor spine along the top: three glowing cells between copper ribs.
  const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.09, 12), makeGlow(1.8));
  cell.rotation.x = Math.PI / 2;
  cell.position.set(0, 0.062, -0.02);
  group.add(cell);
  for (const z of [-0.055, 0.015]) {
    add(new THREE.TorusGeometry(0.024, 0.005, 6, 14), copper, 0, 0.062, z);
  }
  // Cage posts holding the capacitor.
  add(new THREE.BoxGeometry(0.006, 0.03, 0.006), dark, 0, 0.036, -0.05);
  add(new THREE.BoxGeometry(0.006, 0.03, 0.006), dark, 0, 0.036, 0.012);

  // Red-dot sight (the Tesla aims true: ADS aligns the dot to shot center).
  add(new THREE.BoxGeometry(0.02, 0.012, 0.05), dark, 0, sy - 0.024, -0.13);
  add(new THREE.BoxGeometry(0.003, 0.03, 0.004), dark, -0.011, sy - 0.006, -0.13);
  add(new THREE.BoxGeometry(0.003, 0.03, 0.004), dark, 0.011, sy - 0.006, -0.13);
  add(new THREE.BoxGeometry(0.026, 0.003, 0.004), dark, 0, sy + 0.008, -0.13);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.0035, 8, 6),
    new THREE.MeshBasicMaterial({ color: glowColor, toneMapped: false }),
  );
  dot.position.set(0, sy, -0.13);
  group.add(dot);

  group.scale.setScalar(config.scale);
  const sightY = sy * config.scale;
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0.004 * config.scale, -0.42 * config.scale),
    ejectionPosition: new THREE.Vector3(0.035 * config.scale, 0, 0.02),
    sightY,
    energyMaterials,
    reloadParts: { magazine: cell },
  };
}

/**
 * M1911 view model built from primitives, detailed to hold up next to the
 * GLB rifles: a rounded slide with front + rear cocking serrations, an
 * ejection port, a barrel bushing and Novak-style sights (a REAL notch you
 * align at the sightY line) riding the live blowback slide; the frame
 * carries the trigger-guard loop, beavertail grip safety, spur hammer,
 * slide stop, thumb safety, magazine release and wood grip panels with
 * screw heads. The slide stays a live part (WeaponView kicks it back per
 * shot, the ReloadAnimator racks it during the charge window — it is the
 * reload "handle") and the magazine, baseplate included, is the droppable
 * reload part. ~30 low-poly meshes built once at preload: cheap everywhere.
 */
function buildPistol(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  // Parkerized frame, blued slide (a touch lighter), walnut grip panels.
  const frameMat = new THREE.MeshStandardMaterial({
    color: config.bodyColor,
    roughness: 0.42,
    metalness: 0.78,
  });
  const slideMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.bodyColor).offsetHSL(0, 0, 0.045),
    roughness: 0.3,
    metalness: 0.9,
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: config.accentColor,
    roughness: 0.62,
    metalness: 0.04,
  });
  // Small controls: trigger, hammer, sights, bushing, screws.
  const dark = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    roughness: 0.45,
    metalness: 0.6,
  });

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

  const length = config.receiverLength;
  const slideY = 0.026;
  const slideTop = slideY + 0.015;

  // --- Frame (static): rails, trigger-guard loop, controls, grip ---
  add(new RoundedBoxGeometry(0.03, 0.032, length, 2, 0.004), frameMat, 0, 0, 0);
  // Trigger guard: bottom bar + curved front strap form the classic loop.
  add(new RoundedBoxGeometry(0.024, 0.006, 0.064, 2, 0.003), frameMat, 0, -0.032, -0.013);
  add(new RoundedBoxGeometry(0.024, 0.026, 0.007, 2, 0.003), frameMat, 0, -0.021, -0.044, -0.12);
  // Curved trigger shoe inside the guard.
  add(new RoundedBoxGeometry(0.005, 0.018, 0.007, 2, 0.002), dark, 0, -0.023, -0.012, 0.18);
  // Beavertail grip safety sweeping over the web of the hand.
  add(
    new RoundedBoxGeometry(0.026, 0.02, 0.032, 2, 0.006),
    frameMat,
    0,
    0.008,
    length / 2 - 0.008,
    -0.3,
  );
  // Spur hammer, cocked.
  add(new RoundedBoxGeometry(0.008, 0.02, 0.008, 2, 0.002), dark, 0, 0.026, length / 2 + 0.004, -0.3);
  add(new THREE.BoxGeometry(0.008, 0.005, 0.014), dark, 0, 0.033, length / 2 + 0.011, -0.5);
  // Slide stop (pin + arm) and thumb safety ride the LEFT flank.
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 8), dark, -0.0165, -0.004, 0.012, 0, Math.PI / 2);
  add(new RoundedBoxGeometry(0.003, 0.006, 0.02, 2, 0.0015), dark, -0.017, -0.0085, 0.021);
  add(new RoundedBoxGeometry(0.004, 0.008, 0.016, 2, 0.002), dark, -0.0155, 0.008, length / 2 - 0.024);
  // Magazine release button, left flank above the grip.
  add(new THREE.CylinderGeometry(0.005, 0.005, 0.005, 10), dark, -0.0158, -0.032, 0.032, 0, Math.PI / 2);

  // Grip: steel core, walnut panels and a steel mainspring housing, on the
  // classic 1911 rake. Screws sit on the panel faces along that same rake
  // (offsets are the panel-center ± the rotated grip axis).
  add(new RoundedBoxGeometry(0.028, 0.098, 0.036, 2, 0.005), frameMat, 0, -0.062, 0.048, 0.28);
  for (const side of [-1, 1]) {
    add(
      new RoundedBoxGeometry(0.0045, 0.088, 0.032, 2, 0.002),
      gripMat,
      side * 0.0158,
      -0.062,
      0.048,
      0.28,
    );
    add(new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 8), dark, side * 0.0182, -0.037, 0.0554, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 8), dark, side * 0.0182, -0.087, 0.0406, 0, Math.PI / 2);
  }
  add(new RoundedBoxGeometry(0.02, 0.08, 0.004, 2, 0.002), dark, 0, -0.067, 0.0665, 0.28);

  // Barrel tip peeking past the slide.
  add(
    new THREE.CylinderGeometry(config.barrelRadius, config.barrelRadius, 0.03, 10),
    dark,
    0,
    slideY + 0.001,
    -length / 2 - 0.008,
    Math.PI / 2,
  );

  // --- SLIDE GROUP — everything in here moves with the blowback / racking ---
  const slide = new THREE.Group();
  slide.position.set(0, slideY, 0);
  const slideBody = new THREE.Mesh(
    new RoundedBoxGeometry(0.034, 0.03, length * 1.02, 2, 0.006),
    slideMat,
  );
  slide.add(slideBody);

  const slideAdd = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    slide.add(mesh);
    return mesh;
  };

  // Cocking serrations: dark raised ribs read as grooves. Rear AND front,
  // like a modern 1911.
  for (let i = 0; i < 5; i++) {
    slideAdd(new THREE.BoxGeometry(0.036, 0.026, 0.0028), dark, 0, 0, length / 2 - 0.016 - i * 0.006);
  }
  for (let i = 0; i < 3; i++) {
    slideAdd(new THREE.BoxGeometry(0.036, 0.026, 0.0028), dark, 0, 0, -length / 2 + 0.014 + i * 0.006);
  }
  // Ejection port: a dark inset plate on the top-right of the slide.
  slideAdd(new RoundedBoxGeometry(0.015, 0.002, 0.032, 2, 0.001), dark, 0.0075, 0.0152, -0.03);
  // Barrel bushing ringing the muzzle at the slide face.
  const bushing = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 0.006, 12), dark);
  bushing.rotation.x = Math.PI / 2;
  bushing.position.set(0, 0.001, -length / 2 + 0.0005);
  slide.add(bushing);

  // Novak-style sights ON the slide: two rear blocks leave a REAL notch you
  // align with the front post. Both tops sit exactly at sightY so ADS
  // alignment (which uses sightY) stays pixel-exact.
  const sightTop = config.sightHeight;
  for (const side of [-1, 1]) {
    slideAdd(
      new THREE.BoxGeometry(0.008, 0.014, 0.01),
      dark,
      side * 0.008,
      sightTop - slideY - 0.007,
      length / 2 - 0.012,
    );
  }
  slideAdd(
    new THREE.BoxGeometry(0.004, 0.018, 0.005),
    dark,
    0,
    sightTop - slideY - 0.009,
    -length / 2 + 0.012,
  );
  group.add(slide);

  // Magazine inside the grip; the baseplate is a CHILD so it rides along
  // when the animator drops it (magDrop) and seats a fresh one (magIn).
  const [magW, magH, magD] = config.reloadAnim?.magSize ?? [0.024, 0.095, 0.036];
  const magazine = new THREE.Mesh(
    new RoundedBoxGeometry(magW, magH, magD, 2, 0.003),
    new THREE.MeshStandardMaterial({
      color: config.reloadAnim?.magColor ?? 0x23262b,
      roughness: 0.4,
      metalness: 0.7,
    }),
  );
  magazine.position.set(0, -0.062, 0.048);
  magazine.rotation.x = 0.28;
  const baseplate = new THREE.Mesh(
    new RoundedBoxGeometry(magW + 0.006, 0.008, magD + 0.006, 2, 0.003),
    dark,
  );
  baseplate.position.y = -magH / 2 - 0.002;
  magazine.add(baseplate);
  group.add(magazine);

  group.scale.setScalar(config.scale);
  const sightY = sightTop * config.scale;
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, (slideY + 0.001) * config.scale, (-length / 2 - 0.023) * config.scale),
    ejectionPosition: new THREE.Vector3(0.022 * config.scale, slideTop * config.scale, 0.01),
    sightY,
    slide,
    reloadParts: { magazine, handle: slide },
  };
}

/**
 * M60 view model built from primitives, detailed to buildPistol tier. The
 * GPMG silhouette: long exposed barrel with a slotted flash hider, the gas
 * cylinder slung underneath, a deployed bipod and the right-offset carry
 * handle; the receiver carries the left-hung ammo box with a visible brass
 * belt rising into the feed port, the rear-hinged feed cover (the rear
 * sight aperture rides it, like the real gun), the right-flank charging
 * handle and the skeleton shoulder stock. Reload contract (ReloadAnimator
 * 'belt' style): the ammo box is the magazine (drops left+down), the cover
 * pivots open on its rear hinge and the handle racks +Z. ~40 meshes built
 * once at preload: cheap everywhere.
 */
function buildM60(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: config.bodyColor,
    roughness: 0.46,
    metalness: 0.72,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: config.accentColor,
    roughness: 0.5,
    metalness: 0.6,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.35, metalness: 0.85 });
  const boxMat = new THREE.MeshStandardMaterial({
    color: config.reloadAnim?.magColor ?? 0x3a3e42,
    roughness: 0.5,
    metalness: 0.55,
  });

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

  const width = 0.062 * config.bulk;
  const height = 0.085 * config.bulk;
  const halfW = width / 2;
  const halfH = height / 2;
  const receiverZ = config.receiverLength / 2;
  const barrelTipZ = -receiverZ - config.barrelLength;
  const barrelY = 0.02; // the M60 barrel rides the top half of the receiver
  const sy = config.sightHeight;

  // --- Receiver ---
  add(new RoundedBoxGeometry(width, height, config.receiverLength, 2, 0.006), body, 0, 0, 0);
  // Trigger housing under the receiver.
  add(new THREE.BoxGeometry(width * 0.6, 0.03, 0.1), dark, 0, -halfH - 0.012, 0.02);
  // Takedown pins on the left flank.
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 8), dark, -halfW - 0.001, 0.01, 0.1, 0, Math.PI / 2);
  add(new THREE.CylinderGeometry(0.004, 0.004, 0.004, 8), dark, -halfW - 0.001, 0.01, -0.11, 0, Math.PI / 2);
  // Ejection port inset on the right flank.
  add(new THREE.BoxGeometry(0.002, 0.028, 0.06), dark, halfW + 0.0005, -0.008, -0.02);

  // --- Barrel group: exposed barrel, gas cylinder, slotted flash hider ---
  add(
    new THREE.CylinderGeometry(config.barrelRadius, config.barrelRadius, config.barrelLength, 12),
    dark,
    0,
    barrelY,
    -receiverZ - config.barrelLength / 2,
    Math.PI / 2,
  );
  add(
    new THREE.CylinderGeometry(0.012, 0.012, config.barrelLength * 0.55, 10),
    dark,
    0,
    -0.006,
    -receiverZ - config.barrelLength * 0.35,
    Math.PI / 2,
  );
  // Gas collar joining barrel and gas tube at the front sight block.
  add(new THREE.BoxGeometry(0.03, 0.05, 0.04), accent, 0, 0.006, -0.47);
  // Flash hider protruding past the barrel tip; the muzzle moves to it.
  add(new THREE.CylinderGeometry(0.011, 0.013, 0.05, 10), dark, 0, barrelY, barrelTipZ - 0.018, Math.PI / 2);
  add(new THREE.BoxGeometry(0.028, 0.005, 0.006), body, 0, barrelY + 0.008, barrelTipZ - 0.008);
  add(new THREE.BoxGeometry(0.028, 0.005, 0.006), body, 0, barrelY + 0.008, barrelTipZ - 0.026);
  const muzzleZ = barrelTipZ - 0.043;

  // --- Front sight: the post tops out exactly on the sight line ---
  add(new THREE.BoxGeometry(0.014, 0.03, 0.024), dark, 0, 0.049, -0.52); // base ramp
  add(new THREE.BoxGeometry(0.005, 0.026, 0.006), dark, 0, sy - 0.013, -0.52); // post
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.004, 0.02, 0.01), dark, side * 0.011, sy - 0.012, -0.52); // ears
  }

  // --- Bipod (deployed) and right-offset carry handle ---
  add(new THREE.BoxGeometry(0.04, 0.02, 0.03), dark, 0, barrelY, -0.5);
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 6), dark, side * 0.035, -0.05, -0.5, 0.15, side * 0.4);
  }
  // Carry handle on the right edge, kept BELOW the sight line so ADS stays clean.
  add(new THREE.BoxGeometry(0.006, 0.026, 0.01), dark, 0.034, 0.056, -0.21);
  add(new THREE.BoxGeometry(0.006, 0.026, 0.01), dark, 0.034, 0.056, -0.15);
  add(new THREE.BoxGeometry(0.012, 0.012, 0.07), dark, 0.034, 0.072, -0.18);

  // --- Feed cover: rear hinge, plate forward; the animator swings it open ---
  const coverPivot = new THREE.Group();
  coverPivot.position.set(0, halfH + 0.004, 0.06);
  const coverPlate = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, 0.01, 0.21), accent);
  coverPlate.position.z = -0.105;
  coverPivot.add(coverPlate);
  // Latch at the plate's front edge.
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, 0.012), dark);
  latch.position.set(0, 0.006, -0.1);
  coverPlate.add(latch);
  // The rear sight aperture rides the cover (as on the real M60): two blocks
  // leave a real notch whose gap sits exactly on the sightY line.
  for (const side of [-1, 1]) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.019, 0.01), dark);
    block.position.set(side * 0.009, 0.0143, 0.085);
    coverPlate.add(block);
  }
  group.add(coverPivot);

  // --- Ammo box (the reload "magazine"): hangs left+below, belt rising ---
  const [magW, magH, magD] = config.reloadAnim?.magSize ?? [0.1, 0.11, 0.13];
  const magazine = new THREE.Group();
  magazine.position.set(-(halfW + magW / 2 - 0.015), -(halfH + magH / 2 - 0.03), -0.03);
  magazine.add(new THREE.Mesh(new RoundedBoxGeometry(magW, magH, magD, 2, 0.006), boxMat));
  const lid = new THREE.Mesh(new THREE.BoxGeometry(magW + 0.002, 0.012, magD + 0.002), dark);
  lid.position.y = magH / 2 + 0.004;
  magazine.add(lid);
  const boxLatch = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.025, 0.008), dark);
  boxLatch.position.set(0.03, 0.02, magD / 2 + 0.002);
  magazine.add(boxLatch);
  // Belt stub: brass rounds rising from the box into the left feed port.
  // Children of the magazine so the belt leaves and returns with the box.
  const roundGeometry = new THREE.CylinderGeometry(0.0045, 0.0045, 0.026, 6);
  for (let i = 0; i < 4; i++) {
    const round = new THREE.Mesh(roundGeometry, brass);
    round.rotation.x = Math.PI / 2;
    round.position.set(0.029, magH / 2 + 0.012 + i * 0.011, 0);
    magazine.add(round);
  }
  group.add(magazine);

  // --- Charging handle on the RIGHT flank (the animator racks it +Z) ---
  const handle = new THREE.Group();
  handle.position.set(halfW + 0.008, -0.02, -0.09);
  handle.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.06), dark));
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.02, 8), dark);
  knob.rotation.z = Math.PI / 2;
  knob.position.set(0.012, 0, 0.01);
  handle.add(knob);
  group.add(handle);

  // --- Grip, trigger guard, shoulder stock ---
  add(new RoundedBoxGeometry(0.03, 0.09, 0.045, 2, 0.005), dark, 0, -0.098, 0.075, 0.3);
  add(new THREE.BoxGeometry(0.024, 0.005, 0.07), dark, 0, -0.078, 0);
  add(new THREE.BoxGeometry(0.024, 0.03, 0.006), dark, 0, -0.064, -0.033, -0.15);
  add(new THREE.BoxGeometry(0.005, 0.02, 0.006), dark, 0, -0.062, -0.002, 0.15);
  add(
    new THREE.BoxGeometry(width * 0.75, height * 0.8, config.stockLength),
    dark,
    0,
    -0.012,
    receiverZ + config.stockLength / 2 - 0.01,
    -0.04,
  );
  add(
    new THREE.BoxGeometry(width * 0.7, height * 0.95, 0.015),
    dark,
    0,
    -0.017,
    receiverZ + config.stockLength - 0.02,
    -0.04,
  );
  add(
    new THREE.TorusGeometry(0.006, 0.0015, 6, 10),
    dark,
    0,
    -0.055,
    receiverZ + config.stockLength - 0.04,
    Math.PI / 2,
  );

  group.scale.setScalar(config.scale);
  const sightY = sy * config.scale;
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, barrelY * config.scale, muzzleZ * config.scale),
    ejectionPosition: new THREE.Vector3(
      (halfW + 0.004) * config.scale,
      -0.008 * config.scale,
      -0.02 * config.scale,
    ),
    sightY,
    reloadParts: { magazine, cover: coverPivot, handle },
  };
}

/**
 * Procedural fallback for GLB weapons that failed to load. Kept deliberately
 * simple; the GLB path is the primary one, and the M60/Ray Gun/Tesla/M1911
 * have their own dedicated builders (see buildProceduralViewModel).
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

  const reloadParts: Partial<ReloadParts> = {};

  switch (config.magazine) {
    case 'straight':
      reloadParts.magazine = add(
        new THREE.BoxGeometry(width * 0.72, 0.13, 0.05),
        dark,
        0,
        -height / 2 - 0.062,
        -0.02,
        0.08,
      );
      break;
    case 'curved': {
      const magGroup = new THREE.Group();
      magGroup.position.set(0, -height / 2 - 0.042, -0.028);
      group.add(magGroup);
      const seg1 = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.09, 0.046), dark);
      seg1.rotation.x = 0.3;
      magGroup.add(seg1);
      const seg2 = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.09, 0.042), dark);
      seg2.position.set(0, -0.058, -0.034);
      seg2.rotation.x = 0.62;
      magGroup.add(seg2);
      reloadParts.magazine = magGroup;
      break;
    }
    case 'internal':
      reloadParts.magazine = add(
        new THREE.BoxGeometry(width * 0.8, 0.04, 0.09),
        accent,
        0,
        -height / 2 - 0.016,
        -0.01,
      );
      break;
  }

  if (config.optic === 'scope') {
    add(new THREE.CylinderGeometry(0.021, 0.021, 0.16, 12), dark, 0, config.sightHeight, -0.01, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.027, 0.027, 0.035, 12), dark, 0, config.sightHeight, -0.095, Math.PI / 2);
    add(new THREE.BoxGeometry(0.012, 0.03, 0.012), dark, 0, config.sightHeight - 0.034, 0.03);
    add(new THREE.BoxGeometry(0.012, 0.03, 0.012), dark, 0, config.sightHeight - 0.034, -0.05);
  } else if (config.optic === 'reddot') {
    // Compact reflex sight: a base and an upright window frame. The emissive
    // dot sits exactly on the sight line (y = sightHeight, x = 0), so ADS —
    // which aligns sightY to the camera center — puts the dot on the true
    // shot center by construction. No per-frame math needed.
    const sy = config.sightHeight;
    add(new THREE.BoxGeometry(0.02, 0.012, 0.05), dark, 0, sy - 0.024, -0.02); // base rail
    // Window frame: two posts + a top bar, leaving the middle open.
    add(new THREE.BoxGeometry(0.003, 0.03, 0.004), dark, -0.011, sy - 0.006, -0.02);
    add(new THREE.BoxGeometry(0.003, 0.03, 0.004), dark, 0.011, sy - 0.006, -0.02);
    add(new THREE.BoxGeometry(0.026, 0.003, 0.004), dark, 0, sy + 0.008, -0.02);
    // The red dot itself, floating in the window on the sight line.
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0035, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2b2b, toneMapped: false }),
    );
    dot.position.set(0, sy, -0.02);
    group.add(dot);
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
    reloadParts,
  };
}

/**
 * Picks the procedural builder for a view config: dedicated builders for
 * the Wonder Weapons (Ray Gun, Tesla), the M1911 pistol and the M60 GPMG;
 * the generic long-gun fallback otherwise (a GLB that failed to load).
 * Single dispatch shared by the first-person WeaponView and the world-space
 * display models so both always build the same weapon.
 */
export function buildProceduralViewModel(view: ViewModelConfig): BuiltProcedural {
  if (view.teslaFrame === 'tesla') return buildTesla(view);
  if (view.energyColor !== undefined) return buildRaygun(view);
  if (view.frame === 'pistol') return buildPistol(view);
  if (view.frame === 'lmg') return buildM60(view);
  return buildProcedural(view);
}

/** Result of a GLB detail pass: static decor plus an optional muzzle move. */
export interface GlbDetailPass {
  /** Static decor meshes in view-model space. */
  readonly group: THREE.Group;
  /** New muzzle tip Z when the pass extends the muzzle, else null. */
  readonly muzzleZ: number | null;
}

/**
 * The shipped AK-47 GLB (1122 tris) lacks the silhouette details that read
 * as "AK" up close: the cleaning rod under the barrel (verified by parsing
 * the asset: nothing below the bore line), a muzzle brake and the tangent
 * rear sight. Adds them procedurally, anchored to the normalized model
 * bounds the same way buildGlbReloadParts anchors its parts, and reports
 * the extended muzzle tip so the flash does not spawn inside the brake.
 */
export function buildAk47Details(box: THREE.Box3, sightY: number): GlbDetailPass {
  const group = new THREE.Group();
  // Blued/parkerized near-black steel and DARK walnut laminate — the real AK
  // finish. Bright orange wood + dull grey steel is what read as "toy".
  const steel = new THREE.MeshStandardMaterial({
    color: 0x17181b,
    roughness: 0.34,
    metalness: 0.85,
    envMapIntensity: 1.3,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: 0x4a2e18,
    roughness: 0.42,
    metalness: 0,
    envMapIntensity: 1.15,
  });

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

  // Handguard zone: the front half of the model, between receiver and muzzle.
  const hgFront = box.min.z * 0.94;
  const hgRear = box.min.z * 0.32;
  const hgLen = hgRear - hgFront;
  const hgMid = (hgFront + hgRear) / 2;

  // Lower + upper wooden handguards (chamfered slabs that catch the light).
  add(new RoundedBoxGeometry(0.052, 0.04, hgLen, 2, 0.006), wood, 0, sightY * 0.44, hgMid);
  add(new RoundedBoxGeometry(0.044, 0.024, hgLen, 2, 0.006), wood, 0, sightY * 0.72, hgMid);

  // Gas tube above the upper handguard, running from receiver to gas block.
  add(
    new THREE.CylinderGeometry(0.008, 0.008, hgLen * 0.9, 8),
    steel,
    0,
    sightY * 0.82,
    hgMid,
    Math.PI / 2,
  );
  // Gas block straddling barrel and tube, about 40% back from the muzzle.
  add(new RoundedBoxGeometry(0.026, 0.05, 0.03, 2, 0.004), steel, 0, sightY * 0.72, box.min.z * 0.72);

  // Cleaning rod under the lower handguard.
  const rodFrontZ = box.min.z * 0.7;
  const rodRearZ = box.min.z * 0.35;
  add(
    new THREE.CylinderGeometry(0.0022, 0.0022, rodFrontZ - rodRearZ, 8),
    steel,
    0,
    sightY * 0.38,
    (rodFrontZ + rodRearZ) / 2,
    Math.PI / 2,
  );

  // Muzzle brake protruding past the GLB muzzle; the flash moves to its tip.
  const boreY = sightY * 0.65;
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.024, 12), steel);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, boreY, box.min.z - 0.011);
  group.add(brake);
  for (const z of [box.min.z - 0.006, box.min.z - 0.017]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.004, 0.006), steel);
    slot.position.set(0, boreY + 0.008, z);
    group.add(slot);
  }
  const muzzleZ = box.min.z - 0.024;

  // Dust cover: a chamfered lid over the receiver top, just below sightY.
  const coverFront = box.min.z * 0.3;
  const coverRear = box.max.z * 0.5;
  add(
    new RoundedBoxGeometry(0.056, 0.012, coverRear - coverFront, 2, 0.004),
    steel,
    0,
    sightY * 0.93,
    (coverFront + coverRear) / 2,
  );

  // Tangent rear sight on the receiver top, kept under the sight line.
  const tangentZ = box.min.z * 0.45;
  add(new THREE.BoxGeometry(0.032, 0.012, 0.05), steel, 0, sightY * 0.82, tangentZ);
  add(new THREE.BoxGeometry(0.026, 0.018, 0.008), steel, 0, sightY * 0.82 + 0.013, tangentZ, -0.15);
  add(new THREE.BoxGeometry(0.014, 0.008, 0.02), steel, 0, sightY * 0.82 + 0.008, tangentZ + 0.012);

  // Pistol grip raking back under the receiver rear (the GLB has none).
  add(
    new RoundedBoxGeometry(0.026, 0.095, 0.038, 2, 0.008),
    wood,
    0,
    box.min.y * 0.55,
    box.max.z * 0.34,
    0.32,
  );

  return { group, muzzleZ };
}

/**
 * The AK's signature 30-round "banana" magazine as a tangential-arc stack of
 * tapered boxes: each segment steps forward and down along the feed curve so
 * the body sweeps a natural radius instead of hanging as a straight slab.
 * Returned as a Group the ReloadAnimator's 'rock' style can pivot out of the
 * well; the home pose hangs the feed lips just below the bore line.
 */
export function buildAk47Magazine(
  box: THREE.Box3,
  sightY: number,
  magH: number,
): THREE.Group {
  const group = new THREE.Group();
  // Bakelite/steel magazine: dark and faintly metallic, not grey plastic.
  const steel = new THREE.MeshStandardMaterial({
    color: 0x241a12,
    roughness: 0.4,
    metalness: 0.5,
    envMapIntensity: 1.1,
  });

  // Five segments chasing a tangential arc (~46° total sweep), tapering
  // toward the floor plate so the silhouette reads "banana", not "brick".
  const segments = 5;
  const segH = magH / segments;
  const tiltPerSeg = 0.16;
  let y = 0;
  let z = 0;
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const w = 0.044 - t * 0.012;
    const seg = new THREE.Mesh(new RoundedBoxGeometry(w, segH, 0.056, 2, 0.004), steel);
    seg.position.set(0, y - segH / 2, z);
    seg.rotation.x = -(i + 0.5) * tiltPerSeg;
    group.add(seg);
    const stepAngle = (i + 1) * tiltPerSeg;
    y -= Math.cos(stepAngle) * segH;
    z -= Math.sin(stepAngle) * segH;
  }

  // Home pose: feed lips just under the bore line at the magazine well.
  group.position.set(0, sightY * 0.35 - magH * 0.1, box.min.z * 0.45);
  return group;
}

/**
 * World-space display model of a weapon (Mystery Box roulette, pickups).
 * GLB weapons CLONE the cached AssetManager scene — shared geometry and
 * materials, zero network. Procedural weapons (M60, Ray Gun) are rebuilt
 * from the same builders the first-person viewmodel uses. The result is
 * centered on its pivot and normalized to `targetLength` meters.
 */
export function buildWeaponDisplayModel(
  definition: WeaponDefinition,
  glb: THREE.Group | null,
  targetLength = 0.72,
): THREE.Group {
  const view = definition.view;
  let inner: THREE.Object3D;
  if (glb) {
    inner = glb.clone(true);
    tuneGlbMaterials(inner);
    // Match the first-person orientation fix so every display model faces -Z.
    const oriented = new THREE.Group();
    oriented.rotation.y = view.modelYaw ?? 0;
    oriented.add(inner);
    inner = oriented;
  } else {
    inner = buildProceduralViewModel(view).group;
  }

  // Center on the origin before scaling so the anchor can just rotate.
  const rawBox = new THREE.Box3().setFromObject(inner);
  const center = rawBox.getCenter(new THREE.Vector3());
  inner.position.sub(center);

  const wrapper = new THREE.Group();
  wrapper.add(inner);
  const size = rawBox.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.z, 0.001);
  wrapper.scale.setScalar(targetLength / longest);
  return wrapper;
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
  private readonly animator: ReloadAnimator | null = null;
  private flashTime = 0;
  private bobPhase = 0;
  private swayX = 0;
  private swayY = 0;
  private pulseTime = 0;
  private readonly energyMaterials: THREE.MeshStandardMaterial[] = [];
  private slide: THREE.Object3D | null = null;
  private slideHomeZ = 0;
  private slideBlowback = 0;

  constructor(
    private readonly definition: WeaponDefinition,
    model: THREE.Group | null,
    dropPool: MagazineDropPool | null = null,
  ) {
    const view = definition.view;
    this.spring = new SpringRecoil(view.visualRecoil);
    this.hipPosition = new THREE.Vector3(view.hip[0], view.hip[1], view.hip[2]);

    let reloadParts: Partial<ReloadParts> = {};
    if (model && view.modelLength !== undefined && view.modelYaw !== undefined) {
      const attached = this.attachGlbModel(model, view);
      this.adsPosition = new THREE.Vector3(view.ads[0], -attached.sightY + view.ads[1], view.ads[2]);
      // GLBs are single-mesh: the detachable magazine and charging handle
      // are procedural add-ons anchored to the model bounds.
      reloadParts = this.buildGlbReloadParts(view, attached);
      // The low-poly AK GLB gets its missing signature hardware (cleaning
      // rod, muzzle brake, tangent rear sight) as bounds-anchored decor.
      if (definition.id === 'ak47') {
        const details = buildAk47Details(attached.box, attached.sightY);
        this.root.add(details.group);
        if (details.muzzleZ !== null) this.muzzle.position.z = details.muzzleZ;
      }
      // A red-dot optic rides the GLB's sight line (box.max.y = sightY), so
      // ADS — which aligns sightY to the camera center — puts the dot on the
      // true shot center for free, exactly like the procedural builders.
      if (view.optic === 'reddot') this.attachRedDot(attached.sightY);
    } else {
      const built = buildProceduralViewModel(view);
      this.root.add(built.group);
      this.muzzle.position.copy(built.muzzlePosition);
      this.ejectionPort.position.copy(built.ejectionPosition);
      this.adsPosition = new THREE.Vector3(view.ads[0], -built.sightY + view.ads[1], view.ads[2]);
      if (built.energyMaterials) this.energyMaterials.push(...built.energyMaterials);
      if (built.slide) {
        this.slide = built.slide;
        this.slideHomeZ = built.slide.position.z;
      }
      reloadParts = built.reloadParts ?? {};
    }
    this.root.add(this.muzzle, this.ejectionPort);

    if (view.reloadAnim) {
      this.animator = new ReloadAnimator(
        view.reloadAnim,
        {
          magazine: reloadParts.magazine ?? null,
          handle: reloadParts.handle ?? null,
          cover: reloadParts.cover ?? null,
        },
        dropPool,
      );
    }

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

  /**
   * Red-dot reflex sight for GLB weapons: a compact window frame plus an
   * emissive dot sitting exactly on the sight line (x = 0, y = sightY).
   * Because ADS aligns the weapon's sightY with the camera center, the dot
   * lands on the true raycast center by construction — no per-frame math.
   */
  private attachRedDot(sightY: number): void {
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x14161a,
      roughness: 0.5,
      metalness: 0.55,
    });
    const frame = new THREE.Group();
    const addBar = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
    ): void => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
      bar.position.set(x, y, z);
      frame.add(bar);
    };
    const z = -0.06; // slightly forward of the receiver, on the sight line
    addBar(0.02, 0.012, 0.05, 0, sightY - 0.024, z); // base rail
    addBar(0.003, 0.03, 0.004, -0.011, sightY - 0.006, z); // left post
    addBar(0.003, 0.03, 0.004, 0.011, sightY - 0.006, z); // right post
    addBar(0.026, 0.003, 0.004, 0, sightY + 0.008, z); // top bar
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0035, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2b2b, toneMapped: false }),
    );
    dot.position.set(0, sightY, z);
    frame.add(dot);
    this.root.add(frame);
  }

  /** Attaches the GLB normalized to real-world length; returns bounds info. */
  private attachGlbModel(
    model: THREE.Group,
    view: ViewModelConfig,
  ): { sightY: number; box: THREE.Box3 } {
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
    return { sightY, box };
  }

  /**
   * Procedural magazine + charging handle for single-mesh GLB weapons,
   * anchored to the model bounds: the magazine hangs below the bore line at
   * the receiver, the handle rides the right flank. Positions follow each
   * style's real-world layout (AK handle sits forward, M4's at the rear).
   */
  private buildGlbReloadParts(
    view: ViewModelConfig,
    attached: { sightY: number; box: THREE.Box3 },
  ): Partial<ReloadParts> {
    const anim = view.reloadAnim;
    if (!anim) return {};
    const { sightY, box } = attached;
    const [magW, magH, magD] = anim.magSize;

    let magazine: THREE.Object3D;
    if (anim.style === 'rock' && this.definition.id === 'ak47') {
      // The AK's banana magazine: tangential-arc stack, not a straight box.
      magazine = buildAk47Magazine(box, sightY, magH);
      magazine.rotation.x = 0.22; // rock-and-lock rake at the well
    } else {
      magazine = new THREE.Mesh(
        new THREE.BoxGeometry(magW, magH, magD),
        new THREE.MeshStandardMaterial({
          color: anim.magColor,
          roughness: 0.45,
          metalness: 0.6,
        }),
      );
      magazine.position.set(0, sightY * 0.35 - magH * 0.35, box.min.z * 0.45);
      if (anim.style === 'rock') magazine.rotation.x = 0.22; // AK curve hint
    }
    this.root.add(magazine);

    let handle: THREE.Mesh | null = null;
    if (anim.style !== 'cell') {
      handle = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, 0.02, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.4, metalness: 0.7 }),
      );
      const handleZ =
        anim.style === 'rock'
          ? box.min.z * 0.32 // AK charging handle rides the mid receiver
          : box.max.z * 0.55; // M4/L96: rear of the receiver
      handle.position.set(box.max.x + 0.006, sightY * 0.52, handleZ);
      this.root.add(handle);
    }
    return { magazine, handle };
  }

  /** Wired by Game: reload phase events for audio synchronization. */
  set onReloadPhase(handler: ((phase: ReloadPhase) => void) | null) {
    if (this.animator) this.animator.onPhase = handler;
  }

  /** Called by Game on every shot event. */
  onShot(): void {
    this.flashTime = FLASH_DURATION;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flash.visible = true;
    this.spring.kick();
    // Pistol slide cycles with every shot.
    if (this.slide) this.slideBlowback = 1;
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

    // 5. State-driven animations. The reload animator runs every frame so
    // it can restore parts the moment the state is left (weapon switch).
    this.animator?.update(weapon);
    switch (weapon.state) {
      case 'reloading': {
        if (this.animator) {
          this.root.position.y += this.animator.bodyDip;
          this.root.rotation.x += this.animator.bodyTilt;
          this.root.rotation.z += this.animator.bodyRoll;
        } else {
          const curve = Math.sin(weapon.stateProgress * Math.PI);
          this.root.position.y -= curve * 0.13;
          this.root.rotation.x -= curve * 0.45;
          this.root.rotation.z += curve * 0.35;
        }
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
        this.animator?.updateCycling(weapon.stateProgress);
        break;
      }
      default:
        break;
    }

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.flash.visible = false;
    }

    // Slide blowback: snaps back on the shot, returns to battery in ~90 ms.
    // While reloading the ReloadAnimator owns the slide (it is the charge
    // handle), so the blowback never fights the choreography.
    if (this.slide && weapon.state !== 'reloading') {
      this.slideBlowback = Math.max(0, this.slideBlowback - dt / SLIDE_RETURN_TIME);
      this.slide.position.z = this.slideHomeZ + this.slideBlowback * SLIDE_TRAVEL;
    }

    // Ray Gun power cell and rings pulse gently; the reload spin-up surges.
    if (this.energyMaterials.length > 0) {
      this.pulseTime += dt;
      const pulse =
        1.35 + Math.sin(this.pulseTime * 5) * 0.45 + (this.animator?.chargeGlow ?? 0) * 2.2;
      for (const material of this.energyMaterials) material.emissiveIntensity = pulse;
    }

    // Inside a real scope you would not see the rifle body at all.
    this.root.visible = !(this.definition.scoped && ads > 0.86);
  }
}
