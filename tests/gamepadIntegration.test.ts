import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/player/Input';
import { GamepadControls } from '../src/player/GamepadControls';
import { InputState } from '../src/player/InputState';
import { applyMobileAction } from '../src/player/MobileInput';
import { getInputDevice, setInputDevice } from '../src/player/InputPresentation';
import { resetSettings } from '../src/core/PlayerSettings';
import { actionKey } from '../src/ui/InteractionPrompts';
import { interactionPromptContent } from '../src/ui/InteractionPromptView';
import { LANGUAGES, setLanguage, t } from '../src/i18n/i18n';
import { TEST_PROFILE } from './coopHarness';

function event(type: string, fields: Record<string, unknown> = {}): Event {
  return Object.assign(new Event(type), fields);
}

function environment(): {
  page: EventTarget & { pointerLockElement: unknown }; surface: EventTarget; window: EventTarget;
  pad: Gamepad; setDevices: (devices: (Gamepad | null)[]) => void;
} {
  const surface = Object.assign(new EventTarget(), { requestPointerLock: vi.fn() });
  const page = Object.assign(new EventTarget(), { pointerLockElement: surface, visibilityState: 'visible',
    hasFocus: () => true, documentElement: { dataset: {} }, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null });
  const window = new EventTarget();
  const pad = { index: 3, id: 'DualSense Wireless Controller', mapping: 'standard', connected: true,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ value: 0, pressed: false })) } as unknown as Gamepad;
  let devices: (Gamepad | null)[] = [null, pad];
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', window);
  vi.stubGlobal('navigator', { getGamepads: () => devices });
  return { page, surface, window, pad, setDevices: next => { devices = next; } };
}

function press(pad: Gamepad, index: number, down: boolean): void {
  Object.assign(pad.buttons[index], { pressed: down, value: down ? 1 : 0 });
}

afterEach(() => { vi.unstubAllGlobals(); setInputDevice('keyboard', 'generic'); resetSettings(); setLanguage('en'); });

