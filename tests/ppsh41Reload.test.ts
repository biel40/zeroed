import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { HAND_POSES } from '../src/weapons/HandPoses';
import { HANDLE_RELEASE_FRACTION, HANDLE_TRAVEL, ReloadAnimator } from '../src/weapons/ReloadAnimator';
import { Weapon } from '../src/weapons/Weapon';
import { WeaponHands } from '../src/weapons/WeaponHands';
import type { ReloadPhase } from '../src/weapons/WeaponTypes';

const definition = WEAPON_DEFINITIONS.ppsh41;
const config = definition.view.reloadAnim!;
const latchProgress = config.charge + (config.chargeEnd - config.charge) * HANDLE_RELEASE_FRACTION;
const IDLE = { trigger: false, ads: false };

function rig(ammo = 0) {
  const weapon = new Weapon(definition, () => 0.5, 284);
  weapon.ammoInMagazine = ammo;
  const root = new THREE.Group();
  const magazine = new THREE.Group();
  const handle = new THREE.Group();
  magazine.position.set(0, -0.13, -0.13);
  handle.position.set(0.035, 0.01, 0);
  root.add(magazine, handle);
  const home = handle.position.clone();
  const magHome = magazine.position.clone();
  const animator = new ReloadAnimator(config, { magazine, handle, cover: null }, null);
  const hands = new WeaponHands(definition.view.hands, root, { magazine, handle }, config, false, definition.view.sightHeight);
  const phases: ReloadPhase[] = [];
  animator.onPhase = (phase) => phases.push(phase);
  const duration = ammo === 0 ? definition.reloadTime : definition.tacticalReloadTime;
  let elapsed = 0;
  const advanceTo = (progress: number): void => {
    const until = duration * progress;
    while (elapsed < until - 1e-10) {
      const dt = Math.min(1 / 240, until - elapsed);
      weapon.update(dt, IDLE);
      animator.update(weapon);
      hands.update(weapon);
      elapsed += dt;
    }
  };
  expect(weapon.reload()).toBe(true);
  animator.update(weapon);
  return { weapon, animator, hands, magazine, handle, home, magHome, phases, advanceTo };
}

describe('PPSh-41 open-bolt drum reload', () => {
  it('pulls the empty action from forward onto the rear sear and keeps it latched', () => {
    const setup = rig();
    expect(setup.handle.position.z).toBeCloseTo(setup.home.z - HANDLE_TRAVEL, 6);
    setup.advanceTo(config.charge + (latchProgress - config.charge) * 0.5);
    expect(setup.handle.position.z).toBeGreaterThan(setup.home.z - HANDLE_TRAVEL);
    expect(setup.handle.position.z).toBeLessThan(setup.home.z);
    expect(setup.phases).not.toContain('chargeEnd');
    setup.advanceTo(latchProgress + 0.001);
    expect(setup.phases.filter((phase) => phase === 'chargeEnd')).toHaveLength(1);
    expect(setup.handle.position.distanceTo(setup.home)).toBeLessThan(1e-6);
    setup.advanceTo((latchProgress + 1) / 2);
    expect(setup.handle.position.distanceTo(setup.home)).toBeLessThan(1e-6);
    expect(setup.weapon.ammoInMagazine).toBe(0);
    expect(setup.weapon.reserveAmmo).toBe(284);
    setup.advanceTo(1.01);
    expect(setup.handle.position.distanceTo(setup.home)).toBeLessThan(1e-6);
    expect(setup.weapon.ammoInMagazine).toBe(71);
    expect(setup.weapon.reserveAmmo).toBe(213);
  });

  it('keeps the action cocked throughout a tactical drum swap', () => {
    const setup = rig(10);
    for (const progress of [config.magDrop + 0.01, config.magIn + 0.01, config.charge, 1.01]) {
      setup.advanceTo(progress);
      expect(setup.handle.position.distanceTo(setup.home)).toBeLessThan(1e-6);
    }
    expect(setup.phases).toEqual(['magOut', 'magDrop', 'magIn', 'magSeat']);
    expect(setup.weapon.ammoInMagazine).toBe(71);
    expect(setup.weapon.reserveAmmo).toBe(223);
  });

  it('releases the action hand at the actual rear sear rather than beyond its travel', () => {
    const setup = rig();
    setup.advanceTo(latchProgress + 0.001);
    const position = new THREE.Vector3();
    const pose = setup.hands.read(definition.view.hands.actionHand ?? 'right', position, new THREE.Quaternion());
    const expected = new THREE.Vector3(...definition.view.hands.action!.position).add(setup.home);
    expect(position.distanceTo(expected)).toBeLessThan(0.002);
    expect(pose).toBe(HAND_POSES.relaxed);
  });

  it('restores the parts on cancellation without granting ammunition', () => {
    const setup = rig();
    setup.advanceTo(config.magDrop + 0.01);
    expect(setup.magazine.visible).toBe(false);
    setup.weapon.equip();
    setup.animator.update(setup.weapon);
    expect(setup.magazine.visible).toBe(true);
    expect(setup.magazine.position.distanceTo(setup.magHome)).toBeLessThan(1e-6);
    expect(setup.handle.position.distanceTo(setup.home)).toBeLessThan(1e-6);
    expect(setup.weapon.ammoInMagazine).toBe(0);
    expect(setup.weapon.reserveAmmo).toBe(284);
  });

  it('uses a hollow drum seat and a rear latch without a forward-bolt impact', () => {
    const audio = new AudioSystem() as any;
    const tick = vi.spyOn(audio, 'tick').mockImplementation(() => {});
    const sweep = vi.spyOn(audio, 'sweep').mockImplementation(() => {});
    const clang = vi.spyOn(audio, 'metalClang').mockImplementation(() => {});
    const scrape = vi.spyOn(audio, 'scrape').mockImplementation(() => {});
    audio.playReloadPhase('magSeat', false, 'drum');
    expect(sweep.mock.calls.some((call) => call[1] === 'triangle' && (call[2] as number) < 120)).toBe(true);
    vi.clearAllMocks();
    audio.playReloadPhase('chargeStart', false, 'drum', 0.4);
    expect(scrape.mock.calls[0][4]).toBeCloseTo(0.4 * HANDLE_RELEASE_FRACTION);
    vi.clearAllMocks();
    audio.playReloadPhase('chargeEnd', false, 'drum');
    expect(tick).toHaveBeenCalledOnce();
    expect(clang).not.toHaveBeenCalled();
    expect(sweep).not.toHaveBeenCalled();
    vi.clearAllMocks();
    audio.playReloadComplete(false, 'drum');
    expect(tick).toHaveBeenCalledOnce();
    expect(clang).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
