import * as THREE from 'three';
import type { GroundRect } from '../../guardians/CaptainUssrBrain';

/** Where a defence zone lies: its centre on the floor, its radius and the room that holds it. */
export interface DefenseZoneRingPlacement {
  readonly x: number;
  readonly z: number;
  /** Height of the floor the ring lies on. */
  readonly y: number;
  readonly radius: number;
  /** The room's floor: the ring stops at its walls instead of showing through them. */
  readonly bounds: GroundRect;
}

export const DEFENSE_RING_NAME = 'defense-zone-ring';

/** Band width (m), arc segments of the full circle and lift off the floor against z-fighting. */
const RING = { width: 0.34, segments: 160, lift: 0.025 } as const;
const DEFENDED_COLOR = new THREE.Color(0xffa040);
const PAUSED_COLOR = new THREE.Color(0xff2a12);
/** Gentle breathing while defended; the same blink as the panel's gauge while paused. */
const PULSE = { rate: 3, base: 0.75, depth: 0.2 } as const;
const BLINK = { rate: 9, on: 1.15, off: 0.15 } as const;

/**
 * The glowing circle on the floor marking how close a player must stay for
 * a defence to advance: an amber band that breathes while someone holds
 * it and blinks red while nobody does. Hidden outside the defence. The
 * band is additive with black edges, so it fades softly into the floor.
 */
export class DefenseZoneRing {
  private readonly material = new THREE.MeshBasicMaterial({
    name: DEFENSE_RING_NAME,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  private readonly mesh: THREE.Mesh;
  private time = 0;

  public constructor(group: THREE.Group, placement: DefenseZoneRingPlacement) {
    this.mesh = new THREE.Mesh(buildDefenseRingGeometry({ ...placement, y: placement.y + RING.lift }, RING.width, RING.segments), this.material);
    this.mesh.name = DEFENSE_RING_NAME;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.visible = false;
    group.add(this.mesh);
  }

  /** Shown only while the defence runs; its look follows whether anyone holds the zone. */
  public update(dt: number, active: boolean, defended: boolean): void {
    this.mesh.visible = active;
    if (!active) return;
    this.time += Math.max(0, dt);
    const level = defended
      ? PULSE.base + PULSE.depth * Math.sin(this.time * PULSE.rate)
      : Math.sin(this.time * BLINK.rate) > 0 ? BLINK.on : BLINK.off;
    this.material.color.copy(defended ? DEFENDED_COLOR : PAUSED_COLOR).multiplyScalar(level);
  }

  public reset(): void {
    this.time = 0;
    this.mesh.visible = false;
  }
}

/**
 * A flat band of `width` centred on the placement's radius, faded to black
 * at both edges through vertex colours. Arc segments reaching outside the
 * room's bounds are left out, so only the part of the circle inside the
 * room is drawn.
 */
export function buildDefenseRingGeometry(placement: DefenseZoneRingPlacement, width: number, segments: number): THREE.BufferGeometry {
  const radii = [placement.radius - width / 2, placement.radius, placement.radius + width / 2];
  const glow = [0, 1, 0];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const inside = (angle: number, radius: number): boolean => {
    const x = placement.x + Math.cos(angle) * radius;
    const z = placement.z + Math.sin(angle) * radius;
    const { minX, maxX, minZ, maxZ } = placement.bounds;
    return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
  };
  for (let segment = 0; segment < segments; segment++) {
    const from = (segment / segments) * Math.PI * 2;
    const to = ((segment + 1) / segments) * Math.PI * 2;
    if (!radii.every((radius) => inside(from, radius) && inside(to, radius))) continue;
    const first = positions.length / 3;
    for (const angle of [from, to]) {
      radii.forEach((radius, row) => {
        positions.push(placement.x + Math.cos(angle) * radius, placement.y, placement.z + Math.sin(angle) * radius);
        colors.push(glow[row], glow[row], glow[row]);
      });
    }
    // Rows 0..2 at `from` are first..first+2, at `to` first+3..first+5; faces point up.
    for (let row = 0; row < 2; row++) {
      const a = first + row;
      const b = first + row + 1;
      const c = first + 3 + row;
      const d = first + 3 + row + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}
