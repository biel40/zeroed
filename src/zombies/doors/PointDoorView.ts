import * as THREE from 'three';
import type { PointDoor } from './PointDoor';

const DOOR_WIDTH = 1.4;
const DOOR_HEIGHT = 2.1;
const DOOR_THICK = 0.12;

/**
 * Simple wooden door visual. On unlock it slides outward and fades so the
 * passage is clear without deleting colliders immediately.
 */
export class PointDoorView {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly sign: THREE.Mesh;

  constructor(
    private readonly door: PointDoor,
    scene: THREE.Scene,
  ) {
    const geometry = new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, DOOR_THICK);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a3c32,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = DOOR_HEIGHT / 2;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Cost label floating in front of the door.
    const signGeometry = new THREE.PlaneGeometry(0.5, 0.25);
    const signMaterial = new THREE.MeshBasicMaterial({
      map: this.makeCostTexture(door.cost),
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.sign = new THREE.Mesh(signGeometry, signMaterial);
    this.sign.position.set(0, DOOR_HEIGHT - 0.35, DOOR_THICK / 2 + 0.02);
    this.mesh.add(this.sign);

    this.group.add(this.mesh);
    this.group.position.set(door.position.x, 0, door.position.z);
    this.group.userData.surface = 'wood';
    const angle = Math.atan2(door.outward.x, door.outward.z);
    this.group.rotation.y = angle;
    scene.add(this.group);
  }

  public update(dt: number): void {
    if (this.door.state === 'unlocked') {
      // Slide outward and sink slightly, then hide.
      const speed = 2.2;
      this.mesh.position.x += this.door.outward.x * speed * dt;
      this.mesh.position.z += this.door.outward.z * speed * dt;
      this.mesh.position.y -= 0.4 * dt;
      const material = this.mesh.material as THREE.MeshStandardMaterial;
      if (material.opacity > 0.02) {
        material.transparent = true;
        material.opacity = Math.max(0, material.opacity - 1.5 * dt);
      } else {
        this.mesh.visible = false;
      }
    }
  }

  private makeCostTexture(cost: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 124, 60);
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${cost}`, 64, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
