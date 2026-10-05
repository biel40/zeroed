import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  cylinderZ, extrudeProfile, profilePath, profileShape, shapeWidth, type ProfilePoint,
} from './ProfileGeometry';
import { canvasTexture, seededRandom } from './ProceduralTextures';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/** Outer width of the milled receiver; the side plates carry its recesses. */
const RECEIVER_WIDTH = 0.03;
const PLATE = 0.004;

/**
 * AK-47 Type 3 side profiles traced from a reference photo at ~1 mm/px
 * (880 mm overall, 415 mm barrel). They are shared by the first-person model
 * and the wall-buy silhouette so both always describe the same rifle. The
 * trigger sits at z = 0 and the bore on y = 0.
 */
export const AK47_PROFILE = {
  /** Fixed stock: tang under the receiver, straight comb, slanted butt, belly. */
  stock: [
    [0.108, -0.004], [0.2, -0.013], [0.336, -0.025], [0.342, -0.03], [0.33, -0.12],
    [0.322, -0.124], [0.25, -0.1], [0.16, -0.072], [0.13, -0.064], [0.112, -0.05],
  ] as readonly ProfilePoint[],
  /** Steel buttplate capping the slanted butt. */
  buttplate: [[0.337, -0.024], [0.348, -0.027], [0.336, -0.127], [0.325, -0.125]] as readonly ProfilePoint[],
  /** Swept-back wooden pistol grip, embedded in the receiver bottom. */
  grip: [
    [0.036, -0.042], [0.04, -0.07], [0.05, -0.105], [0.059, -0.134], [0.067, -0.147],
    [0.082, -0.153], [0.103, -0.151], [0.112, -0.142], [0.107, -0.11], [0.099, -0.072], [0.095, -0.042],
  ] as readonly ProfilePoint[],
  /** Milled receiver: front trunnion, magazine well, fire-control housing, rear tang. */
  receiver: [
    [0.118, 0.01], [-0.162, 0.01], [-0.162, -0.026], [-0.152, -0.04], [-0.1, -0.045],
    [-0.036, -0.046], [0.03, -0.046], [0.1, -0.04], [0.118, -0.03],
  ] as readonly ProfilePoint[],
  /** Long Type 3 lightening cut milled into both flanks above the magazine well. */
  lighteningCut: [
    [-0.044, -0.01], [-0.14, -0.01], [-0.144, -0.014], [-0.144, -0.028],
    [-0.14, -0.032], [-0.044, -0.032], [-0.04, -0.028], [-0.04, -0.014],
  ] as readonly ProfilePoint[],
  /** Right-flank ejection port under the dust cover; the carrier shows through. */
  ejectionPort: [[-0.04, 0.0085], [-0.118, 0.0085], [-0.118, 0.002], [-0.04, 0.002]] as readonly ProfilePoint[],
  /** Rounded dust cover spanning the receiver top (rear, front, top height). */
  dustCover: { rearZ: 0.116, frontZ: -0.12, bottomY: 0.006, topY: 0.031, width: 0.0304 },
  /** Rear sight block on the front trunnion; it carries the tangent leaf. */
  rearSightBlock: [
    [-0.12, 0.031], [-0.172, 0.031], [-0.2, 0.025], [-0.204, 0.012], [-0.204, 0], [-0.12, 0],
  ] as readonly ProfilePoint[],
  /** Tangent leaf: hinged at the front, notch at the rear end. */
  tangentLeaf: { hingeZ: -0.188, notchZ: -0.124, hingeY: 0.034 },
  barrel: { rearZ: -0.162, frontZ: -0.52, rearRadius: 0.0105, frontRadius: 0.0085 },
  /** Thread-protector nut and the true muzzle face. */
  muzzleNut: { rearZ: -0.52, frontZ: -0.536, radius: 0.0088 },
  gasTube: { rearZ: -0.196, frontZ: -0.404, y: 0.024, radius: 0.0085 },
  /** Gas block: barrel collar plus the angled riser up to the tube. */
  gasBlock: [
    [-0.402, 0.034], [-0.424, 0.034], [-0.442, 0.012], [-0.442, 0.002], [-0.41, 0.002], [-0.402, 0.012],
  ] as readonly ProfilePoint[],
  upperHandguard: [
    [-0.198, 0.0395], [-0.296, 0.0395], [-0.31, 0.035], [-0.312, 0.013], [-0.198, 0.013],
  ] as readonly ProfilePoint[],
  /** Lower handguard with its palm swell. */
  lowerHandguard: [
    [-0.158, 0.013], [-0.306, 0.013], [-0.314, 0.008], [-0.316, -0.014], [-0.308, -0.026],
    [-0.28, -0.031], [-0.2, -0.032], [-0.172, -0.03], [-0.158, -0.022],
  ] as readonly ProfilePoint[],
  /** Front sight tower (below the ears) and the protective ears, up to the sight line. */
  frontSightTower: [
    [-0.482, 0.008], [-0.515, 0.008], [-0.515, 0.027], [-0.494, 0.027],
  ] as readonly ProfilePoint[],
  frontSightEar: [
    [-0.493, 0.024], [-0.515, 0.024], [-0.515, 0.04], [-0.51, 0.046], [-0.502, 0.046], [-0.497, 0.036],
  ] as readonly ProfilePoint[],
  frontSightPostZ: -0.506,
  cleaningRod: { rearZ: -0.31, frontZ: -0.522, y: -0.016 },
  /** Stamped trigger guard loop (outline and opening) and the magazine catch paddle. */
  triggerGuard: [
    [0.036, -0.044], [0.036, -0.056], [0.028, -0.074], [0.012, -0.081],
    [-0.026, -0.081], [-0.034, -0.074], [-0.036, -0.044],
  ] as readonly ProfilePoint[],
  triggerOpening: [
    [0.029, -0.042], [0.029, -0.056], [0.022, -0.07], [0.01, -0.075],
    [-0.022, -0.075], [-0.028, -0.069], [-0.029, -0.042],
  ] as readonly ProfilePoint[],
  magazineCatch: [[-0.034, -0.044], [-0.04, -0.044], [-0.042, -0.07], [-0.037, -0.074], [-0.034, -0.07]] as readonly ProfilePoint[],
  /**
   * 30-round 7.62x39 magazine on a circular spine: `rake` radians forward
   * at the well, `bend` more by the floorplate, `length` meters below the
   * well. The well point is the magazine's pivot for the rock-in reload.
   */
  magazine: {
    wellZ: -0.07, wellY: -0.045, length: 0.19, rake: 0.3, bend: 0.44,
    topDepth: 0.059, bottomDepth: 0.053, width: 0.03, hidden: 0.01,
  },
  /** Charging handle at rest, at the front of the ejection port. */
  chargingHandleZ: -0.112,
} as const;

