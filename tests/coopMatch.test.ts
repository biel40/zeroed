import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import type { WeaponInventory } from '../src/game/WeaponInventory';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';
import type { MysteryBoxMachine } from '../src/zombies/MysteryBox';
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
  readonly guestInventory: WeaponInventory;
  readonly box: MysteryBoxMachine;
  readonly boxOwner: 'host' | 'guest' | null;
  onEnergyImpact(point: THREE.Vector3, config: NonNullable<typeof WEAPON_DEFINITIONS.raygun.energy>,
    object: THREE.Object3D | null, distance: number, shooter: 'host' | 'guest'): void;
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
  it('does not send periodic snapshots while a room has no guest', () => {
    const match = makeMatch();
    match.step(1 / 30, 60);
    expect(match.relay.sent('host', 'matchState')).toHaveLength(0);
    match.relay.presence('host', 'peerJoined');
    match.step();
    expect(match.relay.sent('host', 'matchState').length).toBeGreaterThan(0);
  });

  it('spawns both players apart and synchronizes presence both ways', () => {
    const match = startedMatch();
    match.step(1 / 30, 3);
    expect(host(match).phase).toBe('playing');
    expect(host(match).guestState?.x).toBeCloseTo(match.guestSide.player.rig.position.x);
    expect(guest(match).match?.host.x).toBeCloseTo(match.hostSide.player.rig.position.x);
    expect(match.hostSide.player.rig.position.distanceTo(match.guestSide.player.rig.position)).toBeGreaterThan(1);
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
  it('charges the guest for a wall weapon and validates its own shot damage', () => {
    const match = startedMatch();
    earn(host(match).players.guest.economy, 1750);
    placePlayer(match.guestSide.player, -5.8, -5.4);
    match.guestSide.player.rig.rotation.y = Math.PI / 2;
    match.step(0.1, 2);
    match.relay.host.onMessage?.({ type: 'wallBuyPurchase', wallBuyId: 'box-ak47', refill: false, equippedWeapon: 'm1911' });
    match.relay.flush();
    expect(host(match).guestInventory.has('ak47')).toBe(true);
    expect(host(match).players.guest.economy.points).toBe(0);
    expect(match.guestSide.ctx.grantWeapon).toHaveBeenCalledWith('ak47');

    const zombie = spawnOne(match);
    const replica = replicaOf(match, zombie);
    const weapon = new Weapon(WEAPON_DEFINITIONS.ak47);
    const hp = zombie.hp;
    match.guest.onWeaponFired(weapon, ORIGIN, NORMAL);
    match.guest.onTargetHit(replica, 5, ORIGIN, NORMAL, replica.torsoHitbox, weapon);
    match.step();
    expect(zombie.hp).toBe(hp - WEAPON_DEFINITIONS.ak47.damage);
    expect(host(match).players.guest.economy.points).toBe(10);
  });

  it('replaces the guest weapon selected at purchase time when both slots are full', () => {
    const match = startedMatch();
    earn(host(match).players.guest.economy, 3250);
    placePlayer(match.guestSide.player, -5.8, -5.4);
    match.guestSide.player.rig.rotation.y = Math.PI / 2;
    match.step(0.1, 2);
    match.relay.host.onMessage?.({ type: 'wallBuyPurchase', wallBuyId: 'box-ak47', refill: false, equippedWeapon: 'm1911' });
    match.relay.flush();
    placePlayer(match.guestSide.player, 3.2, -5.4);
    match.guestSide.player.rig.rotation.y = -Math.PI / 2;
    match.step(0.1, 10);
    match.relay.host.onMessage?.({ type: 'wallBuyPurchase', wallBuyId: 'east-hall-m4a1', refill: false,
      equippedWeapon: 'm1911' });
    match.relay.flush();
    expect(host(match).guestInventory.weapons).toEqual(['m4a1', 'ak47']);
    expect(host(match).players.guest.economy.points).toBe(0);
  });

  it('awards a nearby guest knife kill once and rejects repeated claims', () => {
    const match = startedMatch();
    const zombie = spawnOne(match);
    const id = host(match).zombies.networkIdOf(zombie);
    const guestPosition = match.guestSide.player.rig.position;
    zombie.group.position.set(guestPosition.x, zombie.group.position.y, guestPosition.z - 1);
    zombie.hp = 1;
    match.relay.host.onMessage?.({ type: 'knifeHitClaim', zombieId: id });
    match.relay.host.onMessage?.({ type: 'knifeHitClaim', zombieId: id });
    expect(host(match).players.guest.kills).toBe(1);
    expect(host(match).players.guest.economy.points).toBe(200);
    expect(match.relay.sent('host', 'zombieDeath')).toHaveLength(1);
  });

  it('kills a zombie exactly once when both players shoot it', () => {
    const match = startedMatch();
    const zombie = spawnOne(match);
    const replica = replicaOf(match, zombie);
    match.guest.onWeaponFired(match.guestSide.weapon, ORIGIN, NORMAL);
    zombie.hp = 1;
    match.host.onTargetHit(zombie, 5, ORIGIN, NORMAL, zombie.torsoHitbox, match.hostSide.weapon);
    match.guest.onTargetHit(replica, 5, ORIGIN, NORMAL, replica.headHitbox, match.guestSide.weapon);
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
    match.guest.onTargetHit(replica, 5, ORIGIN, NORMAL, replica.torsoHitbox, match.guestSide.weapon);
    match.step();
    expect(zombie.hp).toBe(hp);
    match.guest.onWeaponFired(match.guestSide.weapon, ORIGIN, NORMAL);
    match.guest.onTargetHit(replica, 5, ORIGIN, NORMAL, replica.torsoHitbox, match.guestSide.weapon);
    match.guest.onTargetHit(replica, 5, ORIGIN, NORMAL, replica.torsoHitbox, match.guestSide.weapon);
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

describe('co-op Mystery Box', () => {
  it('charges once, reserves the result for the buyer and grants the host-selected weapon', () => {
    const match = startedMatch();
    earn(host(match).players.guest.economy, 950);
    placePlayer(match.guestSide.player, -5.2, -4.2);
    match.guestSide.player.face(0);
    match.step(0.1, 2);
    match.relay.host.onMessage?.({ type: 'boxUse', action: 'activate', equippedWeapon: 'm1911' });
    expect(host(match).players.guest.economy.points).toBe(0);
    expect(host(match).boxOwner).toBe('guest');
    match.relay.host.onMessage?.({ type: 'boxUse', action: 'activate', equippedWeapon: 'm1911' });
    expect(host(match).players.guest.economy.points).toBe(0);
    match.step(0.1, 51);
    const result = host(match).box.result;
    expect(result).not.toBeNull();
    expect(result).not.toBe('m1911');
    expect(guest(match).match?.box.result).toBe(result);
    match.relay.host.onMessage?.({ type: 'boxUse', action: 'pickup', equippedWeapon: 'm1911' });
    match.relay.flush();
    expect(host(match).guestInventory.has(result!)).toBe(true);
    expect(match.guestSide.ctx.grantWeapon).toHaveBeenCalledWith(result);
    expect(host(match).boxOwner).toBeNull();
  });
});

describe('co-op special weapons', () => {
  it('awards a guest Ray Gun splash kill to the guest only', () => {
    const match = startedMatch();
    const zombie = spawnOne(match);
    const object = new THREE.Object3D();
    object.userData.zombie = zombie;
    object.userData.hitPart = 'torso';
    host(match).onEnergyImpact(zombie.position.clone().add(new THREE.Vector3(0, 1, 0)),
      WEAPON_DEFINITIONS.raygun.energy!, object, 3, 'guest');
    match.step(1 / 30, 3);
    expect(host(match).players.guest.kills).toBe(1);
    expect(host(match).players.host.kills).toBe(0);
    expect(guest(match).match?.stats.guest.kills).toBe(1);
  });

  it('credits ZEUS-77 chain kills once to their shooter', () => {
    const match = startedMatch();
    const first = spawnOne(match);
    const second = spawnOne(match);
    second.position.set(first.position.x + 1, first.position.y, first.position.z);
    const object = new THREE.Object3D();
    object.userData.zombie = first;
    object.userData.hitPart = 'torso';
    host(match).onEnergyImpact(first.position.clone().add(new THREE.Vector3(0, 1, 0)),
      WEAPON_DEFINITIONS.tesla.energy!, object, 3, 'guest');
    match.step();
    expect(host(match).players.guest.kills).toBe(2);
    expect(host(match).players.host.kills).toBe(0);
    expect(guest(match).match?.stats.guest.kills).toBe(2);
  });

  it('grants the 115-kill Ray Gun milestone only to the player who reached it', () => {
    const match = startedMatch();
    host(match).players.guest.kills = 114;
    const zombie = spawnOne(match);
    const object = new THREE.Object3D();
    object.userData.zombie = zombie;
    host(match).onEnergyImpact(zombie.position.clone().add(new THREE.Vector3(0, 1, 0)),
      WEAPON_DEFINITIONS.raygun.energy!, object, 3, 'guest');
    match.relay.flush();
    expect(host(match).guestInventory.has('raygun')).toBe(true);
    expect(match.guestSide.ctx.grantWeapon).toHaveBeenCalledWith('raygun');
    expect(match.hostSide.ctx.grantWeapon).not.toHaveBeenCalledWith('raygun');
  });
});

describe('co-op Burned Mansion interactions', () => {
  it('lets the guest activate a soul lamp and replicates it to both views', () => {
    const match = startedMatch();
    const lamp = host(match).world.arena.soulLampInteractions[0];
    placePlayer(match.guestSide.player, lamp.position.x, lamp.position.z);
    match.step(1 / 30, 60);
    match.relay.host.onMessage?.({ type: 'mapUse', kind: 'lamp', id: lamp.id, equippedWeapon: 'm1911' });
    match.step(1 / 30, 3);
    expect(lamp.activated).toBe(true);
    expect(guest(match).world.arena.soulLampInteractions[0].activated).toBe(true);
    expect(guest(match).match?.secret.lamps[0].activated).toBe(true);
  });

  it('rebuilds a barricade on the host and credits the repairing guest', () => {
    const match = startedMatch();
    const barrier = host(match).world.arena.barriers.find((entry) => entry.id === 'start-south');
    if (!barrier) throw new Error('Barricade missing');
    barrier.damage(1000);
    placePlayer(match.guestSide.player, barrier.position.x, barrier.position.z);
    match.step(1 / 30, 60);
    vi.spyOn(match.guestSide.ctx.input, 'isDown').mockImplementation((key) => key === 'KeyE');
    match.step(1 / 30, 45);
    expect(barrier.isDamaged).toBe(false);
    expect(host(match).players.guest.economy.points).toBeGreaterThan(0);
    expect(host(match).players.host.economy.points).toBe(0);
    expect(guest(match).world.arena.barriers.find((entry) => entry.id === barrier.id)?.isDamaged).toBe(false);
  });

  it('charges the buyer once for a shared special-weapon case', () => {
    const match = startedMatch();
    match.step();
    vi.mocked(match.hostSide.ctx.hasWeapon).mockReturnValue(true);
    vi.mocked(match.hostSide.ctx.grantWeapon).mockReturnValue(true);
    const world = host(match).world;
    const pickup = world.arena.weaponPickups[0];
    const door = world.findDoor(pickup.requiredDoorId!);
    if (!door) throw new Error('Bunker door missing');
    world.unlockDoor(door, () => true);
    earn(host(match).players.host.economy, pickup.cost);
    placePlayer(match.hostSide.player, pickup.position.x, pickup.position.z, pickup.floor, pickup.position.y - 1.1);
    expect(world.findFacingPickup()).toBe(pickup);
    expect(world.findFacingDoor()).toBeNull();
    expect(world.findFacingWallBuy()).toBeNull();
    expect(match.host.isGameplayInputEnabled()).toBe(true);
    expect(host(match).phase).toBe('playing');
    expect(world.findFacingRitual()).toBeNull();
    expect(world.findFacingSoulLamp()).toBeNull();
    match.host.onInteract();
    match.step(1 / 30, 3);
    expect(host(match).players.host.economy.points).toBe(0);
    expect(pickup.available).toBe(false);
    expect(guest(match).world.arena.weaponPickups[0].available).toBe(false);
    match.host.onInteract();
    expect(host(match).players.host.economy.points).toBe(0);
  });

  it('ends the shared match when the final is bought', () => {
    const match = startedMatch();
    match.step();
    vi.mocked(match.hostSide.ctx.hasWeapon).mockReturnValue(true);
    const world = host(match).world;
    const completion = world.arena.completionInteraction;
    const door = world.findDoor(completion.requiredDoorId!);
    if (!door) throw new Error('Bunker door missing');
    world.unlockDoor(door, () => true);
    earn(host(match).players.host.economy, completion.cost);
    placePlayer(match.hostSide.player, completion.position.x, completion.position.z,
      completion.floor, completion.position.y - 1.55);
    expect(world.findFacingCompletion()).not.toBeNull();
    match.host.onInteract();
    match.relay.flush();
    expect(host(match).phase).toBe('ending');
    expect(guest(match).match?.phase).toBe('ending');
    match.step(0.1, 24);
    expect(host(match).phase).toBe('credits');
    expect(match.guestSide.hud.showCredits).toHaveBeenCalled();
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
  it('reports a missing initial host state instead of leaving the guest silently stuck', () => {
    const match = makeMatch();
    match.relay.connected = false;
    match.guest.onGameplayStarted();
    match.step(0.1, 101);
    expect(match.guest.isGameplayInputEnabled()).toBe(false);
    expect(match.guestSide.hud.showRoundBanner).toHaveBeenCalledWith('MATCH NOT SYNCHRONIZED', 'OPEN THE MENU TO LEAVE');
    expect(match.guestSide.ctx.unlockPointer).toHaveBeenCalled();
  });

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
