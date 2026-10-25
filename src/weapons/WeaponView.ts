import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyViewModelDepth } from '../rendering/ViewModelDepth';
import { clamp, damp } from '../utils/math';
import type { MagazineDropPool } from './MagazineDrop';
import { buildAk47 } from './AK47ViewModel';
import { buildL96 } from './L96ViewModel';
import { buildM4A1 } from './M4A1ViewModel';
import { buildMP5 } from './MP5ViewModel';
import { buildVector } from './VectorViewModel';
import { buildM60 } from './M60ViewModel';
import { buildRayGun } from './RayGunViewModel';
import { BOLT_REAR_FRACTION, HANDLE_TRAVEL, ReloadAnimator, type ReloadParts } from './ReloadAnimator';
import { SpringRecoil } from './SpringRecoil';
import { WeaponHands } from './WeaponHands';
import type { Weapon } from './Weapon';
import type { ReloadPhase, ViewModelConfig, WeaponDefinition } from './WeaponTypes';

const FLASH_DURATION = 0.045;
const ENERGY_FLASH_DURATION = 0.065;
/** Bore line as a fraction of the sight line height (rifle geometry heuristic). */
const BORE_HEIGHT_FRACTION = 0.65;
/** Pistol slide blowback: travel in meters and full return time in seconds. */
const SLIDE_TRAVEL = 0.026;
const SLIDE_RETURN_TIME = 0.09;
const SWAY_PER_PIXEL = 0.0016;
const SWAY_LIMIT = 0.02;
const SWAY_SMOOTHING = 9;

let flashTexture: THREE.CanvasTexture | null = null;
let plasmaFlashTexture: THREE.DataTexture | null = null;

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
 * Pure white-to-alpha plasma burst + corona ring texture so energy weapons
 * (Ray Gun, Tesla) tint cleanly to their neon bolt color without orange bleed.
 */
