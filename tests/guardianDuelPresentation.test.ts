import { describe, expect, it } from 'vitest';
import { CAPTAIN_USSR, type CaptainUssrField } from '../src/zombies/guardians/CaptainUssrBrain';
import { CaptainUssrTelegraphs, type CaptainUssrTelegraphSnapshot } from '../src/zombies/guardians/CaptainUssrTelegraphs';
import { GUARDIAN_DISCHARGES, GuardianDuelDischarges } from '../src/zombies/guardians/GuardianDuelDischarges';

const FIELD: CaptainUssrField = {
  bounds: { minX: 0, maxX: 30, minZ: 0, maxZ: 30 },
  obstacles: [],
  landing: { x: 15, z: 15 },
};
const GROUND = 2;
const DT = 0.05;

/** A fixed-seed generator: the same discharges every run. */
function seeded(seed = 11): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** Discharge strengths and the seconds each came at, over `seconds` in `phase`. */
function discharges(phase: 0 | 1 | 2 | 3, seconds: number): { strength: number; time: number; x: number; z: number }[] {
  const field = new GuardianDuelDischarges(FIELD, GROUND, seeded(), true);
  const out: { strength: number; time: number; x: number; z: number }[] = [];
  for (let frame = 0; frame < Math.round(seconds / DT); frame++) {
    field.update(DT, phase);
    if (field.cue.strength > 0) out.push({ strength: field.cue.strength, time: frame * DT, x: field.cue.at.x, z: field.cue.at.z });
  }
  return out;
}

describe('Guardian duel discharges', () => {
  it('stay quiet until Containment Protocol', () => {
    expect(discharges(0, 30)).toEqual([]);
    expect(discharges(1, 30)).toEqual([]);
  });

  it('throw sparks in Containment Protocol and bolts in LAST ORDER, at their pace', () => {
    for (const phase of [2, 3] as const) {
      const strikes = discharges(phase, 60);
      const [shortest, longest] = GUARDIAN_DISCHARGES.every[phase];
      expect(strikes.length).toBeGreaterThanOrEqual(Math.floor(60 / longest) - 1);
      expect(strikes.length).toBeLessThanOrEqual(Math.ceil(60 / shortest));
      expect(new Set(strikes.map((strike) => strike.strength))).toEqual(new Set([phase === 3 ? 1 : 0.45]));
    }
  });

  it('strike along the field edges, never in its middle', () => {
    const { inset } = GUARDIAN_DISCHARGES;
    for (const { x, z } of discharges(3, 120)) {
      const edge = Math.min(x - FIELD.bounds.minX, FIELD.bounds.maxX - x, z - FIELD.bounds.minZ, FIELD.bounds.maxZ - z);
      expect(edge).toBeCloseTo(inset, 6);
    }
  });
});

describe('Captain USSR telegraphs', () => {
  const boss = (overrides: Partial<CaptainUssrTelegraphSnapshot> = {}): CaptainUssrTelegraphSnapshot => ({
    state: 'stalking', stateProgress: 0, position: { x: 15, z: 15 }, heading: 0, shockwave: { x: 0, z: 0, radius: -1 }, ...overrides,
  });
  const visibleMarks = (telegraphs: CaptainUssrTelegraphs): number => telegraphs.group.children.filter((mark) => mark.visible).length;

  it('marks nothing on the ground while it stalks', () => {
    const telegraphs = new CaptainUssrTelegraphs(CAPTAIN_USSR);
    telegraphs.update(DT, boss(), GROUND);
    expect(visibleMarks(telegraphs)).toBe(0);
  });

  it('lights the slam cone ahead of it through the windup and flashes it briefly as it lands', () => {
    const telegraphs = new CaptainUssrTelegraphs(CAPTAIN_USSR);
    telegraphs.update(DT, boss({ state: 'slamWindup', stateProgress: 0.5, heading: Math.PI / 2 }), GROUND);
    const [cone] = telegraphs.group.children;
    expect(cone.visible).toBe(true);
    expect(cone.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(cone.position.y).toBeGreaterThan(GROUND);
    telegraphs.update(DT, boss({ state: 'recovering' }), GROUND);
    expect(cone.visible).toBe(true);
    for (let frame = 0; frame < 10; frame++) telegraphs.update(DT, boss({ state: 'recovering' }), GROUND);
    expect(cone.visible).toBe(false);
  });

  it('draws the shockwave reach through its windup, then rolls the front out with the wave', () => {
    const telegraphs = new CaptainUssrTelegraphs(CAPTAIN_USSR);
    const [, reach, front] = telegraphs.group.children;
    telegraphs.update(DT, boss({ state: 'shockwaveWindup', stateProgress: 0.6 }), GROUND);
    expect(reach.visible).toBe(true);
    telegraphs.update(DT, boss({ state: 'recovering', shockwave: { x: 15, z: 15, radius: 4 } }), GROUND);
    expect(reach.visible).toBe(false);
    expect(front.visible).toBe(true);
    expect(front.scale.x).toBeCloseTo(4);
    telegraphs.update(DT, boss({ state: 'recovering' }), GROUND);
    expect(front.visible).toBe(false);
  });
});
