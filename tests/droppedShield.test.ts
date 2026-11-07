import { describe, expect, it } from 'vitest';
import { DroppedShield } from '../src/zombies/guardians/DroppedShield';

const DT = 1 / 60;
const RADIUS = 0.44;
const THICKNESS = 0.08;
const GROUND = 3;

function dropped(): DroppedShield {
  const shield = new DroppedShield(RADIUS, THICKNESS);
  shield.drop({ x: 1, y: GROUND + 1.2, z: 2 }, { x: 1.1, y: 0.6, z: 0.4 }, Math.PI / 2 - 0.12, 0.7);
  return shield;
}

/** Height of its lowest rim point over the ground. */
function clearance(shield: DroppedShield): number {
  return shield.position.y - RADIUS * Math.sin(shield.tilt) - (THICKNESS / 2) * Math.abs(Math.cos(shield.tilt)) - GROUND;
}

describe('Captain USSR dropped shield', () => {
  it('falls under its weight and never sinks into the ground', () => {
    const shield = dropped();
    let lowest = Infinity;
    let fell = false;
    for (let frame = 0; frame < 6 / DT; frame++) {
      const before = shield.position.y;
      shield.update(DT, GROUND);
      if (shield.position.y < before) fell = true;
      lowest = Math.min(lowest, clearance(shield));
    }
    expect(fell).toBe(true);
    expect(lowest).toBeGreaterThan(-1e-6);
  });

  it('rings out on the ground, ever weaker, and comes to rest lying flat, face up', () => {
    const shield = dropped();
    const impacts: number[] = [];
    let seconds = 0;
    while (!shield.resting && seconds < 10) {
      shield.update(DT, GROUND);
      if (shield.impact > 0) impacts.push(shield.impact);
      seconds += DT;
    }
    expect(shield.resting).toBe(true);
    expect(seconds).toBeLessThan(7);
    expect(impacts.length).toBeGreaterThan(0);
    expect(impacts[0]).toBe(Math.max(...impacts));
    expect(shield.tilt).toBe(0);
    expect(shield.position.y).toBeCloseTo(GROUND + THICKNESS / 2, 6);
    // At rest it no longer moves, slides or rings.
    const { x, z } = shield.position;
    shield.update(1, GROUND);
    expect(shield.impact).toBe(0);
    expect(shield.position.x).toBe(x);
    expect(shield.position.z).toBe(z);
  });

  it('wobbles faster and faster as it settles, like a spun coin', () => {
    const shield = dropped();
    const headings: number[] = [];
    while (!shield.resting) {
      const before = shield.heading;
      shield.update(DT, GROUND);
      if (shield.tilt > 0 && shield.tilt < 0.2) headings.push(shield.heading - before);
    }
    expect(headings.length).toBeGreaterThan(10);
    expect(headings.at(-1)!).toBeGreaterThan(headings[0]);
  });

  it('can be picked up again: a new drop starts afresh', () => {
    const shield = dropped();
    for (let frame = 0; frame < 8 / DT; frame++) shield.update(DT, GROUND);
    expect(shield.resting).toBe(true);
    shield.drop({ x: 0, y: GROUND + 2, z: 0 }, { x: 0, y: 0, z: 0 }, Math.PI / 2 - 0.1, 0);
    expect(shield.resting).toBe(false);
    shield.update(DT, GROUND);
    expect(shield.position.y).toBeLessThan(GROUND + 2);
  });
});
