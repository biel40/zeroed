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

  it('plays the hurt cue from the side the attacker struck from', () => {
    const mode = new ZombiesMode() as unknown as DamageFeedbackInternals;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 0);
    camera.updateMatrixWorld(true);
    const playPlayerHurt = vi.fn();
    mode.ctx = { player: { camera }, hud: { flashDamage: vi.fn() }, audio: { playPlayerHurt } };

    (mode as unknown as { onPlayerHit(damage: number, from: { x: number; y: number; z: number }): void })
      .onPlayerHit(10, { x: 1, y: 1.7, z: 0 });

    expect(playPlayerHurt.mock.calls[0][0].pan).toBeCloseTo(1);
  });

  it('draws each ambient moan from a living zombie and stays silent with none', () => {
    const mode = new ZombiesMode() as unknown as {
      ctx: unknown;
      zombies: { actives: Set<{ isAlive: boolean; position: THREE.Vector3 }> };
      moanTimer: number;
      updateAmbience(dt: number): void;
    };
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 0);
    camera.updateMatrixWorld(true);
    const playDistantMoan = vi.fn();
    mode.ctx = { player: { camera }, audio: { playDistantMoan } };
    mode.zombies = { actives: new Set([{ isAlive: false, position: new THREE.Vector3(5, 0, 0) }]) };

    mode.moanTimer = 0;
    mode.updateAmbience(0.1);
    expect(playDistantMoan).not.toHaveBeenCalled();

    mode.zombies.actives.add({ isAlive: true, position: new THREE.Vector3(-6, 0, 0) });
    mode.moanTimer = 0;
    mode.updateAmbience(0.1);
    expect(playDistantMoan).toHaveBeenCalledOnce();
    expect(playDistantMoan.mock.calls[0][0].pan).toBeCloseTo(-1);
  });

  it('keeps the overlay container visible so its animated red vignette can render', () => {
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const baseRule = css.match(/#damage-overlay\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(baseRule).not.toMatch(/opacity:\s*0/);
    expect(css).toMatch(/#damage-overlay::before\s*\{/);
    expect(css).toMatch(/#damage-overlay\.active::after\s*\{/);
  });
});