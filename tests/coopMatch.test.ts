import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import type { PlayerHealth } from '../src/game/PlayerHealth';
import type { CoopWorld } from '../src/modes/coop/CoopWorld';
import type { MatchState, PlayerNetState } from '../src/network/Protocol';
import type { Zombie } from '../src/zombies/Zombie';
import { roundConfig } from '../src/zombies/ZombieConfig';
import type { ZombieManager, ZombiePlayerTarget } from '../src/zombies/ZombieManager';
import type { ZombieReplica } from '../src/zombies/ZombieReplica';
import type { RoundManager } from '../src/zombies/RoundManager';
import { CoopGuestMode } from '../src/modes/coop/CoopGuestMode';
import type { CoopConnection } from '../src/network/CoopConnection';
import { installCanvasDocument, makeContext, makeMatch, placePlayer, type CoopMatch } from './coopHarness';

interface Record_ {
  readonly health: PlayerHealth;
  readonly economy: PlayerEconomy;
  kills: number;
  headshots: number;
}

interface HostInternals {
  readonly players: Readonly<Record<'host' | 'guest', Record_>>;
  readonly world: CoopWorld;
  readonly zombies: ZombieManager;
  readonly rounds: RoundManager;
  readonly targets: ZombiePlayerTarget[];
  readonly phase: string;
  readonly guestState: PlayerNetState | null;
}

interface GuestInternals {
  readonly replica: ZombieReplica;
  readonly world: CoopWorld;
  readonly match: MatchState | null;
  readonly round: number;
}

const host = (match: CoopMatch): HostInternals => match.host as unknown as HostInternals;
const guest = (match: CoopMatch): GuestInternals => match.guest as unknown as GuestInternals;
const ORIGIN = new THREE.Vector3();
const NORMAL = new THREE.Vector3(0, 1, 0);

function earn(economy: PlayerEconomy, points: number): void {
  for (let i = 0; i < points / 10; i++) economy.awardHit();
}

/** Both players clicked start; the host advances into the shared playing phase. */
function startedMatch(): CoopMatch {
  const match = makeMatch();
  match.host.onGameplayStarted();
  match.guest.onGameplayStarted();
  match.step();
  return match;
}

function spawnOne(match: CoopMatch): Zombie {
  const spawn = host(match).world.arena.playerSpawn;
  expect(host(match).zombies.spawnZombie(roundConfig(1), spawn.x, spawn.z, 1)).toBe(true);
  match.step();
  return [...host(match).zombies.actives].at(-1) as Zombie;
}

function replicaOf(match: CoopMatch, hostZombie: Zombie): Zombie {
  const id = host(match).zombies.networkIdOf(hostZombie);
  const replica = [...match.guestSide.ctx.hitColliders]
    .map((object) => object.userData.zombie as Zombie | undefined)
    .find((zombie) => zombie && guest(match).replica.networkIdOf(zombie) === id);
  expect(replica).toBeDefined();
  return replica as Zombie;
}

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());
beforeEach(() => { vi.useFakeTimers({ toFake: ['performance'] }); });
afterEach(() => { vi.useRealTimers(); });

describe('co-op session', () => {
  it('spawns both players apart and synchronizes presence both ways', () => {
    const match = startedMatch();
    match.step(1 / 30, 3);
    expect(host(match).phase).toBe('playing');
    expect(host(match).guestState?.x).toBeCloseTo(match.guestSide.player.rig.position.x);
    expect(guest(match).match?.host.x).toBeCloseTo(match.hostSide.player.rig.position.x);
    expect(match.hostSide.player.rig.position.x).not.toBeCloseTo(match.guestSide.player.rig.position.x);
  });

  it('keeps every round decision on the host and mirrors it to the guest', () => {
    const match = startedMatch();
    const rounds = host(match).rounds;
    for (let frame = 0; frame < 2400 && rounds.round < 3; frame++) {
      match.step(0.05);
      for (const zombie of [...host(match).zombies.actives]) {
        if (!zombie.isAlive) continue;
        zombie.hp = 1;
        match.host.onTargetHit(zombie, 5, ORIGIN, NORMAL, zombie.torsoHitbox, match.hostSide.weapon);
      }
      expect(guest(match).round).toBe(rounds.round);
    }
    expect(rounds.round).toBe(3);
    expect(match.relay.sent('host', 'roundStart').map((message) => (message as { round: number }).round))
      .toEqual([1, 2, 3]);
  });
});

