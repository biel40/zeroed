import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchState } from '../src/network/Protocol';
import { installCanvasDocument, makeMatch } from './coopHarness';

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());
beforeEach(() => { vi.useFakeTimers({ toFake: ['performance'] }); });
afterEach(() => { vi.useRealTimers(); });

describe('co-op pause authority', () => {
  it('shows both teammate avatars after exchanging their first states', () => {
    const match = makeMatch();
    match.host.onGameplayStarted();
    match.guest.onGameplayStarted();
    match.step(1 / 30, 4);
    const hostAvatar = (match.guest as unknown as { hostAvatar: { root: THREE.Group } }).hostAvatar;
    const guestAvatar = (match.host as unknown as { guestAvatar: { root: THREE.Group } }).guestAvatar;
    expect(hostAvatar.root.visible).toBe(true);
    expect(guestAvatar.root.visible).toBe(true);
    const visibleTo = (camera: THREE.Camera, target: THREE.Vector3): number => {
      const forward = camera.getWorldDirection(new THREE.Vector3());
      const toward = target.clone().add(new THREE.Vector3(0, 1.4, 0))
        .sub(camera.getWorldPosition(new THREE.Vector3())).normalize();
      return forward.dot(toward);
    };
    expect(visibleTo(match.hostSide.player.camera, guestAvatar.root.position)).toBeGreaterThan(0.8);
    expect(visibleTo(match.guestSide.player.camera, hostAvatar.root.position)).toBeGreaterThan(0.8);
    const guestPosition = match.guestSide.player.rig.position;
    const guestBody = new THREE.Box3(
      new THREE.Vector3(guestPosition.x - 0.35, 0.05, guestPosition.z - 0.35),
      new THREE.Vector3(guestPosition.x + 0.35, 1.97, guestPosition.z + 0.35),
    );
    const world = (match.host as unknown as { world: { arena: { wallColliders: THREE.Box3[] } } }).world;
    expect(world.arena.wallColliders.some((wall) => wall.intersectsBox(guestBody))).toBe(false);
  });

  it('keeps the match advancing when the guest opens its local menu', () => {
    const match = makeMatch();
    match.host.onGameplayStarted();
    match.guest.onGameplayStarted();
    match.step();
    const before = match.relay.sent('host', 'matchState').length;
    match.step(1 / 30, 8);
    expect(match.host.isSimulationPaused()).toBe(false);
    expect(match.guest.isSimulationPaused()).toBe(false);
    expect(match.relay.sent('host', 'matchState').length).toBeGreaterThan(before);
  });

  it('freezes both clients when the host pauses and resumes from the same state', () => {
    const match = makeMatch();
    match.host.onGameplayStarted();
    match.guest.onGameplayStarted();
    match.step(1 / 30, 3);
    match.host.onLocalPauseChanged(true);
    match.relay.flush();
    expect(match.host.isSimulationPaused()).toBe(true);
    expect(match.guest.isSimulationPaused()).toBe(true);
    expect(match.guestSide.hud.setHostPauseVisible).toHaveBeenCalledWith(true);
    const before = match.relay.sent('host', 'matchState').length;
    match.step(1 / 30, 10);
    expect(match.relay.sent('host', 'matchState')).toHaveLength(before);
    match.host.onLocalPauseChanged(false);
    match.relay.flush();
    expect(match.host.isSimulationPaused()).toBe(false);
    expect(match.guest.isSimulationPaused()).toBe(false);
    expect(match.guestSide.hud.setHostPauseVisible).toHaveBeenLastCalledWith(false);
    expect((match.relay.sent('host', 'matchState').at(-1) as { state: MatchState }).state.hostPaused).toBe(false);
  });
});
