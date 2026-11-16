import * as THREE from 'three';
import type { ZombieSkinStains } from './ZombieSkinCatalog';
import { burnAt } from './ZombieSkinDamage';

/**
 * Age on the clothes of a stained skin, painted through the vertex colors:
 * dried blood and grime in patches (the burn noise, with its own seed) and
 * mud soaking up from the hem. Deterministic per skin.
 */

const DRIED_BLOOD = new THREE.Color(0x35100c);
const MUD = new THREE.Color(0x2a2119);
/** Height above the soles the mud climbs to, meters. */
const MUD_HEIGHT = 0.35;
const MUD_STRENGTH = 0.55;
const STAIN_STRENGTH = 0.7;

/** `color` aged at a body-frame point; returns `color`. */
export function wornColor(color: THREE.Color, point: THREE.Vector3, stains: ZombieSkinStains): THREE.Color {
  const mud = MUD_STRENGTH * (1 - THREE.MathUtils.smoothstep(point.y, 0, MUD_HEIGHT));
  if (mud > 0) color.lerp(MUD, mud);
  const stain = burnAt(point, stains);
  if (stain > 0) color.lerp(DRIED_BLOOD, STAIN_STRENGTH * stain);
  return color;
}
