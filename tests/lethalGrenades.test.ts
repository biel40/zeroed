import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GRENADE_DEFINITIONS, LETHAL_GRENADE_LOADOUT, STARTING_LETHAL_GRENADE } from '../src/config/grenades';
import { LethalGrenadeStock } from '../src/game/LethalGrenadeStock';
import { GibWallFrame } from '../src/zombies/GibWalls';
import { blastDamageAt, blastTrauma, resolveBlastOutcome, selfBlastDamage } from '../src/zombies/grenades/GrenadeBlast';
import { GrenadeFlight } from '../src/zombies/grenades/GrenadeFlight';

const F1 = GRENADE_DEFINITIONS.f1;

/** A world-space wall set built from boxes, as the mode captures it from the map. */
function obstacles(...boxes: THREE.Box3[]): GibWallFrame {
  const frame = new GibWallFrame();
  const origin = new THREE.Object3D();
  origin.updateMatrixWorld(true);
  frame.capture({ boxes }, origin, new THREE.Vector3());
  return frame;
}

function launch(walls: GibWallFrame, aim = new THREE.Vector3(0, 0, 1)): GrenadeFlight {
  const flight = new GrenadeFlight();
  const eye = new THREE.Vector3(0, 1.6, 0);
  flight.launch(F1.flight, eye, eye.clone().addScaledVector(aim, 0.4), aim.normalize(), F1.fuseSeconds, 0, walls);
  return flight;
}

describe('lethal grenade stock', () => {
  it('starts with two, gains two per round and never carries more than four', () => {
    const stock = new LethalGrenadeStock(LETHAL_GRENADE_LOADOUT);
    expect(stock.count).toBe(2);
    stock.grantRound();
    expect(stock.count).toBe(4);
    stock.grantRound();
    expect(stock.count).toBe(4);
    expect(stock.isFull).toBe(true);
  });

  it('spends one per throw and refuses to throw an empty pouch', () => {
    const stock = new LethalGrenadeStock(LETHAL_GRENADE_LOADOUT);
    expect(stock.consume()).toBe(true);
    expect(stock.consume()).toBe(true);
    expect(stock.consume()).toBe(false);
    expect(stock.count).toBe(0);
  });

  it('refills to the cap only when not already full, and resets to the start', () => {
    const stock = new LethalGrenadeStock(LETHAL_GRENADE_LOADOUT);
    stock.consume();
    expect(stock.refill()).toBe(true);
    expect(stock.count).toBe(4);
    expect(stock.refill()).toBe(false);
    stock.reset();
    expect(stock.count).toBe(2);
  });

  it('the run starts with the Soviet F-1', () => {
    expect(STARTING_LETHAL_GRENADE).toBe('f1');
    expect(F1.audio.explosionSampleFile).toMatch(/\.mp3$/);
  });
});

