import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EmergenceSitePicker } from '../src/zombies/emergence/EmergenceSitePicker';
import {
  emergenceDuration,
  emergencePose,
  type ZombieEmergenceSite,
  type ZombieEmergenceStage,
  type ZombieEmergenceTuning,
} from '../src/zombies/emergence/ZombieEmergence';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { installCanvasDocument } from './coopHarness';

const DT = 1 / 60;
const TIMING = { stir: 1, rise: 1, climb: 1 } as const;
const TUNING: ZombieEmergenceTuning = { chance: 0.5, minRound: 2, cooldown: 10, minPlayerDistance: 3, timing: TIMING };
const TOMB: ZombieEmergenceSite = {
  id: 'tomb', floor: 0, rise: { x: 0, y: 0, z: 0 }, exit: { x: 1.4, z: 0 }, rim: 1.07, rimDistance: 0.25,
};
const FAR_TOMB: ZombieEmergenceSite = { ...TOMB, id: 'far-tomb', rise: { x: 0, y: 0, z: 10 }, exit: { x: 1.4, z: 10 } };
const always = (): boolean => true;

/** Random source answering `values` in turn, then the last one forever. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

describe('emergence choreography', () => {
  it('keeps the body buried while the site stirs, rises it, then climbs it out', () => {
    const pose = { rise: 0, climb: 0 };
    expect(emergencePose(0.5, TIMING, pose)).toEqual({ rise: 0, climb: 0 });
    emergencePose(1.5, TIMING, pose);
    expect(pose.rise).toBeCloseTo(0.75, 5);
    expect(pose.climb).toBe(0);
    emergencePose(2.5, TIMING, pose);
    expect(pose.rise).toBe(1);
    expect(pose.climb).toBeCloseTo(0.5, 5);
    expect(emergencePose(9, TIMING, pose)).toEqual({ rise: 1, climb: 1 });
    expect(emergenceDuration(TIMING)).toBe(3);
  });
});

describe('EmergenceSitePicker', () => {
  it('takes a spawn only on a site floor, from its first round, when the chance rolls', () => {
    const picker = new EmergenceSitePicker(sequence(0.4, 0));
    picker.setSites([TOMB], TUNING);
    expect(picker.pick(1, 2, 10, 0, always)).toBeNull();
    expect(picker.pick(0, 1, 10, 0, always)).toBeNull();
    expect(picker.pick(0, 2, 10, 0, always)).toBe(TOMB);
    const unlucky = new EmergenceSitePicker(() => 0.5);
    unlucky.setSites([TOMB], TUNING);
    expect(unlucky.pick(0, 2, 10, 0, always)).toBeNull();
  });

  it('draws nothing when no site could take the spawn', () => {
    let draws = 0;
    const picker = new EmergenceSitePicker(() => { draws++; return 0; });
    picker.setSites([TOMB], TUNING);
    picker.pick(1, 5, 10, 0, always);
    picker.pick(0, 5, 1, 0, always);
    picker.pick(0, 5, 10, 0, () => false);
    expect(draws).toBe(0);
    picker.setSites([TOMB], null);
    expect(picker.active).toBeNull();
    expect(picker.pick(0, 5, 10, 0, always)).toBeNull();
  });

  it('rests a used site for its cooldown and leaves the player elbow room', () => {
    const picker = new EmergenceSitePicker(() => 0);
    picker.setSites([TOMB, FAR_TOMB], TUNING);
    expect(picker.pick(0, 2, 10, 0, always)).toBe(TOMB);
    expect(picker.pick(0, 2, 10, 0, always)).toBe(FAR_TOMB);
    expect(picker.pick(0, 2, 10, 0, always)).toBeNull();
    picker.update(TUNING.cooldown);
    // The player stands by the far tomb: only the near one may stir.
    expect(picker.pick(0, 2, 0, 10, always)).toBe(TOMB);
    picker.reset();
    expect(picker.pick(0, 2, 0, 10, always)).toBe(TOMB);
  });

  it('skips a site whose exit the caller finds blocked', () => {
    const picker = new EmergenceSitePicker(() => 0);
    picker.setSites([TOMB, FAR_TOMB], TUNING);
    expect(picker.pick(0, 2, 30, 0, (site) => site !== TOMB)).toBe(FAR_TOMB);
  });
});

/** A manager with one ordinary spawn far away and the test tomb awake. */
function tombManager(typeRng = () => 0.99): { manager: ZombieManager; stages: ZombieEmergenceStage[] } {
  const manager = new ZombieManager(() => 0, {}, false, [{ x: 30, z: 0 }], [], [], typeRng);
  manager.registerColliders([]);
  manager.setEmergenceSites([TOMB], TUNING);
  const stages: ZombieEmergenceStage[] = [];
  manager.onZombieEmerging = (_site, stage) => stages.push(stage);
  return { manager, stages };
}

