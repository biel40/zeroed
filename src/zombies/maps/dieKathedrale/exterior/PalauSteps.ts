import * as THREE from 'three';
import { EYE_HEIGHT, type FloorTransitionZone } from '../../../../player/PlayerController';
import { EXTERIOR_AREAS, PALAU_STEP } from '../../DieKathedraleExteriorConfig';
import type { PlayerBounds } from '../../ZombieArena';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';

const TREADS = 4;
const LEVEL_RUNOUT = 1;

/** Wide limestone treads on both sides of the service passage's raised landing. */
export function buildPalauSteps(context: DieKathedraleBuildContext): void {
  const { minX, maxX } = EXTERIOR_AREAS.sidePassage;
  const { minZ, maxZ, landingMinZ, landingMaxZ, rise } = PALAU_STEP;
  const slab = (name: string, fromZ: number, toZ: number, height: number): void => {
    const mesh = context.structure.addBox((minX + maxX) / 2, height / 2, (fromZ + toZ) / 2, maxX - minX, height, toZ - fromZ,
      context.materials.dressedStone, { name, surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 0, worldUVs: true, blocksPlayer: false });
    context.batch.add(mesh.geometry.clone().translate(mesh.position.x, mesh.position.y, mesh.position.z), context.materials.dressedStone);
    mesh.material = context.collider;
    mesh.userData.walkableSurface = true;
  };
  const treadDepth = (landingMinZ - minZ) / TREADS;
  for (let index = 0; index < TREADS; index++) {
    const front = minZ + index * treadDepth;
    const back = maxZ - index * treadDepth;
    const height = rise * (index + 1) / (TREADS + 1);
    slab(`palau-stair-north-${index}`, front, front + treadDepth, height);
    slab(`palau-stair-south-${index}`, back - treadDepth, back, height);
  }
  slab('palau-stair-landing', landingMinZ, landingMaxZ, rise);
}

/** Same-floor ramps support movement at either approach, with a flat runout at both ends. */
export function palauStepSurfaces(bounds: PlayerBounds): ReadonlyArray<FloorTransitionZone> {
  const { minX, maxX } = EXTERIOR_AREAS.sidePassage;
  const { minZ, maxZ, landingMinZ, landingMaxZ, rise } = PALAU_STEP;
  const x = (minX + maxX) / 2;
  const middle = (landingMinZ + landingMaxZ) / 2;
  const surface = (fromZ: number, topZ: number, rampMinZ: number, rampMaxZ: number): FloorTransitionZone => ({
    // Empty landing trigger: these ramps do not change the ground floor identity.
    box: new THREE.Box3(), sourceFloor: 0, targetFloor: 0, targetY: EYE_HEIGHT, bounds,
    ramp: {
      box: new THREE.Box3(new THREE.Vector3(minX, 0, rampMinZ), new THREE.Vector3(maxX, rise + EYE_HEIGHT, rampMaxZ)),
      bottom: { x, y: 0, z: fromZ },
      top: { x, y: rise, z: topZ },
    },
  });
  return [
    surface(minZ, landingMinZ, minZ - LEVEL_RUNOUT, middle),
    surface(maxZ, landingMaxZ, middle, maxZ + LEVEL_RUNOUT),
  ];
}
