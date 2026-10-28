import type { Vector3 } from 'three';
import type { GibWallContact, GibWallFrame } from './GibWalls';

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
    if (contact === 'top' && drop.velocity.y < 0) {
      stick(drop, contact);
    } else if (contact === 'x' || contact === 'z') {
      stick(drop, contact);
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
  const wide = drop.radius * 4.6;
  const flat = drop.radius * 0.12;
  drop.scale.set(wide, wide, wide);
  if (face === 'top') {
    drop.scale.y = flat;
    drop.position.y += 0.006 - drop.radius;
  } else if (face === 'x') {
    drop.scale.x = flat;
    drop.position.x += Math.sign(drop.velocity.x) * (drop.radius - 0.006);
  } else {
    drop.scale.z = flat;
    drop.position.z += Math.sign(drop.velocity.z) * (drop.radius - 0.006);
  }
  drop.velocity.set(0, 0, 0);
  drop.resting = true;
}
