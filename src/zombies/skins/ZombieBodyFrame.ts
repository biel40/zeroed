import * as THREE from 'three';

/** Vertex filter for body measurements; every field narrows the selection. */
export interface BodyRegionQuery {
  /** Only vertices whose strongest skin weight belongs to one of these bones. */
  readonly bones?: readonly string[];
  /** Body-frame height window, meters. */
  readonly minY?: number;
  readonly maxY?: number;
  /** Lateral window (|x|), meters: keeps arms out of torso slices. */
  readonly maxSide?: number;
}

/**
 * Measures a skinned geometry in its bind pose, expressed in an upright,
 * front-facing frame in meters (x = the body's left, y = up from the soles,
 * z = forward), so skin accessories can be authored once and fit any rig that
 * shares the bone names. `toGeometry` maps that frame back to the raw
 * geometry space the skinning expects.
 */
export class ZombieBodyFrame {
  readonly unitsPerMeter: number;
  readonly toGeometry = new THREE.Matrix4();
  private readonly toBody = new THREE.Matrix4();
  private readonly boneIndices = new Map<string, number>();
  private readonly dominant: Uint16Array;
  private readonly bodyPositions: Float32Array;

  constructor(geometry: THREE.BufferGeometry, boneNames: readonly string[], height: number) {
    boneNames.forEach((name, index) => this.boneIndices.set(name, index));
    const position = geometry.getAttribute('position');
    const skinIndex = geometry.getAttribute('skinIndex');
    const skinWeight = geometry.getAttribute('skinWeight');

    this.dominant = new Uint16Array(position.count);
    for (let vertex = 0; vertex < position.count; vertex++) {
      let best = -1;
      for (let slot = 0; slot < 4; slot++) {
        const weight = skinWeight.getComponent(vertex, slot);
        if (weight > best) {
          best = weight;
          this.dominant[vertex] = skinIndex.getComponent(vertex, slot);
        }
      }
    }

    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    this.unitsPerMeter = (box.max.y - box.min.y) / height;
    // Up is the geometry's +Y (the model contract normalizes along it); the
    // hands give the left side, and left x up is forward in a right-handed frame.
    const left = this.centerOf(position, ['LeftHand']).sub(this.centerOf(position, ['RightHand'])).setY(0).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3().crossVectors(left, up);
    this.toGeometry
      .makeBasis(left, up, forward)
      .scale(new THREE.Vector3().setScalar(this.unitsPerMeter))
      .setPosition(0, box.min.y, 0);
    this.toBody.copy(this.toGeometry).invert();

    this.bodyPositions = new Float32Array(position.count * 3);
    const point = new THREE.Vector3();
    for (let vertex = 0; vertex < position.count; vertex++) {
      point.fromBufferAttribute(position, vertex).applyMatrix4(this.toBody).toArray(this.bodyPositions, vertex * 3);
    }
  }

  /** Skeleton index of a bone; throws so a renamed rig fails loudly. */
  boneIndex(name: string): number {
    const index = this.boneIndices.get(name);
    if (index === undefined) throw new Error(`Zombie rig has no bone "${name}"`);
    return index;
  }

  /** Skeleton index of the bone with the strongest weight on a vertex. */
  dominantBone(vertex: number): number {
    return this.dominant[vertex];
  }

  /** Bind-pose bounds of the matching vertices in the body frame; empty if none match. */
  bounds(query: BodyRegionQuery): THREE.Box3 {
    const box = new THREE.Box3();
    const bones = query.bones ? new Set(query.bones.map((name) => this.boneIndex(name))) : null;
    const point = new THREE.Vector3();
    for (let vertex = 0; vertex < this.dominant.length; vertex++) {
      if (bones && !bones.has(this.dominant[vertex])) continue;
      point.fromArray(this.bodyPositions, vertex * 3);
      if (query.minY !== undefined && point.y < query.minY) continue;
      if (query.maxY !== undefined && point.y > query.maxY) continue;
      if (query.maxSide !== undefined && Math.abs(point.x) > query.maxSide) continue;
      box.expandByPoint(point);
    }
    return box;
  }

  private centerOf(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, bones: readonly string[]): THREE.Vector3 {
    const wanted = new Set(bones.map((name) => this.boneIndex(name)));
    const sum = new THREE.Vector3();
    const point = new THREE.Vector3();
    let count = 0;
    for (let vertex = 0; vertex < position.count; vertex++) {
      if (!wanted.has(this.dominant[vertex])) continue;
      sum.add(point.fromBufferAttribute(position, vertex));
      count++;
    }
    return count > 0 ? sum.divideScalar(count) : sum;
  }
}
