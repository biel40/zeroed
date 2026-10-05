import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/** Side-profile point: [z, y] in meters. -Z is the muzzle, y = 0 the bore axis. */
type ProfilePoint = readonly [number, number];

/** The AI chassis stock is noticeably wider than the action it carries. */
const STOCK_WIDTH = 0.055;

/**
 * Accuracy International L96A1 side profiles, shared by the first-person
 * model and the wall-buy silhouette so both always describe the same rifle.
 * The trigger sits at z = 0; the stock runs from the forend tip to the butt.
 */
export const L96_PROFILE = {
  /** One-piece thumbhole stock: forend, magazine well, guard, grip, butt. */
  stock: [
    [-0.505, -0.008], [0.078, -0.008], [0.085, -0.014],
    // The comb stays below the bolt path; the cheek piece rises behind it.
    [0.2, -0.014], [0.235, 0.012], [0.25, 0.022], [0.33, 0.022], [0.338, 0.016],
    [0.338, -0.126], [0.325, -0.132], [0.27, -0.126], [0.215, -0.112], [0.17, -0.12],
    [0.122, -0.15], [0.112, -0.158], [0.066, -0.158], [0.058, -0.148], [0.046, -0.098],
    [-0.03, -0.098], [-0.042, -0.086], [-0.044, -0.058], [-0.12, -0.058], [-0.17, -0.054],
    [-0.46, -0.046], [-0.495, -0.04], [-0.508, -0.026],
  ] as readonly ProfilePoint[],
  /** Enclosed thumbhole between the near-vertical grip and the butt. */
  thumbhole: [
    [0.097, -0.036], [0.19, -0.034], [0.205, -0.046], [0.2, -0.09],
    [0.185, -0.098], [0.13, -0.124], [0.11, -0.118], [0.097, -0.07],
  ] as readonly ProfilePoint[],
  /** Moulded trigger-guard opening (ellipse center and radii). */
  triggerOpening: { z: 0.002, y: -0.071, radiusZ: 0.034, radiusY: 0.018 },
  /** Flat-sided steel action with its integral rail base. */
  receiver: [
    [0.078, -0.02], [0.078, 0.011], [0.07, 0.019], [-0.165, 0.019], [-0.178, 0.008], [-0.178, -0.02],
  ] as readonly ProfilePoint[],
  /** Fixed 6x42 telescopic sight, as [radius, z] lathe points from objective to eyepiece. */
  scope: [
    [0.0205, -0.247], [0.0248, -0.247], [0.0252, -0.242], [0.0252, -0.203], [0.0236, -0.196],
    [0.0158, -0.168], [0.015, -0.16], [0.015, 0.004], [0.0162, 0.008], [0.0162, 0.026],
    [0.0205, 0.048], [0.021, 0.056], [0.021, 0.094], [0.0198, 0.1], [0.0158, 0.1],
  ] as readonly ProfilePoint[],
  barrel: { rearZ: -0.185, muzzleZ: -0.817, rearRadius: 0.0125, muzzleRadius: 0.0105 },
  magazine: { z: -0.082, depth: 0.07, bottomY: -0.111 },
  /** Elevation turret and scope rings along the tube. */
  turretZ: -0.066,
  ringZ: [-0.012, -0.128],
  /** Bolt knob rest position (right flank, swept back and down). */
  boltKnob: { x: 0.05, y: -0.014, z: 0.085, radius: 0.0105 },
  /** Folded Harris-style bipod under the forend. */
  bipod: { mountZ: -0.43, footZ: -0.69, legY: -0.068 },
} as const;

/** Shape in the profile plane: x = -z so the extrusion maps back to +Z after rotateY. */
function profileShape(points: readonly ProfilePoint[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-points[0][0], points[0][1]);
  for (const [z, y] of points.slice(1)) shape.lineTo(-z, y);
  shape.closePath();
  return shape;
}

function profilePath(points: readonly ProfilePoint[]): THREE.Path {
  const path = new THREE.Path();
  path.moveTo(-points[0][0], points[0][1]);
  for (const [z, y] of points.slice(1)) path.lineTo(-z, y);
  path.closePath();
  return path;
}

