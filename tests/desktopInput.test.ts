import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopInput } from '../src/player/DesktopInput';
import { InputState } from '../src/player/InputState';

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ type } as Event);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

describe('DesktopInput pointer lock lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses document.pointerLockElement as truth and releases held input on unlock', () => {
    const documentTarget = new FakeEventTarget() as FakeEventTarget & {
      pointerLockElement: HTMLElement | null;
      visibilityState: DocumentVisibilityState;
    };
    const windowTarget = new FakeEventTarget();
    const canvas = new FakeEventTarget() as unknown as HTMLElement;
    documentTarget.pointerLockElement = canvas;
    documentTarget.visibilityState = 'visible';
    vi.stubGlobal('document', documentTarget);
    vi.stubGlobal('window', windowTarget);
    const state = new InputState();
    const onLockChange = vi.fn();
    const input = new DesktopInput(canvas, state, onLockChange);

    documentTarget.dispatch('pointerlockchange');
    state.setKey('KeyW', true);
    state.leftButtonDown = true;
    documentTarget.pointerLockElement = null;
    documentTarget.dispatch('pointerlockchange');

    expect(onLockChange).toHaveBeenNthCalledWith(1, true);
    expect(onLockChange).toHaveBeenNthCalledWith(2, false);
    expect(state.pointerLocked).toBe(false);
    expect(state.isDown('KeyW')).toBe(false);
    expect(state.leftButtonDown).toBe(false);

    input.dispose();
  });

  it('reconciles a missed unlock on focus without duplicating listeners', () => {
    const documentTarget = new FakeEventTarget() as FakeEventTarget & {
      pointerLockElement: HTMLElement | null;
      visibilityState: DocumentVisibilityState;
    };
    const windowTarget = new FakeEventTarget();
    const canvas = new FakeEventTarget() as unknown as HTMLElement;
    documentTarget.pointerLockElement = canvas;
    documentTarget.visibilityState = 'visible';
    vi.stubGlobal('document', documentTarget);
    vi.stubGlobal('window', windowTarget);
    const state = new InputState();
    const onLockChange = vi.fn();
    const input = new DesktopInput(canvas, state, onLockChange);

    documentTarget.dispatch('pointerlockchange');
    documentTarget.pointerLockElement = null;
    windowTarget.dispatch('focus');
    windowTarget.dispatch('focus');

    expect(onLockChange).toHaveBeenCalledTimes(2);
    expect(onLockChange).toHaveBeenLastCalledWith(false);
    expect(windowTarget.listenerCount('focus')).toBe(1);

    input.dispose();
    expect(windowTarget.listenerCount('focus')).toBe(0);
    expect(documentTarget.listenerCount('pointerlockchange')).toBe(0);
  });
});