describe('co-op combat authority', () => {
  it('kills a zombie exactly once when both players shoot it', () => {
    const match = startedMatch();
    const zombie = spawnOne(match);
    const replica = replicaOf(match, zombie);
    match.guest.onWeaponFired(match.guestSide.weapon, ORIGIN, NORMAL);
    zombie.hp = 1;
    match.host.onTargetHit(zombie, 5, ORIGIN, NORMAL, zombie.torsoHitbox, match.hostSide.weapon);
    match.guest.onTargetHit(replica, 5, ORIGIN, NORMAL, replica.headHitbox);
    match.step();
    const players = host(match).players;
    expect(match.relay.sent('host', 'zombieDeath')).toHaveLength(1);
    expect(players.host.kills + players.guest.kills).toBe(1);
    expect(players.guest.economy.points).toBe(0);
  });

  it('accepts one guest damage claim per validated shot and credits only the guest', () => {
    const match = startedMatch();
    const zombie = spawnOne(match);
    const replica = replicaOf(match, zombie);
    const hp = zombie.hp;
    match.guest.onTargetHit(replica, 5, ORIGIN, NORMAL, replica.torsoHitbox);
    match.step();
    expect(zombie.hp).toBe(hp);
    match.guest.onWeaponFired(match.guestSide.weapon, ORIGIN, NORMAL);
    match.guest.onTargetHit(replica, 5, ORIGIN, NORMAL, replica.torsoHitbox);
    match.guest.onTargetHit(replica, 5, ORIGIN, NORMAL, replica.torsoHitbox);
    match.step();
    expect(zombie.hp).toBe(hp - 30);
    expect(host(match).players.guest.economy.points).toBe(10);
    expect(host(match).players.host.economy.points).toBe(0);
  });

  it('ignores stale events for zombies the replica no longer has', () => {
    const match = startedMatch();
    match.relay.guest.onMessage?.({ type: 'zombieDeath', zombieId: 999, killer: 'host' });
    match.relay.guest.onMessage?.({ type: 'zombieAttack', zombieId: 999, target: 'guest' });
    expect(guest(match).replica.aliveCount).toBe(0);
  });

  it('routes zombie damage only to the targeted player', () => {
    const match = startedMatch();
    const zombieManager = host(match).zombies;
    zombieManager.onPlayerAttack?.(25, 'guest');
    match.step();
    expect(host(match).players.guest.health.hp).toBe(50);
    expect(host(match).players.host.health.hp).toBe(75);
    expect(guest(match).match?.stats.guest.hp).toBe(50);
    expect(match.guestSide.hud.flashDamage).toHaveBeenCalledOnce();
    expect(match.hostSide.hud.flashDamage).not.toHaveBeenCalled();
  });
});

