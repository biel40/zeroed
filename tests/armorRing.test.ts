import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import { PlayerHealth } from '../src/game/PlayerHealth';
import { RING_DEFINITIONS } from '../src/game/rings/RingCatalog';
import { t } from '../src/i18n/i18n';
import { EYE_HEIGHT } from '../src/player/PlayerController';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { RING_DONNING_DURATION } from '../src/weapons/RingDonning';
import type { MeleeArmDriver } from '../src/weapons/ViewArms';
import type { Station33Arena } from '../src/zombies/maps/Station33Arena';
import { MILICIA, STATION33_DOORS, station33ZoneAt } from '../src/zombies/maps/Station33Config';
import { PLAYER_MAX_HP } from '../src/zombies/ZombieConfig';
import { installCanvasDocument, makeContext, type TestContext } from './coopHarness';

const ARMOR = RING_DEFINITIONS.armor;
const [PRICE] = ARMOR.prices;
/** Yaw that looks toward -X (yaw 0 looks toward -Z, π toward +Z). */
const FACE_WEST = Math.PI / 2;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

interface ModeInternals {
  arena: Station33Arena;
  economy: PlayerEconomy;
  health: PlayerHealth;
  rings: { update(dt: number): void; readonly isDonning: boolean };
}

function startRun(): { mode: ZombiesMode; internals: ModeInternals; side: TestContext } {
  const side = makeContext();
  const mode = new ZombiesMode('station-33');
  mode.init(side.ctx);
  return { mode, internals: mode as unknown as ModeInternals, side };
}

function fund(economy: PlayerEconomy, points: number): void {
  for (let earned = 0; earned < points; earned += 10) economy.awardRepair();
}

/** Stands in the militia post in front of the evidence locker, looking into it. */
function faceArmorLocker({ internals, side }: { internals: ModeInternals; side: TestContext }): void {
  const machine = internals.arena.ringMachines.find((candidate) => candidate.ringId === 'armor')!;
  side.player.teleport(machine.position.x + 0.6, EYE_HEIGHT, machine.position.z, 0);
  side.player.face(FACE_WEST);
  side.player.rig.updateMatrixWorld(true);
}

/** Turns the power on and buys the Armour ring at its locker. */
function buyArmor(run: { mode: ZombiesMode; internals: ModeInternals; side: TestContext }): void {
  run.internals.arena.switchOnPower();
  faceArmorLocker(run);
  fund(run.internals.economy, PRICE);
  run.mode.onInteract();
}

describe('Armour ring', () => {
  it('is a passive red middle-finger ring, sold once for 2500 with its own tune, doubling max health', () => {
    expect(ARMOR.finger).toBe('middle');
    expect(ARMOR.prices).toEqual([2500]);
    expect(ARMOR.glowColor).toBe(0xe0283a);
    expect(new Set(Object.values(RING_DEFINITIONS).map((ring) => ring.jingle)).size).toBe(Object.keys(RING_DEFINITIONS).length);
    expect(ARMOR.effect).toEqual({ kind: 'maxHealth', maxHpScale: 2 });
    expect(t(ARMOR.nameKey)).not.toBe(ARMOR.nameKey);
  });

  it('waits in the militia post, behind the 3000-point door, for the power', () => {
    const door = STATION33_DOORS.find((candidate) => candidate.zone === 'milicia')!;
    expect(door.cost).toBe(3000);
    const run = startRun();
    const machine = run.internals.arena.ringMachines.find((candidate) => candidate.ringId === 'armor')!;
    expect(station33ZoneAt(machine.position.x, machine.position.z)).toBe('milicia');
    expect(machine.position.x).toBeLessThan(MILICIA.hall.maxX);
    faceArmorLocker(run);
    fund(run.internals.economy, PRICE);
    expect(run.mode.getInteractPrompt()).toBe(t('prompt.ringNeedsPower', { ring: t(ARMOR.nameKey) }));
    run.mode.onInteract();
    expect(run.internals.economy.points).toBe(PRICE);
    expect(run.internals.health.maxHp).toBe(PLAYER_MAX_HP);
  });

  it('doubles the max health once bought, granting the extra health at once', () => {
    const run = startRun();
    const { internals, side, mode } = run;
    internals.health.damage(40);
    buyArmor(run);
    expect(internals.economy.points).toBe(0);
    expect(side.ctx.handRings.show).toHaveBeenLastCalledWith('middle', 'charged', ARMOR.glowColor);
    expect(internals.health.maxHp).toBe(PLAYER_MAX_HP * 2);
    expect(internals.health.hp).toBe(PLAYER_MAX_HP * 2 - 40);
    // Passive and bought once: nothing more to sell this run.
    expect(mode.getInteractPrompt()).toBeNull();
  });

  it('plays the hands putting the ring on, holding fire and the knife meanwhile', () => {
    const run = startRun();
    const { internals, side, mode } = run;
    buyArmor(run);
    expect(internals.rings.isDonning).toBe(true);
    expect(side.ctx.handRings.beginDonning).toHaveBeenCalledWith('middle');
    const driver = mode.getMeleeArm() as MeleeArmDriver;
    expect(driver.support).toBeDefined();
    expect(mode.usesFallbackAttack()).toBe(true);
    mode.onMeleeAttack();
    expect(mode.getMeleeArm()).toBe(driver);

    internals.rings.update(RING_DONNING_DURATION * 0.7);
    expect(side.ctx.handRings.seat).toHaveBeenCalledWith('middle');
    expect(side.ctx.handRings.pulse).toHaveBeenCalledWith('middle', expect.any(Number));
    internals.rings.update(RING_DONNING_DURATION);
    expect(internals.rings.isDonning).toBe(false);
    expect(mode.getMeleeArm()).toBeNull();
    expect(mode.usesFallbackAttack()).toBe(false);
  });

  it('takes the ring and the extra health away on a new run', () => {
    const run = startRun();
    buyArmor(run);
    run.mode.onRestartRequested();
    expect(run.internals.rings.isDonning).toBe(false);
    expect(run.internals.health.maxHp).toBe(PLAYER_MAX_HP);
    expect(run.internals.health.hp).toBe(PLAYER_MAX_HP);
    expect(vi.mocked(run.side.ctx.handRings.clear)).toHaveBeenCalled();
  });
});

describe('PlayerHealth max HP scale', () => {
  it('grants the gained HP when raised, caps HP when lowered and goes back to base on reset', () => {
    const health = new PlayerHealth(100);
    health.damage(30);
    health.setMaxHpScale(2);
    expect([health.maxHp, health.hp]).toEqual([200, 170]);
    health.setMaxHpScale(1);
    expect([health.maxHp, health.hp]).toEqual([100, 100]);
    health.setMaxHpScale(2);
    health.reset();
    expect([health.maxHp, health.hp]).toEqual([100, 100]);
  });
});