function getPlasmaFlashTexture(): THREE.DataTexture {
  if (plasmaFlashTexture) return plasmaFlashTexture;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = (y + 0.5) / size * 2 - 1;
      const r = Math.hypot(nx, ny);
      const angle = Math.atan2(ny, nx);
      const rays = 0.82 + 0.18 * Math.cos(angle * 6);
      const core = Math.exp(-r * r * 9.5);
      const ringDelta = (r - 0.52) / 0.12;
      const ring = Math.exp(-(ringDelta * ringDelta)) * 0.65;
      const alpha = Math.max(0, Math.min(1, (core + ring) * rays * (1 - THREE.MathUtils.smoothstep(r, 0.72, 1))));
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(alpha * 255);
    }
  }
  plasmaFlashTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  plasmaFlashTexture.magFilter = THREE.LinearFilter;
  plasmaFlashTexture.minFilter = THREE.LinearFilter;
  plasmaFlashTexture.needsUpdate = true;
  return plasmaFlashTexture;
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
  /** Emissive map scrolled over time so the energy visibly flows. */
  energyFlow?: THREE.Texture;
  /** Reload parts the animator drives (magazine, feed cover, handle, cell). */
  reloadParts?: Partial<ReloadParts>;
  /** Pistol slide: kicks back per shot and is racked by the reload charge. */
  slide?: THREE.Object3D;
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
  const slideFrontZ = -slideLength / 2;
  const boreY = slideY + 0.001;
  const muzzleZ = slideFrontZ - 0.0016;
  const boreRadius = config.barrelRadius * 0.66;
  const crownDepth = 0.003;

  // --- Frame (static): one continuous forged profile instead of stacked boxes. ---
  const receiver = extrudeProfile(
    [
      [-0.096, 0.017],
      [0.065, 0.017],
      [0.065, -0.005],
      [0.027, -0.005],
      [0.016, -0.017],
      [0.004, -0.015],
      [-0.084, -0.015],
      [-0.096, -0.003],
    ],
    0.031,
    frameMat,
  );
  receiver.name = 'm1911-receiver';
  const dustCover = add(roundedBox(0.029, 0.013, 0.052, 3, 0.005), frameMat, 0, 0.0005, -0.039);
  dustCover.name = 'm1911-dust-cover';

  // A real negative space gives the guard its oval side silhouette.
  const guardShape = new THREE.Shape();
  guardShape.absellipse(0.014, -0.037, 0.03, 0.024, 0, Math.PI * 2, false);
  const guardOpening = new THREE.Path();
  guardOpening.absellipse(0.014, -0.037, 0.0255, 0.0195, 0, Math.PI * 2, true);
  guardShape.holes.push(guardOpening);
  const triggerGuard = extrudeShape(guardShape, 0.018, frameMat);
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

  // Hollow barrel, almost flush with the bushing. Its hidden length keeps it
  // connected to the action when the slide locks open during an empty reload.
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x45494d, roughness: 0.38, metalness: 0.85 });
  const barrelSection = new THREE.Shape();
  barrelSection.absarc(0, 0, config.barrelRadius, 0, Math.PI * 2, false);
  const barrelBore = new THREE.Path();
  barrelBore.absarc(0, 0, boreRadius, 0, Math.PI * 2, true);
  barrelSection.holes.push(barrelBore);
  const barrel = add(
    new THREE.ExtrudeGeometry(barrelSection, { depth: config.barrelLength - crownDepth, bevelEnabled: false, curveSegments: 12 }),
    dark,
    0,
    boreY,
    muzzleZ + crownDepth,
  );
  barrel.name = 'm1911-barrel';
  const muzzleCrown = add(
    new THREE.LatheGeometry([
      new THREE.Vector2(boreRadius, crownDepth),
      new THREE.Vector2(boreRadius, 0.0007),
      new THREE.Vector2(boreRadius + 0.0007, 0),
      new THREE.Vector2(config.barrelRadius - 0.0005, 0),
      new THREE.Vector2(config.barrelRadius, 0.0005),
      new THREE.Vector2(config.barrelRadius, crownDepth),
    ], 24),
    barrelMat,
    0,
    boreY,
    muzzleZ,
    Math.PI / 2,
  );
  muzzleCrown.name = 'm1911-muzzle-crown';
  const boreShadow = add(
    new THREE.CircleGeometry(boreRadius, 24),
    new THREE.MeshBasicMaterial({ color: 0x050607 }),
    0,
    boreY,
    muzzleZ + 0.02,
  );
  boreShadow.name = 'm1911-bore-shadow';
  boreShadow.rotation.y = Math.PI;

  // --- SLIDE GROUP — everything in here moves with the blowback / racking ---
  const slide = new THREE.Group();
  slide.name = 'm1911-slide';
  slide.position.set(0, slideY, 0);
  // Flat machined flanks with the rounded crown of a Government slide.
  const slideSection = new THREE.Shape();
  slideSection.moveTo(-0.0175, -0.017);
  slideSection.lineTo(0.0175, -0.017);
  slideSection.lineTo(0.0175, 0.001);
  slideSection.absellipse(0, 0.001, 0.0175, 0.016, 0, Math.PI, false);
  slideSection.closePath();
  const barrelOpening = new THREE.Path();
  barrelOpening.absarc(0, 0.001, config.barrelRadius + 0.0004, 0, Math.PI * 2, true);
  slideSection.holes.push(barrelOpening);
  const slideGeometry = new THREE.ExtrudeGeometry(slideSection, { depth: slideLength, bevelEnabled: false, steps: 1, curveSegments: 12 });
  slideGeometry.translate(0, 0, slideFrontZ);
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

  // Rounded spring tunnel under the nose, ending ahead of the trigger guard.
  // The plug and bushing travel with the slide; the barrel stays on the frame.
  const springTunnelSection = new THREE.Shape();
  springTunnelSection.moveTo(-0.0175, -0.017);
  springTunnelSection.lineTo(0.0175, -0.017);
  springTunnelSection.quadraticCurveTo(0.015, -0.027, 0, -0.027);
  springTunnelSection.quadraticCurveTo(-0.015, -0.027, -0.0175, -0.017);
  springTunnelSection.closePath();
  const springTunnel = slideAdd(
    new THREE.ExtrudeGeometry(springTunnelSection, { depth: 0.066, bevelEnabled: false, curveSegments: 8 }),
    slideMat,
    0,
    0,
    slideFrontZ,
  );
  springTunnel.name = 'm1911-spring-tunnel';
  const recoilPlug = slideAdd(new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 24), dark, 0, 0.006 - slideY, slideFrontZ + 0.002);
  recoilPlug.rotation.x = Math.PI / 2;
  recoilPlug.name = 'm1911-recoil-spring-plug';
  const rearPlate = slideAdd(roundedBox(0.022, 0.026, 0.002, 2, 0.001), slideMat, 0, 0, slideLength / 2 - 0.0009);
  rearPlate.name = 'm1911-firing-pin-stop';

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
  // Thin machined bushing with a lower retaining skirt, rather than a torus.
  const bushingSection = new THREE.Shape();
  bushingSection.absarc(0, 0, 0.0112, -Math.PI / 4, Math.PI * 1.25, false);
  bushingSection.lineTo(-0.008, -0.014);
  bushingSection.quadraticCurveTo(0, -0.017, 0.008, -0.014);
  bushingSection.closePath();
  const bushingOpening = new THREE.Path();
  bushingOpening.absarc(0, 0, config.barrelRadius + 0.0002, 0, Math.PI * 2, true);
  bushingSection.holes.push(bushingOpening);
  const bushing = slideAdd(
    new THREE.ExtrudeGeometry(bushingSection, { depth: 0.0014, bevelEnabled: false, curveSegments: 12 }),
    dark,
    0,
    0.001,
    slideFrontZ - 0.0012,
  );
  bushing.name = 'm1911-barrel-bushing';

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

  // Full-length single-stack magazine, a group so its parts ride along when
  // the animator drops it (magDrop) and seats a fresh one (magIn). It is
  // raked with the grip, 3.5 mm behind the front strap, its top up under
  // the slide; the tube bottom runs level with the grip bottom so the
  // baseplate sits flush under the front of the grip, ahead of the
  // mainspring housing.
  const [magW, magH, magD] = config.reloadAnim?.magSize ?? [0.015, 0.105, 0.034];
  const gripRake = 0.3;
  const levelDrop = Math.tan(gripRake) * (magD / 2);
  const magazine = new THREE.Group();
  magazine.name = 'm1911-magazine';
  magazine.position.set(0, -0.0399, 0.0555);
  magazine.rotation.x = -gripRake;
  const magazineMat = new THREE.MeshStandardMaterial({
    color: config.reloadAnim?.magColor ?? 0x23262b,
    roughness: 0.4,
    metalness: 0.7,
  });
  // Side profile in the magazine frame as [front-back, height]; the profile
  // helper lays its first coordinate along -Z. The feed lips dip at the front.
  const tube = extrudeProfile(
    [
      [-magD / 2, magH / 2],
      [magD / 2, magH / 2 - 0.004],
      [magD / 2, -magH / 2 + levelDrop],
      [-magD / 2, -magH / 2 - levelDrop],
    ],
    magW,
    magazineMat,
  );
  tube.name = 'm1911-magazine-tube';
  magazine.add(tube);
  // Witness holes down the rear of both flanks, as on a GI magazine.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.0014, 10), dark);
      hole.name = 'm1911-magazine-witness-hole';
      hole.position.set(side * (magW / 2 + 0.0002), 0.03 - i * 0.0095, 0.008);
      hole.rotation.y = side * Math.PI / 2;
      magazine.add(hole);
    }
  }
  // Level baseplate, a hair wider than the tube, just proud of the grip.
  const plateThickness = 0.005;
  const baseplate = new THREE.Mesh(
    roundedBox(magW + 0.004, plateThickness, magD / Math.cos(gripRake) + 0.004, 2, 0.0015),
    dark,
  );
  baseplate.name = 'm1911-magazine-baseplate';
  baseplate.rotation.x = gripRake;
  baseplate.position.set(
    0,
    -magH / 2 - (plateThickness / 2) * Math.cos(gripRake),
    -(plateThickness / 2) * Math.sin(gripRake),
  );
  magazine.add(baseplate);
  // Top round on the feed lips, hidden inside the frame once seated: an
  // emptied magazine drops without it, the fresh one shows it on the way in.
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8893c, roughness: 0.3, metalness: 0.9 });
  const round = new THREE.Group();
  round.name = 'm1911-magazine-round';
  round.position.set(0, magH / 2 + 0.0035, 0.002);
  const roundCase = new THREE.Mesh(new THREE.CylinderGeometry(0.0057, 0.0057, 0.022, 12), brass);
  roundCase.rotation.x = Math.PI / 2;
  roundCase.position.z = 0.004;
  const roundBullet = new THREE.Mesh(new THREE.SphereGeometry(0.0057, 12, 8), brass);
  roundBullet.scale.z = 1.4;
  roundBullet.position.z = -0.007;
  round.add(roundCase, roundBullet);
  magazine.add(round);
  group.add(magazine);

  group.scale.setScalar(config.scale);
  const sightY = sightTop * config.scale;
  return {
    group,
    muzzlePosition: new THREE.Vector3(
      0,
      boreY * config.scale,
      (muzzleZ - 0.0003) * config.scale,
    ),
    ejectionPosition: new THREE.Vector3(
      0.019 * config.scale,
      (slideY + 0.004) * config.scale,
      -0.026 * config.scale,
    ),
    sightY,
    slide,
    reloadParts: { magazine, handle: slide, rounds: round },
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
 * the Wonder Weapons (Ray Gun, Tesla), the M1911 pistol, the AK-47, the
 * M4A1, the MP5A3, the Vector, the L96A1 and the M60 GPMG; the generic long-gun fallback otherwise
 * (a GLB that failed to load). Single dispatch shared by the first-person WeaponView and the
 * world-space display models so both always build the same weapon.
 */
export function buildProceduralViewModel(view: ViewModelConfig): BuiltProcedural {
  if (view.teslaFrame === 'tesla') return buildTesla(view);
  if (view.energyColor !== undefined) return buildRayGun(view);
  if (view.frame === 'pistol') return buildPistol(view);
  if (view.frame === 'lmg') return buildM60(view);
  if (view.frame === 'ak47') return buildAk47(view);
  if (view.frame === 'm4a1') return buildM4A1(view);
  if (view.frame === 'mp5') return buildMP5(view);
  if (view.frame === 'vector') return buildVector(view);
  if (view.frame === 'l96') return buildL96(view);
  return buildProcedural(view);
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
  /** Hand targets: grips, reload choreography and the action hand. */
  readonly hands: WeaponHands;
  private flashTime = 0;
  private bobPhase = 0;
  private swayX = 0;
  private swayY = 0;
  private pulseTime = 0;
  private readonly energyMaterials: THREE.MeshStandardMaterial[] = [];
  private energyFlow: THREE.Texture | null = null;
  /** 1 on a shot, decaying: the energy parts flare as the bolt leaves. */
  private energySurge = 0;
  private slide: THREE.Object3D | null = null;
  private slideHomeZ = 0;
  private slideBlowback = 0;
  private boltEjected = false;
  /** Wired by Game: bolt-action weapons eject their case mid-cycle, not on the shot. */
  onBoltEject: (() => void) | null = null;

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
      this.energyFlow = built.energyFlow ?? null;
      if (built.slide) {
        this.slide = built.slide;
        this.slideHomeZ = built.slide.position.z;
      }
      reloadParts = built.reloadParts ?? {};
    }
    this.root.add(this.muzzle, this.ejectionPort);

    this.hands = new WeaponHands(
      view.hands,
      this.root,
      { magazine: reloadParts.magazine ?? null, handle: reloadParts.handle ?? null },
      view.reloadAnim ?? null,
      definition.boltAction,
      // ADS centers the camera on the sight line: root y = sightY.
      view.ads[1] - this.adsPosition.y,
    );
    if (view.reloadAnim) {
      this.animator = new ReloadAnimator(
        view.reloadAnim,
        {
          magazine: reloadParts.magazine ?? null,
          handle: reloadParts.handle ?? null,
          cover: reloadParts.cover ?? null,
          rounds: reloadParts.rounds ?? null,
        },
        dropPool,
      );
    }

    const isEnergyFlash = view.energyColor !== undefined;
    const flashMaterial = new THREE.MeshBasicMaterial({
      map: isEnergyFlash ? getPlasmaFlashTexture() : getFlashTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    // Energy weapons tint the muzzle flash to their bolt color.
    if (view.energyColor !== undefined) flashMaterial.color.setHex(view.energyColor);
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(isEnergyFlash ? 0.25 : 0.22, isEnergyFlash ? 0.25 : 0.22),
      flashMaterial,
    );
    this.flash.name = 'muzzle-flash';
    if (isEnergyFlash) {
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xeaffd6,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const plasmaRing = new THREE.Mesh(new THREE.RingGeometry(0.038, 0.068, 16), ringMat);
      plasmaRing.name = 'muzzle-plasma-ring';
      plasmaRing.position.z = -0.008;
      this.flash.add(plasmaRing);
    }
    this.flash.visible = false;
    this.muzzle.add(this.flash);

    this.root.position.copy(this.hipPosition);
    this.root.visible = false;
    applyViewModelDepth(this.root);
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
    // The cached GLB also feeds world display models (wall buys, Mystery Box,
    // remote avatars): own a copy so the view-model depth patch stays here.
    model = model.clone(true);
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
    });
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
    const isEnergy = this.definition.view.energyColor !== undefined;
    this.flashTime = isEnergy ? ENERGY_FLASH_DURATION : FLASH_DURATION;
    this.flash.scale.setScalar(isEnergy ? 0.95 + Math.random() * 0.35 : 0.8 + Math.random() * 0.5);
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flash.visible = true;
    this.spring.kick();
    // Pistol slide cycles with every shot.
    if (this.slide) this.slideBlowback = 1;
    this.energySurge = 1;
  }

  /** Clears every transient pose when this view is hidden or the run resets. */
  reset(): void {
    this.animator?.reset();
    this.hands.reset();
    this.spring.reset();
    this.flashTime = 0;
    this.flash.visible = false;
    this.swayX = 0;
    this.swayY = 0;
    this.slideBlowback = 0;
    this.energySurge = 0;
    this.boltEjected = false;
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
    lowering = 0,
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
    this.hands.update(weapon);
    if (weapon.state !== 'cycling') this.boltEjected = false;
    switch (weapon.state) {
      case 'reloading': {
        if (this.animator) {
          this.root.position.y += this.animator.bodyDip;
          this.root.rotation.x += this.animator.bodyTilt;
          this.root.rotation.z += this.animator.bodyRoll;
          this.root.rotation.y += this.animator.bodyYaw;
          this.root.position.add(this.animator.bodyShift);
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
        // The spent case leaves the port when the bolt reaches the rear.
        if (!this.boltEjected && weapon.stateProgress >= BOLT_REAR_FRACTION) {
          this.boltEjected = true;
          this.onBoltEject?.();
        }
        break;
      }
      default:
        break;
    }

    // 6. Mode-owned melee (knife): dip down-left, muzzle low, out of the
    // knife arm's path. Layered on top so reloads and ADS blends survive.
    if (lowering > 0) {
      this.root.position.x -= lowering * 0.03;
      this.root.position.y -= lowering * 0.2;
      this.root.position.z += lowering * 0.04;
      this.root.rotation.x -= lowering * 0.5;
      this.root.rotation.z += lowering * 0.3;
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
        // The last round locks the slide open, where the empty reload picks it up.
        const locked = weapon.ammoInMagazine === 0 ? HANDLE_TRAVEL : 0;
        this.slide.position.z = this.slideHomeZ + Math.max(this.slideBlowback * SLIDE_TRAVEL, locked);
      }
    }

    // Energy parts pulse gently, flare on each shot and surge during the
    // reload spin-up; the plasma map drifts so the energy reads as flowing.
    if (this.energyMaterials.length > 0) {
      this.pulseTime += dt;
      this.energySurge *= Math.exp(-9 * dt);
      const pulse = 1.35 + Math.sin(this.pulseTime * 5) * 0.45
        + (this.animator?.chargeGlow ?? 0) * 2.2 + this.energySurge * 2.5;
      for (const material of this.energyMaterials) material.emissiveIntensity = pulse;
      if (this.energyFlow) this.energyFlow.offset.y = (this.pulseTime * 0.22) % 1;
    }

    // Inside a real scope you would not see the rifle body at all.
    this.root.visible = !(this.definition.scoped && ads > 0.86);
  }
}
