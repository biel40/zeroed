import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cylinderZ, extrudeProfile, profileShape } from './ProfileGeometry';

interface BladeSection {
  readonly z: number;
  readonly edge: number;
  readonly spine: number;
  readonly halfWidth: number;
  readonly groove: number;
}

/** The blade is ground to an edge and recessed along both faces, rather than a flat extrusion. */
function bladeGeometry(): THREE.BufferGeometry {
  const sections: readonly BladeSection[] = [
    { z: -0.055, edge: -0.012, spine: 0.056, halfWidth: 0.006, groove: 0 },
    { z: -0.088, edge: -0.024, spine: 0.081, halfWidth: 0.006, groove: 0 },
    { z: -0.13, edge: -0.027, spine: 0.086, halfWidth: 0.006, groove: 0.0018 },
    { z: -0.34, edge: -0.029, spine: 0.086, halfWidth: 0.0055, groove: 0.0018 },
    { z: -0.405, edge: -0.02, spine: 0.071, halfWidth: 0.0044, groove: 0 },
    { z: -0.475, edge: 0.013, spine: 0.048, halfWidth: 0.0025, groove: 0 },
  ];
  const fractions = [0, 0.28, 0.5, 0.56, 0.72, 0.78, 1];
  const ringSize = fractions.length * 2;
  const rings = sections.map(({ z, edge, spine, halfWidth, groove }) => {
    const widths = [0.00035, halfWidth, halfWidth, halfWidth - groove, halfWidth - groove, halfWidth, halfWidth * 0.8];
    const face = fractions.map((fraction, index) => new THREE.Vector3(widths[index], edge + (spine - edge) * fraction, z));
    return [...face, ...[...face].reverse().map((point) => new THREE.Vector3(-point.x, point.y, z))];
  });
  const surfaces: number[][] = [[], [], []];
  const geometry = new THREE.BufferGeometry();
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, material: number): void => {
    for (const point of [a, b, c]) surfaces[material].push(point.x, point.y, point.z);
  };
  const materialForBand = (band: number): number => {
    if (band === 0 || band >= ringSize - 2) return 1; // Cutting bevel and the fine edge.
    if (band === 3 || band === ringSize - 5) return 2; // Bottom of the recessed fuller.
    return 0;
  };
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let band = 0; band < ringSize; band++) {
      const next = (band + 1) % ringSize;
      triangle(rings[ring][band], rings[ring + 1][band], rings[ring][next], materialForBand(band));
      triangle(rings[ring + 1][band], rings[ring + 1][next], rings[ring][next], materialForBand(band));
    }
  }
  const tip = new THREE.Vector3(0, 0.032, -0.515);
  const last = rings[rings.length - 1];
  for (let band = 0; band < ringSize; band++) {
    triangle(last[band], tip, last[(band + 1) % ringSize], materialForBand(band));
  }
  const base = rings[0];
  const contour = base.map((point) => new THREE.Vector2(point.x, point.y));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) triangle(base[a], base[b], base[c], 0);
  const positions: number[] = [];
  for (let material = 0; material < surfaces.length; material++) {
    geometry.addGroup(positions.length / 3, surfaces[material].length / 3, material);
    positions.push(...surfaces[material]);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Only merge shallow angles: the cutting bevel and fuller retain their machining lines.
  const creased = toCreasedNormals(geometry, Math.PI / 9);
  geometry.dispose();
  return creased;
}

