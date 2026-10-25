import { COCHERAS_TRAIN_CARS } from '../Station33Config';
import { buildCocherasDressing } from './CocherasDressing';
import { buildCocherasFurniture } from './CocherasFurniture';
import { buildCocherasShell } from './CocherasShell';
import { buildCocherasTracks } from './CocherasTracks';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { buildTrainCar } from './TrainCar';

/**
 * Phase 3 zone: the train sheds north of the vestibule, behind the second
 * paid door. Two evacuation trains stand on their sidings under a ringed
 * cast-iron vault; their battery lamps and lightboxes follow the lighting
 * circuits.
 */
export function buildCocheras(context: Station33BuildContext, lighting: Station33Lighting): void {
  buildCocherasShell(context);
  buildCocherasTracks(context, lighting);
  for (const car of COCHERAS_TRAIN_CARS) buildTrainCar(context, lighting, car);
  buildCocherasFurniture(context);
  buildCocherasDressing(context);
}
