import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ZombiesMode } from '../src/modes/ZombiesMode';

interface DamageFeedbackInternals {
  ctx: {
    player: { camera: THREE.PerspectiveCamera };
    hud: { flashDamage: () => void };
    audio: { playPlayerHurt: () => void };
  };
  trauma: number;
  onPlayerHit(damage: number): void;
  updateCameraShake(dt: number): void;
}

describe('player damage feedback', () => {
  it('adds a noticeable but restrained camera impulse when damage lands', () => {
    const mode = new ZombiesMode() as unknown as DamageFeedbackInternals;
    const camera = new THREE.PerspectiveCamera();
    const flashDamage = vi.fn();
    const playPlayerHurt = vi.fn();
    mode.ctx = { player: { camera }, hud: { flashDamage }, audio: { playPlayerHurt } };

    mode.onPlayerHit(25);
    const traumaBeforeUpdate = mode.trauma;
    mode.updateCameraShake(1 / 60);

    const angularImpulse = Math.hypot(camera.rotation.x, camera.rotation.y, camera.rotation.z);
    expect(flashDamage).toHaveBeenCalledOnce();
    expect(playPlayerHurt).toHaveBeenCalledOnce();
    expect(traumaBeforeUpdate).toBeGreaterThan(0);
    expect(mode.trauma).toBeLessThan(traumaBeforeUpdate);
    expect(angularImpulse).toBeGreaterThan(0.008);
    expect(angularImpulse).toBeLessThan(0.03);
  });

  it('keeps the overlay container visible so its animated red vignette can render', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const baseRule = css.match(/#damage-overlay\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(baseRule).not.toMatch(/opacity:\s*0/);
    expect(css).toMatch(/#damage-overlay::before\s*\{/);
    expect(css).toMatch(/#damage-overlay\.active::after\s*\{/);
  });
});