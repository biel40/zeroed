import * as THREE from 'three';
import type { WindowBarrier } from './WindowBarrier';

const BOARD_WIDTH = 0.34;
const BOARD_HEIGHT = 0.08;
const BOARD_THICK = 0.03;
const GAP = 0.02;

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
  private readonly boards: THREE.Mesh[] = [];

  constructor(
    private readonly barrier: WindowBarrier,
    scene: THREE.Scene,
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
      this.boards.push(mesh);
      this.group.add(mesh);
    }

    this.group.position.set(barrier.position.x, 0.6, barrier.position.z);
    const angle = Math.atan2(barrier.outward.x, barrier.outward.z);
    this.group.rotation.y = angle;
    scene.add(this.group);
  }

  public update(): void {
    for (let i = 0; i < this.boards.length; i++) {
      const visible = this.barrier.boards[i].hp > 0;
      if (this.boards[i].visible !== visible) {
        this.boards[i].visible = visible;
      }
    }
  }

  public dispose(): void {
    this.group.parent?.remove(this.group);
  }
}
