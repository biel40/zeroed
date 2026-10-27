import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import { RING_DEFINITIONS } from '../src/game/rings/RingCatalog';
import { t } from '../src/i18n/i18n';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { ZombiesRings } from '../src/modes/ZombiesRings';
import { EYE_HEIGHT } from '../src/player/PlayerController';
import type { HitTarget } from '../src/shooting/HitTarget';
import { Weapon } from '../src/weapons/Weapon';
import type { WeaponId } from '../src/weapons/WeaponTypes';
import { CHAIN_ZAP_DAMAGE } from '../src/zombies/ZombieConfig';
import type { ZombieManager } from '../src/zombies/ZombieManager';
import type { Station33Arena } from '../src/zombies/maps/Station33Arena';
import { installCanvasDocument, makeContext } from './coopHarness';

const DOUBLE_TAP = RING_DEFINITIONS.doubleTap;
const POINT = new THREE.Vector3();
const INPUT = { trigger: true, ads: false, repeatSemiAuto: true };
let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

interface ModeInternals {
  arena: Station33Arena;
  economy: PlayerEconomy;
  rings: ZombiesRings;
  zombies: ZombieManager;
  onEnergyImpact(point: THREE.Vector3, config: NonNullable<typeof WEAPON_DEFINITIONS.tesla.energy>, object: THREE.Object3D, distance: number): void;
}

function startRun() {
  const side = makeContext();
  const mode = new ZombiesMode('station-33');
  mode.init(side.ctx);
  const internals = mode as unknown as ModeInternals;
  const machine = internals.arena.ringMachines.find((candidate) => candidate.ringId === 'doubleTap')!;
  side.player.teleport(machine.position.x - 0.6, EYE_HEIGHT, machine.position.z, 0);
  side.player.face(-Math.PI / 2);
  side.player.rig.updateMatrixWorld(true);
  return { mode, internals, side, machine };
}

function buyRing(run: ReturnType<typeof startRun>): void {
  run.internals.arena.switchOnPower();
  for (let points = 0; points < DOUBLE_TAP.prices[0]; points += 10) run.internals.economy.awardRepair();
  run.mode.onInteract();
  run.internals.rings.update(3);
}

describe('Double Tap ring', () => {
  it('requires power, sells once, animates the yellow index ring and clears both bonuses on restart', () => {
    const run = startRun();
    const { side, mode, internals, machine } = run;
    expect(mode.getInteractPrompt()).toBe(t('prompt.ringNeedsPower', { ring: t(DOUBLE_TAP.nameKey) }));
    mode.onInteract();
    expect(side.weapon.fireRateScale).toBe(1);
    buyRing(run);
    expect(internals.economy.points).toBe(0);
    expect(side.ctx.handRings.beginDonning).toHaveBeenCalledWith('index');
    expect(side.ctx.handRings.show).toHaveBeenLastCalledWith('index', 'charged', 0xffd43b);
    expect(side.weapon.fireRateScale).toBe(2);
    expect(internals.rings.damageScale).toBe(1.2);
    expect(mode.getInteractPrompt()).toBeNull();
    internals.rings.grant('doubleTap');
    expect(side.weapon.fireRateScale).toBe(2);
    expect(internals.rings.damageScale).toBe(1.2);
    internals.rings.updateJingle(true);
    expect(vi.mocked(side.ctx.audio.setRingJingle).mock.lastCall?.[3]).toBe(DOUBLE_TAP.jingle);
    mode.onRestartRequested();
    expect(side.weapon.fireRateScale).toBe(1);
    expect(internals.rings.damageScale).toBe(1);
    expect(machine.powered).toBe(false);
  });

  it('boosts the weapon used for each hit and composes with developer damage without changing definitions', () => {
    const run = startRun();
    buyRing(run);
    const damage = vi.spyOn(run.internals.zombies, 'damageZombie').mockReturnValue(false);
    const zombie = { isAlive: true };
    const object = new THREE.Object3D();
    object.userData.zombie = zombie;
    for (const id of ['m1911', 'ak47', 'barrett'] as const) {
      const weapon = new Weapon(WEAPON_DEFINITIONS[id]);
      const base = weapon.definition.damage;
      run.mode.onTargetHit({} as HitTarget, 5, POINT, POINT, object, weapon);
      expect(damage).toHaveBeenLastCalledWith(zombie, 'torso', base * 1.2, id);
      expect(weapon.definition.damage).toBe(base);
    }
    for (const key of 'MOTDRULES') run.mode.onKeyInput(key);
    run.mode.executeDeveloperCommand('damage 3');
    run.mode.onTargetHit({} as HitTarget, 5, POINT, POINT, object, run.side.weapon);
    expect(damage).toHaveBeenLastCalledWith(zombie, 'torso', WEAPON_DEFINITIONS.m1911.damage * (3 * 1.2), 'm1911');
  });

  it('boosts Tesla chains and both Ray Gun direct and splash damage', () => {
    const run = startRun();
    buyRing(run);
    const chain = vi.spyOn(run.internals.zombies, 'applyChainLightning').mockReturnValue([]);
    const damage = vi.spyOn(run.internals.zombies, 'damageZombie').mockReturnValue(false);
    const splash = vi.spyOn(run.internals.zombies, 'applySplash').mockImplementation(() => {});
    const zombie = { isAlive: true };
    const object = new THREE.Object3D();
    object.userData.zombie = zombie;
    run.internals.onEnergyImpact(POINT, WEAPON_DEFINITIONS.tesla.energy!, object, 5);
    expect(chain).toHaveBeenLastCalledWith(zombie, CHAIN_ZAP_DAMAGE * 1.2, 'torso');
    const raygun = WEAPON_DEFINITIONS.raygun;
    run.internals.onEnergyImpact(POINT, raygun.energy!, object, 5);
    expect(damage).toHaveBeenLastCalledWith(zombie, 'torso', raygun.damage * 1.2, 'raygun');
    expect(splash).toHaveBeenLastCalledWith(POINT, raygun.energy!.splashRadius, raygun.energy!.splashDamage * 1.2);
  });
});

