import type { Vector3 } from 'three';
import type { GibWallContact, GibWallFrame } from './GibWalls';

const SURFACE_OFFSET = 0.0015;

export interface BloodDrop {
  readonly position: Vector3;
  readonly previous: Vector3;
  readonly velocity: Vector3;
  readonly scale: Vector3;
  radius: number;
  resting: boolean;
}

/** Same ballistic drops and flattened stains for Barrett remains and ordinary wounds. */
export function stepBloodDrop(drop: BloodDrop, dt: number, walls: GibWallFrame, floor: number): void {
  if (drop.resting) return;
  let remaining = Math.max(0, dt);
  while (remaining > 0 && !drop.resting) {
    const step = Math.min(remaining, 1 / 120);
    remaining -= step;
    drop.previous.copy(drop.position);
    drop.velocity.y -= 9.8 * step;
    const drag = Math.max(0, 1 - 0.4 * step);
    drop.velocity.x *= drag;
    drop.velocity.z *= drag;
    drop.position.addScaledVector(drop.velocity, step);
    const contact = walls.collide(drop.position, drop.previous, drop.radius);
    if ((contact === 'top' && drop.velocity.y < 0) || contact === 'x' || contact === 'z') {
      if (walls.acceptsStain(contact)) {
        stick(drop, contact);
        walls.fitStain(drop.position, drop.scale, contact);
      } else if (contact === 'top') {
        absorb(drop);
      } else {
        // A padded proxy side is not the visible surface: run down it to the floor.
        drop.velocity.x = drop.velocity.z = 0;
      }
    } else if (contact === 'inside') {
      // An impact origin inside a solid must not create a floating stain.
      drop.velocity.x = drop.velocity.z = 0;
    }
    if (!drop.resting && drop.position.y <= floor + drop.radius && drop.velocity.y < 0) {
      drop.position.y = floor + drop.radius;
      stick(drop, 'top');
    }
  }
}

function stick(drop: BloodDrop, face: GibWallContact): void {
  const wide = drop.radius * 3.4;
  const flat = Math.min(drop.radius * 0.04, 0.0008);
  drop.scale.set(wide, wide, wide);
  if (face === 'top') {
    drop.scale.y = flat;
    drop.position.y += SURFACE_OFFSET - drop.radius;
  } else if (face === 'x') {
    drop.scale.x = flat;
    drop.position.x += Math.sign(drop.velocity.x) * (drop.radius - SURFACE_OFFSET);
  } else {
    drop.scale.z = flat;
    drop.position.z += Math.sign(drop.velocity.z) * (drop.radius - SURFACE_OFFSET);
  }
  drop.velocity.set(0, 0, 0);
  drop.resting = true;
}

/** Lands on an approximate top that has no visible surface to hold it: no stain. */
function absorb(drop: BloodDrop): void {
  drop.scale.set(0, 0, 0);
  drop.velocity.set(0, 0, 0);
  drop.resting = true;
}
