import * as THREE from 'three';
import type { HitTarget, SurfaceType } from '../shooting/HitTarget';

export type TargetKind = 'steel' | 'paper';

const STEEL_SPRING = 42;
const STEEL_DAMPING = 7;
const PAPER_SPRING = 60;
const PAPER_DAMPING = 10;

let bullseyeTexture: THREE.CanvasTexture | null = null;

function getBullseyeTexture(): THREE.CanvasTexture {
  if (bullseyeTexture) return bullseyeTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.fillStyle = '#e8e4d8';
  ctx.fillRect(0, 0, size, size);
  const rings: Array<[number, string]> = [
    [110, '#c63a2e'],
    [82, '#e8e4d8'],
    [55, '#c63a2e'],
    [30, '#e8e4d8'],
    [14, '#c63a2e'],
  ];
  for (const [radius, color] of rings) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  bullseyeTexture = new THREE.CanvasTexture(canvas);
  bullseyeTexture.colorSpace = THREE.SRGBColorSpace;
  bullseyeTexture.anisotropy = 4;
  return bullseyeTexture;
}

/**
 * Reactive range target. Steel poppers tip backwards on a spring when hit;
 * paper bullseyes only shake lightly and accept bullet-hole decals.
 */
export class Target implements HitTarget {
  readonly group = new THREE.Group();
  readonly collider: THREE.Mesh;
  readonly acceptsDecals: boolean;
  readonly surface: SurfaceType;

  private readonly platePivot = new THREE.Group();
  private readonly plateMaterial: THREE.MeshStandardMaterial;
  private readonly springK: number;
  private readonly damping: number;
  private readonly hitImpulse: number;
  private tilt = 0;
  private tiltVelocity = 0;
  private flash = 0;

  constructor(kind: TargetKind) {
    this.acceptsDecals = kind === 'paper';
    this.surface = kind === 'paper' ? 'paper' : 'metal';
    this.springK = kind === 'steel' ? STEEL_SPRING : PAPER_SPRING;
    this.damping = kind === 'steel' ? STEEL_DAMPING : PAPER_DAMPING;
    this.hitImpulse = kind === 'steel' ? 4.6 : 0.7;

    if (kind === 'steel') {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.95, 8),
        new THREE.MeshStandardMaterial({ color: 0x4c4f52, roughness: 0.8 }),
      );
      post.position.y = 0.475;
      post.castShadow = true;
      this.group.add(post);

      this.plateMaterial = new THREE.MeshStandardMaterial({
        color: 0xd8d8d2,
        roughness: 0.5,
        metalness: 0.6,
        emissive: 0xff7733,
        emissiveIntensity: 0,
      });
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 20), this.plateMaterial);
      plate.rotation.x = Math.PI / 2;
      plate.position.y = 0.28;
      plate.castShadow = true;
      this.platePivot.position.y = 0.95;
      this.platePivot.add(plate);
      this.group.add(this.platePivot);
      this.collider = plate;
    } else {
      const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x5c5142, roughness: 0.9 });
      const postLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.15, 0.06), frameMaterial);
      postLeft.position.set(-0.42, 0.575, 0);
      const postRight = postLeft.clone();
      postRight.position.x = 0.42;
      this.group.add(postLeft, postRight);

      this.plateMaterial = new THREE.MeshStandardMaterial({
        map: getBullseyeTexture(),
        roughness: 0.85,
        emissive: 0xffffff,
        emissiveIntensity: 0,
      });
      const backing = new THREE.MeshStandardMaterial({ color: 0x8a8272, roughness: 0.9 });
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.92, 0.03), [
        backing,
        backing,
        backing,
        backing,
        this.plateMaterial,
        backing,
      ]);
      board.position.y = 0.46;
      board.castShadow = true;
      this.platePivot.position.y = 0.7;
      this.platePivot.add(board);
      this.group.add(this.platePivot);
      this.collider = board;
    }

    this.collider.userData.target = this;
    this.collider.userData.surface = this.surface;
  }

  onHit(): void {
    this.flash = 1;
    this.tiltVelocity += this.hitImpulse;
  }

  update(dt: number): void {
    this.tiltVelocity += (-this.springK * this.tilt - this.damping * this.tiltVelocity) * dt;
    this.tilt += this.tiltVelocity * dt;
    this.platePivot.rotation.x = -this.tilt;

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 5);
      this.plateMaterial.emissiveIntensity = this.flash * 1.6;
    }
  }
}
