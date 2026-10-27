import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLanguage, t } from '../src/i18n/i18n';
import { ZombiesCrystalRecovery } from '../src/modes/ZombiesCrystalRecovery';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { Zombie } from '../src/zombies/Zombie';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { WindowBarrier } from '../src/zombies/barriers/WindowBarrier';
import type { ArenaWeaponStation } from '../src/zombies/maps/ZombieArena';
import { installCanvasDocument, makeContext } from './coopHarness';

let restore: () => void;
beforeAll(() => { restore = installCanvasDocument(); });
afterAll(() => restore());

function setup() {
  setLanguage('en');
  const harness = makeContext();
  const ctx = { ...harness.ctx, profile: { ...harness.ctx.profile } };
  harness.player.rig.position.set(0, 1.72, 0);
  harness.player.camera.rotation.set(0, 0, 0);
  const station = {
    id: 'test-crystal', weaponId: 'fakel', requiresStartupCrystal: true,
    powered: false as boolean, price: 3500, ammoPrice: 1750, position: { x: 4, y: 1.3, z: -4 },
    floor: 0, useRange: 2, lookDotMin: 0.5, setOwned: vi.fn(), activate: vi.fn(), setLocked: vi.fn(),
  } satisfies ArenaWeaponStation;
  const recovery = new ZombiesCrystalRecovery(ctx, station);
  const carrier = new Zombie();
  carrier.spawn(0, -4, 100, 1);
  const other = new Zombie();
  other.spawn(0, -8, 100, 1);
  const zombies = new Set([carrier, other]);
  return { ...harness, ctx, station, recovery, carrier, other, zombies };
}

describe('startup crystal recovery', () => {
  it('starts once on power, selects a living walker and leaves round population and stats intact', () => {
    const { station, recovery, zombies, carrier, ctx, hud } = setup();
    recovery.update(0.1, zombies);
    expect(recovery.objective()).toBeNull();
    expect(recovery.locked).toBe(true);
    expect(recovery.stationPrompt()).toContain('Turn on the power');
    station.powered = true;
    recovery.update(0.1, zombies);
    expect(recovery.objective()).toContain(t('crystal.hunt'));
    expect(recovery.objective()).toContain('↑ 4 m');
    expect(zombies.size).toBe(2);
    expect([carrier.hp, carrier.speed]).toEqual([100, 1]);
    expect(ctx.scene.getObjectByName('startup-crystal-objective')?.visible).toBe(true);
    expect(ctx.scene.getObjectByName('startup-crystal-marker')).toBeDefined();
    recovery.update(1, zombies);
    expect(hud.showRoundBanner).toHaveBeenCalledTimes(1);
  });

  it('waits for a normal arrival when there is no eligible horde and ignores other deaths', () => {
    const { station, recovery, carrier, other } = setup();
    station.powered = true;
    other.typeId = 'brute';
    recovery.update(0, new Set([other]));
    expect(recovery.objective()).toContain(t('crystal.wait'));
    recovery.update(0, new Set([carrier, other]));
    recovery.onKilled(other, { x: 0, y: 0, z: -1 });
    expect(recovery.objective()).toContain(t('crystal.hunt'));
  });

  it('requires pickup and installation before unlocking, with no automatic purchase', () => {
    const { station, recovery, carrier, zombies, player } = setup();
    station.powered = true;
    recovery.update(0, zombies);
    expect(recovery.interactAtStation()).toBe(true);
    expect(recovery.locked).toBe(true);
    recovery.onKilled(carrier, { x: 0, y: 0, z: -1 });
    expect(recovery.objective()).toContain(t('crystal.collect'));
    expect(recovery.pickupPrompt()).toContain('Press E');
    expect(recovery.locked).toBe(true);
    expect(recovery.pickUp()).toBe(true);
    expect(recovery.pickUp()).toBe(false);
    expect(recovery.stationPrompt()).toContain('INSTALL STARTUP CRYSTAL');
    expect(recovery.objective()).toContain(t('crystal.return'));
    player.camera.rotation.y = -Math.PI / 2;
    expect(recovery.objective()).toContain('↖');
    recovery.interactAtStation();
    expect(recovery.locked).toBe(false);
    expect(station.setLocked).toHaveBeenLastCalledWith(false);
    expect(station.activate).toHaveBeenCalledOnce();
    expect(recovery.objective()).toBeNull();
    expect(recovery.interactAtStation()).toBe(false);
  });

  it('keeps the drop between rounds, rejects distant/wrong-floor/backward pickup and supports touch', () => {
    const { station, recovery, carrier, zombies, player, ctx } = setup();
    station.powered = true;
    recovery.update(0, zombies);
    recovery.onKilled(carrier, { x: 0, y: 0, z: -1 });
    recovery.update(600, new Set());
    expect(recovery.objective()).toContain(t('crystal.collect'));
    player.rig.position.z = 10;
    expect(recovery.pickUp()).toBe(false);
    player.rig.position.z = 0;
    player.teleport(0, 1.72, 0, 1);
    expect(recovery.pickUp()).toBe(false);
    player.teleport(0, 1.72, 0, 0);
    player.camera.rotation.y = Math.PI;
    expect(recovery.pickUp()).toBe(false);
    player.camera.rotation.y = 0;
    ctx.profile.useTouchControls = true;
    expect(recovery.pickupPrompt()).toContain('Tap USE');
    expect(recovery.pickUp()).toBe(true);
    expect(recovery.stationPrompt()).toContain('Tap USE');
  });

  it('resets drops, carried crystals and unlocks, without decorating a recycled carrier', () => {
    const { station, recovery, carrier, zombies, ctx } = setup();
    for (const finalStage of ['hunting', 'dropped', 'carrying', 'installed']) {
      recovery.update(0, zombies);
      station.powered = true;
      recovery.update(0, zombies);
      if (finalStage !== 'hunting') recovery.onKilled(carrier, { x: 0, y: 0, z: -1 });
      if (finalStage === 'carrying' || finalStage === 'installed') recovery.pickUp();
      if (finalStage === 'installed') recovery.interactAtStation();
      station.powered = false;
      recovery.reset();
      expect(recovery.locked).toBe(true);
      expect(recovery.pickUp()).toBe(false);
      expect(recovery.objective()).toBeNull();
      expect(ctx.scene.getObjectByName('startup-crystal-objective')?.visible).toBe(false);
      expect(carrier.group.getObjectByName('startup-crystal-marker')).toBeUndefined();
    }
  });
});

