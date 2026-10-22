import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import type { PlayerHealth } from '../src/game/PlayerHealth';
import { RING_DEFINITIONS } from '../src/game/rings/RingCatalog';
import { EYE_HEIGHT } from '../src/player/PlayerController';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { ZombieArena } from '../src/zombies/maps/ZombieArena';
import { PLAYER_MAX_HP } from '../src/zombies/ZombieConfig';
import type { ZombieManager } from '../src/zombies/ZombieManager';
import { installCanvasDocument, makeContext, type TestContext } from './coopHarness';

const RESURRECTION = RING_DEFINITIONS.resurrection;
const [FIRST_PRICE, SECOND_PRICE, THIRD_PRICE] = RESURRECTION.prices;
const { getUp: GET_UP, untargetable: UNTARGETABLE, invulnerability: INVULNERABILITY } = RESURRECTION.effect;
const LETHAL = 10_000;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

interface ModeInternals {
  arena: ZombieArena;
  economy: PlayerEconomy;
  health: PlayerHealth;
  gameOver: boolean;
  onPlayerHit(damage: number): void;
  zombies: ZombieManager;
  rings: { update(dt: number): void };
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

/** Stands in front of the luggage office's ring locker, looking into it. */
function faceRingLocker({ internals, side }: { internals: ModeInternals; side: TestContext }): void {
  const [machine] = internals.arena.ringMachines!;
  side.player.teleport(machine.position.x - 0.5, EYE_HEIGHT, machine.position.z, 0);
  side.player.face(-Math.PI / 2);
  side.player.rig.updateMatrixWorld(true);
}

describe('Resurrection ring', () => {
  it('is sold at its locker for its price and worn on the ring finger', () => {
    const run = startRun();
    const { mode, internals, side } = run;
    faceRingLocker(run);
    expect(mode.getInteractPrompt()).toContain(`${FIRST_PRICE}`);

    fund(internals.economy, FIRST_PRICE - 10);
    mode.onInteract();
    expect(side.hud.flashNotEnoughPoints).toHaveBeenCalled();
    expect(side.ctx.handRings.show).not.toHaveBeenCalled();

    fund(internals.economy, 10);
    mode.onInteract();
    expect(internals.economy.points).toBe(0);
    expect(side.ctx.handRings.show).toHaveBeenLastCalledWith('ring', 'charged', RESURRECTION.glowColor);
    expect(side.ctx.audio.playRingPurchase).toHaveBeenCalledOnce();
    expect(side.hud.updateRings).toHaveBeenLastCalledWith([{ finger: 'ring', nameKey: RESURRECTION.nameKey, charged: true, glowColor: RESURRECTION.glowColor }]);
    // Nothing more to sell while the ring is charged.
    expect(mode.getInteractPrompt()).toBeNull();
  });

  it('takes a lethal hit instead of the run: half health, invulnerable, ring spent', () => {
    const run = startRun();
    const { internals, side } = run;
    faceRingLocker(run);
    fund(internals.economy, FIRST_PRICE);
    run.mode.onInteract();

    internals.onPlayerHit(LETHAL);
    expect(internals.gameOver).toBe(false);
    expect(side.hud.showGameOver).not.toHaveBeenCalled();
    expect(internals.health.hp).toBe(PLAYER_MAX_HP * RESURRECTION.effect.reviveFraction);
    expect(internals.health.isInvulnerable).toBe(true);
    expect(side.ctx.audio.playResurrection).toHaveBeenCalledOnce();
    expect(side.hud.flashRing).toHaveBeenCalledOnce();
    expect(side.ctx.handRings.show).toHaveBeenLastCalledWith('ring', 'spent', RESURRECTION.glowColor);

    // Still inside the invulnerability window: the next blow does nothing.
    internals.onPlayerHit(LETHAL);
    expect(internals.health.hp).toBe(PLAYER_MAX_HP * RESURRECTION.effect.reviveFraction);
    internals.health.update(RESURRECTION.effect.invulnerability - 0.1);
    expect(internals.health.isInvulnerable).toBe(true);
    internals.health.update(0.2);

    // A second lethal hit with the ring spent ends the run as before.
    internals.onPlayerHit(LETHAL);
    expect(internals.gameOver).toBe(true);
    expect(side.hud.showGameOver).toHaveBeenCalledOnce();
  });

  it('recharges a spent ring at the same locker for the recharge price', () => {
    const run = startRun();
    const { mode, internals, side } = run;
    faceRingLocker(run);
    fund(internals.economy, FIRST_PRICE);
    mode.onInteract();
    internals.onPlayerHit(LETHAL);
    internals.rings.update(GET_UP);
    internals.health.update(RESURRECTION.effect.invulnerability + 0.1);

    expect(mode.getInteractPrompt()).toContain(`${SECOND_PRICE}`);
    fund(internals.economy, SECOND_PRICE);
    mode.onInteract();
    expect(internals.economy.points).toBe(0);
    expect(side.ctx.audio.playRingRecharge).toHaveBeenCalledOnce();
    expect(side.ctx.handRings.show).toHaveBeenLastCalledWith('ring', 'charged', RESURRECTION.glowColor);

    internals.onPlayerHit(LETHAL);
    expect(internals.gameOver).toBe(false);
  });

  it('ends the run on a lethal hit without a ring, exactly as before', () => {
    const { internals, side } = startRun();
    internals.onPlayerHit(LETHAL);
    expect(internals.gameOver).toBe(true);
    expect(side.hud.showGameOver).toHaveBeenCalledOnce();
    expect(side.ctx.audio.playResurrection).not.toHaveBeenCalled();
  });

  it('god mode (MOTDRULES) grants no ring, buys one for free and never spends it; restart clears it', () => {
    const run = startRun();
    const { mode, internals, side } = run;
    for (const key of 'MOTDRULES') mode.onKeyInput(key);
    expect(side.ctx.handRings.show).not.toHaveBeenCalled();
    faceRingLocker(run);
    mode.onInteract();
    expect(internals.economy.points).toBe(0);
    expect(side.ctx.handRings.show).toHaveBeenLastCalledWith('ring', 'charged', RESURRECTION.glowColor);
    internals.onPlayerHit(LETHAL);
    expect(internals.health.hp).toBe(PLAYER_MAX_HP);
    expect(side.ctx.audio.playResurrection).not.toHaveBeenCalled();
    mode.onRestartRequested();
    expect(side.hud.updateRings).toHaveBeenLastCalledWith([]);
    internals.onPlayerHit(LETHAL);
    expect(internals.gameOver).toBe(true);
  });

  it('gets the player back up slowly: looking around only, then full control', () => {
    const run = startRun();
    const { mode, internals, side } = run;
    faceRingLocker(run);
    fund(internals.economy, FIRST_PRICE);
    mode.onInteract();

    internals.onPlayerHit(LETHAL);
    expect(mode.isGameplayInputEnabled()).toBe(false);
    expect(mode.isDownedLookEnabled()).toBe(true);
    expect(mode.getInteractPrompt()).toBeNull();
    internals.rings.update(GET_UP * 0.3);
    expect(side.player.camera.position.y).toBeLessThan(-0.5);
    internals.rings.update(GET_UP);
    expect(mode.isGameplayInputEnabled()).toBe(true);
    expect(mode.isDownedLookEnabled()).toBe(false);
  });

  it('keeps the player invulnerable for 2.5 s and off the horde radar until 2 s after standing up', () => {
    const run = startRun();
    const { mode, internals } = run;
    faceRingLocker(run);
    fund(internals.economy, FIRST_PRICE);
    mode.onInteract();
    expect(internals.zombies.isHostIgnored).toBe(false);

    internals.onPlayerHit(LETHAL);
    expect(INVULNERABILITY).toBe(2.5);
    internals.health.update(INVULNERABILITY - 0.1);
    expect(internals.health.isInvulnerable).toBe(true);
    internals.health.update(0.2);
    expect(internals.health.isInvulnerable).toBe(false);

    expect(internals.zombies.isHostIgnored).toBe(true);
    internals.zombies.update(GET_UP + UNTARGETABLE - 0.1, 0, 0);
    expect(internals.zombies.isHostIgnored).toBe(true);
    internals.zombies.update(0.2, 0, 0);
    expect(internals.zombies.isHostIgnored).toBe(false);
  });

  it('sells three purchases a run at doubling prices, then the locker stays empty', () => {
    const run = startRun();
    const { mode, internals, side } = run;
    faceRingLocker(run);
    const dieAndStandUp = (): void => {
      internals.onPlayerHit(LETHAL);
      expect(internals.gameOver).toBe(false);
      internals.rings.update(GET_UP);
      internals.health.update(INVULNERABILITY + 0.1);
    };
    for (const price of [FIRST_PRICE, SECOND_PRICE, THIRD_PRICE]) {
      expect(mode.getInteractPrompt()).toContain(`${price}`);
      fund(internals.economy, price);
      mode.onInteract();
      expect(internals.economy.points).toBe(0);
      dieAndStandUp();
    }
    expect([FIRST_PRICE, SECOND_PRICE, THIRD_PRICE]).toEqual([500, 1000, 2000]);
    expect(mode.getInteractPrompt()).toBeNull();
    expect(internals.arena.group.getObjectByName('locker-ring')!.visible).toBe(false);
    expect(side.hud.updateRings).toHaveBeenLastCalledWith([expect.objectContaining({ charged: false })]);

    internals.onPlayerHit(LETHAL);
    expect(internals.gameOver).toBe(true);
  });

  it('restart takes the ring off and puts it back in its locker', () => {
    const run = startRun();
    const { mode, internals, side } = run;
    faceRingLocker(run);
    fund(internals.economy, FIRST_PRICE);
    mode.onInteract();

    mode.onRestartRequested();
    expect(side.ctx.handRings.clear).toHaveBeenCalled();
    expect(side.hud.updateRings).toHaveBeenLastCalledWith([]);
    expect(internals.arena.group.getObjectByName('locker-ring')!.visible).toBe(true);
    faceRingLocker(run);
    expect(mode.getInteractPrompt()).toContain(`${FIRST_PRICE}`);

    internals.onPlayerHit(LETHAL);
    expect(internals.gameOver).toBe(true);
  });
});
