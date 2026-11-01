import * as THREE from 'three';

/**
 * A five-pointed star in the xy plane, point up, `depth` thick and centred
 * on z = 0 so it faces +z and -z alike; `inner` is the radius of its
 * notches, `outer` of its points.
 */
export function starGeometry(outer: number, inner: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let point = 0; point < 10; point++) {
    const radius = point % 2 === 0 ? outer : inner;
    const angle = Math.PI / 2 + (point * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (point === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
}
