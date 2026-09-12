import * as THREE from 'three';
import type { WindowBarrier } from './WindowBarrier';

const BOARD_WIDTH = 1.5;
const BOARD_HEIGHT = 0.12;
const BOARD_THICK = 0.045;
const GAP = 0.07;
const PULL_DURATION = 0.18;
const BREAK_MIN_DURATION = 0.82;
const BREAK_MAX_DURATION = 0.96;
const REBUILD_DURATION = 0.32;

type BoardVisualState = 'intact' | 'breaking' | 'destroyed' | 'rebuilding';

interface BoardAnimation {
  readonly mesh: THREE.Mesh;
  readonly originalPosition: THREE.Vector3;
  readonly originalRotation: THREE.Euler;
  readonly originalScale: THREE.Vector3;
  state: BoardVisualState;
  revision: number;
  elapsed: number;
  duration: number;
  lateralOffset: number;
  depthOffset: number;
  liftDistance: number;
  dropDistance: number;
  impactRotationX: number;
  impactRotationY: number;
  impactRotationZ: number;
  spinX: number;
  spinY: number;
  spinZ: number;
  rebuildOffsetX: number;
  rebuildOffsetY: number;
  rebuildOffsetZ: number;
  rebuildRotationX: number;
  rebuildRotationY: number;
  rebuildRotationZ: number;
}

let sharedGeometry: THREE.BoxGeometry | null = null;
let sharedMaterial: THREE.MeshStandardMaterial | null = null;

function getGeometry(): THREE.BoxGeometry {
  sharedGeometry ??= new THREE.BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, BOARD_THICK);
  return sharedGeometry;
}

function getMaterial(): THREE.MeshStandardMaterial {
  sharedMaterial ??= new THREE.MeshStandardMaterial({
    color: 0x5a4636,
    roughness: 0.9,
    metalness: 0.05,
  });
  return sharedMaterial;
}

/**
 * Visual representation of a boarded window. Boards are individual meshes
 * sharing geometry/material so broken ones can be hidden independently.
 */
export class WindowBarrierView {
  readonly group = new THREE.Group();
  private readonly boards: BoardAnimation[] = [];

  constructor(
    private readonly barrier: WindowBarrier,
    parent: THREE.Object3D,
    private readonly onBoardRebuilt: (() => void) | null = null,
    private readonly rng: () => number = Math.random,
  ) {
    const geometry = getGeometry();
    const material = getMaterial();

    const totalHeight = barrier.boards.length * BOARD_HEIGHT + (barrier.boards.length - 1) * GAP;
    const startY = totalHeight / 2 - BOARD_HEIGHT / 2;

    for (let i = 0; i < barrier.boards.length; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = startY - i * (BOARD_HEIGHT + GAP);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const intact = barrier.boards[i].hp > 0;
      mesh.visible = intact;
      this.boards.push({
        mesh,
        originalPosition: mesh.position.clone(),
        originalRotation: mesh.rotation.clone(),
        originalScale: mesh.scale.clone(),
        state: intact ? 'intact' : 'destroyed',
        revision: barrier.boards[i].revision,
        elapsed: 0,
        duration: 0,
        lateralOffset: 0,
        depthOffset: 0,
        liftDistance: 0,
        dropDistance: 0,
        impactRotationX: 0,
        impactRotationY: 0,
        impactRotationZ: 0,
        spinX: 0,
        spinY: 0,
        spinZ: 0,
        rebuildOffsetX: 0,
        rebuildOffsetY: 0,
        rebuildOffsetZ: 0,
        rebuildRotationX: 0,
        rebuildRotationY: 0,
        rebuildRotationZ: 0,
      });
      this.group.add(mesh);
    }

    this.group.position.set(barrier.position.x, barrier.y, barrier.position.z);
    const angle = Math.atan2(barrier.outward.x, barrier.outward.z);
    this.group.rotation.y = angle;
    parent.add(this.group);
  }

  public update(dt: number): void {
    for (let i = 0; i < this.boards.length; i++) {
      const board = this.boards[i];
      const source = this.barrier.boards[i];
      if (board.revision !== source.revision) {
        board.revision = source.revision;
        if (source.hp > 0) {
          this.beginRebuild(board);
        } else {
          this.beginBreak(board);
        }
      }

      if (board.state === 'breaking') {
        this.updateBreaking(board, dt);
      } else if (board.state === 'rebuilding') {
        this.updateRebuilding(board, dt);
      }
    }
  }

  public reset(): void {
    for (let i = 0; i < this.boards.length; i++) {
      const board = this.boards[i];
      board.revision = this.barrier.boards[i].revision;
      board.state = this.barrier.boards[i].hp > 0 ? 'intact' : 'destroyed';
      board.elapsed = 0;
      this.restoreOriginalTransform(board);
      board.mesh.visible = board.state === 'intact';
    }
  }

  public dispose(): void {
    this.group.parent?.remove(this.group);
  }

