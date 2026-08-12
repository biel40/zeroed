import { describe, expect, it } from 'vitest';
import { PlayerHealth } from '../src/game/PlayerHealth';

describe('PlayerHealth', () => {
  it('starts at full HP', () => {
    const health = new PlayerHealth(100, 0.5);
    expect(health.hp).toBe(100);
    expect(health.isDead).toBe(false);
  });

  it('applies damage and reports the hit', () => {
    const health = new PlayerHealth(100, 0.5);
    expect(health.damage(30)).toBe(true);
    expect(health.hp).toBe(70);
  });

  it('blocks damage during the invulnerability window', () => {
    const health = new PlayerHealth(100, 0.5);
    health.damage(30);
    expect(health.isInvulnerable).toBe(true);
    expect(health.damage(30)).toBe(false);
    expect(health.hp).toBe(70);
  });

  it('allows damage again after the window expires', () => {
    const health = new PlayerHealth(100, 0.5);
    health.damage(30);
    health.update(0.6);
    expect(health.isInvulnerable).toBe(false);
    expect(health.damage(30)).toBe(true);
    expect(health.hp).toBe(40);
  });

  it('dies at zero HP and ignores further damage', () => {
    const health = new PlayerHealth(100, 0.5);
    health.damage(100);
    expect(health.hp).toBe(0);
    expect(health.isDead).toBe(true);
    health.update(1);
    expect(health.damage(10)).toBe(false);
    expect(health.hp).toBe(0);
  });

  it('never drops below zero', () => {
    const health = new PlayerHealth(100, 0.5);
    health.damage(150);
    expect(health.hp).toBe(0);
  });

  it('resets for a restart', () => {
    const health = new PlayerHealth(100, 0.5);
    health.damage(100);
    expect(health.isDead).toBe(true);
    health.reset();
    expect(health.hp).toBe(100);
    expect(health.isDead).toBe(false);
    expect(health.isInvulnerable).toBe(false);
  });
});
