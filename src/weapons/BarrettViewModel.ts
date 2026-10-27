import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cylinderZ, extrudeProfile, profilePath, profileShape, strut, type ProfilePoint } from './ProfileGeometry';
import { buildBarrettBipod, buildBarrettScope } from './BarrettAttachments';
import { steelWearTexture } from './ProceduralTextures';
import { buildMagazineRounds, CARTRIDGES, cartridgeMaterials } from './MagazineRounds';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/**
 * M82A1 side profiles in meters, trigger at z = 0, bore at y = 0, muzzle
 * along -Z. The upper receiver runs flat-topped from the butt to the end of
 * the perforated barrel shroud; the lower receiver carries the magazine
 * well, the grip and the solid buttstock.
 */
export const BARRETT_PROFILE = {
  /** Rear half of the upper receiver, over the bolt carrier. */
  upper: [[0.17, 0.05], [-0.255, 0.05], [-0.255, -0.03], [0.162, -0.03], [0.17, -0.022]] as readonly ProfilePoint[],
  /** Right-flank ejection port, open through to the carrier. */
  ejectionPort: [[-0.146, 0.025], [-0.022, 0.025], [-0.022, -0.012], [-0.146, -0.012]] as readonly ProfilePoint[],
  /** Lower receiver: magazine well, trigger housing and the root of the stock. */
  lower: [
    [0.17, -0.026], [-0.25, -0.026], [-0.25, -0.058], [-0.228, -0.074], [-0.062, -0.074],
    [-0.046, -0.086], [0.028, -0.086], [0.06, -0.062], [0.17, -0.056],
  ] as readonly ProfilePoint[],
  /** Solid M82A1 buttstock: level top under the cheek rest, the belly sloping down to a tall butt. */
  stock: [
    [0.16, 0.038], [0.432, 0.038], [0.446, 0.026], [0.446, -0.138], [0.432, -0.152],
    [0.33, -0.142], [0.22, -0.098], [0.16, -0.07],
  ] as readonly ProfilePoint[],
  /** Recessed side panel moulded into each flank of the stock. */
  stockPanel: [[0.215, 0.018], [0.405, 0.018], [0.405, -0.118], [0.33, -0.112], [0.245, -0.078], [0.215, -0.06]] as readonly ProfilePoint[],
  /** Raised rubber cheek rest on the stock comb. */
  cheekRest: [[0.215, 0.037], [0.4, 0.037], [0.408, 0.05], [0.398, 0.058], [0.235, 0.058], [0.215, 0.05]] as readonly ProfilePoint[],
  grip: [
    [0.025, -0.067], [0.067, -0.067], [0.108, -0.174], [0.096, -0.19],
    [0.055, -0.184], [0.037, -0.143], [0.012, -0.082],
  ] as readonly ProfilePoint[],
  /** Barrel shroud: thin side plates from the receiver to the barrel exit. */
  shroud: { rearZ: -0.18, frontZ: -0.63, topY: 0.05, bottomY: -0.054, width: 0.074 },
  /** Large cooling holes down each shroud plate, then a row of smaller ones below. */
  shroudHoles: { firstZ: -0.222, pitch: 0.044, count: 9, y: 0.003, radius: 0.0135 },
  shroudSmallHoles: { firstZ: -0.244, pitch: 0.044, count: 8, y: -0.034, radius: 0.0055 },
  /** Full-length Picatinny rail on the flat top. */
  rail: { rearZ: 0.15, frontZ: -0.6, y: 0.055 },
  barrel: { rearZ: -0.21, exitZ: -0.643, muzzleZ: -0.883, radius: 0.0205 },
  /** Two-chamber arrowhead brake: span, half width and height of its plates. */
  brake: { rearZ: -0.883, frontZ: -0.997, halfWidth: 0.046, halfHeight: 0.029 },
  /** Prominent takedown pins joining upper and lower, front and rear. */
  pinZ: [-0.232, 0.142] as readonly number[],
  /** Bolt carrier riding inside the receiver, seen through the ejection port. */
  carrier: { rearZ: -0.012, frontZ: -0.152, y: 0.006, halfWidth: 0.016, halfHeight: 0.017 },
  /** Rivet rows of the stamped receiver: along the upper/lower seam and the shroud plates' lower flange. */
  seamRivets: { y: -0.021, firstZ: 0.12, pitch: 0.043, count: 9 },
  shroudRivets: { y: -0.046, firstZ: -0.2, pitch: 0.054, count: 8 },
  /** Stamped stiffening rib running along each shroud plate between the hole rows. */
  shroudRib: { y: -0.017, height: 0.004 },
} as const;

