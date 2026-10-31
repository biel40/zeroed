import type { ControllerFamily } from './GamepadBindings';

export type InputDevice = 'keyboard' | 'touch' | 'gamepad';
let device: InputDevice | null = null;
let family: ControllerFamily = 'generic';
const listeners = new Set<() => void>();

export function getInputDevice(fallback: InputDevice = 'keyboard'): InputDevice { return device ?? fallback; }
export function getControllerFamily(): ControllerFamily { return family; }

export function setInputDevice(next: InputDevice, controller: ControllerFamily = family): void {
  if (next === device && controller === family) return;
  device = next;
  family = controller;
  for (const listener of listeners) listener();
}

export function onInputDeviceChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