/** Extrudes a side profile across X, centered on the bore plane, with a soft edge chamfer. */
function extrudeProfile(shape: THREE.Shape, width: number, bevel = 0): THREE.ExtrudeGeometry {
  const depth = width - bevel * 2;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 8,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

/** Cylinder along Z; the first radius is the rear (+Z) end. */
function cylinderZ(rearRadius: number, frontRadius: number, length: number, segments = 14): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(rearRadius, frontRadius, length, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Cylinder spanning two points (bolt arm, bipod braces). */
function strut(from: THREE.Vector3, to: THREE.Vector3, radius: number): THREE.CylinderGeometry {
  const direction = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 10);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return geometry;
}

/**
 * L96A1 view model: olive thumbhole stock, flat-sided action with a full
 * rail, free-floated heavy barrel, detachable box magazine, round bolt knob,
 * fixed 6x42 scope on two rings and a folded bipod. The bolt group pivots on
 * the bore axis so the shared ReloadAnimator lifts and racks it like the
 * real action; the magazine is the detachable reload part.
 */
export function buildL96(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'l96-root';
  const sightY = config.sightHeight;
  const polymer = new THREE.MeshStandardMaterial({ color: config.accentColor, metalness: 0.04, roughness: 0.82 });
  const stipple = new THREE.MeshStandardMaterial({ color: new THREE.Color(config.accentColor).multiplyScalar(0.72), metalness: 0.02, roughness: 0.96 });
  const steel = new THREE.MeshStandardMaterial({ color: config.bodyColor, metalness: 0.82, roughness: 0.38, envMapIntensity: 1.35 });
  const boltSteel = new THREE.MeshStandardMaterial({ color: 0x6b6f72, metalness: 0.92, roughness: 0.26, envMapIntensity: 1.4 });
  const anodized = new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.55, roughness: 0.42, envMapIntensity: 1.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x121314, metalness: 0, roughness: 0.94 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0c1822, emissive: 0x081722, emissiveIntensity: 0.6, metalness: 0.25, roughness: 0.06, envMapIntensity: 2.2,
  });
  const magazineMaterial = new THREE.MeshStandardMaterial({ color: config.reloadAnim!.magColor, metalness: 0.7, roughness: 0.48 });
  const bore = new THREE.MeshBasicMaterial({ color: 0x030404 });

  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    parent: THREE.Object3D, x = 0, y = 0, z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `l96-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `l96-${name}`;
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };

  // Stock: one extrusion with the thumbhole and trigger guard as real holes.
  const stock = assembly('stock');
  const stockShape = profileShape(L96_PROFILE.stock);
  stockShape.holes.push(profilePath(L96_PROFILE.thumbhole));
  const opening = L96_PROFILE.triggerOpening;
  const guardOpening = new THREE.Path();
  guardOpening.absellipse(-opening.z, opening.y, opening.radiusZ, opening.radiusY, 0, Math.PI * 2, true);
  stockShape.holes.push(guardOpening);
  add('stock-shell', extrudeProfile(stockShape, STOCK_WIDTH, 0.004), polymer, stock);
  for (const side of [-1, 1]) {
    const panel = profileShape([[0.062, -0.104], [0.094, -0.08], [0.106, -0.118], [0.106, -0.148], [0.07, -0.15]]);
    add('grip-stipple', extrudeProfile(panel, 0.003), stipple, stock, side * (STOCK_WIDTH / 2 + 0.001));
    const forend = profileShape([[-0.43, -0.018], [-0.2, -0.018], [-0.2, -0.042], [-0.43, -0.04]]);
    add('forend-stipple', extrudeProfile(forend, 0.003), stipple, stock, side * (STOCK_WIDTH / 2 + 0.001));
  }
  add('buttpad-spacer', new THREE.BoxGeometry(STOCK_WIDTH, 0.144, 0.005), anodized, stock, 0, -0.055, 0.3405);
  add('buttpad', new RoundedBoxGeometry(STOCK_WIDTH + 0.002, 0.15, 0.015, 2, 0.004), rubber, stock, 0, -0.055, 0.3505);
  add('rear-sling-stud', new THREE.CylinderGeometry(0.004, 0.004, 0.012, 8), steel, stock, 0, -0.131, 0.29);
  add('rear-sling-loop', new THREE.TorusGeometry(0.009, 0.0016, 5, 12).rotateY(Math.PI / 2), steel, stock, 0, -0.145, 0.29);

  // Action: flat-sided receiver, integral rail, port and safety.
  const action = assembly('action');
  add('receiver', extrudeProfile(profileShape(L96_PROFILE.receiver), 0.034, 0.0015), steel, action);
  add('barrel-nut', cylinderZ(0.0165, 0.0165, 0.014), steel, action, 0, 0, -0.185);
  add('rail', new THREE.BoxGeometry(0.022, 0.006, 0.215), steel, action, 0, 0.022, -0.06);
  for (let slot = 0; slot < 20; slot++) {
    add('rail-lug', new THREE.BoxGeometry(0.022, 0.004, 0.0055), steel, action, 0, 0.027, 0.04 - slot * 0.0105);
  }
  add('ejection-port', new THREE.BoxGeometry(0.002, 0.016, 0.07), bore, action, 0.0172, 0.004, -0.058);
  add('safety', new THREE.BoxGeometry(0.004, 0.011, 0.022), steel, action, 0.0295, -0.006, 0.09);
  const trigger = profileShape([[-0.002, -0.05], [0.006, -0.05], [0.004, -0.062], [0, -0.076], [-0.008, -0.082], [-0.004, -0.072], [-0.004, -0.058]]);
  add('trigger', extrudeProfile(trigger, 0.006), steel, action);

  // Free-floated heavy barrel, slightly tapered, with a thread protector.
  const barrel = assembly('barrel');
  const { rearZ, muzzleZ, rearRadius, muzzleRadius } = L96_PROFILE.barrel;
  const protectorLength = 0.022;
  const barrelLength = rearZ - (muzzleZ + protectorLength);
  add('barrel-core', cylinderZ(rearRadius, muzzleRadius, barrelLength, 16), steel, barrel, 0, 0, rearZ - barrelLength / 2);
  add('thread-protector', cylinderZ(0.0118, 0.0118, protectorLength, 16), anodized, barrel, 0, 0, muzzleZ + protectorLength / 2);
  add('bore', new THREE.CircleGeometry(0.0045, 12).rotateY(Math.PI), bore, barrel, 0, 0, muzzleZ - 0.0002);

  // Fixed 6x42 scope: lathe-turned body, coated lenses, turrets and rings.
  const scope = assembly('scope');
  const lathe = new THREE.LatheGeometry(L96_PROFILE.scope.map(([radius, z]) => new THREE.Vector2(radius, z)), 20);
  lathe.rotateX(Math.PI / 2);
  add('scope-body', lathe, anodized, scope, 0, sightY, 0);
  add('objective-lens', new THREE.CircleGeometry(0.0205, 20).rotateY(Math.PI), glass, scope, 0, sightY, -0.244);
  add('ocular-lens', new THREE.CircleGeometry(0.0158, 20), glass, scope, 0, sightY, 0.098);
  for (const z of [0.064, 0.072, 0.08]) add('ocular-knurl', cylinderZ(0.0216, 0.0216, 0.003, 20), anodized, scope, 0, sightY, z);
  const turretZ = L96_PROFILE.turretZ;
  add('turret-housing', new RoundedBoxGeometry(0.034, 0.034, 0.048, 2, 0.006), anodized, scope, 0, sightY, turretZ);
  const turret = new THREE.CylinderGeometry(0.0125, 0.0125, 0.016, 16);
  const turretCap = new THREE.CylinderGeometry(0.0135, 0.0135, 0.009, 16);
  add('elevation-turret', turret, anodized, scope, 0, sightY + 0.025, turretZ);
  add('elevation-cap', turretCap, anodized, scope, 0, sightY + 0.0375, turretZ);
  add('windage-turret', turret.clone().rotateZ(-Math.PI / 2), anodized, scope, 0.025, sightY, turretZ);
  add('windage-cap', turretCap.clone().rotateZ(-Math.PI / 2), anodized, scope, 0.0375, sightY, turretZ);
  const ringBaseHeight = sightY - 0.0182 - 0.025 + 0.003;
  for (const z of L96_PROFILE.ringZ) {
    add('ring', cylinderZ(0.0182, 0.0182, 0.014, 20), steel, scope, 0, sightY, z);
    add('ring-base', new THREE.BoxGeometry(0.024, ringBaseHeight, 0.016), steel, scope, 0, 0.025 + ringBaseHeight / 2, z);
    add('ring-clamp', new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 10).rotateZ(Math.PI / 2), steel, scope, -0.016, 0.034, z);
  }

  // Bolt: pivots on the bore axis so the animator's roll lifts the knob.
  const bolt = assembly('bolt', 0, 0, 0.03);
  add('bolt-body', cylinderZ(0.0092, 0.0092, 0.17), boltSteel, bolt, 0, 0, -0.05);
  add('bolt-shroud', cylinderZ(0.0112, 0.0122, 0.04), steel, bolt, 0, 0, 0.065);
  add('bolt-shroud-cap', cylinderZ(0.008, 0.008, 0.006), steel, bolt, 0, 0, 0.088);
  const knob = L96_PROFILE.boltKnob;
  const knobLocal = new THREE.Vector3(knob.x, knob.y, knob.z - bolt.position.z);
  add('bolt-handle-root', cylinderZ(0.0118, 0.0118, 0.016), steel, bolt, 0, 0, 0.03);
  add('bolt-handle', strut(new THREE.Vector3(0.008, 0, 0.03), knobLocal, 0.0042), steel, bolt);
  add('bolt-knob', new THREE.SphereGeometry(knob.radius, 14, 10), rubber, bolt, knobLocal.x, knobLocal.y, knobLocal.z);

  // Detachable box magazine, seated in the well just ahead of the guard.
  const mag = L96_PROFILE.magazine;
  const magazine = assembly('magazine', 0, -0.058, mag.z);
  const visibleDrop = -0.058 - mag.bottomY;
  add('magazine-shell', new THREE.BoxGeometry(0.028, visibleDrop + 0.03, mag.depth), magazineMaterial, magazine, 0, (0.03 - visibleDrop) / 2);
  for (const side of [-1, 1]) {
    add('magazine-rib', new THREE.BoxGeometry(0.0015, visibleDrop * 0.55, mag.depth * 0.7), magazineMaterial, magazine, side * 0.0145, -visibleDrop * 0.48);
  }
  add('magazine-baseplate', new RoundedBoxGeometry(0.031, 0.008, mag.depth + 0.004, 1, 0.002), magazineMaterial, magazine, 0, -visibleDrop);

  // Folded bipod: clamp under the forend stud, legs forward under the barrel.
  const bipod = assembly('bipod');
  const { mountZ, footZ, legY } = L96_PROFILE.bipod;
  add('bipod-clamp', new RoundedBoxGeometry(0.044, 0.018, 0.034, 1, 0.003), anodized, bipod, 0, -0.057, mountZ);
  for (const side of [-1, 1]) {
    const x = side * 0.0175;
    const upperEnd = mountZ - 0.135;
    add('bipod-upper-leg', cylinderZ(0.0062, 0.0062, mountZ - upperEnd, 10), anodized, bipod, x, legY, (mountZ + upperEnd) / 2);
    add('bipod-leg-collar', cylinderZ(0.0074, 0.0074, 0.01, 10), anodized, bipod, x, legY, upperEnd);
    add('bipod-lower-leg', cylinderZ(0.0047, 0.0047, upperEnd - footZ, 10), steel, bipod, x, legY, (upperEnd + footZ) / 2);
    add('bipod-foot', cylinderZ(0.0075, 0.0068, 0.016, 10), rubber, bipod, x, legY, footZ - 0.008);
    add('bipod-spring', strut(new THREE.Vector3(x * 0.5, -0.06, mountZ - 0.01), new THREE.Vector3(x, legY + 0.004, mountZ - 0.06), 0.0018), steel, bipod);
  }

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0, muzzleZ - 0.005).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.024, 0.006, -0.058).multiplyScalar(config.scale),
    sightY: sightY * config.scale,
    reloadParts: { magazine, handle: bolt },
  };
}
