import type * as THREE from 'three';
import type { DeviceProfile } from '../../../core/DeviceProfile';
import type { MansionSurfaceMaterials } from '../BurnedMansionMaterials';
import type { MansionDecorBatch } from './MansionDecorBatch';

/**
 * What every Burned Mansion dressing builder receives. Builders add static
 * decoration through `batch` (merged once by the arena) and only add
 * standalone meshes to `group` when they animate or carry a map role.
 * Dressing is never solid: the arena owns every collider.
 */
export interface MansionBuildContext {
  readonly group: THREE.Group;
  readonly batch: MansionDecorBatch;
  readonly materials: MansionSurfaceMaterials;
  readonly profile: DeviceProfile;
}
