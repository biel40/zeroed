// Original Zeroed cooperative teammate. Generates a compact, self-contained
// animated GLB using the same Three.js exporter as the Brutus asset.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { deflateSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

class NodeFileReader {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((data) => { this.result = data; this.onloadend?.(); });
  }
}
globalThis.FileReader = NodeFileReader;

const root = new THREE.Group();
root.name = 'ZeroedTeammate';
const palette = {
  jacket: [0x464a3f, 0.99], jacketShade: [0x30362f, 1],
  seams: [0x272d27, 1], trousers: [0x3b3e36, 1],
  boot: [0x1d211f, 0.88], rubber: [0x151a19, 0.98],
  webbing: [0x616354, 0.97], fadedWebbing: [0x696a58, 0.98],
  pouch: [0x484c40, 1], steel: [0x343a39, 0.86, 0.15],
  wornSteel: [0x52534a, 0.8, 0.28], skin: [0x8e735e, 0.98],
  skinShade: [0x604c40, 1], hair: [0x211f1d, 1],
  eye: [0x151917, 0.9], white: [0xaaa395, 0.9],
};
const mat = Object.fromEntries(Object.entries(palette).map(([name, [color, roughness, metalness = 0]]) => [
  name, new THREE.MeshStandardMaterial({ name, color, roughness, metalness }),
]));
const bones = {};
function bone(name, parent, xyz) {
  const b = new THREE.Bone(); b.name = name; b.position.set(...xyz); parent.add(b); bones[name] = b; return b;
}
function add(name, parent, geometry, material, xyz, scale = [1, 1, 1], angles = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, mat[material]);
  mesh.name = name; mesh.position.set(...xyz); mesh.scale.set(...scale); mesh.rotation.set(...angles);
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function ellipsoid(name, parent, material, xyz, size, detail = 12) {
  return add(name, parent, new THREE.SphereGeometry(1, detail, 8), material, xyz, size);
}
function taper(name, parent, material, xyz, top, bottom, length, depth = 1, sides = 12) {
  const geometry = new THREE.CylinderGeometry(top, bottom, length, sides, 3);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const ripple = 1 + 0.055 * Math.sin(y * 12 + 0.7) + 0.025 * Math.sin(y * 29 + i * 0.3);
    p.setXYZ(i, p.getX(i) * ripple, y, p.getZ(i) * depth * ripple);
  }
  geometry.computeVertexNormals();
  return add(name, parent, geometry, material, xyz);
}
function organicLoft(name, parent, material, rings, sides = 16) {
  const positions = [], uvs = [], faces = [];
  for (let row = 0; row < rings.length; row++) {
    const [y, width, depth, centerZ] = rings[row];
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const x = Math.cos(angle) * width;
      let z = centerZ + Math.sin(angle) * depth;
      if (name === 'face-and-jaw' && Math.sin(angle) > 0) {
        // Small cheekbone and eye-socket changes give the skin a human profile
        // under the game lighting without separate floating facial pieces.
        const cheek = Math.exp(-(((Math.abs(x) - 0.055) / 0.027) ** 2 + ((y - 0.063) / 0.037) ** 2));
        const socket = Math.exp(-(((Math.abs(x) - 0.043) / 0.019) ** 2 + ((y - 0.105) / 0.023) ** 2));
        z += 0.009 * cheek - 0.004 * socket;
      }
      positions.push(x, y, z);
      uvs.push(side / sides, row / (rings.length - 1));
      if (row < rings.length - 1) {
        const next = (side + 1) % sides;
        const a = row * sides + side, b = row * sides + next;
        faces.push(a, (row + 1) * sides + side, b,
          b, (row + 1) * sides + side, (row + 1) * sides + next);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(faces); geometry.computeVertexNormals();
  return add(name, parent, geometry, material, [0, 0, 0]);
}
function strap(name, parent, material, xyz, size, angles = [0, 0, 0]) {
  return add(name, parent, new THREE.BoxGeometry(...size), material, xyz, [1, 1, 1], angles);
}

// Feet to crown: 1.79 m. Narrow shoulders, tapered waist, natural elbow and knee bends.
const hips = bone('Hips', root, [0, 0.98, 0]);
ellipsoid('pelvis', hips, 'trousers', [0, 0, 0], [0.188, 0.15, 0.125]);
const spine = bone('Spine', hips, [0, 0.15, 0]);
spine.rotation.x = 0.035;
taper('field-jacket', spine, 'jacket', [0, 0.22, 0], 0.205, 0.16, 0.49, 0.74, 16);
ellipsoid('upper-back-and-shoulders', spine, 'jacket', [0, 0.37, -0.015], [0.265, 0.135, 0.13], 16);
taper('jacket-hem', spine, 'jacketShade', [0, -0.045, 0], 0.165, 0.19, 0.19, 0.78);
strap('center-placket', spine, 'jacketShade', [0, 0.21, 0.153], [0.023, 0.40, 0.014]);
for (const side of [-1, 1]) {
  const tag = side < 0 ? 'L' : 'R';
  strap(`angled-collar-${tag}`, spine, 'jacketShade', [side * 0.075, 0.444, 0.108], [0.105, 0.11, 0.038], [0.25, side * 0.12, side * 0.29]);
  strap(`breast-pocket-${tag}`, spine, 'jacketShade', [side * 0.108, 0.29, 0.145], [0.103, 0.105, 0.035], [0, side * 0.06, 0]);
  strap(`pocket-flap-${tag}`, spine, 'jacket', [side * 0.108, 0.35, 0.17], [0.11, 0.024, 0.012]);
  strap(`waist-pocket-${tag}`, spine, 'pouch', [side * 0.128, 0.065, 0.145], [0.105, 0.11, 0.056]);
  strap(`waist-flap-${tag}`, spine, 'webbing', [side * 0.128, 0.125, 0.172], [0.115, 0.025, 0.02]);
  strap(`suspender-${tag}`, spine, 'webbing', [side * 0.135, 0.29, 0.162], [0.045, 0.40, 0.018], [0.1, 0, side * 0.11]);
  strap(`rear-suspender-${tag}`, spine, 'fadedWebbing', [side * 0.14, 0.29, -0.156], [0.038, 0.38, 0.018], [-0.08, 0, -side * 0.12]);
  strap(`rear-shoulder-seam-${tag}`, spine, 'seams', [side * 0.13, 0.45, -0.126], [0.24, 0.014, 0.014], [0, 0, side * 0.13]);
}
strap('belt', spine, 'boot', [0, -0.012, 0.01], [0.39, 0.056, 0.295]);
strap('belt-buckle', spine, 'wornSteel', [0, -0.012, 0.165], [0.055, 0.037, 0.012]);
strap('rear-pack', spine, 'pouch', [0, 0.22, -0.218], [0.315, 0.36, 0.13]);
strap('pack-flap', spine, 'jacketShade', [0, 0.405, -0.23], [0.33, 0.07, 0.15]);
strap('pack-bottom-roll', spine, 'fadedWebbing', [0, -0.015, -0.225], [0.29, 0.075, 0.12]);
strap('pack-center-strap', spine, 'webbing', [0, 0.21, -0.295], [0.034, 0.38, 0.018]);

const neck = bone('Neck', spine, [0, 0.53, 0]);
taper('neck-and-undershirt', neck, 'skinShade', [0, 0.025, 0], 0.071, 0.082, 0.12, 0.85);
const head = bone('Head', neck, [0, 0.1, 0.015]);
organicLoft('face-and-jaw', head, 'skin', [
  [-0.065, 0.045, 0.046, 0.018], [-0.037, 0.069, 0.067, 0.016],
  [0.004, 0.081, 0.078, 0.011], [0.043, 0.095, 0.086, 0.008],
  [0.081, 0.095, 0.087, 0.006], [0.116, 0.086, 0.082, 0.003],
  [0.154, 0.092, 0.078, -0.003], [0.188, 0.069, 0.061, -0.008],
], 24);
const noseGeometry = new THREE.BufferGeometry();
noseGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  -0.011,0.104,0.083, 0.011,0.104,0.083,
  -0.018,0.056,0.104, 0.018,0.056,0.104,
  -0.014,0.034,0.116, 0.014,0.034,0.116,
  -0.014,0.027,0.095, 0.014,0.027,0.095,
], 3));
noseGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([
  0,1, 1,1, 0,0.65, 1,0.65, 0,0.25, 1,0.25, 0,0, 1,0,
], 2));
noseGeometry.setIndex([0,2,1,1,2,3,2,4,3,3,4,5,4,6,5,5,6,7,0,6,2,1,3,7]);
noseGeometry.computeVertexNormals();
add('nose', head, noseGeometry, 'skin', [0, 0, 0]);
for (const side of [-1, 1]) {
  ellipsoid(`ear-${side}`, head, 'skin', [side * 0.099, 0.056, 0], [0.014, 0.029, 0.019], 10);
  ellipsoid(`lower-eyelid-${side}`, head, 'skinShade', [side * 0.042, 0.089, 0.085], [0.023, 0.006, 0.006], 10);
  ellipsoid(`eye-white-${side}`, head, 'white', [side * 0.042, 0.099, 0.085], [0.016, 0.006, 0.004], 10);
  ellipsoid(`iris-${side}`, head, 'eye', [side * 0.04, 0.099, 0.089], [0.006, 0.005, 0.003], 10);
  ellipsoid(`upper-eyelid-${side}`, head, 'skinShade', [side * 0.042, 0.106, 0.084], [0.023, 0.005, 0.006], 10);
  strap(`brow-${side}`, head, 'hair', [side * 0.042, 0.118, 0.079], [0.042, 0.006, 0.007], [0, 0, side * 0.08]);
  strap(`helmet-side-band-${side}`, head, 'boot', [side * 0.106, 0.155, -0.006], [0.015, 0.09, 0.015], [0, 0, side * 0.15]);
}
// The mask follows the jaw contour and overlaps the neck fabric by a few mm.
organicLoft('fitted-face-wrap', head, 'jacketShade', [
  [-0.082, 0.07, 0.068, 0.012], [-0.051, 0.079, 0.076, 0.011],
  [-0.014, 0.087, 0.081, 0.01], [0.032, 0.093, 0.09, 0.009],
]);
ellipsoid('hairline', head, 'hair', [0, 0.165, -0.004], [0.106, 0.076, 0.098], 12);
add('helmet-dome', head,
  new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  'steel', [0, 0.15, -0.008], [0.139, 0.108, 0.138]);
