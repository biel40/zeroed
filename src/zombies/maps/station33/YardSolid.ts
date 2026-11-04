import type { GroundRect } from '../../guardians/CaptainUssrBrain';
import { addSolidProxy } from '../shared/SolidProxy';
import type { Station33BuildContext } from './Station33BuildContext';

/** A solid proxy of the surface yard over `rect`, from `bottom` to `top`; returns its footprint for the guardian. */
export function yardSolid(
  context: Station33BuildContext,
  name: string,
  surface: 'metal' | 'concrete' | 'wood',
  rect: GroundRect,
  bottom: number,
  top: number,
): GroundRect {
  addSolidProxy(context, name, { x: rect.minX, y: bottom, z: rect.minZ }, { x: rect.maxX, y: top, z: rect.maxZ }, surface, 'none');
  return rect;
}
