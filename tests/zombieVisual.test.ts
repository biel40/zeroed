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

describe('ZombieVisual textured variants', () => {
  it('preserves the original texture and resets tint without mutating the shared asset', () => {
    const scene = new THREE.Group();
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0.4, map: texture });
    material.name = 'Material';
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.7, 0.2), material);
    mesh.name = 'Zombie_Cylinder';
    scene.add(mesh);
    const visuals = ZOMBIE_MODELS.walker.tints.slice(0, 3).map((tint) =>
      new ZombieVisual('walker', { scene, clips: [] }, tint, false));
    const surface = (root: THREE.Object3D): THREE.MeshStandardMaterial =>
      (root.getObjectByName('Zombie_Cylinder') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const colors = visuals.map((visual) => surface(visual.root).color);
    expect(ZOMBIE_MODELS.walker.tints).toHaveLength(1);
    expect(ZOMBIE_MODELS.brute.tints).toHaveLength(1);
    expect(new Set(colors.map((color) => color.getHex())).size).toBe(1);
    for (const visual of visuals) {
      expect(surface(visual.root).map).toBe(texture);
      expect(surface(visual.root).metalness).toBeLessThanOrEqual(0.04);
      const normalColor = surface(visual.root).color.getHex();
      visual.setZombieType('shiny');
      visual.setZombieType('normal');
      expect(surface(visual.root).color.getHex()).toBe(normalColor);
    }
    expect(material.color.getHex()).toBe(0xffffff);
    expect(material.metalness).toBe(0.4);
  });
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

  it('applies a clearly golden Shiny treatment and restores the normal finish', () => {
    const visual = new ZombieVisual('walker', null, 0xa8b89a, false);
    const mesh = visual.root.getObjectByProperty('isMesh', true) as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const normalColor = material.color.clone();

    visual.setZombieType('shiny');
    expect(material.roughness).toBeLessThanOrEqual(0.28);
    expect(material.emissiveIntensity).toBeGreaterThanOrEqual(0.8);
    expect(material.emissive.r).toBeGreaterThan(material.emissive.g);
    expect(material.emissive.g).toBeGreaterThan(material.emissive.b * 3);
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

describe('ZombieVisual Shiny stars', () => {
  it('shows a bounded star field only for Shiny, without adding lights', () => {
    const visual = new ZombieVisual('walker', null, 0xa8b89a, false);
    const stars = visual.root.getObjectByName('shiny-stars') as THREE.Points;
    expect(stars).toBeInstanceOf(THREE.Points);
    expect(stars.visible).toBe(false);
    visual.setZombieType('shiny');
    expect(stars.visible).toBe(true);
    expect(stars.geometry.getAttribute('position').count).toBe(10);
    const material = stars.material as THREE.PointsMaterial;
    expect(material.map).toBeInstanceOf(THREE.DataTexture);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(visual.root.getObjectByProperty('isLight', true)).toBeUndefined();
  });

  it('animates stars in place, freezes at zero delta and clears them on death and pool reuse', () => {
    const visual = new ZombieVisual('walker', null, 0xa8b89a, false);
    visual.setZombieType('shiny');
    const stars = visual.root.getObjectByName('shiny-stars') as THREE.Points;
    const positions = stars.geometry.getAttribute('position');
    const storage = positions.array;
    visual.update(0.1, 0);
    const first = Array.from(storage);
    visual.update(0.1, 0);
    expect(positions.array).toBe(storage);
    expect(Array.from(storage)).not.toEqual(first);
    const frozen = Array.from(storage);
    visual.update(0, 0);
    expect(Array.from(storage)).toEqual(frozen);
    visual.setOpacity(0.25);
    expect((stars.material as THREE.PointsMaterial).opacity).toBeCloseTo(0.25);
    visual.setState('death');
    visual.update(0.1, 0);
    expect(stars.visible).toBe(false);
    visual.setZombieType('normal');
    visual.setState('walk');
    visual.update(0.1, 1);
    expect(stars.visible).toBe(false);
    visual.setZombieType('shiny');
    expect(stars.visible).toBe(true);
    expect((stars.material as THREE.PointsMaterial).opacity).toBe(1);
  });
});

describe('ZombieVisual barrier attack', () => {
  it('braces and shifts its weight back after pounding a board', () => {
    const visual = new ZombieVisual('walker', null, 0xa8b89a, false);

    visual.setAttackDuration(0.75);
    visual.setState('barrierAttack');
    visual.update(0.475, 0);
    const grabDepth = visual.root.position.z;
    visual.update(0.12, 0);

    expect(visual.root.position.z).toBeLessThan(grabDepth - 0.035);
    expect(visual.root.rotation.x).toBe(0); // body no longer rocks around its ankles
  });

  it('keeps an organic breaking motion while standing at the barrier', () => {
    const visual = new ZombieVisual('walker', null, 0xa8b89a, false);

    visual.setAttackDuration(0.75);
    visual.setState('barrierAttack');
    visual.update(0.12, 0);
    const firstPose = visual.headAnchor.quaternion.clone();
    visual.update(0.12, 0);

    expect(visual.headAnchor.quaternion.angleTo(firstPose)).toBeGreaterThan(0.001);
    expect(visual.root.rotation.x).toBe(0);
    expect(visual.root.rotation.z).toBe(0);
  });

  it('uses the quiet base clip instead of recycling the player attack', () => {
    const arm = new THREE.Object3D();
    arm.name = 'Arm';
    const scene = new THREE.Group();
    scene.add(arm);
    const attack = new THREE.AnimationClip('ZombieBite', 0.9, [
      new THREE.NumberKeyframeTrack('Arm.rotation[x]', [0, 0.9], [0, 1]),
    ]);
    const idle = new THREE.AnimationClip('ZombieIdle', 0.9, [
      new THREE.NumberKeyframeTrack('Arm.rotation[x]', [0, 0.9], [0, 0]),
    ]);
    const visual = new ZombieVisual('walker', { scene, clips: [attack, idle] }, 0xffffff, false);

    visual.setAttackDuration(0.9);
    visual.setState('barrierAttack');
    visual.update(0.5, 1.9);

    expect(visual.root.getObjectByName('Arm')?.rotation.x).toBeCloseTo(0, 4);
  });

  it('carries the impact into a smooth final-board follow-through', () => {
    const visual = new ZombieVisual('walker', null, 0xa8b89a, false);
    visual.setAttackDuration(0.75);
    visual.setBarrierBreakDuration(0.34);
    visual.setState('barrierAttack');
    visual.update(0.475, 0);
    const impact = visual.root.position.clone();

    visual.setState('barrierBreak');
    visual.update(0.08, 0);
    const followThrough = visual.root.position.clone();
    visual.update(0.26, 0);

    expect(followThrough.z).toBeLessThan(impact.z);
    expect(visual.root.position.z).toBeCloseTo(0, 4);
    expect(visual.root.rotation.x).toBeCloseTo(0, 4);
    expect(visual.root.rotation.z).toBeCloseTo(0, 4);
  });

  it('keeps real joint motion (not only root sway) while stalled at zero speed, using the authored idle clip', () => {
    const head = new THREE.Object3D();
    head.name = 'Head';
    const scene = new THREE.Group();
    scene.add(head);
    const walk = new THREE.AnimationClip('ZombieWalk', 1, [
      new THREE.NumberKeyframeTrack('Head.rotation[x]', [0, 1], [0, 0]),
    ]);
    const idle = new THREE.AnimationClip('ZombieIdle', 1, [
      new THREE.NumberKeyframeTrack('Head.rotation[x]', [0, 0.5, 1], [0, 0.3, 0]),
    ]);
    const visual = new ZombieVisual('walker', { scene, clips: [walk, idle] }, 0xffffff, false);

    visual.setState('walk');
    visual.update(0.1, 0);
    const first = visual.root.getObjectByName('Head')!.rotation.x;
    visual.update(0.1, 0);
    const second = visual.root.getObjectByName('Head')!.rotation.x;

    expect(second).not.toBeCloseTo(first, 4);
  });

  it('preserves idle motion on repeated walk requests and resumes the next barrier strike', () => {
    const head = new THREE.Object3D();
    head.name = 'Head';
    const scene = new THREE.Group();
    scene.add(head);
    const walk = new THREE.AnimationClip('ZombieWalk', 1, [
      new THREE.NumberKeyframeTrack('Head.rotation[x]', [0, 1], [0, 0]),
    ]);
    const idle = new THREE.AnimationClip('ZombieIdle', 1, [
      new THREE.NumberKeyframeTrack('Head.rotation[x]', [0, 0.5, 1], [0, 0.3, 0]),
    ]);
    const attack = new THREE.AnimationClip('ZombieBite', 0.75, [
      new THREE.NumberKeyframeTrack('Head.rotation[x]', [0, 0.75], [1, 1]),
    ]);
    const visual = new ZombieVisual('walker', { scene, clips: [walk, idle, attack] }, 0xffffff, false);
    const renderedHead = visual.root.getObjectByName('Head')!;
    visual.setState('barrierAttack');
    visual.update(0.3, 0);
    visual.setState('walk');
    visual.update(0.2, 0);
    visual.setState('walk');
    visual.update(0.2, 0);
    const first = renderedHead.rotation.x;
    visual.setState('walk');
    visual.update(0.13, 0);
    expect(renderedHead.rotation.x).not.toBeCloseTo(first, 4);
    visual.setState('barrierAttack');
    visual.update(0.2, 0);
    expect(renderedHead.rotation.x).not.toBeCloseTo(1, 4);
    expect(renderedHead.rotation.x).not.toBeCloseTo(first, 4);
  });

  it('builds recessed sockets with an amber undead glow and no floating catchlight', () => {
    const visual = new ZombieVisual('walker', null, 0xa8b89a, false);
    const eyes = visual.root.getObjectByName('zombie-eyes') as THREE.Group;
    const sockets = eyes.children.filter((child) => child.name === 'zombie-eye-socket') as THREE.Mesh[];
    const glows = eyes.children.filter((child) => child.name === 'zombie-eye-glow') as THREE.Mesh[];
    const cores = eyes.children.filter((child) => child.name === 'zombie-eye-core') as THREE.Mesh[];

    expect(sockets).toHaveLength(2);
    expect(glows).toHaveLength(2);
    expect(cores).toHaveLength(2);
    expect(eyes.children).toHaveLength(6);
    for (const socket of sockets) {
      const material = socket.material as THREE.MeshStandardMaterial;
      expect(material.emissive.getHex()).toBe(0x000000);
      expect(socket.scale.x).toBeGreaterThan(socket.scale.y);
    }
    for (const glow of glows) {
      const material = glow.material as THREE.MeshBasicMaterial;
      expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
      expect(material.color.r).toBeGreaterThan(material.color.b * 2);
      expect(material.blending).toBe(THREE.AdditiveBlending);
      expect(glow.position.z).toBeGreaterThan(sockets[0].position.z);
      expect(glow.position.z).toBeGreaterThanOrEqual(0.09);
      expect(glow.scale.x).toBeGreaterThan(glow.scale.y * 1.5);
      expect(glow.scale.x).toBeGreaterThanOrEqual(1);
    }
    for (const core of cores) {
      const material = core.material as THREE.MeshBasicMaterial;
      expect(material.color.r).toBeGreaterThan(material.color.g);
      expect(material.color.g).toBeGreaterThan(material.color.b);
      expect(core.position.z).toBeGreaterThan(glows[0].position.z);
    }
  });

  it('keeps subtle upper-body life without rocking the root while stationary', () => {
    const visual = new ZombieVisual('walker', null, 0xa8b89a, false);
    visual.setState('walk');
    visual.update(0.2, 0);
    const firstPose = visual.headAnchor.quaternion.clone();
    visual.update(0.2, 0);

    expect(visual.headAnchor.quaternion.angleTo(firstPose)).toBeGreaterThan(0.001);
    expect(visual.root.rotation.x).toBe(0);
    expect(visual.root.rotation.z).toBe(0);
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

describe('ZombieVisual eyes vs authored assets', () => {
  it('skips the generic eye overlay for a GLB model that already has authored eyes', () => {
    const scene = new THREE.Group();
    const head = new THREE.Group();
    head.name = 'Head';
    scene.add(head);
    const visual = new ZombieVisual('brute', { scene, clips: [] }, 0xffffff, false);

    expect(visual.root.getObjectByName('zombie-eyes')).toBeUndefined();
  });

  it('keeps the generic eye overlay for a GLB model without authored eyes', () => {
    const scene = new THREE.Group();
    const head = new THREE.Group();
    head.name = 'Head';
    scene.add(head);
    const visual = new ZombieVisual('walker', { scene, clips: [] }, 0xffffff, false);

    expect(visual.root.getObjectByName('zombie-eyes')).toBeDefined();
  });
});
