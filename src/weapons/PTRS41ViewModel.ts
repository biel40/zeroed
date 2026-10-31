import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cylinderZ, extrudeProfile, profilePath, profileShape, strut, type ProfilePoint } from './ProfileGeometry';
import { steelWearTexture, woodGrainTexture } from './ProceduralTextures';
import { buildMagazineRounds, CARTRIDGES, cartridgeMaterials } from './MagazineRounds';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/**
 * PTRS-41 side profiles in meters, trigger at z = 0, bore at y = 0, muzzle
 * along -Z. The shoulder, grip, magazine well and charging handle sit where
 * the Barrett's do, so both share hand anchors and reload choreography; the
 * bare barrel runs well past the Barrett's brake.
 */
export const PTRS41_PROFILE = {
  /** Long boxy receiver with a slanted nose into the barrel collar. */
  receiver: {
    rearZ: 0.17, frontZ: -0.3, width: 0.058,
    points: [[0.17, 0.03], [0.15, 0.036], [-0.255, 0.036], [-0.3, 0.024], [-0.3, -0.026], [-0.275, -0.045], [0.17, -0.045]] as readonly ProfilePoint[],
  },
  /** Trigger housing under the receiver, between the grip and the magazine. */
  triggerHousing: [[0.075, -0.044], [-0.05, -0.044], [-0.05, -0.058], [-0.035, -0.064], [0.06, -0.064], [0.075, -0.056]] as readonly ProfilePoint[],
  /** Birch buttstock: thin wrist off the receiver tang, deepening to the butt. */
  stock: [
    [0.165, 0.028], [0.405, 0.022], [0.418, 0.014], [0.418, -0.128], [0.402, -0.138],
    [0.31, -0.108], [0.225, -0.07], [0.165, -0.05],
  ] as readonly ProfilePoint[],
  grip: [
    [0.022, -0.058], [0.062, -0.058], [0.104, -0.172], [0.092, -0.188],
    [0.052, -0.184], [0.034, -0.14], [0.01, -0.075],
  ] as readonly ProfilePoint[],
  barrel: { rearZ: -0.29, muzzleZ: -1.06, rearRadius: 0.0165, frontRadius: 0.0135 },
  /** Gas piston cylinder above the rear half of the barrel. */
  gasCylinder: { y: 0.031, radius: 0.0105, rearZ: -0.3, frontZ: -0.66 },
  /** Box brake with two windows through each flank. */
  brake: { rearZ: -1.06, frontZ: -1.135, halfWidth: 0.026, halfHeight: 0.021, windowZ: [-1.075, -1.112] as readonly number[], webZ: -1.0935 },
  /** Bipod clamped to the barrel, legs folded forward along it. */
  bipod: { pivotZ: -0.53, footZ: -0.86 },
  frontSightZ: -1.035,
} as const;

const WINDOW_HALF_LENGTH = 0.013;
const WINDOW_HALF_HEIGHT = 0.013;
const BORE_RADIUS = 0.009;

/** Brake baffle across the bore: a plate around an open bore aperture. */
function brakeBaffle(halfWidth: number, halfHeight: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, -halfHeight);
  shape.lineTo(halfWidth, -halfHeight);
  shape.lineTo(halfWidth, halfHeight);
  shape.lineTo(-halfWidth, halfHeight);
  shape.closePath();
  const bore = new THREE.Path();
  bore.absarc(0, 0, BORE_RADIUS, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 }).translate(0, 0, -depth / 2);
}

/** Hollow tube along Z: no end caps, so lenses and bores stay visible inside it. */
function sleeveZ(rearRadius: number, frontRadius: number, length: number, segments = 20): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rearRadius, frontRadius, length, segments, 1, true).rotateX(Math.PI / 2);
}

/**
 * Soviet PTRS-41 anti-tank rifle, the Station 33 look of the Barrett .50:
 * dark steel receiver, birch stock and grip with a padded butt, integral
 * five-round magazine housing below the receiver, a very long bare barrel
 * with the gas cylinder over its rear half, a folded bipod with round pans,
 * front sight and the box muzzle brake. A slim PU-style optic on a left
 * side mount keeps the Barrett's scoped aim. Magazine, rounds and bolt
 * handle are the same reload pivots the Barrett exposes.
 */
