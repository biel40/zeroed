// Builds Brutus from the walker so both share the same low-poly language:
// identical palette, face, flat shading, skeleton and locomotion clips. Only
// proportions, the torn shirt, iron restraints and bone growths are new.
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { prune, resample } from '@gltf-transform/functions';
import * as THREE from 'three';

const SOURCE = fileURLToPath(new URL('../public/assets/zombies/zombie_walker.glb', import.meta.url));
const TARGET = fileURLToPath(new URL('../public/assets/zombies/zombie_brute.glb', import.meta.url));
/** Walker contract height; converts the x107 armature units to meters. */
const WALKER_HEIGHT = 1.78;

// --- Palette -------------------------------------------------------------
// The walker atlas is a 32x32 strip of flat colors. Brutus keeps it intact on
// the left half (UVs are halved) and adds its own cells on the right half.
function decodePng(png) {
  let offset = 8;
  let width = 0;
  let height = 0;
  const data = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const chunk = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      if (chunk[8] !== 8 || chunk[9] !== 6) throw new Error('Expected an 8-bit RGBA palette');
    }
    if (type === 'IDAT') data.push(chunk);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 4);
  return out;
}

function encodePng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Brutus-only cells, 8x8 px each on the right half of the 64x32 atlas. */
const BRUTUS_CELLS = {
  iron: [86, 88, 92],
  ironDark: [52, 53, 56],
  rust: [140, 82, 48],
  bone: [232, 222, 188],
};
const WALKER_CELL = {
  skin: [5 / 32, 2 / 32],
  shirt: [15 / 32, 20 / 32],
  wound: [15 / 32, 15 / 32],
  blood: [14 / 32, 30 / 32],
};

function cellUv(name) {
  if (WALKER_CELL[name]) {
    const [u, v] = WALKER_CELL[name];
    return [(u + 0.5 / 32) * 0.5, v + 0.5 / 32];
  }
  const index = Object.keys(BRUTUS_CELLS).indexOf(name);
  return [(32 + (index % 4) * 8 + 4) / 64, (Math.floor(index / 4) * 8 + 4) / 32];
}

function buildPalette(source) {
  const width = source.width * 2;
  const pixels = Buffer.alloc(width * source.height * 4);
  for (let y = 0; y < source.height; y++) {
    source.pixels.copy(pixels, y * width * 4, y * source.width * 4, (y + 1) * source.width * 4);
  }
  Object.values(BRUTUS_CELLS).forEach((color, index) => {
    for (let y = Math.floor(index / 4) * 8; y < Math.floor(index / 4) * 8 + 8; y++) {
      for (let x = 32 + (index % 4) * 8; x < 40 + (index % 4) * 8; x++) {
        pixels.set([...color, 255], (y * width + x) * 4);
      }
    }
  });
  return encodePng(width, source.height, pixels);
}

// --- Proportions ---------------------------------------------------------
// Scale factors in each bone's local frame: Y runs along the bone (and moves
// its children), X/Z are girth. Segment ratios stay close to the walker so
// the authored clips keep their timing, contacts and silhouette.
const SHAPE = {
  Hips: [1.32, 1, 1.25],
  Spine: [1.34, 1, 1.32],
  Spine1: [1.46, 1.02, 1.36],
  Spine2: [1.58, 1, 1.36],
  Neck: [1.7, 0.45, 1.7],
  Head: [0.84, 0.84, 0.84],
  LeftShoulder: [1.7, 1.45, 1.7],
  RightShoulder: [1.7, 1.45, 1.7],
  LeftArm: [1.62, 1.14, 1.62],
  RightArm: [1.62, 1.14, 1.62],
  LeftForeArm: [1.78, 1.2, 1.78],
  RightForeArm: [1.78, 1.2, 1.78],
  LeftUpLeg: [1.55, 1, 1.5],
  RightUpLeg: [1.55, 1, 1.5],
  LeftLeg: [1.5, 1, 1.45],
  RightLeg: [1.5, 1, 1.45],
};
/** Uniform scale for a bone and every descendant (fists and feet). */
const CHAIN_SCALE = { LeftHand: 1.32, RightHand: 1.32, LeftFoot: 1.2, RightFoot: 1.2 };

function shapeOf(name, inherited) {
  if (CHAIN_SCALE[name]) return new THREE.Vector3().setScalar(CHAIN_SCALE[name]);
  if (inherited) return inherited.clone();
  return new THREE.Vector3(...(SHAPE[name] ?? [1, 1, 1]));
}

