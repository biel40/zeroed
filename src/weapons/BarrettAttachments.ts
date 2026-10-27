import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cylinderZ, extrudeProfile, profileShape, type ProfilePoint } from './ProfileGeometry';

interface AttachmentMaterials {
  readonly steel: THREE.Material;
  readonly dark: THREE.Material;
  readonly detail: THREE.Material;
  readonly rubber: THREE.Material;
  readonly glass: THREE.Material;
}

function add(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material,
  x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Long telescopic optic: recessed lenses, focus rings, capped turrets and split-ring mounts. */
export function buildBarrettScope(sightY: number, m: AttachmentMaterials): THREE.Group {
  const scope = new THREE.Group();
  scope.name = 'barrett-scope';
  const profile: readonly ProfilePoint[] = [
    [0.027, -0.351], [0.032, -0.351], [0.033, -0.348], [0.033, -0.298],
    [0.032, -0.284], [0.031, -0.278], [0.018, -0.21], [0.0165, -0.196],
    [0.0165, -0.022], [0.018, -0.014], [0.018, 0.007], [0.022, 0.028],
    [0.022, 0.084], [0.0205, 0.099], [0.017, 0.099],
  ];
  const lathe = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 28).rotateX(Math.PI / 2);
  add(scope, lathe, m.dark, 0, sightY);
  add(scope, new THREE.CircleGeometry(0.0268, 28).rotateY(Math.PI), m.glass, 0, sightY, -0.343);
  add(scope, new THREE.CircleGeometry(0.0168, 24), m.glass, 0, sightY, 0.094);
  // Separate retaining rings leave the glass visibly below the edge of each bell.
  for (const [radius, z] of [[0.0298, -0.351], [0.019, 0.099]] as const) {
    add(scope, new THREE.TorusGeometry(radius, 0.0012, 4, 24), m.steel, 0, sightY, z);
  }
  for (const z of [-0.301, -0.289]) add(scope, cylinderZ(0.0334, 0.0334, 0.002, 28), m.dark, 0, sightY, z);
  for (const z of [0.031, 0.041, 0.051, 0.061, 0.071]) {
    add(scope, cylinderZ(0.023, 0.023, 0.003, 24), m.dark, 0, sightY, z);
  }
  // Fine axial flutes on the ocular focus collar, rather than a stack of plain cylinders.
  for (let i = 0; i < 24; i++) {
    const angle = i * Math.PI / 12;
    const rib = add(scope, new THREE.BoxGeometry(0.0014, 0.0013, 0.035), m.dark,
      Math.sin(angle) * 0.0225, sightY + Math.cos(angle) * 0.0225, 0.052);
    rib.rotation.z = -angle;
  }
  const turretZ = -0.087;
  add(scope, new RoundedBoxGeometry(0.036, 0.031, 0.047, 2, 0.005), m.dark, 0, sightY, turretZ);
  add(scope, new THREE.CylinderGeometry(0.013, 0.014, 0.012, 20), m.steel, 0, sightY + 0.021, turretZ);
  add(scope, new THREE.CylinderGeometry(0.015, 0.015, 0.012, 24), m.dark, 0, sightY + 0.032, turretZ);
  add(scope, new THREE.CylinderGeometry(0.015, 0.014, 0.004, 24), m.steel, 0, sightY + 0.04, turretZ);
  add(scope, new THREE.CylinderGeometry(0.014, 0.014, 0.02, 24).rotateZ(Math.PI / 2), m.dark, 0.025, sightY, turretZ);
  for (let i = 0; i < 20; i++) {
    const angle = i * Math.PI / 10;
    add(scope, new THREE.CylinderGeometry(0.0009, 0.0009, 0.01, 5), m.dark,
      Math.sin(angle) * 0.015, sightY + 0.032, turretZ + Math.cos(angle) * 0.015);
  }
  for (let i = -2; i <= 2; i++) {
    const angle = i * 0.34;
    const tick = add(scope, new THREE.BoxGeometry(0.0007, 0.0003, 0.003), m.detail,
      Math.sin(angle) * 0.01, sightY + 0.0422, turretZ + Math.cos(angle) * 0.01);
    tick.rotation.y = angle;
  }
  for (const z of [-0.16, -0.018]) {
    add(scope, cylinderZ(0.019, 0.019, 0.017, 24), m.steel, 0, sightY, z);
    add(scope, new THREE.BoxGeometry(0.031, sightY - 0.076, 0.025), m.dark, 0, (sightY - 0.019 + 0.062) / 2, z);
    add(scope, new THREE.BoxGeometry(0.045, 0.006, 0.028), m.dark, 0, sightY - 0.004, z);
    for (const side of [-1, 1]) {
      for (const dz of [-0.005, 0.005]) {
        add(scope, new THREE.CylinderGeometry(0.0024, 0.0024, 0.004, 8), m.detail, side * 0.02, sightY + 0.001, z + dz);
      }
    }
    add(scope, new THREE.CylinderGeometry(0.006, 0.006, 0.008, 6).rotateZ(Math.PI / 2), m.steel, -0.02, 0.068, z);
  }
  return scope;
}

/** Folded stamped-steel bipod: perforated legs, telescopic inserts and locking pivots. */
export function buildBarrettBipod(m: AttachmentMaterials): THREE.Group {
  const bipod = new THREE.Group();
  bipod.name = 'barrett-bipod';
  add(bipod, new RoundedBoxGeometry(0.08, 0.023, 0.039, 1, 0.003), m.dark, 0, -0.06, -0.53);
  for (const side of [-1, 1]) {
    const leg = profileShape([
      [-0.523, -0.073], [-0.735, -0.078], [-0.742, -0.084], [-0.742, -0.096], [-0.532, -0.098],
    ]);
    for (let i = 0; i < 7; i++) {
      const hole = new THREE.Path();
      hole.absellipse(0.553 + i * 0.025, -0.086, 0.0045, 0.004, 0, Math.PI * 2, true);
      leg.holes.push(hole);
    }
    add(bipod, extrudeProfile(leg, 0.005, 0.0006, { segments: 1, keepOutline: true, curveSegments: 3 }), m.steel, side * 0.044);
    add(bipod, new RoundedBoxGeometry(0.008, 0.011, 0.15, 1, 0.0015), m.dark, side * 0.044, -0.088, -0.782);
    add(bipod, new THREE.BoxGeometry(0.014, 0.019, 0.012), m.steel, side * 0.044, -0.088, -0.727);
    add(bipod, new RoundedBoxGeometry(0.027, 0.015, 0.026, 1, 0.003), m.rubber, side * 0.044, -0.088, -0.857);
    add(bipod, new THREE.CylinderGeometry(0.011, 0.011, 0.009, 14).rotateZ(Math.PI / 2), m.steel, side * 0.044, -0.063, -0.53);
    add(bipod, new THREE.CylinderGeometry(0.0045, 0.0045, 0.011, 6).rotateZ(Math.PI / 2), m.detail, side * 0.047, -0.063, -0.53);
    add(bipod, new THREE.TorusGeometry(0.012, 0.0013, 5, 16).rotateY(Math.PI / 2), m.dark, side * 0.05, -0.063, -0.53);
    add(bipod, new THREE.BoxGeometry(0.005, 0.009, 0.032), m.dark, side * 0.038, -0.056, -0.562);
  }
  return bipod;
}