describe('co-op doors and points', () => {
  it('charges only the buyer and opens the door for both players', () => {
    const match = startedMatch();
    const players = host(match).players;
    earn(players.host.economy, 1350);
    earn(players.guest.economy, 1300);
    const dining = host(match).world.findDoor('to-dining');
    const east = host(match).world.findDoor('to-east-hall');
    if (!dining || !east) throw new Error('Mansion doors missing');

    placePlayer(match.hostSide.player, dining.position.x, dining.position.z);
    match.host.onInteract();
    match.step();
    expect(players.host.economy.points).toBe(600);
    expect(players.guest.economy.points).toBe(1300);
    expect(guest(match).world.findDoor('to-dining')?.isLocked).toBe(false);

    placePlayer(match.guestSide.player, east.position.x, east.position.z);
    // The host converges on a moved guest at a bounded speed; give it time to walk there.
    match.step(1 / 30, 60);
    match.guest.onInteract();
    match.step();
    expect(players.guest.economy.points).toBe(50);
    expect(players.host.economy.points).toBe(600);
    expect(east.isLocked).toBe(false);
    expect(guest(match).world.findDoor('to-east-hall')?.isLocked).toBe(false);
    expect(guest(match).match?.stats.guest.points).toBe(50);
  });

  it('rejects an unaffordable guest request and resolves simultaneous requests once', () => {
    const match = startedMatch();
    const players = host(match).players;
    const dining = host(match).world.findDoor('to-dining');
    if (!dining) throw new Error('Mansion door missing');
    placePlayer(match.guestSide.player, dining.position.x, dining.position.z);
    placePlayer(match.hostSide.player, dining.position.x, dining.position.z);
    match.step(1 / 30, 60);
    match.guest.onInteract();
    match.step();
    expect(dining.isLocked).toBe(true);
    expect(match.guestSide.hud.flashNotEnoughPoints).toHaveBeenCalled();

    earn(players.host.economy, 1000);
    earn(players.guest.economy, 1000);
    match.guest.onInteract();
    match.host.onInteract();
    match.step();
    expect(dining.isLocked).toBe(false);
    expect(players.host.economy.points + players.guest.economy.points).toBe(2000 - 750);
  });

  it('gives a joining player the open doors without charging them', () => {
    const match = startedMatch();
    earn(host(match).players.host.economy, 750);
    const dining = host(match).world.findDoor('to-dining');
    if (!dining) throw new Error('Mansion door missing');
    placePlayer(match.hostSide.player, dining.position.x, dining.position.z);
    match.host.onInteract();
    match.step();

    match.guest.onExit();
    match.relay.presence('host', 'peerLeft');
    match.relay.guest.disposed = false;
    const late = new CoopGuestMode(match.relay.guest as unknown as CoopConnection);
    const lateSide = makeContext();
    late.init(lateSide.ctx);
    match.relay.presence('host', 'peerJoined');
    match.relay.flush();
    const lateWorld = (late as unknown as GuestInternals).world;
    expect(lateWorld.findDoor('to-dining')?.isLocked).toBe(false);
    expect(lateWorld.findDoor('to-east-hall')?.isLocked).toBe(true);
    expect((late as unknown as GuestInternals).match?.stats.guest.points).toBe(0);
  });
});

describe('co-op lifecycle', () => {
  it('lets the host continue and retarget zombies when the guest disconnects mid-round', () => {
    const match = startedMatch();
    spawnOne(match);
    match.step(1 / 30, 2);
    expect(host(match).targets.map((target) => target.id)).toEqual(['guest']);
    match.relay.presence('host', 'peerLeft');
    match.step(1 / 30, 2);
    expect(host(match).targets).toHaveLength(0);
    expect(host(match).phase).toBe('playing');
    expect(match.host.isGameplayInputEnabled()).toBe(true);
  });

  it('restarts only from the host and brings the guest back into the new match', () => {
    const match = startedMatch();
    earn(host(match).players.host.economy, 750);
    const dining = host(match).world.findDoor('to-dining');
    if (!dining) throw new Error('Mansion door missing');
    placePlayer(match.hostSide.player, dining.position.x, dining.position.z);
    match.host.onInteract();
    match.step();
    match.host.onRestartRequested();
    match.step(1 / 30, 2);
    expect(dining.isLocked).toBe(true);
    expect(guest(match).world.findDoor('to-dining')?.isLocked).toBe(true);
    expect(host(match).players.host.economy.points).toBe(0);
    expect(host(match).phase).toBe('playing');
  });

  it('tells the guest the match ended when the host leaves and keeps its menu usable', () => {
    const match = startedMatch();
    match.relay.presence('guest', 'peerLeft');
    expect(match.guest.isGameplayInputEnabled()).toBe(false);
    expect(match.guest.onPointerUnlock()).toBe(false);
    expect(match.guestSide.ctx.unlockPointer).toHaveBeenCalled();
  });

  it('releases the socket and the co-op presentation on exit', () => {
    const match = startedMatch();
    spawnOne(match);
    match.host.onExit();
    match.guest.onExit();
    expect(match.relay.host.disposed).toBe(true);
    expect(match.relay.guest.disposed).toBe(true);
    expect(match.hostSide.hud.clearCoopPresentation).toHaveBeenCalledOnce();
    expect(match.guestSide.hud.clearCoopPresentation).toHaveBeenCalledOnce();
    expect(match.guestSide.ctx.hitColliders.some((object) => object.userData.zombie)).toBe(false);
  });
});
