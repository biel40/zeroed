import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  cylinderZ, extrudeProfile, profilePath, profileShape, shapeWidth, type ProfilePoint,
} from './ProfileGeometry';
import { canvasTexture, seededRandom, steelWearTexture } from './ProceduralTextures';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/** Outer width of the stamped receiver; the side plates carry the charging slot. */
const RECEIVER_WIDTH = 0.05;
const PLATE = 0.005;

/**
 * M60 side profiles traced from a reference photo at 0.76 mm/px (1105 mm
 * overall). They are shared by the first-person model and the wall-buy
 * silhouette so both always describe the same machine gun. The trigger sits
 * at z = 0 and the bore on y = 0.
 */
export const M60_PROFILE = {
  /** Fixed butt with its straight comb tube over the receiver tail. */
  stock: [
    [0.3192, 0.0403], [0.3154, 0.0464], [0.2865, 0.0448], [0.2516, 0.0418], [0.1953, 0.0433],
    [0.1368, 0.0441], [0.1368, 0.0091], [0.1999, 0.0091], [0.1999, -0.057], [0.2516, -0.1018],
    [0.2728, -0.1148], [0.2896, -0.117], [0.2987, -0.114], [0.3048, -0.0996], [0.3154, -0.016],
  ] as readonly ProfilePoint[],
  /** Fluted panel moulded into both butt flanks. */
  flutes: [
    [0.3048, 0.0327], [0.2075, 0.0327], [0.2075, -0.054], [0.2516, -0.095], [0.2728, -0.1072],
    [0.2896, -0.1087], [0.2949, -0.098], [0.3032, -0.0312],
  ] as readonly ProfilePoint[],
  /** Broad, nearly upright pistol grip with its top flange. */
  grip: [
    [0.0866, -0.0692], [0.0258, -0.0707], [0.0281, -0.0859], [0.0372, -0.1528], [0.0403, -0.1733],
    [0.0494, -0.1786], [0.0813, -0.1809], [0.0904, -0.1695], [0.0912, -0.1566], [0.0844, -0.1224], [0.0866, -0.092],
  ] as readonly ProfilePoint[],
  /** Stamped receiver: tail under the comb, raised top behind the cover, trigger housing. */
  receiver: [
    [0.1999, 0.0084], [0.1368, 0.0084], [0.1368, 0.0433], [0.1041, 0.0479], [0.0844, 0.0502],
    [0.0844, 0.0357], [-0.0935, 0.0426], [-0.0935, -0.0008], [-0.0608, -0.0008], [-0.0608, -0.0509],
    [-0.054, -0.0737], [0.0851, -0.0737], [0.0889, -0.0517], [0.1999, -0.0517],
  ] as readonly ProfilePoint[],
  /** Right-flank channel the charging handle runs in; the handle rests at its front. */
  chargingSlot: [[0.057, -0.0258], [-0.0441, -0.0258], [-0.0441, -0.035], [0.057, -0.035]] as readonly ProfilePoint[],
  chargingHandle: { z: -0.038, y: -0.0304 },
  /** Feed cover with its cartridge-guide dome; it hinges at its top front corner, by the rear sight. */
  cover: [
    [0.06, 0.0319], [0.0585, 0.0517], [0.0448, 0.0555], [0.0312, 0.0593], [-0.0296, 0.0593],
    [-0.0448, 0.0547], [-0.0479, 0.0403], [-0.0479, 0.0319],
  ] as readonly ProfilePoint[],
  coverLatch: [[0.0828, 0.0372], [0.0585, 0.0372], [0.0585, 0.019], [0.0828, 0.019]] as readonly ProfilePoint[],
  coverHinge: { z: -0.0464, y: 0.0535 },
  rearSightBase: [
    [-0.038, 0.038], [-0.0935, 0.038], [-0.0935, 0.0471], [-0.0859, 0.054], [-0.0441, 0.054], [-0.038, 0.0471],
  ] as readonly ProfilePoint[],
  /** Rear-sight leaf raised to battle range; its aperture is centred on the sight line. */
  rearSightLeaf: { z: -0.0661, bottomY: 0.054, width: 0.018, aperture: 0.0065 },
  /** Ribbed forearm under the barrel. */
  forearm: [
    [-0.0608, -0.0008], [-0.3215, -0.0008], [-0.326, -0.0053], [-0.326, -0.0707], [-0.32, -0.0775],
    [-0.0745, -0.0775], [-0.0646, -0.073], [-0.0608, -0.0654],
  ] as readonly ProfilePoint[],
  /** Slotted heat shield over the barrel, on top of the forearm. */
  heatShield: [
    [-0.0935, 0.0357], [-0.1026, 0.0403], [-0.3215, 0.0334], [-0.3306, 0.0312], [-0.3306, -0.0008], [-0.0935, -0.0008],
  ] as readonly ProfilePoint[],
  heatShieldSlots: { firstZ: -0.1277, pitch: 0.019, count: 10, topY: 0.0289, bottomY: 0.0091, width: 0.0091 },
  barrel: { rearZ: -0.0935, frontZ: -0.6863, rearRadius: 0.0148, frontRadius: 0.0129 },
  barrelBand: { rearZ: -0.5024, frontZ: -0.5191, radius: 0.0162 },
  /** Gas cylinder slung under the barrel, with its hex nut ahead of the band. */
  gasCylinder: {
    rearZ: -0.3595, nutZ: -0.5039, nutFrontZ: -0.5229, frontZ: -0.6065,
    y: -0.0384, radius: 0.0175, nutRadius: 0.0198, frontRadius: 0.0156,
  },
  gasBlock: [[-0.3504, 0.0008], [-0.3732, 0.0008], [-0.3732, -0.0479], [-0.3504, -0.0479]] as readonly ProfilePoint[],
  gasBand: [[-0.4469, -0.0008], [-0.4659, -0.0008], [-0.4659, -0.0479], [-0.4469, -0.0479]] as readonly ProfilePoint[],
  gasStud: { z: -0.4583, topY: -0.054, bottomY: -0.073 },
  /** Tall triangular front sight on its barrel band; the apex is the sight line. */
  frontSight: {
    rearZ: -0.6012, apexRearZ: -0.6316, apexFrontZ: -0.6437, frontZ: -0.662, baseY: 0.0114,
    bandRearZ: -0.5996, bandFrontZ: -0.665, bandRadius: 0.0168,
  },
  frontSightHole: [[-0.6194, 0.0205], [-0.6361, 0.0813], [-0.6475, 0.0205]] as readonly ProfilePoint[],
  /** Four-prong slotted flash hider: collar, rear ring, prongs, front ring. */
  flashHider: { collarZ: -0.662, rearZ: -0.6863, slotRearZ: -0.7, slotFrontZ: -0.7608, frontZ: -0.7836, radius: 0.0167 },
  /** Perforated bipod legs hinged under the front sight; `deployed` is the leg splay in radians. */
  bipod: { pivotZ: -0.6582, pivotY: -0.0654, length: 0.275, width: 0.033, deployed: 0.38 },
  yoke: [[-0.6468, -0.0053], [-0.6711, -0.0053], [-0.6711, -0.073], [-0.6468, -0.073]] as readonly ProfilePoint[],
  slingSwivel: { z: -0.3405, y: -0.0882 },
  triggerGuard: [
    [0.022, -0.0722], [-0.019, -0.0722], [-0.019, -0.1072], [0.0068, -0.1072], [0.0167, -0.1003], [0.022, -0.0859],
  ] as readonly ProfilePoint[],
  triggerOpening: [
    [0.016, -0.0745], [-0.0137, -0.0745], [-0.0137, -0.1018], [0.0053, -0.1018], [0.0122, -0.0958], [0.016, -0.0851],
  ] as readonly ProfilePoint[],
  trigger: [
    [0.0068, -0.0737], [-0.0008, -0.0737], [-0.003, -0.0859], [-0.0068, -0.098], [-0.0038, -0.1003], [0.0023, -0.0889],
  ] as readonly ProfilePoint[],
  /** 100-round olive belt pouch hung under the left of the feed tray (center and size). */
  pouch: { x: -0.042, y: -0.1387, z: -0.0943, width: 0.068, height: 0.1284, depth: 0.1581, flap: 0.029 },
} as const;

