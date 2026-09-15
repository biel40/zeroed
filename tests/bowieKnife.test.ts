import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import {
  BOWIE_ATTACK_DURATION,
  BOWIE_DAMAGE,
  BOWIE_HIT_MOMENT,
  BowieKnife,
} from '../src/weapons/BowieKnife';

describe('BowieKnife', () => {
  it('builds a large Bowie silhouette and only applies contact at the visible strike', () => {
    const knife = new BowieKnife();
    const swing = vi.fn();
    const impact = vi.fn();
    knife.onSwing = swing;
    knife.onImpact = impact;
    knife.setEnabled(true);

    const blade = knife.root.getObjectByName('bowie-blade')!;
    const size = new THREE.Box3().setFromObject(blade).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(0.4);
    knife.update(BOWIE_HIT_MOMENT - 0.01, true, 0);
    expect(swing).toHaveBeenCalledTimes(1);
    expect(impact).not.toHaveBeenCalled();
    knife.update(0.01, true, 0);
    expect(impact).toHaveBeenCalledTimes(1);
    knife.update(BOWIE_ATTACK_DURATION, true, 0);
    expect(impact).toHaveBeenCalledTimes(1);
    knife.update(0, false, 0);
    knife.update(0, true, 0);
    expect(swing).toHaveBeenCalledTimes(2);
  });

  it('hides and cancels its swing when firearm ammunition becomes available', () => {
    const knife = new BowieKnife();
    const impact = vi.fn();
    knife.onImpact = impact;
    knife.setEnabled(true);
    knife.update(0.1, true, 0);
    knife.setEnabled(false);
    knife.update(BOWIE_ATTACK_DURATION, true, 0);
    expect(knife.root.visible).toBe(false);
    expect(knife.isAttacking).toBe(false);
    expect(impact).not.toHaveBeenCalled();
  });
});

describe('Zombies Bowie impact', () => {
  it('starts a dedicated Bowie attack while a firearm is still usable', () => {
    const mode = new ZombiesMode() as any;
    mode.ctx = { hasUsableWeapon: () => true };
    mode.isGameplayInputEnabled = () => true;

    mode.onMeleeAttack();

    expect(mode.bowie.isAttacking).toBe(true);
    expect(mode.usesFallbackAttack()).toBe(true);
    expect(mode.getFallbackWeaponName()).toBe('BOWIE KNIFE');
  });

  it('damages the first unobstructed zombie through the existing manager', () => {
    const mode = new ZombiesMode() as any;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 0);
    const zombie = { isAlive: true, floor: 0 };
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial());
    hitbox.position.set(0, 1.7, -1.2);
    hitbox.userData.zombie = zombie;
    const group = new THREE.Group();
    group.add(hitbox);
    const damageZombie = vi.fn(() => false);
    mode.ctx = {
      hasUsableWeapon: () => false,
      player: { camera, floor: 0 },
      hitColliders: [hitbox],
      stats: { registerHit: vi.fn() },
      hud: { showHitmarker: vi.fn() },
      audio: { playKnifeHit: vi.fn() },
      effects: { puff: vi.fn() },
    };
    mode.zombies = { group, damageZombie };

    mode.applyBowieImpact();

    expect(damageZombie).toHaveBeenCalledWith(zombie, 'torso', BOWIE_DAMAGE);
    expect(mode.ctx.audio.playKnifeHit).toHaveBeenCalledTimes(1);
  });

  it('cannot stab through arena geometry', () => {
    const mode = new ZombiesMode() as any;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 0);
    const zombie = { isAlive: true, floor: 0 };
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), new THREE.MeshBasicMaterial());
    wall.position.set(0, 1.7, -0.6);
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial());
    hitbox.position.set(0, 1.7, -1.2);
    hitbox.userData.zombie = zombie;
    const group = new THREE.Group();
    group.add(wall, hitbox);
    const damageZombie = vi.fn();
    mode.ctx = {
      hasUsableWeapon: () => false,
      player: { camera, floor: 0 },
      hitColliders: [hitbox, wall],
      stats: { registerHit: vi.fn() },
      hud: { showHitmarker: vi.fn() },
      audio: { playKnifeHit: vi.fn() },
      effects: { puff: vi.fn() },
    };
    mode.zombies = { group, damageZombie };

    mode.applyBowieImpact();

    expect(damageZombie).not.toHaveBeenCalled();
  });
});
