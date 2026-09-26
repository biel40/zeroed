import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRemoteAvatar, type RemoteAvatarMotion } from '../src/rendering/RemotePlayerAvatar';

const IDLE: RemoteAvatarMotion = {
  speed: 0, forwardSpeed: 0, pitch: 0, aiming: false, reloading: false,
  alive: true, life: 'alive', reviving: false,
};

describe('procedural co-op soldier', () => {
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
});
