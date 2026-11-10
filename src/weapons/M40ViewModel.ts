import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cylinderZ, extrudeProfile, profileShape, strut, type ProfilePoint } from './ProfileGeometry';
import { buildMagazineRounds, CARTRIDGES, cartridgeMaterials } from './MagazineRounds';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/** The McMillan A5 is a slim fibreglass stock, a touch narrower than the AI chassis. */
const STOCK_WIDTH = 0.054;

/**
 * USMC M40A5 side profiles, shared by the first-person model and the
 * wall-buy silhouette so both always describe the same rifle. The trigger
 * sits at z = 0 and the bore at y = 0. Grip, trigger, magazine and bolt knob
 * sit where the L96's do, so both rifles share hand anchors and reloads.
 */
export const M40_PROFILE = {
  /** McMillan A5: beavertail forend, straight comb, vertical grip and a flat butt with its monopod hook. */
  stock: [
    [-0.488, -0.008], [0.076, -0.008], [0.086, -0.014],
    // The comb stays below the bolt path; the cheek piece rides above it.
    [0.2, -0.014], [0.235, 0.006], [0.33, 0.008],
    [0.33, -0.132], [0.31, -0.135], [0.285, -0.135], [0.276, -0.124], [0.252, -0.122],
    [0.244, -0.13], [0.225, -0.128], [0.17, -0.11], [0.14, -0.108],
    [0.126, -0.14], [0.118, -0.156], [0.108, -0.162], [0.068, -0.16], [0.058, -0.15],
    [0.048, -0.1], [0.044, -0.062], [-0.13, -0.062], [-0.17, -0.058],
    [-0.46, -0.049], [-0.482, -0.044], [-0.492, -0.03],
  ] as readonly ProfilePoint[],
  /** Adjustable cheek-piece saddle raised on two posts over the comb. */
  cheekPiece: [
    [0.21, 0.016], [0.214, 0.026], [0.228, 0.034], [0.32, 0.034], [0.328, 0.028], [0.328, 0.016],
  ] as readonly ProfilePoint[],
  cheekPostZ: [0.24, 0.3],
  /** Spacer stack and recoil pad behind the stock shell. */
  butt: { spacerZ: 0.336, padZ: 0.352, centerY: -0.062, height: 0.142 },
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
  /** Schmidt & Bender 3-12x50, as [radius, z] lathe points from objective to eyepiece. */
  scope: [
    [0.0255, -0.268], [0.0295, -0.268], [0.0302, -0.262], [0.0302, -0.214], [0.0282, -0.205],
    [0.0185, -0.172], [0.017, -0.164], [0.017, 0.008], [0.0185, 0.016], [0.0228, 0.036],
    [0.0232, 0.044], [0.0232, 0.072], [0.0218, 0.078], [0.0218, 0.108], [0.0205, 0.113], [0.0168, 0.113],
  ] as readonly ProfilePoint[],
  /** Heavy free-floated barrel with a thread protector at the muzzle. */
  barrel: { rearZ: -0.155, muzzleZ: -0.785, rearRadius: 0.0135, muzzleRadius: 0.0115, protectorLength: 0.025 },
  magazine: { z: -0.082, depth: 0.07, bottomY: -0.111 },
  /** Turret housing and scope rings along the tube. */
  turretZ: -0.07,
  ringZ: [-0.004, -0.138],
  /** Tactical bolt knob rest position (right flank, swept back and down). */
  boltKnob: { x: 0.05, y: -0.014, z: 0.085, radius: 0.0105 },
  /** Folded Harris bipod under the forend. */
  bipod: { mountZ: -0.43, footZ: -0.69, legY: -0.07 },
} as const;

/**
 * M40A5 view model: OD green McMillan A5 stock with a raised cheek piece and
 * spacer stack, round Remington 700 action on a full rail, heavy barrel,
 * long 50 mm scope on Badger rings, metal bottom metal with the detachable
 * box magazine, tactical bolt knob and a folded Harris bipod. The bolt pivots
 * on the bore axis so the shared ReloadAnimator lifts and racks it.
 */
