import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { Zombie } from '../src/zombies/Zombie';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { ZombieVisual } from '../src/zombies/ZombieVisual';
import { buildZombieMotionClips } from '../src/zombies/ZombieMotionClips';
import { WindowBarrier } from '../src/zombies/barriers/WindowBarrier';
import { WindowBarrierView } from '../src/zombies/barriers/WindowBarrierView';
import { sampleZombieWalkMotion } from '../src/zombies/ZombieWalkMotion';
import {
  MAX_ALIVE, roundConfig, ZOMBIE_ATTACK_DURATION, ZOMBIE_ATTACK_HIT_MOMENT,
  ZOMBIE_CORPSE_LINGER, ZOMBIE_DEATH_FALL, ZOMBIE_SPAWN_DURATION,
} from '../src/zombies/ZombieConfig';

const DT = 1 / 60;
async function loadModel(id: 'walker' | 'brute') {
  const loader = new GLTFLoader().register(() => ({ name: 'headless-texture', loadTexture: async () => new THREE.Texture() }));
  const bytes = readFileSync(new URL(`../public/assets/zombies/zombie_${id}.glb`, import.meta.url));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { scene: gltf.scene, clips: gltf.animations };
}
function walkingZombie(): Zombie {
  const zombie = new Zombie();
  zombie.spawn(0, 0, 100, 1);
  zombie.update(ZOMBIE_SPAWN_DURATION, 0);
  return zombie;
}

