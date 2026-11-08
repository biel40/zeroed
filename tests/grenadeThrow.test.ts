import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GRENADE_DEFINITIONS, LETHAL_GRENADE_LOADOUT } from '../src/config/grenades';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import { PlayerHealth } from '../src/game/PlayerHealth';
import { t } from '../src/i18n/i18n';
import { actionKey } from '../src/ui/InteractionPrompts';
import type { ZombiesGrenades } from '../src/modes/ZombiesGrenades';
import type { GrenadeBlasts } from '../src/modes/grenades/GrenadeBlasts';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { EYE_HEIGHT } from '../src/player/PlayerController';
import { isZombieNetState, parseGuestMessage, parseHostMessage } from '../src/network/Protocol';
import { blastDamageAt, guardianBlastDamage } from '../src/zombies/grenades/GrenadeBlast';
import { GRENADE_PIN_PROGRESS, GRENADE_RELEASE_PROGRESS, GRENADE_THROW_DURATION, GrenadeThrow } from '../src/weapons/GrenadeThrow';
import type { ZombieManager } from '../src/zombies/ZombieManager';
import type { Station33Arena } from '../src/zombies/maps/Station33Arena';
import { installCanvasDocument, makeContext } from './coopHarness';

const F1 = GRENADE_DEFINITIONS.f1;
const DT = 1 / 60;
let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

/** The grenade delegate as the tests read it: its public API plus the hand and the live grenades. */
type GrenadeInternals = Pick<ZombiesGrenades, 'update' | 'grantRound'> & {
  blasts: GrenadeBlasts<'player'>;
  hand: { count: number };
};

interface ModeInternals {
  arena: Station33Arena;
  economy: PlayerEconomy;
  zombies: ZombieManager;
  health: PlayerHealth;
  grenades: GrenadeInternals;
}

function startRun() {
  const side = makeContext();
  const mode = new ZombiesMode('station-33');
  mode.init(side.ctx);
  return { mode, side, internals: mode as unknown as ModeInternals };
}

function advance(grenades: GrenadeInternals, seconds: number): void {
  for (let time = 0; time < seconds; time += DT) grenades.update(DT, true);
}

describe('first-person grenade throw', () => {
  it('pulls the pin, lets go once at the release and gives the arm back', () => {
    const hand = new GrenadeThrow();
    const pin = vi.fn();
    const release = vi.fn();
    hand.onPinPulled = pin;
    hand.onRelease = release;
    expect(hand.start()).toBe(true);
    expect(hand.start()).toBe(false);
    let pinnedAt = -1;
    let releasedAt = -1;
    for (let time = 0; time < GRENADE_THROW_DURATION + 0.1; time += DT) {
      hand.update(DT, 0);
      if (pinnedAt < 0 && pin.mock.calls.length > 0) pinnedAt = time;
      if (releasedAt < 0 && release.mock.calls.length > 0) releasedAt = time;
      if (time > 0.2 && time < 0.4) {
        expect(hand.firearmLowering).toBe(1);
        expect(hand.armWeight).toBe(1);
      }
    }
    expect(pin).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(pinnedAt).toBeCloseTo(GRENADE_PIN_PROGRESS * GRENADE_THROW_DURATION, 1);
    expect(releasedAt).toBeCloseTo(GRENADE_RELEASE_PROGRESS * GRENADE_THROW_DURATION, 1);
    expect(hand.isThrowing).toBe(false);
    expect(hand.armWeight).toBe(0);
    expect(hand.firearmLowering).toBe(0);
    expect(hand.root.visible).toBe(false);
  });

  it('holds the grenade only until it leaves the hand', () => {
    const hand = new GrenadeThrow();
    const grenade = hand.root.getObjectByName('f1-grenade')!;
    hand.start();
    hand.update(GRENADE_THROW_DURATION * 0.3, 0);
    expect(grenade.visible).toBe(true);
    hand.update(GRENADE_THROW_DURATION * 0.3, 0);
    expect(grenade.visible).toBe(false);
  });

  it('a reset mid-throw lets nothing go', () => {
    const hand = new GrenadeThrow();
    const release = vi.fn();
    hand.onRelease = release;
    hand.start();
    hand.update(0.2, 0);
    hand.reset();
    hand.update(1, 0);
    expect(release).not.toHaveBeenCalled();
    expect(hand.isThrowing).toBe(false);
  });
});

