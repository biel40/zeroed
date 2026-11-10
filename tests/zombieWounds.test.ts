import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAX_SURFACE_SNAP, SkinSurfaceSampler, type SkinSurfaceHit } from '../src/zombies/wounds/SkinSurfaceSampler';
import { ZombieWounds } from '../src/zombies/wounds/ZombieWounds';
import { ZOMBIE_WOUND_LIMIT } from '../src/zombies/wounds/WoundConfig';
import { Zombie } from '../src/zombies/Zombie';
import { ZombieVisual, type ZombieModelSource } from '../src/zombies/ZombieVisual';

const RADIUS = 0.2;
const HEIGHT = 1.7;
const NECK_Y = 1.45;

/**
 * Skinned cylinder standing on y=0: everything above the neck rides `Head`,
 * the rest `Hips`, like the shipped walker's rigid segments.
 */
function makeBody(): { root: THREE.Group; mesh: THREE.SkinnedMesh; hips: THREE.Bone; head: THREE.Bone } {
  const hips = new THREE.Bone();
  hips.name = 'Hips';
  hips.position.y = 0.95;
  const head = new THREE.Bone();
  head.name = 'Head';
  head.position.y = NECK_Y - 0.95;
  hips.add(head);

  const geometry = new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 32, 34);
  geometry.translate(0, HEIGHT / 2, 0);
  const position = geometry.getAttribute('position');
  const skinIndices = new Uint16Array(position.count * 4);
  const skinWeights = new Float32Array(position.count * 4);
  for (let vertex = 0; vertex < position.count; vertex++) {
    skinIndices[vertex * 4] = position.getY(vertex) > NECK_Y ? 1 : 0;
    skinWeights[vertex * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  const root = new THREE.Group();
  root.add(hips, mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton([hips, head]));
  return { root, mesh, hips, head };
}

function newHit(): SkinSurfaceHit {
  return { bone: null, position: new THREE.Vector3(), normal: new THREE.Vector3() };
}

function woundWorldPosition(root: THREE.Object3D, index: number): THREE.Vector3 {
  const mesh = root.getObjectByName('zombie-wounds') as THREE.InstancedMesh;
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  mesh.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(matrix.premultiply(mesh.matrixWorld));
}

describe('SkinSurfaceSampler', () => {
  it('seats a frontal body shot on the skin at the exact entry spot', () => {
    const { mesh } = makeBody();
    const hit = newHit();
    const found = new SkinSurfaceSampler(mesh).locate(new THREE.Vector3(0.05, 1.03, 3), new THREE.Vector3(0, 0, -1), hit);
    expect(found).toBe(true);
    expect(hit.bone?.name).toBe('Hips');
    expect(hit.position.x).toBeCloseTo(0.05, 2);
    expect(hit.position.y).toBeCloseTo(1.03, 2);
    // On the front of the skin, not on its hitbox nor through the body.
    expect(hit.position.z).toBeGreaterThan(RADIUS - 0.02);
    expect(hit.position.z).toBeLessThan(RADIUS + 0.01);
    expect(hit.normal.z).toBeGreaterThan(0.9);
  });

  it('assigns a head shot to the head bone', () => {
    const { mesh } = makeBody();
    const hit = newHit();
    expect(new SkinSurfaceSampler(mesh).locate(new THREE.Vector3(0, 1.6, -3), new THREE.Vector3(0, 0, 1), hit)).toBe(true);
    expect(hit.bone?.name).toBe('Head');
    expect(hit.position.z).toBeLessThan(-RADIUS + 0.02);
  });

  it('finds the animated skin, not the bind pose', () => {
    const { root, mesh, hips } = makeBody();
    hips.position.x += 0.4;
    root.updateMatrixWorld(true);
    const hit = newHit();
    expect(new SkinSurfaceSampler(mesh).locate(new THREE.Vector3(0.4, 1, 3), new THREE.Vector3(0, 0, -1), hit)).toBe(true);
    expect(hit.position.x).toBeCloseTo(0.4, 2);
    expect(new SkinSurfaceSampler(mesh).locate(new THREE.Vector3(0, 1, 3), new THREE.Vector3(0, 0, -1), newHit())).toBe(false);
  });

  it('fabricates no wound for a shot that passes beside the body', () => {
    const { mesh } = makeBody();
    const beside = RADIUS + MAX_SURFACE_SNAP + 0.02;
    expect(new SkinSurfaceSampler(mesh).locate(new THREE.Vector3(beside, 1, 3), new THREE.Vector3(0, 0, -1), newHit())).toBe(false);
  });
});

describe('ZombieWounds', () => {
  it('keeps each wound on its bone while the body animates', () => {
    const { root, mesh, head } = makeBody();
    const wounds = new ZombieWounds(root, 4);
    const hit = newHit();
    new SkinSurfaceSampler(mesh).locate(new THREE.Vector3(0, 1.6, 3), new THREE.Vector3(0, 0, -1), hit);
    wounds.add(hit.bone!, hit.position, hit.normal, 0.01);
    wounds.update(1);
    expect(woundWorldPosition(root, 0).distanceTo(hit.position)).toBeLessThan(0.005);
    const expected = head.worldToLocal(hit.position.clone());

    head.rotation.x = 0.5;
    head.position.x = 0.1;
    wounds.update(1);
    const moved = woundWorldPosition(root, 0);
    expect(head.worldToLocal(moved.clone()).distanceTo(expected)).toBeLessThan(0.005);
    expect(moved.x).toBeGreaterThan(0.05);
  });

  it('reuses the oldest slot past the limit and clears completely', () => {
    const { root, hips } = makeBody();
    const wounds = new ZombieWounds(root, 3);
    for (let shot = 0; shot < 5; shot++) wounds.add(hips, new THREE.Vector3(0, 1 + shot * 0.05, RADIUS), new THREE.Vector3(0, 0, 1), 0.01);
    wounds.update(1);
    expect(wounds.count).toBe(3);
    const mesh = root.getObjectByName('zombie-wounds') as THREE.InstancedMesh;
    expect(mesh.count).toBe(3);
    // Slots 0 and 1 now hold the 4th and 5th shots.
    expect(woundWorldPosition(root, 0).y).toBeCloseTo(1.15 + 0, 2);
    expect(woundWorldPosition(root, 1).y).toBeCloseTo(1.2, 2);
    wounds.clear();
    expect(wounds.count).toBe(0);
    expect(mesh.count).toBe(0);
  });

  it('shrinks with the corpse fade', () => {
    const { root, hips } = makeBody();
    const wounds = new ZombieWounds(root, 2);
    wounds.add(hips, new THREE.Vector3(0, 1, RADIUS), new THREE.Vector3(0, 0, 1), 0.01);
    wounds.update(0.5);
    const matrix = new THREE.Matrix4();
    (root.getObjectByName('zombie-wounds') as THREE.InstancedMesh).getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(0.01, 4);
  });
});

describe('Zombie bullet impacts', () => {
  function walkerSource(): ZombieModelSource {
    const { root } = makeBody();
    const bob = new THREE.AnimationClip('ZombieWalk', 1, [
      new THREE.VectorKeyframeTrack('Hips.position', [0, 1], [0, 0.95, 0, 0, 0.97, 0]),
    ]);
    return { scene: root, clips: [bob] };
  }

  function standingZombie(): Zombie {
    const zombie = new Zombie(new ZombieVisual('walker', walkerSource(), 0xffffff, false));
    zombie.spawn(0, 0, 500, 1);
    zombie.skipSpawnRise();
    zombie.update(1 / 60);
    return zombie;
  }

  function wounds(zombie: Zombie): THREE.InstancedMesh | undefined {
    return zombie.group.getObjectByName('zombie-wounds') as THREE.InstancedMesh | undefined;
  }

  const origin = new THREE.Vector3(0, 1, 4);
  const point = new THREE.Vector3(0, 1, 0.35);

  it('wounds the skin of a living body without touching its state or health', () => {
    const zombie = standingZombie();
    const state = zombie.state;
    zombie.registerBulletImpact(origin, point, 34, 'torso');
    zombie.update(1 / 60);
    expect(wounds(zombie)?.count).toBe(1);
    expect(zombie.state).toBe(state);
    expect(zombie.hp).toBe(500);
  });

  it('caps the wounds per body and clears them when the pooled body respawns', () => {
    const zombie = standingZombie();
    for (let shot = 0; shot < ZOMBIE_WOUND_LIMIT + 3; shot++) {
      zombie.registerBulletImpact(origin, point.clone().setY(0.8 + shot * 0.06), 34, 'torso');
    }
    expect(wounds(zombie)?.count).toBe(ZOMBIE_WOUND_LIMIT);
    zombie.applyDamage(1000);
    zombie.spawn(0, 0, 500, 1);
    expect(wounds(zombie)?.count).toBe(0);
  });

  it('ignores dead bodies and shots that miss the skin', () => {
    const zombie = standingZombie();
    zombie.registerBulletImpact(new THREE.Vector3(1.5, 1, 4), new THREE.Vector3(1.5, 1, 0.35), 34, 'torso');
    expect(wounds(zombie)?.count ?? 0).toBe(0);
    zombie.applyDamage(1000);
    zombie.registerBulletImpact(origin, point, 34, 'torso');
    expect(wounds(zombie)?.count ?? 0).toBe(0);
  });

  it('adds no wound to the procedural fallback body', () => {
    const zombie = new Zombie();
    zombie.spawn(0, 0, 500, 1);
    zombie.skipSpawnRise();
    zombie.update(1 / 60);
    zombie.registerBulletImpact(origin, point, 34, 'torso');
    expect(wounds(zombie)).toBeUndefined();
  });
});
