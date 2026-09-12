import { describe, expect, it } from 'vitest';
import { SecretRoomState } from '../src/zombies/secret-room/SecretRoomState';

const definitions = [
  { id: 'one', position: { x: 0, y: 1, z: 0 }, floor: 0 },
  { id: 'two', position: { x: 10, y: 1, z: 0 }, floor: 0 },
  { id: 'three', position: { x: 20, y: 1, z: 0 }, floor: -1 },
] as const;

describe('SecretRoomState', () => {
  it('accepts only nearby kills on the same floor and reserves souls in flight', () => {
    const state = new SecretRoomState(definitions, 2, 3);

    expect(state.beginSoul(0, 0, -1)).toBeNull();
    expect(state.beginSoul(4, 0, 0)).toBeNull();
    expect(state.beginSoul(1, 0, 0)).toBe(0);
    expect(state.lamps[0]).toMatchObject({ currentSouls: 0, pendingSouls: 1, completed: false });

    state.absorbSoul(0);
    expect(state.lamps[0]).toMatchObject({ currentSouls: 1, pendingSouls: 0, completed: false });
  });

  it('prevents over-reservation and unlocks exactly when every lamp completes', () => {
    const state = new SecretRoomState(definitions, 1, 3);

    expect(state.beginSoul(0, 0, 0)).toBe(0);
    expect(state.beginSoul(0, 0, 0)).toBeNull();
    expect(state.absorbSoul(0)).toEqual({ lampCompleted: true, unlocked: false });
    expect(state.beginSoul(10, 0, 0)).toBe(1);
    expect(state.absorbSoul(1)).toEqual({ lampCompleted: true, unlocked: false });
    expect(state.beginSoul(20, 0, -1)).toBe(2);
    expect(state.absorbSoul(2)).toEqual({ lampCompleted: true, unlocked: true });
    expect(state.completedLamps).toBe(3);
    expect(state.unlocked).toBe(true);
    expect(state.absorbSoul(2)).toEqual({ lampCompleted: false, unlocked: false });
  });

  it('resets all run-local progression including souls still travelling', () => {
    const state = new SecretRoomState(definitions, 1, 3);
    state.beginSoul(0, 0, 0);
    state.absorbSoul(0);
    state.beginSoul(10, 0, 0);

    state.reset();

    expect(state.unlocked).toBe(false);
    expect(state.completedLamps).toBe(0);
    expect(state.lamps.every((lamp) => lamp.currentSouls === 0 && lamp.pendingSouls === 0)).toBe(true);
  });
});