/** Triangular front sight outline, apex level with `sightY`. */
export function m60FrontSight(sightY: number): ProfilePoint[] {
  const sight = M60_PROFILE.frontSight;
  return [[sight.rearZ, sight.baseY], [sight.apexRearZ, sightY], [sight.apexFrontZ, sightY], [sight.frontZ, sight.baseY]];
}

/** Top of the raised rear-sight leaf, just above its aperture. */
export function m60LeafTop(sightY: number): number {
  return sightY + M60_PROFILE.rearSightLeaf.aperture + 0.0045;
}

/** Rounded slot from `topY` to `bottomY`, `radius` wide on each side of `z`. */
function slot(z: number, topY: number, bottomY: number, radius: number): ProfilePoint[] {
  const points: ProfilePoint[] = [];
  for (let i = 0; i <= 4; i++) {
    const angle = (Math.PI * i) / 4;
    points.push([z + Math.cos(angle) * radius, topY - radius + Math.sin(angle) * radius]);
  }
  for (let i = 0; i <= 4; i++) {
    const angle = Math.PI + (Math.PI * i) / 4;
    points.push([z + Math.cos(angle) * radius, bottomY + radius + Math.sin(angle) * radius]);
  }
  return points;
}

/** The heat shield's cooling slots, rear to front. */
export function m60HeatShieldSlots(): ProfilePoint[][] {
  const { firstZ, pitch, count, topY, bottomY, width } = M60_PROFILE.heatShieldSlots;
  return Array.from({ length: count }, (_, i) => slot(firstZ - i * pitch, topY, bottomY, width / 2));
}

