import * as THREE from 'three';

/** How a puff looks and drifts: size in metres (and its growth per second), life in seconds, rise in m/s, drag 1/s. */
export interface PuffStyle {
  readonly color: number;
  readonly opacity: number;
  readonly size: number;
  readonly growth: number;
  readonly life: number;
  readonly rise: number;
  readonly drag: number;
}

/** Its breath in the cold, the plume of a roar, snow kicked up by its feet, and the red steam of its fury. */
export const PUFF_STYLES = {
  breath: { color: 0xe6ecf0, opacity: 0.3, size: 0.12, growth: 0.45, life: 1.1, rise: 0.12, drag: 1.8 },
  roar: { color: 0xe6ecf0, opacity: 0.4, size: 0.18, growth: 0.9, life: 1.4, rise: 0.2, drag: 1.4 },
  dust: { color: 0xd9dde0, opacity: 0.45, size: 0.22, growth: 0.8, life: 0.9, rise: 0.05, drag: 3 },
  steam: { color: 0xb87a72, opacity: 0.22, size: 0.14, growth: 0.5, life: 1.3, rise: 0.5, drag: 1 },
} as const satisfies Record<string, PuffStyle>;

interface Puff {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  readonly velocity: THREE.Vector3;
  style: PuffStyle;
  age: number;
  scale: number;
}

/**
 * Soft puffs around CAPITÁN URSS that drift, swell and fade. A fixed pool
 * of sprites: once all are out, the oldest is reused. Allocation-free
 * after construction; its texture is baked from data (no canvas).
 */
export class CaptainUssrPuffs {
  public readonly group = new THREE.Group();
  private readonly texture = puffTexture();
  private readonly puffs: Puff[];
  private next = 0;

  public constructor(capacity: number) {
    this.group.name = 'captain-ussr-puffs';
    this.puffs = Array.from({ length: capacity }, () => {
      const material = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.group.add(sprite);
      return { sprite, material, velocity: new THREE.Vector3(), style: PUFF_STYLES.breath, age: 0, scale: 1 };
    });
  }

  /** A puff at `at` moving at `velocity`, `scale` times its style's size. */
  public emit(at: THREE.Vector3Like, velocity: THREE.Vector3Like, style: PuffStyle, scale = 1): void {
    if (this.puffs.length === 0) return;
    const puff = this.puffs[this.next];
    this.next = (this.next + 1) % this.puffs.length;
    puff.style = style;
    puff.age = 0;
    puff.scale = scale;
    puff.velocity.set(velocity.x, velocity.y, velocity.z);
    puff.sprite.position.set(at.x, at.y, at.z);
    puff.sprite.visible = true;
    puff.material.color.setHex(style.color);
    puff.material.rotation = (this.next * 2.39996) % (Math.PI * 2);
    this.draw(puff);
  }

  public update(dt: number): void {
    const step = Math.max(0, dt);
    for (const puff of this.puffs) {
      if (!puff.sprite.visible) continue;
      puff.age += step;
      if (puff.age >= puff.style.life) {
        puff.sprite.visible = false;
        continue;
      }
      const drag = Math.exp(-puff.style.drag * step);
      puff.velocity.multiplyScalar(drag);
      puff.velocity.y += (puff.style.rise - puff.velocity.y) * (1 - drag);
      puff.sprite.position.addScaledVector(puff.velocity, step);
      this.draw(puff);
    }
  }

  public reset(): void {
    for (const puff of this.puffs) puff.sprite.visible = false;
  }

  public dispose(): void {
    for (const puff of this.puffs) puff.material.dispose();
    this.texture.dispose();
    this.group.removeFromParent();
  }

  /** Swells as it ages, fading in fast and out slowly. */
  private draw(puff: Puff): void {
    const life = puff.age / puff.style.life;
    const size = (puff.style.size + puff.style.growth * puff.age) * puff.scale;
    puff.sprite.scale.set(size, size, 1);
    puff.material.opacity = puff.style.opacity * Math.min(1, life * 8) * (1 - life) * (1 - life);
  }
}

/** A white disc whose alpha falls off smoothly to its edge. */
function puffTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const alpha = Math.max(0, 1 - distance);
      const offset = (y * size + x) * 4;
      data.fill(255, offset, offset + 3);
      data[offset + 3] = Math.round(alpha * alpha * (3 - 2 * alpha) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