export function buildM40(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'm40-root';
  const sightY = config.sightHeight;
  const polymer = new THREE.MeshStandardMaterial({ color: config.accentColor, metalness: 0.03, roughness: 0.86 });
  const stipple = new THREE.MeshStandardMaterial({ color: new THREE.Color(config.accentColor).multiplyScalar(0.7), metalness: 0.02, roughness: 0.97 });
  const cheekPolymer = new THREE.MeshStandardMaterial({ color: 0x4a4e50, metalness: 0.05, roughness: 0.8 });
  const steel = new THREE.MeshStandardMaterial({ color: config.bodyColor, metalness: 0.78, roughness: 0.44, envMapIntensity: 1.3 });
  const boltSteel = new THREE.MeshStandardMaterial({ color: 0x74777a, metalness: 0.92, roughness: 0.24, envMapIntensity: 1.4 });
  const anodized = new THREE.MeshStandardMaterial({ color: 0x101113, metalness: 0.55, roughness: 0.4, envMapIntensity: 1.2 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x131414, metalness: 0, roughness: 0.95 });
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

  // Stock: one extrusion, stippled grip panels, cheek saddle and spacer-stack butt.
  const stock = assembly('stock');
  add('stock-shell', extrudeProfile(profileShape(M40_PROFILE.stock), STOCK_WIDTH, 0.004), polymer, stock);
  for (const side of [-1, 1]) {
    const panel = profileShape([[0.062, -0.104], [0.1, -0.1], [0.112, -0.14], [0.106, -0.152], [0.07, -0.152]]);
    add('grip-stipple', extrudeProfile(panel, 0.003), stipple, stock, side * (STOCK_WIDTH / 2 + 0.001));
  }
  add('cheek-piece', extrudeProfile(profileShape(M40_PROFILE.cheekPiece), STOCK_WIDTH - 0.006, 0.004), cheekPolymer, stock);
  for (const z of M40_PROFILE.cheekPostZ) add('cheek-post', new THREE.CylinderGeometry(0.004, 0.004, 0.01, 8), anodized, stock, 0, 0.012, z);
  add('cheek-knob', new THREE.CylinderGeometry(0.008, 0.008, 0.01, 12).rotateZ(Math.PI / 2), anodized, stock, -STOCK_WIDTH / 2 - 0.004, -0.004, 0.27);
  const { spacerZ, padZ, centerY, height } = M40_PROFILE.butt;
  add('butt-spacers', new THREE.BoxGeometry(STOCK_WIDTH, height - 0.004, 0.012), anodized, stock, 0, centerY, spacerZ);
  add('recoil-pad', new RoundedBoxGeometry(STOCK_WIDTH + 0.002, height, 0.02, 2, 0.005), rubber, stock, 0, centerY, padZ);
  add('rear-sling-stud', new THREE.CylinderGeometry(0.004, 0.004, 0.012, 8), anodized, stock, 0, -0.138, 0.305);

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
  add('thread-protector', cylinderZ(0.0122, 0.0122, protectorLength, 16), anodized, barrel, 0, 0, muzzleZ + protectorLength / 2);
  add('bore', new THREE.CircleGeometry(0.0045, 12).rotateY(Math.PI), bore, barrel, 0, 0, muzzleZ - 0.0002);

  // 3-12x50 scope: long lathe-turned body, coated lenses, three turrets and two rings.
  const scope = assembly('scope');
  const lathe = new THREE.LatheGeometry(M40_PROFILE.scope.map(([radius, z]) => new THREE.Vector2(radius, z)), 20);
  lathe.rotateX(Math.PI / 2);
  add('scope-body', lathe, anodized, scope, 0, sightY, 0);
  add('objective-lens', new THREE.CircleGeometry(0.0255, 20).rotateY(Math.PI), glass, scope, 0, sightY, -0.265);
  add('ocular-lens', new THREE.CircleGeometry(0.0168, 20), glass, scope, 0, sightY, 0.111);
  for (const z of [0.05, 0.058, 0.066]) add('power-ring', cylinderZ(0.0238, 0.0238, 0.003, 20), anodized, scope, 0, sightY, z);
  const turretZ = M40_PROFILE.turretZ;
  add('turret-housing', new RoundedBoxGeometry(0.038, 0.038, 0.056, 2, 0.006), anodized, scope, 0, sightY, turretZ);
  add('elevation-turret', new THREE.CylinderGeometry(0.0145, 0.0145, 0.02, 16), anodized, scope, 0, sightY + 0.029, turretZ);
  add('elevation-cap', new THREE.CylinderGeometry(0.0155, 0.0155, 0.012, 16), anodized, scope, 0, sightY + 0.045, turretZ);
  add('windage-turret', new THREE.CylinderGeometry(0.0135, 0.0135, 0.016, 16).rotateZ(-Math.PI / 2), anodized, scope, 0.027, sightY, turretZ);
  add('parallax-knob', new THREE.CylinderGeometry(0.017, 0.017, 0.012, 16).rotateZ(Math.PI / 2), anodized, scope, -0.025, sightY, turretZ);
  const ringRadius = 0.0195;
  const ringBaseHeight = sightY - ringRadius - receiver.railTop + 0.003;
  for (const z of M40_PROFILE.ringZ) {
    add('ring', cylinderZ(ringRadius, ringRadius, 0.016, 20), steel, scope, 0, sightY, z);
    add('ring-base', new THREE.BoxGeometry(0.024, ringBaseHeight, 0.018), steel, scope, 0, receiver.railTop + ringBaseHeight / 2, z);
    add('ring-clamp', new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 10).rotateZ(Math.PI / 2), steel, scope, -0.016, 0.032, z);
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
  add('bolt-knob', new THREE.SphereGeometry(knob.radius, 14, 10).scale(1.35, 1, 1), steel, bolt, knobLocal.x, knobLocal.y, knobLocal.z);

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
  add('bipod-clamp', new RoundedBoxGeometry(0.046, 0.02, 0.03, 1, 0.003), anodized, bipod, 0, -0.06, mountZ);
  for (const side of [-1, 1]) {
    const x = side * 0.018;
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
