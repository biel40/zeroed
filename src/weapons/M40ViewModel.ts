import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cylinderZ, extrudeProfile, profileShape, shapeWidth, strut, type ProfilePoint } from './ProfileGeometry';
import { buildMagazineRounds, CARTRIDGES, cartridgeMaterials } from './MagazineRounds';
import { mouldedWebTexture } from './ProceduralTextures';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/** Width of the A5 stock at the grip and butt. */
const STOCK_WIDTH = 0.054;
/** The beavertail forend: wider than the action along its top, tapering to a narrower flat bottom. */
const FOREND_WIDTH = 0.058;
const FOREND_BOTTOM_WIDTH = 0.042;
/** Forend vertices above this y take the top width; the rest the bottom one. */
const FOREND_SHOULDER_Y = -0.03;
/** Forend vertices ahead of this z take the beavertail width. */
const FOREND_REAR_Z = -0.155;

/**
 * USMC M40A5 side profiles, shared by the first-person model and the
 * wall-buy silhouette so both always describe the same rifle. The trigger
 * sits at z = 0 and the bore at y = 0. Grip, trigger, magazine and bolt knob
 * sit where the L96's do, so both rifles share the right hand and reloads.
 */
export const M40_PROFILE = {
  /** McMillan A5: high beavertail forend, straight comb, vertical grip and a deep butt with its monopod hook. */
  stock: [
    [-0.488, -0.003], [-0.16, -0.003], [-0.15, -0.008], [0.076, -0.008], [0.086, -0.014],
    // The comb stays below the bolt path; the cheek piece covers it behind.
    [0.2, -0.014], [0.235, 0.006], [0.31, 0.008],
    [0.31, -0.134], [0.29, -0.137], [0.275, -0.137], [0.266, -0.125], [0.244, -0.123],
    [0.236, -0.131], [0.22, -0.129], [0.17, -0.11], [0.14, -0.108],
    [0.126, -0.14], [0.118, -0.156], [0.108, -0.162], [0.068, -0.16], [0.058, -0.15],
    [0.048, -0.1], [0.044, -0.062], [-0.13, -0.062], [-0.17, -0.058],
    [-0.46, -0.049], [-0.482, -0.044], [-0.492, -0.03],
  ] as readonly ProfilePoint[],
  /** Grey adjustable cheek-piece block wrapped over the comb, slanted at the front. */
  cheekPiece: [
    [0.216, -0.034], [0.216, 0.018], [0.236, 0.046], [0.3, 0.046], [0.308, 0.04], [0.308, -0.034],
  ] as readonly ProfilePoint[],
  /** Thick black spacer stack and recoil pad behind the stock shell. */
  butt: { shellZ: 0.31, spacerDepth: 0.024, padDepth: 0.022, centerY: -0.063, height: 0.144 },
  /** Badger bottom metal: guard bow (outline and finger opening). */
  triggerGuard: {
    outline: [
      [0.046, -0.058], [0.046, -0.074], [0.036, -0.09], [0.016, -0.095],
      [-0.016, -0.095], [-0.034, -0.088], [-0.044, -0.074], [-0.044, -0.058],
    ] as readonly ProfilePoint[],
    opening: { z: 0.002, y: -0.074, radiusZ: 0.034, radiusY: 0.014 },
  },
  /** Round Remington 700 receiver under a one-piece rail. */
  receiver: { rearZ: 0.078, frontZ: -0.152, radius: 0.0172, railTop: 0.025 },
  /** Long 5-25x56 scope, as [radius, z] lathe points from objective to eyepiece. */
  scope: [
    [0.029, -0.315], [0.0335, -0.315], [0.0345, -0.308], [0.0345, -0.252], [0.032, -0.24],
    [0.019, -0.2], [0.0175, -0.19], [0.0175, 0.012], [0.019, 0.02], [0.0235, 0.045],
    [0.0245, 0.052], [0.0245, 0.085], [0.0232, 0.09], [0.0232, 0.125], [0.0222, 0.13], [0.018, 0.13],
  ] as readonly ProfilePoint[],
  /** Lens planes, just inside each end of the scope body. */
  objectiveLens: { z: -0.312, radius: 0.029 },
  ocularLens: { z: 0.128, radius: 0.018 },
  /** Heavy free-floated barrel with a thread protector at the muzzle. */
  barrel: { rearZ: -0.155, muzzleZ: -0.785, rearRadius: 0.0135, muzzleRadius: 0.0108, protectorLength: 0.025 },
  magazine: { z: -0.082, depth: 0.07, bottomY: -0.111 },
  /** Turret saddle, its tall elevation turret, and the two tall rings along the tube. */
  turret: { z: -0.075, half: 0.022, elevationTop: 0.06 },
  ringZ: [-0.01, -0.142],
  ringRadius: 0.0205,
  /** Oversized tactical bolt knob rest position (right flank, swept back and down). */
  boltKnob: { x: 0.05, y: -0.014, z: 0.085, radius: 0.012 },
  /** Folded Harris bipod under the forend. */
  bipod: { mountZ: -0.43, footZ: -0.69, legY: -0.07 },
} as const;

