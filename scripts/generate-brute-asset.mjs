import { writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class NodeFileReader {
  result = null;
  onloadend = null;

  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
}
globalThis.FileReader = NodeFileReader;

const root = new THREE.Group();
root.name = 'BruteRoot';

const materials = {
  skin: new THREE.MeshStandardMaterial({
    name: 'Brutus dead skin', color: 0x77806c, roughness: 0.97, metalness: 0, flatShading: true,
  }),
  corpse: new THREE.MeshStandardMaterial({
    name: 'Brutus necrotic skin', color: 0x4d5147, roughness: 1, metalness: 0, flatShading: true,
  }),
  jacket: new THREE.MeshStandardMaterial({
    name: 'Brutus torn jacket', color: 0x26312b, roughness: 1, metalness: 0, flatShading: true,
  }),
  trousers: new THREE.MeshStandardMaterial({
    name: 'Brutus ruined trousers', color: 0x252725, roughness: 1, metalness: 0, flatShading: true,
  }),
  shirt: new THREE.MeshStandardMaterial({
    name: 'Brutus stained shirt', color: 0x77715d, roughness: 0.98, metalness: 0, flatShading: true,
  }),
  wound: new THREE.MeshStandardMaterial({
    name: 'Brutus open wounds', color: 0x4b1715, roughness: 0.88, metalness: 0,
    emissive: 0x180202, emissiveIntensity: 0.28, flatShading: true,
  }),
  bone: new THREE.MeshStandardMaterial({
    name: 'Brutus exposed bone', color: 0xb0a47f, roughness: 0.9, metalness: 0, flatShading: true,
  }),
  socket: new THREE.MeshStandardMaterial({
    name: 'Brutus sunken features', color: 0x100e0d, roughness: 1, metalness: 0, flatShading: true,
  }),
  eye: new THREE.MeshStandardMaterial({
    name: 'Brutus infected eye', color: 0xb7441d, roughness: 0.7, metalness: 0,
    emissive: 0x8d1e08, emissiveIntensity: 1.1, flatShading: true,
  }),
};

function mesh(name, geometry, material, parent, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.position.set(...position);
  object.scale.set(...scale);
  object.rotation.set(...rotation);
  object.castShadow = true;
  parent.add(object);
  return object;
}

const hips = new THREE.Group();
hips.name = 'Hips';
hips.position.y = 0.96;
root.add(hips);
mesh('BrutusPelvis', new THREE.BoxGeometry(0.48, 0.25, 0.29), materials.trousers, hips, [0, 0, 0], [1, 1, 1], [0.08, 0, 0]);
mesh('BrutusBeltRags', new THREE.CylinderGeometry(0.27, 0.25, 0.12, 7), materials.jacket, hips, [0, 0.12, 0], [1.05, 1, 0.72]);

const torso = new THREE.Group();
torso.name = 'Torso';
torso.position.set(0, 0.13, 0.03);
torso.rotation.x = 0.24;
hips.add(torso);
mesh('BrutusWaist', new THREE.BoxGeometry(0.38, 0.42, 0.24), materials.shirt, torso, [0, 0.24, 0]);
mesh('BrutusRibcage', new THREE.DodecahedronGeometry(0.48, 1), materials.jacket, torso, [0, 0.58, 0], [1.18, 1.05, 0.63]);
mesh('BrutusTornLapL', new THREE.BoxGeometry(0.2, 0.72, 0.055), materials.jacket, torso, [-0.22, 0.48, 0.3], [1, 1, 1], [0, 0, -0.1]);
mesh('BrutusTornLapR', new THREE.BoxGeometry(0.17, 0.58, 0.055), materials.jacket, torso, [0.25, 0.55, 0.3], [1, 1, 1], [0, 0, 0.13]);
mesh('BrutusOpenChest', new THREE.PlaneGeometry(0.36, 0.52), materials.wound, torso, [0.04, 0.59, 0.325], [1, 1, 1], [0, 0, -0.04]);
for (let index = 0; index < 4; index++) {
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  mesh(
    `BrutusExposedRib${index + 1}`,
    new THREE.BoxGeometry(0.16, 0.025, 0.025),
    materials.bone,
    torso,
    [side * 0.1, 0.69 - row * 0.13, 0.345],
    [1, 1, 1],
    [0, 0, side * (0.18 + row * 0.05)],
  );
}
mesh('BrutusShoulderWound', new THREE.CircleGeometry(0.11, 7), materials.wound, torso, [-0.39, 0.8, 0.24], [1, 0.72, 1], [0, -0.42, -0.12]);

mesh('BrutusNeck', new THREE.CylinderGeometry(0.14, 0.18, 0.3, 8), materials.corpse, torso, [0.03, 0.98, 0.01], [1, 1, 0.9], [0.22, 0, 0.08]);
const head = new THREE.Group();
head.name = 'Head';
head.position.set(0.06, 1.11, 0.11);
head.rotation.set(-0.08, 0, -0.11);
torso.add(head);
mesh('BrutusSkull', new THREE.IcosahedronGeometry(0.23, 1), materials.corpse, head, [0, 0, 0], [0.86, 1.12, 0.94]);
mesh('BrutusCheekL', new THREE.DodecahedronGeometry(0.09, 0), materials.skin, head, [-0.105, -0.065, 0.13], [0.8, 1, 0.72]);
mesh('BrutusMissingCheekR', new THREE.CircleGeometry(0.085, 7), materials.wound, head, [0.11, -0.065, 0.174], [0.75, 1, 1], [0, -0.24, 0.08]);
mesh('BrutusBrow', new THREE.BoxGeometry(0.3, 0.05, 0.055), materials.corpse, head, [0, 0.07, 0.16], [1, 1, 1], [-0.12, 0, -0.04]);
mesh('BrutusSocketL', new THREE.SphereGeometry(0.047, 7, 5), materials.socket, head, [-0.073, 0.02, 0.184], [1.1, 0.68, 0.38]);
mesh('BrutusSocketR', new THREE.SphereGeometry(0.052, 7, 5), materials.socket, head, [0.075, 0.012, 0.184], [1.16, 0.72, 0.38]);
mesh('BrutusDeadEyeL', new THREE.SphereGeometry(0.016, 6, 4), materials.bone, head, [-0.073, 0.018, 0.2], [1, 0.74, 0.55]);
mesh('BrutusEyeR', new THREE.SphereGeometry(0.021, 7, 5), materials.eye, head, [0.075, 0.012, 0.202], [1, 0.76, 0.55]);
mesh('BrutusBrokenNose', new THREE.ConeGeometry(0.04, 0.11, 5), materials.skin, head, [0.015, -0.035, 0.205], [0.78, 1, 0.72], [Math.PI / 2, 0, -0.13]);
mesh('BrutusJaw', new THREE.BoxGeometry(0.2, 0.09, 0.18), materials.skin, head, [0.03, -0.205, 0.07], [1, 1, 1], [0.34, 0, 0.1]);
mesh('BrutusMouth', new THREE.BoxGeometry(0.14, 0.035, 0.02), materials.socket, head, [0.035, -0.192, 0.17], [1, 1, 1], [0.18, 0, 0.09]);
for (let index = 0; index < 3; index++) {
  mesh(`BrutusTooth${index + 1}`, new THREE.ConeGeometry(0.012, 0.035, 4), materials.bone, head, [-0.015 + index * 0.045, -0.196, 0.185], [1, 1, 0.7], [0, 0, Math.PI]);
}
const headTop = new THREE.Object3D();
headTop.name = 'HeadTop_End';
headTop.position.y = 0.26;
head.add(headTop);

function buildArm(side, lengthScale, exposed) {
  const suffix = side < 0 ? 'L' : 'R';
  const shoulder = new THREE.Group();
  shoulder.name = `Shoulder${suffix}`;
  shoulder.position.set(side * 0.52, 0.81, 0);
  shoulder.rotation.z = side * (side < 0 ? 0.08 : 0.14);
  torso.add(shoulder);
  mesh(`BrutusShoulder${suffix}`, new THREE.DodecahedronGeometry(0.18, 0), exposed ? materials.corpse : materials.jacket, shoulder, [0, -0.03, 0], [1.06, 0.9, 0.92]);
  mesh(`BrutusUpperArm${suffix}`, new THREE.CapsuleGeometry(0.125, 0.48 * lengthScale, 4, 8), materials.jacket, shoulder, [0, -0.35 * lengthScale, 0.015]);
  mesh(`BrutusTornSleeve${suffix}`, new THREE.CylinderGeometry(0.145, 0.18, 0.17, 7), materials.jacket, shoulder, [0, -0.65 * lengthScale, 0.015]);
  const elbow = new THREE.Group();
  elbow.name = `Elbow${suffix}`;
  elbow.position.set(0, -0.69 * lengthScale, 0.03);
  elbow.rotation.x = side < 0 ? -0.12 : -0.2;
  shoulder.add(elbow);
  mesh(`BrutusForearm${suffix}`, new THREE.CapsuleGeometry(0.105, 0.52 * lengthScale, 4, 8), exposed ? materials.wound : materials.skin, elbow, [0, -0.37 * lengthScale, 0.04], [0.95, 1, 0.9]);
  mesh(`BrutusHand${suffix}`, new THREE.BoxGeometry(0.2, 0.18, 0.24), materials.skin, elbow, [0, -0.73 * lengthScale, 0.11], [1, 1, 1], [0.12, 0, 0]);
  for (let finger = -1; finger <= 1; finger++) {
    mesh(`BrutusFinger${suffix}${finger + 2}`, new THREE.BoxGeometry(0.04, 0.16, 0.045), materials.corpse, elbow, [finger * 0.055, -0.84 * lengthScale, 0.19], [1, 1, 1], [0.2, 0, 0]);
  }
  return { shoulder, elbow };
}

const leftArm = buildArm(-1, 1.05, true);
const rightArm = buildArm(1, 0.98, false);

function buildLeg(side) {
  const suffix = side < 0 ? 'L' : 'R';
  const leg = new THREE.Group();
  leg.name = `Leg${suffix}`;
  leg.position.set(side * 0.17, -0.08, 0);
  hips.add(leg);
  mesh(`BrutusThigh${suffix}`, new THREE.CapsuleGeometry(0.15, 0.45, 4, 8), materials.trousers, leg, [0, -0.34, 0]);
  mesh(`BrutusTornTrouser${suffix}`, new THREE.CylinderGeometry(0.14, 0.18, 0.18, 7), materials.trousers, leg, [0, -0.64, 0]);
  const knee = new THREE.Group();
  knee.name = `Knee${suffix}`;
  knee.position.set(0, -0.69, 0);
  leg.add(knee);
  mesh(`BrutusKnee${suffix}`, new THREE.DodecahedronGeometry(0.145, 0), materials.corpse, knee, [0, 0, 0.035], [1, 0.86, 0.9]);
  mesh(`BrutusShin${suffix}`, new THREE.CapsuleGeometry(0.115, 0.42, 4, 8), side < 0 ? materials.skin : materials.trousers, knee, [0, -0.34, 0.02]);
  mesh(`BrutusBoot${suffix}`, new THREE.BoxGeometry(0.27, 0.16, 0.43), materials.trousers, knee, [0, -0.66, 0.12], [1, 1, 1], [0.04, 0, 0]);
  return { leg, knee };
}

const leftLeg = buildLeg(-1);
const rightLeg = buildLeg(1);

function quaternionTrack(node, times, eulers) {
  const values = [];
  for (const [x, y, z] of eulers) {
    values.push(...new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray());
  }
  return new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values);
}

