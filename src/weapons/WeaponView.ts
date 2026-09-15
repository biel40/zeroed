import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, damp } from '../utils/math';
import type { MagazineDropPool } from './MagazineDrop';
import { buildM4A1 } from './M4A1ViewModel';
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
  /** Emissive materials that pulse over time on procedural energy weapons. */
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
 * ZEUS-77 "Tempest Coil": a long, handmade electromechanical prototype with
 * a real exposed winding, caged capacitor and fork discharge crown. Named
 * assemblies keep the reload cell and future moving parts independently usable.
 */
function buildTesla(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'zeus77-root';
  const glowColor = config.energyColor ?? 0x7fd4ff;
  const boreY = 0.012;
  const muzzleZ = -0.61;
  const sy = config.sightHeight;

  const wornSteel = new THREE.MeshStandardMaterial({
    color: config.bodyColor,
    roughness: 0.54,
    metalness: 0.76,
    envMapIntensity: 1.15,
  });
  const blackSteel = new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.6, metalness: 0.68 });
  const copper = new THREE.MeshStandardMaterial({ color: config.accentColor, roughness: 0.34, metalness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x9a6a2d, roughness: 0.42, metalness: 0.84 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x4c2818, roughness: 0.82, metalness: 0.02 });
  const ceramic = new THREE.MeshStandardMaterial({ color: 0x9a917d, roughness: 0.72, metalness: 0.05 });
  const redWire = new THREE.MeshStandardMaterial({ color: 0x5a1310, roughness: 0.76, metalness: 0.08 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x284452,
    roughness: 0.18,
    metalness: 0.16,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const energy = new THREE.MeshStandardMaterial({
    color: 0x102733,
    roughness: 0.28,
    metalness: 0.12,
    emissive: glowColor,
    emissiveIntensity: 1.65,
  });
  const energyMaterials = [energy];

  const box = (width: number, height: number, depth: number): THREE.BoxGeometry =>
    new THREE.BoxGeometry(width, height, depth);
  const cylinder = (radius: number, length: number, segments = 12): THREE.CylinderGeometry => {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, segments);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  };
  const profile = (points: readonly (readonly [number, number])[], width: number): THREE.ExtrudeGeometry => {
    const shape = new THREE.Shape();
    shape.moveTo(-points[0][0], points[0][1]);
    for (const [depth, height] of points.slice(1)) shape.lineTo(-depth, height);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: width,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.002,
      bevelThickness: 0.002,
      steps: 1,
      curveSegments: 1,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-width / 2, 0, 0);
    return geometry;
  };
  const assembly = (name: string): THREE.Group => {
    const part = new THREE.Group();
    part.name = `zeus77-${name}`;
    group.add(part);
    return part;
  };
  const add = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = group,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `zeus77-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const cable = (
    name: string,
    points: readonly THREE.Vector3[],
    material: THREE.Material,
    parent: THREE.Object3D,
    radius = 0.0035,
  ): THREE.Mesh => add(
    name,
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3([...points]), 12, radius, 5, false),
    material,
    0,
    0,
    0,
    parent,
  );
  const batchAssembly = (part: THREE.Group): void => {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of part.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      const batch = batches.get(child.material) ?? [];
      batch.push(child);
      batches.set(child.material, batch);
    }
    let batchIndex = 0;
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((mesh) => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrix);
        return geometry;
      });
      const merged = mergeGeometries(geometries);
      if (merged) {
        const mesh = new THREE.Mesh(merged, material);
        mesh.name = `${part.name}-batch-${batchIndex++}`;
        mesh.userData.sourceNames = meshes.map((source) => source.name);
        part.add(mesh);
        for (const source of meshes) {
          source.geometry.dispose();
          part.remove(source);
        }
      }
      for (const geometry of geometries) geometry.dispose();
    }
  };

  const stock = assembly('stock');
  add('stock-wood', profile([
    [0.07, 0.027], [0.22, 0.035], [0.285, 0.008], [0.282, -0.08],
    [0.245, -0.098], [0.17, -0.068], [0.07, -0.032],
  ], 0.052), wood, 0, 0, 0, stock);
  add('stock-spine', box(0.06, 0.018, 0.2), blackSteel, 0, 0.025, 0.155, stock);
  add('buttplate', box(0.058, 0.115, 0.012), brass, 0, -0.03, 0.286, stock);
  for (const side of [-1, 1]) {
    add('stock-rivet', cylinder(0.003, 0.004, 7), brass, side * 0.027, -0.015, 0.25, stock).rotation.y = Math.PI / 2;
  }

  const receiver = assembly('receiver');
  add('receiver-core', profile([
    [-0.11, 0.033], [0.105, 0.033], [0.125, 0.012], [0.112, -0.044],
    [-0.085, -0.044], [-0.115, -0.016],
  ], 0.07), wornSteel, 0, 0, 0, receiver);
  add('receiver-top-rail', box(0.052, 0.009, 0.235), brass, 0, 0.04, -0.002, receiver);
  for (const z of [-0.09, -0.045, 0, 0.045, 0.09]) {
    add('top-rail-notch', box(0.058, 0.006, 0.008), blackSteel, 0, 0.046, z, receiver);
  }
  for (const side of [-1, 1]) {
    add('receiver-side-plate', box(0.004, 0.052, 0.145), brass, side * 0.037, -0.002, 0.01, receiver);
    for (const z of [-0.045, 0.055]) {
      add('receiver-bolt', cylinder(0.004, 0.003, 7), blackSteel, side * 0.04, 0.012, z, receiver).rotation.y = Math.PI / 2;
    }
  }

  const grip = assembly('grip');
  add('grip-core', profile([
    [0.045, -0.03], [0.095, -0.035], [0.135, -0.142], [0.082, -0.15],
  ], 0.046), wood, 0, 0, 0, grip);
  for (const side of [-1, 1]) {
    add('grip-panel', box(0.004, 0.082, 0.04), wood, side * 0.025, -0.09, 0.09, grip).rotation.x = -0.24;
    add('grip-screw', cylinder(0.003, 0.003, 7), brass, side * 0.028, -0.085, 0.09, grip).rotation.y = Math.PI / 2;
  }
  const triggerGuard = add('trigger-guard', new THREE.TorusGeometry(0.026, 0.003, 5, 14), brass, 0, -0.047, -0.055, grip);
  triggerGuard.rotation.y = Math.PI / 2;
  triggerGuard.scale.z = 1.35;
  add('trigger', box(0.006, 0.027, 0.005), blackSteel, 0, -0.048, -0.052, grip).rotation.x = -0.25;

  const transformer = assembly('transformer-bank');
  add('transformer-case', box(0.062, 0.055, 0.12), blackSteel, 0, -0.065, -0.01, transformer);
  for (let fin = 0; fin < 7; fin++) {
    add('cooling-fin', box(0.078, 0.044, 0.005), wornSteel, 0, -0.069, 0.04 - fin * 0.017, transformer);
  }
  for (const side of [-1, 1]) {
    add('terminal', cylinder(0.009, 0.026, 8), ceramic, side * 0.023, -0.028, -0.045, transformer).rotation.x = Math.PI / 2;
  }

  const capacitor = assembly('capacitor-cell');
  capacitor.position.set(0.047, 0.035, 0.045);
  add('capacitor-energy-core', cylinder(0.015, 0.105, 10), energy, 0, 0, 0, capacitor);
  add('capacitor-glass', cylinder(0.023, 0.11, 12), glass, 0, 0, 0, capacitor);
  for (const z of [-0.058, 0.058]) {
    add('capacitor-cap', cylinder(0.027, 0.012, 10), brass, 0, 0, z, capacitor);
  }
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    add(
      'capacitor-cage-bar',
      box(0.004, 0.004, 0.12),
      copper,
      Math.cos(angle) * 0.026,
      Math.sin(angle) * 0.026,
      0,
      capacitor,
    );
  }
  add('capacitor-latch', box(0.014, 0.012, 0.022), blackSteel, 0.026, -0.02, 0.048, capacitor);

  const barrel = assembly('coil-chamber');
  add('chamber-core', cylinder(0.018, 0.35, 12), energy, 0, boreY, -0.31, barrel);
  add('chamber-glass', cylinder(0.026, 0.35, 14), glass, 0, boreY, -0.31, barrel);
  add('rear-barrel-socket', cylinder(0.038, 0.055, 12), wornSteel, 0, boreY, -0.13, barrel);
  for (const z of [-0.155, -0.245, -0.335, -0.425, -0.475]) {
    add('coil-support-ring', new THREE.TorusGeometry(0.034, 0.004, 6, 16), z === -0.475 ? brass : ceramic, 0, boreY, z, barrel);
  }
  const helixPoints: THREE.Vector3[] = [];
  const helixSegments = 56;
  for (let index = 0; index <= helixSegments; index++) {
    const t = index / helixSegments;
    const angle = t * Math.PI * 11;
    helixPoints.push(new THREE.Vector3(
      Math.cos(angle) * 0.031,
      boreY + Math.sin(angle) * 0.031,
      -0.165 - t * 0.3,
    ));
  }
  add(
    'exposed-copper-coil',
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPoints), helixSegments, 0.0045, 5, false),
    copper,
    0,
    0,
    0,
    barrel,
  );
  for (const side of [-1, 1]) {
    add('chamber-rail', box(0.006, 0.007, 0.36), brass, side * 0.041, boreY - 0.027, -0.31, barrel);
    cable(
      'insulated-feed-wire',
      [
        new THREE.Vector3(side * 0.035, -0.045, -0.025),
        new THREE.Vector3(side * 0.052, -0.035, -0.12),
        new THREE.Vector3(side * 0.052, -0.018, -0.34),
        new THREE.Vector3(side * 0.038, boreY - 0.02, -0.49),
      ],
      side < 0 ? redWire : blackSteel,
      barrel,
    );
  }

  const emitter = assembly('fork-emitter');
  add('emitter-crown', cylinder(0.042, 0.025, 12), brass, 0, boreY, -0.5, emitter);
  add('emitter-insulator', cylinder(0.031, 0.02, 10), ceramic, 0, boreY, -0.518, emitter);
  for (const side of [-1, 1]) {
    const prong = add('emitter-prong', box(0.011, 0.012, 0.095), copper, side * 0.025, boreY, -0.553, emitter);
    prong.rotation.y = -side * 0.12;
    add('emitter-electrode', new THREE.SphereGeometry(0.011, 8, 6), energy, side * 0.032, boreY, -0.594, emitter);
  }
  add('discharge-gap', new THREE.TorusGeometry(0.019, 0.0035, 5, 14), brass, 0, boreY, -0.584, emitter);

  const optic = assembly('optic');
  add('optic-base', box(0.026, 0.012, 0.052), blackSteel, 0, sy - 0.027, -0.105, optic);
  for (const side of [-1, 1]) {
    add('optic-post', box(0.004, 0.032, 0.005), blackSteel, side * 0.014, sy - 0.007, -0.105, optic);
  }
  add('optic-bridge', box(0.032, 0.004, 0.005), blackSteel, 0, sy + 0.01, -0.105, optic);
  add(
    'optic-dot',
    new THREE.SphereGeometry(0.0035, 8, 6),
    new THREE.MeshBasicMaterial({ color: glowColor, toneMapped: false }),
    0,
    sy,
    -0.105,
    optic,
  );

  for (const part of [stock, receiver, grip, transformer, barrel, emitter, optic]) {
    batchAssembly(part);
  }

  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, boreY, muzzleZ).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.04, 0, 0.015).multiplyScalar(config.scale),
    sightY: sy * config.scale,
    energyMaterials,
    reloadParts: { magazine: capacitor },
  };
}

/**
 * Full-size military M1911A1 built around its defining side profile: long,
 * slab-sided Government slide, short unrailed dust cover, oval trigger guard
 * and a thin grip raked rearward. Small GI sights, spur hammer, barrel bushing
 * and recoil-spring plug keep it distinct from modern railed 1911 variants.
 * The slide and magazine remain live reload parts.
 */
function buildPistol(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'm1911-root';
  // Dark parkerized frame, blued slide and reddish-brown walnut stocks.
  const frameMat = new THREE.MeshStandardMaterial({
    color: config.bodyColor,
    roughness: 0.64,
    metalness: 0.65,
    envMapIntensity: 0.85,
  });
  const slideMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.bodyColor).offsetHSL(0, 0, 0.045),
    roughness: 0.52,
    metalness: 0.75,
    envMapIntensity: 0.95,
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: config.accentColor,
    roughness: 0.82,
    metalness: 0.02,
    envMapIntensity: 0.65,
  });
  // Small controls: trigger, hammer, sights, bushing, screws.
  const dark = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    roughness: 0.45,
    metalness: 0.6,
  });
  const sightMat = new THREE.MeshStandardMaterial({
    color: 0x111317,
    roughness: 0.72,
    metalness: 0.38,
  });

  const frame = new THREE.Group();
  frame.name = 'm1911-frame';
  group.add(frame);

  // RoundedBoxGeometry bevels inward and its resulting bounds are smaller
  // than the requested dimensions. The M1911 positions parts against exact
  // dimensions, so normalize each primitive before assembling the model.
  const roundedBox = (
    width: number,
    height: number,
    depth: number,
    segments: number,
    radius: number,
  ): RoundedBoxGeometry => {
    const geometry = new RoundedBoxGeometry(width, height, depth, segments, radius);
    geometry.computeBoundingBox();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    geometry.scale(width / size.x, height / size.y, depth / size.z);
    return geometry;
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
    frame.add(mesh);
    return mesh;
  };

  /** Author a side profile in (length, height), then extrude it across X. */
  const extrudeShape = (
    shape: THREE.Shape,
    thickness: number,
    material: THREE.Material,
  ): THREE.Mesh => {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-thickness / 2, 0, 0);
    const mesh = new THREE.Mesh(geometry, material);
    frame.add(mesh);
    return mesh;
  };

  const extrudeProfile = (
    points: ReadonlyArray<readonly [number, number]>,
    thickness: number,
    material: THREE.Material,
  ): THREE.Mesh => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    return extrudeShape(shape, thickness, material);
  };

  const length = config.receiverLength;
  const slideLength = length * 1.05;
  const slideY = 0.024;

  // --- Frame (static): one continuous forged profile instead of stacked boxes. ---
  const receiver = extrudeProfile(
    [
      [-0.096, 0.017],
      [0.096, 0.017],
      [0.096, -0.01],
      [0.08, -0.018],
      [0.02, -0.021],
      [0.004, -0.015],
      [-0.084, -0.015],
      [-0.096, -0.003],
    ],
    0.031,
    frameMat,
  );
  receiver.name = 'm1911-receiver';
  const dustCover = add(roundedBox(0.029, 0.014, 0.082, 2, 0.004), frameMat, 0, -0.015, -0.054);
  dustCover.name = 'm1911-dust-cover';

  // A real negative space gives the guard its oval side silhouette.
  const guardShape = new THREE.Shape();
  guardShape.absellipse(0.014, -0.037, 0.035, 0.027, 0, Math.PI * 2, false);
  const guardOpening = new THREE.Path();
  guardOpening.absellipse(0.014, -0.038, 0.027, 0.019, 0, Math.PI * 2, true);
  guardShape.holes.push(guardOpening);
  const triggerGuard = extrudeShape(guardShape, 0.027, frameMat);
  triggerGuard.name = 'm1911-trigger-guard';
  const trigger = add(roundedBox(0.005, 0.021, 0.006, 2, 0.002), dark, 0, -0.036, 0.002, -0.18);
  trigger.name = 'm1911-trigger';

  // Short GI grip-safety tang and solid spur hammer, not modern competition parts.
  const beavertail = add(
    roundedBox(0.026, 0.012, 0.026, 2, 0.004),
    frameMat,
    0,
    0.003,
    0.096,
    0.12,
  );
  beavertail.name = 'm1911-beavertail';
  const hammerStem = add(roundedBox(0.009, 0.022, 0.008, 2, 0.002), dark, 0, 0.019, 0.096, -0.28);
  hammerStem.name = 'm1911-hammer';
  const hammerSpur = add(roundedBox(0.009, 0.006, 0.018, 2, 0.002), dark, 0, 0.029, 0.103, -0.4);
  hammerSpur.name = 'm1911-hammer';
  // Slide stop (pin + arm) and thumb safety ride the LEFT flank.
  const slideStopPin = add(new THREE.CylinderGeometry(0.004, 0.004, 0.003, 8), dark, -0.0155, -0.004, 0.012, 0, Math.PI / 2);
  slideStopPin.name = 'm1911-frame-control';
  const slideStopArm = add(roundedBox(0.0024, 0.006, 0.02, 2, 0.0012), dark, -0.0158, -0.0085, 0.021);
  slideStopArm.name = 'm1911-frame-control';
  const thumbSafety = add(roundedBox(0.003, 0.006, 0.014, 2, 0.0015), dark, -0.0154, 0.006, 0.072);
  thumbSafety.name = 'm1911-frame-control';
  // Magazine release button, left flank above the grip.
  const magazineRelease = add(new THREE.CylinderGeometry(0.004, 0.004, 0.003, 10), dark, -0.0155, -0.022, 0.043, 0, Math.PI / 2);
  magazineRelease.name = 'm1911-frame-control';

  // Grip sides are authored directly at the classic rearward rake. The old
  // rotated cuboid leaned the base toward the muzzle, reversing the 1911 line.
  const gripCore = extrudeProfile(
    [
      [-0.088, -0.006],
      [-0.024, -0.009],
      [-0.05, -0.092],
      [-0.114, -0.092],
    ],
    0.029,
    frameMat,
  );
  gripCore.name = 'm1911-grip-core';
  for (const side of [-1, 1]) {
    const panel = extrudeProfile(
      [
        [-0.082, -0.017],
        [-0.03, -0.019],
        [-0.052, -0.083],
        [-0.108, -0.083],
      ],
      0.0032,
      gripMat,
    );
    panel.position.x = side * 0.0152;
    panel.name = 'm1911-walnut-grip-panel';
    const upperScrew = add(
      new THREE.CylinderGeometry(0.0024, 0.0024, 0.0015, 10),
      dark,
      side * 0.017,
      -0.032,
      0.052,
      0,
      Math.PI / 2,
    );
    upperScrew.name = 'm1911-grip-screw';
    const lowerScrew = add(
      new THREE.CylinderGeometry(0.0024, 0.0024, 0.0015, 10),
      dark,
      side * 0.017,
      -0.071,
      0.079,
      0,
      Math.PI / 2,
    );
    lowerScrew.name = 'm1911-grip-screw';
  }
  const mainspringHousing = add(roundedBox(0.021, 0.07, 0.005, 2, 0.002), dark, 0, -0.053, 0.101, -0.29);
  mainspringHousing.name = 'm1911-mainspring-housing';

  // The two circles at the front are characteristic: barrel/bushing above,
  // recoil spring plug below. Both meet the slide face instead of floating.
  const barrel = add(
    new THREE.CylinderGeometry(config.barrelRadius, config.barrelRadius, 0.014, 16),
    dark,
    0,
    slideY + 0.001,
    -slideLength / 2 - 0.006,
    Math.PI / 2,
  );
  barrel.name = 'm1911-barrel';
  const muzzleCrown = add(
    new THREE.CircleGeometry(config.barrelRadius * 0.62, 12),
    new THREE.MeshBasicMaterial({ color: 0x050607 }),
    0,
    slideY + 0.001,
    -slideLength / 2 - 0.0132,
  );
  muzzleCrown.name = 'm1911-muzzle-crown';
  muzzleCrown.rotation.y = Math.PI;
  const recoilPlug = add(
    new THREE.CylinderGeometry(0.0065, 0.0065, 0.009, 14),
    dark,
    0,
    0.006,
    -slideLength / 2 - 0.008,
    Math.PI / 2,
  );
  recoilPlug.name = 'm1911-recoil-spring-plug';

  // --- SLIDE GROUP — everything in here moves with the blowback / racking ---
  const slide = new THREE.Group();
  slide.name = 'm1911-slide';
  slide.position.set(0, slideY, 0);
  // Flat machined flanks and a faceted crown: broad planar highlights instead
  // of the inflated, rippling reflection of a rounded box along the whole slide.
  const slideSection = new THREE.Shape();
  slideSection.moveTo(-0.0175, -0.017);
  slideSection.lineTo(0.0175, -0.017);
  slideSection.lineTo(0.0175, 0.009);
  slideSection.lineTo(0.012, 0.015);
  slideSection.lineTo(0.007, 0.017);
  slideSection.lineTo(-0.007, 0.017);
  slideSection.lineTo(-0.012, 0.015);
  slideSection.lineTo(-0.0175, 0.009);
  slideSection.closePath();
  const slideGeometry = new THREE.ExtrudeGeometry(slideSection, { depth: slideLength, bevelEnabled: false, steps: 1 });
  slideGeometry.translate(0, 0, -slideLength / 2);
  const slideBody = new THREE.Mesh(slideGeometry, slideMat);
  slideBody.name = 'm1911-slide-body';
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

  const slideTopRib = slideAdd(
    roundedBox(0.018, 0.0015, slideLength * 0.78, 2, 0.0007),
    slideMat,
    0,
    0.0168,
    -0.004,
  );
  slideTopRib.name = 'm1911-slide-top-rib';

  // Shallow side grooves preserve the 1911 slide silhouette from the rear;
  // full-width ribs read as a ladder when seen down the sights.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const serration = slideAdd(
        new THREE.BoxGeometry(0.0007, 0.014, 0.0022),
        dark,
        side * 0.0172,
        -0.001,
        slideLength / 2 - 0.015 - i * 0.0045,
      );
      serration.name = 'm1911-slide-serration';
    }
  }
  // Compact GI ejection port: high on the right side, not lowered or flared.
  const ejectionPort = slideAdd(roundedBox(0.0012, 0.012, 0.031, 2, 0.0005), dark, 0.0171, 0.004, -0.026);
  ejectionPort.name = 'm1911-ejection-port';
  const chamber = slideAdd(
    roundedBox(0.012, 0.0012, 0.026, 2, 0.0005),
    new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.34, metalness: 0.82 }),
    0.006,
    0.0172,
    -0.026,
  );
  chamber.name = 'm1911-chamber';
  // Barrel bushing ringing the muzzle at the slide face.
  const bushing = new THREE.Mesh(new THREE.TorusGeometry(0.0094, 0.0018, 8, 20), dark);
  bushing.position.set(0, 0.001, -slideLength / 2 - 0.003);
  bushing.name = 'm1911-barrel-bushing';
  slide.add(bushing);

  // Restrained GI sights: two small rear ears leave the aiming notch.
  const sightTop = config.sightHeight;
  const rearSightZ = slideLength / 2 - 0.019;
  const rearBase = slideAdd(
    roundedBox(0.019, 0.003, 0.011, 2, 0.001),
    sightMat,
    0,
    sightTop - slideY - 0.0065,
    rearSightZ,
  );
  rearBase.name = 'm1911-rear-sight';
  for (const side of [-1, 1]) {
    const rearEar = slideAdd(
      roundedBox(0.0042, 0.006, 0.007, 2, 0.001),
      sightMat,
      side * 0.0052,
      sightTop - slideY - 0.003,
      rearSightZ,
    );
    rearEar.name = 'm1911-rear-sight';
  }
  const frontBase = slideAdd(
    roundedBox(0.007, 0.0025, 0.012, 2, 0.0009),
    sightMat,
    0,
    sightTop - slideY - 0.00625,
    -slideLength / 2 + 0.019,
  );
  frontBase.name = 'm1911-front-sight';
  const frontBlade = slideAdd(
    roundedBox(0.0028, 0.006, 0.005, 2, 0.0008),
    sightMat,
    0,
    sightTop - slideY - 0.003,
    -slideLength / 2 + 0.017,
  );
  frontBlade.name = 'm1911-front-sight';
  group.add(slide);

  // Magazine inside the grip; the baseplate is a CHILD so it rides along
  // when the animator drops it (magDrop) and seats a fresh one (magIn).
  const [magW, magH, magD] = config.reloadAnim?.magSize ?? [0.024, 0.095, 0.036];
  const magazine = new THREE.Mesh(
    roundedBox(magW, magH, magD, 2, 0.003),
    new THREE.MeshStandardMaterial({
      color: config.reloadAnim?.magColor ?? 0x23262b,
      roughness: 0.4,
      metalness: 0.7,
    }),
  );
  magazine.position.set(0, -0.052, 0.069);
  magazine.rotation.x = -0.3;
  magazine.name = 'm1911-magazine';
  const baseplate = new THREE.Mesh(
    roundedBox(magW + 0.006, 0.008, magD + 0.006, 2, 0.003),
    dark,
  );
  baseplate.position.y = -magH / 2 + 0.001;
  magazine.add(baseplate);
  group.add(magazine);

  group.scale.setScalar(config.scale);
  const sightY = sightTop * config.scale;
  return {
    group,
    muzzlePosition: new THREE.Vector3(
      0,
      (slideY + 0.001) * config.scale,
      (-slideLength / 2 - 0.014) * config.scale,
    ),
    ejectionPosition: new THREE.Vector3(
      0.019 * config.scale,
      (slideY + 0.004) * config.scale,
      -0.026 * config.scale,
    ),
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
 * the Wonder Weapons (Ray Gun, Tesla), the M1911 pistol, the AK-47 and the
 * M60 GPMG; the generic long-gun fallback otherwise (a GLB that failed to
 * load). Single dispatch shared by the first-person WeaponView and the
 * world-space display models so both always build the same weapon.
 */
export function buildProceduralViewModel(view: ViewModelConfig): BuiltProcedural {
  if (view.teslaFrame === 'tesla') return buildTesla(view);
  if (view.energyColor !== undefined) return buildRaygun(view);
  if (view.frame === 'pistol') return buildPistol(view);
  if (view.frame === 'lmg') return buildM60(view);
  if (view.frame === 'ak47') return buildAk47(view);
  if (view.frame === 'm4a1') return buildM4A1(view);
  return buildProcedural(view);
}

/**
 * AK-47 (Type 3) view model built from primitives, detailed to buildM60
 * tier. The classic full-size silhouette: fixed wooden stock with the
 * sloped buttplate, stamped receiver with a rounded dust cover, two-piece
 * wooden handguard around a visible gas tube, full-length barrel with the
 * protected front post at the muzzle, tangent rear sight and the signature
 * 30-round 7.62 banana magazine. Stock and grip are extruded side profiles
 * so their outline reads exactly like the real furniture instead of a
 * rotated box. The magazine (ReloadAnimator 'rock' style) and the
 * right-flank charging handle are the live reload parts; every piece lives
 * under one root group so recoil/ADS/reload move the weapon as a unit.
 */
function buildAk47(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'ak47-root';
  // Blued near-black steel + satin reddish-brown birch laminate. The higher
  // roughness keeps both readable under the game's lighting without looking
  // like polished plastic in first person.
  const steel = new THREE.MeshStandardMaterial({
    color: config.bodyColor,
    roughness: 0.48,
    metalness: 0.76,
    envMapIntensity: 1.05,
  });
  const steelDark = new THREE.MeshStandardMaterial({
    color: 0x101216,
    roughness: 0.56,
    metalness: 0.68,
  });
  const wood = new THREE.MeshStandardMaterial({
    color: config.accentColor,
    roughness: 0.66,
    metalness: 0,
    envMapIntensity: 0.82,
  });
  const woodDark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.accentColor).multiplyScalar(0.62),
    roughness: 0.72,
    metalness: 0,
  });
  const magSteel = new THREE.MeshStandardMaterial({
    color: config.reloadAnim?.magColor ?? 0x2b2d30,
    roughness: 0.52,
    metalness: 0.62,
    envMapIntensity: 1,
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

  /**
   * Flat furniture from a side profile: the shape is authored in (x = weapon
   * length axis, positive toward the muzzle; y = height) and extruded along
   * the width. rotateY(π/2) maps shape +X to world -Z (the muzzle), so the
   * outline the player sees from the side is exactly the authored profile.
   */
  const extrudeProfile = (
    points: ReadonlyArray<readonly [number, number]>,
    thickness: number,
    material: THREE.Material,
    /** Optional width taper along world Z (wrist slimmer than the butt). */
    widthTaper?: { readonly zMin: number; readonly zMax: number; readonly atMin: number; readonly atMax: number },
    parent: THREE.Object3D = group,
  ): THREE.Mesh => {
    const shape = new THREE.Shape();
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.0015,
      bevelThickness: 0.0015,
      curveSegments: 1,
      steps: 1,
    });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-thickness / 2, 0, 0);
    if (widthTaper) {
      const positions = geometry.attributes.position;
      const span = widthTaper.zMax - widthTaper.zMin;
      for (let i = 0; i < positions.count; i++) {
        const t = Math.min(1, Math.max(0, (positions.getZ(i) - widthTaper.zMin) / span));
        positions.setX(i, positions.getX(i) * (widthTaper.atMin + (widthTaper.atMax - widthTaper.atMin) * t));
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geometry, material);
    parent.add(mesh);
    return mesh;
  };

  const sy = config.sightHeight;
  const boreY = 0.016;
  const receiverZ = 0.13; // receiver half-length (stamped receiver + trunnions)

  // --- Receiver: a tapered side profile under a separate arched top cover ---
  // The stepped front and narrower lower edge remove the generic rectangular
  // rifle-body read while retaining a cheap, closed low-poly volume.
  const receiver = extrudeProfile(
    [
      [-receiverZ, 0.017],
      [0.098, 0.017],
      [receiverZ, 0.007],
      [receiverZ, -0.028],
      [0.082, -0.041],
      [-0.096, -0.037],
      [-receiverZ, -0.024],
    ],
    0.04,
    steel,
  );
  receiver.name = 'ak47-receiver';
  const dustCover = add(
    new RoundedBoxGeometry(0.036, 0.024, 0.24, 3, 0.011),
    steel,
    0,
    0.024,
    -0.005,
  );
  dustCover.name = 'ak47-dust-cover';
  // Trunnions bridge receiver → barrel and receiver → stock (no gaps).
  add(new THREE.BoxGeometry(0.034, 0.046, 0.03), steel, 0, 0.002, -0.141).name =
    'ak47-front-trunnion';
  add(new THREE.BoxGeometry(0.034, 0.04, 0.03), steel, 0, -0.008, 0.135).name =
    'ak47-rear-trunnion';
  // Ejection opening and sparse rivets break up the right side in the hip
  // pose without relying on textures or increasing silhouette complexity.
  add(new RoundedBoxGeometry(0.0025, 0.016, 0.068, 1, 0.002), steelDark, 0.0215, 0.014, -0.034).name =
    'ak47-ejection-port';
  for (const z of [-0.105, 0.09]) {
    add(new THREE.CylinderGeometry(0.0028, 0.0028, 0.003, 6), steelDark, 0.022, -0.011, z, 0, Math.PI / 2)
      .name = 'ak47-receiver-rivet';
  }
  // Selector paddle on the right flank — an AK signature.
  add(new THREE.BoxGeometry(0.003, 0.02, 0.095), steelDark, 0.0215, 0.008, 0.03).name =
    'ak47-selector';

  // --- Fire control: trigger guard loop, blade, magazine well ---
  add(new THREE.BoxGeometry(0.026, 0.004, 0.07), steelDark, 0, -0.055, 0.035).name =
    'ak47-trigger-guard';
  add(new THREE.BoxGeometry(0.024, 0.024, 0.005), steelDark, 0, -0.044, 0.002, -0.1).name =
    'ak47-trigger-guard';
  add(new THREE.BoxGeometry(0.024, 0.024, 0.005), steelDark, 0, -0.044, 0.068, 0.1).name =
    'ak47-trigger-guard';
  add(new THREE.BoxGeometry(0.006, 0.02, 0.008), steelDark, 0, -0.044, 0.03, 0.18).name =
    'ak47-trigger';
  add(new THREE.BoxGeometry(0.034, 0.014, 0.052), steel, 0, -0.039, -0.048).name =
    'ak47-mag-well';

  // --- Barrel group: full-length 415 mm tube, nut, cleaning rod ---
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.38, 10), steel, 0, boreY, -0.34, Math.PI / 2).name =
    'ak47-barrel';
  add(
    new THREE.CylinderGeometry(0.0105, 0.0105, 0.024, 10),
    steelDark,
    0,
    boreY,
    -0.539,
    Math.PI / 2,
  ).name = 'ak47-muzzle-nut';
  add(
    new THREE.CylinderGeometry(0.0022, 0.0022, 0.36, 6),
    steelDark,
    0,
    0.004,
    -0.335,
    Math.PI / 2,
  ).name = 'ak47-cleaning-rod';
  const muzzleZ = -0.553;

  // --- Front sight: narrow collar, protected post and open sight picture ---
  add(new THREE.CylinderGeometry(0.013, 0.013, 0.022, 8), steel, 0, boreY, -0.505, Math.PI / 2).name =
    'ak47-front-sight-base';
  add(new THREE.BoxGeometry(0.004, 0.028, 0.004), steelDark, 0, sy - 0.014, -0.505).name =
    'ak47-front-sight-post';
  for (const side of [-1, 1]) {
    const wing = add(new THREE.BoxGeometry(0.003, 0.027, 0.012), steelDark, side * 0.0085, 0.05, -0.505, 0, side * -0.12);
    wing.name =
      'ak47-front-sight-wing';
  }

  // --- Gas system: barrel collar, diagonal bridge, tube and tangent block ---
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 8), steel, 0, boreY, -0.375, Math.PI / 2).name =
    'ak47-gas-block-collar';
  add(new THREE.BoxGeometry(0.018, 0.041, 0.018), steel, 0, 0.03, -0.375, -0.13).name =
    'ak47-gas-block';
  add(
    new THREE.CylinderGeometry(0.0085, 0.0085, 0.225, 8),
    steel,
    0,
    0.046,
    -0.2585,
    Math.PI / 2,
  ).name = 'ak47-gas-tube';
  add(new THREE.BoxGeometry(0.024, 0.042, 0.034), steel, 0, 0.028, -0.146).name =
    'ak47-rear-sight-block';
  // Tangent leaf: a rear-up ramp with the sliding bar and a real notch whose
  // gap tops out exactly on the sight line (ADS aligns sightY to center).
  add(new THREE.BoxGeometry(0.022, 0.005, 0.055), steelDark, 0, 0.056, -0.145, -0.14).name =
    'ak47-tangent-leaf';
  add(new THREE.BoxGeometry(0.018, 0.007, 0.015), steelDark, 0, 0.062, -0.126).name =
    'ak47-tangent-slider';
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.005, 0.008, 0.005), steelDark, side * 0.0065, sy - 0.004, -0.122)
      .name = 'ak47-tangent-ear';
  }

  // --- Two-piece wooden handguard with the AK's tapered palm swell ---
  const lowerHandguard = extrudeProfile(
    [
      [0.122, 0.018],
      [0.15, 0.024],
      [0.29, 0.026],
      [0.36, 0.015],
      [0.36, -0.016],
      [0.315, -0.023],
      [0.17, -0.027],
      [0.122, -0.015],
    ],
    0.048,
    wood,
  );
  lowerHandguard.name = 'ak47-handguard-lower';
  const upperHandguard = extrudeProfile(
    [
      [0.184, 0.058],
      [0.21, 0.064],
      [0.326, 0.061],
      [0.35, 0.052],
      [0.34, 0.035],
      [0.2, 0.035],
    ],
    0.038,
    wood,
  );
  upperHandguard.name = 'ak47-handguard-upper';
  // Two shallow laminate seams give the wood scale and direction while using
  // simple geometry and one shared material.
  for (const y of [-0.012, 0.011]) {
    add(new THREE.BoxGeometry(0.0018, 0.003, 0.165), woodDark, 0.025, y, -0.26).name =
      'ak47-handguard-laminate';
  }
  // Steel band clamping the handguard front (the gas block sits just ahead).
  add(new THREE.BoxGeometry(0.042, 0.03, 0.012), steel, 0, 0.006, -0.356).name =
    'ak47-handguard-band';

  // --- Fixed wooden stock: extruded Type-3 profile, not a brown prism ---
  // The comb rides well below the bore line (real AK cheek weld) and the
  // wrist tapers in width toward the butt — both keep the stock from
  // reading as a featureless slab in first person.
  const stock = extrudeProfile(
    [
      [-0.112, 0.005], // wrist top (embedded in the rear trunnion)
      [-0.18, -0.003], // comb
      [-0.326, -0.018], // buttplate top
      [-0.338, -0.083], // buttplate bottom
      [-0.323, -0.094], // toe
      [-0.185, -0.065], // lower belly
      [-0.112, -0.04], // wrist bottom
    ],
    0.036,
    wood,
    { zMin: 0.115, zMax: 0.338, atMin: 0.78, atMax: 1.04 },
  );
  stock.name = 'ak47-stock';
  add(new THREE.BoxGeometry(0.002, 0.003, 0.175), woodDark, 0.019, -0.038, 0.245, -0.08).name =
    'ak47-stock-laminate';
  // Steel buttplate cap following the profile's rear angle.
  add(new THREE.BoxGeometry(0.035, 0.068, 0.006), steelDark, 0, -0.055, 0.3335, -0.106).name =
    'ak47-buttplate';

  // --- Wooden pistol grip: swept back like the real bakelite/wood grip ---
  const grip = extrudeProfile(
    [
      [-0.066, -0.029], // top front
      [-0.074, -0.068], // front strap
      [-0.097, -0.116], // bottom front
      [-0.132, -0.119], // heel
      [-0.143, -0.105], // rear strap
      [-0.12, -0.031], // top rear
    ],
    0.028,
    wood,
  );
  grip.name = 'ak47-grip';
  add(new THREE.BoxGeometry(0.002, 0.055, 0.004), woodDark, 0.015, -0.078, 0.106, -0.28).name =
    'ak47-grip-groove';

  // --- Charging handle on the RIGHT flank (the animator racks it +Z) ---
  const handle = new THREE.Group();
  handle.name = 'ak47-charging-handle';
  handle.position.set(0.026, 0.006, -0.02);
  const handleStem = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.01, 0.014), steelDark);
  handleStem.position.x = 0.004;
  const handleKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.022, 8), steelDark);
  handleKnob.rotation.z = Math.PI / 2;
  handleKnob.position.x = 0.018;
  handle.add(handleStem, handleKnob);
  group.add(handle);

  // --- 30-round 7.62 magazine: one continuous curved shell rather than a
  // stack of boxes. The group origin remains at the feed lips so the shared
  // rock-and-lock animation and detached-magazine pool keep working. ---
  const magazine = new THREE.Group();
  magazine.name = 'ak47-magazine';
  const magH = config.reloadAnim?.magSize[1] ?? 0.16;
  const magScale = magH / 0.16;
  const magazineBody = extrudeProfile(
    [
      [-0.017 * magScale, 0.004 * magScale],
      [0.035 * magScale, 0.004 * magScale],
      [0.057 * magScale, -0.047 * magScale],
      [0.097 * magScale, -0.107 * magScale],
      [0.158 * magScale, -0.158 * magScale],
      [0.176 * magScale, -0.166 * magScale],
      [0.147 * magScale, -0.181 * magScale],
      [0.102 * magScale, -0.148 * magScale],
      [0.061 * magScale, -0.098 * magScale],
      [0.025 * magScale, -0.043 * magScale],
      [-0.012 * magScale, -0.018 * magScale],
    ],
    0.036,
    magSteel,
    undefined,
    magazine,
  );
  magazineBody.name = 'ak47-magazine-body';
  // Shallow transverse ribs retain the stamped-steel character and provide
  // readable motion during reloads without fragmenting the main silhouette.
  const ribPoses: ReadonlyArray<readonly [number, number, number]> = [
    [-0.036, -0.024, 0.18],
    [-0.076, -0.055, 0.38],
    [-0.118, -0.096, 0.58],
    [-0.153, -0.14, 0.78],
  ];
  for (const [y, z, tilt] of ribPoses) {
    const rib = new THREE.Mesh(new RoundedBoxGeometry(0.038, 0.006, 0.046, 1, 0.002), steelDark);
    rib.name = 'ak47-magazine-segment';
    rib.position.set(0, y * magScale, z * magScale);
    rib.rotation.x = tilt;
    magazine.add(rib);
  }
  const floorplate = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.006, 0.036), steelDark);
  floorplate.name = 'ak47-magazine-floorplate';
  floorplate.position.set(0, -0.173 * magScale, -0.15 * magScale);
  floorplate.rotation.x = 0.78;
  magazine.add(floorplate);
  // Home pose: feed lips inside the mag well, body raked slightly forward.
  magazine.position.set(0, -0.026, -0.048);
  magazine.rotation.x = 0.18;
  group.add(magazine);

  group.scale.setScalar(config.scale);
  const sightY = sy * config.scale;
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, boreY * config.scale, muzzleZ * config.scale),
    ejectionPosition: new THREE.Vector3(0.024 * config.scale, 0.006 * config.scale, 0),
    sightY,
    reloadParts: { magazine, handle },
  };
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

/** Resolves a detachable GLB magazine pose, with bounds fallback for legacy definitions. */
export function resolveGlbMagazinePose(
  view: ViewModelConfig,
  box: THREE.Box3,
  sightY: number,
): { readonly position: THREE.Vector3; readonly rotation: THREE.Euler } {
  const anim = view.reloadAnim;
  if (!anim) throw new Error('Reload animation config required for GLB magazine pose');
  const [x, y, z] = anim.magAnchor ?? [0, sightY * 0.35 - anim.magSize[1] * 0.35, box.min.z * 0.45];
  const [rx, ry, rz] = anim.magRotation ?? [0, 0, 0];
  return {
    position: new THREE.Vector3(x, y, z),
    rotation: new THREE.Euler(rx, ry, rz),
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

    const magazine: THREE.Object3D = new THREE.Mesh(
      new THREE.BoxGeometry(magW, magH, magD),
      new THREE.MeshStandardMaterial({
        color: anim.magColor,
        roughness: 0.45,
        metalness: 0.6,
      }),
    );
    const pose = resolveGlbMagazinePose(view, box, sightY);
    magazine.position.copy(pose.position);
    magazine.rotation.copy(pose.rotation);
    if (anim.style === 'rock' && !anim.magRotation) magazine.rotation.x = 0.22;
    magazine.name = `reload-magazine:${this.definition.id}`;
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

  /** Clears every transient pose when this view is hidden or the run resets. */
  reset(): void {
    this.animator?.reset();
    this.spring.reset();
    this.flashTime = 0;
    this.flash.visible = false;
    this.swayX = 0;
    this.swayY = 0;
    this.slideBlowback = 0;
    if (this.slide) this.slide.position.z = this.slideHomeZ;
    this.root.position.copy(this.hipPosition);
    this.root.rotation.set(0, 0, 0);
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
    if (this.slide) {
      if (weapon.state === 'reloading') {
        // ReloadAnimator is the sole slide owner during this state. Clearing
        // residual shot travel prevents a second, detached-looking cycle once
        // an empty reload returns the slide to battery.
        this.slideBlowback = 0;
      } else {
        this.slideBlowback = Math.max(0, this.slideBlowback - dt / SLIDE_RETURN_TIME);
        this.slide.position.z = this.slideHomeZ + this.slideBlowback * SLIDE_TRAVEL;
      }
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
