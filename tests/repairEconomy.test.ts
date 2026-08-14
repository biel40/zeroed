import { describe, expect, it } from 'vitest';
import { PlayerEconomy, POINTS_REPAIR } from '../src/game/PlayerEconomy';
import { WindowBarrier } from '../src/zombies/barriers/WindowBarrier';

describe('Repair economy cap', () => {
  const config = {
    boardCount: 3,
    boardHp: 100,
    repairInterval: 0.5,
    repairRewardCap: 2,
  } as const;

  it('awards points for each rewardable board repaired', () => {
    const economy = new PlayerEconomy();
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, config);
    barrier.damage(100);
    barrier.damage(100);

    const result = barrier.repair(1.1);
    for (let i = 0; i < result.rewardableBoards; i++) {
      economy.awardRepair();
    }
    expect(economy.points).toBe(result.rewardableBoards * POINTS_REPAIR);
  });

  it('caps rewards at repairRewardCap per round', () => {
    const economy = new PlayerEconomy();
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, config);
    barrier.damage(100);
    barrier.damage(100);
    barrier.damage(100);

    const result = barrier.repair(2.0);
    for (let i = 0; i < result.rewardableBoards; i++) {
      economy.awardRepair();
    }
    expect(result.rewardableBoards).toBe(config.repairRewardCap);
    expect(economy.points).toBe(config.repairRewardCap * POINTS_REPAIR);
  });

  it('resets the cap and awards again after a new round', () => {
    const economy = new PlayerEconomy();
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, config);

    barrier.damage(100);
    const first = barrier.repair(0.5);
    for (let i = 0; i < first.rewardableBoards; i++) economy.awardRepair();
    barrier.resetRoundCap();

    barrier.damage(100);
    const second = barrier.repair(0.5);
    for (let i = 0; i < second.rewardableBoards; i++) economy.awardRepair();

    expect(economy.points).toBe(2 * POINTS_REPAIR);
  });
});
