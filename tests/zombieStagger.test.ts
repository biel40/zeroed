import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { STAGGER_MIN_PACE, ZombieStagger } from '../src/zombies/ZombieStagger';
import { staggerForce, Zombie } from '../src/zombies/Zombie';
import { ZombieVisual, type ZombieModelSource } from '../src/zombies/ZombieVisual';
import { createSkinnedWalkerSource } from '../src/zombies/skins/ZombieSkinBuilder';
import { bulletWoundRadius } from '../src/zombies/wounds/WoundConfig';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';

const DT = 1 / 60;

function run(stagger: ZombieStagger, seconds: number): { peakReel: number; minPace: number } {
  let peakReel = 0;
  let minPace = 1;
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    stagger.update(DT);
    peakReel = Math.max(peakReel, stagger.amount);
    minPace = Math.min(minPace, stagger.paceScale);
  }
  return { peakReel, minPace };
}

describe('ZombieStagger', () => {
  it('reels after a beat and makes a heavy hit falter, then fully recovers', () => {
    const stagger = new ZombieStagger();
    stagger.hit(0.9, 0, -1);
    stagger.update(DT);
    expect(stagger.amount).toBeLessThan(0.4);
    const { peakReel, minPace } = run(stagger, 0.3);
    expect(peakReel).toBeGreaterThan(0.75);
    expect(minPace).toBeLessThan(0.65);
    run(stagger, 3);
    expect(stagger.amount).toBe(0);
    expect(stagger.paceScale).toBe(1);
    expect(stagger.active).toBe(false);
  });

  it('lets a light hit flinch the body without breaking its stride', () => {
    const stagger = new ZombieStagger();
    stagger.hit(staggerForce(WEAPON_DEFINITIONS.vector.damage, 150, false, false), 0, -1);
    const { peakReel, minPace } = run(stagger, 0.5);
    expect(peakReel).toBeGreaterThan(0.1);
    expect(peakReel).toBeLessThan(0.3);
    expect(minPace).toBeGreaterThan(0.95);
  });

  it('scales with the weapon: a heavy round staggers far more than a light one', () => {
    const light = staggerForce(WEAPON_DEFINITIONS.vector.damage, 2000, false, false);
    const rifle = staggerForce(WEAPON_DEFINITIONS.m14.damage, 2000, false, false);
    const sniper = staggerForce(WEAPON_DEFINITIONS.l96.damage, 2000, false, false);
    expect(light).toBeLessThan(0.2);
    expect(rifle).toBeGreaterThan(light);
    expect(sniper).toBeGreaterThan(0.6);
    expect(staggerForce(1, 2000, false, true)).toBeGreaterThanOrEqual(0.8);
  });

  it('never slows below its floor, however hard the hit', () => {
    const stagger = new ZombieStagger();
    stagger.hit(50, 1, 0);
    expect(run(stagger, 1).minPace).toBeGreaterThanOrEqual(STAGGER_MIN_PACE - 1e-9);
  });

  it('keeps a body moving under sustained automatic fire', () => {
    const stagger = new ZombieStagger();
    let paceSum = 0;
    let frames = 0;
    // 600 rpm for three seconds, every round a solid hit.
    for (let shot = 0; shot < 30; shot++) {
      stagger.hit(0.5, 0, -1);
      for (let frame = 0; frame < 6; frame++) {
        stagger.update(DT);
        paceSum += stagger.paceScale;
        frames++;
      }
    }
    // Resistance builds: it keeps walking at more than half its pace on average, never pinned.
    expect(paceSum / frames).toBeGreaterThan(0.55);
    expect(stagger.amount).toBeLessThanOrEqual(1);
  });

  it('follows the direction of the hits that pushed it', () => {
    const stagger = new ZombieStagger();
    stagger.hit(0.8, 1, 0);
    expect(stagger.directionX).toBeCloseTo(1, 4);
    expect(stagger.directionZ).toBeCloseTo(0, 4);
  });
});

async function loadWalker(): Promise<ZombieModelSource> {
  const loader = new GLTFLoader().register(() => ({ name: 'headless-texture', loadTexture: async () => new THREE.Texture() }));
  const bytes = readFileSync(new URL('../public/assets/zombies/zombie_walker.glb', import.meta.url));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { scene: gltf.scene, clips: gltf.animations };
}

