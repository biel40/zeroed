import type * as THREE from 'three';
import type { DeviceProfile } from '../../../core/DeviceProfile';
import type { ArenaStructure } from '../shared/ArenaStructure';
import type { StaticMeshBatch } from '../shared/StaticMeshBatch';
import type { Station33Materials } from '../Station33Materials';
import type { Station33Signage } from './Station33Signage';

/**
 * What every Station 33 zone builder receives. Builders add solids through
 * `structure`, static decoration through `batch` (merged once by the arena)
 * and only add standalone meshes to `group` when they need their own
 * transform or material instance.
 */
export interface Station33BuildContext {
  readonly group: THREE.Group;
  readonly structure: ArenaStructure;
  readonly batch: StaticMeshBatch;
  readonly materials: Station33Materials;
  readonly signage: Station33Signage;
  readonly profile: DeviceProfile;
}