ellipsoid('helmet-brim', head, 'steel', [0, 0.153, 0.01], [0.15, 0.014, 0.151], 16);
strap('helmet-front-lip', head, 'webbing', [0, 0.145, 0.145], [0.15, 0.011, 0.011]);
for (const side of [-1, 1]) strap(`chin-strap-${side}`, head, 'boot', [side * 0.101, 0.005, 0.018], [0.01, 0.12, 0.011], [0, 0, side * 0.17]);

for (const side of [-1, 1]) {
  const tag = side < 0 ? 'L' : 'R';
  const thigh = bone(`UpperLeg${tag}`, hips, [side * 0.105, -0.075, 0]);
  thigh.rotation.x = -0.055; thigh.rotation.z = side * 0.025;
  taper(`thigh-fabric-${tag}`, thigh, 'trousers', [0, -0.235, 0], 0.117, 0.095, 0.49, 0.93, 14);
  strap(`cargo-pocket-${tag}`, thigh, 'jacketShade', [side * 0.102, -0.235, 0.012], [0.036, 0.16, 0.115]);
  strap(`cargo-flap-${tag}`, thigh, 'webbing', [side * 0.124, -0.145, 0.012], [0.032, 0.022, 0.125]);
  const shin = bone(`LowerLeg${tag}`, thigh, [0, -0.48, 0]);
  shin.rotation.x = 0.12;
  ellipsoid(`knee-fabric-${tag}`, shin, 'trousers', [0, -0.012, 0.015], [0.096, 0.087, 0.09]);
  taper(`shin-fabric-${tag}`, shin, 'trousers', [0, -0.185, 0], 0.09, 0.07, 0.36, 0.94, 12);
  taper(`boot-shaft-${tag}`, shin, 'boot', [0, -0.32, 0], 0.078, 0.085, 0.21, 0.94, 12);
  for (let row = 0; row < 3; row++) strap(`boot-lace-${tag}-${row}`, shin, 'rubber', [0, -0.255 - row * 0.04, 0.077], [0.07, 0.007, 0.01]);
  const foot = bone(`Foot${tag}`, shin, [0, -0.42, 0.015]);
  ellipsoid(`boot-toe-${tag}`, foot, 'boot', [0, 0.008, 0.095], [0.094, 0.065, 0.175], 12);
  strap(`boot-sole-${tag}`, foot, 'rubber', [0, -0.043, 0.08], [0.195, 0.028, 0.32]);
}

