import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { selectWindConeTargets, selectWindGustTargets, type WindGustHit } from '../src/zombies/WindGust';

const CONFIG = { burstRadius: 3, maxTargets: 4, edgePush: 0.4 };
const IMPACT = { x: 0, y: 1, z: -10 };
/** The shooter stands ten metres south of the impact, looking north (-z). */
const SHOOTER = { x: 0, z: 0 };

interface Body {
  readonly name: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

const body = (name: string, x: number, z: number, y = 0): Body => ({ name, position: { x, y, z } });

function select(bodies: readonly Body[], config = CONFIG): WindGustHit<Body>[] {
  return selectWindGustTargets(IMPACT, SHOOTER, bodies, config, []);
}

describe('Wind burst targets', () => {
  it('takes every body inside the burst, nearest first, and none beyond it or on another level', () => {
    const hits = select([
      body('far', 0, -13.5),
      body('edge', 2.5, -10),
      body('struck', 0, -10.2),
      body('mid', 0, -11.4),
      body('below', 0, -10, -6),
    ]);
    expect(hits.map((hit) => hit.target.name)).toEqual(['struck', 'mid', 'edge']);
  });

  it('stops at the burst\'s own cap', () => {
    const crowd = Array.from({ length: 8 }, (_, index) => body(`z${index}`, (index - 4) * 0.4, -10));
    const hits = select(crowd);
    expect(hits).toHaveLength(CONFIG.maxTargets);
    for (let index = 1; index < hits.length; index++) expect(hits[index].distance).toBeGreaterThanOrEqual(hits[index - 1].distance);
  });

  it('drives every body straight away from the shooter, never back towards them', () => {
    const hits = select([body('ahead', 0, -11), body('between', 1, -8.5), body('flank', 2, -10)]);
    for (const hit of hits) {
      const { x, z } = hit.target.position;
      const away = { x: x - SHOOTER.x, z: z - SHOOTER.z };
      const length = Math.hypot(away.x, away.z);
      expect(Math.hypot(hit.dirX, hit.dirZ)).toBeCloseTo(1, 6);
      expect((hit.dirX * away.x + hit.dirZ * away.z) / length).toBeCloseTo(1, 6);
    }
  });

  it('pushes hardest at the impact and keeps a share of it out to the edge', () => {
    const [center, edge] = select([body('center', 0, -10), body('edge', 2.99, -10)]);
    expect(center.share).toBeCloseTo(1, 6);
    expect(edge.share).toBeGreaterThanOrEqual(CONFIG.edgePush);
    expect(edge.share).toBeLessThan(CONFIG.edgePush + 0.01);
  });

  it('falls back to the shot line for a body on top of the shooter', () => {
    const hits = selectWindGustTargets({ x: 0, y: 1, z: -0.5 }, SHOOTER, [body('hugging', 0, 0)], CONFIG, []);
    expect(hits).toHaveLength(1);
    expect(hits[0].dirX).toBeCloseTo(0, 6);
    expect(hits[0].dirZ).toBeCloseTo(-1, 6);
  });

  it('reuses the output array', () => {
    const out: WindGustHit<Body>[] = [];
    selectWindGustTargets(IMPACT, SHOOTER, [body('a', 0, -10)], CONFIG, out);
    const again = selectWindGustTargets(IMPACT, SHOOTER, [], CONFIG, out);
    expect(again).toBe(out);
    expect(again).toHaveLength(0);
  });

  it('is tuned on EXHALIS as crowd control: a wide burst, a long shove, moderate damage', () => {
    const wind = WEAPON_DEFINITIONS.exhalis.wind!;
    expect(wind.burstRadius).toBeGreaterThanOrEqual(2.5);
    expect(wind.pushDistance).toBeGreaterThanOrEqual(3);
    expect(wind.burstDamage).toBeLessThan(WEAPON_DEFINITIONS.exhalis.damage);
    expect(wind.edgePush).toBeGreaterThan(0);
    expect(wind.edgePush).toBeLessThan(1);
  });
});

describe('Full-draw gust down the shot line', () => {
  const GUST = { length: 6, halfAngle: 0.35, maxTargets: 3, pushDistance: 4, edgePush: 0.5 };
  /** The burst covers three metres round the impact; the gust starts where it ends, heading north (-z). */
  const START = 3;

  function cone(bodies: readonly Body[], gust = GUST): WindGustHit<Body>[] {
    return selectWindConeTargets(IMPACT, 0, -1, START, bodies, gust, []);
  }

  it('takes the bodies behind the burst inside the cone, nearest first, and none in front, aside, beyond or on another level', () => {
    const hits = cone([
      body('far-behind', 0, -16),
      body('behind', 0.4, -14),
      body('just-behind', 0, -13.2),
      body('inside-burst', 0, -11.5),
      body('in-front', 0, -6),
      body('aside', 3, -14),
      body('beyond', 0, -19.5),
      body('below', 0, -14, -6),
    ]);
    expect(hits.map((hit) => hit.target.name)).toEqual(['just-behind', 'behind', 'far-behind']);
  });

  it('drives every body down the shot line, harder near the burst', () => {
    const [near, far] = cone([body('near', 0, -13.1), body('far', 0.3, -18.9)]);
    for (const hit of [near, far]) {
      expect(hit.dirX).toBeCloseTo(0, 6);
      expect(hit.dirZ).toBeCloseTo(-1, 6);
    }
    expect(near.share).toBeGreaterThan(far.share);
    expect(near.share).toBeLessThanOrEqual(1);
    expect(far.share).toBeGreaterThanOrEqual(GUST.edgePush);
  });

  it('stops at its own cap', () => {
    const queue = Array.from({ length: 6 }, (_, index) => body(`q${index}`, 0, -13.5 - index * 0.8));
    expect(cone(queue)).toHaveLength(GUST.maxTargets);
  });

  it('is set on the full EXHALIS draw only, reaching past its burst', () => {
    const gust = WEAPON_DEFINITIONS.exhalis.wind!.charged.gust!;
    expect(gust.length).toBeGreaterThan(0);
    expect(gust.halfAngle).toBeLessThan(Math.PI / 4);
    expect(gust.pushDistance).toBeGreaterThan(0);
  });
});
