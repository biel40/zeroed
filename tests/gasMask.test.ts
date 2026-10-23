import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ModeContext } from '../src/modes/GameMode';
import { ZombiesGasMask } from '../src/modes/ZombiesGasMask';
import { GAS_MASK_DON_DURATION, GasMaskDonning } from '../src/zombies/gasMask/GasMaskDonning';
import { BurnedMansionArena } from '../src/zombies/maps/BurnedMansionArena';
import { MANSION_BUNKER_Y } from '../src/zombies/maps/BurnedMansionConfig';
import type { ArenaGasMaskRack } from '../src/zombies/maps/ZombieArena';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

function play(donning: GasMaskDonning, seconds: number): ReturnType<GasMaskDonning['update']>[] {
  const settled: ReturnType<GasMaskDonning['update']>[] = [];
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) settled.push(donning.update(1 / 60));
  return settled.filter((state) => state !== null);
}

describe('gas mask donning', () => {
  it('puts the mask on through the arm, then covers the view', () => {
    const donning = new GasMaskDonning();
    expect(donning.putOn()).toBe(true);
    expect(donning.state).toBe('donning');
    expect(donning.putOn()).toBe(false);

    donning.update(GAS_MASK_DON_DURATION * 0.4);
    expect(donning.armWeight).toBe(1);
    expect(donning.firearmLowering).toBe(1);
    expect(donning.viewLevel).toBe(0);
    expect(donning.root.children[0].visible).toBe(true);

    expect(play(donning, GAS_MASK_DON_DURATION)).toEqual(['on']);
    expect(donning.state).toBe('on');
    expect(donning.viewLevel).toBe(1);
    expect(donning.armWeight).toBe(0);
    expect(donning.firearmLowering).toBe(0);
    expect(donning.root.children[0].visible).toBe(false);
  });

  it('takes the mask off with the same motion backwards', () => {
    const donning = new GasMaskDonning();
    expect(donning.takeOff()).toBe(false);
    donning.putOn();
    play(donning, GAS_MASK_DON_DURATION * 1.1);

    expect(donning.takeOff()).toBe(true);
    expect(donning.state).toBe('doffing');
    expect(play(donning, GAS_MASK_DON_DURATION * 1.1)).toEqual(['off']);
    expect(donning.viewLevel).toBe(0);
    expect(donning.isAnimating).toBe(false);
  });

  it('keeps the hand in front of the camera while it holds the mask up', () => {
    const camera = new THREE.PerspectiveCamera();
    const donning = new GasMaskDonning();
    camera.add(donning.root);
    donning.putOn();
    donning.update(GAS_MASK_DON_DURATION * 0.38);
    const grip = new THREE.Vector3();
    const elbow = new THREE.Vector3();
    donning.readHandTarget(grip, new THREE.Quaternion(), elbow);
    expect(grip.z).toBeLessThan(-0.2);
    expect(Math.abs(grip.x)).toBeLessThan(0.3);
    // The forearm runs back down toward the shoulder, below the hand.
    expect(elbow.y).toBeLessThan(grip.y);
    expect(elbow.z).toBeGreaterThan(grip.z);
  });
});

describe('gas mask in a Zombies run', () => {
  function makeRun() {
    const camera = new THREE.PerspectiveCamera();
    const rig = new THREE.Object3D();
    const hud = { setGasMask: vi.fn() };
    const ctx = {
      player: { camera, rig, floor: -1 },
      hud,
      profile: { useTouchControls: false },
    } as unknown as ModeContext;
    let onHook = true;
    const rack: ArenaGasMaskRack = {
      id: 'test-mask',
      position: { x: 0, y: 1.6, z: -1 },
      floor: -1,
      useRange: 1.6,
      lookDotMin: 0.8,
      setMaskOnHook: (value) => { onHook = value; },
    };
    return { gasMask: new ZombiesGasMask(ctx, rack), hud, rig, onHook: () => onHook };
  }

  it('puts the mask on at its hook and hangs it back', () => {
    const { gasMask, hud, onHook } = makeRun();
    expect(gasMask.prompt()).toBe('PUT ON GAS MASK\nPress E');
    expect(gasMask.interact()).toBe(true);
    expect(onHook()).toBe(false);
    expect(gasMask.armDriver).not.toBeNull();
    expect(gasMask.prompt()).toBeNull();

    for (let frame = 0; frame < 120; frame++) gasMask.update(1 / 60);
    expect(hud.setGasMask).toHaveBeenLastCalledWith(1);
    expect(gasMask.armDriver).toBeNull();
    expect(gasMask.prompt()).toBe('HANG UP GAS MASK\nPress E');

    gasMask.interact();
    for (let frame = 0; frame < 120; frame++) gasMask.update(1 / 60);
    expect(hud.setGasMask).toHaveBeenLastCalledWith(0);
    expect(onHook()).toBe(true);
  });

  it('ignores the hook from too far or facing away', () => {
    const { gasMask, rig } = makeRun();
    rig.position.set(0, 0, 3);
    expect(gasMask.prompt()).toBeNull();
    expect(gasMask.interact()).toBe(false);
    rig.position.set(0, 0, -2);
    expect(gasMask.prompt()).toBeNull();
  });

  it('starts every run bare faced with the mask on its hook', () => {
    const { gasMask, hud, onHook } = makeRun();
    gasMask.interact();
    for (let frame = 0; frame < 120; frame++) gasMask.update(1 / 60);
    gasMask.reset();
    expect(onHook()).toBe(true);
    expect(hud.setGasMask).toHaveBeenLastCalledWith(0);
    expect(gasMask.prompt()).toBe('PUT ON GAS MASK\nPress E');
  });
});

describe('Burned Mansion gas mask rack', () => {
  let restoreDocument: () => void;
  beforeAll(() => { restoreDocument = installCanvasDocument(); });
  afterAll(() => restoreDocument());

  it('hangs a wearable mask on the bunker wall', () => {
    const arena = new BurnedMansionArena(new THREE.Scene(), TEST_PROFILE);
    const rack = arena.gasMaskRack;
    expect(rack.floor).toBe(-1);
    expect(rack.position.y).toBeGreaterThan(MANSION_BUNKER_Y + 1.2);
    expect(rack.position.y).toBeLessThan(MANSION_BUNKER_Y + 2);

    const mask = arena.group.getObjectByName('bunker-gas-mask')!;
    expect(mask.visible).toBe(true);
    rack.setMaskOnHook(false);
    expect(mask.visible).toBe(false);
    rack.setMaskOnHook(true);
    expect(mask.visible).toBe(true);
  });
});
