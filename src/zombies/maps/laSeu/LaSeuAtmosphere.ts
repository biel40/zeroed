import * as THREE from 'three';
import { LA_SEU_DUST_COUNT, LA_SEU_MIST_PATCHES, LANCET, MOONLIT_LANCET_BAYS, NAVE, naveBayCenter } from '../LaSeuConfig';
import { seededRandom } from '../shared/ProceduralNoise';
import { makeSoftSpot } from '../shared/SoftSpotTexture';
import type { LaSeuBuildContext } from './LaSeuBuildContext';

/** Dust hangs below this height: where the candles and the beams catch it. */
const DUST_CEILING = 9;
const DUST_DRIFT = 0.4;
/** Where an east lancet's beam meets the floor, measured from the wall and from its bay centre. */
const SHAFT_LANDING = { nearX: 1.6, farX: 6.6, shiftZ: -1.6 } as const;

/** Height the mist lies at: over the plinths, under the knees. */
const MIST_Y = 0.32;

/** One flat quad per patch of mist, a hand above the floor. */
function mistGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  LA_SEU_MIST_PATCHES.forEach(({ x, z, radius }, patch) => {
    const base = patch * 4;
    const y = MIST_Y + (patch % 3) * 0.07;
    positions.push(x - radius, y, z + radius, x + radius, y, z + radius, x + radius, y, z - radius, x - radius, y, z - radius);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Two crossed quads per moonlit lancet, from the glass down to the floor: one reads along the nave, one across it. */
function shaftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const quad = (corners: ReadonlyArray<readonly [number, number, number]>): void => {
    const base = positions.length / 3;
    for (const corner of corners) positions.push(...corner);
    uvs.push(0, 1, 1, 1, 1, 0, 0, 0);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const wallX = NAVE.maxX - 0.1;
  const { width, sillY, apexY } = LANCET.aisle;
  const middleY = (sillY + apexY) / 2;
  const half = width / 2;
  for (const bay of MOONLIT_LANCET_BAYS) {
    const z = naveBayCenter(bay);
    const landingZ = z + SHAFT_LANDING.shiftZ;
    const nearX = NAVE.maxX - SHAFT_LANDING.nearX;
    const farX = NAVE.maxX - SHAFT_LANDING.farX;
    quad([[wallX, apexY, z], [wallX, sillY, z], [nearX, 0, landingZ], [farX, 0, landingZ]]);
    quad([[wallX, middleY, z - half], [wallX, middleY, z + half], [(nearX + farX) / 2, 0, landingZ + half], [(nearX + farX) / 2, 0, landingZ - half]]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Cheap motion in still air: dust drifting through the nave and, where the
 * device can afford the overdraw, the moonbeams of the few lit lancets and
 * low mist lying in the still corners. Buffers are allocated once.
 */
export class LaSeuAtmosphere {
  private readonly dust: THREE.Points;
  private readonly dustBase: Float32Array;
  private readonly dustPhase: Float32Array;
  private readonly shaftMaterial: THREE.MeshBasicMaterial | null = null;
  private readonly shaftOpacity: number;
  private readonly mistMaterial: THREE.MeshBasicMaterial | null = null;
  private readonly mistOpacity: number;
  private time = 0;

  public constructor(context: LaSeuBuildContext) {
    const { group, materials, profile } = context;
    const count = LA_SEU_DUST_COUNT[profile.quality];
    const random = seededRandom(6501);
    this.dustBase = new Float32Array(count * 3);
    this.dustPhase = new Float32Array(count);
    for (let mote = 0; mote < count; mote++) {
      this.dustBase[mote * 3] = THREE.MathUtils.lerp(NAVE.minX + 0.6, NAVE.maxX - 0.6, random());
      this.dustBase[mote * 3 + 1] = 0.4 + random() * (DUST_CEILING - 0.4);
      this.dustBase[mote * 3 + 2] = THREE.MathUtils.lerp(NAVE.minZ + 0.6, NAVE.maxZ - 0.6, random());
      this.dustPhase[mote] = random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.dustBase.slice(), 3));
    this.dust = new THREE.Points(geometry, new THREE.PointsMaterial({
      name: 'laseu_dust', size: 0.045, map: makeSoftSpot(16), color: 0x9a927e, transparent: true, opacity: 0.42, depthWrite: false,
    }));
    this.dust.name = 'laseu-dust';
    group.add(this.dust);

    this.shaftOpacity = materials.lightShaft.opacity;
    this.mistOpacity = materials.mist.opacity;
    if (!profile.useReducedEffects) {
      const mist = new THREE.Mesh(mistGeometry(), materials.mist);
      mist.name = 'laseu-mist';
      mist.renderOrder = 1;
      group.add(mist);
      this.mistMaterial = materials.mist;
      const shafts = new THREE.Mesh(shaftGeometry(), materials.lightShaft);
      shafts.name = 'laseu-moon-shafts';
      shafts.renderOrder = 2;
      group.add(shafts);
      this.shaftMaterial = materials.lightShaft;
    }
    this.update(0);
  }

  public update(dt: number): void {
    this.time += Math.max(0, dt);
    const position = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    for (let mote = 0; mote < this.dustPhase.length; mote++) {
      const phase = this.dustPhase[mote];
      array[mote * 3] = this.dustBase[mote * 3] + Math.sin(this.time * 0.11 + phase) * DUST_DRIFT;
      array[mote * 3 + 1] = this.dustBase[mote * 3 + 1] + Math.sin(this.time * 0.07 + phase * 1.3) * DUST_DRIFT * 0.6;
      array[mote * 3 + 2] = this.dustBase[mote * 3 + 2] + Math.cos(this.time * 0.09 + phase) * DUST_DRIFT;
    }
    position.needsUpdate = true;
    // Thin cloud crossing the moon: the beams breathe.
    if (this.shaftMaterial) this.shaftMaterial.opacity = this.shaftOpacity * (0.82 + 0.18 * Math.sin(this.time * 0.31));
    if (this.mistMaterial) this.mistMaterial.opacity = this.mistOpacity * (0.7 + 0.3 * Math.sin(this.time * 0.17 + 1.3));
  }

  public reset(): void {
    this.time = 0;
    this.update(0);
  }
}
