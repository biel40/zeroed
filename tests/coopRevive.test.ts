import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoopRevive, DOWNED_DURATION, isDownedBodyInRange, REVIVE_DURATION, REVIVE_HEALTH_PERCENT } from '../src/modes/coop/CoopRevive';
import { applyMobileAction } from '../src/player/MobileInput';
import { InputState } from '../src/player/InputState';
import { TEST_PROFILE } from './coopHarness';
import { installCanvasDocument, makeMatch, placePlayer } from './coopHarness';

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());
beforeEach(() => { vi.useFakeTimers({ toFake: ['performance'] }); });
afterEach(() => { vi.useRealTimers(); });

type Authority = {
  players: Record<'host' | 'guest', { health: { hp: number; maxHp: number }; life: CoopRevive }>;
  onPlayerAttacked(damage: number, target: 'host' | 'guest'): void;
};

function started() {
  const match = makeMatch();
  match.host.onGameplayStarted();
  match.guest.onGameplayStarted();
  match.step(0.05, 2);
  return match;
}

describe('cooperative revive', () => {
  it('downed guest is revived by the host interaction at partial health', () => {
    const match = started();
    const authority = match.host as unknown as Authority;
    authority.onPlayerAttacked(100, 'guest');
    match.relay.flush();
    expect(authority.players.guest.life.state).toBe('downed');
    expect(match.guest.isGameplayInputEnabled()).toBe(false);
    expect(match.host.getInteractPrompt()).toContain('REVIVE PLAYER');
    match.host.onInteract();
    expect(authority.players.guest.life.reviver).toBe('host');
    expect(match.host.isCombatInputEnabled()).toBe(false);
    match.step(0.05, Math.ceil(REVIVE_DURATION / 0.05));
    expect(authority.players.guest.life.state).toBe('alive');
    expect(authority.players.guest.health.hp).toBe(authority.players.guest.health.maxHp * REVIVE_HEALTH_PERCENT);
    expect(match.guest.isGameplayInputEnabled()).toBe(true);
    expect(match.relay.sent('host', 'reviveCompleted')).toHaveLength(1);
  });

  it('bleeds out through the existing game-over path when no teammate revives', () => {
    const match = started();
    const authority = match.host as unknown as Authority;
    authority.onPlayerAttacked(100, 'host');
    authority.onPlayerAttacked(100, 'guest');
    match.step(0.05, Math.ceil(DOWNED_DURATION / 0.05));
    expect(authority.players.host.life.state).toBe('dead');
    expect(authority.players.guest.life.state).toBe('dead');
    expect(match.hostSide.hud.showGameOver).toHaveBeenCalledOnce();
  });

  it('cancels a revive when the reviver walks out of range while bleeding continues', () => {
    const match = started();
    const authority = match.host as unknown as Authority;
    authority.onPlayerAttacked(100, 'guest');
    match.host.onInteract();
    const before = authority.players.guest.life.bleedRemaining;
    placePlayer(match.hostSide.player, 8, 8);
    match.step(0.05, 2);
    expect(authority.players.guest.life.reviver).toBeNull();
    expect(authority.players.guest.life.state).toBe('downed');
    expect(authority.players.guest.life.bleedRemaining).toBeLessThan(before);
  });

  it('lets the guest use the same interaction to revive the host', () => {
    const match = started();
    const authority = match.host as unknown as Authority;
    authority.onPlayerAttacked(100, 'host');
    match.relay.flush();
    const hostPosition = match.hostSide.player.rig.position;
    placePlayer(match.guestSide.player, hostPosition.x, hostPosition.z - 2.5);
    match.step(0.05, 2);
    expect(match.guest.getInteractPrompt()).toContain('REVIVE PLAYER');
    match.guest.onInteract();
    match.relay.flush();
    expect(authority.players.host.life.reviver).toBe('guest');
    match.step(0.05, Math.ceil(REVIVE_DURATION / 0.05));
    expect(authority.players.host.life.state).toBe('alive');
    expect(match.relay.sent('host', 'reviveCompleted')).toHaveLength(1);
  });

  it('offers revival beside the visible prone body even when its standing anchor is farther away', () => {
    const match = started();
    const authority = match.host as unknown as Authority;
    authority.onPlayerAttacked(100, 'guest');
    const guestState = (match.host as unknown as { guestState: { x: number; z: number } }).guestState;
    placePlayer(match.hostSide.player, guestState.x, guestState.z - 2.5);
    expect(match.host.getInteractPrompt()).toContain('REVIVE PLAYER');
    match.host.onInteract();
    expect(authority.players.guest.life.reviver).toBe('host');
    expect(isDownedBodyInRange(guestState.x + 2.1, guestState.z, guestState.x, guestState.z, 0)).toBe(false);
  });

  it('keeps a connected downed guest revivable when their background tab stops sending movement', () => {
    const match = started();
    const authority = match.host as unknown as Authority;
    authority.onPlayerAttacked(100, 'guest');
    vi.advanceTimersByTime(1000);
    expect(match.host.getInteractPrompt()).toContain('REVIVE PLAYER');
    match.host.onInteract();
    expect(authority.players.guest.life.reviver).toBe('host');
    for (let frame = 0; frame < Math.ceil(REVIVE_DURATION / 0.05); frame++) {
      vi.advanceTimersByTime(50);
      match.host.update(0.05);
    }
    expect(authority.players.guest.life.state).toBe('alive');
  });

  it('cancels when the reviver is downed and when the guest disconnects', () => {
    const match = started();
    const authority = match.host as unknown as Authority;
    authority.onPlayerAttacked(100, 'guest');
    match.host.onInteract();
    authority.onPlayerAttacked(100, 'host');
    match.step();
    expect(authority.players.guest.life.reviver).toBeNull();
    match.relay.presence('host', 'peerLeft');
    expect(authority.players.guest.life.state).toBe('alive');
  });

  it('accepts only one reviver and gives bleed-out priority over a late completion', () => {
    const life = new CoopRevive();
    life.down();
    expect(life.start('host')).toBe(true);
    expect(life.start('guest')).toBe(false);
    expect(life.update(DOWNED_DURATION, true)).toBe('dead');
    expect(life.start('guest')).toBe(false);
  });

  it('shows the downed presentation and routes touch USE through the shared interaction', () => {
    const match = started();
    Object.defineProperty(match.hostSide.ctx, 'profile', { value: { ...TEST_PROFILE, useTouchControls: true } });
    Object.defineProperty(match.guestSide.ctx, 'profile', { value: { ...TEST_PROFILE, useTouchControls: true } });
    const authority = match.host as unknown as Authority;
    authority.onPlayerAttacked(100, 'guest');
    match.relay.flush();
    match.guest.update(0.05);
    expect(match.guestSide.hud.setDownedState).toHaveBeenCalledWith('downed', expect.any(Number), 0);
    match.guestSide.player.update(0.3, match.guestSide.ctx.input, match.guestSide.weapon, false);
    expect(match.guestSide.player.camera.position.y).toBeLessThan(-0.5);
    expect(match.host.getInteractPrompt()).toContain('Tap USE');
    const touch = new InputState();
    applyMobileAction(touch, 'interact', true);
    expect(touch.wasPressed('KeyE')).toBe(true);
    match.host.onInteract();
    expect(authority.players.guest.life.reviver).toBe('host');
  });
});
