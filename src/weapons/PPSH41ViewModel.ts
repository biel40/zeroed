import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cylinderZ, extrudeProfile, profilePath, profileShape, shapeWidth, type ProfilePoint } from './ProfileGeometry';
import { steelWearTexture, woodGrainTexture } from './ProceduralTextures';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/** Metres, with the bore on y = 0 and the muzzle towards -Z. */
export const PPSH41_PROFILE = {
  boreY: 0,
  stock: [
    [-0.113, -0.026], [0.115, -0.026], [0.145, -0.039], [0.17, -0.037],
    [0.218, -0.005], [0.26, 0.016], [0.352, 0.026], [0.372, 0.019],
    [0.376, -0.083], [0.368, -0.095], [0.302, -0.105], [0.234, -0.092],
    [0.205, -0.085], [0.18, -0.081], [0.16, -0.083], [0.14, -0.087],
    [0.118, -0.087], [0.102, -0.082], [0.088, -0.07], [0.076, -0.062], [-0.105, -0.06],
  ] as readonly ProfilePoint[],
  receiver: [[0.127, 0.023], [-0.125, 0.023], [-0.125, -0.027], [0.127, -0.027]] as readonly ProfilePoint[],
  triggerGuard: [
    [0.078, -0.054], [0.075, -0.083], [0.065, -0.092], [-0.016, -0.092],
    [-0.027, -0.083], [-0.03, -0.055],
  ] as readonly ProfilePoint[],
  triggerOpening: [
    [0.072, -0.061], [0.069, -0.08], [0.062, -0.086], [-0.012, -0.086],
    [-0.021, -0.079], [-0.024, -0.061],
  ] as readonly ProfilePoint[],
  trigger: [[0.028, -0.055], [0.021, -0.059], [0.019, -0.069], [0.025, -0.079], [0.018, -0.08], [0.012, -0.071], [0.013, -0.057]] as readonly ProfilePoint[],
  shroud: { rearZ: -0.125, frontZ: -0.467, topY: 0.02, bottomY: -0.024, width: 0.04 },
  /** The drum's circular covers face fore/aft: its axis follows the bore. */
  magazine: { seat: [0, -0.033, -0.137] as const, centerY: -0.075, radius: 0.073, width: 0.146, depth: 0.048 },
  frontSightZ: -0.424,
  rearSightZ: 0.074,
  hoodRadius: 0.009,
  chargingHandle: [0.022, 0.006, -0.05] as const,
} as const;

/** A capsule in side-profile coordinates, with its long axis along the barrel. */
function capsule(z: number, y: number, length: number, height: number): ProfilePoint[] {
  const radius = height / 2;
  const straight = length / 2 - radius;
  const points: ProfilePoint[] = [];
  for (let end = 0; end < 2; end++) {
    const center = z + (end === 0 ? straight : -straight);
    for (let step = 0; step <= 4; step++) {
      const angle = -Math.PI / 2 + end * Math.PI + step * Math.PI / 4;
      points.push([center + Math.cos(angle) * radius, y + Math.sin(angle) * radius]);
    }
  }
  return points;
}

/** Actual open slots, shared with the wall drawing rather than painted black marks. */
export function ppsh41ShroudSlots(): readonly (readonly ProfilePoint[])[] {
  return Array.from({ length: 6 }, (_, slot) => capsule(-0.164 - slot * 0.049, -0.001, 0.036, 0.022));
}

/** Thin sight leaf in X/Y, centred on its Z position. */
function sightLeaf(shape: THREE.Shape): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.0024, bevelEnabled: false, curveSegments: 12 });
  geometry.translate(0, 0, -0.0012);
  return geometry;
}

/** Rounded sheet-metal section in X/Y; usable as an outside contour or an opening. */
function roundedSection(width: number, bottom: number, top: number, radius: number): THREE.Shape {
  const half = width / 2;
  const section = new THREE.Shape();
  section.moveTo(-half + radius, bottom);
  section.lineTo(half - radius, bottom);
  section.absarc(half - radius, bottom + radius, radius, -Math.PI / 2, 0, false);
  section.lineTo(half, top - radius);
  section.absarc(half - radius, top - radius, radius, 0, Math.PI / 2, false);
  section.lineTo(-half + radius, top);
  section.absarc(-half + radius, top - radius, radius, Math.PI / 2, Math.PI, false);
  section.lineTo(-half, bottom + radius);
  section.absarc(-half + radius, bottom + radius, radius, Math.PI, Math.PI * 1.5, false);
  section.closePath();
  return section;
}

