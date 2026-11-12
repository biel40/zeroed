import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ElectricArcRibbons, type ElectricArcStyle } from '../src/rendering/ElectricArcRibbons';
import { seededRandom } from '../src/zombies/maps/shared/ProceduralNoise';

const STYLE: ElectricArcStyle = {
  arcs: 3,
  pointsPerArc: 5,
  rerollInterval: 0.1,
  halfWidth: 0.01,
  jitter: 0.05,
  skinOffset: 0.02,
  color: 0xc9a6ff,
  activeChance: 1,
};

function anchoredParent(): { parent: THREE.Group; anchors: THREE.Object3D[] } {
  const parent = new THREE.Group();
  const anchors = [[-0.3, 0, 0], [0, 0.1, 0], [0.3, 0, -0.1], [0, -0.1, 0.1]].map(([x, y, z]) => {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, y, z);
    parent.add(anchor);
    return anchor;
  });
  return { parent, anchors };
}

function positions(arcs: ElectricArcRibbons): number[] {
  return Array.from(arcs.mesh.geometry.getAttribute('position').array as Float32Array);
}

function triangleArea(arcs: ElectricArcRibbons): number {
  const position = arcs.mesh.geometry.getAttribute('position');
  const index = arcs.mesh.geometry.getIndex()!;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i));
    b.fromBufferAttribute(position, index.getX(i + 1));
    c.fromBufferAttribute(position, index.getX(i + 2));
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area;
}

describe('Electric arc ribbons', () => {
  it('stays hidden without strength, a parent or two anchors', () => {
    const { parent, anchors } = anchoredParent();
    const orphan = new ElectricArcRibbons(anchors, STYLE, seededRandom(1));
    orphan.update(0.016, 1);
    expect(orphan.mesh.visible).toBe(false);

    const arcs = new ElectricArcRibbons(anchors, STYLE, seededRandom(1));
    parent.add(arcs.mesh);
    arcs.update(0.016, 0);
    expect(arcs.mesh.visible).toBe(false);

    const lone = new ElectricArcRibbons(anchors.slice(0, 1), STYLE, seededRandom(1));
    parent.add(lone.mesh);
    lone.update(0.016, 1);
    expect(lone.mesh.visible).toBe(false);
  });

  it('draws bolts between the anchors, within their jitter, and is reproducible from its random source', () => {
    const { parent, anchors } = anchoredParent();
    const arcs = new ElectricArcRibbons(anchors, STYLE, seededRandom(7));
    parent.add(arcs.mesh);
    arcs.update(0.016, 1);
    expect(arcs.mesh.visible).toBe(true);
    expect(arcs.mesh.material.opacity).toBeGreaterThan(0);
    expect(arcs.mesh.material.opacity).toBeLessThanOrEqual(1);
    const reach = STYLE.skinOffset * Math.sqrt(3) + STYLE.jitter * Math.SQRT2 + STYLE.halfWidth + 1e-6;
    const values = positions(arcs);
    for (let i = 0; i < values.length; i += 3) {
      expect(Math.abs(values[i])).toBeLessThanOrEqual(0.3 + reach);
      expect(Math.abs(values[i + 1])).toBeLessThanOrEqual(0.1 + reach);
      expect(Math.abs(values[i + 2])).toBeLessThanOrEqual(0.1 + reach);
    }
    expect(triangleArea(arcs)).toBeGreaterThan(0);

    const twin = new ElectricArcRibbons(anchors, STYLE, seededRandom(7));
    parent.add(twin.mesh);
    twin.update(0.016, 1);
    expect(positions(twin)).toEqual(values);
  });

  it('keeps its paths until the re-roll interval, then crackles to new ones', () => {
    const { parent, anchors } = anchoredParent();
    const arcs = new ElectricArcRibbons(anchors, STYLE, seededRandom(3));
    parent.add(arcs.mesh);
    arcs.update(0.016, 1);
    const first = positions(arcs);
    arcs.update(0.05, 1);
    expect(positions(arcs)).toEqual(first);
    arcs.update(0.06, 1);
    expect(positions(arcs)).not.toEqual(first);
  });

  it('leaves the arcs that did not fire on a re-roll without any area', () => {
    const { parent, anchors } = anchoredParent();
    const arcs = new ElectricArcRibbons(anchors, { ...STYLE, activeChance: 0 }, seededRandom(5));
    parent.add(arcs.mesh);
    arcs.update(0.016, 1);
    expect(triangleArea(arcs)).toBeCloseTo(0, 9);
  });

  it('hides at once and starts a fresh path when shown again', () => {
    const { parent, anchors } = anchoredParent();
    const arcs = new ElectricArcRibbons(anchors, STYLE, seededRandom(9));
    parent.add(arcs.mesh);
    arcs.update(0.016, 1);
    const first = positions(arcs);
    arcs.hide();
    expect(arcs.mesh.visible).toBe(false);
    arcs.update(0.016, 1);
    expect(arcs.mesh.visible).toBe(true);
    expect(positions(arcs)).not.toEqual(first);
  });
});
