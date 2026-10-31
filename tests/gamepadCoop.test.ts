import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installCanvasDocument, makeMatch, placePlayer, type TestContext } from './coopHarness';
import { DEFAULT_SETTINGS } from '../src/core/PlayerSettings';
import { GamepadInput } from '../src/player/GamepadInput';
import { isPlayerNetState } from '../src/network/Protocol';
import type { CoopWorld } from '../src/modes/coop/CoopWorld';
import { WindowBarrier } from '../src/zombies/barriers/WindowBarrier';
import { BARRIER_CONFIG } from '../src/zombies/maps/BurnedMansionConfig';

let restore: () => void;
beforeAll(() => { restore = installCanvasDocument(); });
afterAll(() => restore());
beforeEach(() => { vi.useFakeTimers({ toFake: ['performance'] }); });
afterEach(() => { vi.useRealTimers(); });

function controller(side: TestContext): { input: GamepadInput; pad: Gamepad; frame: () => void } {
  const pad = { index: 4, id: 'Xbox', connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) } as unknown as Gamepad;
  const input = new GamepadInput(() => [pad]);
  Object.defineProperty(side.ctx, 'input', { value: input.state });
  return { input, pad, frame: () => { input.poll(DEFAULT_SETTINGS); input.applyGameplay(true); } };
}

describe('gamepad before the cooperative serialization boundary', () => {
  it('replicates only the guest local movement/posture through the unchanged playerState message', () => {
    const match = makeMatch();
    match.host.onGameplayStarted(); match.guest.onGameplayStarted(); match.step();
    const control = controller(match.guestSide);
    (control.pad.axes as number[])[0] = 0.6;
    Object.assign(control.pad.buttons[1], { pressed: true, value: 1 });
    control.frame();
    const hostX = match.hostSide.player.rig.position.x;
    for (let i = 0; i < 6; i++) {
      match.guestSide.player.update(0.05, match.guestSide.ctx.input, match.guestSide.weapon);
      match.guestSide.player.rig.updateMatrixWorld(true);
      control.input.state.endFrame();
      match.step(0.05);
    }
    const messages = match.relay.sent('guest', 'playerState');
    const message = messages.at(-1);
    expect(message?.type).toBe('playerState');
    if (message?.type !== 'playerState') throw new Error('Missing playerState');
    expect(isPlayerNetState(message.state)).toBe(true);
    expect(message.state.stance).toBe('crouched');
    expect(message.state.x).toBe(match.guestSide.player.rig.position.x);
    expect(Object.keys(message)).toEqual(['type', 'state']);
    expect(match.hostSide.player.rig.position.x).toBe(hostX);
  });

  it('sends held repair through the existing field and cancels it on controller weapon selection', () => {
    const match = makeMatch();
    const control = controller(match.guestSide);
    const world = (match.guest as unknown as { world: CoopWorld }).world;
    const barrier = new WindowBarrier('controller-test', 0, -1, 0, -1, BARRIER_CONFIG);
    barrier.damage(100);
    vi.spyOn(world, 'findRepairableBarrier').mockReturnValue(barrier);
    placePlayer(match.guestSide.player, 0, 0);
    Object.assign(control.pad.buttons[4], { pressed: true, value: 1 });
    control.frame();
    expect(world.localPlayerState().repairBarrierId).toBe(barrier.id);
    Object.assign(control.pad.buttons[3], { pressed: true, value: 1 });
    control.frame();
    expect(world.localPlayerState().repairBarrierId).toBeNull();
    control.input.disconnect(4);
    expect(world.localPlayerState().repairBarrierId).toBeNull();
  });
});