describe('crystal drop and mode integration', () => {
  it.each(['m1911', 'knife', 'fakel', 'tesla', 'raygun'] as const)(
    'drops on the playable side when the carrier is killed with %s before breaching', (source) => {
      const barrier = new WindowBarrier('quest-entry', 0, -10, 0, -1,
        { boardCount: 3, boardHp: 100, repairInterval: 1, repairRewardCap: 3 });
      const manager = new ZombieManager(() => 0.5, {}, false, [{
        x: 0, z: -13, barrierId: barrier.id, approachX: 0, approachZ: -11,
        breachX: 0, breachZ: -8.5,
      }], [barrier]);
      const killed = vi.fn();
      manager.onZombieKilled = killed;
      expect(manager.spawnZombie(roundConfig(1), 0, 0, 1)).toBe(true);
      const zombie = [...manager.actives][0];
      manager.damageZombie(zombie, 'torso', 10000, source);
      expect(killed).toHaveBeenCalledOnce();
      expect(killed.mock.calls[0][3]).toEqual({ x: 0, y: 0, z: -8.5 });
      manager.dispose();
    });

  it('enforces the Station 33 lock through USE and preserves the other map', () => {
    const { ctx, hud, player } = makeContext();
    const mode = new ZombiesMode('station-33');
    mode.init(ctx);
    const internals = mode as unknown as {
      arena: { weaponStations: ArenaWeaponStation[]; powerSwitch: { activate(): boolean }; update(dt: number): void };
      crystalRecoveries: ZombiesCrystalRecovery[];
      findFacingWeaponStation(): ArenaWeaponStation;
    };
    const station = internals.arena.weaponStations[0];
    // Isolate the cabinet-facing check; exercise the real USE routing and lock.
    internals.findFacingWeaponStation = () => station;
    player.rig.position.set(0, 1.72, 0);
    mode.onInteract();
    expect(hud.showRoundBanner).toHaveBeenLastCalledWith(t('crystal.needsPower'));
    internals.arena.powerSwitch.activate();
    internals.arena.update(1);
    mode.onInteract();
    expect(hud.showRoundBanner).toHaveBeenLastCalledWith(t('crystal.locked'));
    expect(internals.crystalRecoveries).toHaveLength(1);
    const other = new ZombiesMode('burned-mansion');
    other.init(makeContext().ctx);
    expect((other as unknown as { crystalRecoveries: unknown[] }).crystalRecoveries).toHaveLength(0);
  });
});
