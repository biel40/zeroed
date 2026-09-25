import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WeaponId } from '../weapons/WeaponTypes';
import type { ZombieModelId } from '../zombies/ZombieConfig';
import { ZOMBIE_MODELS, type ZombieModelSource } from '../zombies/ZombieVisual';
import { REMOTE_SOLDIER_MODEL_URL, type RemotePlayerModelSource } from '../rendering/RemotePlayerAvatar';

export const TEXTURE_MANIFEST: readonly string[] = [
  'brown_planks_03_diff.jpg',
  'brown_planks_03_nor.jpg',
  'brown_planks_03_rough.jpg',
  'metal_plate_diff.jpg',
  'metal_plate_nor.jpg',
  'metal_plate_rough.jpg',
];

/** Zombie GLBs (skinned + animated) served from public/assets/zombies/. */
export const ZOMBIE_MANIFEST: ReadonlyArray<{ id: ZombieModelId; url: string }> =
  (Object.keys(ZOMBIE_MODELS) as ZombieModelId[])
    .map((id) => ({ id, url: ZOMBIE_MODELS[id].url }));

export interface AssetManifest {
  readonly weapons: ReadonlyArray<{ id: WeaponId; url: string }>;
  readonly textures: readonly string[];
  readonly zombies: ReadonlyArray<{ id: ZombieModelId; url: string }>;
}

/**
 * Single entry point for external assets: one GLTFLoader/TextureLoader,
 * caches everything, and reports real per-item progress. Failed assets
 * remain unavailable so callers can use their fallbacks.
 * Owns the cached resources and disposes them in dispose().
 */
export class AssetManager {
  private readonly gltfLoader = new GLTFLoader();
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly models = new Map<WeaponId, THREE.Group>();
  private readonly zombies = new Map<ZombieModelId, ZombieModelSource>();
  private readonly textures = new Map<string, THREE.Texture>();
  private playerModel: RemotePlayerModelSource | null = null;
  private playerModelLoad: Promise<void> | null = null;

  constructor(private readonly anisotropyLimit = 8) {}

  async loadAll(
    manifest: AssetManifest,
    onProgress: (loaded: number, total: number) => void,
  ): Promise<void> {
    const total = manifest.weapons.length + manifest.textures.length + manifest.zombies.length;
    let loaded = 0;
    const track = <T>(promise: Promise<T>): Promise<T> =>
      promise.then((value) => {
        onProgress(++loaded, total);
        return value;
      });

    await Promise.all([
      ...manifest.weapons.map((w) => track(this.loadModel(w.id, w.url))),
      ...manifest.textures.map((name) => track(this.loadTexture(name))),
      ...manifest.zombies.map((z) => track(this.loadZombie(z.id, z.url))),
    ]);
  }

  /** Returns the cached model, or null when missing/failed (use fallback). */
  getWeaponModel(id: WeaponId): THREE.Group | null {
    return this.models.get(id) ?? null;
  }

  /** Skinned zombie template + clips; null degrades to procedural bodies. */
  getZombieModel(id: ZombieModelId): ZombieModelSource | null {
    return this.zombies.get(id) ?? null;
  }

  /** Complete model catalog for ZombieManager; missing loads remain null fallbacks. */
  getZombieModels(): Record<ZombieModelId, ZombieModelSource | null> {
    return Object.fromEntries(
      (Object.keys(ZOMBIE_MODELS) as ZombieModelId[]).map((id) => [id, this.getZombieModel(id)]),
    ) as Record<ZombieModelId, ZombieModelSource | null>;
  }

  getTexture(name: string): THREE.Texture | null {
    return this.textures.get(name) ?? null;
  }

  /**
   * Co-op only: loads the teammate soldier once, on demand, so single player
   * never requests it. A missing file resolves to the procedural stand-in.
   */
  public loadPlayerModel(): Promise<void> {
    this.playerModelLoad ??= this.gltfLoader.loadAsync(this.resolve(REMOTE_SOLDIER_MODEL_URL))
      .then((gltf) => {
        this.playerModel = { scene: gltf.scene, clips: gltf.animations };
      })
      .catch(() => { });
    return this.playerModelLoad;
  }

  public getPlayerModel(): RemotePlayerModelSource | null {
    return this.playerModel;
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
    for (const source of this.zombies.values()) {
      source.scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
    }
    this.zombies.clear();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }

  private async loadModel(id: WeaponId, url: string): Promise<void> {
    try {
      const gltf = await this.gltfLoader.loadAsync(this.resolve(url));
      this.models.set(id, gltf.scene);
    } catch {
      // The weapon view uses its procedural fallback.
    }
  }

  private async loadZombie(id: ZombieModelId, url: string): Promise<void> {
    try {
      const gltf = await this.gltfLoader.loadAsync(this.resolve(url));
      this.zombies.set(id, { scene: gltf.scene, clips: gltf.animations });
    } catch {
      // The zombie view uses its procedural fallback.
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
    } catch {
      // The map uses flat colors when this texture is unavailable.
    }
  }

  private resolve(path: string): string {
    return `${import.meta.env.BASE_URL}${path}`;
  }
}