for (const side of [-1, 1]) {
  const tag = side < 0 ? 'L' : 'R';
  const arm = bone(`UpperArm${tag}`, spine, [side * 0.238, 0.414, 0]);
  arm.rotation.z = side * 0.08; arm.rotation.x = -0.12;
  ellipsoid(`shoulder-cloth-${tag}`, arm, 'jacket', [0, -0.04, 0], [0.085, 0.09, 0.084]);
  taper(`sleeve-${tag}`, arm, 'jacket', [0, -0.151, 0], 0.083, 0.067, 0.29, 0.93);
  strap(`sleeve-seam-${tag}`, arm, 'seams', [side * 0.085, -0.15, 0], [0.009, 0.22, 0.014]);
  taper(`upper-sleeve-fold-${tag}`, arm, 'jacketShade', [0, -0.265, 0], 0.074, 0.072, 0.035, 1.02);
  const fore = bone(`ForeArm${tag}`, arm, [0, -0.295, 0]);
  fore.rotation.x = -0.17;
  ellipsoid(`elbow-cloth-${tag}`, fore, 'jacket', [0, 0, 0], [0.071, 0.067, 0.071]);
  taper(`forearm-sleeve-${tag}`, fore, 'jacket', [0, -0.145, 0], 0.073, 0.05, 0.29, 0.91);
  taper(`cuff-${tag}`, fore, 'jacketShade', [0, -0.285, 0], 0.054, 0.055, 0.05, 0.94);
  const hand = bone(`Hand${tag}`, fore, [0, -0.315, 0]);
  ellipsoid(`glove-${tag}`, hand, 'boot', [0, -0.045, 0.007], [0.055, 0.077, 0.046]);
  ellipsoid(`thumb-${tag}`, hand, 'boot', [-side * 0.043, -0.015, 0.037], [0.019, 0.043, 0.022], 8);
  strap(`knuckle-${tag}`, hand, 'webbing', [0, -0.014, 0.043], [0.083, 0.025, 0.012]);
}

