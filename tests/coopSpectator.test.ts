import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoopRevive } from '../src/modes/coop/CoopRevive';
import type { CoopWorld } from '../src/modes/coop/CoopWorld';
import { cameraSpatialCue } from '../src/audio/SpatialCue';
import { MANSION_BUNKER_Y } from '../src/zombies/maps/BurnedMansionConfig';
import type { CoopPlayerId } from '../src/network/Protocol';
import type { RemotePlayer } from '../src/rendering/RemotePlayer';
import { installCanvasDocument, makeMatch, placePlayer, type CoopMatch } from './coopHarness';

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());
beforeEach(() => { vi.useFakeTimers({ toFake: ['performance'] }); });
afterEach(() => { vi.useRealTimers(); });

interface Authority {
  readonly players: Record<CoopPlayerId, { readonly life: CoopRevive }>;
  onPlayerAttacked(damage: number, target: CoopPlayerId): void;
}

function started(): CoopMatch {
  const match = makeMatch();
  match.host.onGameplayStarted();
  match.guest.onGameplayStarted();
  match.step(0.05, 4);
  return match;
}

function bleedOut(match: CoopMatch, slot: CoopPlayerId): void {
  const authority = match.host as unknown as Authority;
  authority.onPlayerAttacked(100, slot);
  authority.players[slot].life.update(20, false);
  match.step(0.05, 4);
}

describe('cooperative spectator', () => {
  it.each(['host', 'guest'] as const)('follows the teammate after the %s bleeds out without moving the dead player', (slot) => {
    const match = started();
    const mode = slot === 'host' ? match.host : match.guest;
    const own = slot === 'host' ? match.hostSide : match.guestSide;
    const teammate = slot === 'host' ? match.guestSide : match.hostSide;
    const remote = slot === 'host'
      ? (match.host as unknown as { guestAvatar: RemotePlayer }).guestAvatar
      : (match.guest as unknown as { hostAvatar: RemotePlayer }).hostAvatar;
    const world = (mode as unknown as { world: CoopWorld }).world;
    const updateArena = vi.spyOn(world.arena, 'update');
    const corpse = own.player.rig.position.clone();
    bleedOut(match, slot);

    const camera = mode.getCinematicCamera();
    expect(camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(mode.isGameplayInputEnabled()).toBe(false);
    expect(mode.onMeleeAttack()).toBe(false);
    expect(own.hud.showGameOver).not.toHaveBeenCalled();
    expect(own.hud.setSpectatorVisible).toHaveBeenLastCalledWith(true);
    expect(remote.root.visible).toBe(false);
    expect(own.player.rig.position.equals(corpse)).toBe(true);

    placePlayer(teammate.player, 0, -3.75, -1, MANSION_BUNKER_Y);
    teammate.player.face(0.6);
    Object.assign(teammate.player.camera.position, { y: -0.6 });
    Object.assign(own.player.camera, { aspect: 1.9, fov: 85 });
    own.player.camera.updateProjectionMatrix();
    match.step(0.05, 12);
    expect(camera!.position.x).toBeCloseTo(remote.root.position.x);
    expect(camera!.position.z).toBeCloseTo(remote.root.position.z);
    expect(camera!.position.y).toBeCloseTo(teammate.player.rig.position.y - 0.6);
    expect(camera!.getWorldDirection(new THREE.Vector3()).x).toBeCloseTo(-Math.sin(0.6));
    expect((camera as THREE.PerspectiveCamera).aspect).toBe(1.9);
    expect(camera!.projectionMatrix.equals(own.player.camera.projectionMatrix)).toBe(true);
    expect(own.player.rig.position.equals(corpse)).toBe(true);
    expect(updateArena.mock.lastCall![1]!.distanceTo(camera!.position)).toBeLessThan(0.001);
    const sound = new THREE.Vector3(camera!.position.x + 3, camera!.position.y, camera!.position.z);
    expect(world.spatialCueFor(sound)).toEqual(cameraSpatialCue(camera!, sound));

    // A shared pause must retain the spectator camera, then restart restores the body.
    match.host.onLocalPauseChanged(true);
    match.relay.flush();
    own.player.camera.aspect = 0.75;
    own.player.camera.updateProjectionMatrix();
    expect(mode.getCinematicCamera()).toBe(camera);
    expect((camera as THREE.PerspectiveCamera).aspect).toBe(0.75);
    expect(camera!.projectionMatrix.equals(own.player.camera.projectionMatrix)).toBe(true);
    match.host.onLocalPauseChanged(false);
    match.relay.flush();
    match.host.onRestartRequested();
    match.step(0.05, 5);
    expect(mode.getCinematicCamera()).toBeNull();
    expect(remote.root.visible).toBe(true);
    expect(own.hud.setSpectatorVisible).toHaveBeenLastCalledWith(false);
  });

  it('keeps the downed view until bleed-out and exits spectator when the whole team dies', () => {
    const match = started();
    const authority = match.host as unknown as Authority;
    authority.onPlayerAttacked(100, 'guest');
    match.step(0.05, 3);
    expect(match.guest.getCinematicCamera()).toBeNull();
    expect(match.guest.isDownedLookEnabled()).toBe(true);
    authority.players.guest.life.update(20, false);
    match.step(0.05, 3);
    expect(match.guest.getCinematicCamera()).not.toBeNull();
    bleedOut(match, 'host');
    expect(match.host.getCinematicCamera()).toBeNull();
    expect(match.guest.getCinematicCamera()).toBeNull();
    expect(match.hostSide.hud.showGameOver).toHaveBeenCalledOnce();
    expect(match.guestSide.hud.showGameOver).toHaveBeenCalledOnce();
  });

  it.each(['host', 'guest'] as const)('stops spectating when the %s loses its teammate', (slot) => {
    const match = started();
    bleedOut(match, slot);
    const mode = slot === 'host' ? match.host : match.guest;
    expect(mode.getCinematicCamera()).not.toBeNull();
    match.relay.presence(slot, 'peerLeft');
    match.step(0.05, 2);
    expect(mode.getCinematicCamera()).toBeNull();
    const side = slot === 'host' ? match.hostSide : match.guestSide;
    expect(side.hud.setSpectatorVisible).toHaveBeenLastCalledWith(false);
  });
});
