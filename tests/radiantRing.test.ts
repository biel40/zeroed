import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { PlayerHealth } from '../src/game/PlayerHealth';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import { PlayerRings } from '../src/game/rings/PlayerRings';
import { RADIANT_RING, RadiantRingTally } from '../src/game/rings/RadiantRing';
import { RING_IDS } from '../src/game/rings/RingCatalog';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { ZombiesRings } from '../src/modes/ZombiesRings';
import type { HitTarget } from '../src/shooting/HitTarget';
import { Weapon } from '../src/weapons/Weapon';
import type { ZombieManager } from '../src/zombies/ZombieManager';
import { installCanvasDocument, makeContext } from './coopHarness';

const EFFECT = RADIANT_RING.effect;
const POINT = new THREE.Vector3();
let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

interface ModeInternals {
  economy: PlayerEconomy;
  health: PlayerHealth;
  rings: ZombiesRings;
  zombies: ZombieManager;
  onZombieKilled(headshot: boolean): void;
}

function startRun() {
  const side = makeContext();
  const mode = new ZombiesMode('station-33');
  mode.init(side.ctx);
  return { mode, side, internals: mode as unknown as ModeInternals };
}

/** Grants every catalog ring and lets each hand animation, the thumb's included, play out. */
function wearAllRings(run: ReturnType<typeof startRun>): void {
  for (const id of RING_IDS) {
    run.internals.rings.grant(id);
    run.internals.rings.update(3);
  }
  run.internals.rings.update(3);
  run.internals.rings.update(3);
}

function moveSpeedScale(run: ReturnType<typeof startRun>): number {
  return (run.side.player as unknown as { moveSpeedScale: number }).moveSpeedScale;
}

describe('PlayerRings radiance', () => {
  it('awakens with every charged catalog ring, fades with a spent one and comes back on recharge', () => {
    const rings = new PlayerRings();
    for (const id of RING_IDS.slice(0, -1)) rings.grant(id);
    expect(rings.isRadiant).toBe(false);
    rings.clearEvents();
    rings.grant(RING_IDS[RING_IDS.length - 1]);
    expect(rings.isRadiant).toBe(true);
    expect(rings.pendingEvents.at(-1)).toEqual({ type: 'radiantAwakened' });
    rings.clearEvents();
    rings.consumeCharge('resurrection');
    expect(rings.isRadiant).toBe(false);
    expect(rings.pendingEvents).toEqual([{ type: 'consumed', ringId: 'resurrection' }, { type: 'radiantFaded' }]);
    rings.clearEvents();
    expect(rings.buy('resurrection', () => true)).toBe('recharged');
    expect(rings.isRadiant).toBe(true);
    expect(rings.pendingEvents.at(-1)).toEqual({ type: 'radiantAwakened' });
    rings.reset();
    expect(rings.isRadiant).toBe(false);
    expect(rings.pendingEvents).toEqual([]);
  });
});

describe('RadiantRingTally', () => {
  it('earns a scavenge every few kills and primes one echo at a time', () => {
    const tally = new RadiantRingTally(EFFECT);
    const scavenges: number[] = [];
    for (let kill = 1; kill <= EFFECT.scavengeEveryKills * 2; kill++) {
      if (tally.registerKill()) scavenges.push(kill);
    }
    expect(scavenges).toEqual([EFFECT.scavengeEveryKills, EFFECT.scavengeEveryKills * 2]);

    tally.reset();
    expect(tally.releaseEcho()).toBe(false);
    for (let kill = 1; kill < EFFECT.echoEveryKills; kill++) tally.registerKill();
    expect(tally.isEchoPrimed).toBe(false);
    tally.registerKill();
    expect(tally.isEchoPrimed).toBe(true);
    // Kills while primed never bank a second echo.
    for (let kill = 0; kill < EFFECT.echoEveryKills; kill++) tally.registerKill();
    expect(tally.releaseEcho()).toBe(true);
    expect(tally.releaseEcho()).toBe(false);
    tally.registerKill();
    tally.reset();
    for (let kill = 1; kill < EFFECT.echoEveryKills; kill++) tally.registerKill();
    expect(tally.isEchoPrimed).toBe(false);
  });

  it('keeps every bonus light', () => {
    expect(EFFECT.moveSpeedScale).toBeGreaterThan(1);
    expect(EFFECT.moveSpeedScale).toBeLessThanOrEqual(1.1);
    expect(EFFECT.regenDelayScale).toBeGreaterThanOrEqual(0.7);
    expect(EFFECT.regenDelayScale).toBeLessThan(1);
    expect(EFFECT.killPointsScale).toBeLessThanOrEqual(1.1);
    expect(EFFECT.scavengeReserveShare).toBeLessThanOrEqual(0.1);
    expect(EFFECT.echoDamageShare).toBeLessThanOrEqual(0.5);
  });
});

describe('PlayerHealth regen delay scale', () => {
  it('starts regenerating sooner while scaled and goes back to normal on reset', () => {
    const health = new PlayerHealth(100, 0, 2, 10);
    health.setRegenDelayScale(0.5);
    health.damage(50);
    health.update(1);
    expect(health.hp).toBeGreaterThan(50);
    health.reset();
    health.damage(50);
    health.update(1);
    expect(health.hp).toBe(50);
  });
});

