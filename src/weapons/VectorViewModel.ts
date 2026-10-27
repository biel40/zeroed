import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cylinderZ, extrudeProfile, profilePath, profileShape, shapeWidth, type ProfilePoint } from './ProfileGeometry';
import { steelWearTexture } from './ProceduralTextures';
import { buildMagazineRounds, CARTRIDGES, cartridgeMaterials, feedLipSeats } from './MagazineRounds';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/** Width of the aluminium upper; the polymer lower housing is a little wider. */
const UPPER_WIDTH = 0.034;
const LOWER_WIDTH = 0.04;

/**
 * KRISS Vector Gen II SMG side profiles, traced from a reference photo at
 * ~1.28 mm/px (645 mm with the stock extended, 140 mm barrel) and shared by
 * the first-person model and the wall-buy silhouette. The bore runs at
 * y = 0.01 and the grip and trigger match the M4A1's, so the hands share
 * its grip geometry.
 */
export const VECTOR_PROFILE = {
  boreY: 0.01,
  /** Aluminium upper: long flat top under the rail, square front block. */
  upper: [
    [0.06, 0.047], [-0.296, 0.047], [-0.302, 0.04], [-0.302, -0.006], [-0.296, -0.013], [0.06, -0.013],
  ] as readonly ProfilePoint[],
  /** Full-length Picatinny rail on the upper (z span, base and top). */
  rail: { rearZ: 0.056, frontZ: -0.298, baseY: 0.047, topY: 0.055, width: 0.021 },
  /** Short accessory rail under the front block. */
  lowerRail: { rearZ: -0.25, frontZ: -0.3, topY: -0.013, bottomY: -0.021 },
  /**
   * "Super V" polymer lower: slanted front, magazine well, the guard bar
   * running back into the grip and the rear tang under the upper.
   */
  lower: [
    [-0.236, -0.012], [0.058, -0.012], [0.058, -0.024], [0.028, -0.028], [0.012, -0.098], [0.004, -0.108],
    [-0.09, -0.106], [-0.152, -0.1], [-0.212, -0.1], [-0.222, -0.06],
  ] as readonly ProfilePoint[],
  /** Trigger opening cut through the lower, in front of the grip. */
  triggerOpening: [
    [-0.082, -0.036], [-0.012, -0.036], [0.002, -0.09], [-0.004, -0.095], [-0.078, -0.095], [-0.086, -0.088],
  ] as readonly ProfilePoint[],
  /** Raked pistol grip, same section and rake as the M4A1's. */
  grip: [[-0.011, -0.025], [0.028, -0.024], [0.068, -0.123], [0.022, -0.13]] as readonly ProfilePoint[],
  trigger: [[-0.052, -0.031], [-0.055, -0.044], [-0.044, -0.056], [-0.047, -0.044], [-0.047, -0.031]] as readonly ProfilePoint[],
  /** Straight extended Glock-pattern 30-round magazine, local to its seat. */
  magazine: {
    seat: [0, -0.1, -0.186] as const,
    outline: [
      [0.017, 0.05], [-0.017, 0.05], [-0.017, -0.155], [-0.019, -0.161], [0.019, -0.161], [0.017, -0.155],
    ] as readonly ProfilePoint[],
    floorplate: [[0.021, -0.159], [-0.021, -0.159], [-0.02, -0.174], [0.02, -0.174]] as readonly ProfilePoint[],
    width: 0.022,
  },
  /** Folding sights on the rail: front post with ears, rear aperture. */
  frontSightZ: -0.272,
  rearSightZ: 0.008,
  /** Charging handle plate on the left of the upper, behind the support hand. */
  chargingHandleZ: -0.222,
  /** A2-style birdcage flash hider ahead of the front block. */
  flashHider: { rearZ: -0.302, frontZ: -0.347, radius: 0.0095 },
  /** Stock adapter tube and the folding/adjustable stock. */
  stockTube: { rearZ: 0.125, frontZ: 0.058, y: 0.036, radius: 0.0135 },
  stock: [
    [0.115, 0.057], [0.288, 0.057], [0.292, 0.05], [0.292, -0.072], [0.282, -0.078], [0.255, -0.078],
    [0.24, -0.062], [0.2, -0.035], [0.16, 0.006], [0.115, 0.016],
  ] as readonly ProfilePoint[],
  /** Lightening recess moulded into both stock flanks. */
  stockRecess: [[0.15, 0.046], [0.25, 0.046], [0.25, 0.0], [0.205, -0.022], [0.17, 0.01]] as readonly ProfilePoint[],
} as const;

/** A sight leaf drawn across X/Y, 2.5 mm thick along the bore. */
function sightLeaf(shape: THREE.Shape): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.0025, bevelEnabled: false, curveSegments: 10 });
  geometry.translate(0, 0, -0.00125);
  return geometry;
}