const io = new NodeIO();
const doc = await io.read(SOURCE);
const root = doc.getRoot();
const skin = root.listSkins()[0];
const joints = skin.listJoints();
const hips = joints[0];
const meshNode = root.listNodes().find((node) => node.getMesh());
meshNode.setName('Brutus');
root.listNodes().find((node) => node.listChildren().includes(hips)).setName('Brute');
const primitive = meshNode.getMesh().setName('Brutus').listPrimitives()[0];

const ibm = skin.getInverseBindMatrices();
const ibmArray = ibm.getArray();
/** Bind (B) and reshaped bind (newB) world matrices in mesh units, by node. */
const bind = new Map();
const reshaped = new Map();
const shapes = new Map();
const deforms = new Map();

// The walker's node rest pose is not its T-pose bind pose, so bind matrices
// and joint offsets come from the inverse bind matrices. Node translations
// equal those offsets and are rescaled; authored rest rotations are kept.
joints.forEach((joint, index) => bind.set(joint, new THREE.Matrix4().fromArray(ibmArray, index * 16).invert()));
reshaped.set(hips, bind.get(hips).clone());
(function reshape(node, inherited) {
  const shape = shapeOf(node.getName(), inherited);
  shapes.set(node, shape);
  const inheritedForChildren = CHAIN_SCALE[node.getName()] || inherited ? shape : null;
  for (const child of node.listChildren()) {
    if (!bind.has(child)) continue; // unskinned leaf markers, pruned below
    const offset = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    bind.get(node).clone().invert().multiply(bind.get(child)).decompose(offset, rotation, new THREE.Vector3());
    offset.multiply(shape);
    child.setTranslation(new THREE.Vector3(...child.getTranslation()).multiply(shape).toArray());
    reshaped.set(child, reshaped.get(node).clone()
      .multiply(new THREE.Matrix4().compose(offset, rotation, new THREE.Vector3(1, 1, 1))));
    reshape(child, inheritedForChildren);
  }
})(hips, null);

joints.forEach((joint, index) => {
  const scale = new THREE.Matrix4().makeScale(...shapes.get(joint).toArray());
  deforms.set(index, reshaped.get(joint).clone().multiply(scale).multiply(bind.get(joint).clone().invert()));
  reshaped.get(joint).clone().invert().toArray(ibmArray, index * 16);
});
ibm.setArray(ibmArray);

// Mesh units per meter, from the walker's authored height.
const sourcePositions = primitive.getAttribute('POSITION');
const unitsPerMeter = (sourcePositions.getMax([])[1] - sourcePositions.getMin([])[1]) / WALKER_HEIGHT;

const positions = Array.from(sourcePositions.getArray());
const uvs = Array.from(primitive.getAttribute('TEXCOORD_0').getArray());
const jointIndices = Array.from(primitive.getAttribute('JOINTS_0').getArray());
const weights = Array.from(primitive.getAttribute('WEIGHTS_0').getArray());
const indices = Array.from(primitive.getIndices().getArray());

const point = new THREE.Vector3();
const blended = new THREE.Vector3();
const term = new THREE.Vector3();
for (let vertex = 0; vertex < positions.length / 3; vertex++) {
  point.fromArray(positions, vertex * 3);
  blended.set(0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const weight = weights[vertex * 4 + k];
    if (weight <= 0) continue;
    blended.addScaledVector(term.copy(point).applyMatrix4(deforms.get(jointIndices[vertex * 4 + k])), weight);
  }
  blended.toArray(positions, vertex * 3);
}

// --- Torn shirt ----------------------------------------------------------
// Body frame of the walker mesh: +X forward, +Y up, -Z left.
const jointIndex = (name) => joints.findIndex((joint) => joint.getName() === name);
const jointPosition = (name) => new THREE.Vector3().setFromMatrixPosition(reshaped.get(joints[jointIndex(name)]));
const toMeters = (vector) => vector.clone().divideScalar(unitsPerMeter);
const spine2 = toMeters(jointPosition('Spine2'));
const shirtUv = WALKER_CELL.shirt;
const armBones = new Set(['LeftArm', 'RightArm', 'LeftShoulder', 'RightShoulder'].map(jointIndex));

function setTriangleUv(triangle, cell) {
  const [u, v] = cellUv(cell);
  for (let k = 0; k < 3; k++) {
    const vertex = indices[triangle + k];
    uvs[vertex * 2] = u;
    uvs[vertex * 2 + 1] = v;
  }
}