function run(manager: ZombieManager, seconds: number, playerX: number, playerZ: number): void {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += DT) manager.update(DT, playerX, playerZ);
}

describe('ZombieManager tomb emergence', () => {
  it('raises a walker inside the tomb that cannot hunt or strike before it has climbed out', () => {
    const { manager, stages } = tombManager();
    let strikes = 0;
    manager.onZombieAttack = () => { strikes++; };
    expect(manager.spawnZombie(roundConfig(2), 6, 0, 2)).toBe(true);
    const zombie = [...manager.actives][0];
    expect(zombie.position.x).toBe(0);
    expect(zombie.state).toBe('spawn');
    expect(manager.isEmerging(zombie)).toBe(true);
    expect(zombie.barrierTarget).toBeNull();
    expect(stages).toEqual(['stir']);

    // The player waits right at the exit: nothing reaches for them while it rises.
    run(manager, emergenceDuration(TIMING) - 0.05, 2.4, 0);
    expect(stages).toEqual(['stir', 'breach']);
    expect(zombie.state).toBe('spawn');
    expect(strikes).toBe(0);
    expect(zombie.position.z).toBe(0);
    expect(zombie.position.x).toBeGreaterThan(1.2);
    expect(zombie.position.x).toBeLessThanOrEqual(TOMB.exit.x);

    run(manager, 0.1, 2.4, 0);
    expect(manager.isEmerging(zombie)).toBe(false);
    expect(zombie.state).not.toBe('spawn');
    run(manager, 2, 2.4, 0);
    expect(strikes).toBeGreaterThan(0);
  });

  it('hunts from the exit once released', () => {
    const { manager } = tombManager();
    manager.spawnZombie(roundConfig(2), 6, 0, 2);
    const zombie = [...manager.actives][0];
    run(manager, emergenceDuration(TIMING) + 0.02, 12, 0);
    expect(zombie.position.x).toBeCloseTo(TOMB.exit.x, 1);
    run(manager, 1.5, 12, 0);
    expect(zombie.position.x).toBeGreaterThan(TOMB.exit.x + 0.5);
  });

  it('drops a body killed while it rises', () => {
    const { manager } = tombManager();
    manager.spawnZombie(roundConfig(2), 6, 0, 2);
    const zombie = [...manager.actives][0];
    run(manager, 1.5, 6, 0);
    manager.damageZombie(zombie, 'head', 10_000);
    run(manager, DT, 6, 0);
    expect(manager.isEmerging(zombie)).toBe(false);
    expect(zombie.isAlive).toBe(false);
  });

  it('leaves brutes and spawns off the tombs floor to their entrances', () => {
    const brutes = tombManager(() => 0).manager;
    brutes.spawnZombie(roundConfig(20), 6, 0, 20);
    const brute = [...brutes.actives][0];
    expect(brute.typeId).toBe('brute');
    expect(brutes.isEmerging(brute)).toBe(false);

    const { manager, stages } = tombManager();
    manager.setEmergenceSites([{ ...TOMB, floor: 1 }], TUNING);
    manager.spawnZombie(roundConfig(2), 6, 0, 2);
    const walker = [...manager.actives][0];
    expect(walker.position.x).toBe(30);
    expect(manager.isEmerging(walker)).toBe(false);
    expect(stages).toEqual([]);
  });

  it('forgets every rising on reset', () => {
    const { manager } = tombManager();
    manager.spawnZombie(roundConfig(2), 6, 0, 2);
    const zombie = [...manager.actives][0];
    manager.reset();
    expect(manager.isEmerging(zombie)).toBe(false);
    expect(manager.spawnZombie(roundConfig(2), 6, 0, 2)).toBe(true);
  });
});
