import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import type { PlayerEconomy } from '../src/game/PlayerEconomy';
import { RING_DEFINITIONS } from '../src/game/rings/RingCatalog';
import { t } from '../src/i18n/i18n';
import { EYE_HEIGHT } from '../src/player/PlayerController';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { Station33Arena } from '../src/zombies/maps/Station33Arena';
import { Weapon } from '../src/weapons/Weapon';
import { ZEUS_MACHINE_CHARGE_REACH, ZEUS_MACHINE_CHARGE_SECONDS } from '../src/zombies/ZombieConfig';
import { installCanvasDocument, makeContext, type TestContext } from './coopHarness';

const SLEIGHT = RING_DEFINITIONS.sleightOfHand;
const [PRICE] = SLEIGHT.prices;
const FACE_SOUTH = Math.PI;

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

interface ModeInternals {
  arena: Station33Arena;
  economy: PlayerEconomy;
  rings: { updateJingle(audible: boolean): void };
  onEnergyImpact(point: THREE.Vector3, config: EnergyConfig, object: THREE.Object3D | null, distance: number): void;
}

type EnergyConfig = NonNullable<typeof WEAPON_DEFINITIONS.tesla.energy>;
const ZEUS = WEAPON_DEFINITIONS.tesla.energy!;
const RAY_GUN = WEAPON_DEFINITIONS.raygun.energy!;

function startRun(): { mode: ZombiesMode; internals: ModeInternals; side: TestContext } {
  const side = makeContext();
  const mode = new ZombiesMode('station-33');
  mode.init(side.ctx);
  return { mode, internals: mode as unknown as ModeInternals, side };
}

function fund(economy: PlayerEconomy, points: number): void {
  for (let earned = 0; earned < points; earned += 10) economy.awardRepair();
}

/** Stands on the train-shed apron in front of the crew locker, looking into it. */
function faceCrewLocker({ internals, side }: { internals: ModeInternals; side: TestContext }): void {
  const machine = internals.arena.ringMachines.find((candidate) => candidate.ringId === 'sleightOfHand')!;
  side.player.teleport(machine.position.x, EYE_HEIGHT, machine.position.z - 0.5, 0);
  side.player.face(FACE_SOUTH);
  side.player.rig.updateMatrixWorld(true);
}

describe('Sleight of Hand ring', () => {
  it('is a passive pinky ring, green, sold once for 3500 with its own tune', () => {
    expect(SLEIGHT.finger).toBe('pinky');
    expect(SLEIGHT.prices).toEqual([3500]);
    expect(SLEIGHT.glowColor).toBe(0x4fe08a);
    expect(SLEIGHT.jingle).not.toBe(RING_DEFINITIONS.resurrection.jingle);
    expect(SLEIGHT.effect).toEqual({ kind: 'reloadSpeed', reloadTimeScale: 0.5 });
  });

  it('cannot be bought, and stays silent, until the power is on', () => {
    const run = startRun();
    const { mode, internals, side } = run;
    faceCrewLocker(run);
    fund(internals.economy, PRICE);
    expect(mode.getInteractPrompt()).toBe(t('prompt.ringNeedsPower', { ring: t(SLEIGHT.nameKey) }));
    mode.onInteract();
    expect(internals.economy.points).toBe(PRICE);
    expect(side.ctx.handRings.show).not.toHaveBeenCalled();
    internals.rings.updateJingle(true);
    expect(side.ctx.audio.setRingJingle).toHaveBeenLastCalledWith(0, 0, 0);
  });

  it('plays its tune and sells the ring once the power is on, halving every reload', () => {
    const run = startRun();
    const { mode, internals, side } = run;
    internals.arena.switchOnPower();
    faceCrewLocker(run);
    internals.rings.updateJingle(true);
    expect(vi.mocked(side.ctx.audio.setRingJingle).mock.lastCall).toEqual([1, expect.any(Number), expect.any(Number), SLEIGHT.jingle]);

    expect(mode.getInteractPrompt()).toContain(`${PRICE}`);
    expect(side.ctx.setReloadTimeScale).toHaveBeenLastCalledWith(1);
    fund(internals.economy, PRICE);
    mode.onInteract();
    expect(internals.economy.points).toBe(0);
    expect(side.ctx.handRings.show).toHaveBeenLastCalledWith('pinky', 'charged', SLEIGHT.glowColor);
    expect(side.ctx.audio.playRingPurchase).toHaveBeenCalledOnce();
    expect(side.ctx.setReloadTimeScale).toHaveBeenLastCalledWith(0.5);
    // Passive and bought once: nothing more to sell this run.
    expect(mode.getInteractPrompt()).toBeNull();

    mode.onRestartRequested();
    expect(side.ctx.setReloadTimeScale).toHaveBeenLastCalledWith(1);
    expect(internals.arena.ringMachines[1].powered).toBe(false);
  });
});