export function buildPTRS41(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'ptrs41-root';
  const P = PTRS41_PROFILE;
  const wear = steelWearTexture();
  const steel = new THREE.MeshStandardMaterial({ color: config.bodyColor, metalness: 0.66, roughness: 0.74, roughnessMap: wear, envMapIntensity: 1.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x16181a, metalness: 0.55, roughness: 0.66, roughnessMap: wear, envMapIntensity: 1.2 });
  const silver = new THREE.MeshStandardMaterial({ color: 0x6d7377, metalness: 0.9, roughness: 0.34, envMapIntensity: 1.4 });
  const wood = new THREE.MeshPhysicalMaterial({
    color: config.accentColor, map: woodGrainTexture(), metalness: 0, roughness: 0.6,
    clearcoat: 0.3, clearcoatRoughness: 0.42, envMapIntensity: 0.9,
  });
  const leather = new THREE.MeshStandardMaterial({ color: 0x2a1d14, metalness: 0, roughness: 0.9, bumpMap: wear, bumpScale: 0.0002 });
  const magazineSteel = new THREE.MeshStandardMaterial({ color: config.reloadAnim!.magColor, metalness: 0.58, roughness: 0.72, roughnessMap: wear, envMapIntensity: 1.3 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x101c26, emissive: 0x081722, emissiveIntensity: 0.5, metalness: 0.25, roughness: 0.05, envMapIntensity: 2.2,
  });
  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `ptrs41-${name}`;
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };
  const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material,
    x = 0, y = 0, z = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const rounded = { segments: 2, keepOutline: true } as const;
  const screwHead = (radius: number): THREE.BufferGeometry => new THREE.CylinderGeometry(radius, radius, 0.0025, 10).rotateZ(Math.PI / 2);

  // Birch stock on a steel tang, steel buttplate and a thick padded cushion.
  const stock = assembly('stock');
  add(stock, extrudeProfile(profileShape(P.stock), 0.048, 0.004, rounded), wood);
  add(stock, new RoundedBoxGeometry(0.056, 0.078, 0.03, 1, 0.004), steel, 0, -0.01, 0.172);
  add(stock, new THREE.BoxGeometry(0.05, 0.15, 0.004), steel, 0, -0.057, 0.42);
  add(stock, new RoundedBoxGeometry(0.058, 0.164, 0.04, 3, 0.012), leather, 0, -0.057, 0.44);
  for (const y of [-0.115, -0.085, -0.055, -0.025, 0.005]) {
    add(stock, new THREE.BoxGeometry(0.059, 0.003, 0.03), dark, 0, y, 0.44);
  }
  for (const side of [-1, 1]) add(stock, screwHead(0.004), silver, side * 0.028, -0.01, 0.172);

  // Receiver: slab sides, raised bolt cover, trigger housing, grip and guard.
  const R = P.receiver;
  const action = assembly('receiver');
  add(action, extrudeProfile(profileShape(R.points), R.width, 0.002, rounded), steel);
  add(action, new RoundedBoxGeometry(0.044, 0.012, 0.33, 1, 0.003), steel, 0, 0.04, -0.045);
  add(action, extrudeProfile(profileShape(P.triggerHousing), 0.04, 0.002, rounded), dark);
  add(action, extrudeProfile(profileShape(P.grip), 0.032, 0.003, rounded), wood);
  const guard = profileShape([[-0.043, -0.061], [0.026, -0.061], [0.041, -0.11], [-0.032, -0.11]]);
  guard.holes.push(profilePath([[-0.033, -0.073], [0.018, -0.073], [0.025, -0.1], [-0.025, -0.1]]));
  add(action, extrudeProfile(guard, 0.012, 0.001, rounded), dark);
  add(action, extrudeProfile(profileShape([
    [-0.01, -0.062], [-0.004, -0.062], [-0.007, -0.083], [-0.017, -0.095], [-0.022, -0.093], [-0.013, -0.079],
  ]), 0.006), silver);
  // Right flank: ejection port and the slot the bolt handle rides in.
  add(action, new THREE.BoxGeometry(0.002, 0.024, 0.11), dark, R.width / 2 + 0.0005, 0.014, -0.09);
  add(action, new THREE.BoxGeometry(0.002, 0.006, 0.12), dark, R.width / 2 + 0.0005, 0.004, -0.06);
  // Rear sight leaf at the receiver nose, below the optic's line.
  add(action, new RoundedBoxGeometry(0.022, 0.01, 0.03, 1, 0.002), dark, 0, 0.041, -0.268);
  add(action, new THREE.BoxGeometry(0.016, 0.004, 0.042), steel, 0, 0.048, -0.27);
  // Safety lever and screw heads on both flanks.
  const safety = add(action, new RoundedBoxGeometry(0.004, 0.008, 0.026, 1, 0.002), silver, R.width / 2 + 0.002, -0.03, 0.03);
  safety.rotation.x = -0.3;
  for (const side of [-1, 1]) {
    for (const z of [0.13, -0.02, -0.22]) add(action, screwHead(0.0042), silver, side * (R.width / 2 + 0.0008), -0.02, z);
  }

  // Long bare barrel: receiver collar, gas cylinder and block, clamp band and front sight.
  const barrel = assembly('barrel');
  const B = P.barrel;
  add(barrel, cylinderZ(B.rearRadius, B.frontRadius, B.rearZ - B.muzzleZ, 24), steel, 0, 0, (B.rearZ + B.muzzleZ) / 2);
  add(barrel, cylinderZ(0.026, 0.023, 0.04, 24), dark, 0, 0, R.frontZ - 0.015);
  const G = P.gasCylinder;
  add(barrel, cylinderZ(G.radius, G.radius, G.rearZ - G.frontZ, 16), steel, 0, G.y, (G.rearZ + G.frontZ) / 2);
  add(barrel, new RoundedBoxGeometry(0.036, 0.06, 0.04, 1, 0.006), dark, 0, 0.012, G.frontZ);
  add(barrel, cylinderZ(0.009, 0.009, 0.022, 14), silver, 0, G.y, G.frontZ - 0.03);
  add(barrel, new RoundedBoxGeometry(0.04, 0.064, 0.014, 1, 0.004), dark, 0, 0.011, -0.47);
  add(barrel, cylinderZ(0.0175, 0.0175, 0.022, 20), dark, 0, 0, P.frontSightZ);
  add(barrel, new THREE.BoxGeometry(0.003, 0.02, 0.004), dark, 0, 0.026, P.frontSightZ);
  for (const side of [-1, 1]) add(barrel, new THREE.BoxGeometry(0.003, 0.022, 0.012), dark, side * 0.009, 0.026, P.frontSightZ);

  // Box brake: flanks pierced by two windows, roof, floor and baffles around an open bore.
  const brake = assembly('muzzle-brake');
  const K = P.brake;
  const flank = profileShape([[K.rearZ, K.halfHeight], [K.frontZ, K.halfHeight], [K.frontZ, -K.halfHeight], [K.rearZ, -K.halfHeight]]);
  for (const z of K.windowZ) {
    flank.holes.push(profilePath([
      [z + WINDOW_HALF_LENGTH, WINDOW_HALF_HEIGHT], [z - WINDOW_HALF_LENGTH, WINDOW_HALF_HEIGHT],
      [z - WINDOW_HALF_LENGTH, -WINDOW_HALF_HEIGHT], [z + WINDOW_HALF_LENGTH, -WINDOW_HALF_HEIGHT],
    ]));
  }
  const brakeLength = K.rearZ - K.frontZ;
  for (const side of [-1, 1]) {
    add(brake, extrudeProfile(flank, 0.004, 0, { curveSegments: 1 }), steel, side * (K.halfWidth - 0.002));
    add(brake, new THREE.BoxGeometry(K.halfWidth * 2, 0.004, brakeLength), steel, 0, side * (K.halfHeight - 0.002), (K.rearZ + K.frontZ) / 2);
  }
  for (const z of [K.rearZ - 0.003, K.webZ, K.frontZ + 0.003]) add(brake, brakeBaffle(K.halfWidth - 0.004, K.halfHeight - 0.004, 0.006), steel, 0, 0, z);
  add(brake, sleeveZ(0.018, 0.018, 0.014), dark, 0, 0, K.rearZ + 0.006);

  // Slim PU-style optic in two rings on a side rail clamped to the left flank.
  const sightY = config.sightHeight;
  const scope = assembly('scope');
  add(scope, sleeveZ(0.0125, 0.0125, 0.19), dark, 0, sightY, -0.025);
  add(scope, sleeveZ(0.0125, 0.0165, 0.035), dark, 0, sightY, -0.1375);
  add(scope, sleeveZ(0.0165, 0.0165, 0.012), steel, 0, sightY, -0.161);
  add(scope, sleeveZ(0.016, 0.0125, 0.03), dark, 0, sightY, 0.085);
  add(scope, sleeveZ(0.017, 0.017, 0.014), leather, 0, sightY, 0.107);
  add(scope, new THREE.CircleGeometry(0.0158, 20).rotateY(Math.PI), glass, 0, sightY, -0.163);
  add(scope, new THREE.CircleGeometry(0.0145, 20), glass, 0, sightY, 0.104);
  add(scope, new THREE.CylinderGeometry(0.009, 0.009, 0.014, 16), dark, 0, sightY + 0.017, -0.025);
  add(scope, new THREE.CylinderGeometry(0.009, 0.009, 0.014, 16).rotateZ(Math.PI / 2), dark, -0.017, sightY, -0.025);
  for (const z of [-0.09, 0.045]) {
    add(scope, sleeveZ(0.0148, 0.0148, 0.012), steel, 0, sightY, z);
    const leg = add(scope, new THREE.BoxGeometry(0.007, 0.036, 0.012), steel, -0.017, sightY - 0.026, z);
    leg.rotation.z = -0.45;
  }
  add(scope, new RoundedBoxGeometry(0.008, 0.012, 0.16, 1, 0.002), steel, -0.026, 0.042, -0.022);
  add(scope, new RoundedBoxGeometry(0.005, 0.034, 0.12, 1, 0.0015), dark, -R.width / 2 - 0.002, 0.02, -0.022);

  // Bolt handle on the right flank, a ball knob on a short arm.
  const handle = assembly('charging-handle', 0, 0, -0.025);
  add(handle, new RoundedBoxGeometry(0.03, 0.009, 0.012, 1, 0.003), silver, 0.04, 0.004);
  add(handle, new THREE.SphereGeometry(0.0095, 14, 10), dark, 0.058, 0.004);

  // Integral magazine housing: sloped front, hinged floorplate with its catch.
  const magazine = assembly('magazine', 0, -0.095, -0.142);
  add(magazine, extrudeProfile(profileShape([
    [0.068, 0.05], [-0.066, 0.05], [-0.066, -0.04], [-0.03, -0.09], [0.064, -0.09], [0.068, -0.084],
  ]), 0.05, 0.0025, rounded), magazineSteel);
  add(magazine, new RoundedBoxGeometry(0.054, 0.007, 0.098, 1, 0.002), dark, 0, -0.092, 0.016);
  add(magazine, new THREE.CylinderGeometry(0.004, 0.004, 0.056, 10).rotateZ(Math.PI / 2), silver, 0, -0.086, -0.034);
  add(magazine, new RoundedBoxGeometry(0.02, 0.012, 0.008, 1, 0.002), silver, 0, -0.08, 0.071);
  for (const side of [-1, 1]) add(magazine, new RoundedBoxGeometry(0.002, 0.07, 0.1, 1, 0.0008), magazineSteel, side * 0.0255, -0.01, 0.005);
  const { brass, copper } = cartridgeMaterials();
  const rounds = buildMagazineRounds('ptrs41-magazine-rounds', CARTRIDGES.bmg50, [[0.008, 0.052, 0.066], [-0.008, 0.041, 0.066]], brass, copper);
  magazine.add(rounds);
  mergeAssemblies(magazine);

  // Folded bipod: barrel clamp, two legs along the barrel and round pan feet.
  const bipod = assembly('bipod');
  const D = P.bipod;
  add(bipod, cylinderZ(0.021, 0.021, 0.03, 20), dark, 0, 0, D.pivotZ);
  add(bipod, new RoundedBoxGeometry(0.044, 0.014, 0.026, 1, 0.003), dark, 0, -0.024, D.pivotZ);
  add(bipod, new THREE.CylinderGeometry(0.004, 0.004, 0.05, 8).rotateZ(Math.PI / 2), silver, 0, -0.026, D.pivotZ);
  for (const side of [-1, 1]) {
    add(bipod, strut(new THREE.Vector3(side * 0.016, -0.028, D.pivotZ), new THREE.Vector3(side * 0.022, -0.036, D.footZ), 0.0055), steel);
    add(bipod, cylinderZ(0.02, 0.02, 0.004, 20), steel, side * 0.022, -0.036, D.footZ - 0.004);
  }

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0, K.frontZ).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.035, 0.014, -0.09).multiplyScalar(config.scale),
    sightY: sightY * config.scale,
    reloadParts: { magazine, handle, rounds },
  };
}