// Compact holstered sidearm and utility kit keep the silhouette grounded.
strap('holster', hips, 'boot', [0.206, -0.13, 0.005], [0.09, 0.19, 0.085], [0, 0, -0.12]);
strap('holster-flap', hips, 'webbing', [0.206, -0.045, 0.052], [0.092, 0.04, 0.015]);
strap('left-canteen', hips, 'pouch', [-0.209, -0.055, -0.025], [0.08, 0.15, 0.105]);
strap('left-canteen-cap', hips, 'wornSteel', [-0.209, 0.034, -0.025], [0.047, 0.025, 0.052]);

// Solve each two-bone arm against the firing grip and fore-end. The weapon is
// fixed to the torso, and every live locomotion clip uses this same arm pose.
// This makes both palms stay on their contact points as the body moves.
const readyArms = {};
function readyArm(tag, wristXYZ, bendXYZ) {
  const arm = bones[`UpperArm${tag}`], fore = bones[`ForeArm${tag}`];
  const shoulder = arm.position.clone();
  const wrist = new THREE.Vector3(...wristXYZ);
  const toward = wrist.clone().sub(shoulder);
  const distance = toward.length(), upperLength = 0.295, lowerLength = 0.315;
  if (distance > upperLength + lowerLength - 0.005) throw new Error(`${tag} arm cannot reach rifle grip`);
  toward.normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const offAxis = Math.sqrt(upperLength ** 2 - along ** 2);
  const bend = new THREE.Vector3(...bendXYZ);
  bend.addScaledVector(toward, -bend.dot(toward)).normalize();
  const elbow = shoulder.clone().addScaledVector(toward, along).addScaledVector(bend, offAxis);
  const upperDirection = elbow.clone().sub(shoulder).normalize();
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), upperDirection);
  const lowerDirection = wrist.clone().sub(elbow).normalize().applyQuaternion(arm.quaternion.clone().invert());
  fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), lowerDirection);
  root.updateMatrixWorld(true);
  const palm = spine.worldToLocal(bones[`Hand${tag}`].localToWorld(new THREE.Vector3(0, -0.045, 0.007)));
  const euler = (quaternion) => {
    const angle = new THREE.Euler().setFromQuaternion(quaternion);
    return [angle.x, angle.y, angle.z];
  };
  readyArms[tag] = { upper: euler(arm.quaternion), fore: euler(fore.quaternion), palm };
}
readyArm('R', [0.105, 0.31, 0.30], [1, -0.35, 0.12]);
readyArm('L', [-0.05, 0.335, 0.49], [-1, -0.2, 0.08]);
const firingPalm = readyArms.R.palm;
const supportPalm = readyArms.L.palm;
const rifleForward = supportPalm.clone().sub(firingPalm);
const supportGripZ = rifleForward.length();
rifleForward.normalize();
if (rifleForward.z < 0.88 || Math.abs(rifleForward.y) > 0.18) {
  throw new Error('Rifle is not held near level in the character facing direction');
}
const rifle = new THREE.Group();
rifle.name = 'teammate-rifle';
rifle.position.copy(firingPalm);
rifle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), rifleForward);
spine.add(rifle);
// Generic compact rifle, with no logos or recognizable proprietary details.
strap('rifle-butt', rifle, 'boot', [0, 0.052, -0.33], [0.09, 0.12, 0.04]);
strap('rifle-stock', rifle, 'webbing', [0, 0.057, -0.21], [0.057, 0.055, 0.25]);
strap('rifle-receiver', rifle, 'steel', [0, 0.056, 0.015], [0.094, 0.092, 0.225]);
strap('rifle-handguard', rifle, 'boot', [0, 0.055, 0.305], [0.079, 0.066, 0.37]);
strap('rifle-fore-end-wear', rifle, 'wornSteel', [0, 0.087, 0.31], [0.081, 0.012, 0.32]);
strap('rifle-firing-grip', rifle, 'boot', [0, -0.045, 0], [0.048, 0.105, 0.052], [-0.16, 0, 0]);
strap('rifle-magazine', rifle, 'steel', [0, -0.065, 0.145], [0.061, 0.155, 0.075], [-0.13, 0, 0]);
add('rifle-barrel', rifle, new THREE.CylinderGeometry(0.012, 0.014, 0.38, 10),
  'steel', [0, 0.052, 0.61], [1, 1, 1], [Math.PI / 2, 0, 0]);
