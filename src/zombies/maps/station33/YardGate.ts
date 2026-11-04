import * as THREE from 'three';
import { starGeometry } from '../../../rendering/StarGeometry';
import { addSolidProxy } from '../shared/SolidProxy';
import { StaticMeshBatch } from '../shared/StaticMeshBatch';
import { PROTOCOL33_GATE, PROTOCOL33_SURFACE_Y } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

const GROUND = PROTOCOL33_SURFACE_Y;
const { minX, maxX, z: GATE_Z, height, thickness } = PROTOCOL33_GATE;
const LEAF_WIDTH = (maxX - minX) / 2;

/**
 * The yard's steel gate under its red stars: two leaves hinged on their
 * posts, shut and solid while the run lasts. The filmed escape swings them
 * out of the yard (`swing`); their proxy stays, as the ending has no play.
 */
export class YardGate {
  /** West leaf (hinged at `minX`) and east leaf (hinged at `maxX`). */
  private readonly leaves: readonly [THREE.Object3D, THREE.Object3D];

  public constructor(context: Station33BuildContext) {
    addSolidProxy(context,
      'surface-gate',
      { x: minX, y: GROUND, z: GATE_Z - thickness / 2 },
      { x: maxX, y: GROUND + height, z: GATE_Z + thickness / 2 },
      'metal',
      'none');
    this.leaves = [buildLeaf(context, -1), buildLeaf(context, 1)];
  }

  /** Both leaves `angle` radians out of the yard (north), each round its own hinge. */
  public swing(angle: number): void {
    this.leaves[0].rotation.y = angle;
    this.leaves[1].rotation.y = -angle;
  }
}

/** One leaf on its hinge: the steel sheet, frame rails and a red star on the yard side; the west one carries the meeting strip. */
function buildLeaf(context: Station33BuildContext, side: -1 | 1): THREE.Object3D {
  const { materials } = context;
  const hinge = new THREE.Group();
  hinge.name = 'surface-gate-leaf';
  hinge.position.set(side < 0 ? minX : maxX, GROUND, GATE_Z);
  /** Across the leaf from its hinge towards the middle of the gate. */
  const across = (distance: number): number => -side * distance;
  const batch = new StaticMeshBatch();
  batch.addBox(materials.paintedSteel, across(LEAF_WIDTH / 2), height / 2, 0, LEAF_WIDTH - 0.01, height, thickness, 0, 0, 0, 370 + side);
  for (const y of [0.35, 1.35, 2.5]) batch.addBox(materials.greySteel, across(LEAF_WIDTH / 2), y, thickness / 2 + 0.015, LEAF_WIDTH - 0.05, 0.08, 0.03);
  if (side < 0) batch.addBox(materials.greySteel, across(LEAF_WIDTH - 0.03), height / 2, thickness / 2 + 0.01, 0.06, height - 0.1, 0.03);
  batch.add(starGeometry(0.42, 0.17, 0.03).translate(across(LEAF_WIDTH / 2), 1.85, thickness / 2 + 0.03), materials.redEnamel);
  batch.build(hinge, 'station33-gate-leaf', { castShadow: false, receiveShadow: true });
  context.group.add(hinge);
  return hinge;
}
