import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { projectMetricUVs } from '../src/weapons/ProfileGeometry';

/** UV extent of the triangles of a box face, picked by its outward normal. */
function faceSpan(geometry: THREE.BufferGeometry, axis: 'x' | 'y' | 'z', sign: 1 | -1): { u: number; v: number } {
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const bounds = new THREE.Box2();
  const onFace = (vertex: number): boolean => {
    const value = axis === 'x' ? position.getX(vertex) : axis === 'y' ? position.getY(vertex) : position.getZ(vertex);
    return Math.abs(value - (sign * extents[axis]) / 2) < 1e-6;
  };
  for (let first = 0; first + 2 < position.count; first += 3) {
    if (!onFace(first) || !onFace(first + 1) || !onFace(first + 2)) continue;
    for (let vertex = first; vertex < first + 3; vertex++) bounds.expandByPoint(new THREE.Vector2(uv.getX(vertex), uv.getY(vertex)));
  }
  const size = bounds.getSize(new THREE.Vector2());
  return { u: size.x, v: size.y };
}

const extents = { x: 0.02, y: 0.03, z: 0.1 };

describe('projectMetricUVs', () => {
  const box = (): THREE.BufferGeometry => new THREE.BoxGeometry(extents.x, extents.y, extents.z);

  it('maps a flank to bore length and height, in metres', () => {
    const span = faceSpan(projectMetricUVs(box()), 'x', 1);
    expect(span.u).toBeCloseTo(extents.z, 6);
    expect(span.v).toBeCloseTo(extents.y, 6);
  });

  it('keeps the long texture axis along the bore on the top face', () => {
    const span = faceSpan(projectMetricUVs(box()), 'y', -1);
    expect(span.u).toBeCloseTo(extents.z, 6);
    expect(span.v).toBeCloseTo(extents.x, 6);
  });

  it('maps an end face to its width and height', () => {
    const span = faceSpan(projectMetricUVs(box()), 'z', 1);
    expect(span.u).toBeCloseTo(extents.x, 6);
    expect(span.v).toBeCloseTo(extents.y, 6);
  });

  it('shifts the projection so parts cut from one board do not repeat', () => {
    const plain = projectMetricUVs(box()).attributes.uv;
    const shifted = projectMetricUVs(box(), 0.3, 0.07).attributes.uv;
    expect(shifted.getX(0) - plain.getX(0)).toBeCloseTo(0.3, 6);
    expect(shifted.getY(0) - plain.getY(0)).toBeCloseTo(0.07, 6);
  });

  it('assigns every triangle whole, so no facet stretches across two projections', () => {
    const geometry = projectMetricUVs(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 12));
    expect(geometry.index).toBeNull();
    expect(geometry.attributes.uv.count).toBe(geometry.attributes.position.count);
    const uv = geometry.attributes.uv;
    for (let vertex = 0; vertex < uv.count; vertex++) {
      expect(Math.abs(uv.getX(vertex))).toBeLessThanOrEqual(0.1 + 1e-6);
      expect(Math.abs(uv.getY(vertex))).toBeLessThanOrEqual(0.1 + 1e-6);
    }
  });
});