/** A real folded corner, smoothly shaded across its radius, with an open interior. */
function jacketCorner(x: number, y: number, angle: number, radius: number, thickness: number): THREE.BufferGeometry {
  const shroud = PPSH41_PROFILE.shroud;
  const section = new THREE.Shape();
  section.absarc(x, y, radius, angle, angle + Math.PI / 2, false);
  section.absarc(x, y, radius - thickness, angle + Math.PI / 2, angle, true);
  section.closePath();
  const geometry = new THREE.ExtrudeGeometry(section, {
    depth: shroud.rearZ - shroud.frontZ, bevelEnabled: false, curveSegments: 3,
  });
  geometry.translate(0, 0, shroud.frontZ);
  const position = geometry.attributes.position;
  const noseSlope = 0.009 / (shroud.topY - shroud.bottomY);
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (Math.abs(position.getZ(vertex) - shroud.frontZ) > 0.00001) continue;
    position.setZ(vertex, shroud.frontZ + (position.getY(vertex) - shroud.bottomY) * noseSlope);
  }
  return toCreasedNormals(geometry, Math.PI / 3.2);
}

/**
 * Wartime PPSh-41: one-piece birch stock, folded steel jacket with open vents,
 * integral compensator, protected post, flip notch and 71-round drum. The
 * magazine and right-hand cocking handle remain independent reload pivots.
 */