/**
 * One bipod leg swung `angle` radians from straight down toward the stock
 * (PI / 2 folds it back under the gas cylinder): the perforated plate, its
 * lightening holes and the foot pad.
 */
export function m60BipodLeg(angle: number): { plate: ProfilePoint[]; holes: ProfilePoint[][]; foot: ProfilePoint[] } {
  const { pivotZ, pivotY, length, width } = M60_PROFILE.bipod;
  const along: ProfilePoint = [Math.sin(angle), -Math.cos(angle)];
  const across: ProfilePoint = [Math.cos(angle), Math.sin(angle)];
  const at = (u: number, v: number): ProfilePoint =>
    [pivotZ + along[0] * u + across[0] * v, pivotY + along[1] * u + across[1] * v];
  const half = width / 2;
  const plate = [
    at(0, -half * 0.45), at(0.03, -half), at(length - 0.006, -half), at(length, -half * 0.5),
    at(length, half * 0.5), at(length - 0.006, half), at(0.03, half), at(0, half * 0.45),
  ];
  const holes = Array.from({ length: 8 }, (_, hole) => Array.from({ length: 8 }, (_, i) => {
    const turn = (Math.PI * 2 * i) / 8;
    return at(0.05 + hole * 0.028 + Math.cos(turn) * 0.0055, Math.sin(turn) * 0.0055);
  }));
  const foot = [at(length - 0.004, -0.022), at(length + 0.006, -0.022), at(length + 0.006, 0.022), at(length - 0.004, 0.022)];
  return { plate, holes, foot };
}

let flutes: THREE.CanvasTexture | null | undefined;
let weave: THREE.CanvasTexture | null | undefined;

/** Horizontal moulded flutes, 4 mm apart; extrusion cap UVs are in meters. */
function fluteTexture(): THREE.CanvasTexture | null {
  if (flutes !== undefined) return flutes;
  flutes = canvasTexture(16, 64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 16, 64);
    for (let y = 0; y < 64; y += 4) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
      ctx.fillRect(0, y, 16, 1.6);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(0, y + 1.6, 16, 0.6);
    }
  });
  if (flutes) {
    flutes.colorSpace = THREE.SRGBColorSpace;
    flutes.repeat.set(1 / 0.064, 1 / 0.064);
  }
  return flutes;
}

/** Nylon weave tinted by the pouch color: crossing threads and slubs. */
function weaveTexture(): THREE.CanvasTexture | null {
  if (weave !== undefined) return weave;
  const random = seededRandom(60);
  weave = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#e4e4e4';
    ctx.fillRect(0, 0, 128, 128);
    for (let line = 0; line < 128; line += 2) {
      ctx.fillStyle = `rgba(40, 40, 30, ${0.08 + random() * 0.1})`;
      ctx.fillRect(0, line, 128, 1);
      ctx.fillStyle = `rgba(40, 40, 30, ${0.05 + random() * 0.08})`;
      ctx.fillRect(line, 0, 1, 128);
    }
    for (let slub = 0; slub < 160; slub++) {
      ctx.fillStyle = `rgba(255, 255, 240, ${0.06 + random() * 0.1})`;
      ctx.fillRect(random() * 128, random() * 128, 3 + random() * 6, 1);
    }
  });
  if (weave) {
    weave.colorSpace = THREE.SRGBColorSpace;
    weave.repeat.set(5, 5);
  }
  return weave;
}

