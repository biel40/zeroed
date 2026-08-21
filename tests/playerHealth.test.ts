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

  it('blocks all damage while invincible', () => {
    const health = new PlayerHealth(100, 0.5);
    health.setInvincible(true);

    expect(health.damage(1000)).toBe(false);
    expect(health.hp).toBe(100);
  });

  it('reset disables invincibility', () => {
    const health = new PlayerHealth(100, 0.5);
    health.setInvincible(true);
    health.reset();

    expect(health.damage(10)).toBe(true);
    expect(health.hp).toBe(90);
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

  describe('regeneration', () => {
    it('regenerates only after the delay without damage', () => {
      const health = new PlayerHealth(100, 0.5, 1, 10);
      health.damage(30); // 70 hp, invulnerable for 0.5 s
      health.update(0.5); // timer 0.5 < delay 1 → no regen yet
      expect(health.hp).toBe(70);
      health.update(0.6); // timer 1.1 ≥ 1 → regen applies
      expect(health.hp).toBeCloseTo(76, 5);
    });

    it('regenerates progressively, not instantly', () => {
      const health = new PlayerHealth(100, 0.5, 1, 10);
      health.damage(50); // 50 hp
      health.update(1.5); // past the 1 s delay → 15 hp of partial regen
      expect(health.hp).toBeGreaterThan(50);
      expect(health.hp).toBeLessThan(70);
      expect(health.hp).toBeCloseTo(65, 5);
    });

    it('restarts the delay timer every time damage lands', () => {
      const health = new PlayerHealth(100, 0.5, 1, 10);
      health.damage(30); // 70 hp
      health.update(0.8); // invuln over at 0.5, regen timer at 0.8
      health.damage(10); // lands (invuln expired) → 60 hp, timer reset
      health.update(0.9); // timer 0.9 < 1 → still no regen
      expect(health.hp).toBe(60);
      health.update(0.2); // timer 1.1 → regen resumes
      expect(health.hp).toBeCloseTo(62, 5);
    });

    it('never regenerates past maxHp', () => {
      const health = new PlayerHealth(100, 0.5, 1, 50);
      health.damage(10); // 90 hp
      health.update(0.6);
      health.update(2); // would overshoot (90 + 100) → clamped
      expect(health.hp).toBe(100);
    });

    it('does not regenerate while dead', () => {
      const health = new PlayerHealth(100, 0.5, 1, 10);
      health.damage(100);
      health.update(5);
      expect(health.hp).toBe(0);
      expect(health.isDead).toBe(true);
    });

    it('stays disabled when no regen is configured', () => {
      const health = new PlayerHealth(100, 0.5);
      health.damage(30);
      health.update(10);
      expect(health.hp).toBe(70);
    });

    it('reset clears the regen timer', () => {
      const health = new PlayerHealth(100, 0.5, 1, 10);
      health.damage(30);
      health.update(0.8);
      health.reset();
      health.damage(20); // 80 hp, fresh timer
      health.update(0.9); // 0.9 < delay → no regen
      expect(health.hp).toBe(80);
    });
  });
});