add('rifle-muzzle', rifle, new THREE.CylinderGeometry(0.019, 0.018, 0.055, 10),
  'wornSteel', [0, 0.052, 0.805], [1, 1, 1], [Math.PI / 2, 0, 0]);
strap('rifle-rear-sight', rifle, 'wornSteel', [0, 0.118, -0.035], [0.037, 0.032, 0.015]);
strap('rifle-front-sight', rifle, 'steel', [0, 0.11, 0.59], [0.023, 0.05, 0.018]);
const supportInRifle = supportPalm.clone().sub(firingPalm).applyQuaternion(rifle.quaternion.clone().invert());
if (Math.abs(supportInRifle.z - supportGripZ) > 1e-4 || Math.abs(supportInRifle.x) > 1e-4) {
  throw new Error('Support palm does not align with the rifle fore-end');
}

// A skinned jacket makes the hierarchy a real glTF rig. The smaller garments
// follow the same bones as rigid attachments, so seams stay aligned.
const jacket = spine.getObjectByName('field-jacket');
spine.remove(jacket);
const jacketGeometry = jacket.geometry.clone();
jacketGeometry.translate(0, 1.35, 0);
const count = jacketGeometry.attributes.position.count;
const indices = new Uint16Array(count * 4);
const weights = new Float32Array(count * 4);
for (let i = 0; i < count; i++) { indices[i * 4] = 1; weights[i * 4] = 1; }
jacketGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
jacketGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
const skin = new THREE.SkinnedMesh(jacketGeometry, mat.jacket);
skin.name = 'field-jacket'; skin.castShadow = true; skin.receiveShadow = true;
root.add(skin);
root.updateMatrixWorld(true);
skin.bind(new THREE.Skeleton(Object.values(bones)));

