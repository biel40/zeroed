import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cylinderZ, extrudeProfile, profilePath, profileShape, projectMetricUVs, shapeWidth, type ProfilePoint } from './ProfileGeometry';
import { parkerizedFinish, walnutFinish } from './ProceduralTextures';
import { buildMagazineRounds, CARTRIDGES, cartridgeMaterials, feedLipSeats } from './MagazineRounds';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

const STOCK_WIDTH = 0.044;
const RECEIVER_WIDTH = 0.033;
const RECEIVER_PLATE = 0.0055;
/** Rounded furniture edges that keep the traced outline intact. */
const ROUNDED_WOOD = { segments: 3, keepOutline: true } as const;
const REAR_APERTURE_RADIUS = 0.0045;
/** Relief heights in metres: open walnut pores, and the far finer phosphate crystals. */
const WALNUT_RELIEF = 0.00035;
const PARKERIZED_RELIEF = 0.00016;

/**
 * M14 side profiles traced from a reference photo at 1.56 mm/px (1126 mm
 * overall, 559 mm barrel), shared by the first-person model and the wall-buy
 * silhouette. The trigger sits at z = 0 and the bore on y = 0.
 */
export const M14_PROFILE = {
  /** One-piece walnut stock: forend with the operating-rod channel, wrist and semi-pistol grip, butt. */
  stock: [
    [-0.559, -0.004], [-0.552, 0], [-0.397, 0], [-0.393, -0.0175], [-0.247, -0.0175], [0.03, -0.0175],
    [0.041, -0.0105], [0.053, -0.016], [0.066, -0.0213], [0.078, -0.0252], [0.091, -0.0274], [0.103, -0.0297],
    [0.116, -0.0288], [0.128, -0.0247], [0.141, -0.0208], [0.153, -0.0199], [0.178, -0.0181], [0.203, -0.0164],
    [0.253, -0.0144], [0.303, -0.0141], [0.345, -0.0138], [0.345, -0.1475], [0.33, -0.1445], [0.303, -0.1408],
    [0.266, -0.1354], [0.241, -0.1326], [0.216, -0.1265], [0.191, -0.1204], [0.178, -0.1195], [0.166, -0.1205],
    [0.153, -0.1215], [0.141, -0.1265], [0.128, -0.1295], [0.116, -0.1148], [0.103, -0.1032], [0.091, -0.0946],
    [0.078, -0.0893], [0.066, -0.0823], [0.053, -0.0785], [0.041, -0.0746], [0.028, -0.0738], [0.003, -0.0773],
    [-0.022, -0.0774], [-0.047, -0.0807], [-0.072, -0.0826], [-0.097, -0.081], [-0.122, -0.083], [-0.147, -0.083],
    [-0.172, -0.082], [-0.21, -0.075], [-0.247, -0.065], [-0.285, -0.0597], [-0.335, -0.0571], [-0.422, -0.0554],
    [-0.51, -0.0522], [-0.559, -0.0463],
  ] as readonly ProfilePoint[],
  buttplate: [
    [0.343, -0.0138], [0.349, -0.017], [0.356, -0.028], [0.358, -0.075],
    [0.356, -0.125], [0.35, -0.143], [0.343, -0.1475],
  ] as readonly ProfilePoint[],
  /** Walnut upper handguard over the barrel, from the front band to the receiver. */
  upperHandguard: [
    [-0.548, 0], [-0.548, 0.012], [-0.54, 0.0135], [-0.335, 0.0164], [-0.255, 0.017], [-0.249, 0.0125], [-0.249, 0],
  ] as readonly ProfilePoint[],
  /** Left receiver wall; its side rail runs unbroken along the open top. */
  receiver: [
    [0.036, 0.0105], [0.028, 0.016], [-0.06, 0.0175], [-0.165, 0.0175], [-0.168, 0.0215],
    [-0.247, 0.0215], [-0.247, -0.0175], [0.036, -0.0175],
  ] as readonly ProfilePoint[],
  /** Right receiver wall, cut low where the spent cases leave. */
  receiverEjectionSide: [
    [0.036, 0.0105], [0.028, 0.016], [-0.058, 0.0175], [-0.064, 0.0065], [-0.158, 0.0065], [-0.165, 0.0175],
    [-0.168, 0.0215], [-0.247, 0.0215], [-0.247, -0.0175], [0.036, -0.0175],
  ] as readonly ProfilePoint[],
  /** Solid rear of the receiver, behind the open bolt raceway; it carries the rear sight. */
  receiverBridge: [[0.036, 0.0105], [0.028, 0.016], [-0.06, 0.0175], [-0.06, -0.0175], [0.036, -0.0175]] as readonly ProfilePoint[],
  receiverRing: { rearZ: -0.168, frontZ: -0.247, y: 0.003, radius: 0.0185 },
  boltRaceway: { rearZ: -0.06, frontZ: -0.168 },
  triggerGuard: [
    [0.03, -0.075], [0.03, -0.092], [0.022, -0.108], [0.012, -0.121], [-0.008, -0.1265],
    [-0.03, -0.118], [-0.044, -0.104], [-0.05, -0.086], [-0.05, -0.075],
  ] as readonly ProfilePoint[],
  triggerOpening: [
    [0.0245, -0.0785], [0.0245, -0.0915], [0.0175, -0.105], [0.0095, -0.116], [-0.0075, -0.121],
    [-0.0265, -0.113], [-0.0385, -0.1015], [-0.044, -0.086], [-0.044, -0.0785],
  ] as readonly ProfilePoint[],
  trigger: [
    [-0.003, -0.076], [0.004, -0.076], [0.006, -0.088], [0.004, -0.097],
    [-0.003, -0.101], [-0.005, -0.098], [-0.001, -0.09], [-0.002, -0.082],
  ] as readonly ProfilePoint[],
  barrel: { rearZ: -0.247, frontZ: -0.67, rearRadius: 0.0125, frontRadius: 0.0095 },
  gasCylinder: { rearZ: -0.555, frontZ: -0.632, y: -0.0275, radius: 0.015 },
  /** Open-pronged suppressor; the front sight stands on its rear collar. */
  flashSuppressor: { rearZ: -0.67, cageRearZ: -0.704, cageFrontZ: -0.758, muzzleZ: -0.766, radius: 0.0105 },
  frontSightZ: -0.688,
  rearSightZ: -0.04,
  /** Right-side operating rod with its reciprocating handle at the front of the receiver. */
  operatingRod: { handleZ: -0.19, x: 0.0185, y: -0.006 },
  /** Straight 20-round steel box, local to its seat at the bottom of the well. */
  magazine: {
    seat: [0, -0.083, -0.139] as const,
    outline: [[0.0455, 0.024], [-0.0455, 0.024], [-0.0455, -0.114], [0.0455, -0.114]] as readonly ProfilePoint[],
    floorplate: [[0.048, -0.1125], [-0.048, -0.1125], [-0.048, -0.119], [0.048, -0.119]] as readonly ProfilePoint[],
    width: 0.028,
    hidden: 0.024,
  },
} as const;

