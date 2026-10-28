import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRemoteAvatar, type RemoteAvatarMotion } from '../src/rendering/RemotePlayerAvatar';
import { ZOMBIES_WEAPON_PRELOAD } from '../src/config/weapons';

const IDLE: RemoteAvatarMotion = {
  speed: 0, forwardSpeed: 0, pitch: 0, aiming: false, reloading: false,
  alive: true, life: 'alive', reviving: false,
};

describe('procedural co-op soldier', () => {
  it('starts changing posture gently in the teammate view too', () => {
    const avatar = createRemoteAvatar(null, false);
    avatar.update(1, IDLE);
    const before = new THREE.Box3().setFromObject(avatar.group).max.y;
    avatar.update(1 / 60, { ...IDLE, stance: 'crouched' });
    const after = new THREE.Box3().setFromObject(avatar.group).max.y;
    expect(before - after).toBeGreaterThan(0);
    expect(before - after).toBeLessThan(0.02);
    avatar.dispose();
  });
  it('lowers the crouched body and lays the prone body along the floor, then stands again', () => {
    const avatar = createRemoteAvatar(null, false);
    const bounds = (): THREE.Box3 => {
      avatar.group.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(avatar.group);
    };
    avatar.update(1, IDLE);
    const standing = bounds();
    for (let i = 0; i < 90; i++) avatar.update(1 / 60, { ...IDLE, stance: 'crouched' });
    const crouched = bounds();
    expect(crouched.max.y).toBeLessThan(standing.max.y - 0.4);
    expect(crouched.min.y).toBeGreaterThan(-0.1);
    for (let i = 0; i < 90; i++) avatar.update(1 / 60, { ...IDLE, stance: 'prone', speed: 1 });
    const prone = bounds();
    expect(prone.max.y).toBeLessThan(0.8);
    expect(prone.min.y).toBeGreaterThan(-0.1);
    expect(prone.max.z - prone.min.z).toBeGreaterThan(1);
    for (let i = 0; i < 90; i++) avatar.update(1 / 60, IDLE);
    expect(bounds().max.y).toBeCloseTo(standing.max.y, 3);
    avatar.dispose();
  });
  it('keeps the pistol grip in the right hand and points the muzzle forward', () => {
    const avatar = createRemoteAvatar(null, false);
    avatar.update(1 / 30, IDLE);
    avatar.group.updateMatrixWorld(true);
    const pistol = avatar.group.getObjectByName('remote-pistol') as THREE.Group;
    const hand = avatar.group.getObjectByName('right-hand') as THREE.Mesh;
    const slide = avatar.group.getObjectByName('pistol-slide') as THREE.Mesh;
    expect(pistol).toBeDefined();
    expect(hand.getWorldPosition(new THREE.Vector3()).distanceTo(pistol.getWorldPosition(new THREE.Vector3()))).toBeLessThan(0.12);
    expect(slide.getWorldPosition(new THREE.Vector3()).z).toBeLessThan(pistol.getWorldPosition(new THREE.Vector3()).z);
    avatar.dispose();
  });

  it('moves the weapon with the aiming pitch and lowers it while reviving', () => {
    const avatar = createRemoteAvatar(null, false);
    const pistol = avatar.group.getObjectByName('remote-pistol') as THREE.Group;
    avatar.update(1 / 30, IDLE);
    const idleY = pistol.position.y;
    avatar.update(1 / 30, { ...IDLE, pitch: 0.4, aiming: true });
    expect(pistol.position.y).toBeGreaterThan(idleY);
    avatar.update(1 / 30, { ...IDLE, reviving: true });
    expect(pistol.position.y).toBeLessThan(idleY);
    avatar.dispose();
  });

  it('shows every supported weapon, reuses models on return, and falls back for invalid IDs', () => {
    const avatar = createRemoteAvatar(null, false);
    const grip = avatar.group.getObjectByName('remote-weapon-grip') as THREE.Group;
    const fallback = avatar.group.getObjectByName('remote-pistol') as THREE.Group;
    const seen = new Map<string, THREE.Object3D>();
    for (const id of [...ZOMBIES_WEAPON_PRELOAD, ...[...ZOMBIES_WEAPON_PRELOAD].reverse()]) {
      avatar.setWeapon(id);
      expect(grip.children).toHaveLength(1);
      expect(fallback.visible).toBe(false);
      const model = grip.children[0];
      expect(model.getObjectByProperty('isMesh', true)).toBeDefined();
      if (seen.has(id)) expect(model).toBe(seen.get(id));
      else seen.set(id, model);
    }
    avatar.setWeapon('unknown' as never);
    expect(grip.children).toHaveLength(0);
    expect(fallback.visible).toBe(true);
    avatar.dispose();
  });

  it('keeps the reserve weapon visible when an optional model cannot be resolved', () => {
    const avatar = createRemoteAvatar(null, false, () => { throw new Error('model unavailable'); });
    avatar.setWeapon('l96');
    expect((avatar.group.getObjectByName('remote-weapon-grip') as THREE.Group).children).toHaveLength(0);
    expect(avatar.group.getObjectByName('remote-pistol')?.visible).toBe(true);
    avatar.dispose();
  });
});
