import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import type { WeaponInventory } from '../src/game/WeaponInventory';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';
import type { WeaponId } from '../src/weapons/WeaponTypes';
import { MYSTERY_BOX_POOL, type MysteryBoxMachine } from '../src/zombies/MysteryBox';
import type { PlayerHealth } from '../src/game/PlayerHealth';
import type { CoopWorld } from '../src/modes/coop/CoopWorld';
import type { MatchState, PlayerNetState } from '../src/network/Protocol';
import type { Zombie } from '../src/zombies/Zombie';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieBleeding } from '../src/zombies/ZombieBleeding';
import { parseHostMessage } from '../src/network/Protocol';
import { NUCLEAR_ENDING_DURATION } from '../src/zombies/ZombiesRunFlow';
import type { ZombieManager, ZombiePlayerTarget } from '../src/zombies/ZombieManager';
import type { ZombieReplica } from '../src/zombies/ZombieReplica';
import type { RoundManager } from '../src/zombies/RoundManager';
import { CoopGuestMode } from '../src/modes/coop/CoopGuestMode';
import type { CoopConnection } from '../src/network/CoopConnection';
import { installCanvasDocument, makeContext, makeMatch, placePlayer, type CoopMatch } from './coopHarness';
import { CodeLockDialog } from '../src/ui/CodeLockDialog';
import { cameraSpatialCue } from '../src/audio/SpatialCue';
import { STATION33_WEAPON_CHEST } from '../src/zombies/maps/Station33Config';
import { MANSION_BUNKER_Y } from '../src/zombies/maps/BurnedMansionConfig';
import type { RemotePlayer } from '../src/rendering/RemotePlayer';