/** Magazine-local [z, y] on the curved spine at arc length `s`, `offset` meters toward the muzzle. */
function magazinePoint(s: number, offset: number): ProfilePoint {
  const { rake, bend, length } = AK47_PROFILE.magazine;
  const curvature = bend / length;
  const angle = rake + curvature * s;
  const z = (Math.cos(angle) - Math.cos(rake)) / curvature;
  const y = -(Math.sin(angle) - Math.sin(rake)) / curvature;
  return [z - Math.cos(angle) * offset, y + Math.sin(angle) * offset];
}

function magazineDepth(s: number): number {
  const { topDepth, bottomDepth, length } = AK47_PROFILE.magazine;
  return topDepth + (bottomDepth - topDepth) * THREE.MathUtils.clamp(s / length, 0, 1);
}

/** Band between two spine offsets from arc length `from` to `to` (magazine-local). */
function magazineBand(from: number, to: number, offset: (s: number) => readonly [number, number]): ProfilePoint[] {
  const steps = 14;
  const front: ProfilePoint[] = [];
  const rear: ProfilePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = from + ((to - from) * i) / steps;
    const [frontOffset, rearOffset] = offset(s);
    front.push(magazinePoint(s, frontOffset));
    rear.push(magazinePoint(s, rearOffset));
  }
  return [...front, ...rear.reverse()];
}

/**
 * Banana magazine body outline in magazine-local [z, y]. The top is cut
 * level `hidden` meters up into the well, below the lightening cuts.
 */
export function ak47MagazineOutline(): ProfilePoint[] {
  const { hidden, length } = AK47_PROFILE.magazine;
  const band = magazineBand(0, length, (s) => [magazineDepth(s) / 2, -magazineDepth(s) / 2]);
  return [[band[0][0], hidden], ...band, [band[band.length - 1][0], hidden]];
}