/** Local knife space: handle centre z = 0.075, blade toward -Z, cutting edge toward -Y. */
export function buildKnifeModel(model: THREE.Group): void {
  const steel = new THREE.MeshStandardMaterial({ color: 0x8d999d, metalness: 0.86, roughness: 0.34, envMapIntensity: 1.35 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xdce2de, metalness: 0.92, roughness: 0.22, envMapIntensity: 1.6 });
  const groove = new THREE.MeshStandardMaterial({ color: 0x657277, metalness: 0.82, roughness: 0.43, envMapIntensity: 1.25 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x313a3c, metalness: 0.74, roughness: 0.46 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x202724, metalness: 0.02, roughness: 0.9 });
  const ridgeRubber = new THREE.MeshStandardMaterial({ color: 0x303934, metalness: 0.02, roughness: 0.86 });
  const recess = new THREE.MeshStandardMaterial({ color: 0x111615, metalness: 0.1, roughness: 0.78 });

  const add = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `knife-${name}`;
    model.add(mesh);
    return mesh;
  };
  const batch = (name: string, geometries: THREE.BufferGeometry[], material: THREE.Material): void => {
    const merged = mergeGeometries(geometries);
    if (merged) add(name, merged, material);
    for (const geometry of geometries) geometry.dispose();
  };

  add('blade', bladeGeometry(), [steel, edge, groove]);
  const guard = profileShape([
    [-0.068, -0.056], [-0.047, -0.052], [-0.043, 0.038], [-0.031, 0.06],
    [-0.047, 0.071], [-0.063, 0.052],
  ]);
  add('guard', extrudeProfile(guard, 0.083, 0.0025, { segments: 3, keepOutline: true }), darkSteel);

  const gripProfile = [
    new THREE.Vector2(0, -0.04), new THREE.Vector2(0.024, -0.04),
    new THREE.Vector2(0.03, -0.03), new THREE.Vector2(0.029, -0.012),
    new THREE.Vector2(0.034, 0.025), new THREE.Vector2(0.035, 0.075),
    new THREE.Vector2(0.033, 0.118), new THREE.Vector2(0.03, 0.145),
    new THREE.Vector2(0.028, 0.157), new THREE.Vector2(0, 0.157),
  ];
  const grip = new THREE.LatheGeometry(gripProfile, 20).rotateX(Math.PI / 2).scale(0.86, 1, 1);
  add('grip', grip, rubber);
  const ribs: THREE.BufferGeometry[] = [];
  for (let index = 0; index < 9; index++) {
    const z = -0.008 + index * 0.018;
    const radius = z < 0.025 ? 0.029 + (z + 0.012) / 0.037 * 0.005
      : z < 0.075 ? 0.034 + (z - 0.025) / 0.05 * 0.001
        : 0.035 - (z - 0.075) / 0.07 * 0.005;
    ribs.push(new THREE.TorusGeometry(radius, 0.0011, 4, 20).scale(0.86, 1, 1).translate(0, 0, z));
  }
  batch('grip-ribs', ribs, ridgeRubber);
  batch('grip-ferrules', [
    cylinderZ(0.029, 0.03, 0.008, 20).scale(0.86, 1, 1).translate(0, 0, -0.033),
    cylinderZ(0.03, 0.031, 0.006, 20).scale(0.86, 1, 1).translate(0, 0, 0.148),
  ], darkSteel);

  const pins: THREE.BufferGeometry[] = [];
  const slots: THREE.BufferGeometry[] = [];
  for (const z of [0.012, 0.13]) {
    for (const side of [-1, 1]) {
      const x = side * (z < 0.1 ? 0.028 : 0.0275);
      pins.push(new THREE.CylinderGeometry(0.005, 0.005, 0.002, 12).rotateZ(Math.PI / 2).translate(x, 0, z));
      slots.push(new THREE.BoxGeometry(0.0004, 0.0013, 0.0055).translate(x + side * 0.0011, 0, z));
    }
  }
  batch('grip-pins', pins, steel);
  batch('grip-pin-slots', slots, recess);

  const pommel = profileShape([[0.149, -0.028], [0.177, -0.028], [0.185, -0.017], [0.179, 0.022], [0.15, 0.028]]);
  const lanyardHole = new THREE.Path();
  lanyardHole.absarc(-0.17, -0.004, 0.006, 0, Math.PI * 2, true);
  pommel.holes.push(lanyardHole);
  add('pommel', extrudeProfile(pommel, 0.05, 0.0018, { segments: 3, keepOutline: true }), darkSteel);
}
