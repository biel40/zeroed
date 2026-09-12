import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WindowBarrier, type WindowBarrierConfig } from '../src/zombies/barriers/WindowBarrier';
import { WindowBarrierView } from '../src/zombies/barriers/WindowBarrierView';

const CONFIG: WindowBarrierConfig = {
  boardCount: 2,
  boardHp: 100,
  repairInterval: 0.1,
  repairRewardCap: 2,
};

const createView = (onBoardRebuilt: (() => void) | null = null) => {
  const barrier = new WindowBarrier('window', 0, 0, 0, 1, CONFIG);
  const parent = new THREE.Group();
  const view = new WindowBarrierView(barrier, parent, onBoardRebuilt, () => 0.5);
  const boards = view.group.children as THREE.Mesh[];
  return { barrier, view, boards };
};

describe('WindowBarrierView', () => {
  it('pulls a destroyed board toward the zombie before releasing it into a fall', () => {
    const { barrier, view, boards } = createView();
    const board = boards[0];
    const originalPosition = board.position.clone();
    const originalRotation = board.rotation.clone();
    const originalScale = board.scale.clone();

    barrier.damage(100);
    view.update(0.05);
    expect(board.visible).toBe(true);
    expect(board.position.z).toBeGreaterThan(originalPosition.z);
    expect(board.position.y).toBeGreaterThan(originalPosition.y);

    view.update(0.2);
    expect(board.position.z).toBeGreaterThan(originalPosition.z + 0.1);
    expect(board.rotation.x).not.toBe(originalRotation.x);

    view.update(0.7);
    expect(board.visible).toBe(false);
    expect(board.position.equals(originalPosition)).toBe(true);
    expect(board.rotation.equals(originalRotation)).toBe(true);
    expect(board.scale.equals(originalScale)).toBe(true);
  });

  it('seats a rebuilt board at its exact original transform before playing feedback', () => {
    const onBoardRebuilt = vi.fn();
    const { barrier, view, boards } = createView(onBoardRebuilt);
    const board = boards[0];
    const originalPosition = board.position.clone();
    const originalRotation = board.rotation.clone();
    const originalScale = board.scale.clone();

    barrier.damage(100);
    view.update(0.8);
    barrier.repair(0.1);
    view.update(0);

    expect(board.visible).toBe(true);
    expect(board.position.equals(originalPosition)).toBe(false);
    expect(onBoardRebuilt).not.toHaveBeenCalled();

    view.update(0.16);
    expect(board.position.equals(originalPosition)).toBe(false);
    view.update(0.16);

    expect(board.position.equals(originalPosition)).toBe(true);
    expect(board.rotation.equals(originalRotation)).toBe(true);
    expect(board.scale.equals(originalScale)).toBe(true);
    expect(onBoardRebuilt).toHaveBeenCalledTimes(1);
  });

  it('keeps board animations independent and lets the latest transition win', () => {
    const onBoardRebuilt = vi.fn();
    const { barrier, view, boards } = createView(onBoardRebuilt);

    barrier.damage(100);
    view.update(0.12);
    const firstBoardDepth = boards[0].position.z;

    barrier.damage(100);
    view.update(0.05);
    expect(boards[0].position.z).toBeGreaterThan(firstBoardDepth);
    expect(boards[1].position.z).toBeGreaterThan(0);

    barrier.repair(0.1);
    view.update(0);
    expect(boards[0].visible).toBe(true);

    barrier.damage(100);
    view.update(0.01);
    view.update(1);

    expect(boards[0].visible).toBe(false);
    expect(boards[1].visible).toBe(false);
    expect(onBoardRebuilt).not.toHaveBeenCalled();
  });

  it('cancels active animation state and restores exact transforms on reset', () => {
    const { barrier, view, boards } = createView();
    const originals = boards.map((board) => ({
      position: board.position.clone(),
      rotation: board.rotation.clone(),
      scale: board.scale.clone(),
    }));

    barrier.damage(100);
    barrier.damage(100);
    view.update(0.25);
    barrier.reset();
    view.reset();

    for (let i = 0; i < boards.length; i++) {
      expect(boards[i].visible).toBe(true);
      expect(boards[i].position.equals(originals[i].position)).toBe(true);
      expect(boards[i].rotation.equals(originals[i].rotation)).toBe(true);
      expect(boards[i].scale.equals(originals[i].scale)).toBe(true);
    }
  });
});
