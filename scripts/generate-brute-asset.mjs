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
    name: 'Brute mottled skin',
    color: 0x727c62,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  }),
  bruised: new THREE.MeshStandardMaterial({
    name: 'Brute bruised tissue',
    color: 0x594a46,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
  }),
  cloth: new THREE.MeshStandardMaterial({
    name: 'Brute torn uniform',
    color: 0x202923,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  }),
  metal: new THREE.MeshStandardMaterial({
    name: 'Brute restraints',
    color: 0x292b29,
    roughness: 0.58,
    metalness: 0.72,
    flatShading: true,
  }),
  wound: new THREE.MeshStandardMaterial({
    name: 'Brute wounds',
    color: 0x491b18,
    roughness: 0.82,
    metalness: 0,
    emissive: 0x190302,
    emissiveIntensity: 0.35,
    flatShading: true,
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
hips.position.y = 0.72;
root.add(hips);
mesh('BrutePelvis', new THREE.DodecahedronGeometry(0.5, 0), materials.cloth, hips, [0, 0, 0], [1.1, 0.52, 0.72]);

const torso = new THREE.Group();
torso.name = 'Torso';
torso.position.set(0, 0.16, 0.03);
torso.rotation.x = 0.16;
hips.add(torso);
mesh('BruteChest', new THREE.DodecahedronGeometry(0.62, 0), materials.cloth, torso, [0, 0.48, 0], [1.28, 0.9, 0.7]);
mesh('BruteBelly', new THREE.SphereGeometry(0.5, 12, 8), materials.skin, torso, [0, 0.16, 0.17], [1.34, 1.05, 1.02]);
mesh('BruteBellyWound', new THREE.CircleGeometry(0.18, 7), materials.wound, torso, [0.19, 0.2, 0.655], [1.1, 0.72, 1], [0, 0, -0.18]);
mesh('BruteSpinePlate', new THREE.BoxGeometry(0.32, 0.62, 0.08), materials.metal, torso, [0, 0.47, -0.43], [1, 1, 1], [-0.12, 0, 0]);

const head = new THREE.Group();
head.name = 'Head';
head.position.set(0.05, 0.94, 0.06);
head.rotation.z = -0.08;
torso.add(head);
mesh('BruteHead', new THREE.IcosahedronGeometry(0.2, 1), materials.bruised, head, [0, 0, 0], [0.9, 1.05, 0.92]);
mesh('BruteJaw', new THREE.BoxGeometry(0.24, 0.1, 0.2), materials.skin, head, [0, -0.17, 0.06], [1, 1, 1], [0.22, 0, 0]);
mesh('BruteEyeL', new THREE.SphereGeometry(0.025, 6, 4), materials.wound, head, [-0.07, 0.03, 0.17]);
mesh('BruteEyeR', new THREE.SphereGeometry(0.025, 6, 4), materials.wound, head, [0.07, 0.03, 0.17]);
const headTop = new THREE.Object3D();
headTop.name = 'HeadTop_End';
headTop.position.y = 0.2;
head.add(headTop);

function buildArm(side, size, drop, forward) {
  const shoulder = new THREE.Group();
  shoulder.name = side < 0 ? 'ShoulderL' : 'ShoulderR';
  shoulder.position.set(side * 0.66, 0.72, 0);
  shoulder.rotation.z = side * drop;
  torso.add(shoulder);
  mesh(
    side < 0 ? 'BruteUpperArmL' : 'BruteUpperArmR',
    new THREE.CapsuleGeometry(size * 0.2, size * 0.42, 4, 8),
    materials.skin,
    shoulder,
    [0, -size * 0.31, forward],
    [1.15, 1, 1],
  );
  mesh(
    side < 0 ? 'BruteShoulderL' : 'BruteShoulderR',
    new THREE.IcosahedronGeometry(size * 0.28, 0),
    materials.bruised,
    shoulder,
    [0, -0.02, 0],
    [1.25, 1, 1],
  );
  const elbow = new THREE.Group();
  elbow.name = side < 0 ? 'ElbowL' : 'ElbowR';
  elbow.position.set(0, -size * 0.68, forward);
  elbow.rotation.x = -0.16;
  shoulder.add(elbow);
  mesh(
    side < 0 ? 'BruteForearmL' : 'BruteForearmR',
    new THREE.CapsuleGeometry(size * 0.23, size * 0.42, 4, 8),
    materials.bruised,
    elbow,
    [0, -size * 0.3, 0.03],
    [1.15, 1, 1.1],
  );
  mesh(
    side < 0 ? 'BruteCuffL' : 'BruteCuffR',
    new THREE.CylinderGeometry(size * 0.27, size * 0.25, 0.15, 8),
    materials.metal,
    elbow,
    [0, -size * 0.55, 0.03],
  );
  mesh(
    side < 0 ? 'BruteFistL' : 'BruteFistR',
    new THREE.DodecahedronGeometry(size * 0.26, 0),
    materials.skin,
    elbow,
    [0, -size * 0.72, 0.1],
    [1.1, 0.88, 1.18],
  );
  return shoulder;
}

const shoulderL = buildArm(-1, 1.02, 0.18, 0.04);
const shoulderR = buildArm(1, 0.88, 0.09, 0.11);

function buildLeg(side) {
  const leg = new THREE.Group();
  leg.name = side < 0 ? 'LegL' : 'LegR';
  leg.position.set(side * 0.28, -0.18, 0);
  hips.add(leg);
  mesh(
    side < 0 ? 'BruteThighL' : 'BruteThighR',
    new THREE.CapsuleGeometry(0.19, 0.28, 4, 8),
    materials.cloth,
    leg,
    [0, -0.28, 0],
    [1.15, 1, 1],
  );
  const knee = new THREE.Group();
  knee.name = side < 0 ? 'KneeL' : 'KneeR';
  knee.position.y = -0.58;
  leg.add(knee);
  mesh(
    side < 0 ? 'BruteShinL' : 'BruteShinR',
    new THREE.CapsuleGeometry(0.15, 0.28, 4, 8),
    materials.bruised,
    knee,
    [0, -0.25, 0],
  );
  mesh(
    side < 0 ? 'BruteBootL' : 'BruteBootR',
    new THREE.BoxGeometry(0.36, 0.2, 0.52),
    materials.cloth,
    knee,
    [0, -0.52, 0.11],
  );
  return leg;
}

const legL = buildLeg(-1);
const legR = buildLeg(1);

function quaternionTrack(node, times, eulers) {
  const values = [];
  for (const [x, y, z] of eulers) {
    values.push(...new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z)).toArray());
  }
  return new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values);
}