vi.mock('../src/ui/CodeLockDialog', () => ({
  CodeLockDialog: vi.fn(function () { return { dispose: vi.fn() }; }),
}));

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
  useBox(buyer: 'host' | 'guest', action: 'activate' | 'pickup', equippedWeapon: WeaponId): void;
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
  it('replicates host crouch and guest prone through both real modes and resets posture on restart', () => {
    const match = startedMatch();
    for (const [side, key] of [[match.hostSide, 'KeyC'], [match.guestSide, 'KeyZ']] as const) {
      side.player.update(1 / 60, { ...side.ctx.input, mouseDeltaX: 0, mouseDeltaY: 0,
        moveAxisX: 0, moveAxisY: 0, wasPressed: (code: string) => code === key } as typeof side.ctx.input, side.weapon);
      side.player.rig.updateMatrixWorld(true);
    }
    match.step(0.1, 5);
    expect(host(match).guestState?.stance).toBe('prone');
    expect(host(match).guestState?.eyeOffsetY).toBeCloseTo(match.guestSide.player.camera.position.y);
    const remoteHost = (match.guest as unknown as { hostAvatar: RemotePlayer }).hostAvatar;
    expect(remoteHost.latest?.stance).toBe('crouched');
    expect(remoteHost.root.position.y).toBeCloseTo(match.hostSide.player.rig.position.y - 1.7);
    match.host.onRestartRequested();
    match.step(0.1, 3);
    expect(match.hostSide.player.stance).toBe('standing');
    expect(match.guestSide.player.stance).toBe('standing');
    expect(remoteHost.latest?.stance).toBe('standing');
  });
  it('validates and shares the Barrett code, grants once, and relocks on restart', () => {
    const match = startedMatch();
    const authority = host(match);
    const pickup = authority.world.arena.weaponPickups.find((entry) => entry.weaponId === 'barrett')!;
    const replica = guest(match).world.arena.weaponPickups.find((entry) => entry.id === pickup.id)!;
    const request = { type: 'mapUse' as const, kind: 'pickup' as const, id: pickup.id, equippedWeapon: 'm1911' as const };
    const send = (code?: string): void => {
      match.relay.host.onMessage?.({ ...request, ...(code === undefined ? {} : { code }) });
      match.relay.flush();
    };
    placePlayer(match.guestSide.player, pickup.position.x + 0.5, pickup.position.z, -1, MANSION_BUNKER_Y);
    match.guestSide.player.rig.rotation.y = Math.PI / 2;
    match.step(0.1, 3);
    send(STATION33_WEAPON_CHEST.code);
    expect(pickup.codeLock!.locked).toBe(true);
    for (const id of ['to-dining', 'to-banquet', 'to-east-hall', 'nuclear-bunker']) authority.world.unlockDoor(authority.world.findDoor(id)!, () => true);
    match.step(0.1, 31);
    send();
    send('0000');
    send('19980');
    expect(pickup.codeLock!.locked).toBe(true);
    expect(authority.guestInventory.has('barrett')).toBe(false);
    send(STATION33_WEAPON_CHEST.code);
    expect(pickup.codeLock!.locked).toBe(false);
    expect(replica.codeLock!.locked).toBe(false);
    expect(pickup.available).toBe(true);
    expect(authority.guestInventory.has('barrett')).toBe(false);
    send();
    expect(pickup.available).toBe(false);
    expect(replica.available).toBe(false);
    expect(authority.guestInventory.has('barrett')).toBe(true);
    expect(match.guestSide.ctx.grantWeapon).toHaveBeenCalledWith('barrett');
    const grants = vi.mocked(match.guestSide.ctx.grantWeapon).mock.calls.length;
    send();
    expect(vi.mocked(match.guestSide.ctx.grantWeapon).mock.calls).toHaveLength(grants);
    match.host.onRestartRequested();
    match.step(0.1, 3);
    expect(pickup.codeLock!.locked).toBe(true);
    expect(replica.codeLock!.locked).toBe(true);
    expect(replica.available).toBe(true);
  });

  it.each(['host', 'guest'] as const)('opens the keypad for the %s without pausing the shared match', (buyer) => {
    const match = startedMatch();
    const authority = host(match);
    for (const id of ['to-dining', 'to-banquet', 'to-east-hall', 'nuclear-bunker']) authority.world.unlockDoor(authority.world.findDoor(id)!, () => true);
    match.step(0.1, 31);
    const side = buyer === 'host' ? match.hostSide : match.guestSide;
    Object.assign(side.ctx.input, { releaseAll: vi.fn() });
    const mode = buyer === 'host' ? match.host : match.guest;
    vi.mocked(match.hostSide.ctx.hasWeapon).mockReturnValue(true);
    const pickup = authority.world.arena.weaponPickups.find((entry) => entry.weaponId === 'barrett')!;
    placePlayer(side.player, pickup.position.x + 0.5, pickup.position.z, -1, MANSION_BUNKER_Y);
    side.player.rig.rotation.y = Math.PI / 2;
    side.player.rig.updateMatrixWorld(true);
    match.step(0.1, 30);
    expect((buyer === 'host' ? authority.world : guest(match).world).findFacingPickup()?.id).toBe(pickup.id);
    const dialogs = vi.mocked(CodeLockDialog).mock.calls.length;
    mode.onInteract();
    expect(vi.mocked(CodeLockDialog).mock.calls).toHaveLength(dialogs + 1);
    const [unlock, close] = vi.mocked(CodeLockDialog).mock.calls.at(-1)!;
    expect(mode.onPointerUnlock()).toBe(true);
    expect(mode.isGameplayInputEnabled()).toBe(false);
    expect(mode.isSimulationPaused()).toBe(false);
    expect(unlock('0000')).toBe(false);
    expect(unlock(STATION33_WEAPON_CHEST.code)).toBe(true);
    close();
    match.relay.flush();
    if (buyer === 'guest') {
      expect(match.relay.sent('guest', 'mapUse').at(-1)).toMatchObject({ code: STATION33_WEAPON_CHEST.code });
      expect(authority.world.isRemoteInReach(pickup, authority.guestState!)).toBe(true);
    }
    expect(pickup.codeLock!.locked).toBe(false);
    expect(mode.isGameplayInputEnabled()).toBe(true);
  });

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

  it('plays each round transition cue once per client, even for a repeated message', () => {
    const match = startedMatch();
    const rounds = host(match).rounds;
    for (let frame = 0; frame < 2400 && rounds.round < 3; frame++) {
      match.step(0.05);
      for (const zombie of [...host(match).zombies.actives]) {
        if (!zombie.isAlive) continue;
        zombie.hp = 1;
        match.host.onTargetHit(zombie, 5, ORIGIN, NORMAL, zombie.torsoHitbox, match.hostSide.weapon);
      }
    }
    const hostAudio = match.hostSide.ctx.audio as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const guestAudio = match.guestSide.ctx.audio as unknown as Record<string, ReturnType<typeof vi.fn>>;
    expect(hostAudio.playRoundStartCue).toHaveBeenCalledTimes(3);
    expect(hostAudio.playRoundEndCue).toHaveBeenCalledTimes(2);
    expect(guestAudio.playRoundStartCue).toHaveBeenCalledTimes(3);
    expect(guestAudio.playRoundEndCue).toHaveBeenCalledTimes(2);

    // A message delivered twice (reconnect, relay retry) never stacks a second sting.
    match.relay.guest.onMessage?.({ type: 'roundStart', round: 3 });
    match.relay.guest.onMessage?.({ type: 'roundEnd', round: 2 });
    expect(guestAudio.playRoundStartCue).toHaveBeenCalledTimes(3);
    expect(guestAudio.playRoundEndCue).toHaveBeenCalledTimes(2);
  });

  it('plays the partner\'s gunfire from where they stand', () => {
    const match = startedMatch();
    placePlayer(match.hostSide.player, 0, 0);
    placePlayer(match.guestSide.player, 4, 0);
    match.step(0.05, 4);
    const origin = { x: -6, y: 1.7, z: 0 };
    match.relay.guest.onMessage?.({ type: 'playerShoot', weapon: 'm1911', origin, direction: { x: 0, y: 0, z: -1 } });
    const guestAudio = match.guestSide.ctx.audio as unknown as Record<string, ReturnType<typeof vi.fn>>;
    expect(guestAudio.playRemoteShot).toHaveBeenCalledOnce();
    const [config, cue] = guestAudio.playRemoteShot.mock.calls[0];
    expect(config).toBe(WEAPON_DEFINITIONS.m1911.audio);
    // Ten meters to the side: clearly panned and quieter than at arm's length.
    expect(cue).toEqual(cameraSpatialCue(match.guestSide.player.camera, origin));
    expect(Math.abs(cue.pan)).toBeGreaterThan(0.5);
    expect(cue.attenuation).toBeLessThan(1);
  });
});