// Continuous cloth surfaces bridge elbows and knees. A narrow blend at each
// joint avoids the separated-cylinder look of the old procedural stand-in.
const jointOrder = Object.keys(bones);
function skinnedLimb(name, surface, upperName, lowerName, sections) {
  const sides = 14;
  const positions = [], uvs = [], skinIndices = [], skinWeights = [], faces = [];
  const upper = bones[upperName], lower = bones[lowerName];
  const upperIndex = jointOrder.indexOf(upperName), lowerIndex = jointOrder.indexOf(lowerName);
  for (let ring = 0; ring < sections.length; ring++) {
    const [joint, y, rx, rz, lowerWeight] = sections[ring];
    const anchor = joint === 'lower' ? lower : upper;
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const wrinkle = 1 + 0.025 * Math.sin(angle * 3 + ring * 1.9);
      const point = new THREE.Vector3(Math.cos(angle) * rx * wrinkle, y,
        Math.sin(angle) * rz * wrinkle).applyMatrix4(anchor.matrixWorld);
      positions.push(point.x, point.y, point.z);
      uvs.push(side / sides, ring / (sections.length - 1));
      skinIndices.push(upperIndex, lowerIndex, 0, 0);
      skinWeights.push(1 - lowerWeight, lowerWeight, 0, 0);
      if (ring < sections.length - 1) {
        const next = (side + 1) % sides;
        const a = ring * sides + side, b = ring * sides + next;
        faces.push(a, b, (ring + 1) * sides + side,
          b, (ring + 1) * sides + next, (ring + 1) * sides + side);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  geometry.setIndex(faces); geometry.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geometry, mat[surface]);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  root.add(mesh); mesh.bind(new THREE.Skeleton(Object.values(bones)));
}
for (const side of [-1, 1]) {
  const tag = side < 0 ? 'L' : 'R';
  const arm = bones[`UpperArm${tag}`], fore = bones[`ForeArm${tag}`];
  for (const part of [`shoulder-cloth-${tag}`, `sleeve-${tag}`, `upper-sleeve-fold-${tag}`]) {
    const mesh = arm.getObjectByName(part); if (mesh) arm.remove(mesh);
  }
  for (const part of [`elbow-cloth-${tag}`, `forearm-sleeve-${tag}`]) {
    const mesh = fore.getObjectByName(part); if (mesh) fore.remove(mesh);
  }
  skinnedLimb(`continuous-sleeve-${tag}`, 'jacket', `UpperArm${tag}`, `ForeArm${tag}`, [
    ['upper', 0.025, 0.079, 0.078, 0],
    ['upper', -0.075, 0.087, 0.083, 0],
    ['upper', -0.2, 0.076, 0.07, 0],
    ['upper', -0.267, 0.071, 0.067, 0.2],
    ['lower', 0, 0.069, 0.066, 0.75],
    ['lower', -0.085, 0.066, 0.061, 1],
    ['lower', -0.19, 0.056, 0.054, 1],
    ['lower', -0.285, 0.051, 0.049, 1],
  ]);
  const thigh = bones[`UpperLeg${tag}`], shin = bones[`LowerLeg${tag}`];
  const thighMesh = thigh.getObjectByName(`thigh-fabric-${tag}`);
  const kneeMesh = shin.getObjectByName(`knee-fabric-${tag}`);
  const shinMesh = shin.getObjectByName(`shin-fabric-${tag}`);
  if (thighMesh) thigh.remove(thighMesh);
  if (kneeMesh) shin.remove(kneeMesh);
  if (shinMesh) shin.remove(shinMesh);
  skinnedLimb(`continuous-trouser-${tag}`, 'trousers', `UpperLeg${tag}`, `LowerLeg${tag}`, [
    ['upper', 0.045, 0.107, 0.104, 0],
    ['upper', -0.105, 0.116, 0.111, 0],
    ['upper', -0.295, 0.103, 0.102, 0],
    ['upper', -0.438, 0.09, 0.091, 0.25],
    ['lower', 0, 0.09, 0.09, 0.75],
    ['lower', -0.1, 0.086, 0.084, 1],
    ['lower', -0.235, 0.076, 0.074, 1],
    ['lower', -0.335, 0.073, 0.072, 1],
  ]);
}

// One draw call per material and moving bone, rather than per seam or pouch.
root.traverse((node) => {
  if (!(node instanceof THREE.Bone)) return;
  const groups = new Map();
  for (const child of [...node.children]) {
    if (!(child instanceof THREE.Mesh)) continue;
    const list = groups.get(child.material) ?? [];
    list.push(child); groups.set(child.material, list);
  }
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const merged = mergeGeometries(geometries);
    if (!merged) throw new Error(`Could not batch ${material.name} on ${node.name}`);
    for (const mesh of meshes) node.remove(mesh);
    add(`${node.name}-${material.name}`, node, merged, material.name, [0, 0, 0]);
  }
});

