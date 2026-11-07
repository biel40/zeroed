import * as THREE from 'three';
import type { CaptainUssrSurfaces } from './CaptainUssrSurfaces';
import { facetedStar, rounded, strap, turned } from './CaptainUssrShapes';

export const SHIELD_RADIUS = 0.44;
/** How far its straps stand out behind the rim's plane: lying face up, it rests on them. */
export const SHIELD_BACK = 0.088;
/** Where the hand grips it, behind its centre (the forearm runs along its back through the strap). */
export const SHIELD_GRIP: Readonly<THREE.Vector3Like> = { x: 0, y: -0.03, z: -0.1 };

/** The dome's curvature: a cap of a sphere this many radii wide, its rim on z = 0. */
const DOME = 2.8;
/** Where the red enamel band gives way to the steel field. */
const FIELD_RADIUS = 0.35;

/**
 * The round shield, facing +z: a shallow dome rimmed by a polished steel
 * lip, a broad band of chipped red enamel, a gunmetal field turned with
 * concentric grooves, and over it a great faceted star outlined in red.
 * Behind, a dark back plate with the forearm strap and the handle.
 */
export function buildCaptainUssrShield(surfaces: CaptainUssrSurfaces): THREE.Group {
  const shield = new THREE.Group();
  shield.name = 'captain-ussr-shield';
  const sphere = SHIELD_RADIUS * DOME;
  const sink = Math.sqrt(sphere * sphere - SHIELD_RADIUS * SHIELD_RADIUS);
  /** Height of the dome's face at `radius` from the centre. */
  const face = (radius: number): number => Math.sqrt(sphere * sphere - radius * radius) - sink;
  const ring = (inner: number, outer: number, steps = 6): THREE.LatheGeometry => {
    // The dome between two radii, as a turned profile seen side on: radius out, height up the face (+z).
    const profile = Array.from({ length: steps + 1 }, (_, step) => {
      const radius = inner + ((outer - inner) * step) / steps;
      return [face(radius), radius] as const;
    });
    return turned(profile, 48).rotateX(Math.PI / 2);
  };
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, z = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = z;
    shield.add(mesh);
    return mesh;
  };

  // The face: red enamel band, steel field, the lip.
  add(ring(FIELD_RADIUS, SHIELD_RADIUS - 0.012), surfaces.paint);
  add(ring(0.001, FIELD_RADIUS), surfaces.gunmetal);
  add(new THREE.TorusGeometry(SHIELD_RADIUS - 0.006, 0.016, 10, 56), surfaces.rim, 0.002);
  add(new THREE.TorusGeometry(FIELD_RADIUS, 0.007, 6, 48), surfaces.steel, face(FIELD_RADIUS));
  for (const radius of [0.28, 0.21, 0.14]) add(new THREE.TorusGeometry(radius, 0.0055, 6, 40), surfaces.steel, face(radius) + 0.001);

  // The star: gunmetal, its walls reaching down to the dome under its tips; on its facets a red
  // star and a smaller gunmetal one, which leave a red outline.
  const star = { outer: 0.39, inner: 0.155, height: 0.05, base: face(0) - 0.012 } as const;
  add(facetedStar(star.outer, star.inner, star.height, star.base - face(star.outer) + 0.006), surfaces.gunmetal, star.base);
  for (const [scale, raise, material] of [[0.66, 0.002, surfaces.paint], [0.56, 0.004, surfaces.gunmetal]] as const) {
    // A star scaled by `scale` (height too) lies on the big one's facets once raised by the height it lost.
    add(facetedStar(star.outer * scale, star.inner * scale, star.height * scale, 0.004), material, star.base + star.height * (1 - scale) + raise);
  }

  // The back: a dark plate, the forearm strap with its steel brackets, and the handle.
  add(new THREE.CircleGeometry(SHIELD_RADIUS - 0.004, 48).rotateY(Math.PI), surfaces.sole, -0.004);
  const across = (y: number): THREE.BufferGeometry => strap(
    [new THREE.Vector3(-0.2, y, -0.03), new THREE.Vector3(0, y, -0.075), new THREE.Vector3(0.2, y, -0.03)],
    0.055, 0.012, (_point, out) => out.set(0, 0, -1), 10,
  );
  add(across(0.09), surfaces.leather);
  add(across(-0.15), surfaces.leather);
  for (const x of [-0.19, 0.19]) {
    for (const y of [0.09, -0.15]) add(rounded(0.03, 0.07, 0.02, 0.005), surfaces.steel).position.set(x, y, -0.02);
  }
  return shield;
}
