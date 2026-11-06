import * as THREE from 'three';
import type { GroundRect } from '../../guardians/CaptainUssrBrain';
import { addSolidProxy } from '../shared/SolidProxy';
import { placement } from '../shared/StaticMeshBatch';
import type { Station33BuildContext } from './Station33BuildContext';

const RADIUS = 0.3;
const HEIGHT = 0.88;
/** Size of each drum; the third of a huddle is the one that leans. */
export const OIL_DRUM = { radius: RADIUS, height: HEIGHT, leaningIndex: 2 } as const;

/**
 * A huddle of oil drums at floor points (x, z), the third one leaning and
 * the second painted, behind one shared solid proxy named `name`, standing
 * on the floor at height `baseY`.
 */
export function addOilDrums(context: Station33BuildContext, name: string, drums: ReadonlyArray<readonly [number, number]>, baseY = 0): void {
  const { batch, materials } = context;
  drums.forEach(([x, z], index) => {
    const lean = index === OIL_DRUM.leaningIndex ? 0.12 : 0;
    const drum = new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 16);
    batch.add(drum, index === 1 ? materials.paintedSteel : materials.greySteel, placement(x, baseY + HEIGHT / 2, z, lean, index * 0.7, 0));
    for (const y of [0.25, 0.63]) {
      batch.add(new THREE.TorusGeometry(RADIUS, 0.015, 4, 20).rotateX(Math.PI / 2), materials.greySteel, placement(x, baseY + y, z, lean, 0, 0));
    }
  });
  const { minX, maxX, minZ, maxZ } = oilDrumsFootprint(drums);
  addSolidProxy(context, name, { x: minX, y: baseY, z: minZ }, { x: maxX, y: baseY + HEIGHT + 0.02, z: maxZ }, 'metal', 'none');
}

/** Ground footprint of the proxy `addOilDrums` builds around the same drums. */
export function oilDrumsFootprint(drums: ReadonlyArray<readonly [number, number]>): GroundRect {
  const xs = drums.map(([x]) => x);
  const zs = drums.map(([, z]) => z);
  const margin = RADIUS + 0.05;
  return { minX: Math.min(...xs) - margin, maxX: Math.max(...xs) + margin, minZ: Math.min(...zs) - margin, maxZ: Math.max(...zs) + margin };
}