describe('Weapon fire rate scale', () => {
  it.each([30, 60, 120])('doubles automatic fire at %s fps, even when multiple rounds fall in one frame', (fps) => {
    const countShots = (scale: number): number => {
      const weapon = new Weapon(WEAPON_DEFINITIONS.vector);
      weapon.fireRateScale = scale;
      weapon.update(0, INPUT);
      weapon.clearEvents();
      for (let frame = 1; frame <= fps / 2; frame++) weapon.update(1 / fps, INPUT);
      return weapon.pendingEvents.filter((event) => event.type === 'shot').length;
    };
    expect(countShots(1)).toBe(10);
    expect(countShots(2)).toBe(20);
  });

  it('never banks automatic shots during idle, reload or an overheated lockout', () => {
    const weapon = new Weapon(WEAPON_DEFINITIONS.ak47);
    weapon.fireRateScale = 2;
    weapon.update(5, { trigger: false, ads: false });
    weapon.update(0, INPUT);
    expect(weapon.ammoInMagazine).toBe(weapon.definition.magazineSize - 1);
    weapon.ammoInMagazine = 1;
    weapon.reload();
    weapon.update(weapon.definition.reloadTime + 2, INPUT);
    expect(weapon.ammoInMagazine).toBe(weapon.definition.magazineSize - 1);
    const barrett = new Weapon(WEAPON_DEFINITIONS.barrett);
    barrett.fireRateScale = 2;
    for (let shot = 0; shot < 4; shot++) barrett.update(0.21, INPUT);
    expect(barrett.heat.overheated).toBe(true);
    const before = barrett.ammoInMagazine;
    barrett.update(10, INPUT);
    expect(barrett.ammoInMagazine).toBe(before - 1);
  });

  it.each<WeaponId>(['ak47', 'm1911', 'l96', 'raygun', 'tesla', 'fakel'])
  ('halves the firing interval of %s, including bolt cycling, with one round spent per shot', (id) => {
    const definition = WEAPON_DEFINITIONS[id];
    const baseRpm = definition.rpm;
    const shotAfter = (scale: number): Weapon => {
      const weapon = new Weapon(definition);
      weapon.fireRateScale = scale;
      weapon.update(0, INPUT);
      weapon.clearEvents();
      weapon.update(0, { trigger: false, ads: false });
      const interval = Math.max(60 / definition.rpm, definition.boltCycleTime);
      weapon.update(interval / 2 + 0.0001, INPUT);
      return weapon;
    };
    expect(shotAfter(1).ammoInMagazine).toBe(definition.magazineSize - 1);
    expect(shotAfter(2).ammoInMagazine).toBe(definition.magazineSize - 2);
    expect(definition.rpm).toBe(baseRpm);
  });

  it('keeps the bonus through equip and ammo resets and leaves reloads unchanged', () => {
    const weapon = new Weapon(WEAPON_DEFINITIONS.ak47);
    weapon.fireRateScale = 2;
    weapon.equip();
    weapon.resetAmmo();
    expect(weapon.fireRateScale).toBe(2);
    weapon.ammoInMagazine = 0;
    weapon.reload();
    weapon.update(weapon.definition.reloadTime / 2, { trigger: false, ads: false });
    expect(weapon.state).toBe('reloading');
    expect(weapon.ammoInMagazine).toBe(0);
  });
});