describe('zombie animation synchronization', () => {
  it('layers a hunched asymmetric zombie silhouette over the authored stride', () => {
    const forwardStep = sampleZombieWalkMotion(0.25, 1);
    const dragStep = sampleZombieWalkMotion(0.75, 1);
    const stopped = sampleZombieWalkMotion(0.25, 0);

    expect(forwardStep.torsoPitch).toBeGreaterThan(0.03);
    expect(forwardStep.torsoPitch).toBeLessThan(0.08);
    expect(Math.abs(forwardStep.torsoRoll)).toBeGreaterThan(0.01);
    expect(forwardStep.torsoRoll * dragStep.torsoRoll).toBeLessThan(0);
    expect(Math.abs(forwardStep.leftShoulderPitch - forwardStep.rightShoulderPitch)).toBeGreaterThan(0.05);
    expect(Math.abs(forwardStep.leftShoulderPitch - forwardStep.rightShoulderPitch)).toBeLessThan(0.2);
    expect(stopped).toEqual({
      torsoPitch: 0,
      torsoRoll: 0,
      headPitch: 0,
      headRoll: 0,
      leftShoulderPitch: 0,
      rightShoulderPitch: 0,
    });
  });

  it('keeps most of the authored walker upper-body motion in the rebuilt walk', () => {
    const root = new THREE.Group();
    const spine = new THREE.Bone();
    spine.name = 'Spine1';
    root.add(spine);
    const authoredTurn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.8, 0, 0));
    const source = new THREE.AnimationClip('ZombieWalk', 1, [
      new THREE.QuaternionKeyframeTrack('Spine1.quaternion', [0, 1], [
        0, 0, 0, 1,
        ...authoredTurn.toArray(),
      ]),
    ]);

    const rebuilt = buildZombieMotionClips(root, 1.78, [source])[1];
    const track = rebuilt.tracks.find((candidate) => candidate.name === 'Spine1.quaternion')!;
    const rebuiltTurn = new THREE.Quaternion().fromArray(track.values, 4);

    expect(rebuiltTurn.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.4);
  });

  it('keeps every rendered vertex within the body envelope through spawned, moving and reused rigs', async () => {
    const source = await loadModel('walker');
    const zombie = new Zombie(new ZombieVisual('walker', source, 0xffffff, false));
    const meshes: THREE.SkinnedMesh[] = [];
    zombie.group.traverse(object => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); });
    const vertex = new THREE.Vector3();
    for (let reuse = 0; reuse < 2; reuse++) {
      zombie.spawn(12, -18, 100, 1.35, 3, 1, reuse === 0 ? 'normal' : 'shiny');
      for (let frame = 0; frame < 420; frame++) {
        if (frame > 70 && frame < 180) {
          zombie.position.x += 0.012;
          zombie.group.rotation.y += 0.015;
        }
        if (frame === 190) zombie.tryAttack();
        if (frame === 260) {
          zombie.tryBarrierAttack();
          zombie.onAttackLanded = () => zombie.finishBarrierAttack();
        }
        if (frame === 340) zombie.applyDamage(100);
        zombie.update(DT, frame < 180 ? 1.35 : 0);
        zombie.group.updateMatrixWorld(true);
        for (const mesh of meshes) {
          mesh.skeleton.update();
          if (frame % 5 !== 0) continue;
          let max = 0;
          for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
            max = Math.max(max, vertex.distanceTo(zombie.position));
          }
          for (const bone of mesh.skeleton.bones) {
            expect(bone.quaternion.length(), `${bone.name}, frame ${frame}`).toBeCloseTo(1, 4);
          }
          expect(max, `reuse ${reuse} frame ${frame} state ${zombie.state}`).toBeLessThan(3);
        }
      }
    }
  });
  it.each(['walker', 'brute'] as const)('%s preserves the complete visible pose at death entry and settles its head near the floor', async (id) => {
    const visual = new ZombieVisual(id, await loadModel(id), 0xffffff, false);
    visual.setState('walk');
    for (let i = 0; i < 30; i++) visual.update(DT, 1.35);
    const head = visual.headAnchor.getWorldPosition(new THREE.Vector3());
    const hips = visual.root.getObjectByName('Hips')!;
    const hipPosition = hips.position.clone();
    visual.setState('death');
    visual.update(0, 0);
    expect(visual.headAnchor.getWorldPosition(new THREE.Vector3()).distanceTo(head)).toBeLessThan(0.001);
    expect(hips.position.distanceTo(hipPosition)).toBeLessThan(0.001);
    for (let i = 0; i < 75; i++) visual.update(DT, 0);
    expect(visual.headAnchor.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(0.55);
  });

  it('keeps the median support-foot speed calibrated and chase stable around the switch speed', async () => {
    const visual = new ZombieVisual('walker', await loadModel('walker'), 0xffffff, false) as any;
    visual.setState('walk');
    visual.update(0.3, 1.35);
    const feet = ['LeftFoot', 'RightFoot'].map(name => visual.root.getObjectByName(name)!);
    const points: THREE.Vector3[][] = [[], []];
    for (let frame = 0; frame < 240; frame++) {
      visual.update(1 / 120, 1.35);
      feet.forEach((foot, i) => points[i].push(foot.getWorldPosition(new THREE.Vector3())));
    }
    const supportSpeeds: number[] = [];
    for (const positions of points) {
      const floor = Math.min(...positions.map(p => p.y));
      for (let i = 1; i < positions.length; i++) {
        const speed = (positions[i - 1].z - positions[i].z) * 120;
        if (positions[i].y < floor + 0.035 && speed > 0.05) supportSpeeds.push(speed);
      }
    }
    supportSpeeds.sort((a, b) => a - b);
    expect(Math.abs(supportSpeeds[Math.floor(supportSpeeds.length / 2)] - 1.35))
      .toBeLessThan(1.35 * 0.25);
    visual.update(0.1, 2.6);
    const run = visual.locomotionAction;
    for (const speed of [2.3, 2.4, 2.2, 2.35]) {
      visual.update(DT, speed);
      expect(visual.locomotionAction).toBe(run);
    }
  });

  it.each(['walker', 'brute'] as const)('%s pounds the window at contact, recoils, and keeps a stable lower body', async (id) => {
    const visual = new ZombieVisual(id, await loadModel(id), 0xffffff, false);
    visual.setState('walk');
    visual.update(0.3, 0);
    visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
    visual.setStrikeTarget(0, 1.3, 0.9);
    visual.setState('barrierAttack');
    const hand = visual.root.getObjectByName(id === 'walker' ? 'LeftHand' : 'BrutusHandL')!;
    const foot = visual.root.getObjectByName(id === 'walker' ? 'LeftFoot' : 'BrutusBootL')!;
    visual.update(0.25, 0);
    const grab = hand.getWorldPosition(new THREE.Vector3());
    const planted = foot.getWorldPosition(new THREE.Vector3());
    visual.update(ZOMBIE_ATTACK_HIT_MOMENT - 0.25, 0);
    const contact = hand.getWorldPosition(new THREE.Vector3());
    expect(contact.z).toBeGreaterThan(grab.z);
    expect(contact.distanceTo(new THREE.Vector3(id === 'walker' ? 0.16 : -0.16, 1.3, 0.9))).toBeLessThan(0.25);
    visual.update(0.14, 0);
    const pull = hand.getWorldPosition(new THREE.Vector3());
    expect(pull.z).toBeLessThan(contact.z - 0.2);
    expect(foot.getWorldPosition(new THREE.Vector3()).distanceTo(planted)).toBeLessThan(0.09);
    expect(visual.root.rotation.x).toBe(0);
    expect(visual.root.rotation.z).toBe(0);
  });

  it.each(['walker', 'brute'] as const)('%s reaches with one arm while the spare arm stays relaxed', async (id) => {
    const visual = new ZombieVisual(id, await loadModel(id), 0xffffff, false);
    visual.setState('walk');
    visual.update(0.3, 0);
    visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
    visual.setAttackReach(0.35);
    visual.setStrikeTarget(0, 1.35, 1.1);
    const left = visual.root.getObjectByName(id === 'walker' ? 'LeftHand' : 'BrutusHandL')!;
    const right = visual.root.getObjectByName(id === 'walker' ? 'RightHand' : 'BrutusHandR')!;
    const restingWrist = left.quaternion.clone();
    visual.setState('attack'); // first strike is left-handed
    visual.update(0.315, 0);
    const windup = left.getWorldPosition(new THREE.Vector3());
    const wrist = left.quaternion.clone();
    expect(wrist.angleTo(restingWrist)).toBeLessThan(0.02); // subtle idle wrist pose settles during wind-up
    visual.update(ZOMBIE_ATTACK_HIT_MOMENT - 0.315, 0);
    const contact = left.getWorldPosition(new THREE.Vector3());
    const guard = right.getWorldPosition(new THREE.Vector3());
    expect(contact.distanceTo(new THREE.Vector3(0, 1.35, 1.1))).toBeLessThan(0.2);
    const direction = id === 'walker' ? -1 : 1;
    expect((contact.x - windup.x) * direction).toBeGreaterThan(0.2);
    expect(contact.z).toBeGreaterThan(guard.z + 0.3);
    expect(left.quaternion.angleTo(wrist)).toBeLessThan(0.005); // wrist follows forearm
    visual.update(0.14, 0);
    const follow = left.getWorldPosition(new THREE.Vector3());
    expect((follow.x - contact.x) * direction).toBeGreaterThan(0.05);
    expect((follow.x - contact.x) * direction).toBeLessThan(0.15); // compact follow-through
    expect(follow.y).toBeLessThan(contact.y - 0.08);
    visual.setState('walk');
    visual.update(0.35, 0);
    visual.setState('attack'); // next strike mirrors the choreography
    visual.update(ZOMBIE_ATTACK_HIT_MOMENT, 0);
    expect(right.getWorldPosition(new THREE.Vector3()).z)
      .toBeGreaterThan(left.getWorldPosition(new THREE.Vector3()).z + 0.3);
    visual.setState('walk');
    visual.update(0.35, 0);
    visual.setState('attack'); // final variant is a compact two-hand grab
    visual.update(ZOMBIE_ATTACK_HIT_MOMENT, 0);
    const leftGrab = left.getWorldPosition(new THREE.Vector3());
    const rightGrab = right.getWorldPosition(new THREE.Vector3());
    expect(Math.abs(leftGrab.z - rightGrab.z)).toBeLessThan(0.16);
    expect(leftGrab.z).toBeGreaterThan(guard.z + 0.25);
  });

  it('uses the rebuilt run cycle for a fast walker and preserves locomotion phase', async () => {
    const visual = new ZombieVisual('walker', await loadModel('walker'), 0xffffff, false) as any;
    visual.setState('walk');
    visual.update(0.4, 1.6);
    const walkPhase = visual.locomotionAction.time / visual.locomotionAction.getClip().duration;
    visual.update(0.02, 2.8);
    const runPhase = visual.locomotionAction.time / visual.locomotionAction.getClip().duration;

    expect(visual.locomotionAction.getClip().name).toMatch(/ZombieRun$/);
    expect(Math.abs(runPhase - walkPhase)).toBeLessThan(0.12);
  });

  it.each(['walker', 'brute'] as const)('%s cycles left, right and two-hand barrier strikes', async (id) => {
    const visual = new ZombieVisual(id, await loadModel(id), 0xffffff, false);
    visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
    visual.setStrikeTarget(0, 1.3, 0.9);
    const left = visual.root.getObjectByName(id === 'walker' ? 'LeftHand' : 'BrutusHandL')!;
    const right = visual.root.getObjectByName(id === 'walker' ? 'RightHand' : 'BrutusHandR')!;
    const depths: Array<[number, number]> = [];
    for (let variant = 0; variant < 3; variant++) {
      visual.setState('barrierAttack');
      visual.update(ZOMBIE_ATTACK_HIT_MOMENT, 0);
      depths.push([
        left.getWorldPosition(new THREE.Vector3()).z,
        right.getWorldPosition(new THREE.Vector3()).z,
      ]);
      visual.setState('walk');
      visual.update(0.3, 0);
    }
    expect(depths[0][0]).toBeGreaterThan(depths[0][1] + 0.25);
    expect(depths[1][1]).toBeGreaterThan(depths[1][0] + 0.25);
    expect(Math.abs(depths[2][0] - depths[2][1])).toBeLessThan(0.16);
  });

  it.each(['walker', 'brute'] as const)('%s keeps its maximum-range swipe connected to the melee envelope', async (id) => {
    const visual = new ZombieVisual(id, await loadModel(id), 0xffffff, false);
    visual.setState('walk');
    visual.update(0.3, 0);
    visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
    visual.setAttackReach(0.38);
    visual.setStrikeTarget(0, 1.35, 1.65);
    visual.setState('attack');
    visual.update(ZOMBIE_ATTACK_HIT_MOMENT, 0);
    const hand = visual.root.getObjectByName(id === 'walker' ? 'LeftHand' : 'BrutusHandL')!;
    // Contact includes the fingers beyond the wrist joint. The player occupies
    // a body volume around the camera's XZ, not a point.
    const target = new THREE.Vector3(0, 1.35, 1.65);
    const point = new THREE.Vector3();
    let nearest = Infinity;
    hand.traverse((joint) => { nearest = Math.min(nearest, joint.getWorldPosition(point).distanceTo(target)); });
    expect(nearest).toBeLessThan(0.3);
  });

  it.each(['walker', 'brute'] as const)('%s aims a hand at the barricade and keeps support feet grounded', async (id) => {
    const visual = new ZombieVisual(id, await loadModel(id), 0xffffff, false);
    visual.setState('walk');
    for (let i = 0; i < 90; i++) visual.update(DT, 1.2);
    const leftFoot = visual.root.getObjectByName(id === 'walker' ? 'LeftFoot' : 'BrutusBootL')!;
    const rightFoot = visual.root.getObjectByName(id === 'walker' ? 'RightFoot' : 'BrutusBootR')!;
    expect(leftFoot).toBeDefined();
    expect(rightFoot).toBeDefined();
    const point = new THREE.Vector3();
    for (let i = 0; i < 60; i++) {
      visual.update(DT, 1.2);
      const support = Math.min(leftFoot.getWorldPosition(point).y, rightFoot.getWorldPosition(point).y);
      expect(support).toBeGreaterThan(-0.08);
      expect(support).toBeLessThan(0.25);
    }
    visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
    visual.setStrikeTarget(0, 1.3, 0.9);
    visual.setState('barrierAttack');
    visual.update(ZOMBIE_ATTACK_HIT_MOMENT, 0);
    const hand = visual.root.getObjectByName(id === 'walker' ? 'LeftHand' : 'BrutusHandL')!;
    expect(hand).toBeDefined();
    hand.getWorldPosition(point);
    expect(point.distanceTo(new THREE.Vector3(id === 'walker' ? 0.16 : -0.16, 1.3, 0.9))).toBeLessThan(0.25);
    const before = hand.quaternion.clone();
    visual.setState('death');
    visual.update(0, 0);
    expect(hand.quaternion.angleTo(before)).toBeLessThan(0.001);
  });

  it('samples contact before the damage callback and recovers without another hit', () => {
    const zombie = walkingZombie();
    zombie.visual.setAttackReach(0.35);
    const contact = vi.fn(() => expect(zombie.visual.root.position.z).toBeCloseTo(0.35, 5));
    zombie.onAttackLanded = contact;
    zombie.tryAttack();
    zombie.update(ZOMBIE_ATTACK_HIT_MOMENT - 0.01, 0);
    expect(contact).not.toHaveBeenCalled();
    zombie.update(0.01, 0);
    expect(contact).toHaveBeenCalledTimes(1);
    zombie.update(ZOMBIE_ATTACK_DURATION - ZOMBIE_ATTACK_HIT_MOMENT, 0);
    expect(zombie.visual.root.position.z).toBeCloseTo(0, 5);
    expect(contact).toHaveBeenCalledTimes(1);
  });

  it.each([[0, 1], [0.75, 0]])('validates the committed strike area after a lateral dodge of %s m', (offset, hits) => {
    const manager = new ZombieManager(() => 0.5, {}, false, [[0, 0]]);
    manager.spawnZombie(roundConfig(1), 0, 10);
    const zombie = [...manager.actives][0];
    zombie.update(ZOMBIE_SPAWN_DURATION, 0);
    zombie.position.set(0, 0, 0);
    zombie.group.rotation.y = 0;
    const damage = vi.fn();
    manager.onPlayerAttack = damage;
    manager.update(DT, 0, 1.3);
    expect(zombie.state).toBe('attack');
    for (let i = 0; i < 30; i++) manager.update(DT, offset, 1.3);
    expect(damage).toHaveBeenCalledTimes(hits);
  });

  it('layers opposite directional recoil over moving legs without interrupting attacks', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    try {
      const left = walkingZombie();
      const right = walkingZombie();
      left.applyDamage(20, false, -2, 0);
      right.applyDamage(20, false, 2, 0);
      left.update(0.08, 1);
      right.update(0.08, 1);
      expect(left.state).toBe('walk');
      expect(right.state).toBe('walk');
      expect(left.visual.headAnchor.rotation.z).not.toBeCloseTo(right.visual.headAnchor.rotation.z, 4);
      const hit = vi.fn();
      left.onAttackLanded = hit;
      left.tryAttack();
      left.applyDamage(1, true, 2, 0);
      left.update(ZOMBIE_ATTACK_HIT_MOMENT, 0);
      expect(hit).toHaveBeenCalledTimes(1);
    } finally {
      random.mockRestore();
    }
  });

  it.each(['idle', 'moving', 'attacking'] as const)('retains floor height through %s death and clears offsets on reuse', (state) => {
    const zombie = walkingZombie();
    zombie.position.y = -3;
    for (let i = 0; i < 20; i++) zombie.update(DT, state === 'moving' ? 1 : 0);
    if (state === 'attacking') {
      zombie.tryAttack();
      zombie.update(0.3, 0);
    }
    zombie.applyDamage(100);
    zombie.update(ZOMBIE_DEATH_FALL + ZOMBIE_CORPSE_LINGER + 0.1, 0);
    expect(zombie.position.y).toBeLessThan(-3);
    expect(zombie.position.y).toBeGreaterThan(-3.35);
    expect(zombie.visual.root.rotation.x).toBeCloseTo(-(Math.PI / 2 - 0.12), 4);
    zombie.spawn(0, 0, 100, 1);
    zombie.update(ZOMBIE_SPAWN_DURATION, 0);
    expect(Math.abs(zombie.visual.root.rotation.x)).toBeLessThanOrEqual(0.015); // living idle sway
    expect(zombie.visual.root.position.z).toBe(0);
  });

  it('brakes progressively through a reversal while preserving forward momentum', () => {
    const manager = new ZombieManager(() => 0.5, {}, false, [[0, 0]]);
    manager.spawnZombie(roundConfig(1), 0, 10);
    const zombie = [...manager.actives][0];
    zombie.update(ZOMBIE_SPAWN_DURATION, 0);
    manager.update(DT, 0, 10);
    const before = zombie.position.clone();
    const yaw = zombie.group.rotation.y;
    manager.update(DT, 0, -10);
    expect(Math.abs(zombie.group.rotation.y - yaw)).toBeLessThanOrEqual(5.5 * DT + 1e-6);
    expect(zombie.position.distanceTo(before)).toBeLessThan(zombie.speed * DT);
    expect(zombie.position.z).toBeGreaterThan(before.z);
    for (let i = 0; i < 20; i++) manager.update(DT, 0, -10);
    expect(zombie.position.z).toBeLessThan(before.z);
  });

  it('vibrates a surviving board on impact, then breaks it on the damaging hit', () => {
    const barrier = new WindowBarrier('test', 0, 0, 0, 1, {
      boardCount: 1, boardHp: 100, repairInterval: 1, repairRewardCap: 1,
    });
    const view = new WindowBarrierView(barrier, new THREE.Group());
    const board = view.group.children[0];
    barrier.damage(10);
    view.update(DT);
    expect(barrier.isOpen).toBe(false);
    expect(board.position.z).not.toBe(0);
    barrier.damage(90);
    view.update(DT);
    expect(barrier.isOpen).toBe(true);
    expect(board.visible).toBe(true);
    view.update(1);
    expect(board.visible).toBe(false);
  });

  it.each([[0, 0], [0.7, 0.7], [0, -0.9]])('does not hit a barrier from invalid position %s, %s', (x, z) => {
    const barrier = new WindowBarrier('test', 0, 0, 0, 1, {
      boardCount: 1, boardHp: 100, repairInterval: 1, repairRewardCap: 1,
    });
    const manager = new ZombieManager(() => 0.5, {}, false, [[0, 2]], [barrier]);
    manager.spawnZombie(roundConfig(1), 0, 10);
    const zombie = [...manager.actives][0];
    zombie.update(ZOMBIE_SPAWN_DURATION, 0);
    zombie.position.set(x, 0, z);
    manager.update(DT, 0, 10);
    expect(zombie.state).toBe('walk');
    expect(barrier.boards[0].hp).toBe(100);
  });

  it('keeps real-asset animation bounded at the full population through motion, hits, attacks and death', async () => {
    const sources = await Promise.all((['walker', 'brute'] as const).map(loadModel));
    const zombies = Array.from({ length: MAX_ALIVE }, (_, i) => {
      const brute = i >= MAX_ALIVE - 2;
      const zombie = new Zombie(new ZombieVisual(brute ? 'brute' : 'walker', sources[brute ? 1 : 0], 0xffffff, false));
      zombie.spawn(i * 2, 0, 100, 1.35, 0, 0, brute ? 'brute' : 'normal');
      zombie.update(ZOMBIE_SPAWN_DURATION, 0);
      return zombie;
    });
    const counts = zombies.map((zombie) => zombie.group.getObjectsByProperty('isObject3D', true).length);
    const begin = performance.now();
    for (let frame = 0; frame < 240; frame++) {
      for (const zombie of zombies) {
        if (frame === 40) zombie.applyDamage(5, false, zombie.position.x - 2, 0);
        if (frame === 80) zombie.tryAttack();
        if (frame === 160) zombie.applyDamage(100);
        if (frame < 80) zombie.faceTowards(zombie.position.x + 2, frame < 30 ? 3 : -3, 5.5 * DT);
        zombie.update(DT, frame < 80 ? zombie.speed : 0);
        zombie.group.updateMatrixWorld(true);
      }
    }
    console.info(`24 real zombie rigs: ${((performance.now() - begin) / 240).toFixed(2)} ms/frame headless animation + matrices`);
    zombies.forEach((zombie, i) => {
      expect(zombie.group.getObjectsByProperty('isObject3D', true).length).toBe(counts[i]);
      zombie.group.traverse((object) => expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true));
      expect(zombie.state).toBe('death');
    });
  });
});