/** Profile translated so `origin` (z, y) becomes the local origin of an animated part. */
function relative(points: readonly ProfilePoint[], origin: { readonly z: number; readonly y: number }): ProfilePoint[] {
  return points.map(([z, y]) => [z - origin.z, y - origin.y]);
}

/**
 * M60 view model: fluted polymer butt and broad pistol grip, a stamped
 * receiver with its riveted plates, front-hinged feed cover and raised
 * aperture leaf, the ribbed forearm under a slotted heat shield, the
 * exposed barrel with the gas cylinder slung beneath, the tall triangular
 * front sight, a four-prong flash hider and the perforated bipod folded
 * back under the gas cylinder. Reload contract (ReloadAnimator 'belt'
 * style): the olive belt pouch with its brass belt is the magazine, the
 * feed cover swings its rear edge up and the right-flank handle racks +Z.
 */
export function buildM60(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'm60-root';
  const sightY = config.sightHeight;
  const wear = steelWearTexture();
  const steel = new THREE.MeshStandardMaterial({
    color: config.bodyColor, metalness: 0.72, roughness: wear ? 0.82 : 0.52, roughnessMap: wear, envMapIntensity: 1.2,
  });
  const brightSteel = new THREE.MeshStandardMaterial({ color: 0x7c8186, metalness: 0.9, roughness: 0.34, envMapIntensity: 1.3 });
  const recess = new THREE.MeshStandardMaterial({ color: 0x17191b, metalness: 0.6, roughness: 0.6, envMapIntensity: 0.7 });
  const polymer = new THREE.MeshStandardMaterial({ color: config.accentColor, metalness: 0.05, roughness: 0.74, envMapIntensity: 0.8 });
  const fluted = polymer.clone();
  fluted.map = fluteTexture();
  const weaveMap = weaveTexture();
  const fabric = new THREE.MeshStandardMaterial({ color: config.reloadAnim!.magColor, map: weaveMap, metalness: 0, roughness: 0.95 });
  const flap = fabric.clone();
  flap.color.multiplyScalar(1.18);
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a54e, metalness: 0.9, roughness: 0.32, envMapIntensity: 1.3 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xb4683c, metalness: 0.85, roughness: 0.36, envMapIntensity: 1.2 });
  const bore = new THREE.MeshBasicMaterial({ color: 0x030404 });

  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    parent: THREE.Object3D, x = 0, y = 0, z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `m60-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `m60-${name}`;
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };
  const P = M60_PROFILE;
  const rounded = { segments: 3, keepOutline: true } as const;

  // Stock: polymer butt, slimmer along the comb tube, fluted flanks.
  const stock = assembly('stock');
  const butt = extrudeProfile(profileShape(P.stock), 0.046, 0.008, rounded);
  add('butt', shapeWidth(butt, (_y, z) => THREE.MathUtils.lerp(0.78, 1, THREE.MathUtils.clamp((z - 0.19) / 0.03, 0, 1))), polymer, stock);
  for (const side of [-1, 1]) add('butt-flutes', extrudeProfile(profileShape(P.flutes), 0.0012), fluted, stock, side * 0.0233);
  add('shoulder-swivel', new THREE.TorusGeometry(0.0085, 0.0016, 5, 12).rotateY(Math.PI / 2), steel, stock, 0, 0.054, 0.299);

  const grip = assembly('grip');
  add('grip-body', extrudeProfile(profileShape(P.grip), 0.032, 0.007, rounded), polymer, grip);

  // Receiver: a recessed core between two plates, so the charging slot is a real channel.
  const receiver = assembly('receiver');
  const core = RECEIVER_WIDTH - PLATE * 2;
  add('receiver-core', extrudeProfile(profileShape(P.receiver), core + 0.001), recess, receiver);
  for (const side of [-1, 1]) {
    const plate = profileShape(P.receiver);
    if (side > 0) plate.holes.push(profilePath(P.chargingSlot));
    add('receiver-plate', extrudeProfile(plate, PLATE, 0.001), steel, receiver, side * (core / 2 + PLATE / 2));
    for (const [z, y] of [[0.17, -0.03], [0.125, -0.03], [0.066, 0.004], [0.012, 0.012], [-0.028, 0.012], [0.048, -0.058], [-0.036, -0.058]]) {
      add('rivet', new THREE.CylinderGeometry(0.0026, 0.0026, 0.002, 8).rotateZ(Math.PI / 2), steel, receiver, side * (RECEIVER_WIDTH / 2 + 0.0005), y, z);
    }
  }
  add('feed-tray', new THREE.BoxGeometry(0.042, 0.003, 0.1), brightSteel, receiver, 0, 0.04, 0.006);
  add('rear-sight-base', extrudeProfile(profileShape(P.rearSightBase), 0.03, 0.001), steel, receiver);
  const leaf = P.rearSightLeaf;
  const leafShape = new THREE.Shape();
  leafShape.moveTo(-leaf.width / 2, leaf.bottomY);
  leafShape.lineTo(leaf.width / 2, leaf.bottomY);
  leafShape.lineTo(leaf.width / 2, m60LeafTop(sightY));
  leafShape.lineTo(-leaf.width / 2, m60LeafTop(sightY));
  leafShape.closePath();
  const aperture = new THREE.Path();
  aperture.absarc(0, sightY, leaf.aperture, 0, Math.PI * 2, true);
  leafShape.holes.push(aperture);
  // Ladder window below the aperture, so the leaf reads as a frame.
  const half = leaf.width / 2 - 0.003;
  const ladder = new THREE.Path();
  ladder.moveTo(-half, leaf.bottomY + 0.007);
  ladder.lineTo(-half, sightY - leaf.aperture - 0.005);
  ladder.lineTo(half, sightY - leaf.aperture - 0.005);
  ladder.lineTo(half, leaf.bottomY + 0.007);
  ladder.closePath();
  leafShape.holes.push(ladder);
  const leafGeometry = new THREE.ExtrudeGeometry(leafShape, { depth: 0.003, bevelEnabled: false, curveSegments: 16 });
  add('rear-sight-leaf', leafGeometry, steel, receiver, 0, 0, leaf.z - 0.0015);
  add('rear-sight-ring', new THREE.TorusGeometry(leaf.aperture + 0.0012, 0.0012, 6, 18), steel, receiver, 0, sightY, leaf.z + 0.0018);
  add('windage-knob', new THREE.CylinderGeometry(0.0045, 0.0045, 0.008, 12).rotateZ(Math.PI / 2), steel, receiver, 0.019, 0.045, -0.072);
  const guard = profileShape(P.triggerGuard);
  guard.holes.push(profilePath(P.triggerOpening));
  add('trigger-guard', extrudeProfile(guard, 0.012, 0.0008), steel, receiver);
  add('trigger', extrudeProfile(profileShape(P.trigger), 0.006), steel, receiver);

  // Feed cover: hinged at its front, so the animator's swing lifts the rear edge.
  const hinge = P.coverHinge;
  const cover = assembly('cover', 0, hinge.y, hinge.z);
  add('cover-body', extrudeProfile(profileShape(relative(P.cover, hinge)), 0.046, 0.0015), steel, cover);
  add('cover-latch', extrudeProfile(profileShape(relative(P.coverLatch, hinge)), 0.04, 0.001), brightSteel, cover);
  add('cover-hinge-pin', new THREE.CylinderGeometry(0.0038, 0.0038, 0.05, 10).rotateZ(Math.PI / 2), steel, cover);

  // Forearm: ribbed polymer under the slotted heat shield.
  const forearm = assembly('forearm');
  add('forearm-body', extrudeProfile(profileShape(P.forearm), 0.06, 0.006, rounded), polymer, forearm);
  for (const side of [-1, 1]) {
    for (let rib = 0; rib < 15; rib++) {
      add('forearm-rib', new THREE.CylinderGeometry(0.0028, 0.0028, 0.05, 6, 1, true), polymer, forearm, side * 0.0293, -0.042, -0.088 - rib * 0.0158);
    }
    for (const z of [-0.128, -0.179, -0.246, -0.307]) {
      add('forearm-screw', new THREE.CylinderGeometry(0.0034, 0.0034, 0.002, 10).rotateZ(Math.PI / 2), steel, forearm, side * 0.0305, -0.0098, z);
    }
  }
  const shield = profileShape(P.heatShield);
  for (const hole of m60HeatShieldSlots()) shield.holes.push(profilePath(hole));
  add('heat-shield', extrudeProfile(shield, 0.048), steel, forearm);
  // Dark liner inside the shield: the slots read as openings, not as holes to the background.
  const slots = P.heatShieldSlots;
  const slotSpan = slots.pitch * (slots.count - 1) + slots.width * 2;
  add('heat-shield-liner', new THREE.BoxGeometry(0.04, slots.topY - slots.bottomY + 0.002, slotSpan), recess, forearm, 0, (slots.topY + slots.bottomY) / 2, slots.firstZ - slotSpan / 2 + slots.width);
  const swivel = P.slingSwivel;
  add('sling-mount', new THREE.BoxGeometry(0.012, 0.01, 0.014), steel, forearm, 0, -0.08, swivel.z);
  add('sling-swivel', new THREE.TorusGeometry(0.0095, 0.0016, 5, 12).rotateY(Math.PI / 2), steel, forearm, 0, swivel.y, swivel.z);

  // Barrel group: barrel, gas system, front sight and the flash hider.
  const barrelGroup = assembly('barrel');
  const barrel = P.barrel;
  const barrelLength = barrel.rearZ - barrel.frontZ;
  add('barrel-core', cylinderZ(barrel.rearRadius, barrel.frontRadius, barrelLength, 16), steel, barrelGroup, 0, 0, barrel.rearZ - barrelLength / 2);
  const band = P.barrelBand;
  add('barrel-band', cylinderZ(band.radius, band.radius, band.rearZ - band.frontZ, 16), steel, barrelGroup, 0, 0, (band.rearZ + band.frontZ) / 2);
  const gas = P.gasCylinder;
  add('gas-cylinder', cylinderZ(gas.radius, gas.radius, gas.rearZ - gas.nutZ, 16), steel, barrelGroup, 0, gas.y, (gas.rearZ + gas.nutZ) / 2);
  add('gas-nut', cylinderZ(gas.nutRadius, gas.nutRadius, gas.nutZ - gas.nutFrontZ, 6), steel, barrelGroup, 0, gas.y, (gas.nutZ + gas.nutFrontZ) / 2);
  add('gas-extension', cylinderZ(gas.frontRadius, gas.frontRadius * 0.96, gas.nutFrontZ - gas.frontZ, 16), steel, barrelGroup, 0, gas.y, (gas.nutFrontZ + gas.frontZ) / 2);
  add('gas-plug', cylinderZ(gas.frontRadius * 0.8, gas.frontRadius * 0.55, 0.005, 12), steel, barrelGroup, 0, gas.y, gas.frontZ - 0.0025);
  add('gas-block', extrudeProfile(profileShape(P.gasBlock), 0.026, 0.001), steel, barrelGroup);
  add('gas-band', extrudeProfile(profileShape(P.gasBand), 0.022, 0.001), steel, barrelGroup);
  const stud = P.gasStud;
  add('gas-stud', new THREE.CylinderGeometry(0.006, 0.006, stud.topY - stud.bottomY, 10), steel, barrelGroup, 0, (stud.topY + stud.bottomY) / 2, stud.z);
  const sight = P.frontSight;
  add('front-sight-band', cylinderZ(sight.bandRadius, sight.bandRadius, sight.bandRearZ - sight.bandFrontZ, 16), steel, barrelGroup, 0, 0, (sight.bandRearZ + sight.bandFrontZ) / 2);
  const sightShape = profileShape(m60FrontSight(sightY));
  sightShape.holes.push(profilePath(P.frontSightHole));
  add('front-sight', extrudeProfile(sightShape, 0.0055), steel, barrelGroup);
  const hider = P.flashHider;
  add('hider-collar', cylinderZ(barrel.frontRadius + 0.0016, hider.radius, hider.collarZ - hider.rearZ, 16), steel, barrelGroup, 0, 0, (hider.collarZ + hider.rearZ) / 2);
  add('hider-rear-ring', cylinderZ(hider.radius, hider.radius, hider.rearZ - hider.slotRearZ, 16), steel, barrelGroup, 0, 0, (hider.rearZ + hider.slotRearZ) / 2);
  add('hider-front-ring', cylinderZ(hider.radius, hider.radius * 0.97, hider.slotFrontZ - hider.frontZ, 16), steel, barrelGroup, 0, 0, (hider.slotFrontZ + hider.frontZ) / 2);
  const slotLength = hider.slotRearZ - hider.slotFrontZ;
  const gap = 0.27;
  for (let prong = 0; prong < 4; prong++) {
    const start = (Math.PI / 2) * prong + gap / 2;
    const end = start + Math.PI / 2 - gap;
    const section = new THREE.Shape();
    section.absarc(0, 0, hider.radius, start, end, false);
    section.absarc(0, 0, hider.radius - 0.004, end, start, true);
    const geometry = new THREE.ExtrudeGeometry(section, { depth: slotLength, bevelEnabled: false, curveSegments: 4 });
    add('hider-prong', geometry, steel, barrelGroup, 0, 0, hider.slotFrontZ);
  }
  add('hider-core', cylinderZ(hider.radius - 0.004, hider.radius - 0.004, slotLength, 12), recess, barrelGroup, 0, 0, (hider.slotRearZ + hider.slotFrontZ) / 2);
  add('bore', new THREE.CircleGeometry(hider.radius - 0.005, 14).rotateY(Math.PI), bore, barrelGroup, 0, 0, hider.frontZ - 0.0003);

  // Bipod folded back along the gas cylinder: yoke, cross bolt, perforated legs.
  const bipod = assembly('bipod');
  const legs = P.bipod;
  add('bipod-yoke', extrudeProfile(profileShape(P.yoke), 0.03, 0.0015), steel, bipod);
  add('bipod-bolt', new THREE.CylinderGeometry(0.0065, 0.0065, 0.058, 12).rotateZ(Math.PI / 2), steel, bipod, 0, legs.pivotY, legs.pivotZ);
  const folded = m60BipodLeg(Math.PI / 2);
  for (const side of [-1, 1]) {
    const leg = profileShape(folded.plate);
    for (const hole of folded.holes) leg.holes.push(profilePath(hole));
    add('bipod-leg', extrudeProfile(leg, 0.004), steel, bipod, side * 0.023);
    add('bipod-foot', extrudeProfile(profileShape(folded.foot), 0.012, 0.001), steel, bipod, side * 0.023);
  }

  // Charging handle at the front of its slot; the animator racks it +Z.
  const charging = P.chargingHandle;
  const handle = assembly('charging-handle', RECEIVER_WIDTH / 2, charging.y, charging.z);
  add('charging-handle-stem', new THREE.BoxGeometry(0.012, 0.007, 0.01), steel, handle, 0.002);
  add('charging-handle-knob', new THREE.CylinderGeometry(0.0072, 0.0082, 0.016, 12).rotateZ(Math.PI / 2), steel, handle, 0.014);

  // Belt pouch (the reload "magazine") with the brass belt rising into the feed tray.
  const bag = P.pouch;
  const magazine = assembly('magazine', bag.x, bag.y, bag.z);
  add('pouch-body', new RoundedBoxGeometry(bag.width, bag.height, bag.depth, 3, 0.011), fabric, magazine);
  add('pouch-flap', new RoundedBoxGeometry(bag.width + 0.004, bag.flap, bag.depth + 0.004, 2, 0.008), flap, magazine, 0, (bag.height - bag.flap) / 2 + 0.001);
  add('pouch-clip', new THREE.BoxGeometry(0.003, 0.016, 0.068), recess, magazine, bag.width / 2 + 0.0012, 0.0262, 0.0426);
  const rounds = 8;
  for (let i = 0; i < rounds; i++) {
    const t = i / (rounds - 1);
    const x = -0.037 - 0.008 * Math.sin(Math.PI * t) - bag.x;
    const y = -0.068 + t * 0.1 - bag.y;
    const z = -0.028 - bag.z;
    add('round-case', cylinderZ(0.006, 0.006, 0.05, 8), brass, magazine, x, y, z + 0.01);
    add('round-bullet', cylinderZ(0.0045, 0.0014, 0.022, 8), copper, magazine, x, y, z - 0.026);
    add('belt-link', new THREE.BoxGeometry(0.015, 0.0135, 0.008), recess, magazine, x, y, z + 0.02);
  }

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0, hider.frontZ - 0.003).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.03, 0.004, -0.016).multiplyScalar(config.scale),
    sightY: sightY * config.scale,
    reloadParts: { magazine, cover, handle },
  };
}
