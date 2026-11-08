import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { GRENADE_DEFINITIONS } from '../src/config/grenades';
import { Zombie } from '../src/zombies/Zombie';
import {
  roundConfig,
  ZOMBIE_CRAWLER_SPEED_FACTOR,
  ZOMBIE_CRIPPLE_COLLAPSE,
  ZOMBIE_SPAWN_DURATION,
} from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { ZombieVisual } from '../src/zombies/ZombieVisual';

const BLAST = GRENADE_DEFINITIONS.f1.blast;
const CENTRE = new THREE.Vector3(0, 0, 0);

async function loadWalker(): Promise<{ scene: THREE.Group; clips: THREE.AnimationClip[] }> {
  const loader = new GLTFLoader().register(() => ({ name: 'headless-texture', loadTexture: async () => new THREE.Texture() }));
  const bytes = readFileSync(new URL('../public/assets/zombies/zombie_walker.glb', import.meta.url));
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  return { scene: gltf.scene, clips: gltf.animations };
}

function walkingZombie(hp = 100, speed = 1.5): Zombie {
  const zombie = new Zombie();
  zombie.spawn(0, 0, hp, speed);
  zombie.update(ZOMBIE_SPAWN_DURATION, 0);
  return zombie;
}

/** Spawned, risen zombies at the given positions with the given health. */
function horde(...bodies: { x: number; z: number; hp: number }[]): { manager: ZombieManager; zombies: Zombie[] } {
  const manager = new ZombieManager(() => 0);
  manager.registerColliders([]);
  for (let i = 0; i < bodies.length; i++) manager.spawnZombie(roundConfig(1), 0, 30);
  const zombies = [...manager.actives];
  zombies.forEach((zombie, index) => {
    zombie.skipSpawnRise();
    zombie.position.set(bodies[index].x, 0, bodies[index].z);
    zombie.hp = zombie.maxHp = bodies[index].hp;
  });
  return { manager, zombies };
}

describe('crippled zombies', () => {
  it('collapse onto their hands, then crawl on at a fraction of their speed', () => {
    const zombie = walkingZombie(100, 1.5);
    expect(zombie.canCripple).toBe(true);
    expect(zombie.cripple()).toBe(true);
    expect(zombie.isCrippled).toBe(true);
    expect(zombie.speed).toBeCloseTo(1.5 * ZOMBIE_CRAWLER_SPEED_FACTOR);
    expect(zombie.state).toBe('hit');
    zombie.update(ZOMBIE_CRIPPLE_COLLAPSE + 0.01, 0);
    expect(zombie.state).toBe('walk');
  });

  it('lose their legs only once, never while rising or dead, and stand again when respawned', () => {
    const zombie = walkingZombie();
    zombie.cripple();
    expect(zombie.cripple()).toBe(false);
    zombie.spawn(0, 0, 100, 1.5);
    expect(zombie.isCrippled).toBe(false);
    expect(zombie.cripple()).toBe(false);
    zombie.update(ZOMBIE_SPAWN_DURATION, 0);
    zombie.applyDamage(1000);
    expect(zombie.cripple()).toBe(false);
  });

  it('drop the strike they were swinging', () => {
    const zombie = walkingZombie();
    let landed = 0;
    zombie.onAttackLanded = () => { landed++; };
    zombie.tryAttack();
    zombie.cripple();
    for (let t = 0; t < 1.5; t += 1 / 60) zombie.update(1 / 60, 0);
    expect(landed).toBe(0);
  });

  it('crawl with the authored prone clip, low to the floor', async () => {
    const visual = new ZombieVisual('walker', await loadWalker(), 0xffffff, false);
    const head = new THREE.Vector3();
    visual.setState('walk');
    visual.update(0.2, 1.35);
    visual.root.updateMatrixWorld(true);
    const standing = visual.headAnchor.getWorldPosition(head).y;
    visual.setState('hit');
    visual.setCrippled(true);
    for (let t = 0; t < 1; t += 1 / 60) visual.update(1 / 60, 0.4);
    visual.setState('walk');
    for (let t = 0; t < 0.5; t += 1 / 60) visual.update(1 / 60, 0.4);
    visual.root.updateMatrixWorld(true);
    const crawling = visual.headAnchor.getWorldPosition(head).y;
    expect((visual as unknown as { locomotionAction: THREE.AnimationAction }).locomotionAction.getClip().name).toMatch(/ZombieCrawl$/);
    expect(crawling).toBeLessThan(standing * 0.5);
  });

  it('a crawler shot dead stays down on its belly instead of standing up to fall', async () => {
    const visual = new ZombieVisual('walker', await loadWalker(), 0xffffff, false);
    const head = new THREE.Vector3();
    visual.setState('walk');
    visual.setCrippled(true);
    for (let t = 0; t < 1; t += 1 / 60) visual.update(1 / 60, 0.4);
    visual.prepareDeath('knockback', 0, -1);
    visual.setState('death');
    let highest = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      visual.update(1 / 60, 0);
      visual.root.updateMatrixWorld(true);
      highest = Math.max(highest, visual.headAnchor.getWorldPosition(head).y);
    }
    expect(highest).toBeLessThan(0.9);
  });
});

describe('grenade explosions on the horde', () => {
  it('blows apart the bodies it kills at its feet and throws the others down', () => {
    const { manager, zombies } = horde({ x: 0.5, z: 0, hp: 10 }, { x: 0, z: -3, hp: 10 });
    const killed: (string | undefined)[] = [];
    manager.onZombieKilled = (_zombie, _headshot, source) => killed.push(source);
    // Facing +z, towards the centre: the blast throws it onto its back.
    zombies[1].group.rotation.y = 0;
    manager.applyExplosion(CENTRE, BLAST, 'f1', 1, () => true, () => 1);
    expect(killed).toEqual(['f1', 'f1']);
    expect(zombies[0].deathStyle).toBe('shatter');
    expect(zombies[1].deathStyle).toBe('blown');
  });

  it('cripples some survivors within reach, leaves the far ones standing and spares bodies behind walls', () => {
    const { manager, zombies } = horde(
      { x: 2, z: 0, hp: 5000 },
      { x: 5.2, z: 0, hp: 5000 },
      { x: -2, z: 0, hp: 5000 },
      { x: 0, z: 8, hp: 5000 },
    );
    const shielded = zombies[2];
    const survivors = manager.applyExplosion(CENTRE, BLAST, 'f1', 1, (zombie) => zombie !== shielded, () => 0);
    expect(survivors).toBe(2);
    expect(zombies[0].isCrippled).toBe(true);
    expect(zombies[1].isCrippled).toBe(false);
    expect(zombies[1].hp).toBeLessThan(5000);
    expect(shielded.hp).toBe(5000);
    expect(zombies[3].hp).toBe(5000);
  });

  it('leaves everyone on their feet when the injected roll misses', () => {
    const { manager, zombies } = horde({ x: 1, z: 0, hp: 5000 }, { x: 2, z: 1, hp: 5000 });
    manager.applyExplosion(CENTRE, BLAST, 'f1', 1, () => true, () => 0.99);
    expect(zombies.some((zombie) => zombie.isCrippled)).toBe(false);
  });

  it('scales its damage with perks and tuning', () => {
    const { manager, zombies } = horde({ x: 0, z: 1, hp: 5000 });
    manager.applyExplosion(CENTRE, BLAST, 'f1', 2, () => true, () => 1);
    expect(5000 - zombies[0].hp).toBeGreaterThan(BLAST.damage);
  });
});
