import { afterEach, describe, expect, it, vi } from 'vitest';
import { DynamicResolution } from '../src/core/DynamicResolution';
import { Game } from '../src/core/Game';
import { KNIFE_ATTACK_DURATION, Knife } from '../src/weapons/Knife';

type Stub = Record<string, any>;
const prototype = Game.prototype as unknown as Record<string, (this: Stub, ...args: unknown[]) => void>;

function stubGame(sharedSimulation: boolean, paused: boolean): { game: Stub; weapon: Stub } {
  const weapon = {
    update: vi.fn(),
    inspect: vi.fn(),
    cancelInspect: vi.fn(),
    pendingEvents: [],
    clearEvents: vi.fn(),
    currentSpread: () => 0,
    heat: { intensity: 0 },
    definition: {},
  };
  const view = {
    root: { visible: true },
    // The real view recomputes scope visibility on every update.
    update: vi.fn(() => { view.root.visible = true; }),
    getMuzzleWorldPosition: vi.fn(),
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
    arsenal: new Map([['m1911', { weapon, view }]]),
    frameInput: { trigger: false, ads: false, repeatSemiAuto: false },
    ballistics: { update: vi.fn() },
    effects: { update: vi.fn() },
    audio: { setFlameStream: vi.fn() },
    barrelSmoke: { update: vi.fn() },
    magazineDrops: { update: vi.fn() },
    viewArms: { root: { visible: true }, update: vi.fn() },
    flashLight: { intensity: 0 },
    viewportHeight: 100,
    hud: { update: vi.fn(), setInteractionPrompt: vi.fn() },
    debugElement: null,
    dynamicResolution: new DynamicResolution(),
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

  it('stops the shared simulation while the host pause is active', () => {
    const { game, weapon } = stubGame(true, false);
    game.mode.isSimulationPaused = () => true;
    prototype.frame.call(game);
    expect(game.mode.update).not.toHaveBeenCalled();
    expect(game.player.update).not.toHaveBeenCalled();
    expect(weapon.update).not.toHaveBeenCalled();
    expect(game.renderer.render).toHaveBeenCalledOnce();
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

describe('weapon inspection input', () => {
  const pressing = (code: string) => (pressed: string): boolean => pressed === code;

  it('inspects the weapon on F with mouse and keyboard', () => {
    const { game, weapon } = stubGame(false, false);
    game.input.wasPressed = pressing('KeyF');
    prototype.frame.call(game);
    expect(weapon.inspect).toHaveBeenCalledOnce();
  });

  it('never inspects with touch controls', () => {
    const { game, weapon } = stubGame(false, false);
    game.profile.useTouchControls = true;
    game.input.wasPressed = pressing('KeyF');
    prototype.frame.call(game);
    expect(weapon.inspect).not.toHaveBeenCalled();
  });

  it('ends the inspection for the knife and while combat input is gated', () => {
    const knife = stubGame(false, false);
    knife.game.mode.onMeleeAttack = vi.fn();
    knife.game.input.wasPressed = pressing('Digit3');
    prototype.frame.call(knife.game);
    expect(knife.weapon.cancelInspect).toHaveBeenCalled();

    const menu = stubGame(true, true);
    prototype.frame.call(menu.game);
    expect(menu.weapon.cancelInspect).toHaveBeenCalled();
  });
});

describe('cinematic first-person visibility', () => {
  it.each([
    [false, false], [false, true], [true, false], [true, true],
  ])('keeps the firearm visible through the smooth knife recovery (shared: %s, touch: %s)', (shared, touch) => {
    const { game, weapon } = stubGame(shared, false);
    game.profile.useTouchControls = touch;
    const knife = new Knife();
    knife.setEnabled(true);
    knife.trigger();
    game.mode.usesFallbackAttack = () => knife.isAttacking;
    game.mode.getFallbackWeaponName = () => knife.isAttacking ? 'Knife' : null;
    game.mode.getMeleeArm = () => knife.isAttacking ? knife : null;
    game.mode.update = (dt: number): void => { knife.update(dt, false, 0); };
    let previousLowering = 1;
    let recoveryFrames = 0;
    for (let elapsed = 0; elapsed <= KNIFE_ATTACK_DURATION + 0.016; elapsed += 0.016) {
      const attacking = knife.isAttacking;
      prototype.frame.call(game);
      expect(game.currentView.root.visible).toBe(true);
      if (attacking) expect(weapon.update).toHaveBeenLastCalledWith(0.016, expect.objectContaining({ trigger: false, ads: false }));
      const lowering = game.currentView.update.mock.lastCall[5];
      if (elapsed >= KNIFE_ATTACK_DURATION * 0.5) {
        expect(lowering).toBeLessThanOrEqual(previousLowering);
        if (lowering > 0 && lowering < 1) recoveryFrames++;
        previousLowering = lowering;
      }
    }
    expect(recoveryFrames).toBeGreaterThan(15);
    expect(previousLowering).toBe(0);
    expect(game.hud.update).toHaveBeenCalledWith(weapon, expect.any(Number), 'Knife');
  });

  it.each([false, true])('hides weapons and both arms until handoff (touch: %s)', (touch) => {
    const { game } = stubGame(false, false);
    game.profile.useTouchControls = touch;
    const camera = {};
    game.mode.getCinematicCamera = () => camera;
    game.mode.isGameplayInputEnabled = () => false;
    prototype.frame.call(game);
    expect(game.currentView.root.visible).toBe(false);
    expect(game.viewArms.root.visible).toBe(false);
    expect(game.renderer.render).toHaveBeenLastCalledWith(game.scene, camera);

    game.mode.getCinematicCamera = () => null;
    game.mode.isGameplayInputEnabled = () => true;
    prototype.frame.call(game);
    expect(game.currentView.root.visible).toBe(true);
    expect(game.viewArms.root.visible).toBe(true);
    expect(game.renderer.render).toHaveBeenLastCalledWith(game.scene, game.player.camera);
  });

  it('preserves scoped weapon hiding when gameplay resumes', () => {
    const { game } = stubGame(false, false);
    const view = game.arsenal.get('m1911').view;
    view.update.mockImplementation(() => { view.root.visible = false; });
    prototype.frame.call(game);
    expect(view.root.visible).toBe(false);
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
