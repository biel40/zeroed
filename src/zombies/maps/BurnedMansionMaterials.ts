import * as THREE from 'three';

export type MansionSurfaceMaterials = {
  readonly wallVariants: readonly THREE.MeshStandardMaterial[];
  readonly concreteDirty: THREE.MeshStandardMaterial;
  readonly ceilingBurned: THREE.MeshStandardMaterial;
  readonly floorConcrete: THREE.MeshStandardMaterial;
  readonly floorWood: THREE.MeshStandardMaterial;
  readonly charredWood: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  readonly debris: THREE.MeshStandardMaterial;
  readonly sootSoft: THREE.MeshStandardMaterial;
  readonly sootHeavy: THREE.MeshStandardMaterial;
  readonly exposedBrick: THREE.MeshStandardMaterial;
  readonly damp: THREE.MeshStandardMaterial;
  readonly crack: THREE.MeshStandardMaterial;
};

type TextureSet = {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture;
  readonly roughnessMap: THREE.Texture;
};

const PROCEDURAL_SIZE = 128;

function makeFallbackTexture(
  base: readonly [number, number, number],
  variation: number,
  mode: 'color' | 'normal' | 'roughness',
): THREE.DataTexture {
  const data = new Uint8Array(PROCEDURAL_SIZE * PROCEDURAL_SIZE * 4);
  for (let y = 0; y < PROCEDURAL_SIZE; y++) {
    for (let x = 0; x < PROCEDURAL_SIZE; x++) {
      const hash = ((x * 73856093) ^ (y * 19349663) ^ ((x + y) * 83492791)) >>> 0;
      const broad = Math.sin(x * 0.11) * Math.cos(y * 0.09) * 0.32;
      const fine = ((hash % 1021) / 1020 - 0.5) * 0.68;
      const noise = broad + fine;
      const index = (y * PROCEDURAL_SIZE + x) * 4;
      if (mode === 'normal') {
        data[index] = 128 + Math.round(noise * variation);
        data[index + 1] = 128 + Math.round((((hash >>> 8) % 255) / 255 - 0.5) * variation);
        data[index + 2] = 248;
      } else if (mode === 'roughness') {
        const value = Math.max(0, Math.min(255, base[0] + noise * variation));
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
      } else {
        data[index] = Math.max(0, Math.min(255, base[0] + noise * variation));
        data[index + 1] = Math.max(0, Math.min(255, base[1] + noise * variation));
        data[index + 2] = Math.max(0, Math.min(255, base[2] + noise * variation));
      }
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, PROCEDURAL_SIZE, PROCEDURAL_SIZE, THREE.RGBAFormat);
  texture.colorSpace = mode === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function loadTexture(
  name: string,
  fallback: THREE.Texture,
  colorSpace: THREE.ColorSpace,
  anisotropy: number,
): THREE.Texture {
  if (typeof Image === 'undefined') return fallback;
  const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/textures/${name}`);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

function loadSet(prefix: 'concrete' | 'brown_planks_03', anisotropy: number): TextureSet {
  const fallbackColor = prefix === 'concrete' ? [112, 108, 98] as const : [75, 67, 57] as const;
  return {
    map: loadTexture(
      `${prefix}_diff.jpg`,
      makeFallbackTexture(fallbackColor, 34, 'color'),
      THREE.SRGBColorSpace,
      anisotropy,
    ),
    normalMap: loadTexture(
      `${prefix}_nor.jpg`,
      makeFallbackTexture([128, 128, 248], 18, 'normal'),
      THREE.NoColorSpace,
      anisotropy,
    ),
    roughnessMap: loadTexture(
      `${prefix}_rough.jpg`,
      makeFallbackTexture([225, 225, 225], 22, 'roughness'),
      THREE.NoColorSpace,
      anisotropy,
    ),
  };
}

function makeSurfaceMaterial(
  name: string,
  textures: TextureSet,
  color: number,
  roughness: number,
  normalStrength: number,
  metersPerTile: number,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name,
    color,
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    roughnessMap: textures.roughnessMap,
    aoMap: textures.roughnessMap,
    aoMapIntensity: 0.25,
    roughness,
    metalness: 0,
  });
  material.userData.metersPerTile = metersPerTile;
  return material;
}

function makeDecalTexture(
  kind: 'soot' | 'brick' | 'damp' | 'crack',
  seed: number,
): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const index = (y * size + x) * 4;
      const hash = ((x * 73856093) ^ (y * 19349663) ^ seed) >>> 0;
      const noise = (hash % 997) / 996;
      let alpha = 0;
      let color: readonly [number, number, number] = [24, 20, 18];

      if (kind === 'soot') {
        const plume = Math.max(0, 1 - Math.hypot((u - 0.5) / 0.48, (v - 0.36) / 0.65));
        const streaks = 0.55 + Math.sin(u * 37 + seed) * 0.18;
        alpha = plume * streaks * (0.55 + noise * 0.45);
      } else if (kind === 'damp') {
        const patch = Math.max(0, 1 - Math.hypot((u - 0.48) / 0.53, (v - 0.55) / 0.48));
        alpha = patch * (0.28 + noise * 0.42);
        color = [38, 47, 39];
      } else if (kind === 'brick') {
        const edge = Math.max(0, 1 - Math.hypot((u - 0.5) / 0.49, (v - 0.5) / 0.48));
        const row = Math.floor(v * 9);
        const brickU = (u * 5 + (row % 2) * 0.5) % 1;
        const mortar = brickU < 0.07 || (v * 9) % 1 < 0.08;
        alpha = edge > noise * 0.28 ? Math.min(1, edge * 3) : 0;
        color = mortar ? [67, 62, 55] : [112 + Math.round(noise * 25), 66, 49];
      } else {
        const branch = Math.abs(u - 0.5 - Math.sin(v * 20 + seed) * (0.025 + v * 0.035));
        const offshoot = Math.abs(u - 0.43 - v * 0.2);
        alpha = branch < 0.012 || (v > 0.42 && offshoot < 0.008) ? 0.9 : 0;
        color = [22, 20, 18];
      }
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeDecalMaterial(name: string, kind: 'soot' | 'brick' | 'damp' | 'crack', seed: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    name,
    map: makeDecalTexture(kind, seed),
    transparent: true,
    alphaTest: kind === 'crack' ? 0.35 : 0.03,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
}

export function createMansionSurfaceMaterials(anisotropyLimit: number): MansionSurfaceMaterials {
  const anisotropy = Math.min(anisotropyLimit, 8);
  const concrete = loadSet('concrete', anisotropy);
  const wood = loadSet('brown_planks_03', anisotropy);
  const plasterDamaged = makeSurfaceMaterial('plaster_damaged', concrete, 0xc0ad8d, 0.96, 0.34, 1.35);
  const concreteDirty = makeSurfaceMaterial('concrete_dirty', concrete, 0x89877e, 0.98, 0.42, 1.15);
  const burnedWall = makeSurfaceMaterial('burned_wall', concrete, 0x514a43, 1, 0.48, 1.05);

  return {
    wallVariants: [plasterDamaged, concreteDirty, burnedWall],
    concreteDirty,
    ceilingBurned: makeSurfaceMaterial('blackened_plaster_ceiling', concrete, 0x56534e, 1, 0.38, 1.1),
    floorConcrete: makeSurfaceMaterial('worn_concrete_floor', concrete, 0x77746b, 0.97, 0.5, 0.95),
    floorWood: makeSurfaceMaterial('deteriorated_wood_floor', wood, 0x706355, 0.94, 0.45, 1.25),
    charredWood: makeSurfaceMaterial('charred_wood', wood, 0x443a31, 0.98, 0.55, 0.9),
    metal: new THREE.MeshStandardMaterial({ name: 'oxidized_metal', color: 0x454849, roughness: 0.82, metalness: 0.35 }),
    debris: new THREE.MeshStandardMaterial({ name: 'fire_debris', color: 0x3a3530, roughness: 1 }),
    sootSoft: makeDecalMaterial('soot_soft', 'soot', 17),
    sootHeavy: makeDecalMaterial('soot_heavy', 'soot', 83),
    exposedBrick: makeDecalMaterial('exposed_brick', 'brick', 41),
    damp: makeDecalMaterial('damp_stain', 'damp', 67),
    crack: makeDecalMaterial('plaster_crack', 'crack', 29),
  };
}

export function projectBoxUVs(
  geometry: THREE.BoxGeometry,
  width: number,
  height: number,
  depth: number,
  metersPerTile: number,
  offsetU: number,
  offsetV: number,
): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index++) {
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const faceWidth = nx > 0.5 ? depth : width;
    const faceHeight = ny > 0.5 ? depth : height;
    uv.setXY(
      index,
      uv.getX(index) * faceWidth / metersPerTile + offsetU,
      uv.getY(index) * faceHeight / metersPerTile + offsetV,
    );
  }
  uv.needsUpdate = true;
  geometry.setAttribute('uv1', uv.clone());
}
