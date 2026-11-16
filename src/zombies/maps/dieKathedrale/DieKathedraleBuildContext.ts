import type { DeviceProfile } from '../../../core/DeviceProfile';
import type { DieKathedraleMaterials } from '../DieKathedraleMaterials';
import type { MapBuildKit } from '../shared/MapBuildKit';

/**
 * What every Die Kathedrale builder receives: the shared `MapBuildKit` plus the
 * cathedral's materials and the device profile. The arena hands the interior
 * and the plaza their own `batch`, so each merges into meshes of its own and
 * the renderer can cull the one the player is not looking at.
 */
export interface DieKathedraleBuildContext extends MapBuildKit {
  readonly materials: DieKathedraleMaterials;
  readonly profile: DeviceProfile;
}
