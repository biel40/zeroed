import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

export function buildM4A1(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'm4a1-root';
  const metal = new THREE.MeshStandardMaterial({ color: config.bodyColor, metalness: 0.72, roughness: 0.48 });
  const polymer = new THREE.MeshStandardMaterial({ color: config.accentColor, metalness: 0.08, roughness: 0.76 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x141719, metalness: 0.8, roughness: 0.4 });
  const magazineMaterial = new THREE.MeshStandardMaterial({ color: config.reloadAnim!.magColor, metalness: 0.65, roughness: 0.58 });

  const box = (width: number, height: number, depth: number): THREE.BoxGeometry => new THREE.BoxGeometry(width, height, depth);
  const cylinder = (radius: number, length: number): THREE.CylinderGeometry => {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
    geometry.rotateX(Math.PI / 2);
    return geometry;
  };
  const profile = (points: readonly (readonly [number, number])[], width: number): THREE.ExtrudeGeometry => {
    const shape = new THREE.Shape();
    shape.moveTo(-points[0][0], points[0][1]);
    for (const [depth, height] of points.slice(1)) shape.lineTo(-depth, height);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1, curveSegments: 1 });
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-width / 2, 0, 0);
    return geometry;
  };
  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    x: number, y: number, z: number, parent: THREE.Object3D = group,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `m4a1-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const assembly = (name: string): THREE.Group => {
    const part = new THREE.Group();
    part.name = `m4a1-${name}`;
    group.add(part);
    return part;
  };

  add('upper', profile([[-0.205, -0.008], [-0.205, 0.023], [-0.184, 0.032], [0.026, 0.032], [0.04, 0.015], [0.04, -0.008]], 0.046), metal, 0, 0, 0);
  add('lower', profile([[-0.105, -0.01], [0.032, -0.01], [0.032, -0.032], [-0.02, -0.043], [-0.105, -0.036]], 0.04), metal, 0, 0, 0);
  const well = assembly('magwell');
  for (const side of [-1, 1]) add('magwell-side', box(0.006, 0.035, 0.074), metal, side * 0.018, -0.024, -0.15, well);
  for (const depth of [-0.185, -0.115]) add('magwell-end', box(0.036, 0.035, 0.006), metal, 0, -0.024, depth, well);

  const barrel = assembly('barrel');
  add('barrel-core', cylinder(0.009, 0.35), steel, 0, 0.01, -0.387, barrel);
  add('barrel-shoulder', cylinder(0.012, 0.07), steel, 0, 0.01, -0.447, barrel);
  add('barrel-collar', cylinder(0.021, 0.022), metal, 0, 0.01, -0.217, barrel);
  const flashHider = assembly('flash-hider');
  add('flash-hider-body', cylinder(0.012, 0.032), steel, 0, 0.01, -0.567, flashHider);
  const muzzleRing = new THREE.TorusGeometry(0.009, 0.003, 4, 12);
  add('muzzle-ring', muzzleRing, steel, 0, 0.01, -0.585, flashHider);
  const bore = new THREE.MeshBasicMaterial({ color: 0x030404 });
  add('bore', new THREE.CircleGeometry(0.006, 12).rotateY(Math.PI), bore, 0, 0.01, -0.584, flashHider);
  for (const side of [-1, 1]) {
    for (const depth of [-0.558, -0.568, -0.578]) add('flash-hider-slot', box(0.001, 0.008, 0.003), bore, side * 0.012, 0.014, depth, flashHider);
  }

  const handguard = assembly('handguard');
  const guard = cylinder(0.028, 0.17);
  guard.scale(1, 0.87, 1);
  add('handguard-shell', guard, polymer, 0, 0.01, -0.314, handguard);
  for (let rib = 0; rib < 12; rib++) {
    const ring = cylinder(0.0295, 0.004);
    ring.scale(1, 0.87, 1);
    add('handguard-rib', ring, polymer, 0, 0.01, -0.236 - rib * 0.014, handguard);
  }
  for (let vent = 0; vent < 7; vent++) add('handguard-vent', box(0.008, 0.001, 0.009), steel, 0, 0.035, -0.25 - vent * 0.021, handguard);
  add('handguard-cap', cylinder(0.029, 0.008), steel, 0, 0.01, -0.405, handguard);

  const carry = assembly('carry-handle');
  add('carry-handle-base', box(0.026, 0.008, 0.19), metal, 0, 0.035, -0.074, carry);
  for (const depth of [-0.155, 0.006]) add('carry-handle-support', box(0.016, 0.021, 0.018), metal, 0, 0.048, depth, carry);
  add('carry-handle-bridge', box(0.021, 0.009, 0.181), metal, 0, 0.061, -0.074, carry);
  add('rear-aperture', new THREE.TorusGeometry(0.006, 0.002, 4, 12), steel, 0, config.sightHeight, 0.009, carry);
  for (const side of [-1, 1]) add('rear-sight-ear', box(0.005, 0.022, 0.025), metal, side * 0.013, 0.072, 0.008, carry);
  const frontSight = assembly('front-sight');
  for (const side of [-1, 1]) {
    add('front-sight-leg', profile([[-0.424, 0.013], [-0.418, 0.061], [-0.405, 0.061], [-0.395, 0.013], [-0.402, 0.013], [-0.411, 0.05], [-0.418, 0.013]], 0.006), steel, side * 0.009, 0, 0, frontSight);
    add('front-sight-ear', box(0.004, 0.022, 0.008), steel, side * 0.012, 0.073, -0.412, frontSight);
  }
  add('front-sight-post', box(0.003, 0.015, 0.004), steel, 0, config.sightHeight - 0.0075, -0.412, frontSight);

  const grip = assembly('grip');
  add('grip-shell', profile([[-0.011, -0.025], [0.028, -0.024], [0.068, -0.123], [0.022, -0.13]], 0.033), polymer, 0, 0, 0, grip);
  add('grip-finger-stop', box(0.032, 0.009, 0.012), polymer, 0, -0.078, 0.004, grip);
  const trigger = assembly('trigger-guard');
  add('trigger-guard-loop', profile([[-0.106, -0.033], [-0.1, -0.067], [-0.018, -0.067], [-0.011, -0.031], [-0.017, -0.031], [-0.024, -0.061], [-0.095, -0.061], [-0.1, -0.033]], 0.008), metal, 0, 0, 0, trigger);
  add('trigger', profile([[-0.052, -0.031], [-0.055, -0.044], [-0.044, -0.056], [-0.047, -0.044], [-0.047, -0.031]], 0.006), steel, 0, 0, 0, trigger);

  const stock = assembly('stock');
  add('buffer-tube', cylinder(0.014, 0.2), steel, 0, 0.01, 0.137, stock);
  add('stock-shell', profile([[0.125, 0.027], [0.245, 0.026], [0.254, -0.102], [0.229, -0.102], [0.215, -0.043], [0.125, -0.018]], 0.043), polymer, 0, 0, 0, stock);
  add('stock-buttpad', box(0.047, 0.13, 0.01), polymer, 0, -0.038, 0.256, stock);
  add('stock-adjustment-lever', box(0.018, 0.009, 0.063), steel, 0, -0.034, 0.161, stock);

  const controls = assembly('controls');
  add('ejection-port', box(0.001, 0.016, 0.057), steel, 0.0238, 0.012, -0.074, controls);
  add('dust-cover', box(0.003, 0.009, 0.06), metal, 0.026, -0.001, -0.074, controls);
  add('brass-deflector', profile([[-0.038, 0.001], [-0.028, 0.023], [-0.016, 0.001]], 0.012), metal, 0.028, 0, 0, controls);
  add('forward-assist', cylinder(0.007, 0.026), metal, 0.031, 0.008, 0.012, controls);
  for (const side of [-1, 1]) {
    for (const depth of [-0.106, 0.022]) {
      const pin = new THREE.CylinderGeometry(0.003, 0.003, 0.002, 8).rotateZ(Math.PI / 2);
      add('receiver-pin', pin, steel, side * 0.021, -0.018, depth, controls);
    }
  }
  add('selector', box(0.005, 0.006, 0.021), steel, -0.023, -0.02, -0.009, controls);
  add('magazine-release', box(0.005, 0.009, 0.016), steel, 0.024, -0.023, -0.115, controls);

  const handle = assembly('charging-handle');
  handle.position.set(0, 0.027, 0.037);
  add('charging-handle-stem', box(0.014, 0.006, 0.06), steel, 0, 0, -0.025, handle);
  add('charging-handle-latch', box(0.061, 0.009, 0.013), steel, 0, 0, 0.005, handle);

  const magazine = assembly('magazine');
  magazine.position.fromArray(config.reloadAnim!.magAnchor!);
  magazine.rotation.set(...config.reloadAnim!.magRotation!);
  add('magazine-shell', profile([[-0.027, 0.065], [0.027, 0.065], [0.027, -0.009], [0.014, -0.063], [-0.039, -0.071], [-0.027, -0.008]], 0.025), magazineMaterial, 0, 0, 0, magazine);
  for (const side of [-1, 1]) {
    for (const depth of [-0.017, 0, 0.017]) {
      add('magazine-rib', box(0.002, 0.082, 0.003), magazineMaterial, side * 0.013, 0.005, depth, magazine);
    }
  }
  add('magazine-baseplate', box(0.029, 0.005, 0.057), magazineMaterial, 0, -0.067, -0.012, magazine);

  for (const part of group.children) {
    if (!(part instanceof THREE.Group)) continue;
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...part.children]) {
      if (!(child instanceof THREE.Mesh)) continue;
      child.updateMatrix();
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      geometry.applyMatrix4(child.matrix);
      const batch = batches.get(child.material) ?? [];
      batch.push(geometry);
      batches.set(child.material, batch);
      child.geometry.dispose();
      part.remove(child);
    }
    for (const [material, geometries] of batches) {
      const merged = mergeGeometries(geometries);
      if (merged) part.add(new THREE.Mesh(merged, material));
      for (const geometry of geometries) geometry.dispose();
    }
  }
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0.01, -0.59).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.032, 0.012, -0.074).multiplyScalar(config.scale),
    sightY: config.sightHeight * config.scale,
    reloadParts: { magazine, handle },
  };
}