describe('lethal grenades in a Zombies run', () => {
  it('starts with two, throws one that flies, bounces and goes off on its fuse', () => {
    const { mode, side, internals } = startRun();
    expect(side.hud.setLethalGrenades).toHaveBeenLastCalledWith(LETHAL_GRENADE_LOADOUT.starting, LETHAL_GRENADE_LOADOUT.max);
    const explosion = vi.spyOn(internals.zombies, 'applyExplosion');
    expect(mode.onLethalThrow()).toBe(true);
    expect(mode.onLethalThrow()).toBe(false);
    expect(mode.usesFallbackAttack()).toBe(true);
    expect(mode.getMeleeArm()).not.toBeNull();
    advance(internals.grenades, GRENADE_THROW_DURATION);
    expect(internals.grenades.blasts.liveCount).toBe(1);
    expect(side.hud.setLethalGrenades).toHaveBeenLastCalledWith(1, LETHAL_GRENADE_LOADOUT.max);
    expect(side.ctx.audio.playGrenadePinPull).toHaveBeenCalled();
    expect(side.ctx.audio.playGrenadeThrow).toHaveBeenCalled();
    advance(internals.grenades, F1.fuseSeconds);
    expect(internals.grenades.blasts.liveCount).toBe(0);
    expect(explosion).toHaveBeenCalledOnce();
    expect(explosion.mock.calls[0][2]).toBe('f1');
    expect(side.ctx.audio.playGrenadeExplosion).toHaveBeenCalledOnce();
  });

  it('keeps the knife and the grenade out of each other\'s way, and refuses an empty pouch', () => {
    const { mode, internals } = startRun();
    expect(mode.onLethalThrow()).toBe(true);
    expect(mode.onMeleeAttack()).toBe(false);
    advance(internals.grenades, GRENADE_THROW_DURATION);
    expect(mode.onLethalThrow()).toBe(true);
    advance(internals.grenades, GRENADE_THROW_DURATION);
    expect(internals.grenades.hand.count).toBe(0);
    expect(mode.onLethalThrow()).toBe(false);
    expect(mode.onMeleeAttack()).toBe(true);
    expect(mode.onLethalThrow()).toBe(false);
  });

  it('a new round tops the pouch up and a restart brings back the starting two with nothing live', () => {
    const { mode, internals } = startRun();
    mode.onLethalThrow();
    advance(internals.grenades, GRENADE_THROW_DURATION);
    internals.grenades.grantRound();
    expect(internals.grenades.hand.count).toBe(LETHAL_GRENADE_LOADOUT.max - 1);
    mode.onRestartRequested();
    expect(internals.grenades.hand.count).toBe(LETHAL_GRENADE_LOADOUT.starting);
    expect(internals.grenades.blasts.liveCount).toBe(0);
  });

  it('sells a full pouch on the Station 33 grenade wall', () => {
    const { mode, side, internals } = startRun();
    const buy = internals.arena.grenadeBuys[0];
    side.player.teleport(buy.position.x - 1.2, EYE_HEIGHT, buy.position.z, 0);
    side.player.face(-Math.PI / 2);
    side.player.rig.updateMatrixWorld(true);
    expect(mode.getInteractPrompt()).toBe(t('prompt.buyGrenades', { key: actionKey(false), grenade: t(F1.nameKey), cost: buy.cost }));
    mode.onInteract();
    expect(side.hud.flashNotEnoughPoints).toHaveBeenCalled();
    expect(internals.grenades.hand.count).toBe(LETHAL_GRENADE_LOADOUT.starting);
    for (let points = 0; points < buy.cost * 2; points += 10) internals.economy.awardRepair();
    mode.onInteract();
    expect(internals.economy.points).toBe(buy.cost);
    expect(internals.grenades.hand.count).toBe(LETHAL_GRENADE_LOADOUT.max);
    mode.onInteract();
    expect(side.hud.showRoundBanner).toHaveBeenLastCalledWith(t('banner.grenadesFull'));
    expect(internals.economy.points).toBe(buy.cost);
  });
});

