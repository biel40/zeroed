import { describe, expect, it } from 'vitest';
import { WindowBarrier, type WindowBarrierConfig } from '../src/zombies/barriers/WindowBarrier';

const DEFAULT_CONFIG: WindowBarrierConfig = {
  boardCount: 3,
  boardHp: 100,
  repairInterval: 0.5,
  repairRewardCap: 2,
};

const fastConfig = (cap: number): WindowBarrierConfig => ({
  ...DEFAULT_CONFIG,
  repairRewardCap: cap,
});

describe('WindowBarrier pure logic', () => {
  it('starts intact', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, DEFAULT_CONFIG);
    expect(barrier.state).toBe('intact');
    expect(barrier.isDamaged).toBe(false);
    expect(barrier.isOpen).toBe(false);
    expect(barrier.intactCount).toBe(3);
  });

  it('reports damaged after one board is destroyed', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, DEFAULT_CONFIG);
    barrier.damage(100);
    expect(barrier.state).toBe('damaged');
    expect(barrier.isDamaged).toBe(true);
    expect(barrier.intactCount).toBe(2);
    expect(barrier.destroyedCount).toBe(1);
  });

  it('opens when all boards are destroyed', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, DEFAULT_CONFIG);
    barrier.damage(100);
    barrier.damage(100);
    barrier.damage(100);
    expect(barrier.state).toBe('destroyed');
    expect(barrier.isOpen).toBe(true);
    expect(barrier.isDamaged).toBe(true);
  });

  it('ignores damage once open', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, DEFAULT_CONFIG);
    barrier.damage(100);
    barrier.damage(100);
    barrier.damage(100);
    expect(barrier.damage(100)).toBe(0);
    expect(barrier.destroyedCount).toBe(3);
  });

  it('repairs one board per interval', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, DEFAULT_CONFIG);
    barrier.damage(100);
    barrier.damage(100);
    const result = barrier.repair(0.6);
    expect(result.boardsRepaired).toBe(1);
    expect(result.rewardableBoards).toBe(1);
    expect(barrier.intactCount).toBe(2);
    expect(barrier.state).toBe('repairing');
  });

  it('repairs multiple boards when enough time has passed', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, DEFAULT_CONFIG);
    barrier.damage(100);
    barrier.damage(100);
    barrier.damage(100);
    const result = barrier.repair(1.1);
    expect(result.boardsRepaired).toBe(2);
    expect(barrier.intactCount).toBe(2);
  });

  it('caps rewardable boards per round', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, fastConfig(1));
    barrier.damage(100);
    barrier.damage(100);
    const first = barrier.repair(0.5);
    expect(first.boardsRepaired).toBe(1);
    expect(first.rewardableBoards).toBe(1);
    const second = barrier.repair(0.5);
    expect(second.boardsRepaired).toBe(1);
    expect(second.rewardableBoards).toBe(0);
  });

  it('resets the reward cap each round', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, fastConfig(1));
    barrier.damage(100);
    barrier.repair(0.5);
    barrier.resetRoundCap();
    barrier.damage(100);
    const result = barrier.repair(0.5);
    expect(result.rewardableBoards).toBe(1);
  });

  it('stops repairing when the player releases interact', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, DEFAULT_CONFIG);
    barrier.damage(100);
    barrier.repair(0.25);
    barrier.stopRepair();
    expect(barrier.state).toBe('damaged');
    expect(barrier.repair(0.25).boardsRepaired).toBe(0);
  });

  it('becomes intact again after repairing all boards', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, DEFAULT_CONFIG);
    barrier.damage(100);
    barrier.repair(0.5);
    barrier.stopRepair();
    expect(barrier.state).toBe('intact');
    expect(barrier.isDamaged).toBe(false);
  });

  it('clears damage and partial repair timing on map reset', () => {
    const barrier = new WindowBarrier('w1', 0, 0, 0, 1, DEFAULT_CONFIG);
    barrier.damage(100);
    barrier.repair(0.3);
    barrier.reset();
    barrier.damage(100);
    expect(barrier.repair(0.2).boardsRepaired).toBe(0);
    expect(barrier.state).toBe('repairing');
  });
});
