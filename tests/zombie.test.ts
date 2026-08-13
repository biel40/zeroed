import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Zombie } from '../src/zombies/Zombie';
import {
  ZOMBIE_ATTACK_DURATION,
  ZOMBIE_ATTACK_HIT_MOMENT,
  ZOMBIE_ATTACK_RECOVERY,
  ZOMBIE_CORPSE_LINGER,
  ZOMBIE_DEATH_FADE,
  ZOMBIE_DEATH_FALL,
  ZOMBIE_SPAWN_DURATION,
} from '../src/zombies/ZombieConfig';

const DT = 1 / 60;
const DEATH_TOTAL = ZOMBIE_DEATH_FALL + ZOMBIE_CORPSE_LINGER + ZOMBIE_DEATH_FADE;

function makeZombie(hp = 100, speed = 1.9): Zombie {
  const zombie = new Zombie();
  zombie.spawn(0, -20, hp, speed);
  return zombie;
}

function step(zombie: Zombie, seconds: number): void {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) zombie.update(DT);
}

describe('Zombie lifecycle', () => {
  it('spawns at full health in the spawn state and becomes visible', () => {
    const zombie = makeZombie(150, 2.2);
    expect(zombie.hp).toBe(150);
    expect(zombie.maxHp).toBe(150);
    expect(zombie.speed).toBe(2.2);
    expect(zombie.state).toBe('spawn');
    expect(zombie.group.visible).toBe(true);
    expect(zombie.isAlive).toBe(true);
  });

  it('rises from the ground while spawning, then walks', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION / 2);
    expect(zombie.state).toBe('spawn');
    expect(zombie.visual.root.position.y).toBeLessThan(0); // still emerging
    step(zombie, ZOMBIE_SPAWN_DURATION / 2 + 0.1);
    expect(zombie.state).toBe('walk');
    expect(zombie.visual.root.position.y).toBeCloseTo(0, 3);
  });

  it('non-lethal damage interrupts to the hit state', () => {
    const zombie = makeZombie(100);
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1); // reach walk
    expect(zombie.applyDamage(30)).toBe(false);
    expect(zombie.hp).toBe(70);
    expect(zombie.state).toBe('hit');
    expect(zombie.isAlive).toBe(true);
    step(zombie, 0.4);
    expect(zombie.state).toBe('walk');
  });

  it('non-lethal headshots stagger longer than torso hits', () => {
    const torso = makeZombie(100);
    step(torso, ZOMBIE_SPAWN_DURATION + 0.1);
    torso.applyDamage(10, false);
    step(torso, 0.35);
    expect(torso.state).toBe('walk');

    const head = makeZombie(100);
    step(head, ZOMBIE_SPAWN_DURATION + 0.1);
    head.applyDamage(10, true);
    step(head, 0.35);
    expect(head.state).toBe('hit'); // still reeling
    step(head, 0.2);
    expect(head.state).toBe('walk');
  });

  it('lethal damage switches to death and reports the kill', () => {
    const zombie = makeZombie(100);
    expect(zombie.applyDamage(100)).toBe(true);
    expect(zombie.state).toBe('death');
    expect(zombie.isAlive).toBe(false);
  });

  it('ignores damage once dead', () => {
    const zombie = makeZombie(50);
    zombie.applyDamage(50);
    expect(zombie.applyDamage(50)).toBe(false);
  });

  it('keeps the corpse visible for a while before recycling', () => {
    const zombie = makeZombie(50);
    zombie.applyDamage(50);
    step(zombie, ZOMBIE_DEATH_FALL + 0.2);
    expect(zombie.group.visible).toBe(true); // fallen, still on the field
  });

  it('finishes the death sequence hidden and notifies the pool', () => {
    const zombie = makeZombie(50);
    let finished = false;
    zombie.onDeathFinished = () => {
      finished = true;
    };
    zombie.applyDamage(50);
    step(zombie, DEATH_TOTAL + 0.2);
    expect(finished).toBe(true);
    expect(zombie.group.visible).toBe(false);
  });
});

describe('Zombie attacks', () => {
  it('attack lands at the hit moment and then walks again', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1); // walk
    let hits = 0;
    zombie.onAttackLanded = () => hits++;
    expect(zombie.tryAttack()).toBe(true);
    expect(zombie.state).toBe('attack');
    step(zombie, ZOMBIE_ATTACK_HIT_MOMENT - 0.1);
    expect(hits).toBe(0); // wind-up not finished yet
    step(zombie, 0.15);
    expect(hits).toBe(1); // the blow connects
    step(zombie, ZOMBIE_ATTACK_DURATION - ZOMBIE_ATTACK_HIT_MOMENT);
    expect(zombie.state).toBe('walk');
  });

  it('respects the attack cooldown', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1);
    expect(zombie.tryAttack()).toBe(true);
    step(zombie, ZOMBIE_ATTACK_DURATION + 0.1); // finish the lunge
    expect(zombie.state).toBe('walk');
    expect(zombie.tryAttack()).toBe(false); // still recovering
    step(zombie, ZOMBIE_ATTACK_RECOVERY);
    expect(zombie.tryAttack()).toBe(true);
  });

  it('cannot attack while dead', () => {
    const zombie = makeZombie(10);
    zombie.applyDamage(10);
    expect(zombie.tryAttack()).toBe(false);
  });
});

