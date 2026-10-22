import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cylinderZ, extrudeProfile, profileShape, shapeWidth, type ProfilePoint } from './ProfileGeometry';
import { steelWearTexture } from './ProceduralTextures';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/**
 * HK MP5A3 side profiles, traced from a reference photo (700 mm with the
 * stock extended, 225 mm barrel) and shared by the first-person model and
 * the wall-buy silhouette. The bore runs at y = 0.01 and the trigger sits
 * near z = -0.05, like the M4A1, so the gloves share its grip geometry.
 */
export const MP5_PROFILE = {
  boreY: 0.01,
  /**
   * Flat-sided lower half of the stamped receiver with its magazine well;
   * the round upper tube (receiverTube) sits on it up to the top line.
   */
  receiver: [
    [0.09, 0.03], [-0.194, 0.03], [-0.194, -0.008], [-0.16, -0.008],
    [-0.158, -0.066], [-0.112, -0.066], [-0.108, -0.008], [0.09, -0.008],
  ] as readonly ProfilePoint[],
  /** Round-topped upper receiver: its top is the cocking-tube line (y = 0.047). */
  receiverTube: { rearZ: 0.086, frontZ: -0.194, y: 0.029, radius: 0.018 },
  /** Pressed channels along both flanks that the stock struts ride in. */
  strutChannel: { rearZ: 0.09, frontZ: -0.07, y: 0.009, height: 0.011 },
  /** Polymer trigger housing under the receiver. */
  housing: [
    [0.088, -0.008], [-0.107, -0.008], [-0.107, -0.063], [-0.011, -0.063],
    [0.03, -0.058], [0.07, -0.046], [0.088, -0.036],
  ] as readonly ProfilePoint[],
  /** Rear-raked pistol grip, same rake and section as the M4A1's. */
  grip: [[-0.011, -0.055], [0.028, -0.054], [0.068, -0.153], [0.022, -0.16]] as readonly ProfilePoint[],
  /** Moulded trigger guard: outer edge, then back along the inner edge. */
  triggerGuard: [
    [-0.106, -0.063], [-0.1, -0.097], [-0.018, -0.097], [-0.011, -0.061],
    [-0.017, -0.061], [-0.024, -0.091], [-0.095, -0.091], [-0.1, -0.063],
  ] as readonly ProfilePoint[],
  trigger: [[-0.052, -0.061], [-0.055, -0.074], [-0.044, -0.086], [-0.047, -0.074], [-0.047, -0.061]] as readonly ProfilePoint[],
  /** Curved 30-round magazine, local to its seat at the bottom of the well. */
  magazine: {
    seat: [0, -0.066, -0.136] as const,
    outline: [
      [0.021, 0.05], [-0.021, 0.05], [-0.021, 0], [-0.032, -0.06], [-0.052, -0.113],
      [-0.07, -0.133], [-0.03, -0.143], [-0.01, -0.12], [0.012, -0.06], [0.021, 0],
    ] as readonly ProfilePoint[],
    /** Stamped stiffening rib down the middle of each flank, following the curve. */
    rib: [
      [0.004, -0.004], [-0.006, -0.06], [-0.027, -0.112], [-0.035, -0.116], [-0.014, -0.06], [-0.004, -0.004],
    ] as readonly ProfilePoint[],
    floorplate: [[-0.072, -0.13], [-0.075, -0.137], [-0.03, -0.149], [-0.026, -0.142]] as readonly ProfilePoint[],
    width: 0.022,
  },
  /** Slim handguard around the barrel, below the cocking tube. */
  handguard: [
    [-0.196, 0.03], [-0.33, 0.03], [-0.336, 0.022], [-0.336, -0.004],
    [-0.326, -0.012], [-0.205, -0.014], [-0.196, -0.008],
  ] as readonly ProfilePoint[],
  cockingTube: { rearZ: -0.194, frontZ: -0.35, y: 0.036, radius: 0.0105 },
  /** Front sight block joining the cocking tube and the barrel, under the hooded post. */
  frontSightBlock: [[-0.334, 0.047], [-0.358, 0.047], [-0.358, 0.0], [-0.348, -0.006], [-0.334, -0.006]] as readonly ProfilePoint[],
  frontSightZ: -0.347,
  hoodRadius: 0.012,
  /** Rotary diopter drum on its base, just above the grip. */
  rearSight: { z: 0.008, drumRadius: 0.012, drumWidth: 0.024 },
  barrel: { rearZ: -0.336, muzzleZ: -0.392, radius: 0.0085 },
  /** Three-lug suppressor/flash-hider mount behind the muzzle. */
  triLug: { rearZ: -0.366, frontZ: -0.38, radius: 0.0115 },
  /** Retractable stock (A3): two steel struts and the curved polymer butt. */
  strut: { rearZ: 0.262, frontZ: 0.03, y: 0.009, x: 0.016, radius: 0.0052 },
  butt: [
    [0.255, 0.032], [0.285, 0.034], [0.3, -0.01], [0.31, -0.085], [0.296, -0.094], [0.282, -0.088], [0.262, -0.01],
  ] as readonly ProfilePoint[],
} as const;