/** Concave longitudinal flutes cut into the exposed barrel, not raised bars. */
function flutedBarrel(): THREE.BufferGeometry {
  const { exitZ, muzzleZ, radius } = BARRETT_PROFILE.barrel;
  const length = exitZ - muzzleZ;
  const geometry = cylinderZ(radius, radius, length, 96);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const distance = Math.hypot(x, y);
    if (distance < 0.001) continue;
    const angle = Math.atan2(y, x);
    const r = radius - 0.0024 * Math.pow((1 + Math.cos(angle * 8)) / 2, 3);
    positions.setXY(i, x * r / distance, y * r / distance);
  }
  geometry.computeVertexNormals();
  geometry.translate(0, 0, (exitZ + muzzleZ) / 2);
  return geometry;
}

/** Brake baffle across the bore, around an open bore aperture. */
function brakeBaffle(halfWidth: number, halfHeight: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const r = 0.005;
  shape.moveTo(-halfWidth + r, -halfHeight);
  shape.lineTo(halfWidth - r, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + r);
  shape.lineTo(halfWidth, halfHeight - r);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - r, halfHeight);
  shape.lineTo(-halfWidth + r, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - r);
  shape.lineTo(-halfWidth, -halfHeight + r);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + r, -halfHeight);
  const bore = new THREE.Path();
  bore.absarc(0, 0, 0.0085, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.007, bevelEnabled: true, bevelSize: 0.0008,
    bevelThickness: 0.0008, bevelSegments: 1, curveSegments: 6,
  }).translate(0, 0, -0.0035);
}

/** Arrowhead top/bottom plate of the brake, seen from above: [x, z] outline. */
function brakePlate(thickness: number): THREE.BufferGeometry {
  const { rearZ, frontZ, halfWidth } = BARRETT_PROFILE.brake;
  const outline: readonly (readonly [number, number])[] = [
    [-0.034, rearZ], [-halfWidth, rearZ - 0.016], [-halfWidth, frontZ + 0.04],
    [-0.012, frontZ + 0.002], [0.012, frontZ + 0.002], [halfWidth, frontZ + 0.04],
    [halfWidth, rearZ - 0.016], [0.034, rearZ],
  ];
  const shape = new THREE.Shape();
  // Shape (u, v) = (x, -z); rotating -90° about X lays it flat with v along -Z.
  shape.moveTo(outline[0][0], -outline[0][1]);
  for (const [x, z] of outline.slice(1)) shape.lineTo(x, -z);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 0.002, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 1,
  });
  geometry.translate(0, 0, -(thickness - 0.002) / 2);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/**
 * Barrett M82A1-style .50: flat-topped upper receiver with a full-length
 * rail and perforated barrel shroud, deep lower with the box magazine and a
 * solid buttstock with cheek rest and folded monopod, fluted barrel and the
 * arrowhead two-chamber brake. The bipod folds forwards for carrying.
 * Magazine, rounds and charging handle remain separate pivots for the shared
 * rifle reload; firing never invokes the L96's bolt cycle.
 */
