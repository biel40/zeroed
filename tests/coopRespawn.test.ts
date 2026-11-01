import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import type { PlayerHealth } from '../src/game/PlayerHealth';
import type { WeaponInventory } from '../src/game/WeaponInventory';
import { CoopRevive, DOWNED_DURATION } from '../src/modes/coop/CoopRevive';
import type { CoopWorld } from '../src/modes/coop/CoopWorld';
import type { CoopPlayerId, PlayerNetState } from '../src/network/Protocol';
import type { RemotePlayer } from '../src/rendering/RemotePlayer';
import type { RoundManager } from '../src/zombies/RoundManager';
import { installCanvasDocument, makeMatch, placePlayer, type CoopMatch } from './coopHarness';

interface HostInternals {
  readonly players: Record<CoopPlayerId, {
    readonly health: PlayerHealth;
    readonly life: CoopRevive;
    readonly economy: PlayerEconomy;
    kills: number;
    headshots: number;
    totalDamage: number;
  }>;
  readonly rounds: RoundManager;
  readonly world: CoopWorld;
  readonly guestInventory: WeaponInventory;
  readonly guestState: PlayerNetState | null;
  readonly guestAvatar: RemotePlayer;
  readonly phase: string;
  onPlayerAttacked(damage: number, target: CoopPlayerId): void;
}

const authorityOf = (match: CoopMatch): HostInternals => match.host as unknown as HostInternals;

function started(): CoopMatch {
  const match = makeMatch();
  match.host.onGameplayStarted();
  match.guest.onGameplayStarted();
  match.step(0.05, 2);
  // Keep round progression independent of the bleed-out clock in these cases.
  authorityOf(match).rounds.reset(60);
  return match;
}

function bleedOut(match: CoopMatch, slot: CoopPlayerId): void {
  authorityOf(match).onPlayerAttacked(100, slot);
  match.step(1, DOWNED_DURATION);
}

function startNextRound(match: CoopMatch): void {
  authorityOf(match).rounds.reset(0);
  match.step(0.05, 2);
}

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());
beforeEach(() => { vi.useFakeTimers({ toFake: ['performance'] }); });
afterEach(() => { vi.useRealTimers(); });

describe('cooperative round respawn', () => {
  it.each(['host', 'guest'] as const)('returns the dead %s at the next round with fresh health and starting arsenal', (slot) => {
    const match = started();
    const authority = authorityOf(match);
    const side = slot === 'host' ? match.hostSide : match.guestSide;
    const mode = slot === 'host' ? match.host : match.guest;
    const survivorSide = slot === 'host' ? match.guestSide : match.hostSide;
    const survivorPosition = survivorSide.player.rig.position.clone();
    const spawnPosition = side.player.rig.position.clone();
    placePlayer(side.player, spawnPosition.x + 7, spawnPosition.z);
    match.step(0.1, 10);
    const record = authority.players[slot];
    record.economy.awardKill(false);
    record.kills = 3;
    record.headshots = 2;
    record.totalDamage = 250;
    if (slot === 'guest') authority.guestInventory.grant('ak47');
    bleedOut(match, slot);
    expect(record.life.state).toBe('dead');
    expect(mode.isGameplayInputEnabled()).toBe(false);
    expect(mode.getCinematicCamera()).not.toBeNull();
    expect(mode.onMeleeAttack()).toBe(false);
    expect(mode.getInteractPrompt()).toBeNull();
    expect(authority.phase).toBe('playing');
    expect(match.hostSide.hud.showGameOver).not.toHaveBeenCalled();
    expect(match.guestSide.hud.showGameOver).not.toHaveBeenCalled();
    const resets = vi.mocked(side.ctx.resetArsenal).mock.calls.length;

    startNextRound(match);

    expect(record.life.state).toBe('alive');
    expect(record.health.hp).toBe(record.health.maxHp);
    expect(mode.isGameplayInputEnabled()).toBe(true);
    expect(mode.getCinematicCamera()).toBeNull();
    expect(side.hud.setSpectatorVisible).toHaveBeenLastCalledWith(false);
    expect(side.player.rig.position.toArray()).toEqual(spawnPosition.toArray());
    expect(survivorSide.player.rig.position.toArray()).toEqual(survivorPosition.toArray());
    expect(side.ctx.resetArsenal).toHaveBeenCalledTimes(resets + 1);
    expect(record.economy.points).toBe(50);
    expect(record.kills).toBe(3);
    expect(record.headshots).toBe(2);
    expect(record.totalDamage).toBe(250);
    if (slot === 'guest') {
      expect(authority.guestInventory.weapons).toEqual(['m1911']);
      expect(authority.guestState?.x).toBeCloseTo(spawnPosition.x);
      expect(authority.guestState?.z).toBeCloseTo(spawnPosition.z);
    }
    match.step(0.05, 5);
    expect(side.ctx.resetArsenal).toHaveBeenCalledTimes(resets + 1);
  });

  it('keeps a downed player revivable across the round boundary without resetting their arsenal', () => {
    const match = started();
    const authority = authorityOf(match);
    authority.onPlayerAttacked(100, 'guest');
    const resets = vi.mocked(match.guestSide.ctx.resetArsenal).mock.calls.length;
    startNextRound(match);
    expect(authority.players.guest.life.state).toBe('downed');
    expect(match.guestSide.ctx.resetArsenal).toHaveBeenCalledTimes(resets);
    expect(match.host.getInteractPrompt()).toContain('REVIVE PLAYER');
  });

  it('rejects an in-flight corpse pose before accepting the guest spawn confirmation, including during host pause', () => {
    const match = started();
    const authority = authorityOf(match);
    const spawn = match.guestSide.player.rig.position.clone();
    placePlayer(match.guestSide.player, spawn.x + 7, spawn.z);
    match.step(0.1, 10);
    bleedOut(match, 'guest');
    const corpse = authority.guestState!;
    authority.rounds.reset(0);
    match.host.update(0.05);
    match.relay.host.onMessage?.({ type: 'playerState', state: { ...corpse, t: corpse.t + 1 } });
    expect(authority.guestState).toBeNull();
    match.host.onLocalPauseChanged(true);
    match.relay.flush();
    expect(authority.guestState?.x).toBeCloseTo(spawn.x);
    expect(authority.guestState?.z).toBeCloseTo(spawn.z);
    expect(authority.guestAvatar.latest?.x).toBeCloseTo(spawn.x);
    expect(authority.guestAvatar.latest?.z).toBeCloseTo(spawn.z);
  });

  it('finishes a team wipe before processing a round start in the same tick', () => {
    const match = started();
    const authority = authorityOf(match);
    authority.onPlayerAttacked(100, 'host');
    authority.onPlayerAttacked(100, 'guest');
    authority.rounds.reset(DOWNED_DURATION);
    match.step(1, DOWNED_DURATION);
    expect(authority.players.host.life.state).toBe('dead');
    expect(authority.players.guest.life.state).toBe('dead');
    expect(authority.phase).toBe('gameOver');
    expect(match.hostSide.hud.showGameOver).toHaveBeenCalledOnce();
    expect(match.guestSide.hud.showGameOver).toHaveBeenCalledOnce();
  });

  it('clears the death lifecycle on a match restart while waiting for the next round', () => {
    const match = started();
    bleedOut(match, 'guest');
    match.host.onRestartRequested();
    match.step(0.05, 3);
    expect(authorityOf(match).players.guest.life.state).toBe('alive');
    expect(match.guest.isGameplayInputEnabled()).toBe(true);
    expect(authorityOf(match).guestInventory.weapons).toEqual(['m1911']);
  });
});
