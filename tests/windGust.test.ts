import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { selectWindGustTargets, type WindGustHit } from '../src/zombies/WindGust';

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
