import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRENADE_DEFINITIONS, LETHAL_GRENADE_LOADOUT } from '../src/config/grenades';
import type { LethalGrenadeStock } from '../src/game/LethalGrenadeStock';
import type { CoopGrenades } from '../src/modes/coop/CoopGrenades';
import type { CoopWorld } from '../src/modes/coop/CoopWorld';
import type { CoopPlayerId } from '../src/network/Protocol';
import { GRENADE_THROW_DURATION } from '../src/weapons/GrenadeThrow';
import type { Zombie } from '../src/zombies/Zombie';
import { roundConfig, ZOMBIE_SPAWN_DURATION } from '../src/zombies/ZombieConfig';
import type { ZombieManager } from '../src/zombies/ZombieManager';
import type { ZombieReplica } from '../src/zombies/ZombieReplica';
import type { GrenadeLaunch } from '../src/zombies/grenades/ThrownGrenades';
import { installCanvasDocument, makeMatch, type CoopMatch } from './coopHarness';

const F1 = GRENADE_DEFINITIONS.f1;

interface HostInternals {
  readonly world: CoopWorld;
  readonly zombies: ZombieManager;
  readonly grenades: CoopGrenades;
  readonly guestGrenades: LethalGrenadeStock;
  readonly shooter: CoopPlayerId;
  acceptGrenadeThrow(launch: GrenadeLaunch): void;
}

interface GuestInternals {
  readonly replica: ZombieReplica;
  readonly grenades: CoopGrenades;
}

const host = (match: CoopMatch): HostInternals => match.host as unknown as HostInternals;
const guest = (match: CoopMatch): GuestInternals => match.guest as unknown as GuestInternals;

function startedMatch(): CoopMatch {
  const match = makeMatch();
  match.host.onGameplayStarted();
  match.guest.onGameplayStarted();
  match.step();
  return match;
}

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());
beforeEach(() => { vi.useFakeTimers({ toFake: ['performance'] }); });
afterEach(() => { vi.useRealTimers(); });

describe('co-op grenades', () => {
  it('replays the host\'s throw on the guest, who only watches the blast', () => {
    const match = startedMatch();
    expect(match.host.onLethalThrow()).toBe(true);
    match.step(1 / 30, Math.ceil(GRENADE_THROW_DURATION * 30));
    expect(host(match).grenades.blasts.liveCount).toBe(1);
    expect(guest(match).grenades.blasts.liveCount).toBe(1);
    expect(match.hostSide.hud.setLethalGrenades).toHaveBeenLastCalledWith(LETHAL_GRENADE_LOADOUT.starting - 1, LETHAL_GRENADE_LOADOUT.max);
    match.step(1 / 30, Math.ceil(F1.fuseSeconds * 30));
    expect(host(match).grenades.blasts.liveCount).toBe(0);
    expect(guest(match).grenades.blasts.liveCount).toBe(0);
    expect(match.guestSide.ctx.audio.playGrenadeExplosion).toHaveBeenCalledOnce();
  });

  it('resolves the guest\'s grenade on the host, crediting the guest', () => {
    const match = startedMatch();
    let shooter: CoopPlayerId | null = null;
    vi.spyOn(host(match).zombies, 'applyExplosion').mockImplementation(() => {
      shooter = host(match).shooter;
      return 0;
    });
    // The guest needs a first snapshot and the host a first guest state.
    match.step(0.1, 3);
    expect(match.guest.onLethalThrow()).toBe(true);
    match.step(1 / 30, Math.ceil(GRENADE_THROW_DURATION * 30));
    expect(host(match).grenades.blasts.liveCount).toBe(1);
    expect(host(match).guestGrenades.count).toBe(LETHAL_GRENADE_LOADOUT.starting - 1);
    match.step(1 / 30, Math.ceil(F1.fuseSeconds * 30));
    expect(shooter).toBe('guest');
    expect(host(match).shooter).toBe('host');
  });

  it('ignores a guest throw that does not start at the guest, or with an empty pouch', () => {
    const match = startedMatch();
    match.step(0.1, 3);
    const internals = host(match);
    const far: GrenadeLaunch = { from: { x: 90, y: 1.7, z: 90 }, origin: { x: 90, y: 1.6, z: 89.7 }, aim: { x: 0, y: 0, z: -1 }, fuse: 2, floorY: 0 };
    internals.acceptGrenadeThrow(far);
    expect(internals.grenades.blasts.liveCount).toBe(0);
    while (internals.guestGrenades.count > 0) internals.guestGrenades.consume();
    expect(match.guest.onLethalThrow()).toBe(true);
    match.step(1 / 30, Math.ceil(GRENADE_THROW_DURATION * 30));
    expect(internals.grenades.blasts.liveCount).toBe(0);
  });

  it('shows a crippled body crawling on the guest too', () => {
    const match = startedMatch();
    const spawn = host(match).world.arena.playerSpawn;
    expect(host(match).zombies.spawnZombie(roundConfig(1), spawn.x, spawn.z, 1)).toBe(true);
    match.step(1 / 30, Math.ceil(ZOMBIE_SPAWN_DURATION * 30) + 2);
    const body = [...host(match).zombies.actives].at(-1) as Zombie;
    expect(body.cripple()).toBe(true);
    match.step(1 / 30, 3);
    const id = host(match).zombies.networkIdOf(body);
    const replica = guest(match).replica.zombieOf(id);
    expect(replica?.isCrippled).toBe(true);
  });
});
