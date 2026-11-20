import type { DeviceProfile } from '../../../core/DeviceProfile';
import type { DieKathedraleMaterials } from '../DieKathedraleMaterials';
import type { MapBuildKit } from '../shared/MapBuildKit';

/**
 * What every Die Kathedrale builder receives: the shared `MapBuildKit` plus the
 * cathedral's materials and the device profile. Each sector has its own
 * static batch, so distant meshes can be culled independently.
 */
export interface DieKathedraleBuildContext extends MapBuildKit {
  readonly materials: DieKathedraleMaterials;
  readonly profile: DeviceProfile;
}