const times = [0, 0.25, 0.5, 0.75, 1];
function track(node, poses, duration = 1) {
  const values = [];
  for (const [x, y, z] of poses) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times.map(t => t * duration), values);
}
function clip(name, duration, spec) {
  return new THREE.AnimationClip(name, duration, Object.entries(spec).map(([node, poses]) => track(node, poses, duration)));
}
const repeat = (pose) => Array.from({ length: 5 }, () => pose);
const swing = (a, b, base = 0) => [[base, 0, 0], [base + a, 0, 0], [base, 0, 0], [base - b, 0, 0], [base, 0, 0]];
const idle = clip('Idle', 2.4, {
  Hips: [[0,0,0.014],[0.008,0,0.018],[0,0,0.014],[-0.006,0,0.01],[0,0,0.014]],
  Spine: [[0.045,0.01,-0.012],[0.055,0.01,-0.012],[0.045,0.01,-0.012],[0.04,0.01,-0.012],[0.045,0.01,-0.012]],
  Head: [[0,-0.02,0],[-0.01,-0.035,0],[0,-0.02,0],[0.008,0,0],[0,-0.02,0]],
  UpperArmL: repeat(readyArms.L.upper), UpperArmR: repeat(readyArms.R.upper),
  ForeArmL: repeat(readyArms.L.fore), ForeArmR: repeat(readyArms.R.fore),
  UpperLegL: repeat([-0.08,0,-0.035]), UpperLegR: repeat([0.005,0,0.035]),
  LowerLegL: repeat([0.14,0,0]), LowerLegR: repeat([0.1,0,0]),
});
const walk = clip('Walk', 0.84, {
  Hips: [[0,0,0],[0,0,-0.022],[0,0,0],[0,0,0.022],[0,0,0]],
  Spine: [[0.055,0,0],[0.06,0,0],[0.055,0,0],[0.06,0,0],[0.055,0,0]],
  UpperLegL: swing(0.37,0.31,-0.055), UpperLegR: swing(-0.31,-0.37,-0.055),
  LowerLegL: [[0.12,0,0],[0.42,0,0],[0.12,0,0],[0.17,0,0],[0.12,0,0]],
  LowerLegR: [[0.12,0,0],[0.17,0,0],[0.12,0,0],[0.42,0,0],[0.12,0,0]],
  UpperArmL: repeat(readyArms.L.upper), UpperArmR: repeat(readyArms.R.upper),
  ForeArmL: repeat(readyArms.L.fore), ForeArmR: repeat(readyArms.R.fore),
});
const run = clip('Run', 0.55, {
  Spine: repeat([0.12,0,0]),
  UpperLegL: swing(0.62,0.53,-0.055), UpperLegR: swing(-0.53,-0.62,-0.055),
  LowerLegL: [[0.19,0,0],[0.72,0,0],[0.19,0,0],[0.25,0,0],[0.19,0,0]],
  LowerLegR: [[0.19,0,0],[0.25,0,0],[0.19,0,0],[0.72,0,0],[0.19,0,0]],
  UpperArmL: repeat(readyArms.L.upper), UpperArmR: repeat(readyArms.R.upper),
  ForeArmL: repeat(readyArms.L.fore), ForeArmR: repeat(readyArms.R.fore),
});
const aim = clip('Aim', 1, {
  Spine: repeat([0.025,0,0]),
  UpperArmL: repeat(readyArms.L.upper), UpperArmR: repeat(readyArms.R.upper),
  ForeArmL: repeat(readyArms.L.fore), ForeArmR: repeat(readyArms.R.fore),
  Head: repeat([-0.04,0,0]),
});
const fire = clip('Fire', 0.22, {
  Spine: [[0.045,0,0],[0.015,0,0],[0.035,0,0],[0.045,0,0],[0.045,0,0]],
});
const reload = clip('Reload', 1.5, {
  Spine: [[0.045,0,0],[0.075,0,0],[0.085,0,0],[0.06,0,0],[0.045,0,0]],
  UpperArmL: repeat(readyArms.L.upper), UpperArmR: repeat(readyArms.R.upper),
  ForeArmL: repeat(readyArms.L.fore), ForeArmR: repeat(readyArms.R.fore),
  Head: [[0,0,0],[0.08,0,0],[0.1,0,0],[0.04,0,0],[0,0,0]],
});
const death = clip('Death', 0.9, {
  Hips: [[0,0,0],[-0.15,0,0],[-0.4,0,0],[-0.8,0,0],[-1.1,0,0]],
  Spine: [[0.035,0,0],[0.1,0,0],[0.22,0,0],[0.15,0,0],[0.1,0,0]],
  UpperArmL: [[-0.12,0,-0.08],[-0.2,0,-0.2],[-0.4,0,-0.45],[-0.3,0,-0.5],[-0.3,0,-0.5]],
  UpperArmR: [[-0.12,0,0.08],[-0.2,0,0.2],[-0.4,0,0.45],[-0.3,0,0.5],[-0.3,0,0.5]],
});
const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(root, { binary: true, animations: [idle, walk, run, aim, fire, reload, death], onlyVisible: true });
// Embedded low-frequency dirt and weave break up the flat color under the
// mansion lights without an external texture request or a large atlas.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type);
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const check = Buffer.alloc(4); check.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([size, tag, data, check]);
}
function fabricPng() {
  const width = 64, height = 64;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc(height * (1 + width * 4));
  let seed = 77123;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const grain = ((seed >>> 24) - 128) * 0.065;
      const stain = 9 * Math.sin(x * 0.18 + y * 0.11) * Math.sin(y * 0.16 - x * 0.09);
      const weave = (x % 3 === 0 ? -5 : 0) + (y % 3 === 0 ? -4 : 0);
      const value = Math.max(179, Math.min(250, Math.round(222 + grain + stain + weave)));
      const p = y * (1 + width * 4) + 1 + x * 4;
      pixels[p] = value; pixels[p + 1] = value;
      pixels[p + 2] = Math.max(0, value - 3); pixels[p + 3] = 255;
    }
  }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
const io = new NodeIO();
const document = await io.readBinary(new Uint8Array(glb));
const fabric = document.createTexture('worn-fabric').setImage(fabricPng()).setMimeType('image/png');
for (const material of document.getRoot().listMaterials()) {
  if (/jacket|trousers|webbing|pouch/i.test(material.getName())) material.setBaseColorTexture(fabric);
}
const output = process.argv[2] ?? 'public/assets/players/soldier.glb';
await mkdir(dirname(output), { recursive: true });
const encoded = await io.writeBinary(document);
await writeFile(output, Buffer.from(encoded));
console.log(`Wrote ${output}: ${(encoded.byteLength / 1024).toFixed(1)} KiB`);