describe('shared input facade and controller lifecycle', () => {
  it('combines real keyboard, mouse and controller states without releasing other devices on disconnect', () => {
    const env = environment();
    const controls = new GamepadControls();
    const input = new Input(env.surface as HTMLElement, TEST_PROFILE, controls);
    env.page.dispatchEvent(event('pointerlockchange'));
    input.updateGamepad(1 / 60, true);
    env.page.dispatchEvent(event('keydown', { code: 'KeyW', key: 'w', repeat: false }));
    env.page.dispatchEvent(event('mousedown', { button: 0 }));
    press(env.pad, 6, true);
    (env.pad.axes as number[])[0] = 1;
    input.updateGamepad(1 / 60, true);
    expect(input.isDown('KeyW')).toBe(true);
    expect(input.moveAxisX).toBe(1);
    expect(input.leftButtonDown).toBe(true);
    expect(input.rightButtonDown).toBe(true);
    env.setDevices([]);
    input.updateGamepad(1 / 60, true);
    expect(input.moveAxisX).toBe(0);
    expect(input.isDown('KeyW')).toBe(true);
    expect(input.leftButtonDown).toBe(true);
    expect(input.rightButtonDown).toBe(false);
    input.dispose(); controls.dispose();
  });

  it('keeps touch-held actions when the gamepad releases the same logical action', () => {
    const env = environment();
    const controls = new GamepadControls();
    const input = new Input(env.surface as HTMLElement, TEST_PROFILE, controls);
    input.updateGamepad(1 / 60, true);
    const touchState = (input as unknown as { state: InputState }).state;
    applyMobileAction(touchState, 'interact', true);
    applyMobileAction(touchState, 'fire', true);
    press(env.pad, 4, true);
    input.updateGamepad(1 / 60, true);
    press(env.pad, 4, false);
    input.updateGamepad(1 / 60, true);
    expect(input.isDown('KeyE')).toBe(true);
    expect(input.repeatSemiAuto).toBe(true);
    env.setDevices([]);
    input.updateGamepad(1 / 60, true);
    expect(input.isDown('KeyE')).toBe(true);
    expect(input.leftButtonDown).toBe(true);
    input.dispose(); controls.dispose();
  });

  it('pauses once on Menu, releases on blur and rearms held triggers after focus returns', () => {
    const env = environment();
    const controls = new GamepadControls();
    const input = new Input(env.surface as HTMLElement, TEST_PROFILE, controls);
    const pause = vi.fn();
    const suspended = vi.fn();
    input.onPauseRequest = pause;
    input.onFocusLost = suspended;
    input.updateGamepad(1 / 60, true);
    press(env.pad, 9, true);
    press(env.pad, 7, true);
    input.updateGamepad(1 / 60, true);
    input.updateGamepad(1 / 60, true);
    expect(pause).toHaveBeenCalledOnce();
    env.window.dispatchEvent(event('blur'));
    expect(suspended).toHaveBeenCalledOnce();
    expect(input.leftButtonDown).toBe(false);
    env.window.dispatchEvent(event('focus'));
    input.updateGamepad(1 / 60, true);
    expect(input.leftButtonDown).toBe(false);
    input.dispose(); controls.dispose();
    env.window.dispatchEvent(event('blur'));
    expect(suspended).toHaveBeenCalledOnce();
  });

  it('tracks meaningful source changes without letting steady sticks or connection steal mouse hints', () => {
    const env = environment();
    const controls = new GamepadControls();
    env.page.dispatchEvent(event('mousemove', { movementX: 3, movementY: 0 }));
    controls.update(1 / 60, true);
    expect(getInputDevice()).toBe('keyboard');
    expect(actionKey(true)).toBe(t('prompt.press'));
    (env.pad.axes as number[])[2] = 0.1;
    controls.update(1 / 60, true);
    expect(getInputDevice()).toBe('keyboard');
    (env.pad.axes as number[])[2] = 0.8;
    controls.update(1 / 60, true);
    expect(getInputDevice()).toBe('gamepad');
    env.page.dispatchEvent(event('mousemove', { movementX: 3, movementY: 0 }));
    controls.update(1 / 60, true);
    expect(getInputDevice()).toBe('keyboard');
    env.page.dispatchEvent(event('pointerdown', { pointerType: 'touch' }));
    controls.update(1 / 60, true);
    expect(getInputDevice()).toBe('touch');
    expect(actionKey(false)).toBe(t('prompt.pressTouch'));
    // Slow deliberate deflection must accumulate beyond the noise threshold.
    (env.pad.axes as number[])[2] = 0;
    controls.update(1 / 60, true);
    for (let value = 0; value < 0.9; value += 0.01) {
      (env.pad.axes as number[])[2] = value;
      controls.update(1 / 60, true);
    }
    expect(getInputDevice()).toBe('gamepad');
    controls.dispose();
  });

  it('handles connection events, visibility loss, disconnect events and listener teardown', () => {
    const env = environment();
    const controls = new GamepadControls();
    const unavailable = vi.fn();
    controls.onUnavailable = unavailable;
    controls.update(1 / 60, true);
    env.window.dispatchEvent(event('gamepadconnected', { gamepad: env.pad }));
    press(env.pad, 7, true);
    controls.update(1 / 60, true);
    expect(controls.input.state.leftButtonDown).toBe(true);
    env.window.dispatchEvent(event('gamepaddisconnected', { gamepad: env.pad }));
    env.setDevices([]);
    controls.update(1 / 60, true);
    expect(unavailable).toHaveBeenCalledOnce();
    Object.assign(env.page, { visibilityState: 'hidden' });
    env.page.dispatchEvent(event('visibilitychange'));
    env.setDevices([env.pad]);
    controls.update(1 / 60, true);
    expect(controls.input.connected).toBe(false);
    controls.dispose();
    env.window.dispatchEvent(event('gamepaddisconnected', { gamepad: env.pad }));
    expect(unavailable).toHaveBeenCalledOnce();
  });
});

describe('localized gamepad prompts', () => {
  it.each(LANGUAGES)('resolves tap/held hints dynamically in %s without changing interaction conditions', language => {
    setLanguage(language);
    for (const family of ['xbox', 'playstation', 'generic'] as const) {
      setInputDevice('gamepad', family);
      for (const hold of [false, true]) {
        const hint = actionKey(false, hold);
        expect(actionKey(true, hold)).toBe(hint);
        const parsed = interactionPromptContent(t('prompt.repairBarricade', { key: hint }));
        expect(parsed.action?.key).toBe(family === 'playstation' ? 'L1' : family === 'xbox' ? 'LB' : 'B5');
      }
    }
  });
});
