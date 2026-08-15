import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZombieVisual, ZOMBIE_VARIANTS, type ZombieVariantId } from '../src/zombies/ZombieVisual';

/**
 * Reproduces the Quaternius GLB structure that broke normalization: an
 * armature node with an inflated scale (x100+), tiny geometry authored in
 * joint-local units, a sibling SkinnedMesh node carrying the same scale, and
 * identity bind matrices (the glTF spec ignores the skinned mesh node
 * transform at render time — only joint matrices move vertices).
 */
function makeSkinnedModel(armatureScale: number, rawHeight: number): THREE.Group {
  const armature = new THREE.Group();
  armature.scale.setScalar(armatureScale);
  const hip = new THREE.Bone();
  armature.add(hip);

  const geometry = new THREE.CylinderGeometry(0.002, 0.002, rawHeight, 4);
  geometry.translate(0, rawHeight / 2, 0); // feet at y=0, like the real assets
  const count = geometry.getAttribute('position').count;
  const skinIndices = new Uint16Array(count * 4); // every vertex → hip
  const skinWeights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) skinWeights[i * 4] = 1;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.scale.setScalar(armatureScale);

  const root = new THREE.Group();
  root.add(armature, mesh);
  root.updateMatrixWorld(true);
  // Identity bind matrix + identity inverses: joints alone place vertices.
  mesh.bind(new THREE.Skeleton([hip], [new THREE.Matrix4()]), new THREE.Matrix4());
  return root;
}

/** World-space bounds exactly as the GPU skinning path places vertices. */
function renderedBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const vertex = new THREE.Vector3();
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      const position = object.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        object.getVertexPosition(i, vertex);
        vertex.applyMatrix4(object.matrixWorld);
        box.expandByPoint(vertex);
      }
    } else if (object instanceof THREE.Mesh) {
      object.geometry.computeBoundingBox();
      box.union(object.geometry.boundingBox!.clone().applyMatrix4(object.matrixWorld));
    }
  });
  return box;
}

describe('ZombieVisual GLB normalization', () => {
  it.each([['walker', 107.0066, 0.076]] as const)(
    'normalizes %s-style exports (inflated armature) to variant height, feet on the ground',
    (variantId: ZombieVariantId, armatureScale: number, rawHeight: number) => {
      const visual = new ZombieVisual(
        variantId,
        { scene: makeSkinnedModel(armatureScale, rawHeight), clips: [] },
        0xffffff,
        false,
      );
      const box = renderedBounds(visual.root);
      const size = box.getSize(new THREE.Vector3());
      expect(size.y).toBeCloseTo(ZOMBIE_VARIANTS[variantId].height, 1);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.02);
      expect(box.min.y).toBeLessThanOrEqual(0.02);
    },
  );
});

describe('ZombieVisual procedural fallback', () => {
  it('builds a human-sized body standing on the ground', () => {
    const visual = new ZombieVisual('walker', null, 0xa8b89a, false);
    const box = renderedBounds(visual.root);
    const size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(1.6);
    expect(size.y).toBeLessThan(2.1);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.02);
  });
});

describe('ZombieVisual barrier attack', () => {
  it('plays the attack clip while breaking a window barrier', () => {
    const arm = new THREE.Object3D();
    arm.name = 'Arm';
    const scene = new THREE.Group();
    scene.add(arm);
    const attack = new THREE.AnimationClip('ZombieBite', 0.9, [
      new THREE.NumberKeyframeTrack('Arm.rotation[x]', [0, 0.9], [0, 1]),
    ]);
    const visual = new ZombieVisual('walker', { scene, clips: [attack] }, 0xffffff, false);

    visual.setAttackDuration(0.9);
    visual.setState('barrierAttack');
    visual.update(0.5, 1.9);

    expect(visual.root.getObjectByName('Arm')?.rotation.x).toBeGreaterThan(0.2);
  });
});