describe('co-op combat authority', () => {
  it('charges the guest for a wall weapon and validates its own shot damage', () => {
    const match = startedMatch();
    earn(host(match).players.guest.economy, 1750);
    const wallBuy = host(match).world.arena.wallBuys.find((buy) => buy.id === 'box-ak47')!;
    placePlayer(match.guestSide.player,
      wallBuy.position.x + Math.sin(wallBuy.config.yaw) * 0.8,
      wallBuy.position.z + Math.cos(wallBuy.config.yaw) * 0.8, wallBuy.floor);
    match.guestSide.player.rig.rotation.y = wallBuy.config.yaw;
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
    const wallBuy = host(match).world.arena.wallBuys.find((buy) => buy.id === 'box-ak47')!;
    placePlayer(match.guestSide.player,
      wallBuy.position.x + Math.sin(wallBuy.config.yaw) * 0.8,
      wallBuy.position.z + Math.cos(wallBuy.config.yaw) * 0.8, wallBuy.floor);
    match.guestSide.player.rig.rotation.y = wallBuy.config.yaw;
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
    const replica = replicaOf(match, zombie);
    const guestPosition = match.guestSide.player.rig.position;
    zombie.update(1); // Finish emerging so the visible body reaches the slash.
    zombie.group.position.set(guestPosition.x, zombie.group.position.y, guestPosition.z + 1);
    zombie.hp = 1;
    match.relay.host.onMessage?.({ type: 'knifeHitClaim', zombieId: id });
    match.relay.host.onMessage?.({ type: 'knifeHitClaim', zombieId: id });
    expect(host(match).players.guest.kills).toBe(1);
    expect(host(match).players.guest.economy.points).toBe(200);
    expect(match.relay.sent('host', 'zombieDeath')).toEqual([expect.objectContaining({ style: 'slash' })]);
    match.step();
    // The guest plays the same knife death the host resolved.
    expect(replica.deathStyle).toBe('slash');
    const hostBlood = host(match).zombies.group.getObjectByName('zombie-blood') as THREE.InstancedMesh;
    expect(hostBlood.count).toBe(new ZombieBleeding().hit('knife', false)!.drops);
    const guestBlood = replica.group.parent!.getObjectByName('zombie-blood') as THREE.InstancedMesh;
    expect(guestBlood.count).toBe(hostBlood.count);
  });

  it('validates the guest slash direction and obstruction before accepting a side hit', () => {
    const match = startedMatch();
    const zombie = spawnOne(match);
    const id = host(match).zombies.networkIdOf(zombie);
    const position = match.guestSide.player.rig.position;
    const claim = (): void => match.relay.host.onMessage?.({ type: 'knifeHitClaim', zombieId: id });
    const hp = zombie.hp;

    // The guest starts facing +Z: the host must reject a body behind it.
    zombie.group.position.set(position.x, zombie.position.y, position.z - 1);
    claim();
    expect(zombie.hp).toBe(hp);

    zombie.group.position.set(position.x, zombie.position.y, position.z + 4);
    claim();
    expect(zombie.hp).toBe(hp);

    zombie.group.position.set(position.x + 0.9, zombie.position.y, position.z + 1.2);
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.1), new THREE.MeshBasicMaterial());
    blocker.position.set(position.x + 0.45, position.y, position.z + 0.6);
    blocker.updateMatrixWorld(true);
    match.hostSide.ctx.hitColliders.push(blocker);
    claim();
    expect(zombie.hp).toBe(hp);

    match.hostSide.ctx.hitColliders.splice(match.hostSide.ctx.hitColliders.indexOf(blocker), 1);
    claim();
    expect(host(match).players.guest.kills).toBe(1);
    expect(host(match).players.guest.economy.points).toBe(200);
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

  it('adopts damaged boards silently on the first snapshot, then cracks on new strikes', () => {
    const match = startedMatch();
    const barrier = host(match).world.arena.barriers[0];
    const playBarrierBreak = match.guestSide.ctx.audio.playBarrierBreak as ReturnType<typeof vi.fn>;
    // A late join or a restart: the guest has no snapshot yet, the host already has damage.
    (guest(match) as unknown as { match: MatchState | null }).match = null;
    barrier.damage(1);
    match.step(1 / 30, 4);
    expect(guest(match).world.arena.barriers[0].boards.some((board) => board.hp < board.maxHp)).toBe(true);
    expect(playBarrierBreak).not.toHaveBeenCalled();

    barrier.damage(1);
    match.step(1 / 30, 4);
    expect(playBarrierBreak).toHaveBeenCalledOnce();
  });

  it('accepts damage events with or without a valid attacker id', () => {
    expect(parseHostMessage({ type: 'playerDamaged', damage: 25 })).toEqual({ type: 'playerDamaged', damage: 25 });
    expect(parseHostMessage({ type: 'playerDamaged', damage: 25, attackerId: 7 }))
      .toEqual({ type: 'playerDamaged', damage: 25, attackerId: 7 });
    expect(parseHostMessage({ type: 'playerDamaged', damage: 25, attackerId: 'x' })).toBeNull();
  });

  it('routes zombie damage only to the targeted player', () => {
    const match = startedMatch();
    const zombieManager = host(match).zombies;
    zombieManager.onPlayerAttack?.(25, 'guest', { position: new THREE.Vector3() } as Zombie);
    match.step();
    expect(host(match).players.guest.health.hp).toBe(50);
    expect(host(match).players.host.health.hp).toBe(75);
    expect(guest(match).match?.stats.guest.hp).toBe(50);
    expect(match.guestSide.hud.flashDamage).toHaveBeenCalledOnce();
    expect(match.hostSide.hud.flashDamage).not.toHaveBeenCalled();
  });
});

