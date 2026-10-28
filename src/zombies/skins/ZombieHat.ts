import * as THREE from 'three';
import { GibWallFrame, type GibWalls } from '../GibWalls';
import { stepHatMotion, type HatMotion } from './ZombieHatMotion';

/** One reusable hat per pooled body. Worn hats remain in the body's single draw. */
export class ZombieHat {
  private readonly worn: THREE.BufferGeometry;
  private readonly bare = new THREE.BufferGeometry();
  private readonly loose: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  private readonly motion: HatMotion = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, resting: false };
  private readonly point = new THREE.Vector3();
  private readonly previous = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private readonly size = new THREE.Vector3(1, 1, 1);
  private readonly rotation = new THREE.Quaternion();
  private readonly spinAxis = new THREE.Vector3(1, 0.5, 0.3).normalize();
  private readonly transform = new THREE.Matrix4();
  private readonly bounds = new THREE.Box3();
  private readonly walls = new GibWallFrame();
  private readonly worldFrame = new THREE.Object3D();
  private detached = false;
  private age = 0;
  private floor = 0;

  public constructor(
    private readonly body: THREE.SkinnedMesh,
    private readonly parent: THREE.Group,
    private readonly start: number,
    private readonly mapWalls: GibWalls,
  ) {
    this.worn = body.geometry;
    for (const [name, attribute] of Object.entries(this.worn.attributes)) this.bare.setAttribute(name, attribute);
    this.bare.setDrawRange(0, start);
    const count = this.worn.getAttribute('position').count - start;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    for (const name of ['uv', 'color']) {
      const source = this.worn.getAttribute(name);
      const values = new Float32Array(count * source.itemSize);
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < source.itemSize; k++) values[i * source.itemSize + k] = source.getComponent(start + i, k);
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, source.itemSize));
    }
    const material = (Array.isArray(body.material) ? body.material[0] : body.material) as THREE.MeshStandardMaterial;
    this.loose = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      map: material.map, color: material.color, vertexColors: true, roughness: material.roughness,
      metalness: material.metalness, side: THREE.DoubleSide,
    }));
    this.loose.name = 'fallen-zombie-hat';
    this.loose.visible = false;
    this.loose.matrixAutoUpdate = false;
    this.loose.castShadow = body.castShadow;
    this.parent.add(this.loose);
  }

  public static create(root: THREE.Object3D, parent: THREE.Group, walls: GibWalls): ZombieHat | null {
    let hat: ZombieHat | null = null;
    root.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh && typeof object.geometry.userData.hatStart === 'number') {
        hat = new ZombieHat(object, parent, object.geometry.userData.hatStart, walls);
      }
    });
    return hat;
  }

  public detach(sourceX?: number, sourceZ?: number): void {
    if (this.detached) return;
    this.detached = true;
    this.parent.updateWorldMatrix(true, false);
    // SkinnedMesh refreshes bindMatrixInverse in updateMatrixWorld specifically.
    this.parent.updateMatrixWorld(true);
    const source = this.worn.getAttribute('position');
    const target = this.loose.geometry.getAttribute('position');
    this.center.set(0, 0, 0);
    for (let i = 0; i < target.count; i++) {
      this.point.fromBufferAttribute(source, this.start + i);
      this.body.applyBoneTransform(this.start + i, this.point).applyMatrix4(this.body.matrixWorld);
      target.setXYZ(i, this.point.x, this.point.y, this.point.z);
      this.center.add(this.point);
    }
    this.center.multiplyScalar(1 / target.count);
    for (let i = 0; i < target.count; i++) {
      target.setXYZ(i, target.getX(i) - this.center.x, target.getY(i) - this.center.y, target.getZ(i) - this.center.z);
    }
    target.needsUpdate = true;
    this.loose.geometry.computeVertexNormals();
    this.loose.geometry.computeBoundingBox();
    this.loose.geometry.computeBoundingSphere();
    this.body.geometry = this.bare;
    this.parent.getWorldPosition(this.point);
    this.floor = this.point.y;
    const dx = sourceX === undefined ? -Math.sin(this.parent.rotation.y) : this.point.x - sourceX;
    const dz = sourceZ === undefined ? -Math.cos(this.parent.rotation.y) : this.point.z - sourceZ;
    const length = Math.hypot(dx, dz) || 1;
    Object.assign(this.motion, {
      x: this.center.x, y: this.center.y, z: this.center.z,
      vx: dx / length * 1.7, vy: 1.8, vz: dz / length * 1.7, resting: false,
    });
    this.age = 0;
    this.rotation.identity();
    this.walls.capture(this.mapWalls, this.worldFrame);
    this.loose.visible = true;
    this.update(0);
  }

  public update(dt: number): void {
    if (!this.loose.visible) return;
    let remaining = Math.max(0, dt);
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 60);
      remaining -= step;
      if (!this.motion.resting) {
        this.age += step;
        // Freeze the tumble before landing; support height follows the rotated hat.
        this.rotation.setFromAxisAngle(this.spinAxis, Math.min(this.age, 0.5) * 3);
        this.transform.makeRotationFromQuaternion(this.rotation);
        this.bounds.copy(this.loose.geometry.boundingBox!).applyMatrix4(this.transform);
        this.previous.set(this.motion.x, this.motion.y, this.motion.z);
        stepHatMotion(this.motion, step, this.floor, -this.bounds.min.y + 0.01);
        this.point.set(this.motion.x, this.motion.y, this.motion.z);
        const contact = this.walls.collide(this.point, this.previous, 0.1);
        if (contact) {
          if (contact === 'top') {
            this.point.y += Math.max(0, -this.bounds.min.y + 0.01 - 0.1);
            this.motion.resting = true;
          } else if (contact === 'x') this.motion.vx *= -0.25;
          else if (contact === 'z') this.motion.vz *= -0.25;
          else this.motion.vx = this.motion.vz = 0;
          this.motion.x = this.point.x; this.motion.y = this.point.y; this.motion.z = this.point.z;
        }
      }
    }
    this.point.set(this.motion.x, this.motion.y, this.motion.z);
    this.transform.compose(this.point, this.rotation, this.size);
    this.parent.updateWorldMatrix(true, false);
    this.loose.matrix.copy(this.parent.matrixWorld).invert().multiply(this.transform);
    this.loose.matrixWorldNeedsUpdate = true;
  }

  public reset(): void {
    this.body.geometry = this.worn;
    this.detached = false;
    this.loose.visible = false;
  }

  public dispose(): void {
    this.reset();
    this.loose.removeFromParent();
    this.loose.geometry.dispose();
    this.loose.material.dispose();
    this.bare.dispose();
  }
}