const walkTimes = [0, 0.3, 0.6, 0.9, 1.2];
const walk = new THREE.AnimationClip('BruteWalk', 1.2, [
  new THREE.VectorKeyframeTrack('Hips.position', walkTimes, [
    0, 0.72, 0, 0, 0.77, 0, 0, 0.72, 0, 0, 0.77, 0, 0, 0.72, 0,
  ]),
  quaternionTrack(torso, walkTimes, [[0.16, 0, -0.05], [0.18, 0.08, 0], [0.16, 0, 0.05], [0.18, -0.08, 0], [0.16, 0, -0.05]]),
  quaternionTrack(legL, walkTimes, [[0.42, 0, 0], [0, 0, 0], [-0.42, 0, 0], [0, 0, 0], [0.42, 0, 0]]),
  quaternionTrack(legR, walkTimes, [[-0.42, 0, 0], [0, 0, 0], [0.42, 0, 0], [0, 0, 0], [-0.42, 0, 0]]),
  quaternionTrack(shoulderL, walkTimes, [[-0.2, 0, -0.18], [0, 0, -0.18], [0.22, 0, -0.18], [0, 0, -0.18], [-0.2, 0, -0.18]]),
  quaternionTrack(shoulderR, walkTimes, [[0.18, 0, 0.09], [0, 0, 0.09], [-0.18, 0, 0.09], [0, 0, 0.09], [0.18, 0, 0.09]]),
]);

const attackTimes = [0, 0.28, 0.5, 0.75];
const attack = new THREE.AnimationClip('BruteSmash', 0.75, [
  quaternionTrack(torso, attackTimes, [[0.16, 0, 0], [-0.25, 0, 0], [0.62, 0, 0], [0.16, 0, 0]]),
  quaternionTrack(shoulderL, attackTimes, [[0, 0, -0.18], [-1.55, 0, -0.35], [0.75, 0, -0.1], [0, 0, -0.18]]),
  quaternionTrack(shoulderR, attackTimes, [[0, 0, 0.09], [-1.35, 0, 0.25], [0.65, 0, 0.08], [0, 0, 0.09]]),
]);

const spawn = new THREE.AnimationClip('BruteRise', 1.1, [
  quaternionTrack(torso, [0, 0.55, 1.1], [[0.8, 0, -0.12], [0.42, 0, 0.08], [0.16, 0, 0]]),
  quaternionTrack(head, [0, 0.55, 1.1], [[0.5, 0, -0.1], [-0.15, 0, 0.08], [0, 0, -0.08]]),
]);

const hit = new THREE.AnimationClip('BruteHit', 0.28, [
  quaternionTrack(torso, [0, 0.1, 0.28], [[0.16, 0, 0], [-0.1, 0, 0.22], [0.16, 0, 0]]),
]);

const death = new THREE.AnimationClip('BruteDeath', 1, [
  quaternionTrack(hips, [0, 0.45, 1], [[0, 0, 0], [0.3, 0, 0.65], [1.35, 0, 0.82]]),
]);

root.updateMatrixWorld(true);
const exporter = new GLTFExporter();
const output = await exporter.parseAsync(root, {
  binary: true,
  animations: [spawn, walk, attack, hit, death],
  onlyVisible: false,
});
await writeFile(new URL('../public/assets/zombies/zombie_brute.glb', import.meta.url), Buffer.from(output));