export function buildBarrett(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'barrett-root';
  const P = BARRETT_PROFILE;
  const wear = steelWearTexture();
  const steel = new THREE.MeshStandardMaterial({ color: config.bodyColor, metalness: 0.62, roughness: 0.82, roughnessMap: wear, envMapIntensity: 1.45 });
  const dark = new THREE.MeshStandardMaterial({ color: config.accentColor, metalness: 0.5, roughness: 0.64, roughnessMap: wear, envMapIntensity: 1.35 });
  // Moulded stock flanks: the receiver finish, a shade deeper and less metallic.
  const panel = new THREE.MeshStandardMaterial({ color: new THREE.Color(config.bodyColor).multiplyScalar(0.72), metalness: 0.3, roughness: 0.9, roughnessMap: wear });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x121416, metalness: 0.02, roughness: 0.94, bumpMap: wear, bumpScale: 0.00015 });
  const silver = new THREE.MeshStandardMaterial({ color: 0x737b80, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.5 });
  const magazineSteel = new THREE.MeshStandardMaterial({ color: config.reloadAnim!.magColor, metalness: 0.52, roughness: 0.78, roughnessMap: wear, envMapIntensity: 1.35 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x101c26, emissive: 0x081722, emissiveIntensity: 0.5, metalness: 0.25, roughness: 0.05, envMapIntensity: 2.2,
  });
  const attachments = { steel, dark, rubber, detail: silver, glass };
  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `barrett-${name}`;
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
  const pinHead = (radius: number): THREE.BufferGeometry => new THREE.CylinderGeometry(radius, radius, 0.003, 14).rotateZ(Math.PI / 2);

  // Solid buttstock with recessed flanks, rubber cheek rest, thick recoil pad and folded monopod.
  const stock = assembly('stock');
  add(stock, extrudeProfile(profileShape(P.stock), 0.06, 0.004, rounded), steel);
  for (const side of [-1, 1]) {
    add(stock, extrudeProfile(profileShape(P.stockPanel), 0.002, 0.0006, { keepOutline: true }), panel, side * 0.0296);
  }
  add(stock, extrudeProfile(profileShape(P.cheekRest), 0.05, 0.005, rounded), rubber);
  add(stock, new RoundedBoxGeometry(0.062, 0.184, 0.006, 1, 0.0015), dark, 0, -0.056, 0.449);
  add(stock, new RoundedBoxGeometry(0.068, 0.196, 0.024, 3, 0.008), rubber, 0, -0.057, 0.463);
  // Monopod folded flat under the belly: pivot lug, leg and knurled foot.
  const monopodPivot = new THREE.Vector3(0, -0.146, 0.385);
  const monopodFoot = new THREE.Vector3(0, -0.114, 0.255);
  add(stock, new RoundedBoxGeometry(0.03, 0.016, 0.03, 1, 0.003), dark, 0, -0.143, 0.39);
  add(stock, strut(monopodPivot, monopodFoot, 0.0075), steel);
  add(stock, cylinderZ(0.011, 0.011, 0.022, 16), rubber, 0, monopodFoot.y, monopodFoot.z - 0.004);
  add(stock, new THREE.TorusGeometry(0.012, 0.0018, 5, 16).rotateY(Math.PI / 2), steel, -0.033, -0.118, 0.405);

  // Upper receiver with its open ejection port; the left flank is closed by a plate.
  const action = assembly('receiver');
  const upperShape = profileShape(P.upper);
  upperShape.holes.push(profilePath(P.ejectionPort));
  add(action, extrudeProfile(upperShape, 0.072, 0.002, rounded), steel);
  add(action, new RoundedBoxGeometry(0.003, 0.044, 0.139, 1, 0.001), dark, -0.033, 0.006, -0.084);
  add(action, new THREE.BoxGeometry(0.002, 0.03, 0.122), dark, -0.026, 0.006, -0.084);
  // Port edges: a bevelled frame around the right-flank opening.
  add(action, new THREE.BoxGeometry(0.002, 0.003, 0.128), silver, 0.0365, 0.0265, -0.084);
  add(action, new THREE.BoxGeometry(0.002, 0.003, 0.128), silver, 0.0365, -0.0135, -0.084);
  // Bolt carrier behind the port: its slab body, the polished rotating bolt
  // head with locking lugs, the extractor claw and the cam pin in its slot.
  const C = P.carrier;
  add(action, new RoundedBoxGeometry(C.halfWidth * 2, C.halfHeight * 2, C.rearZ - C.frontZ, 1, 0.003), dark,
    -0.005, C.y, (C.rearZ + C.frontZ) / 2);
  add(action, cylinderZ(0.011, 0.011, 0.03, 14), silver, -0.005, C.y, C.frontZ + 0.012);
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const lug = add(action, new THREE.BoxGeometry(0.006, 0.006, 0.012), silver,
      -0.005 + Math.cos(angle) * 0.012, C.y + Math.sin(angle) * 0.012, C.frontZ + 0.004);
    lug.rotation.z = angle;
  }
  add(action, new THREE.BoxGeometry(0.003, 0.005, 0.022), silver, 0.0075, C.y + 0.002, C.frontZ + 0.016);
  add(action, new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 8).rotateZ(Math.PI / 2), silver, 0.0125, C.y + 0.004, -0.098);
  add(action, new THREE.BoxGeometry(0.002, 0.008, 0.03), dark, 0.0115, C.y + 0.004, -0.098);
  // Rivet heads closing the stamped upper over the lower, both flanks.
  const rivet = (radius: number): THREE.BufferGeometry => new THREE.CylinderGeometry(radius * 0.8, radius, 0.0018, 8).rotateZ(Math.PI / 2);
  const SR = P.seamRivets;
  for (const side of [-1, 1]) {
    for (let i = 0; i < SR.count; i++) {
      const z = SR.firstZ - i * SR.pitch;
      // The takedown pin heads keep their spot on the flank.
      if (P.pinZ.some((pin) => Math.abs(pin - z) < 0.015)) continue;
      const head = add(action, rivet(0.0032), steel, side * 0.0372, SR.y, z);
      if (side < 0) head.rotation.y = Math.PI;
    }
  }
  // Magazine release paddle just behind the well, on the shooter's side.
  const release = add(action, new RoundedBoxGeometry(0.004, 0.026, 0.012, 1, 0.0015), dark, 0.0352, -0.06, -0.052);
  release.rotation.x = 0.18;
  add(action, new THREE.CylinderGeometry(0.003, 0.003, 0.004, 8).rotateZ(Math.PI / 2), silver, 0.0372, -0.05, -0.052);

  // Lower receiver, magazine-well collar, grip, guard and trigger.
  add(action, extrudeProfile(profileShape(P.lower), 0.066, 0.002, rounded), steel);
  add(action, new RoundedBoxGeometry(0.07, 0.016, 0.168, 2, 0.004), dark, 0, -0.07, -0.145);
  add(action, extrudeProfile(profileShape(P.grip), 0.034, 0.002, rounded), rubber);
  for (const side of [-1, 1]) {
    const gripPanel = profileShape([[0.033, -0.09], [0.063, -0.086], [0.096, -0.172], [0.062, -0.174]]);
    add(action, extrudeProfile(gripPanel, 0.0015, 0.0004, { keepOutline: true }), dark, side * 0.0172);
    for (let i = 0; i < 9; i++) {
      const rib = add(action, new THREE.BoxGeometry(0.0014, 0.0013, 0.025), rubber, side * 0.018, -0.102 - i * 0.007, 0.052 + i * 0.0025);
      rib.rotation.x = -0.23;
    }
  }
  const guard = profileShape([[-0.043, -0.061], [0.026, -0.061], [0.041, -0.11], [-0.032, -0.11]]);
  guard.holes.push(profilePath([[-0.033, -0.073], [0.018, -0.073], [0.025, -0.1], [-0.025, -0.1]]));
  add(action, extrudeProfile(guard, 0.014, 0.001, rounded), dark);
  add(action, extrudeProfile(profileShape([
    [-0.01, -0.066], [-0.004, -0.066], [-0.007, -0.083], [-0.017, -0.095], [-0.022, -0.093], [-0.013, -0.079],
  ]), 0.006), silver);
  for (const side of [-1, 1]) {
    // Seam where the stamped upper laps over the lower, with its rolled edge.
    add(action, new THREE.BoxGeometry(0.0015, 0.0035, 0.41), silver, side * 0.0365, -0.028, -0.04);
    for (const z of P.pinZ) {
      // Captive takedown pins: a large head on each side and a lanyard ring on the left.
      add(action, pinHead(0.0068), silver, side * 0.0372, -0.016, z);
      add(action, pinHead(0.0035), dark, side * 0.0392, -0.016, z);
    }
  }
  for (const z of P.pinZ) {
    add(action, new THREE.TorusGeometry(0.008, 0.0013, 5, 14).rotateY(Math.PI / 2), silver, -0.0412, -0.026, z + 0.004);
  }
  add(action, new THREE.CylinderGeometry(0.0065, 0.0065, 0.003, 16).rotateZ(Math.PI / 2), steel, -0.035, -0.044, 0.052);
  const safety = add(action, new RoundedBoxGeometry(0.005, 0.008, 0.026, 1, 0.002), silver, -0.038, -0.045, 0.042);
  safety.rotation.x = -0.35;
  add(action, new THREE.BoxGeometry(0.009, 0.016, 0.013), silver, 0, -0.08, -0.052);

  // Barrel shroud: thin side plates with real through-holes, joined by a roof and floor.
  const shroud = assembly('shroud');
  const S = P.shroud;
  for (const side of [-1, 1]) {
    const plate = profileShape([[S.frontZ, S.topY - 0.004], [S.rearZ, S.topY - 0.004], [S.rearZ, S.bottomY], [S.frontZ + 0.014, S.bottomY], [S.frontZ, S.bottomY + 0.014]]);
    for (const holes of [P.shroudHoles, P.shroudSmallHoles]) {
      for (let i = 0; i < holes.count; i++) {
        const hole = new THREE.Path();
        hole.absarc(-(holes.firstZ - i * holes.pitch), holes.y, holes.radius, 0, Math.PI * 2, true);
        plate.holes.push(hole);
      }
    }
    add(shroud, extrudeProfile(plate, 0.003, 0, { curveSegments: 4 }), steel, side * (S.width / 2 - 0.0015));
    // Pressed stiffening rib between the hole rows and the rivets of the lower flange.
    const rib = P.shroudRib;
    add(shroud, new RoundedBoxGeometry(0.003, rib.height, S.rearZ - S.frontZ - 0.03, 1, 0.0012), steel,
      side * (S.width / 2 + 0.001), rib.y, (S.rearZ + S.frontZ) / 2 + 0.008);
    const RV = P.shroudRivets;
    for (let i = 0; i < RV.count; i++) {
      const head = add(shroud, new THREE.CylinderGeometry(0.0026, 0.0032, 0.0018, 8).rotateZ(Math.PI / 2), steel,
        side * (S.width / 2 + 0.0009), RV.y, RV.firstZ - i * RV.pitch);
      if (side < 0) head.rotation.y = Math.PI;
    }
  }
  // Folding front iron sight laid flat on the front of the rail: hinge block, post and protective ears.
  add(shroud, new RoundedBoxGeometry(0.026, 0.008, 0.02, 1, 0.002), dark, 0, P.rail.y + 0.008, P.rail.frontZ + 0.02);
  add(shroud, new THREE.BoxGeometry(0.004, 0.003, 0.03), dark, 0, P.rail.y + 0.0135, P.rail.frontZ + 0.04);
  for (const side of [-1, 1]) {
    add(shroud, new THREE.BoxGeometry(0.003, 0.006, 0.026), dark, side * 0.009, P.rail.y + 0.014, P.rail.frontZ + 0.038);
  }
  const shroudLength = S.rearZ - S.frontZ;
  add(shroud, new RoundedBoxGeometry(S.width, 0.005, shroudLength, 1, 0.0015), steel, 0, S.topY - 0.0025, (S.rearZ + S.frontZ) / 2);
  add(shroud, new RoundedBoxGeometry(S.width, 0.005, shroudLength - 0.014, 1, 0.0015), dark, 0, S.bottomY + 0.0025, (S.rearZ + S.frontZ) / 2 + 0.007);
  // Front plate with the barrel exit collar.
  add(shroud, new RoundedBoxGeometry(S.width, S.topY - S.bottomY - 0.016, 0.008, 2, 0.003), steel, 0, (S.topY + S.bottomY) / 2 - 0.001, S.frontZ + 0.003);
  add(shroud, cylinderZ(0.03, 0.028, 0.016, 28), dark, 0, 0, S.frontZ - 0.006);
  // Full-length rail: base and cross-slots.
  const R = P.rail;
  const railLength = R.rearZ - R.frontZ;
  add(shroud, new THREE.BoxGeometry(0.03, 0.009, railLength), dark, 0, R.y, (R.rearZ + R.frontZ) / 2);
  for (let i = 0; i < Math.floor(railLength / 0.0105); i++) {
    add(shroud, new THREE.BoxGeometry(0.03, 0.004, 0.0055), dark, 0, R.y + 0.0065, R.rearZ - 0.006 - i * 0.0105);
  }

  // Heavy barrel: plain inside the shroud, fluted where exposed.
  const barrel = assembly('barrel');
  const B = P.barrel;
  add(barrel, cylinderZ(B.radius + 0.002, B.radius + 0.001, B.rearZ - B.exitZ, 24), dark, 0, 0, (B.rearZ + B.exitZ) / 2);
  add(barrel, flutedBarrel(), steel);
  add(barrel, cylinderZ(B.radius + 0.0015, B.radius + 0.0015, 0.014, 24), dark, 0, 0, B.muzzleZ + 0.007);

  // Two-chamber arrowhead brake: chevron top and bottom plates, three baffles and open side windows.
  const brake = assembly('muzzle-brake');
  const K = P.brake;
  for (const y of [-K.halfHeight + 0.003, K.halfHeight - 0.003]) add(brake, brakePlate(0.006), steel, 0, y, 0);
  add(brake, brakeBaffle(0.034, K.halfHeight - 0.006), steel, 0, 0, K.rearZ - 0.006);
  add(brake, brakeBaffle(K.halfWidth, K.halfHeight - 0.006), steel, 0, 0, -0.935);
  // The swept front faces meet at the tip, leaving the bore clear between them.
  const frontInner = new THREE.Vector3(0.0095, 0, K.frontZ + 0.004);
  const frontOuter = new THREE.Vector3(K.halfWidth - 0.002, 0, K.frontZ + 0.04);
  const faceLength = frontInner.distanceTo(frontOuter);
  const faceAngle = Math.atan2(frontOuter.z - frontInner.z, frontOuter.x - frontInner.x);
  for (const side of [-1, 1]) {
    const face = add(brake, new RoundedBoxGeometry(faceLength, (K.halfHeight - 0.006) * 2, 0.007, 1, 0.0015), steel,
      side * (frontInner.x + frontOuter.x) / 2, 0, (frontInner.z + frontOuter.z) / 2);
    face.rotation.y = -side * faceAngle;
  }
  add(brake, cylinderZ(0.016, 0.016, 0.012, 20), dark, 0, 0, K.rearZ + 0.004);
  add(brake, new THREE.CircleGeometry(0.0085, 16).rotateY(Math.PI), dark, 0, 0, K.rearZ - 0.0085);

  const sightY = config.sightHeight;
  group.add(buildBarrettScope(sightY, attachments));

  const handle = assembly('charging-handle', 0, 0, -0.025);
  add(handle, cylinderZ(0.011, 0.011, 0.12, 20), dark, 0, 0.004, -0.057);
  add(handle, new RoundedBoxGeometry(0.035, 0.009, 0.013, 1, 0.002), silver, 0.043, -0.005);
  add(handle, cylinderZ(0.007, 0.007, 0.028, 16), dark, 0.057, -0.005);
  for (const z of [-0.008, 0, 0.008]) add(handle, cylinderZ(0.0075, 0.0075, 0.0015, 16), silver, 0.057, -0.005, z);

  // Box magazine, a hand's depth below the well, with pressed ribs and a base pad.
  const magazine = assembly('magazine', 0, -0.095, -0.142);
  const magBottom = -0.108;
  add(magazine, extrudeProfile(profileShape([[-0.0725, 0.04], [0.0725, 0.04], [0.07, magBottom], [-0.068, magBottom]]), 0.052, 0.0025, rounded), magazineSteel);
  add(magazine, new RoundedBoxGeometry(0.058, 0.01, 0.152, 2, 0.003), dark, 0, magBottom - 0.003);
  for (const side of [-1, 1]) {
    for (const z of [-0.042, 0, 0.042]) {
      add(magazine, new RoundedBoxGeometry(0.0024, 0.1, 0.016, 1, 0.001), magazineSteel, side * 0.026, -0.04, z);
    }
    add(magazine, new THREE.BoxGeometry(0.004, 0.006, 0.113), dark, side * 0.022, 0.044, 0.003);
  }
  add(magazine, new THREE.BoxGeometry(0.04, 0.004, 0.125), dark, 0, 0.033, 0.002);
  const { brass, copper } = cartridgeMaterials();
  const rounds = buildMagazineRounds('barrett-magazine-rounds', CARTRIDGES.bmg50, [[0.009, 0.044, 0.069], [-0.009, 0.033, 0.069]], brass, copper);
  magazine.add(rounds);
  mergeAssemblies(magazine);

  group.add(buildBarrettBipod(attachments));

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0, K.frontZ).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.04, 0.001, -0.076).multiplyScalar(config.scale),
    sightY: sightY * config.scale,
    reloadParts: { magazine, handle, rounds },
  };
}