const walkTimes = [0, 0.36, 0.72, 1.08, 1.44];
const walk = new THREE.AnimationClip('BruteWalk', 1.44, [
  new THREE.VectorKeyframeTrack('Hips.position', walkTimes, [
    -0.018, 0.96, 0, 0, 1.01, 0.01, 0.018, 0.96, 0, 0, 1.01, 0.01, -0.018, 0.96, 0,
  ]),
  quaternionTrack(torso, walkTimes, [[0.24, 0, -0.06], [0.29, 0.08, 0], [0.24, 0, 0.06], [0.29, -0.08, 0], [0.24, 0, -0.06]]),
  quaternionTrack(head, walkTimes, [[-0.08, 0.05, -0.13], [-0.03, 0, -0.08], [-0.08, -0.05, -0.04], [-0.03, 0, -0.09], [-0.08, 0.05, -0.13]]),
  quaternionTrack(leftLeg.leg, walkTimes, [[0.48, 0, 0], [0.08, 0, 0], [-0.48, 0, 0], [-0.08, 0, 0], [0.48, 0, 0]]),
  quaternionTrack(rightLeg.leg, walkTimes, [[-0.48, 0, 0], [-0.08, 0, 0], [0.48, 0, 0], [0.08, 0, 0], [-0.48, 0, 0]]),
  quaternionTrack(leftArm.shoulder, walkTimes, [[-0.48, 0, 0.08], [-0.3, 0, 0.08], [-0.08, 0, 0.08], [-0.3, 0, 0.08], [-0.48, 0, 0.08]]),
  quaternionTrack(rightArm.shoulder, walkTimes, [[-0.1, 0, -0.14], [-0.3, 0, -0.14], [-0.52, 0, -0.14], [-0.3, 0, -0.14], [-0.1, 0, -0.14]]),
]);

