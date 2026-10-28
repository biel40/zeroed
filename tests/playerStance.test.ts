import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerController, EYE_HEIGHT } from '../src/player/PlayerController';
import { InputState } from '../src/player/InputState';
import type { Input } from '../src/player/Input';
import { Weapon } from '../src/weapons/Weapon';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { applyMobileAction } from '../src/player/MobileInput';
import { isPlayerNetState } from '../src/network/Protocol';

const DT = 1 / 60;
function setup(): { player: PlayerController; input: InputState; tick: (frames?: number, allowed?: boolean) => void } {
  const player = new PlayerController(1);
  const input = new InputState();
  const weapon = new Weapon(WEAPON_DEFINITIONS.m1911);
  const tick = (frames = 1, allowed = true): void => {
    for (let i = 0; i < frames; i++) {
      player.update(DT, input as unknown as Input, weapon, allowed);
      input.endFrame();
    }
  };
  return { player, input, tick };
}

describe('shared player stances', () => {
  it('toggles crouch/prone with a stable floor anchor and smooth eye height', () => {
    const { player, input, tick } = setup();
    input.setKey('KeyC', true);
    tick();
    expect(player.stance).toBe('crouched');
    expect(player.camera.position.y).toBeLessThan(0);
    expect(player.camera.position.y).toBeGreaterThan(-0.6);
    tick(90);
    expect(player.camera.position.y + EYE_HEIGHT).toBeCloseTo(1.1, 3);
    input.setKey('KeyZ', true);
    tick(90);
    expect(player.stance).toBe('prone');
    expect(player.camera.position.y + EYE_HEIGHT).toBeCloseTo(0.45, 3);
    expect(player.rig.position.y).toBe(EYE_HEIGHT);
    input.setKey('KeyZ', false);
    input.setKey('KeyZ', true);
    tick();
    expect(player.stance).toBe('standing');
  });

  it('reduces walking speed in both low postures', () => {
    const distances = ['', 'KeyC', 'KeyZ'].map((key) => {
      const { player, input, tick } = setup();
      if (key) input.setKey(key, true);
      input.setKey('KeyW', true);
      tick(60);
      return 4 - player.rig.position.z;
    });
    expect(distances[1]).toBeCloseTo(distances[0] * 0.55, 4);
    expect(distances[2]).toBeCloseTo(distances[0] * 0.25, 4);
  });

  it('crawls under low geometry and refuses to stand or crouch into it', () => {
    const { player, input, tick } = setup();
    player.setWallColliders([new THREE.Box3(new THREE.Vector3(-2, 0.8, -2), new THREE.Vector3(2, 2, 2))]);
    input.setKey('KeyZ', true);
    input.setKey('KeyW', true);
    tick(180);
    expect(player.rig.position.z).toBeLessThan(2);
    input.setKey('KeyC', true);
    tick();
    expect(player.stance).toBe('prone');
    input.setKey('Space', true);
    tick();
    expect(player.stance).toBe('prone');
    expect(player.rig.position.y).toBe(EYE_HEIGHT);
    player.setWallColliders([]);
    input.setKey('Space', false);
    input.setKey('Space', true);
    tick();
    expect(player.stance).toBe('standing');
    expect(player.rig.position.y).toBe(EYE_HEIGHT);
  });

  it('ignores posture changes in the air, while movement is blocked, and while downed', () => {
    const { player, input, tick } = setup();
    input.setKey('Space', true);
    tick();
    input.setKey('KeyZ', true);
    tick();
    expect(player.stance).toBe('standing');
    tick(120);
    input.setKey('KeyC', true);
    tick(1, false);
    expect(player.stance).toBe('standing');
    player.setDownedCamera(true);
    input.setKey('KeyZ', false);
    input.setKey('KeyZ', true);
    tick();
    expect(player.stance).toBe('standing');
  });

  it('resets posture on teleport and separates it from the downed view', () => {
    const { player, input, tick } = setup();
    applyMobileAction(input, 'prone', true);
    tick(90);
    expect(player.stance).toBe('prone');
    player.setDownedCamera(true);
    tick(90, false);
    expect(player.camera.position.y).toBeCloseTo(-1.2, 3);
    player.teleport(1, -1.3, 1, 1);
    expect(player.stance).toBe('standing');
    expect(player.camera.position.y).toBe(0);
  });

  it('maps touch posture buttons to the same press/release actions', () => {
    const { player, input, tick } = setup();
    applyMobileAction(input, 'crouch', true);
    tick();
    expect(player.stance).toBe('crouched');
    tick();
    expect(player.stance).toBe('crouched');
    applyMobileAction(input, 'crouch', false);
    applyMobileAction(input, 'crouch', true);
    tick();
    expect(player.stance).toBe('standing');
  });

  it('starts the death fall from the current low view without snapping up', () => {
    const { player, input, tick } = setup();
    input.setKey('KeyZ', true);
    tick(90);
    const before = player.camera.position.y;
    player.playDeathFall();
    tick(1, false);
    expect(player.camera.position.y).toBeLessThanOrEqual(before + 0.001);
    tick(120, false);
    expect(player.camera.position.y).toBeCloseTo(-1.45, 3);
  });

  it('validates network stances and accepts existing standing snapshots', () => {
    const state = { t: 1, x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0, floor: 0,
      weapon: 'm1911', ads: false, reloading: false };
    for (const stance of [undefined, 'standing', 'crouched', 'prone']) {
      expect(isPlayerNetState({ ...state, stance })).toBe(true);
    }
    for (const stance of [null, 'flying', 1, {}]) expect(isPlayerNetState({ ...state, stance })).toBe(false);
    expect(isPlayerNetState({ ...state, stance: 'prone', eyeOffsetY: -0.4 })).toBe(true);
    for (const eyeOffsetY of [-2, 0.1, NaN, 'low']) {
      expect(isPlayerNetState({ ...state, eyeOffsetY })).toBe(false);
    }
  });
});
