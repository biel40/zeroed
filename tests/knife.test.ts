import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PlayerEconomy, POINTS_KNIFE_KILL } from '../src/game/PlayerEconomy';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import {
  KNIFE_ATTACK_DURATION,
  KNIFE_DAMAGE,
  KNIFE_HIT_MOMENT,
  Knife,
} from '../src/weapons/Knife';

describe('Knife', () => {
  it('uses the slower attack timing while keeping contact synchronized', () => {
    expect(KNIFE_ATTACK_DURATION).toBe(0.72);
    expect(KNIFE_HIT_MOMENT).toBe(0.39);
    expect(KNIFE_HIT_MOMENT).toBeLessThan(KNIFE_ATTACK_DURATION);
  });

  it('builds a large knife silhouette and only applies contact at the visible strike', () => {
    const knife = new Knife();
    const swing = vi.fn();
    const impact = vi.fn();
    knife.onSwing = swing;
    knife.onImpact = impact;
    knife.setEnabled(true);

    const blade = knife.root.getObjectByName('knife-blade')!;
    const size = new THREE.Box3().setFromObject(blade).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(0.4);
    knife.update(KNIFE_HIT_MOMENT - 0.01, true, 0);
    expect(swing).toHaveBeenCalledTimes(1);
    expect(impact).not.toHaveBeenCalled();
    knife.update(0.01, true, 0);
    expect(impact).toHaveBeenCalledTimes(1);
    knife.update(KNIFE_ATTACK_DURATION, true, 0);
    expect(impact).toHaveBeenCalledTimes(1);
    knife.update(0, false, 0);
    knife.update(0, true, 0);
    expect(swing).toHaveBeenCalledTimes(2);
  });

  it('hides and cancels its swing when firearm ammunition becomes available', () => {
    const knife = new Knife();
    const impact = vi.fn();
    knife.onImpact = impact;
    knife.setEnabled(true);
    knife.update(0.1, true, 0);
    knife.setEnabled(false);
    knife.update(KNIFE_ATTACK_DURATION, true, 0);
    expect(knife.root.visible).toBe(false);
    expect(knife.isAttacking).toBe(false);
    expect(impact).not.toHaveBeenCalled();
  });

  it('fully clears the view even when reset interrupts an active stab', () => {
    const knife = new Knife();
    knife.setEnabled(true);
    knife.trigger();

    knife.reset();

    expect(knife.enabled).toBe(false);
    expect(knife.root.visible).toBe(false);
    expect(knife.isAttacking).toBe(false);
  });

  it('thrusts forward into contact and returns exactly to its resting pose', () => {
    const knife = new Knife();
    knife.setEnabled(true);
    const restPosition = knife.root.position.clone();
    const restQuaternion = knife.root.quaternion.clone();
    knife.trigger();

    knife.update(KNIFE_HIT_MOMENT, false, 0);
    expect(knife.root.position.z).toBeLessThan(restPosition.z - 0.2);

    knife.update(KNIFE_ATTACK_DURATION, false, 0);
    expect(knife.root.position.distanceTo(restPosition)).toBeLessThan(1e-6);
    expect(1 - Math.abs(knife.root.quaternion.dot(restQuaternion))).toBeLessThan(1e-6);
  });
});

describe('Zombies knife lifecycle', () => {
  it('clears an interrupted knife view when gameplay ends', () => {
    const mode = new ZombiesMode() as any;
    mode.knife.setEnabled(true);
    mode.knife.trigger();
    mode.runFlow.beginEnding();
    mode.arena = { update: vi.fn() };
    mode.ctx = { hud: { showCredits: vi.fn() } };

    mode.update(0.016);

    expect(mode.knife.enabled).toBe(false);
    expect(mode.knife.root.visible).toBe(false);
    expect(mode.knife.isAttacking).toBe(false);
  });
});

describe('Zombies knife impact', () => {
  it('starts a dedicated knife attack while a firearm is still usable', () => {
    const mode = new ZombiesMode() as any;
    mode.ctx = { hasUsableWeapon: () => true };
    mode.isGameplayInputEnabled = () => true;

    mode.onMeleeAttack();

    expect(mode.knife.isAttacking).toBe(true);
    expect(mode.usesFallbackAttack()).toBe(true);
    expect(mode.getFallbackWeaponName()).toBe('KNIFE');
  });

  it('tags an unobstructed knife kill and awards its exclusive 200 points', () => {
    const mode = new ZombiesMode() as any;
    const economy = new PlayerEconomy();
    mode.economy = economy;
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.7, 0);
    const zombie = { isAlive: true, floor: 0 };
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial());
    hitbox.position.set(0, 1.7, -1.2);
    hitbox.userData.zombie = zombie;
    const group = new THREE.Group();
    group.add(hitbox);
    const damageZombie = vi.fn((_zombie, _part, _damage, source) => {
      mode.onZombieKilled(false, undefined, undefined, source);
      return true;
    });
    mode.ctx = {
      hasUsableWeapon: () => false,
      player: { camera, floor: 0 },
      hitColliders: [hitbox],
      stats: { registerHit: vi.fn() },
      hud: { showHitmarker: vi.fn() },
      audio: { playKnifeHit: vi.fn(), playZombieDeath: vi.fn() },
      effects: { puff: vi.fn() },
    };
    mode.zombies = { group, damageZombie };

    mode.applyKnifeImpact();

    expect(damageZombie).toHaveBeenCalledWith(zombie, 'torso', KNIFE_DAMAGE, 'knife');
    expect(mode.ctx.audio.playKnifeHit).toHaveBeenCalledTimes(1);
    expect(economy.points).toBe(POINTS_KNIFE_KILL);
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

    mode.applyKnifeImpact();

    expect(damageZombie).not.toHaveBeenCalled();
  });
});
