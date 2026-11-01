import { describe, expect, it } from 'vitest';
import { HEADSHOT_POINTS } from '../src/game/CombatConfig';
import { POINTS_HIT, POINTS_KILL, POINTS_KNIFE_KILL, POINTS_REPAIR } from '../src/game/PlayerEconomy';
import { PointsGainTracker, pointsGainTier } from '../src/ui/PointsGain';

describe('PointsGainTracker', () => {
  it('takes the first balance as its baseline without reporting a gain', () => {
    const tracker = new PointsGainTracker();
    expect(tracker.observe(500)).toBe(0);
    expect(tracker.observe(510)).toBe(10);
  });

  it('reports each rise once and nothing while the balance holds', () => {
    const tracker = new PointsGainTracker();
    tracker.observe(0);
    expect(tracker.observe(50)).toBe(50);
    expect(tracker.observe(50)).toBe(0);
    expect(tracker.observe(60)).toBe(10);
  });

  it('never reports spending or a restart as a gain, and counts from the new balance', () => {
    const tracker = new PointsGainTracker();
    tracker.observe(1200);
    expect(tracker.observe(250)).toBe(0);
    expect(tracker.observe(0)).toBe(0);
    expect(tracker.observe(10)).toBe(10);
  });

  it('forgets the baseline on reset, so a new run never pops its opening balance', () => {
    const tracker = new PointsGainTracker();
    tracker.observe(100);
    tracker.reset();
    expect(tracker.observe(900)).toBe(0);
    expect(tracker.observe(950)).toBe(50);
  });
});

describe('pointsGainTier', () => {
  it('keeps hits and repairs minor, kills mid and headshots or knife kills major', () => {
    expect(pointsGainTier(POINTS_HIT)).toBe('minor');
    expect(pointsGainTier(POINTS_REPAIR)).toBe('minor');
    expect(pointsGainTier(POINTS_KILL)).toBe('kill');
    expect(pointsGainTier(POINTS_KILL + POINTS_HIT)).toBe('kill');
    expect(pointsGainTier(HEADSHOT_POINTS)).toBe('major');
    expect(pointsGainTier(POINTS_KNIFE_KILL)).toBe('major');
  });
});
