import * as THREE from 'three';
import {
  COLUMN_CANDLE_RINGS,
  COLUMN_RING_CANDLES,
  COLUMN_RING_RADIUS,
  COLUMN_RING_Y,
  NAVE,
  type DieKathedraleLightSite,
} from '../DieKathedraleConfig';
import type { CandleIgnition } from './CandleIgnition';

const FLAMES_PER_RING = COLUMN_RING_CANDLES - 1;

/** One draw call for every column flame; iron and wax remain in the static batch. */
export class ColumnCandleFlames {
  private readonly mesh: THREE.InstancedMesh;
  private readonly siteIndices: ReadonlyArray<number>;
  private readonly levels = new Float32Array(COLUMN_CANDLE_RINGS.length).fill(-1);
  private readonly matrix = new THREE.Matrix4();

  public constructor(group: THREE.Group, material: THREE.Material, sites: ReadonlyArray<DieKathedraleLightSite>) {
    const geometry = new THREE.SphereGeometry(0.04, 4, 3).scale(1, 1.8, 1);
    this.mesh = new THREE.InstancedMesh(geometry, material, COLUMN_CANDLE_RINGS.length * FLAMES_PER_RING);
    this.mesh.name = 'die-kathedrale-column-flames';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.siteIndices = COLUMN_CANDLE_RINGS.map((ring) => {
      const site = sites.findIndex((candidate) => candidate.id === ring.id);
      if (site < 0) throw new Error(`Missing candle light site ${ring.id}`);
      return site;
    });
    for (let ring = 0; ring < COLUMN_CANDLE_RINGS.length; ring++) this.setLevel(ring, 1);
    // Keep the full-size envelope: later ignition only shrinks instances within it.
    this.mesh.computeBoundingSphere();
    group.add(this.mesh);
  }

  public update(ignition: CandleIgnition): void {
    for (let ring = 0; ring < COLUMN_CANDLE_RINGS.length; ring++) {
      const level = ignition.getLevel(this.siteIndices[ring]);
      if (level === this.levels[ring]) continue;
      this.setLevel(ring, level);
      this.levels[ring] = level;
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private setLevel(ring: number, level: number): void {
    const { side, z } = COLUMN_CANDLE_RINGS[ring];
    let instance = ring * FLAMES_PER_RING;
    for (let candle = 0; candle < COLUMN_RING_CANDLES; candle++) {
      if (candle === 3) continue; // Leave one candle unlit, as on the original ring.
      const angle = (candle + 0.5) / COLUMN_RING_CANDLES * Math.PI * 2;
      this.matrix.makeScale(level, level, level);
      this.matrix.setPosition(
        side * NAVE.columnX + Math.sin(angle) * COLUMN_RING_RADIUS,
        COLUMN_RING_Y + 0.31,
        z + Math.cos(angle) * COLUMN_RING_RADIUS,
      );
      this.mesh.setMatrixAt(instance++, this.matrix);
    }
  }
}