describe('co-op Mystery Box', () => {
  it('excludes both weapons in the guest inventory without excluding the host weapons', () => {
    const match = startedMatch();
    Object.assign(host(match).box, { rng: () => 0 });
    vi.mocked(match.hostSide.ctx.hasWeapon).mockImplementation((id) => id === 'vector');
    earn(host(match).players.guest.economy, 950);
    placePlayer(match.guestSide.player, -5.2, -4.2);
    match.guestSide.player.face(0);
    match.step(0.1, 2);
    host(match).guestInventory.reset(['m4a1', 'mp5']);
    match.relay.host.onMessage?.({ type: 'boxUse', action: 'activate', equippedWeapon: 'mp5' });
    match.step(0.1, 51);
    expect(host(match).box.result).toBe('vector');
    expect(guest(match).match?.box.result).toBe('vector');
  });

  it('excludes both weapons carried by the host', () => {
    const match = startedMatch();
    Object.assign(host(match).box, { rng: () => 0 });
    vi.mocked(match.hostSide.ctx.hasWeapon).mockImplementation((id) => id === 'm4a1' || id === 'mp5');
    earn(host(match).players.host.economy, 950);
    match.step();
    const boxPosition = host(match).world.arena.mysteryBoxPlacement.position;
    placePlayer(match.hostSide.player, boxPosition.x, boxPosition.z);
    match.hostSide.player.face(0);
    host(match).useBox('host', 'activate', 'mp5');
    expect(host(match).boxOwner).toBe('host');
    match.step(0.1, 51);
    expect(host(match).box.result).toBe('vector');
  });

  it.each(['vector', 'ppsh41', 'barrett'] as const)('charges once and grants the host-selected %s to the buyer', (weaponId) => {
    const match = startedMatch();
    // Pick the middle of this weapon's live-pool weight, independent of pool growth.
    const index = MYSTERY_BOX_POOL.findIndex((entry) => entry.weaponId === weaponId);
    const totalWeight = MYSTERY_BOX_POOL.reduce((sum, entry) => sum + entry.weight, 0);
    const precedingWeight = MYSTERY_BOX_POOL.slice(0, index).reduce((sum, entry) => sum + entry.weight, 0);
    const random = (precedingWeight + MYSTERY_BOX_POOL[index].weight / 2) / totalWeight;
    Object.assign(host(match).box, { rng: () => random });
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
    expect(result).toBe(weaponId);
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
    expect(guest(match).match?.stats.guest.totalDamage).toBe(zombie.maxHp);
    expect(guest(match).match?.stats.host.totalDamage).toBe(0);
    expect(guest(match).match?.stats.guest.totalPoints).toBe(host(match).players.guest.economy.totalEarned);
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
    expect(guest(match).match?.stats.guest.totalDamage).toBe(first.maxHp + second.maxHp);
    expect(guest(match).match?.stats.host.totalDamage).toBe(0);
  });

  it.each(['host', 'guest'] as const)('never grants a Ray Gun at 115 kills to %s', (shooter) => {
    const match = startedMatch();
    host(match).players[shooter].kills = 114;
    const zombie = spawnOne(match);
    const object = new THREE.Object3D();
    object.userData.zombie = zombie;
    host(match).onEnergyImpact(zombie.position.clone().add(new THREE.Vector3(0, 1, 0)),
      WEAPON_DEFINITIONS.raygun.energy!, object, 3, shooter);
    match.relay.flush();
    expect(host(match).players[shooter].kills).toBe(115);
    expect(host(match).guestInventory.has('raygun')).toBe(false);
    expect(match.guestSide.ctx.grantWeapon).not.toHaveBeenCalledWith('raygun');
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
    host(match).players.host.kills = pickup.requiredKills!;
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

  it.each([0])('validates the guest own kills and wallet for special case %i', (index) => {
    const match = startedMatch();
    const authority = host(match);
    const pickup = authority.world.arena.weaponPickups[index];
    const required = pickup.requiredKills!;
    const door = authority.world.findDoor(pickup.requiredDoorId!)!;
    authority.world.unlockDoor(door, () => true);
    authority.players.host.kills = 300;
    authority.players.guest.kills = required - 1;
    earn(authority.players.guest.economy, pickup.cost);
    placePlayer(match.guestSide.player, pickup.position.x, pickup.position.z, pickup.floor, pickup.position.y - 1.1);
    match.step(0.1, 3);
    const request = { type: 'mapUse' as const, kind: 'pickup' as const, id: pickup.id, equippedWeapon: 'm1911' as const };
    match.relay.host.onMessage?.(request);
    match.relay.flush();
    expect(pickup.available).toBe(true);
    expect(authority.players.guest.economy.points).toBe(pickup.cost);
    expect(authority.guestInventory.has(pickup.weaponId)).toBe(false);
    expect(match.guest.getInteractPrompt()).toContain(`${required - 1}/${required} kills`);

    authority.players.guest.kills = required;
    authority.players.guest.economy.spend(10);
    match.relay.host.onMessage?.(request);
    match.relay.flush();
    expect(pickup.available).toBe(true);
    expect(authority.players.guest.economy.points).toBe(pickup.cost - 10);
    authority.players.guest.economy.awardHit();
    match.relay.host.onMessage?.(request);
    match.step(0.1, 3);
    expect(pickup.available).toBe(false);
    expect(authority.players.guest.economy.points).toBe(0);
    expect(authority.players.host.economy.points).toBe(0);
    expect(authority.guestInventory.has(pickup.weaponId)).toBe(true);
    expect(match.guestSide.ctx.grantWeapon).toHaveBeenCalledWith(pickup.weaponId);
    expect(guest(match).world.arena.weaponPickups[index].available).toBe(false);
    match.relay.host.onMessage?.(request);
    match.step(0.1, 2);
    expect(authority.players.guest.economy.points).toBe(0);
    match.host.onRestartRequested();
    match.step(0.1, 3);
    expect(pickup.available).toBe(true);
    expect(guest(match).world.arena.weaponPickups[index].available).toBe(true);
    expect(authority.players.guest.kills).toBe(0);
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
    expect(match.hostSide.ctx.audio.startEndingAudio).toHaveBeenCalledTimes(1);
    expect(match.guestSide.ctx.audio.startEndingAudio).toHaveBeenCalledTimes(1);
    match.step(0.1, Math.round(NUCLEAR_ENDING_DURATION * 10) - 10);
    expect(host(match).phase).toBe('ending');
    expect(match.hostSide.ctx.audio.stopEndingAudio).not.toHaveBeenCalled();
    expect(match.guestSide.ctx.audio.stopEndingAudio).not.toHaveBeenCalled();
    match.step(0.1, 11);
    expect(host(match).phase).toBe('credits');
    expect(match.guestSide.hud.showCredits).toHaveBeenCalled();
    expect(match.hostSide.ctx.audio.stopEndingAudio).toHaveBeenCalledTimes(1);
    expect(match.guestSide.ctx.audio.stopEndingAudio).toHaveBeenCalledTimes(1);
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