for (let vertex = 0; vertex < uvs.length / 2; vertex++) uvs[vertex * 2] *= 0.5;
for (let triangle = 0; triangle < indices.length; triangle += 3) {
  const first = indices[triangle];
  const u = uvs[first * 2] * 2;
  const v = uvs[first * 2 + 1];
  if (Math.floor(u * 32) !== shirtUv[0] * 32 || Math.floor(v * 32) !== shirtUv[1] * 32) continue;
  const center = new THREE.Vector3();
  let dominant = 0;
  let dominantWeight = -1;
  for (let k = 0; k < 3; k++) {
    const vertex = indices[triangle + k];
    center.add(point.fromArray(positions, vertex * 3));
    for (let slot = 0; slot < 4; slot++) {
      if (weights[vertex * 4 + slot] > dominantWeight) {
        dominantWeight = weights[vertex * 4 + slot];
        dominant = jointIndices[vertex * 4 + slot];
      }
    }
  }
  center.divideScalar(3 * unitsPerMeter);
  // Sleeves are gone: the bare arms carry the threat.
  if (armBones.has(dominant)) {
    setTriangleUv(triangle, 'skin');
    continue;
  }
  // A diagonal rip opens the front from the right shoulder to the left hip.
  const front = center.x - spine2.x;
  const rip = center.y - spine2.y - (center.z - spine2.z) * 0.9;
  if (front > 0.02 && rip > -0.2 && rip < 0.12) {
    setTriangleUv(triangle, Math.abs(rip + 0.04) > 0.13 ? 'blood' : 'skin');
  }
}

// --- Props ---------------------------------------------------------------
// Rigid, flat-colored pieces merged into the same skinned primitive so
// Brutus stays one draw call, exactly like the walker.
function addProp(geometry, cell, boneName, matrixInMeters) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const bone = jointIndex(boneName);
  const [u, v] = cellUv(cell);
  const matrix = new THREE.Matrix4().makeScale(unitsPerMeter, unitsPerMeter, unitsPerMeter).multiply(matrixInMeters);
  const source = flat.getAttribute('position');
  const base = positions.length / 3;
  for (let i = 0; i < source.count; i++) {
    point.fromBufferAttribute(source, i).applyMatrix4(matrix);
    positions.push(point.x, point.y, point.z);
    uvs.push(u, v);
    jointIndices.push(bone, 0, 0, 0);
    weights.push(1, 0, 0, 0);
    indices.push(base + i);
  }
}

/** Places a +Y-aligned primitive from `start` towards `end` (meters). */
function along(start, end, roll = 0) {
  const direction = end.clone().sub(start);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  return new THREE.Matrix4().compose(start.clone().lerp(end, 0.5), rotation, new THREE.Vector3(1, 1, 1));
}

for (const side of ['Left', 'Right']) {
  const elbow = toMeters(jointPosition(`${side}ForeArm`));
  const wrist = toMeters(jointPosition(`${side}Hand`));
  const axis = wrist.clone().sub(elbow).normalize();
  // Heavy iron shackle cuff with a rusted rim and a torn-off chain link.
  const cuffStart = wrist.clone().addScaledVector(axis, -0.15);
  const cuffEnd = wrist.clone().addScaledVector(axis, -0.02);
  addProp(new THREE.CylinderGeometry(0.083, 0.083, 1, 8, 1, false), 'iron', `${side}ForeArm`,
    along(cuffStart, cuffEnd, Math.PI / 8).multiply(new THREE.Matrix4().makeScale(1, cuffEnd.distanceTo(cuffStart), 1)));
  for (const t of [0.12, 0.88]) {
    const ring = cuffStart.clone().lerp(cuffEnd, t);
    addProp(new THREE.CylinderGeometry(0.093, 0.093, 0.026, 8), 'rust', `${side}ForeArm`,
      along(ring.clone().addScaledVector(axis, -0.013), ring.clone().addScaledVector(axis, 0.013), Math.PI / 8));
  }
  const linkBase = cuffStart.clone().lerp(cuffEnd, 0.5).add(new THREE.Vector3(0, -0.09, 0));
  addProp(new THREE.TorusGeometry(0.038, 0.012, 4, 8), 'ironDark', `${side}ForeArm`,
    new THREE.Matrix4().compose(linkBase.clone().add(new THREE.Vector3(0, -0.03, 0)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(1, 1.5, 1)));
  addProp(new THREE.TorusGeometry(0.038, 0.012, 4, 8), 'ironDark', `${side}ForeArm`,
    new THREE.Matrix4().compose(linkBase.clone().add(new THREE.Vector3(0, -0.11, 0)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, Math.PI / 2)), new THREE.Vector3(1, 1.5, 1)));
}