const attackTimes = [0, 0.2, 0.475, 0.62, 0.75];
const attack = new THREE.AnimationClip('BruteSmash', 0.75, [
  new THREE.VectorKeyframeTrack('Hips.position', attackTimes, [
    0, 0.96, 0, 0, 0.94, -0.08, 0, 1.0, 0.15, 0.02, 0.95, 0.22, 0, 0.96, 0,
  ]),
  quaternionTrack(torso, attackTimes, [[0.24, 0, 0], [-0.18, -0.12, -0.08], [0.72, 0.1, 0.06], [0.82, 0.06, 0.1], [0.24, 0, 0]]),
  quaternionTrack(head, attackTimes, [[-0.08, 0, -0.11], [0.18, 0.1, -0.08], [-0.28, -0.08, 0.04], [-0.2, 0, 0], [-0.08, 0, -0.11]]),
  quaternionTrack(leftArm.shoulder, attackTimes, [[-0.48, 0, 0.08], [-2.35, 0.12, -0.16], [0.72, 0, 0.04], [0.96, 0.06, 0.1], [-0.48, 0, 0.08]]),
  quaternionTrack(rightArm.shoulder, attackTimes, [[-0.1, 0, -0.14], [-1.82, -0.1, 0.22], [0.54, 0, -0.04], [0.76, -0.05, -0.08], [-0.1, 0, -0.14]]),
]);