/**
 * MP5A3 view model: stamped receiver, polymer trigger housing and grip,
 * slim checkered handguard, cocking tube with its folding handle on the
 * left, hooded front post, rotary drum rear sight, three-lug barrel, curved
 * magazine and the retractable two-strut stock. The magazine and the
 * cocking handle are the reload parts the shared ReloadAnimator drives.
 */
export function buildMP5(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'mp5-root';
  const profile = MP5_PROFILE;
  const sightY = config.sightHeight;
  const boreY = profile.boreY;
  // Black-finished stamped steel with handling wear, and stippled polymer:
  // the same speckle map breaks up the roughness of both.
  const wear = steelWearTexture();
  const steel = new THREE.MeshStandardMaterial({
    color: config.bodyColor, metalness: 0.74, roughness: wear ? 0.72 : 0.44, roughnessMap: wear, envMapIntensity: 1.25,
  });
  const darkSteel = new THREE.MeshStandardMaterial({
    color: 0x141618, metalness: 0.8, roughness: wear ? 0.66 : 0.4, roughnessMap: wear, envMapIntensity: 1.1,
  });
  // Bare bolt and carrier seen through the open ejection port.
  const boltSteel = new THREE.MeshStandardMaterial({ color: 0x7c8287, metalness: 0.92, roughness: 0.3, envMapIntensity: 1.4 });
  const polymer = new THREE.MeshStandardMaterial({
    color: config.accentColor, metalness: 0.04, roughness: wear ? 0.95 : 0.8, roughnessMap: wear, envMapIntensity: 0.8,
  });
  const checkering = new THREE.MeshStandardMaterial({ color: new THREE.Color(config.accentColor).multiplyScalar(0.6), metalness: 0.02, roughness: 0.98 });
  const magazineMaterial = new THREE.MeshStandardMaterial({
    color: config.reloadAnim!.magColor, metalness: 0.62, roughness: wear ? 0.82 : 0.55, roughnessMap: wear, envMapIntensity: 1.1,
  });
  const bore = new THREE.MeshBasicMaterial({ color: 0x030404 });

  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    parent: THREE.Object3D, x = 0, y = 0, z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `mp5-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `mp5-${name}`;
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };

  // Receiver: flat-sided stamping under a round upper tube, strut channels
  // pressed into both flanks, cocking tube and the front sight block.
  const receiver = assembly('receiver');
  add('receiver-shell', extrudeProfile(profileShape(profile.receiver), 0.036, 0.002), steel, receiver);
  const upper = profile.receiverTube;
  const upperLength = upper.rearZ - upper.frontZ;
  add('receiver-tube', cylinderZ(upper.radius, upper.radius, upperLength, 20), steel, receiver, 0, upper.y, upper.rearZ - upperLength / 2);
  const channel = profile.strutChannel;
  for (const side of [-1, 1]) {
    add('strut-channel', new THREE.BoxGeometry(0.002, channel.height, channel.rearZ - channel.frontZ), darkSteel, receiver,
      side * 0.0181, channel.y, (channel.rearZ + channel.frontZ) / 2);
    // Pressed stiffening bead along the upper flank.
    add('receiver-bead', cylinderZ(0.0016, 0.0016, 0.2, 6), steel, receiver, side * 0.0175, 0.022, -0.06);
  }
  // Claw-mount recesses for optics, two pairs on the receiver top.
  for (const z of [-0.035, -0.15]) {
    for (const side of [-1, 1]) add('claw-recess', new THREE.BoxGeometry(0.004, 0.003, 0.01), darkSteel, receiver, side * 0.0095, 0.0445, z);
  }
  const tube = profile.cockingTube;
  const tubeLength = tube.rearZ - tube.frontZ;
  add('cocking-tube', cylinderZ(tube.radius, tube.radius, tubeLength, 14), steel, receiver, 0, tube.y, tube.rearZ - tubeLength / 2);
  add('cocking-slot', new THREE.BoxGeometry(0.001, 0.004, 0.09), bore, receiver, -tube.radius - 0.0002, tube.y, -0.29);
  add('front-sight-block', extrudeProfile(profileShape(profile.frontSightBlock), 0.03, 0.002), steel, receiver);
  add('end-cap', new RoundedBoxGeometry(0.04, 0.05, 0.012, 2, 0.003), darkSteel, receiver, 0, 0.018, 0.092);
  add('front-sling-loop', new THREE.TorusGeometry(0.007, 0.0014, 5, 12).rotateY(Math.PI / 2), darkSteel, receiver, -0.017, 0.012, 0.1);
  // Open ejection port on the right with the bolt face showing inside.
  add('ejection-port', new THREE.BoxGeometry(0.002, 0.015, 0.05), bore, receiver, 0.0182, 0.026, -0.075);
  add('bolt-face', new THREE.BoxGeometry(0.002, 0.011, 0.03), boltSteel, receiver, 0.0178, 0.026, -0.064);
  for (const z of [-0.03, -0.12]) {
    for (const side of [-1, 1]) add('receiver-weld', new THREE.BoxGeometry(0.002, 0.004, 0.004), darkSteel, receiver, side * 0.0185, 0.004, z);
  }

  // Trigger group: polymer housing, grip, guard, trigger, selector and pins.
  const lower = assembly('lower');
  add('housing', extrudeProfile(profileShape(profile.housing), 0.034, 0.002), polymer, lower);
  // Palm swell: the grip is slimmer where it meets the housing.
  const gripShell = shapeWidth(
    extrudeProfile(profileShape(profile.grip), 0.033, 0.005, { segments: 3, keepOutline: true }),
    (y) => THREE.MathUtils.lerp(0.82, 1, THREE.MathUtils.clamp((-0.058 - y) / 0.04, 0, 1)),
  );
  add('grip-shell', gripShell, polymer, lower);
  add('trigger-guard', extrudeProfile(profileShape(profile.triggerGuard), 0.01, 0.0015, { segments: 2 }), polymer, lower);
  add('trigger', extrudeProfile(profileShape(profile.trigger), 0.006, 0.0008), darkSteel, lower);
  // Flat ambidextrous-style selector lever on the left, pivoting above the grip.
  const selector = profileShape([[-0.004, -0.022], [-0.03, -0.012], [-0.035, -0.015], [-0.033, -0.019], [-0.006, -0.031]]);
  add('selector-lever', extrudeProfile(selector, 0.0018, 0.0004), darkSteel, lower, -0.0186);
  add('selector-hub', cylinderZ(0.0055, 0.0055, 0.003, 14).rotateY(Math.PI / 2), darkSteel, lower, -0.018, -0.026, -0.006);
  for (const z of [0.07, -0.098]) {
    for (const side of [-1, 1]) {
      add('housing-pin', new THREE.SphereGeometry(0.0032, 10, 6).scale(0.45, 1, 1), darkSteel, lower, side * 0.0172, -0.02, z);
    }
  }
  add('magazine-paddle', new THREE.BoxGeometry(0.014, 0.012, 0.004).rotateX(0.4), darkSteel, lower, 0, -0.07, -0.108);
  add('magazine-button', cylinderZ(0.004, 0.004, 0.004, 10).rotateY(Math.PI / 2), darkSteel, lower, 0.0185, -0.03, -0.1);

  // Slim handguard with checkered panels on both flanks.
  const handguard = assembly('handguard');
  // Oval section: the flanks round off toward the top and bottom edges.
  const handguardShell = shapeWidth(
    extrudeProfile(profileShape(profile.handguard), 0.042, 0.006, { segments: 3, keepOutline: true }),
    (y) => 1 - 0.22 * Math.min(1, ((y - 0.009) / 0.022) ** 2),
  );
  add('handguard-shell', handguardShell, polymer, handguard);
  for (const side of [-1, 1]) {
    for (const y of [0.018, -0.001]) {
      add('handguard-checkering', new RoundedBoxGeometry(0.002, 0.009, 0.11, 1, 0.0008), checkering, handguard, side * 0.0204, y, -0.266);
    }
  }

  // Barrel: short exposed muzzle with the three-lug mount.
  const barrel = assembly('barrel');
  const { rearZ, muzzleZ, radius } = profile.barrel;
  add('barrel-core', cylinderZ(radius, radius, rearZ - muzzleZ, 14), darkSteel, barrel, 0, boreY, (rearZ + muzzleZ) / 2);
  const lug = profile.triLug;
  add('tri-lug-ring', cylinderZ(lug.radius - 0.002, lug.radius - 0.002, lug.rearZ - lug.frontZ, 14), darkSteel, barrel, 0, boreY, (lug.rearZ + lug.frontZ) / 2);
  for (let index = 0; index < 3; index++) {
    const angle = Math.PI / 2 + (index * Math.PI * 2) / 3;
    const tab = new THREE.BoxGeometry(0.006, 0.004, lug.rearZ - lug.frontZ);
    tab.rotateZ(angle - Math.PI / 2);
    add('tri-lug', tab, darkSteel, barrel, Math.cos(angle) * (lug.radius - 0.001), boreY + Math.sin(angle) * (lug.radius - 0.001), (lug.rearZ + lug.frontZ) / 2);
  }
  add('bore', new THREE.CircleGeometry(0.0045, 12).rotateY(Math.PI), bore, barrel, 0, boreY, muzzleZ - 0.0002);

  // Sights: hooded front post and the rotary drum with its aperture.
  const sights = assembly('sights');
  const frontZ = profile.frontSightZ;
  const hood = profile.hoodRadius;
  add('front-sight-hood', new THREE.TorusGeometry(hood, 0.0022, 6, 16), steel, sights, 0, sightY - 0.002, frontZ);
  add('front-sight-pillar', new THREE.BoxGeometry(0.01, sightY - hood - 0.047, 0.012), steel, sights, 0, 0.047 + (sightY - hood - 0.047) / 2, frontZ);
  add('front-sight-post', new THREE.BoxGeometry(0.0026, sightY - (sightY - hood - 0.002), 0.003), darkSteel, sights, 0, sightY - (hood + 0.002) / 2, frontZ);
  const rear = profile.rearSight;
  const drumY = sightY - 0.016;
  add('rear-sight-base', new THREE.BoxGeometry(0.03, drumY - 0.047, 0.03), steel, sights, 0, 0.047 + (drumY - 0.047) / 2, rear.z);
  const drum = new THREE.CylinderGeometry(rear.drumRadius, rear.drumRadius, rear.drumWidth, 16).rotateZ(Math.PI / 2);
  add('rear-sight-drum', drum, darkSteel, sights, 0, drumY, rear.z);
  // Knurled rings for the thumb that turns the drum between apertures.
  for (let ring = 0; ring < 5; ring++) {
    const knurl = new THREE.CylinderGeometry(rear.drumRadius + 0.0008, rear.drumRadius + 0.0008, 0.0016, 16).rotateZ(Math.PI / 2);
    add('rear-sight-knurl', knurl, darkSteel, sights, -rear.drumWidth / 2 + 0.003 + ring * 0.0045, drumY, rear.z);
  }
  add('rear-aperture', new THREE.TorusGeometry(0.0045, 0.0018, 4, 12), darkSteel, sights, 0, sightY, rear.z);
  for (const side of [-1, 1]) add('rear-sight-ear', new THREE.BoxGeometry(0.004, 0.02, 0.022), steel, sights, side * 0.013, sightY - 0.006, rear.z);

  // Retractable stock: twin struts and the curved butt.
  const stock = assembly('stock');
  const strut = profile.strut;
  const strutLength = strut.rearZ - strut.frontZ;
  for (const side of [-1, 1]) {
    add('stock-strut', cylinderZ(strut.radius, strut.radius, strutLength, 10), darkSteel, stock, side * strut.x, strut.y, strut.frontZ + strutLength / 2);
  }
  add('stock-yoke', new RoundedBoxGeometry(0.044, 0.02, 0.014, 2, 0.003), darkSteel, stock, 0, strut.y, strut.rearZ - 0.004);
  add('stock-butt', extrudeProfile(profileShape(profile.butt), 0.04, 0.006, { segments: 3, keepOutline: true }), polymer, stock);
  add('stock-latch', new RoundedBoxGeometry(0.012, 0.008, 0.016, 1, 0.002), darkSteel, stock, 0, strut.y - 0.012, 0.1);

  // Cocking handle: folds out of the tube's left slot; the animator racks it back.
  const handle = assembly('charging-handle', -tube.radius, tube.y, -0.318);
  add('charging-handle-stem', new THREE.BoxGeometry(0.024, 0.006, 0.008), darkSteel, handle, -0.012, 0, 0);
  add('charging-handle-knob', new THREE.CylinderGeometry(0.0055, 0.0055, 0.012, 10), darkSteel, handle, -0.026, 0, -0.003);

  // Curved 30-round magazine seated in the well.
  const mag = profile.magazine;
  const magazine = assembly('magazine', ...mag.seat);
  add('magazine-shell', extrudeProfile(profileShape(mag.outline), mag.width, 0.0018, { segments: 2 }), magazineMaterial, magazine);
  for (const side of [-1, 1]) {
    add('magazine-rib', extrudeProfile(profileShape(mag.rib), 0.0016, 0.0005), magazineMaterial, magazine, side * (mag.width / 2 + 0.0004));
  }
  add('magazine-floorplate', extrudeProfile(profileShape(mag.floorplate), mag.width + 0.003, 0.001), magazineMaterial, magazine);

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, boreY, muzzleZ - 0.004).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.024, 0.027, -0.075).multiplyScalar(config.scale),
    sightY: sightY * config.scale,
    reloadParts: { magazine, handle },
  };
}
