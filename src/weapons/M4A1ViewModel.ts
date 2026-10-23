import * as THREE from 'three';
import { cylinderZ, extrudeProfile, profilePath, profileShape, type ProfilePoint } from './ProfileGeometry';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/**
 * Colt M4A1 carbine side profiles (A2 carry handle, round ribbed handguard,
 * collapsible stock), traced from a left-side reference photo at ~2.1 mm/px.
 * The bore runs at y = 0.01; the pistol grip keeps the hand anchors of the
 * weapon config, so everything else is placed relative to it.
 */
const M4A1_PROFILE = {
  boreY: 0.01,
  muzzleZ: -0.565,
  upper: [[-0.175, -0.002], [-0.175, 0.032], [-0.158, 0.038], [0.056, 0.038], [0.056, -0.002]] as readonly ProfilePoint[],
  upperWidth: 0.042,
  /** Lower receiver behind the magazine well, down to the trigger guard. */
  lower: [[-0.061, -0.002], [0.067, -0.002], [0.067, -0.02], [0.044, -0.041], [-0.061, -0.041]] as readonly ProfilePoint[],
  lowerWidth: 0.04,
  /** Hollow magazine well: two flanks and the raked front wall. */
  magwellFlank: [
    [-0.152, -0.002], [-0.061, -0.002], [-0.061, -0.06], [-0.135, -0.06], [-0.139, -0.048], [-0.147, -0.018],
  ] as readonly ProfilePoint[],
  magwellFront: [
    [-0.152, -0.002], [-0.142, -0.002], [-0.131, -0.06], [-0.135, -0.06], [-0.139, -0.048], [-0.147, -0.018],
  ] as readonly ProfilePoint[],
  /** Raked A2 pistol grip with its finger swell. */
  grip: [
    [-0.015, -0.041], [0.002, -0.077], [0.01, -0.094], [0.018, -0.102], [0.031, -0.138], [0.05, -0.142],
    [0.075, -0.13], [0.044, -0.06], [0.031, -0.041],
  ] as readonly ProfilePoint[],
  triggerGuard: [
    [-0.061, -0.041], [-0.061, -0.073], [-0.006, -0.073], [-0.006, -0.066], [-0.055, -0.066], [-0.055, -0.041],
  ] as readonly ProfilePoint[],
  trigger: [[-0.047, -0.041], [-0.051, -0.052], [-0.043, -0.063], [-0.044, -0.052], [-0.042, -0.041]] as readonly ProfilePoint[],
  /** A2 carry handle: front leg, bridge and rear sight base, open underneath. */
  carryHandle: [
    [-0.147, 0.038], [-0.147, 0.06], [-0.139, 0.068], [-0.01, 0.068], [0.03, 0.066], [0.037, 0.052], [0.037, 0.038],
  ] as readonly ProfilePoint[],
  carryHandleWindow: [[-0.138, 0.042], [-0.028, 0.042], [-0.028, 0.059], [-0.134, 0.059]] as readonly ProfilePoint[],
  rearSightEar: [
    [-0.006, 0.062], [0.024, 0.062], [0.024, 0.08], [0.016, 0.087], [0.002, 0.087], [-0.006, 0.08],
  ] as readonly ProfilePoint[],
  rearSightZ: 0.009,
  /** Triangular front sight tower over its base block, pierced side to side. */
  frontSightTower: [[-0.392, 0.026], [-0.392, 0.056], [-0.38, 0.056], [-0.34, 0.026]] as readonly ProfilePoint[],
  frontSightHole: [[-0.387, 0.031], [-0.387, 0.049], [-0.364, 0.031]] as readonly ProfilePoint[],
  frontSightEar: [[-0.392, 0.052], [-0.378, 0.052], [-0.378, 0.08], [-0.392, 0.08]] as readonly ProfilePoint[],
  frontSightZ: -0.386,
  frontSightBase: { rearZ: -0.346, frontZ: -0.396, topY: 0.027, bottomY: -0.007 },
  /** Round handguard between the front cap and the delta ring. */
  handguard: { rearZ: -0.2, frontZ: -0.339, radius: 0.027, ribRadius: 0.0285, heightScale: 0.97 },
  deltaRingZ: -0.194,
  /** Barrel sections: the M203 step is the thin cut ahead of the front sight. */
  barrel: { rearZ: -0.18, radius: 0.0075, sleeveRadius: 0.0095, sleeves: [[-0.521, -0.458], [-0.435, -0.396]] },
  flashHider: { rearZ: -0.521, radius: 0.0095 },
  bufferTube: { rearZ: 0.21, frontZ: 0.056, y: 0.008, radius: 0.015 },
  stock: [
    [0.109, 0.024], [0.136, 0.028], [0.243, 0.028], [0.243, -0.1], [0.236, -0.109], [0.209, -0.109],
    [0.214, -0.088], [0.203, -0.07], [0.167, -0.052], [0.132, -0.044], [0.109, -0.041],
  ] as readonly ProfilePoint[],
  /**
   * Curved 30-round STANAG magazine, local to its seat at the well mouth
   * (reloadAnim.magAnchor, raked by magRotation). The top is hidden inside
   * the receiver.
   */
  magazine: {
    outline: [
      [-0.034, 0.06], [0.03, 0.06], [0.033, 0], [0.031, -0.035], [0.027, -0.07], [0.022, -0.104],
      [0.02, -0.118], [-0.037, -0.11], [-0.036, -0.08], [-0.034, -0.045], [-0.033, 0],
    ] as readonly ProfilePoint[],
    floorplate: [[-0.039, -0.105], [0.023, -0.113], [0.023, -0.122], [-0.039, -0.115]] as readonly ProfilePoint[],
    /** Pressed reinforcing ribs along each flank: [top z, bottom z]. */
    ribs: [[-0.015, -0.019], [0.001, -0.004], [0.017, 0.01]] as readonly (readonly [number, number])[],
    width: 0.025,
  },
} as const;