describe('shipped walker reacting to bullets', () => {
  async function walkingZombie(dressed: boolean): Promise<Zombie> {
    const walker = await loadWalker();
    const source = dressed ? createSkinnedWalkerSource(walker, 'evacuee') : walker;
    const zombie = new Zombie(new ZombieVisual('walker', source, 0xffffff, false));
    zombie.spawn(0, 0, 150, 1);
    zombie.skipSpawnRise();
    for (let frame = 0; frame < 20; frame++) zombie.update(DT, 1);
    zombie.group.updateMatrixWorld(true);
    return zombie;
  }

  function shoot(zombie: Zombie, hitbox: THREE.Object3D, part: 'head' | 'torso'): THREE.Vector3 {
    const origin = new THREE.Vector3(0.3, 1.6, 6);
    const direction = hitbox.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
    const point = new THREE.Raycaster(origin, direction).intersectObject(hitbox, false)[0].point;
    zombie.registerBulletImpact(origin, point, WEAPON_DEFINITIONS.m4a1.damage, part);
    zombie.applyDamage(WEAPON_DEFINITIONS.m4a1.damage, part === 'head', origin.x, origin.z);
    return point;
  }

  function woundMesh(zombie: Zombie): THREE.InstancedMesh {
    return zombie.group.getObjectByName('zombie-wounds') as THREE.InstancedMesh;
  }

  it.each([false, true])('shows a readable wound on the skin, dressed: %s', async (dressed) => {
    const zombie = await walkingZombie(dressed);
    shoot(zombie, zombie.torsoHitbox, 'torso');
    shoot(zombie, zombie.headHitbox, 'head');
    zombie.update(DT, 1);
    const mesh = woundMesh(zombie);
    expect(mesh.count).toBe(2);
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    const world = matrix.premultiply(mesh.matrixWorld);
    // At least 7 cm across: several pixels even from mid range.
    expect(new THREE.Vector3().setFromMatrixScale(world).x).toBeGreaterThan(0.07);
    expect(bulletWoundRadius(WEAPON_DEFINITIONS.m4a1.damage) * 2).toBeGreaterThan(0.07);
  });

  function worldOf(zombie: Zombie, name: string): THREE.Vector3 {
    zombie.group.updateMatrixWorld(true);
    return zombie.visual.root.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
  }

  it('bends the upper body back without sliding the body or its feet', async () => {
    const shot = await walkingZombie(false);
    const calm = await walkingZombie(false);
    shoot(shot, shot.torsoHitbox, 'torso');
    let headGap = 0;
    for (let frame = 0; frame < 9; frame++) {
      shot.update(DT, 1);
      calm.update(DT, 1);
      // The visual root is never displaced: no slide, the clip keeps the footwork.
      expect(shot.visual.root.position.distanceTo(calm.visual.root.position)).toBeLessThan(1e-6);
      for (const foot of ['LeftFoot', 'RightFoot']) expect(worldOf(shot, foot).distanceTo(worldOf(calm, foot))).toBeLessThan(1e-3);
      headGap = Math.max(headGap, worldOf(calm, 'Neck').z - worldOf(shot, 'Neck').z);
    }
    // The shooter stands in front (+z): the chest is thrown back several centimetres.
    expect(headGap).toBeGreaterThan(0.04);
    expect(shot.state).toBe('walk');
    for (let frame = 0; frame < 180; frame++) shot.update(DT, 1);
    expect(shot.paceScale).toBe(1);
  });

  it('takes the fatal blow before it folds', async () => {
    const fromFront = await walkingZombie(false);
    const fromBehind = await walkingZombie(false);
    fromFront.applyDamage(1000, false, 0, 6);
    fromBehind.applyDamage(1000, false, 0, -6);
    for (let frame = 0; frame < 7; frame++) {
      fromFront.update(DT, 1);
      fromBehind.update(DT, 1);
    }
    // ~0.12 s in, before the falls have gone anywhere, the chest already answers the round.
    expect(worldOf(fromBehind, 'Neck').z - worldOf(fromFront, 'Neck').z).toBeGreaterThan(0.06);
  });
});