describe('cooking a grenade', () => {
  it('holds the arm cocked at the wind-up while held, and throws once let go', () => {
    const hand = new GrenadeThrow();
    const release = vi.fn();
    hand.onRelease = release;
    hand.start();
    for (let time = 0; time < 1.5; time += DT) hand.update(DT, 0, true);
    expect(hand.isCooking).toBe(true);
    expect(release).not.toHaveBeenCalled();
    for (let time = 0; time < GRENADE_THROW_DURATION; time += DT) hand.update(DT, 0, false);
    expect(release).toHaveBeenCalledOnce();
    expect(hand.isThrowing).toBe(false);
  });

  it('throws a cooked grenade with only the fuse it has left, ticking every second', () => {
    const { mode, side, internals } = startRun();
    let held = true;
    side.ctx.input.isDown = (code: string): boolean => held && code === 'KeyG';
    const launch = vi.spyOn(internals.grenades.blasts, 'launch');
    expect(mode.onLethalThrow()).toBe(true);
    advance(internals.grenades, 1.6);
    expect(launch).not.toHaveBeenCalled();
    expect(side.ctx.audio.playGrenadeCookTick).toHaveBeenCalled();
    held = false;
    advance(internals.grenades, GRENADE_THROW_DURATION);
    expect(launch).toHaveBeenCalledOnce();
    const fuse = launch.mock.calls[0][1].fuse;
    expect(fuse).toBeGreaterThan(0);
    expect(fuse).toBeLessThan(F1.fuseSeconds - 1.2);
    expect(internals.grenades.hand.count).toBe(LETHAL_GRENADE_LOADOUT.starting - 1);
  });

  it('goes off in the hand when held past its fuse, and hurts the thrower', () => {
    const { mode, side, internals } = startRun();
    side.ctx.input.isDown = (code: string): boolean => code === 'KeyG';
    const launch = vi.spyOn(internals.grenades.blasts, 'launch');
    const explosion = vi.spyOn(internals.zombies, 'applyExplosion');
    mode.onLethalThrow();
    advance(internals.grenades, F1.fuseSeconds + 0.3);
    expect(launch).toHaveBeenCalledOnce();
    expect(launch.mock.calls[0][1].fuse).toBe(0);
    expect(explosion).toHaveBeenCalledOnce();
    expect(side.hud.flashDamage).toHaveBeenCalled();
    expect(internals.health.isDead).toBe(true);
    expect(mode.getMeleeArm()).toBeNull();
  });

  it('a blast reaches the guardian through the mode, with the run\'s damage scale', () => {
    const { mode, internals } = startRun();
    const guardian = (internals as unknown as { evacuation: { guardian: { blast: (...args: unknown[]) => boolean } } })
      .evacuation.guardian;
    const blast = vi.spyOn(guardian, 'blast').mockReturnValue(true);
    mode.onLethalThrow();
    advance(internals.grenades, GRENADE_THROW_DURATION + F1.fuseSeconds);
    expect(blast).toHaveBeenCalledOnce();
    expect(blast.mock.calls[0][1]).toBe(F1.blast);
    expect(blast.mock.calls[0][2]).toBe(1);
  });

  it('hurts the guardian far more than a zombie, wrapping around its shield', () => {
    expect(guardianBlastDamage(F1.blast, 0)).toBe(F1.blast.guardianDamage);
    expect(guardianBlastDamage(F1.blast, 2)).toBeGreaterThan(blastDamageAt(F1.blast, 2));
    expect(guardianBlastDamage(F1.blast, F1.blast.radius)).toBe(0);
  });
});

describe('a blast at point blank', () => {
  it('pierces the post-hit window, which still stops ordinary hits', () => {
    const health = new PlayerHealth(75, 0.45);
    expect(health.damage(25)).toBe(true);
    expect(health.damage(25)).toBe(false);
    expect(health.damage(1_000_000, true)).toBe(true);
    expect(health.isDead).toBe(true);
  });

  it('still respects developer invincibility', () => {
    const health = new PlayerHealth(75, 0.45);
    health.setInvincible(true);
    expect(health.damage(1_000_000, true)).toBe(false);
  });
});

describe('grenades on the co-op wire', () => {
  const launch = { from: { x: 0, y: 1.7, z: 0 }, origin: { x: 0.1, y: 1.6, z: -0.3 }, aim: { x: 0, y: 0, z: -1 }, fuse: 2.5, floorY: 0 };

  it('accepts a well-formed throw and drops malformed ones', () => {
    expect(parseGuestMessage({ type: 'grenadeThrow', launch })).toEqual({ type: 'grenadeThrow', launch });
    expect(parseHostMessage({ type: 'grenadeThrow', launch })).toEqual({ type: 'grenadeThrow', launch });
    expect(parseGuestMessage({ type: 'grenadeThrow', launch: { ...launch, fuse: 99 } })).toBeNull();
    expect(parseGuestMessage({ type: 'grenadeThrow', launch: { ...launch, aim: { x: 0, y: 0, z: -5 } } })).toBeNull();
    expect(parseGuestMessage({ type: 'mapUse', kind: 'grenades', id: 'wall', equippedWeapon: 'm1911' }))
      .toEqual({ type: 'mapUse', kind: 'grenades', id: 'wall', equippedWeapon: 'm1911' });
  });

  it('keeps the grenade as the killing source and the crippled flag of a zombie', () => {
    const death = parseHostMessage({ type: 'zombieDeath', zombieId: 3, killer: 'guest', style: 'blown', source: 'f1', impactX: 0, impactZ: -1 });
    expect(death).toMatchObject({ style: 'blown', source: 'f1' });
    const zombie = { id: 1, type: 'normal', x: 0, y: 0, z: 0, yaw: 0, floor: 0, scale: 1, hp: 10, maxHp: 10, state: 'walk', crippled: true };
    expect(isZombieNetState(zombie)).toBe(true);
    expect(isZombieNetState({ ...zombie, crippled: 'yes' })).toBe(false);
  });
});