/** Floorplate with its front and rear lips, magazine-local. */
export function ak47MagazineFloorplate(): ProfilePoint[] {
  const { length } = AK47_PROFILE.magazine;
  const half = magazineDepth(length) / 2;
  return [
    magazinePoint(length - 0.002, half + 0.003), magazinePoint(length + 0.006, half + 0.003),
    magazinePoint(length + 0.006, -half - 0.004), magazinePoint(length - 0.002, -half - 0.004),
  ];
}

let woodGrain: THREE.CanvasTexture | null | undefined;
let steelWear: THREE.CanvasTexture | null | undefined;

/**
 * Birch grain tinted by the material color: long wavy latewood lines,
 * broad growth bands and sparse pores. Extrusion UVs are in meters, so the
 * repeat maps one tile to 42 x 10.5 cm with the grain along the furniture.
 */
function woodGrainTexture(): THREE.CanvasTexture | null {
  if (woodGrain !== undefined) return woodGrain;
  const random = seededRandom(47);
  woodGrain = canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = '#efe6dc';
    ctx.fillRect(0, 0, 512, 128);
    for (let band = 0; band < 9; band++) {
      ctx.fillStyle = `rgba(150, 92, 55, ${0.04 + random() * 0.06})`;
      ctx.fillRect(0, random() * 128, 512, 4 + random() * 14);
    }
    for (let line = 0; line < 70; line++) {
      const y0 = random() * 128;
      const amplitude = 0.6 + random() * 2.6;
      const frequency = (Math.PI * 2 * (1 + Math.floor(random() * 3))) / 512;
      const phase = random() * Math.PI * 2;
      const thickness = 0.6 + random() * 1.8;
      ctx.fillStyle = `rgba(96, 52, 28, ${0.05 + random() * 0.16})`;
      // Short rects instead of paths: cheap, and smoothed by texture filtering.
      for (let x = 0; x < 512; x += 2) {
        const y = y0 + Math.sin(x * frequency + phase) * amplitude + Math.sin(x * frequency * 3.1 + phase) * amplitude * 0.3;
        ctx.fillRect(x, y - thickness / 2, 2, thickness);
      }
    }
    for (let pore = 0; pore < 260; pore++) {
      ctx.fillStyle = `rgba(70, 36, 18, ${0.08 + random() * 0.14})`;
      ctx.fillRect(random() * 512, random() * 128, 2 + random() * 5, 0.8);
    }
  });
  if (woodGrain) {
    woodGrain.colorSpace = THREE.SRGBColorSpace;
    woodGrain.repeat.set(1 / 0.42, 1 / 0.105);
  }
  return woodGrain;
}

/** Roughness speckle and fine handling scratches for the blued steel. */
function steelWearTexture(): THREE.CanvasTexture | null {
  if (steelWear !== undefined) return steelWear;
  const random = seededRandom(1947);
  steelWear = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = 'rgb(140, 140, 140)';
    ctx.fillRect(0, 0, 128, 128);
    for (let speck = 0; speck < 900; speck++) {
      const value = 118 + Math.floor(random() * 50);
      ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
      ctx.fillRect(random() * 128, random() * 128, 1 + random() * 2, 1 + random() * 2);
    }
    ctx.fillStyle = 'rgba(90, 90, 90, 0.6)';
    for (let scratch = 0; scratch < 24; scratch++) {
      ctx.fillRect(random() * 128, random() * 128, 6 + random() * 26, 0.6);
    }
  });
  steelWear?.repeat.set(18, 18);
  return steelWear;
}

/** Rounded wooden furniture: generous creased bevels that keep the traced outline. */
function woodPart(points: readonly ProfilePoint[], width: number, bevel: number): THREE.BufferGeometry {
  return extrudeProfile(profileShape(points), width, bevel, { segments: 3, keepOutline: true });
}

/**
 * AK-47 Type 3 view model: lacquered birch stock, grip and two-piece
 * handguard over a blued milled receiver with its lightening cuts, rounded
 * dust cover, tangent rear sight, exposed gas tube and block, full-length
 * barrel with the eared front sight, cleaning rod and the curved 30-round
 * magazine. The magazine (ReloadAnimator 'rock' style, pivoting at the
 * well) and the right-flank charging handle with its bolt carrier are the
 * live reload parts.
 */
