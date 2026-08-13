// End-to-end verification of the bone-anchored hitbox fix against the real
// GLB: replicate ZombieVisual normalization + attachHitboxes placement, then
// play the walk clip and measure head-hitbox vs head-bone deviation.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import fs from 'node:fs';

const buf = fs.readFileSync(process.argv[2]);
const jsonLength = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLength));
delete json.images; delete json.textures; delete json.samplers; delete json.materials;
for (const mesh of json.meshes ?? []) for (const p of mesh.primitives ?? []) delete p.material;
let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
const pad = (4 - (jsonBuf.length % 4)) % 4;
if (pad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(pad, 0x20)]);
const rest = buf.subarray(20 + jsonLength);
const header = Buffer.alloc(12);
header.write('glTF', 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonBuf.length + rest.length, 8);
const chunkHeader = Buffer.alloc(8);
chunkHeader.writeUInt32LE(jsonBuf.length, 0); chunkHeader.write('JSON', 4);
const glb = Buffer.concat([header, chunkHeader, jsonBuf, rest]);

new GLTFLoader().parse(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '', (gltf) => {
  const model = cloneSkeleton(gltf.scene);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = 1.78 / Math.max(size.y, 1e-4);
  model.scale.setScalar(scale);
  model.position.y = -box.min.y * scale;

  const root = new THREE.Group();
  root.add(model);
  root.updateMatrixWorld(true);

  // --- replicate attachHitboxes ---
  const hips = model.getObjectByName('Hips');
  const head = model.getObjectByName('Head');
  const headTop = model.getObjectByName('HeadTop_End');
  console.log(`bones found: Hips=${!!hips} Head=${!!head} HeadTop_End=${!!headTop}`);

  const torsoHitbox = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.8, 4, 12));
  const headHitbox = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10));

  const place = (hitbox, anchor, worldTarget) => {
    anchor.add(hitbox);
    hitbox.position.copy(anchor.worldToLocal(worldTarget.clone()));
    const s = anchor.getWorldScale(new THREE.Vector3()).x;
    hitbox.scale.setScalar(1 / Math.max(s, 1e-6));
    return s;
  };

  const headTarget = head.getWorldPosition(new THREE.Vector3())
    .add(headTop.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
  const sT = place(torsoHitbox, hips, new THREE.Vector3(0, 0.75, 0.04));
  const sH = place(headHitbox, head, headTarget);
  console.log(`bone world scales: hips=${sT.toFixed(2)} head=${sH.toFixed(2)} (counter-scale applied)`);
  root.updateMatrixWorld(true);

  const v = new THREE.Vector3();
  const hb = new THREE.Vector3();
  const get = (o, out) => out.setFromMatrixPosition(o.matrixWorld);

  // world size sanity: head sphere bounding sphere in world units
  const headWorldScale = headHitbox.getWorldScale(new THREE.Vector3()).x;
  console.log(`head hitbox world radius = ${(0.26 * headWorldScale).toFixed(3)} m (expect ~0.26)`);

  const mixer = new THREE.AnimationMixer(model);
  const walk = gltf.animations.find((c) => /walk/i.test(c.name));
  const bite = gltf.animations.find((c) => /bite/i.test(c.name));

  const ray = new THREE.Raycaster();
  for (const [clip, label] of [[walk, 'WALK'], [bite, 'BITE']]) {
    const action = mixer.clipAction(clip);
    action.play();
    console.log(`\n=== ${label} ===`);
    for (const f of [0, 0.25, 0.5, 0.75]) {
      mixer.setTime(clip.duration * f);
      root.updateMatrixWorld(true);
      get(head, v); get(headHitbox, hb);
      const dev = v.distanceTo(hb);
      // Raycast at the VISIBLE head (bone position) from the front (+z)
      ray.set(new THREE.Vector3(v.x, v.y, v.z + 5), new THREE.Vector3(0, 0, -1));
      const hits = ray.intersectObjects([torsoHitbox, headHitbox], false);
      console.log(
        `t=${(clip.duration * f).toFixed(2)}s  head-bone=(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})  ` +
        `hitbox deviation=${dev.toFixed(3)} m  shot-at-visible-head → ${hits[0]?.object === headHitbox ? 'HEAD HIT' : hits[0] ? 'torso' : 'MISS'}`,
      );
    }
    action.stop();
    mixer.uncacheClip(clip);
  }
}, (e) => { console.error(e); process.exit(1); });