  private beginBreak(board: BoardAnimation): void {
    board.state = 'breaking';
    board.elapsed = 0;
    board.duration = BREAK_MIN_DURATION + this.rng() * (BREAK_MAX_DURATION - BREAK_MIN_DURATION);
    board.lateralOffset = (this.rng() * 2 - 1) * 0.18;
    board.depthOffset = 0.3 + this.rng() * 0.16;
    board.liftDistance = 0.08 + this.rng() * 0.08;
    board.dropDistance = 0.96 + this.rng() * 0.32;
    board.impactRotationX = (this.rng() * 2 - 1) * 0.16;
    board.impactRotationY = (this.rng() * 2 - 1) * 0.12;
    board.impactRotationZ = (this.rng() * 2 - 1) * 0.14;
    board.spinX = (this.rng() < 0.5 ? -1 : 1) * (0.9 + this.rng() * 0.45);
    board.spinY = (this.rng() * 2 - 1) * 0.5;
    board.spinZ = (this.rng() < 0.5 ? -1 : 1) * (0.55 + this.rng() * 0.4);
    this.restoreOriginalTransform(board);
    board.mesh.visible = true;
  }

  private updateBreaking(board: BoardAnimation, dt: number): void {
    board.elapsed += dt;
    if (board.elapsed >= board.duration) {
      board.state = 'destroyed';
      board.elapsed = 0;
      this.restoreOriginalTransform(board);
      board.mesh.visible = false;
      return;
    }

    if (board.elapsed <= PULL_DURATION) {
      const progress = board.elapsed / PULL_DURATION;
      const eased = 1 - Math.pow(1 - progress, 3);
      board.mesh.position.set(
        board.originalPosition.x + board.lateralOffset * 0.45 * eased,
        board.originalPosition.y + board.liftDistance * eased,
        board.originalPosition.z + board.depthOffset * 0.72 * eased,
      );
      board.mesh.rotation.set(
        board.originalRotation.x + board.impactRotationX * eased,
        board.originalRotation.y + board.impactRotationY * eased,
        board.originalRotation.z + board.impactRotationZ * eased,
        board.originalRotation.order,
      );
      return;
    }

    const progress = (board.elapsed - PULL_DURATION) / (board.duration - PULL_DURATION);
    const drift = 1 - (1 - progress) * (1 - progress);
    board.mesh.position.set(
      board.originalPosition.x + board.lateralOffset * (0.45 + drift * 0.55),
      board.originalPosition.y + board.liftDistance * (1 - progress) - board.dropDistance * progress * progress,
      board.originalPosition.z + board.depthOffset * (0.72 + drift * 0.28),
    );
    board.mesh.rotation.set(
      board.originalRotation.x + board.impactRotationX + board.spinX * progress,
      board.originalRotation.y + board.impactRotationY + board.spinY * progress,
      board.originalRotation.z + board.impactRotationZ + board.spinZ * progress,
      board.originalRotation.order,
    );
  }

  private beginRebuild(board: BoardAnimation): void {
    board.state = 'rebuilding';
    board.elapsed = 0;
    board.duration = REBUILD_DURATION;
    board.rebuildOffsetX = (this.rng() * 2 - 1) * 0.055;
    board.rebuildOffsetY = -(0.14 + this.rng() * 0.04);
    board.rebuildOffsetZ = -(0.1 + this.rng() * 0.04);
    board.rebuildRotationX = (this.rng() * 2 - 1) * 0.07;
    board.rebuildRotationY = (this.rng() * 2 - 1) * 0.05;
    board.rebuildRotationZ = (this.rng() * 2 - 1) * 0.09;
    board.mesh.visible = true;
    this.applyRebuildTransform(board, 0);
  }

  private updateRebuilding(board: BoardAnimation, dt: number): void {
    board.elapsed += dt;
    const progress = Math.min(1, board.elapsed / board.duration);
    this.applyRebuildTransform(board, progress);
    if (progress < 1) return;

    board.state = 'intact';
    board.elapsed = 0;
    this.restoreOriginalTransform(board);
    this.onBoardRebuilt?.();
  }

  private applyRebuildTransform(board: BoardAnimation, progress: number): void {
    // A restrained back-out curve creates a brief seating overshoot near the frame.
    const shifted = progress - 1;
    const eased = 1 + 2.2 * shifted * shifted * shifted + 1.2 * shifted * shifted;
    const remaining = 1 - eased;
    board.mesh.position.set(
      board.originalPosition.x + board.rebuildOffsetX * remaining,
      board.originalPosition.y + board.rebuildOffsetY * remaining,
      board.originalPosition.z + board.rebuildOffsetZ * remaining,
    );
    board.mesh.rotation.set(
      board.originalRotation.x + board.rebuildRotationX * remaining,
      board.originalRotation.y + board.rebuildRotationY * remaining,
      board.originalRotation.z + board.rebuildRotationZ * remaining,
      board.originalRotation.order,
    );
  }

  private restoreOriginalTransform(board: BoardAnimation): void {
    board.mesh.position.copy(board.originalPosition);
    board.mesh.rotation.copy(board.originalRotation);
    board.mesh.scale.copy(board.originalScale);
  }
}