/**
 * M40A5 view model: sage McMillan A5 stock in moulded web fibreglass with a
 * wide beavertail forend, a grey cheek-piece block and a thick spacer stack;
 * round Remington 700 action on a full rail, heavy barrel, long 56 mm scope
 * on tall rings with a high elevation turret and a big side-focus wheel,
 * Badger bottom metal with the detachable box magazine, oversized bolt knob
 * and a folded Harris bipod. The bolt pivots on the bore axis so the shared
 * ReloadAnimator lifts and racks it.
 */
export function buildM40(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'm40-root';
  const sightY = config.sightHeight;
  const polymer = new THREE.MeshStandardMaterial({ color: config.accentColor, map: mouldedWebTexture(), metalness: 0.02, roughness: 0.84 });
  const stipple = new THREE.MeshStandardMaterial({ color: new THREE.Color(config.accentColor).multiplyScalar(0.72), metalness: 0.02, roughness: 0.97 });
  const cheekPolymer = new THREE.MeshStandardMaterial({ color: 0x4b4f52, metalness: 0.06, roughness: 0.72 });
  const steel = new THREE.MeshStandardMaterial({ color: config.bodyColor, metalness: 0.74, roughness: 0.46, envMapIntensity: 1.3 });
  const boltSteel = new THREE.MeshStandardMaterial({ color: 0x74777a, metalness: 0.92, roughness: 0.24, envMapIntensity: 1.4 });
  const anodized = new THREE.MeshStandardMaterial({ color: 0x0e0f10, metalness: 0.5, roughness: 0.42, envMapIntensity: 1.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x111212, metalness: 0, roughness: 0.95 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x0b1620, emissive: 0x0a1a26, emissiveIntensity: 0.6, metalness: 0.25, roughness: 0.06, envMapIntensity: 2.2,
  });
  const magazineMaterial = new THREE.MeshStandardMaterial({ color: config.reloadAnim!.magColor, metalness: 0.7, roughness: 0.48 });
  const bore = new THREE.MeshBasicMaterial({ color: 0x030404 });

  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    parent: THREE.Object3D, x = 0, y = 0, z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `m40-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `m40-${name}`;
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };

  // Stock: one extrusion widened into the beavertail, stippled grip,
  // cheek-piece block with its knob, and the spacer-stack butt.
  const stock = assembly('stock');
  const shell = shapeWidth(
    extrudeProfile(profileShape(M40_PROFILE.stock), STOCK_WIDTH, 0.004),
    (y, z) => (z > FOREND_REAR_Z ? 1 : (y > FOREND_SHOULDER_Y ? FOREND_WIDTH : FOREND_BOTTOM_WIDTH) / STOCK_WIDTH),
  );
  add('stock-shell', shell, polymer, stock);
  for (const side of [-1, 1]) {
    const panel = profileShape([[0.062, -0.104], [0.1, -0.1], [0.112, -0.14], [0.106, -0.152], [0.07, -0.152]]);
    add('grip-stipple', extrudeProfile(panel, 0.003), stipple, stock, side * (STOCK_WIDTH / 2 + 0.001));
  }
  add('cheek-piece', extrudeProfile(profileShape(M40_PROFILE.cheekPiece), STOCK_WIDTH + 0.006, 0.004), cheekPolymer, stock);
  for (const side of [-1, 1]) {
    add('cheek-knob', new THREE.CylinderGeometry(0.011, 0.011, 0.008, 14).rotateZ(Math.PI / 2), anodized, stock, side * (STOCK_WIDTH / 2 + 0.006), 0.006, 0.262);
  }
  const { shellZ, spacerDepth, padDepth, centerY, height } = M40_PROFILE.butt;
  add('butt-spacers', new THREE.BoxGeometry(STOCK_WIDTH + 0.002, height - 0.004, spacerDepth), anodized, stock, 0, centerY, shellZ + spacerDepth / 2);
  add('recoil-pad', new RoundedBoxGeometry(STOCK_WIDTH + 0.004, height, padDepth, 2, 0.005), rubber, stock, 0, centerY, shellZ + spacerDepth + padDepth / 2);
  add('rear-sling-stud', new THREE.CylinderGeometry(0.004, 0.004, 0.012, 8), anodized, stock, 0, -0.14, 0.285);

  // Action: round receiver, recoil lug, rail, port, safety, trigger and bottom metal.
  const action = assembly('action');
  const receiver = M40_PROFILE.receiver;
  const receiverLength = receiver.rearZ - receiver.frontZ;
  const receiverZ = (receiver.rearZ + receiver.frontZ) / 2;
  add('receiver', cylinderZ(receiver.radius, receiver.radius, receiverLength, 20), steel, action, 0, 0, receiverZ);
  add('recoil-lug', cylinderZ(receiver.radius + 0.0015, receiver.radius + 0.0015, 0.006, 20), steel, action, 0, 0, receiver.frontZ - 0.003);
  const railHeight = receiver.railTop - receiver.radius + 0.001;
  add('rail', new THREE.BoxGeometry(0.021, railHeight, receiverLength - 0.004), steel, action, 0, receiver.railTop - railHeight / 2, receiverZ);
  for (let slot = 0; slot < 20; slot++) {
    add('rail-lug', new THREE.BoxGeometry(0.021, 0.004, 0.0055), steel, action, 0, receiver.railTop + 0.002, receiver.rearZ - 0.012 - slot * 0.0105);
  }
  add('ejection-port', new THREE.BoxGeometry(0.002, 0.014, 0.065), bore, action, receiver.radius - 0.0004, 0.004, -0.058);
  add('safety', new THREE.BoxGeometry(0.005, 0.009, 0.016), steel, action, 0.0145, -0.009, 0.09);
  const trigger = profileShape([[-0.002, -0.05], [0.006, -0.05], [0.004, -0.062], [0, -0.076], [-0.008, -0.082], [-0.004, -0.072], [-0.004, -0.058]]);
  add('trigger', extrudeProfile(trigger, 0.006), steel, action);
  const guard = M40_PROFILE.triggerGuard;
  const guardShape = profileShape(guard.outline);
  const guardOpening = new THREE.Path();
  guardOpening.absellipse(-guard.opening.z, guard.opening.y, guard.opening.radiusZ, guard.opening.radiusY, 0, Math.PI * 2, true);
  guardShape.holes.push(guardOpening);
  add('trigger-guard', extrudeProfile(guardShape, 0.014, 0.002), steel, action);
  add('magazine-release', new THREE.BoxGeometry(0.008, 0.01, 0.004), steel, action, 0, -0.066, -0.028);
  add('bottom-metal-tab', new THREE.BoxGeometry(0.03, 0.004, 0.022), steel, action, 0, -0.063, -0.13);

  // Heavy barrel, gently tapered, with its thread protector.
  const barrel = assembly('barrel');
  const { rearZ, muzzleZ, rearRadius, muzzleRadius, protectorLength } = M40_PROFILE.barrel;
  const barrelLength = rearZ - (muzzleZ + protectorLength);
  add('barrel-core', cylinderZ(rearRadius, muzzleRadius, barrelLength, 16), steel, barrel, 0, 0, rearZ - barrelLength / 2);
  add('thread-protector', cylinderZ(0.0118, 0.0118, protectorLength, 16), anodized, barrel, 0, 0, muzzleZ + protectorLength / 2);
  add('bore', new THREE.CircleGeometry(0.0045, 12).rotateY(Math.PI), bore, barrel, 0, 0, muzzleZ - 0.0002);

  // 5-25x56 scope: long body with a wide bell, high elevation turret,
  // windage, a big side-focus wheel, power-ring throw lever and tall rings.
  const scope = assembly('scope');
  const lathe = new THREE.LatheGeometry(M40_PROFILE.scope.map(([radius, z]) => new THREE.Vector2(radius, z)), 20);
  lathe.rotateX(Math.PI / 2);
  add('scope-body', lathe, anodized, scope, 0, sightY, 0);
  const { objectiveLens, ocularLens } = M40_PROFILE;
  add('objective-lens', new THREE.CircleGeometry(objectiveLens.radius, 20).rotateY(Math.PI), glass, scope, 0, sightY, objectiveLens.z);
  add('ocular-lens', new THREE.CircleGeometry(ocularLens.radius, 20), glass, scope, 0, sightY, ocularLens.z);
  for (const z of [0.06, 0.068, 0.076]) add('power-ring', cylinderZ(0.0256, 0.0256, 0.003, 20), anodized, scope, 0, sightY, z);
  add('throw-lever', new THREE.BoxGeometry(0.014, 0.006, 0.01), anodized, scope, 0.031, sightY + 0.004, 0.068);
  const turret = M40_PROFILE.turret;
  add('turret-housing', new RoundedBoxGeometry(turret.half * 2, turret.half * 2, 0.064, 2, 0.007), anodized, scope, 0, sightY, turret.z);
  const elevationBase = turret.half;
  const elevationCapHeight = 0.012;
  const elevationHeight = turret.elevationTop - elevationBase - elevationCapHeight;
  add('elevation-turret', new THREE.CylinderGeometry(0.0185, 0.0185, elevationHeight, 18), anodized, scope, 0, sightY + elevationBase + elevationHeight / 2, turret.z);
  add('elevation-cap', new THREE.CylinderGeometry(0.0195, 0.0195, elevationCapHeight, 18), anodized, scope, 0, sightY + turret.elevationTop - elevationCapHeight / 2, turret.z);
  add('windage-turret', new THREE.CylinderGeometry(0.017, 0.017, 0.022, 18).rotateZ(-Math.PI / 2), anodized, scope, turret.half + 0.011, sightY, turret.z);
  add('focus-hub', new THREE.CylinderGeometry(0.014, 0.014, 0.012, 16).rotateZ(Math.PI / 2), anodized, scope, -turret.half - 0.006, sightY, turret.z);
  add('focus-wheel', new THREE.CylinderGeometry(0.028, 0.028, 0.006, 24).rotateZ(Math.PI / 2), anodized, scope, -turret.half - 0.015, sightY, turret.z);
  const ringRadius = M40_PROFILE.ringRadius;
  const ringBaseHeight = sightY - ringRadius - receiver.railTop + 0.003;
  for (const z of M40_PROFILE.ringZ) {
    add('ring', cylinderZ(ringRadius, ringRadius, 0.018, 20), steel, scope, 0, sightY, z);
    add('ring-base', new THREE.BoxGeometry(0.026, ringBaseHeight, 0.02), steel, scope, 0, receiver.railTop + ringBaseHeight / 2, z);
    add('ring-clamp', new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 10).rotateZ(Math.PI / 2), steel, scope, -0.017, 0.033, z);
  }

  // Bolt: pivots on the bore axis so the animator's roll lifts the knob.
  const bolt = assembly('bolt', 0, 0, 0.03);
  add('bolt-body', cylinderZ(0.0088, 0.0088, 0.17), boltSteel, bolt, 0, 0, -0.05);
  add('bolt-shroud', cylinderZ(0.0105, 0.0125, 0.034), steel, bolt, 0, 0, 0.064);
  add('cocking-piece', cylinderZ(0.005, 0.006, 0.012), steel, bolt, 0, -0.002, 0.087);
  const knob = M40_PROFILE.boltKnob;
  const knobLocal = new THREE.Vector3(knob.x, knob.y, knob.z - bolt.position.z);
  add('bolt-handle-root', cylinderZ(0.0105, 0.0105, 0.014), steel, bolt, 0, 0, 0.035);
  add('bolt-handle', strut(new THREE.Vector3(0.008, 0, 0.035), knobLocal, 0.0038), steel, bolt);
  // Oversized tactical knob, drawn out along the handle.
  add('bolt-knob', new THREE.SphereGeometry(knob.radius, 14, 10).scale(1.45, 1, 1), steel, bolt, knobLocal.x, knobLocal.y, knobLocal.z);

  // Detachable box magazine, seated in the bottom metal ahead of the guard.
  const mag = M40_PROFILE.magazine;
  const magazine = assembly('magazine', 0, -0.058, mag.z);
  const visibleDrop = -0.058 - mag.bottomY;
  add('magazine-shell', new THREE.BoxGeometry(0.028, visibleDrop + 0.03, mag.depth), magazineMaterial, magazine, 0, (0.03 - visibleDrop) / 2);
  add('magazine-baseplate', new RoundedBoxGeometry(0.03, 0.007, mag.depth + 0.003, 1, 0.002), magazineMaterial, magazine, 0, -visibleDrop);

  // 7.62 rounds staggered between the feed lips, hidden while the magazine is seated.
  const caseRear = mag.depth / 2 - 0.001;
  const { brass, copper } = cartridgeMaterials();
  const rounds = buildMagazineRounds('m40-magazine-rounds', CARTRIDGES.nato762, [[0.0055, 0.035, caseRear], [-0.0055, 0.0275, caseRear]], brass, copper);
  magazine.add(rounds);
  mergeAssemblies(magazine);

  // Folded Harris bipod: clamp on the forend stud, legs forward under the barrel.
  const bipod = assembly('bipod');
  const { mountZ, footZ, legY } = M40_PROFILE.bipod;
  add('bipod-clamp', new RoundedBoxGeometry(0.048, 0.02, 0.03, 1, 0.003), anodized, bipod, 0, -0.06, mountZ);
  for (const side of [-1, 1]) {
    const x = side * 0.019;
    const upperEnd = mountZ - 0.12;
    add('bipod-upper-leg', cylinderZ(0.0065, 0.0065, mountZ - upperEnd, 10), anodized, bipod, x, legY, (mountZ + upperEnd) / 2);
    add('bipod-leg-collar', cylinderZ(0.0078, 0.0078, 0.012, 10), anodized, bipod, x, legY, upperEnd);
    add('bipod-lower-leg', cylinderZ(0.0046, 0.0046, upperEnd - footZ, 10), steel, bipod, x, legY, (upperEnd + footZ) / 2);
    add('bipod-foot', cylinderZ(0.0078, 0.007, 0.016, 10), rubber, bipod, x, legY, footZ - 0.008);
  }

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0, muzzleZ - 0.005).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.024, 0.006, -0.058).multiplyScalar(config.scale),
    sightY: sightY * config.scale,
    reloadParts: { magazine, handle: bolt, rounds },
  };
}
