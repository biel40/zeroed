import type { DeviceProfile } from '../../../core/DeviceProfile';
import type { MapBuildKit } from '../shared/MapBuildKit';
import type { Station33Materials } from '../Station33Materials';
import type { Station33Signage } from './Station33Signage';

/**
 * What every Station 33 zone builder receives: the shared `MapBuildKit`
 * (solids through `structure`, static decoration through `batch`, merged
 * once by the arena, and standalone meshes in `group` only when they need
 * their own transform or material instance) plus the station's materials,
 * signage and device profile.
 */
export interface Station33BuildContext extends MapBuildKit {
  readonly materials: Station33Materials;
  readonly signage: Station33Signage;
  readonly profile: DeviceProfile;
}
