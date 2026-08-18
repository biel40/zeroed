import { describe, expect, it } from 'vitest';
import { PlayerEconomy } from '../src/game/PlayerEconomy';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { PointDoor } from '../src/zombies/doors/PointDoor';
import type { ArenaCompletionInteraction, ArenaWeaponPickup } from '../src/zombies/maps/ZombieArena';

function bunkerDoor(): PointDoor {
  return new PointDoor(
    'nuclear-bunker',
    3.2,
    -2.5,
    1,
    0,
    { cost: 9999, prompt: 'Open sealed bunker', requiredMessage: '9999 PTS REQUIRED' },
  );
}

function addPoints(economy: PlayerEconomy, amount: number): void {
  for (let points = 0; points < amount; points += 100) economy.awardKill(true);
}

describe('Burned Mansion secret bunker interaction', () => {
  const ending: ArenaCompletionInteraction = {
    id: 'radiation-ending',
    cost: 30000,
    position: { x: 0, y: 0, z: 0 },
    floor: -1,
    useRange: 2,
    lookDotMin: 0,
  };

  it('shows the exact sealed-door prompt and required-points message', () => {
    const mode = new ZombiesMode('burned-mansion');
    const door = bunkerDoor();
    const banners: string[] = [];
    (mode as unknown as { ctx: unknown }).ctx = {
      profile: { useTouchControls: false },
      hud: {
        flashNotEnoughPoints: () => undefined,
        showRoundBanner: (title: string) => banners.push(title),
      },
    };
    (mode as unknown as { findFacingDoor(): PointDoor }).findFacingDoor = () => door;

    expect(mode.getInteractPrompt()).toBe('USE — Open sealed bunker — 9999 PTS');
    mode.onInteract();
    expect(door.isLocked).toBe(true);
    expect(banners).toEqual(['9999 PTS REQUIRED']);
  });

  it('charges exactly 9999 points and leaves the bunker permanently open for the run', () => {
    const mode = new ZombiesMode('burned-mansion');
    const door = bunkerDoor();
    const economy = new PlayerEconomy();
    addPoints(economy, 10000);
    let unlocks = 0;
    (mode as unknown as { economy: PlayerEconomy }).economy = economy;
    (mode as unknown as { ctx: unknown }).ctx = { hud: {}, profile: { useTouchControls: false } };
    (mode as unknown as { findFacingDoor(): PointDoor }).findFacingDoor = () => door;
    (mode as unknown as { onDoorUnlocked(): void }).onDoorUnlocked = () => { unlocks++; };

    mode.onInteract();
    mode.onInteract();

    expect(economy.points).toBe(1);
    expect(door.isLocked).toBe(false);
    expect(unlocks).toBe(1);
  });

  it.each([
    ['raygun', 'rayGunUnlocked'],
    ['tesla', 'teslaUnlocked'],
  ] as const)('grants %s and marks its existing milestone when the bunker pickup is used', (weaponId, flag) => {
    const mode = new ZombiesMode('burned-mansion');
    let claimed = false;
    const pickup: ArenaWeaponPickup = {
      id: `bunker-${weaponId}`,
      weaponId,
      position: { x: 0, y: 0, z: 0 },
      floor: -1,
      useRange: 2,
      lookDotMin: 0,
      available: true,
      claim: () => { claimed = true; return true; },
      reset: () => undefined,
    };
    const grants: string[] = [];
    (mode as unknown as { ctx: unknown }).ctx = {
      canGrantWeapon: () => true,
      grantWeapon: (id: string) => { grants.push(id); return true; },
      audio: { playMysteryBoxPickup: () => undefined },
    };
    (mode as unknown as { findFacingDoor(): null }).findFacingDoor = () => null;
    (mode as unknown as { findRepairableBarrier(): null }).findRepairableBarrier = () => null;
    (mode as unknown as { findFacingWallBuy(): null }).findFacingWallBuy = () => null;
    (mode as unknown as { findFacingWeaponPickup(): ArenaWeaponPickup }).findFacingWeaponPickup = () => pickup;

    mode.onInteract();

    expect(grants).toEqual([weaponId]);
    expect(claimed).toBe(true);
    expect((mode as unknown as Record<string, boolean>)[flag]).toBe(true);
  });

  it('shows 30000 points and rejects the ending without charging', () => {
    const mode = new ZombiesMode('burned-mansion');
    const economy = new PlayerEconomy();
    addPoints(economy, 29900);
    const banners: string[] = [];
    (mode as unknown as { economy: PlayerEconomy }).economy = economy;
    (mode as unknown as { ctx: unknown }).ctx = {
      profile: { useTouchControls: false },
      hud: {
        flashNotEnoughPoints: () => undefined,
        showRoundBanner: (title: string, sub: string) => banners.push(`${title}|${sub}`),
      },
    };
    (mode as any).findFacingDoor = () => null;
    (mode as any).findRepairableBarrier = () => null;
    (mode as any).findFacingWallBuy = () => null;
    (mode as any).findFacingWeaponPickup = () => null;
    (mode as any).findFacingCompletionInteraction = () => ending;

    expect(mode.getInteractPrompt()).toBe('ACTIVATE FINAL\nPress E — 30000 PTS');
    mode.onInteract();

    expect(economy.points).toBe(29900);
    expect(banners).toEqual(['NOT ENOUGH POINTS|30000 PTS NEEDED']);
  });

  it('charges the ending exactly once and rejects repeated activation', () => {
    const mode = new ZombiesMode('burned-mansion');
    const economy = new PlayerEconomy();
    addPoints(economy, 30100);
    let endings = 0;
    (mode as unknown as { economy: PlayerEconomy }).economy = economy;
    (mode as unknown as { ctx: unknown }).ctx = { profile: { useTouchControls: false } };
    (mode as any).findFacingDoor = () => null;
    (mode as any).findRepairableBarrier = () => null;
    (mode as any).findFacingWallBuy = () => null;
    (mode as any).findFacingWeaponPickup = () => null;
    (mode as any).findFacingCompletionInteraction = () => ending;
    (mode as any).beginEnding = () => { endings++; };

    mode.onInteract();
    mode.onInteract();

    expect(economy.points).toBe(100);
    expect(endings).toBe(1);
    expect(mode.isGameplayInputEnabled()).toBe(false);
  });
});
