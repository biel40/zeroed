import type { DeviceProfile } from '../../../core/DeviceProfile';
import type { LaSeuMaterials } from '../LaSeuMaterials';
import type { MapBuildKit } from '../shared/MapBuildKit';

/**
 * What every La Seu builder receives: the shared `MapBuildKit` plus the
 * cathedral's materials and the device profile. The arena hands the interior
 * and the plaza their own `batch`, so each merges into meshes of its own and
 * the renderer can cull the one the player is not looking at.
 */
export interface LaSeuBuildContext extends MapBuildKit {
  readonly materials: LaSeuMaterials;
  readonly profile: DeviceProfile;
}
