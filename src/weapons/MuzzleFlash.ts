import * as THREE from 'three';
import type { MuzzleFlashConfig } from './WeaponTypes';

let flameTexture: THREE.DataTexture | null = null;

/** A hot root breaking into irregular orange tongues along the jet's +X axis. */
function getFlameTexture(): THREE.DataTexture {
  if (flameTexture) return flameTexture;
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const along = x / (size - 1);
      const across = y / (size - 1) * 2 - 1;
      const width = (0.16 + Math.sin(along * Math.PI) * 0.65) * (1 - along * 0.65);
      const turbulence = 1 + 0.19 * Math.sin(along * 39 + across * 11) + 0.1 * Math.sin(along * 71 - across * 19);
      const edge = Math.max(0, 1 - Math.abs(across) / (width * turbulence));
      const alpha = edge * edge * (1 - THREE.MathUtils.smoothstep(along, 0.55, 1));
      const index = (y * size + x) * 4;
      pixels[index] = 255;
      pixels[index + 1] = Math.round(245 - along * 160);
      pixels[index + 2] = Math.round(190 * Math.pow(1 - along, 3));
      pixels[index + 3] = Math.round(alpha * 255);
    }
  }
  flameTexture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  flameTexture.colorSpace = THREE.SRGBColorSpace;
  flameTexture.magFilter = THREE.LinearFilter;
  flameTexture.minFilter = THREE.LinearFilter;
  flameTexture.needsUpdate = true;
  return flameTexture;
}

/** Prebuilt crossed flame sheets, attached to the muzzle with forward along -Z. */
export class MuzzleFlash {
  readonly root = new THREE.Group();
  private readonly material = new THREE.MeshBasicMaterial({
    map: getFlameTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  private remaining = 0;
  private shotScale = 1;

  constructor(private readonly config: MuzzleFlashConfig) {
    this.root.name = 'heavy-muzzle-flash';
    this.root.visible = false;
    this.addJet('forward-flame', config.length, config.width, Math.PI / 2, 0, 0);
    // Both chambers of a heavy muzzle brake vent outwards, behind the crown.
    for (const side of [-1, 1]) {
      for (let chamber = 0; chamber < 2; chamber++) {
        this.addJet(`brake-flame-${side}-${chamber}`, config.sideLength * (1 - chamber * 0.2),
          config.width * 0.8, side < 0 ? Math.PI : 0, side * 0.025, 0.035 + chamber * 0.05);
      }
    }
  }

  private addJet(name: string, length: number, width: number, yaw: number, x: number, z: number): void {
    const geometry = new THREE.PlaneGeometry(length, width);
    geometry.translate(length / 2, 0, 0);
    const jet = new THREE.Group();
    jet.name = name;
    jet.position.set(x, 0, z);
    jet.rotation.y = yaw;
    for (const roll of [0, Math.PI / 2]) {
      const sheet = new THREE.Mesh(geometry, this.material);
      sheet.rotation.x = roll;
      jet.add(sheet);
    }
    this.root.add(jet);
  }

  trigger(): void {
    this.remaining = this.config.duration;
    this.shotScale = 0.9 + Math.random() * 0.2;
    this.root.scale.setScalar(this.shotScale);
    this.material.opacity = 1;
    this.root.visible = true;
  }

  update(dt: number): void {
    if (this.remaining <= 0) return;
    this.remaining = Math.max(0, this.remaining - dt);
    const progress = 1 - this.remaining / this.config.duration;
    // The gas expands while the initial white-hot burst dies into orange tongues.
    this.root.scale.setScalar(this.shotScale * (1 + progress * 0.35));
    this.material.opacity = Math.pow(1 - progress, 2);
    this.root.visible = this.remaining > 0;
  }

  reset(): void {
    this.remaining = 0;
    this.root.visible = false;
  }
}