/**
 * M4A1 view model. The magazine and the charging handle are the reload
 * parts the shared ReloadAnimator drives.
 */
export function buildM4A1(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'm4a1-root';
  const profile = M4A1_PROFILE;
  const boreY = profile.boreY;
  const metal = new THREE.MeshStandardMaterial({ color: config.bodyColor, metalness: 0.72, roughness: 0.48 });
  const polymer = new THREE.MeshStandardMaterial({ color: config.accentColor, metalness: 0.08, roughness: 0.76 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x141719, metalness: 0.8, roughness: 0.4 });
  const magazineMaterial = new THREE.MeshStandardMaterial({ color: config.reloadAnim!.magColor, metalness: 0.65, roughness: 0.58 });
  const bore = new THREE.MeshBasicMaterial({ color: 0x030404 });

  const box = (width: number, height: number, depth: number): THREE.BoxGeometry => new THREE.BoxGeometry(width, height, depth);
  const cylinder = (radius: number, length: number): THREE.CylinderGeometry => cylinderZ(radius, radius, length);
  const extrude = (points: readonly ProfilePoint[], width: number, hole?: readonly ProfilePoint[]): THREE.BufferGeometry => {
    const shape = profileShape(points);
    if (hole) shape.holes.push(profilePath(hole));
    return extrudeProfile(shape, width);
  };
  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    x: number, y: number, z: number, parent: THREE.Object3D = group,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `m4a1-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const assembly = (name: string): THREE.Group => {
    const part = new THREE.Group();
    part.name = `m4a1-${name}`;
    group.add(part);
    return part;
  };
  const span = (rearZ: number, frontZ: number): { length: number; center: number } => ({
    length: rearZ - frontZ, center: (rearZ + frontZ) / 2,
  });

  add('upper', extrude(profile.upper, profile.upperWidth), metal, 0, 0, 0);
  add('lower', extrude(profile.lower, profile.lowerWidth), metal, 0, 0, 0);
  const well = assembly('magwell');
  const flankWidth = 0.006;
  for (const side of [-1, 1]) {
    add('magwell-flank', extrude(profile.magwellFlank, flankWidth), metal, side * (profile.lowerWidth - flankWidth) / 2, 0, 0, well);
  }
  add('magwell-front', extrude(profile.magwellFront, profile.lowerWidth), metal, 0, 0, 0, well);

  const barrel = assembly('barrel');
  const barrelSpan = span(profile.barrel.rearZ, profile.flashHider.rearZ);
  add('barrel-core', cylinder(profile.barrel.radius, barrelSpan.length), steel, 0, boreY, barrelSpan.center, barrel);
  for (const [frontZ, rearZ] of profile.barrel.sleeves) {
    const sleeve = span(rearZ, frontZ);
    add('barrel-sleeve', cylinder(profile.barrel.sleeveRadius, sleeve.length), steel, 0, boreY, sleeve.center, barrel);
  }
  add('barrel-nut', cylinder(0.02, 0.014), steel, 0, boreY, -0.182, barrel);

  // A2 birdcage: slotted on top and the sides, closed underneath.
  const flashHider = assembly('flash-hider');
  const hider = span(profile.flashHider.rearZ, profile.muzzleZ);
  add('flash-hider-body', cylinder(profile.flashHider.radius, hider.length), steel, 0, boreY, hider.center, flashHider);
  add('muzzle-ring', new THREE.TorusGeometry(0.0075, 0.002, 4, 12), steel, 0, boreY, profile.muzzleZ, flashHider);
  add('bore', new THREE.CircleGeometry(0.0065, 12).rotateY(Math.PI), bore, 0, boreY, profile.muzzleZ + 0.001, flashHider);
  // Slot angles are measured from the top of the bore, towards +X.
  for (const angle of [-1.25, -0.6, 0.6, 1.25]) {
    const slot = box(0.002, 0.003, 0.026).rotateZ(-angle);
    const radius = profile.flashHider.radius * 0.97;
    add('flash-hider-slot', slot, bore, Math.sin(angle) * radius, boreY + Math.cos(angle) * radius, hider.center - 0.004, flashHider);
  }

  const handguard = assembly('handguard');
  const guard = profile.handguard;
  const guardSpan = span(guard.rearZ, guard.frontZ);
  add('handguard-shell', cylinder(guard.radius, guardSpan.length).scale(1, guard.heightScale, 1), polymer, 0, boreY, guardSpan.center, handguard);
  // Raised ribs run the length of the handguard, all the way around.
  for (let rib = 0; rib < 12; rib++) {
    const angle = (rib / 12) * Math.PI * 2 + Math.PI / 12;
    const ribGeometry = box(0.005, 0.003, guardSpan.length - 0.012).rotateZ(-angle);
    const x = Math.sin(angle) * guard.ribRadius;
    const y = boreY + Math.cos(angle) * guard.ribRadius * guard.heightScale;
    add('handguard-rib', ribGeometry, polymer, x, y, guardSpan.center, handguard);
  }
  add('handguard-cap', cylinder(0.026, 0.006), steel, 0, boreY, guard.frontZ - 0.002, handguard);
  add('delta-ring', cylinderZ(0.033, 0.03, 0.012), steel, 0, boreY, profile.deltaRingZ, handguard);

  const carry = assembly('carry-handle');
  add('carry-handle-body', extrude(profile.carryHandle, 0.022, profile.carryHandleWindow), metal, 0, 0, 0, carry);
  for (const side of [-1, 1]) add('rear-sight-ear', extrude(profile.rearSightEar, 0.005), metal, side * 0.012, 0, 0, carry);
  add('rear-aperture', new THREE.TorusGeometry(0.006, 0.002, 4, 12), steel, 0, config.sightHeight, profile.rearSightZ, carry);
  add('windage-knob', cylinder(0.008, 0.006).rotateY(Math.PI / 2), steel, 0.015, 0.07, profile.rearSightZ, carry);

  const frontSight = assembly('front-sight');
  const base = profile.frontSightBase;
  const baseSpan = span(base.rearZ, base.frontZ);
  add('front-sight-base', box(0.022, base.topY - base.bottomY, baseSpan.length), steel, 0, (base.topY + base.bottomY) / 2, baseSpan.center, frontSight);
  add('front-sight-tower', extrude(profile.frontSightTower, 0.012, profile.frontSightHole), steel, 0, 0, 0, frontSight);
  for (const side of [-1, 1]) add('front-sight-ear', extrude(profile.frontSightEar, 0.004), steel, side * 0.009, 0, 0, frontSight);
  add('front-sight-post', box(0.003, 0.02, 0.004), steel, 0, config.sightHeight - 0.01, profile.frontSightZ, frontSight);
  add('bayonet-lug', box(0.008, 0.012, 0.012), steel, 0, base.bottomY - 0.005, base.frontZ + 0.01, frontSight);

  const grip = assembly('grip');
  add('grip-shell', extrude(profile.grip, 0.033), polymer, 0, 0, 0, grip);
  const trigger = assembly('trigger-guard');
  add('trigger-guard-loop', extrude(profile.triggerGuard, 0.008), metal, 0, 0, 0, trigger);
  add('trigger', extrude(profile.trigger, 0.006), steel, 0, 0, 0, trigger);

  const stock = assembly('stock');
  const tube = profile.bufferTube;
  const tubeSpan = span(tube.rearZ, tube.frontZ);
  add('buffer-tube', cylinder(tube.radius, tubeSpan.length), steel, 0, tube.y, tubeSpan.center, stock);
  add('castle-nut', cylinder(0.019, 0.008), steel, 0, tube.y, tube.frontZ + 0.006, stock);
  add('stock-shell', extrude(profile.stock, 0.043), polymer, 0, 0, 0, stock);
  add('stock-buttpad', box(0.045, 0.128, 0.007), polymer, 0, -0.036, 0.2465, stock);
  add('stock-adjustment-lever', box(0.018, 0.009, 0.05), steel, 0, -0.046, 0.15, stock);

  // Right flank: ejection port, brass deflector and forward assist; left
  // flank: selector and bolt catch; receiver pins through both.
  const controls = assembly('controls');
  add('ejection-port', box(0.001, 0.016, 0.057), steel, profile.upperWidth / 2 + 0.0005, 0.016, -0.05, controls);
  add('dust-cover', box(0.003, 0.009, 0.06), metal, profile.upperWidth / 2 + 0.002, 0.003, -0.05, controls);
  add('brass-deflector', extrude([[-0.02, 0.008], [-0.008, 0.032], [0.004, 0.008]], 0.012), metal, profile.upperWidth / 2 + 0.003, 0, 0, controls);
  add('forward-assist', cylinder(0.007, 0.026), metal, profile.upperWidth / 2 + 0.006, 0.016, 0.022, controls);
  for (const side of [-1, 1]) {
    for (const depth of [-0.13, 0.05]) {
      const pin = new THREE.CylinderGeometry(0.003, 0.003, 0.002, 8).rotateZ(Math.PI / 2);
      add('receiver-pin', pin, steel, side * (profile.lowerWidth / 2 + 0.001), -0.012, depth, controls);
    }
  }
  add('selector', box(0.005, 0.006, 0.021), steel, -profile.lowerWidth / 2 - 0.002, -0.014, 0.016, controls);
  add('bolt-catch', box(0.004, 0.016, 0.009), steel, -profile.lowerWidth / 2 - 0.002, -0.02, -0.056, controls);
  add('magazine-release', box(0.005, 0.009, 0.016), steel, profile.lowerWidth / 2 + 0.002, -0.022, -0.052, controls);

  const handle = assembly('charging-handle');
  handle.position.set(0, 0.034, 0.044);
  add('charging-handle-stem', box(0.014, 0.006, 0.06), steel, 0, 0, -0.025, handle);
  add('charging-handle-latch', box(0.061, 0.009, 0.013), steel, 0, 0, 0.005, handle);

  const magazine = assembly('magazine');
  magazine.position.fromArray(config.reloadAnim!.magAnchor!);
  magazine.rotation.set(...config.reloadAnim!.magRotation!);
  const mag = profile.magazine;
  add('magazine-shell', extrude(mag.outline, mag.width), magazineMaterial, 0, 0, 0, magazine);
  add('magazine-floorplate', extrude(mag.floorplate, mag.width + 0.004), magazineMaterial, 0, 0, 0, magazine);
  for (const [topZ, bottomZ] of mag.ribs) {
    const rib: ProfilePoint[] = [[topZ - 0.0015, -0.003], [topZ + 0.0015, -0.003], [bottomZ + 0.0015, -0.1], [bottomZ - 0.0015, -0.1]];
    add('magazine-rib', extrude(rib, mag.width + 0.002), magazineMaterial, 0, 0, 0, magazine);
  }

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, boreY, profile.muzzleZ - 0.005).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(profile.upperWidth / 2 + 0.008, 0.016, -0.05).multiplyScalar(config.scale),
    sightY: config.sightHeight * config.scale,
    reloadParts: { magazine, handle },
  };
}