export function buildPPSH41(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'ppsh41-root';
  const profile = PPSH41_PROFILE;
  const wear = steelWearTexture();
  const steel = new THREE.MeshStandardMaterial({
    color: config.bodyColor, metalness: 0.79, roughness: wear ? 0.74 : 0.46,
    roughnessMap: wear, envMapIntensity: 1.25,
  });
  const edge = new THREE.MeshStandardMaterial({ color: 0x43484b, metalness: 0.85, roughness: 0.49, envMapIntensity: 1.25 });
  // Oxidised bluing retains a diffuse response in the station's weak ambient
  // light; the handled fold shoulders expose slightly less of the dark finish.
  const jacketSteel = new THREE.MeshStandardMaterial({
    color: new THREE.Color(config.bodyColor).lerp(new THREE.Color(0x50565a), 0.34),
    metalness: 0.55, roughness: wear ? 0.88 : 0.55, roughnessMap: wear, envMapIntensity: 1.1,
  });
  const foldedSteel = new THREE.MeshStandardMaterial({ color: 0x474d50, metalness: 0.6, roughness: 0.58, envMapIntensity: 1.1 });
  const bolt = new THREE.MeshStandardMaterial({ color: 0x62676b, metalness: 0.91, roughness: 0.37, envMapIntensity: 1.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x101214, metalness: 0.65, roughness: 0.65 });
  const barrelSteel = new THREE.MeshStandardMaterial({ color: 0x34393b, metalness: 0.58, roughness: 0.5, envMapIntensity: 1.1 });
  const wood = new THREE.MeshPhysicalMaterial({
    color: config.accentColor, map: woodGrainTexture(), metalness: 0, roughness: 0.56,
    clearcoat: 0.38, clearcoatRoughness: 0.36, envMapIntensity: 0.95,
  });
  const drumSteel = new THREE.MeshStandardMaterial({
    color: config.reloadAnim?.magColor ?? config.bodyColor, metalness: 0.75,
    roughness: wear ? 0.81 : 0.52, roughnessMap: wear, envMapIntensity: 1.2,
  });
  const bore = new THREE.MeshBasicMaterial({ color: 0x020303 });
  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `ppsh41-${name}`;
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };
  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    parent: THREE.Object3D, x = 0, y = 0, z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ppsh41-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  const stock = assembly('stock');
  const furniture = shapeWidth(
    extrudeProfile(profileShape(profile.stock), 0.041, 0.007, { segments: 2, keepOutline: true }),
    (_y, z) => 0.78 + 0.22 * THREE.MathUtils.smoothstep(z, 0.15, 0.28),
  );
  add('birch-stock', furniture, wood, stock);
  const buttplate = [[0.369, 0.021], [0.374, 0.019], [0.378, -0.084], [0.37, -0.095], [0.365, -0.094]] as const;
  add('buttplate', extrudeProfile(profileShape(buttplate), 0.041, 0.001), steel, stock);
  // Inset sling bar and its steel escutcheon on the left butt flank.
  const sling = profileShape(capsule(0.297, -0.04, 0.031, 0.013));
  sling.holes.push(profilePath(capsule(0.297, -0.04, 0.024, 0.007)));
  add('sling-inset', extrudeProfile(profileShape(capsule(0.297, -0.04, 0.025, 0.008)), 0.0007), dark, stock, -0.0201);
  add('sling-escutcheon', extrudeProfile(sling, 0.001), steel, stock, -0.0205);
  add('sling-bar', new THREE.BoxGeometry(0.002, 0.012, 0.0025), edge, stock, -0.0215, -0.04, 0.297);
  for (const side of [-1, 1]) {
    add('stock-crossbolt', new THREE.CylinderGeometry(0.004, 0.004, 0.002, 12).rotateZ(Math.PI / 2), steel, stock, side * 0.0165, -0.042, 0.084);
  }

  const receiver = assembly('receiver');
  add('receiver-lower', new RoundedBoxGeometry(0.04, 0.024, 0.252, 1, 0.003), steel, receiver, 0, -0.017, 0.001);
  // The folded cover has an open right ejection port and a long handle slot.
  const receiverCover = profileShape([[0.127, 0.014], [-0.125, 0.014], [-0.125, -0.006], [0.127, -0.006]]);
  add('receiver-left', extrudeProfile(receiverCover, 0.0015, 0.0003), steel, receiver, -0.0195);
  receiverCover.holes.push(profilePath(capsule(-0.036, 0.006, 0.103, 0.012)));
  add('receiver-right', extrudeProfile(receiverCover, 0.0015, 0.0003), steel, receiver, 0.0195);
  const archedSection = (bottomY: number): THREE.Shape => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.02, bottomY);
    shape.lineTo(0.02, bottomY);
    shape.lineTo(0.02, 0.014);
    shape.bezierCurveTo(0.02, 0.02, 0.011, 0.023, 0, 0.023);
    shape.bezierCurveTo(-0.011, 0.023, -0.02, 0.02, -0.02, 0.014);
    shape.closePath();
    return shape;
  };
  const roofSection = new THREE.Shape();
  roofSection.moveTo(-0.02, 0.014);
  roofSection.bezierCurveTo(-0.02, 0.02, -0.011, 0.023, 0, 0.023);
  roofSection.bezierCurveTo(0.011, 0.023, 0.02, 0.02, 0.02, 0.014);
  roofSection.lineTo(0.0184, 0.014);
  roofSection.bezierCurveTo(0.0184, 0.019, 0.01, 0.0214, 0, 0.0214);
  roofSection.bezierCurveTo(-0.01, 0.0214, -0.0184, 0.019, -0.0184, 0.014);
  roofSection.closePath();
  const roof = new THREE.ExtrudeGeometry(roofSection, { depth: 0.25, bevelEnabled: false, curveSegments: 8 });
  add('receiver-top', roof, steel, receiver, 0, 0, -0.125);
  // The rounded rear of the folded cover is dark blued steel, with a small
  // bevel at the seam rather than a large reflective square facing the eye.
  const back = new THREE.ExtrudeGeometry(archedSection(-0.027), {
    depth: 0.006, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 2, curveSegments: 6,
  });
  add('receiver-back', back, dark, receiver, 0, 0, 0.121);
  add('cover-latch', new THREE.BoxGeometry(0.014, 0.008, 0.009), edge, receiver, 0, 0.025, 0.118);
  add('magazine-well', new RoundedBoxGeometry(0.037, 0.026, 0.035, 1, 0.002), steel, receiver, 0, -0.029, -0.12);
  add('magazine-catch', new THREE.BoxGeometry(0.019, 0.019, 0.004).rotateX(-0.2), steel, receiver, 0, -0.046, -0.085);
  const guard = profileShape(profile.triggerGuard);
  guard.holes.push(profilePath(profile.triggerOpening));
  add('trigger-guard', extrudeProfile(guard, 0.011, 0.0006), steel, receiver);
  add('trigger', extrudeProfile(profileShape(profile.trigger), 0.005), steel, receiver);
  add('selector', new THREE.BoxGeometry(0.01, 0.006, 0.013), edge, receiver, 0, -0.062, -0.008);
  for (const side of [-1, 1]) {
    add('receiver-hinge', new THREE.CylinderGeometry(0.004, 0.004, 0.003, 12).rotateZ(Math.PI / 2), edge, receiver, side * 0.021, -0.017, -0.116);
  }

  const jacket = assembly('shroud');
  const shroud = profile.shroud;
  const foldRadius = 0.006;
  const sheet = 0.0016;
  const flatHalfWidth = shroud.width / 2 - foldRadius;
  const sideTop = shroud.topY - foldRadius;
  const sideBottom = shroud.bottomY + foldRadius;
  const noseZ = (y: number): number => shroud.frontZ + (y - shroud.bottomY) * 0.009 / (shroud.topY - shroud.bottomY);
  const sideShape = profileShape([
    [shroud.rearZ, sideTop], [noseZ(sideTop), sideTop],
    [noseZ(sideBottom), sideBottom], [shroud.rearZ, sideBottom],
  ]);
  for (const slot of ppsh41ShroudSlots()) sideShape.holes.push(profilePath(slot));
  for (const side of [-1, 1]) {
    add('perforated-side', extrudeProfile(sideShape, sheet, 0.00035, { segments: 1, keepOutline: true }), jacketSteel, jacket, side * (shroud.width / 2 - sheet / 2));
  }
  // The broad faces meet at continuous rounded folds, rather than the sharp
  // square edges of a rectangular cage. Slot bevels expose the sheet thickness.
  for (const y of [shroud.topY - sheet / 2, shroud.bottomY + sheet / 2]) {
    const frontZ = noseZ(y > 0 ? shroud.topY : shroud.bottomY);
    const plate = profileShape([
      [shroud.rearZ, -flatHalfWidth], [frontZ, -flatHalfWidth],
      [frontZ, flatHalfWidth], [shroud.rearZ, flatHalfWidth],
    ]);
    for (let slot = 0; slot < 6; slot++) plate.holes.push(profilePath(capsule(-0.164 - slot * 0.049, 0, 0.034, 0.015)));
    const bevel = y > 0 ? 0.00035 : 0;
    add('perforated-fold', extrudeProfile(plate, sheet, bevel, { segments: 1, keepOutline: true }).rotateZ(Math.PI / 2), jacketSteel, jacket, 0, y);
  }
  for (const [x, y, angle] of [
    [flatHalfWidth, sideTop, 0], [-flatHalfWidth, sideTop, Math.PI / 2],
    [-flatHalfWidth, sideBottom, Math.PI], [flatHalfWidth, sideBottom, Math.PI * 1.5],
  ]) {
    add('rounded-jacket-fold', jacketCorner(x, y, angle, foldRadius, sheet), foldedSteel, jacket);
  }
  const collarSection = roundedSection(0.043, -0.025, 0.023, 0.007);
  collarSection.holes.push(roundedSection(0.039, -0.023, 0.021, 0.005));
  const collar = new THREE.ExtrudeGeometry(collarSection, { depth: 0.009, bevelEnabled: false, curveSegments: 3 });
  add('jacket-receiver-collar', toCreasedNormals(collar, Math.PI / 3.2), foldedSteel, jacket, 0, 0, shroud.rearZ - 0.006);
  // Barrel terminates inside the jacket: its extended nose is the compensator.
  add('barrel', cylinderZ(0.0088, 0.0074, 0.296, 16), barrelSteel, jacket, 0, 0, -0.278);
  add('muzzle-crown', cylinderZ(0.0075, 0.0075, 0.006, 16), edge, jacket, 0, 0, -0.429);
  add('bore', new THREE.CircleGeometry(0.0038, 14).rotateY(Math.PI), bore, jacket, 0, 0, -0.4321);
  // Sloped front plate closes the integral compensator around its exit hole.
  const muzzleSlope = Math.atan2(0.009, shroud.topY - shroud.bottomY);
  const projectY = Math.cos(muzzleSlope);
  const muzzleFace = roundedSection(shroud.width, shroud.bottomY / projectY, shroud.topY / projectY, foldRadius);
  const exit = new THREE.Path();
  exit.absarc(0, 0, 0.008, 0, Math.PI * 2, true);
  muzzleFace.holes.push(exit);
  const muzzlePlate = new THREE.ExtrudeGeometry(muzzleFace, { depth: 0.0015, bevelEnabled: false, curveSegments: 12 });
  muzzlePlate.translate(0, 0, -0.00075);
  muzzlePlate.rotateX(muzzleSlope);
  add('compensator-face', muzzlePlate, jacketSteel, jacket, 0, 0, shroud.frontZ - shroud.bottomY * Math.tan(muzzleSlope));
  add('jacket-front-lip', new THREE.BoxGeometry(0.027, 0.002, 0.004), edge, jacket, 0, shroud.bottomY + 0.001, shroud.frontZ + 0.002);
  add('front-sling-swivel', new THREE.TorusGeometry(0.006, 0.0013, 5, 10).rotateY(Math.PI / 2), foldedSteel, jacket, -0.022, -0.01, -0.415);

  const sights = assembly('sights');
  add('front-sight-base', new THREE.BoxGeometry(0.016, 0.01, 0.024), steel, sights, 0, 0.025, profile.frontSightZ);
  add('front-sight-hood', new THREE.TorusGeometry(profile.hoodRadius, 0.0015, 6, 16), steel, sights, 0, config.sightHeight, profile.frontSightZ);
  const postHeight = config.sightHeight - 0.03;
  add('front-sight-post', new THREE.CylinderGeometry(0.0011, 0.0015, postHeight, 8), edge, sights, 0, 0.03 + postHeight / 2, profile.frontSightZ);
  add('rear-sight-base', new THREE.BoxGeometry(0.02, 0.007, 0.034), steel, sights, 0, 0.027, profile.rearSightZ - 0.008);
  const leaf = new THREE.Shape();
  leaf.moveTo(-0.009, 0.028);
  leaf.lineTo(0.009, 0.028);
  leaf.lineTo(0.009, config.sightHeight);
  leaf.lineTo(0.0019, config.sightHeight);
  leaf.lineTo(0.0019, config.sightHeight - 0.004);
  leaf.lineTo(-0.0019, config.sightHeight - 0.004);
  leaf.lineTo(-0.0019, config.sightHeight);
  leaf.lineTo(-0.009, config.sightHeight);
  leaf.closePath();
  add('rear-notch', sightLeaf(leaf), steel, sights, 0, 0, profile.rearSightZ);
  add('rear-flip-leaf', new THREE.BoxGeometry(0.014, 0.002, 0.017), steel, sights, 0, 0.032, profile.rearSightZ - 0.014);

  const handle = assembly('charging-handle', ...profile.chargingHandle);
  add('bolt-body', new THREE.BoxGeometry(0.025, 0.013, 0.06), bolt, handle, -0.016, -0.001, 0.014);
  add('handle-stem', new THREE.BoxGeometry(0.014, 0.006, 0.007), bolt, handle, 0.003);
  add('handle-knob', new RoundedBoxGeometry(0.009, 0.011, 0.011, 1, 0.0025), steel, handle, 0.013);
  add('handle-safety', new THREE.BoxGeometry(0.012, 0.003, 0.005), edge, handle, 0.014, 0.005, 0);

  const mag = profile.magazine;
  const magazine = assembly('magazine', ...mag.seat);
  add('drum-neck', new RoundedBoxGeometry(0.028, 0.025, 0.033, 1, 0.0015), drumSteel, magazine, 0, -0.004, 0);
  add('drum-body', cylinderZ(mag.radius, mag.radius, mag.depth, 28), drumSteel, magazine, 0, mag.centerY);
  for (const side of [-1, 1]) {
    const faceZ = side * (mag.depth / 2 + 0.0006);
    add('drum-cover', cylinderZ(mag.radius - 0.003, mag.radius - 0.003, 0.002, 28), steel, magazine, 0, mag.centerY, faceZ);
    for (const radius of [mag.radius - 0.003, mag.radius - 0.013]) {
      add('drum-rim', new THREE.TorusGeometry(radius, 0.0015, 3, 24), drumSteel, magazine, 0, mag.centerY, faceZ + side * 0.0012);
    }
    add('drum-hub', cylinderZ(0.012, 0.012, 0.003, 16), drumSteel, magazine, 0, mag.centerY, faceZ + side * 0.002);
    // Pressed ribs stay subtle; the rear cover's winding latch remains legible in first person.
    for (let rib = 0; rib < 6; rib++) {
      const angle = rib * Math.PI / 3;
      const ribGeometry = new THREE.BoxGeometry(0.006, 0.034, 0.0015).rotateZ(angle);
      add('drum-rib', ribGeometry, drumSteel, magazine,
        -Math.sin(angle) * 0.036, mag.centerY + Math.cos(angle) * 0.036, faceZ + side * 0.0015);
    }
  }
  add('drum-winding-latch', new RoundedBoxGeometry(0.033, 0.007, 0.004, 1, 0.001), steel, magazine, 0, mag.centerY, mag.depth / 2 + 0.005);
  add('drum-latch-pin', cylinderZ(0.004, 0.004, 0.006, 12), edge, magazine, 0, mag.centerY, mag.depth / 2 + 0.006);

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0, shroud.frontZ - 0.003).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.026, 0.008, -0.053).multiplyScalar(config.scale),
    sightY: config.sightHeight * config.scale,
    openBolt: handle,
    reloadParts: { magazine, handle },
  };
}