describe('grenade blast', () => {
  const blast = F1.blast;

  it('falls off linearly from the centre to the edge share and stops at the radius', () => {
    expect(blastDamageAt(blast, 0)).toBe(blast.damage);
    expect(blastDamageAt(blast, blast.radius * 0.999)).toBeCloseTo(blast.damage * blast.edgeDamageShare, 0);
    expect(blastDamageAt(blast, blast.radius)).toBe(0);
    expect(blastDamageAt(blast, 2)).toBeGreaterThan(blastDamageAt(blast, 3));
  });

  it('hurts the thrower less the further away, and not at all from its own radius', () => {
    expect(selfBlastDamage(blast, 0)).toBeGreaterThan(10_000);
    expect(selfBlastDamage(blast, blast.selfLethalRadius)).toBeGreaterThan(10_000);
    expect(selfBlastDamage(blast, blast.selfLethalRadius + 0.01)).toBeLessThan(blast.selfDamage);
    expect(selfBlastDamage(blast, blast.selfRadius)).toBe(0);
    expect(blastTrauma(blast, 0)).toBe(blast.shake);
    expect(blastTrauma(blast, blast.shakeRadius)).toBe(0);
  });

  it('blows apart only bodies it kills inside the gib radius', () => {
    const near = resolveBlastOutcome(blast, 0.5, 1, 100, true, () => 0);
    expect(near).toMatchObject({ gib: true, cripple: false });
    const farKill = resolveBlastOutcome(blast, 3, 1, 50, true, () => 0);
    expect(farKill.gib).toBe(false);
  });

  it('cripples some survivors inside the cripple radius, by an injected roll', () => {
    const hp = 5000;
    expect(resolveBlastOutcome(blast, 2, 1, hp, true, () => blast.crippleChance - 0.01).cripple).toBe(true);
    expect(resolveBlastOutcome(blast, 2, 1, hp, true, () => blast.crippleChance + 0.01).cripple).toBe(false);
    expect(resolveBlastOutcome(blast, blast.crippleRadius + 0.2, 1, hp, true, () => 0).cripple).toBe(false);
    expect(resolveBlastOutcome(blast, 2, 1, hp, false, () => 0).cripple).toBe(false);
  });

  it('only rolls for survivors in reach, so the roll sequence stays deterministic', () => {
    let draws = 0;
    const rng = (): number => { draws++; return 0.9; };
    resolveBlastOutcome(blast, 1, 1, 10, true, rng);
    resolveBlastOutcome(blast, blast.radius + 1, 1, 5000, true, rng);
    resolveBlastOutcome(blast, 2, 1, 5000, false, rng);
    expect(draws).toBe(0);
    resolveBlastOutcome(blast, 2, 1, 5000, true, rng);
    expect(draws).toBe(1);
  });
});

describe('grenade flight', () => {
  it('arcs above the aim, falls and comes to rest on the floor while the fuse burns', () => {
    const flight = launch(obstacles());
    expect(flight.velocity.y).toBeGreaterThan(0);
    let landed = 0;
    let time = 0;
    while (!flight.isResting && time < 10) {
      if (flight.step(1 / 60, obstacles()) > 0) landed++;
      time += 1 / 60;
    }
    expect(flight.isResting).toBe(true);
    expect(landed).toBeGreaterThan(0);
    expect(flight.position.y).toBeCloseTo(F1.flight.radius, 5);
    expect(flight.position.z).toBeGreaterThan(5);
    expect(flight.fuse).toBeCloseTo(Math.max(0, F1.fuseSeconds - time), 9);
  });

  it('bounces back off a wall instead of passing through it', () => {
    const wall = new THREE.Box3(new THREE.Vector3(-5, 0, 3), new THREE.Vector3(5, 3, 3.2));
    const walls = obstacles(wall);
    const flight = launch(walls);
    let hitWall = false;
    for (let frame = 0; frame < 240; frame++) {
      flight.step(1 / 60, walls);
      expect(flight.position.z).toBeLessThan(3);
      if (flight.velocity.z < 0) hitWall = true;
    }
    expect(hitWall).toBe(true);
  });

  it('a throw against a wall starts at its face, never inside it', () => {
    const wall = new THREE.Box3(new THREE.Vector3(-5, 0, 0.2), new THREE.Vector3(5, 3, 0.5));
    const flight = launch(obstacles(wall));
    expect(flight.position.z).toBeLessThanOrEqual(0.2);
  });

  it('lands on top of furniture and rests there', () => {
    const table = new THREE.Box3(new THREE.Vector3(-2, 0, 3), new THREE.Vector3(2, 0.8, 8));
    const walls = obstacles(table);
    const flight = new GrenadeFlight();
    const eye = new THREE.Vector3(0, 1.6, 4);
    flight.launch(F1.flight, eye, eye, new THREE.Vector3(0, -1, 0.05).normalize(), F1.fuseSeconds, 0, walls);
    for (let frame = 0; frame < 600 && !flight.isResting; frame++) flight.step(1 / 60, walls);
    expect(flight.isResting).toBe(true);
    expect(flight.position.y).toBeCloseTo(0.8 + F1.flight.radius, 5);
  });
});
