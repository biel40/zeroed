import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WeaponId } from '../weapons/WeaponTypes';

export const TEXTURE_MANIFEST: readonly string[] = [
  'concrete_diff.jpg',
  'concrete_nor.jpg',
  'concrete_rough.jpg',
  'brown_planks_03_diff.jpg',
  'brown_planks_03_nor.jpg',
  'brown_planks_03_rough.jpg',
  'metal_plate_diff.jpg',
  'metal_plate_nor.jpg',
  'metal_plate_rough.jpg',
  'brown_mud_dry_diff.jpg',
  'brown_mud_dry_nor.jpg',
  'brown_mud_dry_rough.jpg',
];

export interface AssetManifest {
  readonly weapons: ReadonlyArray<{ id: WeaponId; url: string }>;
  readonly textures: readonly string[];
}

/**
 * Single entry point for external assets: one GLTFLoader/TextureLoader,
 * caches everything, and reports real per-item progress. Every failure
 * degrades to null with one console.warn so callers can fall back.
 * Owns the cached resources and disposes them in dispose().
 */
export class AssetManager {
  private readonly gltfLoader = new GLTFLoader();
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly models = new Map<WeaponId, THREE.Group>();
  private readonly textures = new Map<string, THREE.Texture>();

  constructor(private readonly anisotropyLimit = 8) {}

  async loadAll(
    manifest: AssetManifest,
    onProgress: (loaded: number, total: number) => void,
  ): Promise<void> {
    const total = manifest.weapons.length + manifest.textures.length;
    let loaded = 0;
    console.info(`[AssetManager] Starting load: ${total} assets`);
    const track = <T>(promise: Promise<T>): Promise<T> =>
      promise.then((value) => {
        onProgress(++loaded, total);
        return value;
      });

    await Promise.all([
      ...manifest.weapons.map((w) => track(this.loadModel(w.id, w.url))),
      ...manifest.textures.map((name) => track(this.loadTexture(name))),
    ]);
    console.info(`[AssetManager] Completed load: ${loaded}/${total} assets loaded`);
  }

  /** Returns the cached model, or null when missing/failed (use fallback). */
  getWeaponModel(id: WeaponId): THREE.Group | null {
    return this.models.get(id) ?? null;
  }

  getTexture(name: string): THREE.Texture | null {
    return this.textures.get(name) ?? null;
  }

  /** Textures following the `${slug}_{map}.jpg` convention as a PBR set. */
  getTextureSet(slug: string): {
    map: THREE.Texture | null;
    normalMap: THREE.Texture | null;
    roughnessMap: THREE.Texture | null;
  } {
    return {
      map: this.getTexture(`${slug}_diff.jpg`),
      normalMap: this.getTexture(`${slug}_nor.jpg`),
      roughnessMap: this.getTexture(`${slug}_rough.jpg`),
    };
  }

  dispose(): void {
    for (const model of this.models.values()) {
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
    }
    this.models.clear();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }

  private async loadModel(id: WeaponId, url: string): Promise<void> {
    try {
      const gltf = await this.gltfLoader.loadAsync(this.resolve(url));
      this.models.set(id, gltf.scene);
    } catch (error) {
      console.warn(
        `[AssetManager] Could not load weapon model "${id}" (${url}). Procedural fallback will be used.`,
        error,
      );
    }
  }

  private async loadTexture(name: string): Promise<void> {
    try {
      const texture = await this.textureLoader.loadAsync(this.resolve(`assets/textures/${name}`));
      texture.colorSpace = name.includes('_diff')
        ? THREE.SRGBColorSpace
        : THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = Math.min(this.anisotropyLimit, 8);
      this.textures.set(name, texture);
    } catch (error) {
      console.warn(`[AssetManager] Could not load texture "${name}". Flat colors will be used.`, error);
    }
  }

  private resolve(path: string): string {
    return `${import.meta.env.BASE_URL}${path}`;
  }
}