/**
 * Vector view model: aluminium upper under a full-length rail, the angular
 * polymer "Super V" lower with its open trigger guard, M4-pattern grip,
 * folding sights, birdcage flash hider, left-side charging handle, straight
 * extended magazine and the adjustable stock on its adapter tube. The
 * magazine and the charging handle are the reload parts the shared
 * ReloadAnimator drives.
 */
export function buildVector(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'vector-root';
  const profile = VECTOR_PROFILE;
  const sightY = config.sightHeight;
  const boreY = profile.boreY;
  // Hard-anodised aluminium and matte polymer, both broken up by the wear speckle.
  const wear = steelWearTexture();
  const aluminium = new THREE.MeshStandardMaterial({
    color: config.bodyColor, metalness: 0.6, roughness: wear ? 0.74 : 0.5, roughnessMap: wear, envMapIntensity: 1.15,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x141618, metalness: 0.8, roughness: wear ? 0.66 : 0.4, roughnessMap: wear, envMapIntensity: 1.1,
  });
  const boltSteel = new THREE.MeshStandardMaterial({ color: 0x7c8287, metalness: 0.92, roughness: 0.3, envMapIntensity: 1.4 });
  const polymer = new THREE.MeshStandardMaterial({
    color: config.accentColor, metalness: 0.04, roughness: wear ? 0.95 : 0.8, roughnessMap: wear, envMapIntensity: 0.8,
  });
  const recess = new THREE.MeshStandardMaterial({ color: new THREE.Color(config.accentColor).multiplyScalar(0.6), metalness: 0.02, roughness: 0.98 });
  const magazineMaterial = new THREE.MeshStandardMaterial({
    color: config.reloadAnim!.magColor, metalness: 0.05, roughness: wear ? 0.9 : 0.75, roughnessMap: wear, envMapIntensity: 0.8,
  });
  const bore = new THREE.MeshBasicMaterial({ color: 0x030404 });

  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    parent: THREE.Object3D, x = 0, y = 0, z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `vector-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `vector-${name}`;
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };

  // Upper: square aluminium body, full-length rail, side grooves and the
  // open ejection port with the bolt face behind it.
  const upper = assembly('upper');
  add('upper-shell', extrudeProfile(profileShape(profile.upper), UPPER_WIDTH, 0.002, { segments: 2 }), aluminium, upper);
  const rail = profile.rail;
  const railLength = rail.rearZ - rail.frontZ;
  add('rail-base', new THREE.BoxGeometry(rail.width, 0.004, railLength), aluminium, upper, 0, rail.baseY + 0.002, (rail.rearZ + rail.frontZ) / 2);
  const lugCount = 33;
  for (let lug = 0; lug < lugCount; lug++) {
    const z = rail.rearZ - 0.006 - lug * ((railLength - 0.012) / (lugCount - 1));
    add('rail-lug', new THREE.BoxGeometry(rail.width, rail.topY - rail.baseY - 0.004, 0.0052), aluminium, upper, 0, (rail.topY + rail.baseY + 0.004) / 2, z);
  }
  const under = profile.lowerRail;
  add('lower-rail', new THREE.BoxGeometry(0.021, under.topY - under.bottomY, under.rearZ - under.frontZ), aluminium, upper,
    0, (under.topY + under.bottomY) / 2, (under.rearZ + under.frontZ) / 2);
  for (let lug = 0; lug < 5; lug++) {
    add('lower-rail-slot', new THREE.BoxGeometry(0.022, 0.003, 0.004), steel, upper, 0, under.bottomY + 0.0012, under.frontZ + 0.006 + lug * 0.0095);
  }
  for (const side of [-1, 1]) {
    add('upper-groove', new THREE.BoxGeometry(0.002, 0.004, 0.25), steel, upper, side * (UPPER_WIDTH / 2), 0.026, -0.075);
    add('front-block-bolt', cylinderZ(0.0035, 0.0035, 0.002, 12).rotateY(Math.PI / 2), steel, upper, side * (UPPER_WIDTH / 2 + 0.0005), 0.024, -0.285);
  }
  add('ejection-port', new THREE.BoxGeometry(0.002, 0.016, 0.05), bore, upper, UPPER_WIDTH / 2 + 0.0002, 0.018, -0.105);
  add('bolt-face', new THREE.BoxGeometry(0.002, 0.011, 0.03), boltSteel, upper, UPPER_WIDTH / 2 - 0.0002, 0.018, -0.096);
  add('charging-slot', new THREE.BoxGeometry(0.002, 0.005, 0.09), bore, upper, -UPPER_WIDTH / 2 - 0.0002, 0.02, -0.19);

  // Lower: the angular polymer housing with its open guard, grip and controls.
  const lower = assembly('lower');
  const lowerShape = profileShape(profile.lower);
  lowerShape.holes.push(profilePath(profile.triggerOpening));
  add('lower-shell', extrudeProfile(lowerShape, LOWER_WIDTH, 0.003, { segments: 3, keepOutline: true }), polymer, lower);
  const gripShell = shapeWidth(
    extrudeProfile(profileShape(profile.grip), 0.033, 0.005, { segments: 3, keepOutline: true }),
    (y) => THREE.MathUtils.lerp(0.84, 1, THREE.MathUtils.clamp((-0.03 - y) / 0.04, 0, 1)),
  );
  add('grip-shell', gripShell, polymer, lower);
  add('trigger', extrudeProfile(profileShape(profile.trigger), 0.006, 0.0008), steel, lower);
  for (const side of [-1, 1]) {
    // Moulded slot and raised panel of the front of the "V".
    add('lower-slot', new RoundedBoxGeometry(0.002, 0.05, 0.016, 1, 0.0008), recess, lower, side * (LOWER_WIDTH / 2 + 0.0002), -0.058, -0.158);
    for (const [z, y] of [[0.045, -0.018], [-0.03, -0.02], [-0.205, -0.03], [-0.12, -0.095]] as const) {
      add('lower-pin', new THREE.SphereGeometry(0.0032, 10, 6).scale(0.45, 1, 1), steel, lower, side * (LOWER_WIDTH / 2), y, z);
    }
  }
  add('receiver-screw', cylinderZ(0.006, 0.006, 0.002, 14).rotateY(Math.PI / 2), steel, lower, -(LOWER_WIDTH / 2 + 0.0004), -0.028, -0.105);
  const selector = profileShape([[0.0, -0.016], [-0.026, -0.012], [-0.029, -0.016], [-0.026, -0.021], [0.0, -0.024]]);
  add('selector-lever', extrudeProfile(selector, 0.0018, 0.0004), steel, lower, -(LOWER_WIDTH / 2 + 0.001));
  add('selector-hub', cylinderZ(0.005, 0.005, 0.003, 14).rotateY(Math.PI / 2), steel, lower, -(LOWER_WIDTH / 2 + 0.0005), -0.02, 0.0);
  add('magazine-release', cylinderZ(0.004, 0.004, 0.004, 10).rotateY(Math.PI / 2), steel, lower, -(LOWER_WIDTH / 2 + 0.001), -0.07, -0.148);

  // Muzzle: birdcage flash hider with its slots.
  const muzzle = assembly('muzzle');
  const hider = profile.flashHider;
  const hiderLength = hider.rearZ - hider.frontZ;
  add('barrel-collar', cylinderZ(0.0082, 0.0082, 0.01, 14), steel, muzzle, 0, boreY, hider.rearZ - 0.002);
  add('flash-hider', cylinderZ(hider.radius * 0.88, hider.radius, hiderLength - 0.01, 14), steel, muzzle, 0, boreY, (hider.rearZ + hider.frontZ) / 2 - 0.005);
  for (let slot = 0; slot < 4; slot++) {
    const angle = (slot / 4) * Math.PI * 2 + Math.PI / 4;
    const cut = new THREE.BoxGeometry(0.003, 0.0012, 0.018).rotateZ(angle + Math.PI / 2);
    add('flash-hider-slot', cut, bore, muzzle, Math.cos(angle) * hider.radius, boreY + Math.sin(angle) * hider.radius, hider.frontZ + 0.013);
  }
  add('bore', new THREE.CircleGeometry(0.0045, 12).rotateY(Math.PI), bore, muzzle, 0, boreY, hider.frontZ - 0.0002);

  // Folding sights: slim clamp bases, each carrying a thin leaf cut like the
  // real one (an open post window up front, a peep aperture at the rear).
  const sights = assembly('sights');
  const sightBase = rail.topY;
  for (const z of [profile.frontSightZ, profile.rearSightZ]) {
    add('sight-base', new RoundedBoxGeometry(0.022, 0.006, 0.018, 1, 0.0015), steel, sights, 0, sightBase + 0.003, z);
    add('sight-hinge', cylinderZ(0.0025, 0.0025, 0.016, 10).rotateY(Math.PI / 2), steel, sights, 0, sightBase + 0.007, z + 0.004);
  }
  const leafBottom = sightBase + 0.006;
  const leafTop = sightY + 0.007;
  // Front leaf: a U of protective wings open at the top, the post standing
  // in its window with its tip on the sight line.
  const windowBottom = sightY - 0.009;
  const frontLeaf = new THREE.Shape();
  frontLeaf.moveTo(-0.0095, leafBottom);
  frontLeaf.lineTo(0.0095, leafBottom);
  frontLeaf.lineTo(0.0085, leafTop);
  frontLeaf.lineTo(0.0055, leafTop);
  frontLeaf.lineTo(0.0055, windowBottom);
  frontLeaf.lineTo(-0.0055, windowBottom);
  frontLeaf.lineTo(-0.0055, leafTop);
  frontLeaf.lineTo(-0.0085, leafTop);
  frontLeaf.closePath();
  add('front-sight-leaf', sightLeaf(frontLeaf), steel, sights, 0, 0, profile.frontSightZ);
  const postHeight = sightY - windowBottom;
  add('front-sight-post', new THREE.BoxGeometry(0.0024, postHeight, 0.0025), steel, sights, 0, windowBottom + postHeight / 2, profile.frontSightZ);
  // Rear leaf: a rounded plate pierced by the peep aperture on the sight line.
  const rearLeaf = new THREE.Shape();
  rearLeaf.moveTo(-0.0095, leafBottom);
  rearLeaf.lineTo(0.0095, leafBottom);
  rearLeaf.lineTo(0.0095, sightY);
  rearLeaf.absarc(0, sightY, 0.0095, 0, Math.PI, false);
  rearLeaf.closePath();
  const peep = new THREE.Path();
  peep.absarc(0, sightY, 0.0028, 0, Math.PI * 2, true);
  rearLeaf.holes.push(peep);
  add('rear-sight-leaf', sightLeaf(rearLeaf), steel, sights, 0, 0, profile.rearSightZ);

  // Adjustable stock on its adapter tube.
  const stock = assembly('stock');
  const tube = profile.stockTube;
  add('stock-tube', cylinderZ(tube.radius, tube.radius, tube.rearZ - tube.frontZ, 16), aluminium, stock, 0, tube.y, (tube.rearZ + tube.frontZ) / 2);
  // Folding hinge between the upper and the tube: a slim knuckle, not a block.
  add('stock-hinge', new RoundedBoxGeometry(0.024, 0.03, 0.01, 2, 0.004), steel, stock, 0, 0.032, 0.064);
  add('stock-hinge-pin', new THREE.CylinderGeometry(0.0035, 0.0035, 0.026, 12).rotateZ(Math.PI / 2), steel, stock, 0, 0.032, 0.064);
  const stockShell = shapeWidth(
    extrudeProfile(profileShape(profile.stock), 0.034, 0.006, { segments: 3, keepOutline: true }),
    (_y, z) => THREE.MathUtils.lerp(0.8, 1, THREE.MathUtils.clamp((z - 0.12) / 0.12, 0, 1)),
  );
  add('stock-shell', stockShell, polymer, stock);
  for (const side of [-1, 1]) {
    add('stock-recess', extrudeProfile(profileShape(profile.stockRecess), 0.002), recess, stock, side * 0.0166);
    add('sling-cup', cylinderZ(0.0065, 0.0065, 0.003, 14).rotateY(Math.PI / 2), steel, stock, side * 0.017, 0.032, 0.272);
  }
  add('buttpad', new RoundedBoxGeometry(0.036, 0.132, 0.012, 2, 0.003), recess, stock, 0, -0.011, 0.292);

  // Charging handle: plate on the left of the upper with its folding tab.
  const handle = assembly('charging-handle', -UPPER_WIDTH / 2, 0.02, profile.chargingHandleZ);
  add('charging-handle-plate', new RoundedBoxGeometry(0.004, 0.018, 0.04, 1, 0.0012), steel, handle, -0.002, 0, 0);
  add('charging-handle-tab', new RoundedBoxGeometry(0.012, 0.009, 0.012, 1, 0.002), steel, handle, -0.008, 0, -0.012);

  // Extended Glock-pattern magazine: polymer body, centre rib and floorplate.
  const mag = profile.magazine;
  const magazine = assembly('magazine', ...mag.seat);
  add('magazine-shell', extrudeProfile(profileShape(mag.outline), mag.width, 0.0018, { segments: 2 }), magazineMaterial, magazine);
  for (const side of [-1, 1]) {
    add('magazine-rib', new THREE.BoxGeometry(0.0014, 0.14, 0.006), magazineMaterial, magazine, side * (mag.width / 2 + 0.0003), -0.08, 0.004);
  }
  add('magazine-floorplate', extrudeProfile(profileShape(mag.floorplate), mag.width + 0.004, 0.0015, { segments: 2 }), magazineMaterial, magazine);
  const { brass, copper } = cartridgeMaterials();
  const cartridge = CARTRIDGES.parabellum9;
  const rounds = buildMagazineRounds('vector-magazine-rounds', cartridge, feedLipSeats(cartridge, 0.05, 0.015, 0.0035), brass, copper);
  magazine.add(rounds);

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, boreY, hider.frontZ - 0.004).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(UPPER_WIDTH / 2 + 0.006, 0.018, -0.105).multiplyScalar(config.scale),
    sightY: sightY * config.scale,
    reloadParts: { magazine, handle, rounds },
  };
}