describe('Weapon reserve share', () => {
  it('restores a share of the starting reserve, at least one round, capped and never on a bottomless reserve', () => {
    const weapon = new Weapon(WEAPON_DEFINITIONS.ak47, Math.random, 100);
    weapon.reserveAmmo = 0;
    expect(weapon.restoreReserveShare(0.1)).toBe(true);
    expect(weapon.reserveAmmo).toBe(10);
    weapon.reserveAmmo = 99;
    expect(weapon.restoreReserveShare(0.1)).toBe(true);
    expect(weapon.reserveAmmo).toBe(100);
    expect(weapon.restoreReserveShare(0.1)).toBe(false);
    const small = new Weapon(WEAPON_DEFINITIONS.ak47, Math.random, 4);
    small.reserveAmmo = 0;
    small.restoreReserveShare(0.1);
    expect(small.reserveAmmo).toBe(1);
    weapon.setInfiniteReserve();
    expect(weapon.restoreReserveShare(0.1)).toBe(false);
  });
});

describe('Radiant ring in a Zombies run', () => {
  it('puts the white ring on the thumb after the fourth ring, then lights the halo and the light bonuses', () => {
    const run = startRun();
    const { side, internals } = run;
    const handRings = vi.mocked(side.ctx.handRings);
    for (const id of RING_IDS.slice(0, -1)) {
      internals.rings.grant(id);
      internals.rings.update(3);
    }
    expect(moveSpeedScale(run)).toBe(1);
    internals.rings.grant(RING_IDS[RING_IDS.length - 1]);
    // The fourth ring goes on first; the thumb waits for the hands.
    expect(handRings.beginDonning).not.toHaveBeenCalledWith('thumb');
    expect(moveSpeedScale(run)).toBe(EFFECT.moveSpeedScale);
    internals.rings.update(3);
    expect(handRings.beginDonning).toHaveBeenLastCalledWith('thumb');
    expect(handRings.show).toHaveBeenLastCalledWith('thumb', 'charged', RADIANT_RING.glowColor);
    expect(internals.rings.isDonning).toBe(true);
    internals.rings.update(3);
    expect(side.hud.flashRing).toHaveBeenLastCalledWith('radiant');
    internals.rings.update(3);
    expect(vi.mocked(side.hud.setRadiance).mock.lastCall?.[0]).toBe(1);
    const hudRings = vi.mocked(side.hud.updateRings).mock.lastCall?.[0];
    expect(hudRings?.at(-1)).toEqual({ finger: 'thumb', nameKey: RADIANT_RING.nameKey, charged: true, glowColor: RADIANT_RING.glowColor });
  });

  it('pays a little more per kill, scavenges ammo and fades with Resurrection until recharged', () => {
    const run = startRun();
    const { side, internals } = run;
    wearAllRings(run);
    internals.onZombieKilled(false);
    expect(internals.economy.points).toBe(Math.round(50 * EFFECT.killPointsScale));

    side.weapon.reserveAmmo = 0;
    for (let kill = 1; kill < EFFECT.scavengeEveryKills; kill++) internals.onZombieKilled(false);
    expect(side.weapon.reserveAmmo).toBeGreaterThan(0);

    internals.health.damage(Number.MAX_SAFE_INTEGER);
    expect(internals.rings.tryResurrect(internals.health)).not.toBeNull();
    expect(moveSpeedScale(run)).toBe(1);
    expect(vi.mocked(side.ctx.handRings.show)).toHaveBeenLastCalledWith('thumb', 'spent', RADIANT_RING.glowColor);
    internals.rings.update(3);
    expect(vi.mocked(side.hud.setRadiance).mock.lastCall?.[0]).toBe(0);
    const before = internals.economy.points;
    internals.onZombieKilled(false);
    expect(internals.economy.points - before).toBe(50);

    vi.mocked(side.ctx.handRings.beginDonning).mockClear();
    internals.rings.grant('resurrection');
    expect(moveSpeedScale(run)).toBe(EFFECT.moveSpeedScale);
    // Already on the thumb: it lights up again instead of being put on twice.
    expect(side.ctx.handRings.beginDonning).not.toHaveBeenCalled();
    expect(side.ctx.handRings.pulse).toHaveBeenLastCalledWith('thumb', expect.any(Number));
    expect(side.ctx.handRings.show).toHaveBeenLastCalledWith('thumb', 'charged', RADIANT_RING.glowColor);

    run.mode.onRestartRequested();
    expect(moveSpeedScale(run)).toBe(1);
    expect(vi.mocked(side.hud.setRadiance).mock.lastCall?.[0]).toBe(0);
  });

  it('releases a white echo around the next bullet hit once primed', () => {
    const run = startRun();
    const { internals } = run;
    const splash = vi.spyOn(internals.zombies, 'applySplash').mockImplementation(() => {});
    vi.spyOn(internals.zombies, 'damageZombie').mockReturnValue(false);
    const object = new THREE.Object3D();
    object.userData.zombie = { isAlive: true };
    const weapon = new Weapon(WEAPON_DEFINITIONS.m1911);
    const hit = (): void => run.mode.onTargetHit({} as HitTarget, 5, POINT, POINT, object, weapon);

    for (let kill = 0; kill < EFFECT.echoEveryKills; kill++) internals.onZombieKilled(false);
    hit();
    expect(splash).not.toHaveBeenCalled();

    wearAllRings(run);
    for (let kill = 0; kill < EFFECT.echoEveryKills; kill++) internals.onZombieKilled(false);
    hit();
    const damage = WEAPON_DEFINITIONS.m1911.damage * internals.rings.damageScale;
    expect(splash).toHaveBeenCalledTimes(1);
    expect(splash).toHaveBeenLastCalledWith(POINT, EFFECT.echoRadius, damage * EFFECT.echoDamageShare, 'm1911');
    hit();
    expect(splash).toHaveBeenCalledTimes(1);
  });
});