/** Stock width along its length: the slim forend tip swelling to the action and the narrow wrist. */
function stockWidthScale(z: number): number {
  const forend = THREE.MathUtils.lerp(0.78, 1, THREE.MathUtils.smoothstep(z, -0.559, -0.3));
  const wrist = 1 - 0.17 * Math.max(0, 1 - Math.abs(z - 0.105) / 0.1);
  return forend * wrist;
}

/** Rear aperture plate in X/Y: the peep hole sits exactly on the sight line. */
function rearAperturePlate(sightY: number): THREE.BufferGeometry {
  const halfWidth = 0.0088;
  const bottom = 0.0275;
  const top = sightY + 0.0085;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, bottom);
  shape.lineTo(halfWidth, bottom);
  shape.lineTo(halfWidth, top - 0.003);
  shape.quadraticCurveTo(halfWidth, top, halfWidth - 0.003, top);
  shape.lineTo(-halfWidth + 0.003, top);
  shape.quadraticCurveTo(-halfWidth, top, -halfWidth, top - 0.003);
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, sightY, REAR_APERTURE_RADIUS, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const depth = 0.0035;
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 14 }).translate(0, 0, -depth / 2);
}

/**
 * M14 view model: oiled walnut stock and upper handguard, parkerized open-top
 * receiver with the bolt in plain view, aperture rear sight with both
 * adjustment knobs, gas cylinder under the barrel, winged front sight on the
 * pronged flash suppressor and the straight box magazine. The operating rod
 * carries the bolt: it cycles per shot, locks open on the last round and is
 * the action the reload slams home.
 */
