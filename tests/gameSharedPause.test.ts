import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/core/Game';

type Stub = Record<string, any>;
const prototype = Game.prototype as unknown as Record<string, (this: Stub, ...args: unknown[]) => void>;

function stubGame(sharedSimulation: boolean, paused: boolean): { game: Stub; weapon: Stub } {
  const weapon = {
    update: vi.fn(),
    pendingEvents: [],
    clearEvents: vi.fn(),
    currentSpread: () => 0,
  };
  const game: Stub = Object.create(Game.prototype);
  Object.assign(game, {
    clock: { getDelta: () => 0.016 },
    paused,
    mode: { id: 'zombies', sharedSimulation, update: vi.fn(), isGameplayInputEnabled: () => true },
    renderer: { render: vi.fn() },
    scene: {},
    player: { camera: { fov: 75 }, update: vi.fn(), speed01: 0 },
    input: {
      endFrame: vi.fn(), pointerLocked: true, wasPressed: () => false,
      leftButtonDown: true, rightButtonDown: false, repeatSemiAuto: false, mouseDeltaX: 0, mouseDeltaY: 0,
    },
    profile: { useTouchControls: false },
    inventory: { currentWeapon: 'm1911', weapons: ['m1911'] },
    arsenal: new Map([['m1911', { weapon, view: { root: { visible: true }, update: vi.fn() } }]]),
    frameInput: { trigger: false, ads: false, repeatSemiAuto: false },
    ballistics: { update: vi.fn() },
    effects: { update: vi.fn() },
    magazineDrops: { update: vi.fn() },
    flashLight: { intensity: 0 },
    viewportHeight: 100,
    hud: { update: vi.fn(), setInteractionPrompt: vi.fn() },
    debugElement: null,
  });
  return { game, weapon };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('local pause vs shared simulation', () => {
  it('halts the whole simulation behind the single-player pause menu', () => {
    const { game, weapon } = stubGame(false, true);
    prototype.frame.call(game);
    expect(game.mode.update).not.toHaveBeenCalled();
    expect(game.player.update).not.toHaveBeenCalled();
    expect(weapon.update).not.toHaveBeenCalled();
    expect(game.renderer.render).toHaveBeenCalledOnce();
  });

  it('keeps a shared match running while this player has the menu open', () => {
    const { game, weapon } = stubGame(true, true);
    prototype.frame.call(game);
    expect(game.mode.update).toHaveBeenCalledOnce();
    expect(game.player.update).toHaveBeenCalledWith(0.016, game.input, weapon, false);
    expect(weapon.update).toHaveBeenCalledWith(0.016, expect.objectContaining({ trigger: false }));
    expect(game.ballistics.update).toHaveBeenCalledOnce();
    expect(game.effects.update).toHaveBeenCalledOnce();
  });

  it('restores local input once the shared-match menu closes', () => {
    const { game, weapon } = stubGame(true, false);
    prototype.frame.call(game);
    expect(game.player.update).toHaveBeenCalledWith(0.016, game.input, weapon, true);
    expect(weapon.update).toHaveBeenCalledWith(0.016, expect.objectContaining({ trigger: true }));
  });

  it('ignores a repeated lock notification while playing instead of forcing a pause loop', () => {
    const exitPointerLock = vi.fn();
    vi.stubGlobal('document', { exitPointerLock });
    const game: Stub = Object.create(Game.prototype);
    Object.assign(game, { paused: false, pointerLockRequested: false, gameplayStarted: true, profile: { useTouchControls: false } });
    prototype.handlePointerLockChange.call(game, true);
    expect(exitPointerLock).not.toHaveBeenCalled();
    game.paused = true;
    prototype.handlePointerLockChange.call(game, true);
    expect(exitPointerLock).toHaveBeenCalledOnce();
  });
});

describe('game disposal', () => {
  it('removes every page-level listener, the loop, the GL context and audio exactly once', () => {
    const documentStub = { removeEventListener: vi.fn(), pointerLockElement: null, exitPointerLock: vi.fn() };
    const windowStub = { removeEventListener: vi.fn(), visualViewport: { removeEventListener: vi.fn() } };
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('window', windowStub);
    const game: Stub = Object.create(Game.prototype);
    const escape = vi.fn();
    const resize = vi.fn();
    const renderer = {
      setAnimationLoop: vi.fn(), dispose: vi.fn(), forceContextLoss: vi.fn(), domElement: { remove: vi.fn() },
    };
    Object.assign(game, {
      disposed: false,
      renderer,
      input: { dispose: vi.fn() },
      handleEscapeKey: escape,
      handleResize: resize,
      resizeObserver: { disconnect: vi.fn() },
      debugElement: null,
      audio: { dispose: vi.fn() },
      scene: { environment: { dispose: vi.fn() } },
    });
    const observer = game.resizeObserver;
    prototype.dispose.call(game);
    prototype.dispose.call(game);
    expect(renderer.setAnimationLoop).toHaveBeenCalledWith(null);
    expect(game.input.dispose).toHaveBeenCalledOnce();
    expect(documentStub.removeEventListener).toHaveBeenCalledWith('keydown', escape);
    expect(windowStub.removeEventListener).toHaveBeenCalledWith('resize', resize);
    expect(windowStub.removeEventListener).toHaveBeenCalledWith('orientationchange', resize);
    expect(windowStub.visualViewport.removeEventListener).toHaveBeenCalledWith('resize', resize);
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(game.audio.dispose).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(renderer.domElement.remove).toHaveBeenCalledOnce();
  });
});