describe('Weapon reload time scale', () => {
  it('finishes a reload in the scaled share of its time', () => {
    const definition = WEAPON_DEFINITIONS.ak47;
    const reloadAfter = (scale: number, seconds: number): number => {
      const weapon = new Weapon(definition);
      weapon.reloadTimeScale = scale;
      weapon.ammoInMagazine = 0;
      weapon.reload();
      weapon.update(seconds, { trigger: false, ads: false });
      return weapon.ammoInMagazine;
    };
    const halfTime = definition.reloadTime * 0.5 + 0.01;
    expect(reloadAfter(1, halfTime)).toBe(0);
    expect(reloadAfter(0.5, halfTime)).toBe(definition.magazineSize);
  });
});

describe('ZEUS-77 temporary power', () => {
  /** The crew locker, and a point on its front where a bolt would ground out. */
  function crewLocker(internals: ModeInternals) {
    const machine = internals.arena.ringMachines.find((candidate) => candidate.ringId === 'sleightOfHand')!;
    const impact = new THREE.Vector3(machine.position.x + 0.3, machine.position.y - 0.4, machine.position.z);
    return { machine, impact };
  }

  it('powers the waiting locker for a minute: it sells and plays meanwhile, then goes dark', () => {
    const run = startRun();
    const { mode, internals, side } = run;
    const { machine, impact } = crewLocker(internals);
    expect(machine.powered).toBe(false);

    internals.onEnergyImpact(impact, ZEUS, null, 8);
    expect(machine.powered).toBe(true);
    expect(side.hud.showRoundBanner).toHaveBeenLastCalledWith(t(SLEIGHT.nameKey), t('banner.machineCharged', { seconds: ZEUS_MACHINE_CHARGE_SECONDS }));
    expect(side.ctx.audio.playTeslaChain).toHaveBeenLastCalledWith(1);
    faceCrewLocker(run);
    expect(mode.getInteractPrompt()).toContain(String(PRICE));
    internals.rings.updateJingle(true);
    expect(vi.mocked(side.ctx.audio.setRingJingle).mock.lastCall![3]).toBe(SLEIGHT.jingle);

    internals.arena.update(ZEUS_MACHINE_CHARGE_SECONDS - 1);
    expect(machine.powered).toBe(true);
    internals.arena.update(1.1);
    expect(machine.powered).toBe(false);
    expect(mode.getInteractPrompt()).toBe(t('prompt.ringNeedsPower', { ring: t(SLEIGHT.nameKey) }));
  });

  it('lets the ring be bought while charged, and the ring keeps working once the charge is gone', () => {
    const run = startRun();
    const { mode, internals, side } = run;
    internals.onEnergyImpact(crewLocker(internals).impact, ZEUS, null, 8);
    faceCrewLocker(run);
    fund(internals.economy, PRICE);
    mode.onInteract();
    expect(internals.economy.points).toBe(0);
    internals.arena.update(ZEUS_MACHINE_CHARGE_SECONDS + 1);
    expect(side.ctx.setReloadTimeScale).toHaveBeenLastCalledWith(0.5);
  });

  it('restarts the minute on a second bolt instead of adding to it', () => {
    const { internals } = startRun();
    const { machine, impact } = crewLocker(internals);
    internals.onEnergyImpact(impact, ZEUS, null, 8);
    internals.arena.update(40);
    internals.onEnergyImpact(impact, ZEUS, null, 8);
    internals.arena.update(ZEUS_MACHINE_CHARGE_SECONDS - 1);
    expect(machine.powered).toBe(true);
    internals.arena.update(1.1);
    expect(machine.powered).toBe(false);
  });

  it('ignores bolts out of reach, other energy weapons, mains power and lockers that need none', () => {
    const { internals, side } = startRun();
    const { machine, impact } = crewLocker(internals);
    const far = impact.clone().add(new THREE.Vector3(0, 0, -(ZEUS_MACHINE_CHARGE_REACH + 0.5)));
    internals.onEnergyImpact(far, ZEUS, null, 8);
    internals.onEnergyImpact(impact, RAY_GUN, null, 8);
    expect(machine.powered).toBe(false);

    const resurrection = internals.arena.ringMachines.find((candidate) => candidate.ringId === 'resurrection')!;
    internals.onEnergyImpact(new THREE.Vector3(resurrection.position.x, resurrection.position.y, resurrection.position.z), ZEUS, null, 8);
    internals.arena.switchOnPower();
    internals.onEnergyImpact(impact, ZEUS, null, 8);
    expect(side.ctx.audio.playTeslaChain).not.toHaveBeenCalled();
  });

  it('forgets the charge on a new run', () => {
    const { mode, internals } = startRun();
    const { machine, impact } = crewLocker(internals);
    internals.onEnergyImpact(impact, ZEUS, null, 8);
    mode.onRestartRequested();
    expect(machine.powered).toBe(false);
  });
});