export function buildM14(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'm14-root';
  const sightY = config.sightHeight;
  const P = M14_PROFILE;
  const finish = parkerizedFinish();
  const textured = finish.surface !== null;
  const parkerized = { map: finish.color, roughnessMap: finish.surface, bumpMap: finish.surface, bumpScale: PARKERIZED_RELIEF };
  const steel = new THREE.MeshStandardMaterial({
    color: config.bodyColor, metalness: 0.72, roughness: textured ? 0.82 : 0.46, envMapIntensity: 1.25, ...parkerized,
  });
  const darkSteel = new THREE.MeshStandardMaterial({
    color: 0x15171a, metalness: 0.78, roughness: textured ? 0.74 : 0.42, envMapIntensity: 1.1, ...parkerized,
  });
  // Machined and bright from cycling: it keeps the speckle but not the phosphate.
  const boltSteel = new THREE.MeshStandardMaterial({
    color: 0x868c91, metalness: 0.92, roughness: textured ? 0.5 : 0.28, roughnessMap: finish.surface, envMapIntensity: 1.4,
  });
  const walnut = walnutFinish();
  const wood = new THREE.MeshPhysicalMaterial({
    color: config.accentColor, map: walnut.color, bumpMap: walnut.surface, bumpScale: WALNUT_RELIEF, metalness: 0, roughness: 0.48,
    clearcoat: 0.45, clearcoatRoughness: 0.3, envMapIntensity: 0.95,
  });
  const magazineSteel = new THREE.MeshStandardMaterial({
    color: config.reloadAnim!.magColor, metalness: 0.66, roughness: textured ? 0.88 : 0.52, envMapIntensity: 1.15, ...parkerized,
  });
  const recess = new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0.5, roughness: 0.75 });
  const bore = new THREE.MeshBasicMaterial({ color: 0x030404 });

  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    parent: THREE.Object3D, x = 0, y = 0, z = 0,
  ): THREE.Mesh => {
    // Walnut parts project themselves, each from its own stretch of the board.
    const mesh = new THREE.Mesh(material === wood ? geometry : projectMetricUVs(geometry), material);
    mesh.name = `m14-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `m14-${name}`;
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };

  // Stock: the channel on the right leaves the operating rod in plain view;
  // the left flank of that stretch is solid walnut.
  const stock = assembly('stock');
  const stockShell = shapeWidth(extrudeProfile(profileShape(P.stock), STOCK_WIDTH, 0.0085, ROUNDED_WOOD), (_y, z) => stockWidthScale(z));
  add('walnut-stock', projectMetricUVs(stockShell), wood, stock);
  const channelCheek = profileShape([[-0.397, 0], [-0.247, 0], [-0.247, -0.0185], [-0.397, -0.0185]]);
  add('channel-cheek', projectMetricUVs(extrudeProfile(channelCheek, 0.016, 0.002, ROUNDED_WOOD), 0.2, 0.03), wood, stock, -0.0132);
  add('buttplate', extrudeProfile(profileShape(P.buttplate), STOCK_WIDTH - 0.001, 0.0012, { segments: 2 }), steel, stock);
  add('buttplate-hinge', new THREE.CylinderGeometry(0.0028, 0.0028, 0.02, 10).rotateZ(Math.PI / 2), steel, stock, 0, -0.03, 0.357);
  add('forend-ferrule', new RoundedBoxGeometry(0.036, 0.047, 0.012, 2, 0.003), steel, stock, 0, -0.0235, -0.553);
  add('rear-sling-swivel', new THREE.TorusGeometry(0.0095, 0.0017, 5, 14).rotateY(Math.PI / 2), steel, stock, 0, -0.151, 0.308);
  add('rear-swivel-base', new RoundedBoxGeometry(0.01, 0.006, 0.026, 1, 0.0015), steel, stock, 0, -0.143, 0.308);
  // Dark opening under the receiver: visible only while the magazine is out.
  add('magazine-well', new THREE.BoxGeometry(0.03, 0.0016, 0.094), recess, stock, 0, -0.0838, P.magazine.seat[2]);
  for (const side of [-1, 1]) {
    add('well-rim', new THREE.BoxGeometry(0.0022, 0.0034, 0.096), steel, stock, side * 0.0162, -0.0835, P.magazine.seat[2]);
  }

  // Upper handguard with a steel ferrule against the receiver.
  const handguard = assembly('handguard');
  add('upper-walnut', projectMetricUVs(extrudeProfile(profileShape(P.upperHandguard), 0.031, 0.0075, ROUNDED_WOOD), 0.31, 0.07), wood, handguard);
  add('handguard-ferrule', new RoundedBoxGeometry(0.028, 0.0145, 0.005, 1, 0.002), steel, handguard, 0, 0.0073, -0.2485);

  // Receiver: two walls around the open raceway the bolt rides in, bridged
  // behind it and closed by the front ring.
  const receiver = assembly('receiver');
  const plateX = RECEIVER_WIDTH / 2 - RECEIVER_PLATE / 2;
  add('receiver-left', extrudeProfile(profileShape(P.receiver), RECEIVER_PLATE, 0.0007), steel, receiver, -plateX);
  add('receiver-right', extrudeProfile(profileShape(P.receiverEjectionSide), RECEIVER_PLATE, 0.0007), steel, receiver, plateX);
  const innerWidth = RECEIVER_WIDTH - RECEIVER_PLATE * 2;
  add('receiver-bridge', extrudeProfile(profileShape(P.receiverBridge), innerWidth + 0.001), steel, receiver);
  const ring = P.receiverRing;
  const ringLength = ring.rearZ - ring.frontZ;
  add('receiver-ring', cylinderZ(ring.radius, ring.radius, ringLength, 22), steel, receiver, 0, ring.y, ring.rearZ - ringLength / 2);
  const raceway = P.boltRaceway;
  const racewayLength = raceway.rearZ - raceway.frontZ;
  add('bolt-raceway', new THREE.BoxGeometry(innerWidth, 0.0115, racewayLength), recess, receiver, 0, -0.0115, raceway.rearZ - racewayLength / 2);
  add('chamber-mouth', new THREE.CircleGeometry(0.0065, 14), recess, receiver, 0, 0, ring.rearZ + 0.0002);
  add('stripper-clip-guide', new RoundedBoxGeometry(0.0058, 0.016, 0.022, 1, 0.0015), steel, receiver, -0.0125, 0.0235, -0.098);
  add('bolt-stop', new RoundedBoxGeometry(0.0026, 0.016, 0.009, 1, 0.0008), steel, receiver, -RECEIVER_WIDTH / 2 - 0.0008, -0.004, -0.126);
  for (const side of [-1, 1]) {
    add('receiver-pin', new THREE.CylinderGeometry(0.0028, 0.0028, 0.0016, 10).rotateZ(Math.PI / 2), steel, receiver, side * (RECEIVER_WIDTH / 2 + 0.0003), -0.008, 0.012);
  }

  // Fire control in front of the wrist.
  const lower = assembly('lower');
  add('trigger-housing', new RoundedBoxGeometry(0.024, 0.007, 0.098, 1, 0.002), steel, lower, 0, -0.0772, -0.012);
  const guard = profileShape(P.triggerGuard);
  guard.holes.push(profilePath(P.triggerOpening));
  add('trigger-guard', extrudeProfile(guard, 0.0115, 0.0008), steel, lower);
  add('trigger', extrudeProfile(profileShape(P.trigger), 0.0058, 0.0006), darkSteel, lower);
  add('safety', new THREE.BoxGeometry(0.0055, 0.014, 0.004).rotateX(-0.28), darkSteel, lower, 0, -0.087, -0.038);
  add('magazine-latch', new RoundedBoxGeometry(0.02, 0.021, 0.0055, 1, 0.0016).rotateX(-0.14), steel, lower, 0, -0.0935, -0.0875);

  // Barrel: tapered tube, gas system under it, pronged suppressor at the muzzle.
  const barrelGroup = assembly('barrel');
  const barrel = P.barrel;
  const barrelLength = barrel.rearZ - barrel.frontZ;
  add('barrel-core', cylinderZ(barrel.rearRadius, barrel.frontRadius, barrelLength, 18), steel, barrelGroup, 0, 0, barrel.rearZ - barrelLength / 2);
  const gas = P.gasCylinder;
  const gasLength = gas.rearZ - gas.frontZ;
  add('gas-cylinder', cylinderZ(gas.radius, gas.radius, gasLength, 18), steel, barrelGroup, 0, gas.y, gas.rearZ - gasLength / 2);
  add('gas-cylinder-lock', cylinderZ(gas.radius + 0.0016, gas.radius + 0.0016, 0.01, 8), darkSteel, barrelGroup, 0, gas.y, gas.frontZ - 0.005);
  add('gas-plug', cylinderZ(0.011, 0.011, 0.008, 6), steel, barrelGroup, 0, gas.y, gas.frontZ - 0.014);
  add('spindle-valve', new THREE.CylinderGeometry(0.0048, 0.0048, 0.0075, 10).rotateZ(Math.PI / 2), darkSteel, barrelGroup, gas.radius + 0.0032, gas.y, -0.602);
  add('front-band', new RoundedBoxGeometry(0.03, 0.054, 0.014, 2, 0.003), steel, barrelGroup, 0, -0.0145, -0.562);
  add('front-sling-swivel', new THREE.TorusGeometry(0.0085, 0.0016, 5, 14).rotateY(Math.PI / 2), steel, barrelGroup, 0, gas.y - gas.radius - 0.0095, -0.592);
  const suppressor = P.flashSuppressor;
  const collarLength = suppressor.rearZ - suppressor.cageRearZ;
  add('suppressor-collar', cylinderZ(suppressor.radius, suppressor.radius, collarLength, 16), steel, barrelGroup, 0, 0, suppressor.rearZ - collarLength / 2);
  const cageLength = suppressor.cageRearZ - suppressor.cageFrontZ;
  const cageZ = suppressor.cageRearZ - cageLength / 2;
  add('suppressor-bore', cylinderZ(suppressor.radius * 0.62, suppressor.radius * 0.62, cageLength, 12), bore, barrelGroup, 0, 0, cageZ);
  for (let tine = 0; tine < 6; tine++) {
    const angle = Math.PI / 6 + (tine * Math.PI) / 3;
    const bar = new THREE.BoxGeometry(0.0044, 0.0028, cageLength).rotateZ(angle - Math.PI / 2);
    add('suppressor-tine', bar, steel, barrelGroup, Math.cos(angle) * (suppressor.radius - 0.0014), Math.sin(angle) * (suppressor.radius - 0.0014), cageZ);
  }
  const tipLength = suppressor.cageFrontZ - suppressor.muzzleZ;
  add('suppressor-tip', cylinderZ(suppressor.radius, suppressor.radius * 0.94, tipLength, 16), steel, barrelGroup, 0, 0, suppressor.cageFrontZ - tipLength / 2);
  add('bore', new THREE.CircleGeometry(0.0046, 12).rotateY(Math.PI), bore, barrelGroup, 0, 0, suppressor.muzzleZ - 0.0002);
  add('bayonet-lug', new THREE.BoxGeometry(0.012, 0.018, 0.03), darkSteel, barrelGroup, 0, -0.0205, P.frontSightZ);

  // Sights: winged post at the muzzle, aperture on a block between two knobs.
  const sights = assembly('sights');
  const frontZ = P.frontSightZ;
  const neckBottom = 0.008;
  const postBase = 0.024;
  add('front-sight-neck', new RoundedBoxGeometry(0.0125, postBase - neckBottom, 0.024, 1, 0.002), steel, sights, 0, (postBase + neckBottom) / 2, frontZ);
  add('front-sight-post', new THREE.BoxGeometry(0.0032, sightY - postBase, 0.004), darkSteel, sights, 0, (sightY + postBase) / 2, frontZ);
  for (const side of [-1, 1]) {
    add('front-sight-wing', new THREE.BoxGeometry(0.0028, 0.03, 0.017).rotateZ(side * -0.07), steel, sights, side * 0.0082, 0.031, frontZ);
  }
  const rearZ = P.rearSightZ;
  add('rear-sight-base', new RoundedBoxGeometry(0.021, 0.012, 0.05, 1, 0.002), steel, sights, 0, 0.0225, rearZ);
  add('rear-aperture', rearAperturePlate(sightY), darkSteel, sights, 0, 0, rearZ);
  for (const side of [-1, 1]) {
    add('rear-sight-ear', new THREE.BoxGeometry(0.0028, sightY + 0.004 - 0.028, 0.021), steel, sights, side * 0.0122, (sightY + 0.004 + 0.028) / 2, rearZ);
  }
  add('rear-sight-shaft', new THREE.CylinderGeometry(0.0042, 0.0042, 0.05, 10).rotateZ(Math.PI / 2), darkSteel, sights, 0, 0.0262, rearZ);
  // Elevation knob (left, larger) and windage knob (right), each knurled round its rim.
  for (const [side, radius] of [[-1, 0.0135], [1, 0.0115]] as const) {
    const knobX = side * 0.0232;
    add('rear-sight-knob', new THREE.CylinderGeometry(radius, radius, 0.0115, 18).rotateZ(Math.PI / 2), steel, sights, knobX, 0.0262, rearZ);
    add('rear-knob-cap', new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, 0.0014, 14).rotateZ(Math.PI / 2), darkSteel, sights, knobX + side * 0.0062, 0.0262, rearZ);
    for (let rib = 0; rib < 12; rib++) {
      const angle = (rib * Math.PI) / 6;
      const y = 0.0262 + Math.sin(angle) * radius;
      const z = rearZ + Math.cos(angle) * radius;
      add('rear-knob-rib', new THREE.BoxGeometry(0.0105, 0.0016, 0.0016), darkSteel, sights, knobX, y, z);
    }
  }

  // Operating rod and bolt: one reciprocating group along the right flank.
  const rod = P.operatingRod;
  const operatingRod = assembly('charging-handle', 0, rod.y, rod.handleZ);
  add('rod-bar', new RoundedBoxGeometry(0.0065, 0.0105, 0.262, 1, 0.0016), steel, operatingRod, rod.x, 0, -0.127);
  add('handle-web', new RoundedBoxGeometry(0.012, 0.0075, 0.016, 1, 0.002), steel, operatingRod, rod.x + 0.008, 0, 0);
  const knob = new THREE.SphereGeometry(0.0078, 12, 8).scale(0.85, 1.15, 1.35);
  add('handle-knob', knob, steel, operatingRod, rod.x + 0.0165, 0.001, -0.001);
  const boltY = -rod.y + 0.0015;
  add('bolt-body', new THREE.BoxGeometry(0.0185, 0.016, 0.062), boltSteel, operatingRod, 0, boltY, 0.056);
  add('bolt-lug', new THREE.BoxGeometry(0.0055, 0.0032, 0.044), boltSteel, operatingRod, 0, boltY + 0.0092, 0.056);
  add('bolt-roller', new THREE.CylinderGeometry(0.0042, 0.0042, 0.0075, 10).rotateZ(Math.PI / 2), darkSteel, operatingRod, 0.0108, boltY + 0.0032, 0.029);

  // Straight box magazine with its stamped ribs; only the top rounds are modeled.
  const mag = P.magazine;
  const magazine = assembly('magazine', ...mag.seat);
  add('magazine-body', extrudeProfile(profileShape(mag.outline), mag.width, 0.0015, { segments: 2 }), magazineSteel, magazine);
  add('magazine-floorplate', extrudeProfile(profileShape(mag.floorplate), mag.width + 0.003, 0.001), magazineSteel, magazine);
  for (const side of [-1, 1]) {
    for (const z of [-0.024, 0.024]) {
      add('magazine-rib', new RoundedBoxGeometry(0.0014, 0.094, 0.0048, 1, 0.0005), magazineSteel, magazine, side * (mag.width / 2 + 0.0004), -0.052, z);
    }
    add('magazine-witness', new THREE.CircleGeometry(0.0024, 10).rotateY(side * Math.PI / 2), bore, magazine, side * (mag.width / 2 + 0.0002), -0.02, 0);
  }
  const { brass, copper } = cartridgeMaterials();
  const cartridge = CARTRIDGES.nato762;
  const rounds = buildMagazineRounds('m14-magazine-rounds', cartridge, feedLipSeats(cartridge, mag.hidden, 0.034, 0.0045), brass, copper);
  magazine.add(rounds);

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0, suppressor.muzzleZ - 0.003).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.02, 0.012, -0.12).multiplyScalar(config.scale),
    sightY: sightY * config.scale,
    slide: operatingRod,
    reloadParts: { magazine, handle: operatingRod, rounds },
  };
}
