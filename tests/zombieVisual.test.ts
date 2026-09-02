import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ZombieModelId } from '../src/zombies/ZombieConfig';
import { ZombieVisual, ZOMBIE_MODELS } from '../src/zombies/ZombieVisual';

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
  it.each([['walker', 107.0066, 0.076], ['brute', 80, 0.1]] as const)(
    'normalizes %s-style exports (inflated armature) to variant height, feet on the ground',
    (modelId: ZombieModelId, armatureScale: number, rawHeight: number) => {
      const visual = new ZombieVisual(
        modelId,
        { scene: makeSkinnedModel(armatureScale, rawHeight), clips: [] },
        0xffffff,
        false,
      );
      const box = renderedBounds(visual.root);
      const size = box.getSize(new THREE.Vector3());
      expect(size.y).toBeCloseTo(ZOMBIE_MODELS[modelId].height, 1);
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

  it('applies and resets the subtle Shiny material treatment', () => {
    const visual = new ZombieVisual('walker', null, 0xa8b89a, false);
    const mesh = visual.root.getObjectByProperty('isMesh', true) as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const normalColor = material.color.clone();

    visual.setZombieType('shiny');
    expect(material.roughness).toBeLessThanOrEqual(0.46);
    expect(material.emissiveIntensity).toBeCloseTo(0.62);
    expect(material.color.equals(normalColor)).toBe(false);

    visual.setZombieType('normal');
    expect(material.color.getHex()).toBe(normalColor.getHex());
    expect(material.emissiveIntensity).toBeCloseTo(0.12);
  });

  it('uses a distinct Brute body instead of scaling or augmenting the walker', () => {
    const walker = new ZombieVisual('walker', null, 0xa8b89a, false);
    const brute = new ZombieVisual('brute', null, 0xffffff, false);
    walker.setZombieType('normal');
    brute.setZombieType('brute');
    const walkerSize = renderedBounds(walker.root).getSize(new THREE.Vector3());
    const bruteSize = renderedBounds(brute.root).getSize(new THREE.Vector3());

    expect(brute.modelId).toBe('brute');
    expect(brute.root.getObjectByName('brute-body-bulk')).toBeUndefined();
    expect(bruteSize.x / walkerSize.x).toBeGreaterThan(2);
    expect(bruteSize.y / walkerSize.y).toBeGreaterThan(1.05);
  });

  it('rejects assigning a gameplay type to an incompatible model', () => {
    const walker = new ZombieVisual('walker', null, 0xa8b89a, false);
    expect(() => walker.setZombieType('brute')).toThrow(/requires model "brute"/);
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

  it('anchors the Brute torso hitbox to its animated chest node', () => {
    const scene = new THREE.Group();
    const torso = new THREE.Group();
    torso.name = 'Torso';
    torso.position.y = 0.8;
    const head = new THREE.Group();
    head.name = 'Head';
    head.position.y = 0.7;
    torso.add(head);
    torso.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.8), new THREE.MeshStandardMaterial()));
    scene.add(torso);
    const smash = new THREE.AnimationClip('BruteSmash', 0.75, [
      new THREE.NumberKeyframeTrack('Torso.rotation[x]', [0, 0.4, 0.75], [0, 0.8, 0]),
    ]);
    const visual = new ZombieVisual('brute', { scene, clips: [smash] }, 0xffffff, false);
    const torsoHitbox = new THREE.Object3D();
    const headHitbox = new THREE.Object3D();
    visual.attachHitboxes(torsoHitbox, headHitbox);
    visual.root.updateMatrixWorld(true);
    const before = torsoHitbox.getWorldPosition(new THREE.Vector3());

    visual.setAttackDuration(0.75);
    visual.setState('attack');
    visual.update(0.4, 1);
    visual.root.updateMatrixWorld(true);

    expect(visual.torsoAnchor.name).toBe('Torso');
    expect(torsoHitbox.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeGreaterThan(0.05);
  });
});