// Bone spurs burst through the back of the shoulders and along the spine.
const back = new THREE.Vector3(-1, 0, 0);
for (const [bone, offset, tilt, size] of [
  ['Spine2', new THREE.Vector3(-0.17, 0.12, -0.17), new THREE.Vector3(-0.6, 0.8, -0.35), 0.17],
  ['Spine2', new THREE.Vector3(-0.17, 0.12, 0.17), new THREE.Vector3(-0.6, 0.8, 0.35), 0.15],
  ['Spine2', new THREE.Vector3(-0.2, -0.02, -0.08), new THREE.Vector3(-0.85, 0.5, -0.15), 0.12],
  ['Spine2', new THREE.Vector3(-0.2, -0.02, 0.09), new THREE.Vector3(-0.85, 0.45, 0.2), 0.1],
  ['Spine1', new THREE.Vector3(-0.19, 0.02, 0), new THREE.Vector3(-0.9, 0.42, 0), 0.09],
]) {
  const anchor = toMeters(jointPosition(bone)).add(offset);
  const tip = anchor.clone().addScaledVector(tilt.normalize(), size);
  addProp(new THREE.ConeGeometry(size * 0.24, 1, 5), 'bone', bone,
    along(anchor.clone().addScaledVector(back, -0.02), tip).multiply(new THREE.Matrix4().makeScale(1, size, 1)));
}

// Flat normals, matching the walker's faceted shading.
const normals = new Array(positions.length).fill(0);
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
for (let triangle = 0; triangle < indices.length; triangle += 3) {
  a.fromArray(positions, indices[triangle] * 3);
  b.fromArray(positions, indices[triangle + 1] * 3);
  c.fromArray(positions, indices[triangle + 2] * 3);
  const normal = c.sub(b).cross(a.sub(b)).normalize();
  for (let k = 0; k < 3; k++) normal.toArray(normals, indices[triangle + k] * 3);
}

const setAttribute = (name, Type, values) => primitive.getAttribute(name).setArray(new Type(values));
setAttribute('POSITION', Float32Array, positions);
setAttribute('NORMAL', Float32Array, normals);
setAttribute('TEXCOORD_0', Float32Array, uvs);
setAttribute('JOINTS_0', Uint8Array, jointIndices); // 41 joints fit in a byte
setAttribute('WEIGHTS_0', Float32Array, weights);
primitive.getIndices().setArray(new Uint16Array(indices));

const texture = root.listTextures()[0];
texture.setName('Brutus.png').setImage(new Uint8Array(buildPalette(decodePng(Buffer.from(texture.getImage())))));
root.listMaterials()[0].setName('Brutus').setMetallicFactor(0);

// --- Clips ---------------------------------------------------------------
// Only the rise and walk are authored; attacks, idle and death are solved at
// runtime for every known rig. Body-space offsets turn the walker's gait into
// a hunched, heavy-shouldered stalk with low, swinging fists.
const POSTURE = {
  Spine: new THREE.Euler(0, 0, -0.1),
  Spine1: new THREE.Euler(0, 0, -0.14),
  Spine2: new THREE.Euler(0, 0, -0.08),
  Neck: new THREE.Euler(0, 0, 0.16),
  Head: new THREE.Euler(0, 0, 0.12),
  LeftArm: new THREE.Euler(-0.3, 0.38, 0),
  RightArm: new THREE.Euler(0.3, -0.38, 0),
};
const KEEP = { 'Zombie|ZombieCrawl': 'BruteRise', 'Zombie|ZombieWalk': 'BruteWalk' };
for (const animation of root.listAnimations()) {
  const name = KEEP[animation.getName()];
  if (!name) {
    // Samplers outlive their animation and would keep its keyframes alive.
    for (const sampler of animation.listSamplers()) sampler.dispose();
    animation.dispose();
    continue;
  }
  animation.setName(name);
  for (const channel of animation.listChannels()) {
    const node = channel.getTargetNode();
    const offset = POSTURE[node.getName()];
    if (channel.getTargetPath() !== 'rotation' || !offset) continue;
    const bindRotation = new THREE.Quaternion().setFromRotationMatrix(bind.get(node));
    const local = bindRotation.clone().invert()
      .multiply(new THREE.Quaternion().setFromEuler(offset))
      .multiply(bindRotation);
    const output = channel.getSampler().getOutput().clone();
    const values = output.getArray();
    const key = new THREE.Quaternion();
    for (let i = 0; i < values.length; i += 4) key.fromArray(values, i).multiply(local).normalize().toArray(values, i);
    channel.getSampler().setOutput(output.setArray(values));
  }
}

// Drop redundant baked keyframes; the walker clips sample every frame.
await doc.transform(resample(), prune());
await io.write(TARGET, doc);