export function buildAk47(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'ak47-root';
  const sightY = config.sightHeight;
  const grain = woodGrainTexture();
  const wear = steelWearTexture();
  const steel = new THREE.MeshStandardMaterial({
    color: config.bodyColor, metalness: 0.78, roughness: wear ? 0.78 : 0.44, roughnessMap: wear, envMapIntensity: 1.3,
  });
  const recess = new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.75, roughness: 0.55, envMapIntensity: 0.8 });
  const carrierSteel = new THREE.MeshStandardMaterial({
    color: 0x80868b, metalness: 0.92, roughness: wear ? 0.5 : 0.28, roughnessMap: wear, envMapIntensity: 1.4,
  });
  const wood = new THREE.MeshPhysicalMaterial({
    color: config.accentColor, map: grain, metalness: 0, roughness: 0.55,
    clearcoat: 0.5, clearcoatRoughness: 0.32, envMapIntensity: 0.95,
  });
  // The grip's grain runs down its swept length instead of along the bore.
  const gripWood = wood.clone();
  if (grain) {
    gripWood.map = grain.clone();
    gripWood.map.rotation = Math.PI / 2 - 0.3;
    gripWood.map.needsUpdate = true;
  }
  const magazineSteel = new THREE.MeshStandardMaterial({
    color: config.reloadAnim!.magColor, metalness: 0.72, roughness: wear ? 0.85 : 0.5, roughnessMap: wear, envMapIntensity: 1.2,
  });
  const bore = new THREE.MeshBasicMaterial({ color: 0x030404 });

  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    parent: THREE.Object3D, x = 0, y = 0, z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ak47-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `ak47-${name}`;
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };
  const P = AK47_PROFILE;

  // Stock: rounded birch, slimmer at the wrist than at the butt, steel buttplate.
  const stock = assembly('stock');
  const stockWood = shapeWidth(woodPart(P.stock, 0.04, 0.009), (_y, z) => THREE.MathUtils.lerp(0.72, 1, THREE.MathUtils.clamp((z - 0.11) / 0.2, 0, 1)));
  add('stock-wood', stockWood, wood, stock);
  add('buttplate', extrudeProfile(profileShape(P.buttplate), 0.04, 0.003, { segments: 2 }), steel, stock);
  add('sling-swivel', new THREE.TorusGeometry(0.008, 0.0016, 5, 12).rotateY(Math.PI / 2), steel, stock, -0.02, -0.07, 0.27);

  const grip = assembly('grip');
  add('grip-wood', shapeWidth(woodPart(P.grip, 0.031, 0.008), (y) => THREE.MathUtils.lerp(0.86, 1, THREE.MathUtils.clamp((-0.046 - y) / 0.05, 0, 1))), gripWood, grip);

  // Receiver: a recessed core between two milled side plates, so the
  // lightening cuts and the ejection port are real cavities.
  const receiver = assembly('receiver');
  const core = RECEIVER_WIDTH - PLATE * 2;
  add('receiver-core', extrudeProfile(profileShape(P.receiver), core + 0.001), recess, receiver);
  for (const side of [-1, 1]) {
    const plate = profileShape(P.receiver);
    plate.holes.push(profilePath(P.lighteningCut));
    if (side > 0) plate.holes.push(profilePath(P.ejectionPort));
    add('receiver-plate', extrudeProfile(plate, PLATE, 0.0008), steel, receiver, side * (core / 2 + PLATE / 2));
  }
  const cover = P.dustCover;
  const coverShape = new THREE.Shape();
  const halfCover = cover.width / 2;
  const shoulder = cover.topY - 0.011;
  coverShape.moveTo(-halfCover, cover.bottomY);
  coverShape.lineTo(-halfCover, shoulder);
  coverShape.bezierCurveTo(-halfCover, cover.topY - 0.002, -0.008, cover.topY, 0, cover.topY);
  coverShape.bezierCurveTo(0.008, cover.topY, halfCover, cover.topY - 0.002, halfCover, shoulder);
  coverShape.lineTo(halfCover, cover.bottomY);
  coverShape.closePath();
  const coverLength = cover.rearZ - cover.frontZ;
  const coverGeometry = new THREE.ExtrudeGeometry(coverShape, {
    depth: coverLength, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0008, bevelSegments: 2, curveSegments: 8,
  });
  coverGeometry.translate(0, 0, cover.frontZ);
  add('dust-cover', toCreasedNormals(coverGeometry, Math.PI / 3.2), steel, receiver);
  add('recoil-spring-button', cylinderZ(0.0045, 0.0045, 0.008, 12), steel, receiver, 0, 0.019, cover.rearZ + 0.004);
  // Hammer and trigger pins, both flanks.
  for (const side of [-1, 1]) {
    for (const z of [0.012, 0.046]) {
      add('receiver-pin', new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 10).rotateZ(Math.PI / 2), steel, receiver, side * (RECEIVER_WIDTH / 2 + 0.0005), -0.032, z);
    }
  }
  // Selector: long flat lever on the right flank with its finger tab.
  add('selector-hub', new THREE.CylinderGeometry(0.0085, 0.0085, 0.002, 16).rotateZ(Math.PI / 2), steel, receiver, RECEIVER_WIDTH / 2 + 0.001, 0, 0.086);
  const selector = profileShape([[0.088, 0.006], [-0.05, 0], [-0.064, -0.001], [-0.066, -0.008], [-0.05, -0.011], [0.088, -0.006]]);
  add('selector-lever', extrudeProfile(selector, 0.0018, 0.0004), steel, receiver, RECEIVER_WIDTH / 2 + 0.0019);
  add('selector-tab', new RoundedBoxGeometry(0.006, 0.008, 0.005, 1, 0.0015), steel, receiver, RECEIVER_WIDTH / 2 + 0.004, -0.0045, -0.062);
  // Fire control under the receiver.
  const guard = profileShape(P.triggerGuard);
  guard.holes.push(profilePath(P.triggerOpening));
  add('trigger-guard', extrudeProfile(guard, 0.012, 0.0008), steel, receiver);
  add('magazine-catch', extrudeProfile(profileShape(P.magazineCatch), 0.014, 0.0008), steel, receiver);
  const trigger = profileShape([[-0.003, -0.044], [0.003, -0.044], [0.004, -0.056], [0.002, -0.066], [-0.004, -0.072], [-0.006, -0.07], [-0.002, -0.064], [-0.001, -0.056]]);
  add('trigger', extrudeProfile(trigger, 0.006), steel, receiver);
  // Rear sight block with the tangent leaf, slider and notch ears.
  add('rear-sight-block', extrudeProfile(profileShape(P.rearSightBlock), 0.026, 0.0012), steel, receiver);
  const leaf = P.tangentLeaf;
  const notchY = sightY - 0.003;
  const leafLength = leaf.hingeZ - leaf.notchZ;
  const leafGeometry = new THREE.BoxGeometry(0.014, 0.003, Math.abs(leafLength)).rotateX(-Math.atan2(notchY - 0.001 - leaf.hingeY, Math.abs(leafLength)));
  add('tangent-leaf', leafGeometry, steel, receiver, 0, (leaf.hingeY + notchY - 0.001) / 2, (leaf.hingeZ + leaf.notchZ) / 2);
  add('tangent-slider', new RoundedBoxGeometry(0.018, 0.006, 0.012, 1, 0.0015), steel, receiver, 0, leaf.hingeY + 0.0045, -0.162);
  for (const side of [-1, 1]) {
    add('tangent-cheek', new THREE.BoxGeometry(0.002, 0.008, 0.026), steel, receiver, side * 0.009, 0.034, -0.186);
    // Notch plate: two ears leaving a 3.5 mm U notch whose top rides the sight line.
    add('tangent-ear', new THREE.BoxGeometry(0.00625, 0.006, 0.006), steel, receiver, side * 0.0049, sightY - 0.003, leaf.notchZ);
  }
  add('gas-tube-lever', new RoundedBoxGeometry(0.004, 0.01, 0.014, 1, 0.0015), steel, receiver, 0.014, 0.02, -0.196);

  // Barrel group: tapered barrel, gas system, wooden handguards, front sight.
  const barrelGroup = assembly('barrel');
  const barrel = P.barrel;
  const barrelLength = barrel.rearZ - barrel.frontZ;
  add('barrel-core', cylinderZ(barrel.rearRadius, barrel.frontRadius, barrelLength, 16), steel, barrelGroup, 0, 0, barrel.rearZ - barrelLength / 2);
  const nut = P.muzzleNut;
  add('muzzle-nut', cylinderZ(nut.radius, nut.radius * 0.94, nut.rearZ - nut.frontZ, 16), steel, barrelGroup, 0, 0, (nut.rearZ + nut.frontZ) / 2);
  add('bore', new THREE.CircleGeometry(0.0039, 12).rotateY(Math.PI), bore, barrelGroup, 0, 0, nut.frontZ - 0.0002);
  const tube = P.gasTube;
  add('gas-tube', cylinderZ(tube.radius, tube.radius, tube.rearZ - tube.frontZ, 14), steel, barrelGroup, 0, tube.y, (tube.rearZ + tube.frontZ) / 2);
  add('gas-tube-collar', cylinderZ(tube.radius + 0.0016, tube.radius + 0.0016, 0.006, 14), steel, barrelGroup, 0, tube.y, -0.315);
  add('gas-block', extrudeProfile(profileShape(P.gasBlock), 0.02, 0.0015), steel, barrelGroup);
  add('gas-block-collar', cylinderZ(0.0125, 0.0125, 0.03, 16), steel, barrelGroup, 0, 0, -0.424);
  add('front-swivel', new THREE.TorusGeometry(0.0075, 0.0015, 5, 12).rotateY(Math.PI / 2), steel, barrelGroup, -0.0135, -0.011, -0.42);
  add('upper-handguard', woodPart(P.upperHandguard, 0.032, 0.0065), wood, barrelGroup);
  const lower = shapeWidth(woodPart(P.lowerHandguard, 0.046, 0.0085), (y) => 1 - 0.18 * Math.min(1, ((y + 0.012) / 0.025) ** 2));
  add('lower-handguard', lower, wood, barrelGroup);
  add('handguard-retainer', new RoundedBoxGeometry(0.032, 0.034, 0.01, 2, 0.006), steel, barrelGroup, 0, -0.008, -0.318);
  const rod = P.cleaningRod;
  add('cleaning-rod', cylinderZ(0.0028, 0.0028, rod.rearZ - rod.frontZ, 8), steel, barrelGroup, 0, rod.y, (rod.rearZ + rod.frontZ) / 2);
  add('front-sight-collar', cylinderZ(0.0125, 0.0125, 0.042, 16), steel, barrelGroup, 0, 0, -0.498);
  add('front-sight-lug', new RoundedBoxGeometry(0.014, 0.018, 0.034, 1, 0.003), steel, barrelGroup, 0, -0.014, -0.5);
  add('front-sight-tower', extrudeProfile(profileShape(P.frontSightTower), 0.017, 0.001), steel, barrelGroup);
  for (const side of [-1, 1]) {
    add('front-sight-ear', extrudeProfile(profileShape(P.frontSightEar), 0.0026), steel, barrelGroup, side * 0.0072);
  }
  const postHeight = sightY - 0.026;
  add('front-sight-post', new THREE.CylinderGeometry(0.0014, 0.0018, postHeight, 8), steel, barrelGroup, 0, 0.026 + postHeight / 2, P.frontSightPostZ);

  // Bolt carrier and charging handle: racked together by the animator.
  const handle = assembly('charging-handle', 0, 0, P.chargingHandleZ);
  add('bolt-carrier', new THREE.BoxGeometry(0.006, 0.0065, 0.07), carrierSteel, handle, 0.0085, 0.0052, 0.034);
  add('charging-handle-stem', new THREE.BoxGeometry(0.012, 0.005, 0.008), carrierSteel, handle, 0.017, 0.0055, 0);
  const knob = new THREE.SphereGeometry(0.0062, 12, 8);
  knob.scale(0.9, 0.8, 1.35);
  add('charging-handle-knob', knob, carrierSteel, handle, 0.025, 0.0075, -0.001);

  // Magazine: one curved stamped body with lengthwise ribs and floorplate.
  const mag = P.magazine;
  const magazine = assembly('magazine', 0, mag.wellY, mag.wellZ);
  add('magazine-body', extrudeProfile(profileShape(ak47MagazineOutline()), mag.width, 0.0016, { segments: 2 }), magazineSteel, magazine);
  for (const side of [-1, 1]) {
    for (const offset of [-0.012, 0.011]) {
      const rib = magazineBand(0.012, mag.length - 0.016, () => [offset + 0.0022, offset - 0.0022]);
      add('magazine-rib', extrudeProfile(profileShape(rib), 0.0016, 0.0005), magazineSteel, magazine, side * (mag.width / 2 + 0.0004));
    }
  }
  add('magazine-floorplate', extrudeProfile(profileShape(ak47MagazineFloorplate()), mag.width + 0.003, 0.001), magazineSteel, magazine);

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0, nut.frontZ - 0.003).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.018, 0.006, -0.08).multiplyScalar(config.scale),
    sightY: sightY * config.scale,
    reloadParts: { magazine, handle },
  };
}
