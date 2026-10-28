import * as THREE from 'three';
import { addSolidProxy } from '../shared/SolidProxy';
import { placement } from '../shared/StaticMeshBatch';
import type { Station33BuildContext } from './Station33BuildContext';

const RADIUS = 0.3;
const HEIGHT = 0.88;

/**
 * A huddle of oil drums at floor points (x, z), the third one leaning and
 * the second painted, behind one shared solid proxy named `name`.
 */
export function addOilDrums(context: Station33BuildContext, name: string, drums: ReadonlyArray<readonly [number, number]>): void {
  const { batch, materials } = context;
  drums.forEach(([x, z], index) => {
    const lean = index === 2 ? 0.12 : 0;
    const drum = new THREE.CylinderGeometry(RADIUS, RADIUS, HEIGHT, 16);
    batch.add(drum, index === 1 ? materials.paintedSteel : materials.greySteel, placement(x, HEIGHT / 2, z, lean, index * 0.7, 0));
    for (const y of [0.25, 0.63]) {
      batch.add(new THREE.TorusGeometry(RADIUS, 0.015, 4, 20).rotateX(Math.PI / 2), materials.greySteel, placement(x, y, z, lean, 0, 0));
    }
  });
  const xs = drums.map(([x]) => x);
  const zs = drums.map(([, z]) => z);
  addSolidProxy(context, name,
    { x: Math.min(...xs) - RADIUS - 0.05, y: 0, z: Math.min(...zs) - RADIUS - 0.05 },
    { x: Math.max(...xs) + RADIUS + 0.05, y: HEIGHT + 0.02, z: Math.max(...zs) + RADIUS + 0.05 }, 'metal');
}
