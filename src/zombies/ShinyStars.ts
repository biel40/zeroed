import * as THREE from 'three';

const STAR_COUNT = 10;
let sharedTexture: THREE.DataTexture | null = null;

function starTexture(): THREE.DataTexture {
  if (sharedTexture) return sharedTexture;
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const horizontal = (column + 0.5) / size * 2 - 1;
      const vertical = (row + 0.5) / size * 2 - 1;
      const radius = Math.hypot(horizontal, vertical);
      const star = Math.abs(horizontal) ** 0.6 + Math.abs(vertical) ** 0.6;
      const alpha = Math.max(1 - THREE.MathUtils.smoothstep(star, 0.75, 1.05), Math.max(0, 1 - radius * 2.4) * 0.22);
      const offset = (row * size + column) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  sharedTexture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  sharedTexture.magFilter = THREE.LinearFilter;
  sharedTexture.minFilter = THREE.LinearFilter;
  sharedTexture.needsUpdate = true;
  return sharedTexture;
}

export class ShinyStars {
  public readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly positions = new THREE.BufferAttribute(new Float32Array(STAR_COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage);
  private readonly colors = new THREE.BufferAttribute(new Float32Array(STAR_COUNT * 3), 3).setUsage(THREE.DynamicDrawUsage);
  private elapsed = 0;

  public constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('color', this.colors);
    const material = new THREE.PointsMaterial({
      map: starTexture(),
      color: 0xffe298,
      size: 0.24,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = 'shiny-stars';
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  public setEnabled(enabled: boolean): void {
    this.elapsed = 0;
    this.points.visible = enabled;
    this.points.material.opacity = 1;
    this.update(0);
  }

  public update(dt: number): void {
    if (!this.points.visible) return;
    this.elapsed = (this.elapsed + dt) % 20;
    for (let index = 0; index < STAR_COUNT; index++) {
      const phase = (index / STAR_COUNT + this.elapsed * 0.15) % 1;
      const angle = index * 2.39996 + this.elapsed * 0.5;
      const radius = 0.34 + Math.sin(index * 1.7) * 0.09;
      this.positions.setXYZ(index, Math.cos(angle) * radius, 0.3 + phase * 1.65, Math.sin(angle) * radius + 0.06);
      const pulse = 0.2 + Math.max(0, Math.sin(this.elapsed * 3 + index * 1.9)) ** 3 * 0.8;
      const fade = THREE.MathUtils.smoothstep(phase, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(phase, 0.88, 1));
      const brightness = pulse * fade;
      this.colors.setXYZ(index, brightness, brightness, brightness);
    }
    this.positions.needsUpdate = true;
    this.colors.needsUpdate = true;
  }
}