const spawn = new THREE.AnimationClip('BruteRise', 1.1, [
  quaternionTrack(torso, [0, 0.55, 1.1], [[0.86, 0, -0.14], [0.46, 0, 0.08], [0.24, 0, 0]]),
  quaternionTrack(head, [0, 0.55, 1.1], [[0.42, 0, -0.18], [-0.16, 0, 0.05], [-0.08, 0, -0.11]]),
  quaternionTrack(leftArm.shoulder, [0, 0.55, 1.1], [[0.5, 0, 0.2], [-0.25, 0, 0.1], [-0.48, 0, 0.08]]),
]);

const hit = new THREE.AnimationClip('BruteHit', 0.28, [
  quaternionTrack(torso, [0, 0.1, 0.28], [[0.24, 0, 0], [-0.08, 0, 0.2], [0.24, 0, 0]]),
  quaternionTrack(head, [0, 0.1, 0.28], [[-0.08, 0, -0.11], [-0.4, 0.12, 0.08], [-0.08, 0, -0.11]]),
]);

const death = new THREE.AnimationClip('BruteDeath', 1, [
  quaternionTrack(hips, [0, 0.42, 1], [[0, 0, 0], [0.24, 0, 0.5], [1.42, 0, 0.76]]),
  quaternionTrack(leftArm.shoulder, [0, 0.42, 1], [[-0.48, 0, 0.08], [-0.9, 0, -0.3], [-0.2, 0, 0.46]]),
]);

root.updateMatrixWorld(true);
const exporter = new GLTFExporter();
const output = await exporter.parseAsync(root, {
  binary: true,
  animations: [spawn, walk, attack, hit, death],
  onlyVisible: false,
});
await writeFile(new URL('../public/assets/zombies/zombie_brute.glb', import.meta.url), Buffer.from(output));
