import { describe, expect, it } from 'vitest';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { PlayerEconomy } from '../src/game/PlayerEconomy';
import { MYSTERY_BOX_TUNING } from '../src/zombies/MysteryBox';

/**
 * Mystery Box purchase flow against the centralized Points wallet. The mode
 * is driven without init(): onInteract only touches the box state machine,
 * the economy and the HUD/context surface mocked here — exactly the objects
 * the real game wires. The anti-double-charge guarantee comes from the box
 * state machine (tryActivate only fires from 'closed') plus atomic spend().
 */
describe('Mystery Box purchase with Points', () => {
  interface Mock {
    economy: PlayerEconomy;
    activated: number;
    deniedFlashes: number;
    granted: string[];
  }

  function makeMode(startingPoints: number): { mode: ZombiesMode; mock: Mock } {
    const mode = new ZombiesMode();
    const mock: Mock = {
      economy: new PlayerEconomy(),
      activated: 0,
      deniedFlashes: 0,
      granted: [],
    };
    // Preload the wallet to an exact amount: headshots for the hundreds,
    // then plain hits (+10) for the remainder.
    let target = startingPoints;
    while (target >= 100) {
      mock.economy.awardKill(true);
      target -= 100;
    }
    while (target >= 10) {
      mock.economy.awardHit();
      target -= 10;
    }

    // A minimal box double: a real MysteryBoxMachine would also work, but a
    // focused double isolates the purchase gate from the roll timing.
    const box = {
      state: 'closed' as string,
      result: null as string | null,
      tryActivate: () => {
        if (box.state !== 'closed') return false;
        box.state = 'opening';
        mock.activated++;
        return true;
      },
      tryPickup: () => null,
    };

    (mode as unknown as Record<string, unknown>).economy = mock.economy;
    (mode as unknown as Record<string, unknown>).box = box;
    (mode as unknown as Record<string, unknown>).gameOver = false;
    (mode as unknown as Record<string, unknown>).ctx = {
      grantWeapon: (id: string) => mock.granted.push(id),
      hud: {
        flashNotEnoughPoints: () => {
          mock.deniedFlashes++;
        },
        showRoundBanner: () => undefined,
      },
    };
    // Bypass the spatial gate: the player is next to the box in these tests.
    (mode as unknown as Record<string, unknown>).playerInBoxRange = () => true;
    return { mode, mock };
  }

  it('charges exactly 950 and opens when the player can afford it', () => {
    const { mode, mock } = makeMode(1000);
    mode.onInteract();
    expect(mock.activated).toBe(1);
    expect(mock.economy.points).toBe(1000 - MYSTERY_BOX_TUNING.cost);
  });

  it('refuses the purchase and flashes feedback when short on points', () => {
    const { mode, mock } = makeMode(500);
    mode.onInteract();
    expect(mock.activated).toBe(0);
    expect(mock.deniedFlashes).toBe(1);
    expect(mock.economy.points).toBe(500); // untouched
  });

  it('never double-charges on repeated presses during the animation', () => {
    const { mode, mock } = makeMode(2000);
    mode.onInteract(); // buys, box leaves 'closed'
    mode.onInteract(); // pressed again mid-animation: NOT closed, no charge
    mode.onInteract();
    expect(mock.activated).toBe(1);
    expect(mock.economy.points).toBe(2000 - MYSTERY_BOX_TUNING.cost);
  });

  it('a player with exactly 950 can buy once and is left at zero', () => {
    const { mode, mock } = makeMode(950);
    mode.onInteract();
    expect(mock.activated).toBe(1);
    expect(mock.economy.points).toBe(0);
    // Second attempt now fails: nothing left.
    (mode as unknown as Record<string, unknown>).box = {
      state: 'closed',
      result: null,
      tryActivate: () => {
        mock.activated++;
        return true;
      },
      tryPickup: () => null,
    };
    mode.onInteract();
    expect(mock.activated).toBe(1); // no second activation
    expect(mock.deniedFlashes).toBe(1);
  });
});