describe('Zombie hitboxes', () => {
  /** World-space center of a hitbox after refreshing the group matrices. */
  function worldCenter(hitbox: THREE.Object3D): THREE.Vector3 {
    return new THREE.Vector3().setFromMatrixPosition(hitbox.matrixWorld);
  }

  it('rides both hitboxes on the animated rig, not the static visual root', () => {
    const zombie = makeZombie();
    // The whole point: colliders follow the pose the player actually sees.
    expect(zombie.visual.torsoAnchor).not.toBe(zombie.visual.root);
    expect(zombie.visual.headAnchor).not.toBe(zombie.visual.root);
    expect(zombie.torsoHitbox.parent).toBe(zombie.visual.torsoAnchor);
    expect(zombie.headHitbox.parent).toBe(zombie.visual.headAnchor);
    // ...while staying under the visual root, so the spawn rise still
    // carries them with the body.
    const underRoot = (object: THREE.Object3D): boolean => {
      let current = object.parent;
      while (current) {
        if (current === zombie.visual.root) return true;
        current = current.parent;
      }
      return false;
    };
    expect(underRoot(zombie.torsoHitbox)).toBe(true);
    expect(underRoot(zombie.headHitbox)).toBe(true);
  });

  it('keeps the torso hitbox buried with the visible body during the spawn rise', () => {
    const zombie = makeZombie();
    zombie.update(DT); // rise barely started: the body is still underground
    zombie.group.updateMatrixWorld(true);
    expect(worldCenter(zombie.torsoHitbox).y).toBeLessThan(0);
  });

  it('returns the hitboxes to standing height once the rise finishes', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1);
    zombie.group.updateMatrixWorld(true);
    expect(worldCenter(zombie.torsoHitbox).y).toBeCloseTo(0.75, 3);
  });

  it('torso capsule reaches the ground so leg shots register', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1);
    zombie.group.updateMatrixWorld(true);
    const { radius, height } = (zombie.torsoHitbox.geometry as THREE.CapsuleGeometry).parameters;
    const bottom = worldCenter(zombie.torsoHitbox).y - (height / 2 + radius);
    expect(bottom).toBeLessThanOrEqual(0.05);
  });

  it('torso hitbox is slightly wider than the visible body, without being exaggerated', () => {
    const zombie = makeZombie();
    const { radius } = (zombie.torsoHitbox.geometry as THREE.CapsuleGeometry).parameters;
    expect(radius).toBeGreaterThan(0.32); // the old size was tighter than the animated envelope
    expect(radius).toBeLessThanOrEqual(0.45);
  });

  it('keeps a distinct head sphere above the torso cylinder for headshots', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1);
    zombie.group.updateMatrixWorld(true);
    const torso = (zombie.torsoHitbox.geometry as THREE.CapsuleGeometry).parameters;
    const head = (zombie.headHitbox.geometry as THREE.SphereGeometry).parameters;
    const torsoCylinderTop = worldCenter(zombie.torsoHitbox).y + torso.height / 2;
    expect(head.radius).toBeGreaterThan(0.2);
    expect(worldCenter(zombie.headHitbox).y).toBeGreaterThan(torsoCylinderTop);
  });

  it('moves the hitboxes with the rig when the animated pose changes', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1);
    zombie.group.updateMatrixWorld(true);
    const before = worldCenter(zombie.headHitbox);
    // What the mixer does every frame: drive the rig to a new pose. The
    // colliders must follow — static, root-parented hitboxes would not move.
    zombie.visual.torsoAnchor.rotation.x += 0.6;
    zombie.group.updateMatrixWorld(true);
    const after = worldCenter(zombie.headHitbox);
    expect(after.distanceTo(before)).toBeGreaterThan(0.2);
  });

  it('registers a shot at the visible head as a headshot, not a torso hit', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1);
    zombie.group.updateMatrixWorld(true);
    const head = worldCenter(zombie.headHitbox);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(head.x, head.y, head.z + 5),
      new THREE.Vector3(0, 0, -1),
    );
    const hits = raycaster.intersectObjects([zombie.torsoHitbox, zombie.headHitbox], false);
    expect(hits[0]?.object).toBe(zombie.headHitbox);
  });

  it('registers a center-mass shot as a torso hit', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1);
    zombie.group.updateMatrixWorld(true);
    const chest = worldCenter(zombie.torsoHitbox);
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(chest.x, chest.y + 0.25, chest.z + 5),
      new THREE.Vector3(0, 0, -1),
    );
    const hits = raycaster.intersectObjects([zombie.torsoHitbox, zombie.headHitbox], false);
    expect(hits[0]?.object).toBe(zombie.torsoHitbox);
  });

  it('shares hitbox geometry across pooled zombies', () => {
    const a = new Zombie();
    const b = new Zombie();
    expect(a.torsoHitbox.geometry).toBe(b.torsoHitbox.geometry);
    expect(a.headHitbox.geometry).toBe(b.headHitbox.geometry);
  });
});
