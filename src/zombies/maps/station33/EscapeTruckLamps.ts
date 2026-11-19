import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeSoftDotTexture } from '../../doors/BuyableDoorVisual';
import { CAB, FRONT, HEADLIGHT, REAR, TAIL_LIGHT, type TruckPartBatch } from './EscapeTruckLayout';
import type { EscapeTruckMaterials } from './EscapeTruckMaterials';

/** Light falling out of each headlamp into the night air. */
const BEAM = { length: 18, radius: 2.3, droop: 0.05, opacity: 0.14 } as const;
/** The headlamps' light on the road ahead, and the tail lights' red on the snow behind. */
const HEAD_POOL = { width: 7, length: 14, ahead: 0.6, opacity: 0.34 } as const;
const TAIL_POOL = { width: 2.8, length: 2.4, opacity: 0.2 } as const;
/** Ground height of the light pools: just over the road, under the tyres' contact. */
const POOL_Y = 0.025;
const POOL_TEXTURE_SIZE = 64;
const DOME_LAMP = { y: CAB.top - 0.07, fromNose: 1.3 } as const;
const SPOTLIGHT = { x: CAB.halfWidth + 0.12, y: 2.3, fromNose: 0.2 } as const;

const HEADLIGHT_DARK = new THREE.Color(0x1c1d1a);
const HEADLIGHT_LIT = new THREE.Color(0xfff1d0);
const TAIL_DARK = new THREE.Color(0x240705);
const TAIL_LIT = new THREE.Color(0xff2b16);
const AMBER_DARK = new THREE.Color(0x2a1a06);
const AMBER_LIT = new THREE.Color(0xff9a2a);

/**
 * Every lamp on the truck and the light they throw, all driven by one
 * level (0 dark, 1 full): headlamps in their pods with visors and chrome
 * bezels, the pillar spotlight, amber indicators and roof markers, the
 * tail lights and the cab's red dome lamp; the beams in the air, soft
 * halos over the lenses, and baked light pools on the ground ahead and
 * behind, which move with the truck in place of real lights.
 */
export class EscapeTruckLamps {
  private readonly headlight = new THREE.MeshBasicMaterial({ name: 'truck_headlight', color: HEADLIGHT_DARK.clone(), toneMapped: false });
  private readonly tailLight = new THREE.MeshBasicMaterial({ name: 'truck_tail_light', color: TAIL_DARK.clone(), toneMapped: false });
  private readonly amber = new THREE.MeshBasicMaterial({ name: 'truck_amber_lamp', color: AMBER_DARK.clone(), toneMapped: false });
  private readonly beams: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly headPool: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly tailPool: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly headHalo: THREE.SpriteMaterial;
  private readonly tailHalo: THREE.SpriteMaterial;
  private readonly halos: THREE.Sprite[] = [];

  /** Lenses and housings go into `parts`; beams and halos ride the sprung `body`; the pools lie on the ground under `chassis`. */
  public constructor(parts: TruckPartBatch, materials: EscapeTruckMaterials, body: THREE.Object3D, chassis: THREE.Object3D) {
    this.buildHeadlamps(parts, materials);
    this.buildMarkers(parts, materials);
    this.beams = buildBeams();
    body.add(this.beams);
    const halo = makeSoftDotTexture();
    this.headHalo = haloMaterial(halo, HEADLIGHT_LIT);
    this.tailHalo = haloMaterial(halo, TAIL_LIT);
    for (const side of [-1, 1]) {
      this.addHalo(body, this.headHalo, side * HEADLIGHT.dx, HEADLIGHT.y, FRONT + HEADLIGHT.fromNose - 0.04, 1.4);
      this.addHalo(body, this.tailHalo, side * TAIL_LIGHT.dx, TAIL_LIGHT.y, REAR + 0.1, 0.55);
    }
    this.addHalo(body, this.headHalo, SPOTLIGHT.x, SPOTLIGHT.y, FRONT + SPOTLIGHT.fromNose - 0.12, 0.6);
    // The dome lamp's glow through the cab glass, on the tail lights' halo.
    this.addHalo(body, this.tailHalo, 0, DOME_LAMP.y - 0.03, FRONT + DOME_LAMP.fromNose, 0.45);
    const poolTexture = makeLightPoolTexture();
    this.headPool = buildPool('surface-truck-headlight-pool', poolTexture, HEADLIGHT_LIT, HEAD_POOL.width, HEAD_POOL.length, FRONT - HEAD_POOL.ahead - HEAD_POOL.length / 2, false);
    this.tailPool = buildPool('surface-truck-tail-pool', poolTexture, TAIL_LIT, TAIL_POOL.width, TAIL_POOL.length, REAR + 0.1 + TAIL_POOL.length / 2, true);
    chassis.add(this.headPool, this.tailPool);
  }

  /**
   * Lights everything to `level`; `poolFade` (0..1) dims the ground pools,
   * which have no fog and would glow on through it as the truck vanishes.
   */
  public light(level: number, poolFade: number): void {
    this.headlight.color.lerpColors(HEADLIGHT_DARK, HEADLIGHT_LIT, level);
    this.tailLight.color.lerpColors(TAIL_DARK, TAIL_LIT, level);
    this.amber.color.lerpColors(AMBER_DARK, AMBER_LIT, level);
    this.beams.material.opacity = BEAM.opacity * level;
    this.headHalo.opacity = 0.85 * level;
    this.tailHalo.opacity = 0.7 * level;
    this.headPool.material.opacity = HEAD_POOL.opacity * level * poolFade;
    this.tailPool.material.opacity = TAIL_POOL.opacity * level * poolFade;
    const lit = level > 0;
    this.beams.visible = lit;
    for (const halo of this.halos) halo.visible = lit;
    this.headPool.visible = lit && poolFade > 0;
    this.tailPool.visible = this.headPool.visible;
  }

  /** Round headlamps proud of the pods: housing, chrome bezel, lens and a visor over the top; the pillar spotlight. */
  private buildHeadlamps(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
    const lensAt = HEADLIGHT.fromNose;
    for (const side of [-1, 1]) {
      const x = side * HEADLIGHT.dx;
      parts.addFromNose(new THREE.CylinderGeometry(0.135, 0.15, 0.17, 16).rotateX(Math.PI / 2).translate(x, HEADLIGHT.y, lensAt + 0.09), materials.paint);
      parts.addFromNose(new THREE.TorusGeometry(0.128, 0.014, 4, 16).translate(x, HEADLIGHT.y, lensAt + 0.004), materials.darkSteel);
      parts.addFromNose(new THREE.CircleGeometry(0.122, 20).rotateY(Math.PI).translate(x, HEADLIGHT.y, lensAt), this.headlight);
      parts.addFromNose(
        new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2).translate(x, HEADLIGHT.y, lensAt - 0.02),
        materials.grime,
      );
    }
    parts.addFromNose(new THREE.CylinderGeometry(0.075, 0.085, 0.14, 12).rotateX(Math.PI / 2).translate(SPOTLIGHT.x, SPOTLIGHT.y, SPOTLIGHT.fromNose), materials.darkSteel);
    parts.addFromNose(new THREE.CircleGeometry(0.068, 14).rotateY(Math.PI).translate(SPOTLIGHT.x, SPOTLIGHT.y, SPOTLIGHT.fromNose - 0.071), this.headlight);
    parts.box(materials.darkSteel, SPOTLIGHT.fromNose + 0.05, SPOTLIGHT.y - 0.08, 0.14, 0.03, 0.04, SPOTLIGHT.x - 0.06);
  }

  /** Amber indicators on the face and flanks, three roof markers over the windscreen, the tail lights and the dome lamp. */
  private buildMarkers(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
    for (const side of [-1, 1]) {
      parts.addFromNose(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10).rotateX(Math.PI / 2).translate(side * 1.1, 1.56, CAB.front - 0.015), this.amber);
      parts.box(this.amber, 0.13, 1.46, 0.02, 0.05, 0.09, side * (CAB.halfWidth + 0.01));
      parts.box(this.tailLight, REAR - FRONT + 0.06, TAIL_LIGHT.y, 0.2, 0.1, 0.04, side * TAIL_LIGHT.dx);
      parts.box(this.amber, REAR - FRONT + 0.05, TAIL_LIGHT.y + 0.03, 0.06, 0.05, 0.03, side * (TAIL_LIGHT.dx + 0.17));
    }
    for (const x of [-0.4, 0, 0.4]) {
      parts.box(materials.darkSteel, CAB.screenTop.fromNose + 0.02, CAB.top + 0.02, 0.1, 0.05, 0.06, x);
      parts.box(this.amber, CAB.screenTop.fromNose - 0.015, CAB.top + 0.025, 0.08, 0.035, 0.01, x);
    }
    parts.box(materials.darkSteel, DOME_LAMP.fromNose, DOME_LAMP.y + 0.012, 0.16, 0.025, 0.1);
    // The red dome lamp shares the tail lights' lens.
    parts.box(this.tailLight, DOME_LAMP.fromNose, DOME_LAMP.y, 0.12, 0.01, 0.07);
  }

  private addHalo(parent: THREE.Object3D, material: THREE.SpriteMaterial, x: number, y: number, z: number, size: number): void {
    const halo = new THREE.Sprite(material);
    halo.position.set(x, y, z);
    halo.scale.setScalar(size);
    halo.visible = false;
    parent.add(halo);
    this.halos.push(halo);
  }
}

function haloMaterial(map: THREE.Texture, color: THREE.Color): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({ map, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}

/**
 * Two additive cones from the headlamps, a touch downwards, fading out
 * along their length through vertex colours: the light in the night air.
 */
function buildBeams(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const cones = [-1, 1].map((side) => {
    // Apex at the lamp, opening forward (-z).
    const cone = new THREE.ConeGeometry(BEAM.radius, BEAM.length, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, -BEAM.length / 2);
    const positions = cone.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let index = 0; index < positions.count; index++) {
      const fade = (1 - Math.min(1, -positions.getZ(index) / BEAM.length)) ** 1.6;
      colors.set([fade, fade, fade], index * 3);
    }
    cone.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return cone.rotateX(-BEAM.droop).translate(side * HEADLIGHT.dx, HEADLIGHT.y, FRONT + HEADLIGHT.fromNose - 0.02);
  });
  const geometry = mergeGeometries(cones);
  for (const cone of cones) cone.dispose();
  if (!geometry) throw new Error('Unable to merge the truck headlight beams');
  const beams = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    name: 'truck_headlight_beam',
    color: HEADLIGHT_LIT,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  }));
  beams.name = 'surface-truck-beams';
  beams.visible = false;
  return beams;
}

/** An additive light pool flat on the ground, its texture's far edge (v = 1) towards -z, or towards +z when `reversed`. */
function buildPool(
  name: string, texture: THREE.Texture, color: THREE.Color, width: number, length: number, z: number, reversed: boolean,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const geometry = new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2);
  if (reversed) geometry.rotateY(Math.PI);
  const pool = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
    name: `${name}-material`,
    map: texture,
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  }));
  pool.name = name;
  pool.position.set(0, POOL_Y, z);
  pool.renderOrder = 1;
  pool.visible = false;
  return pool;
}

/**
 * Brightness of a headlamp pool on the ground at (`across`, `along`):
 * `across` -1..1 over its width, `along` 0 at the lamps to 1 at its far
 * end. It widens as it reaches out, rises quickly off the bumper's shadow,
 * peaks a few metres ahead and fades into the distance.
 */
export function lightPoolIntensity(across: number, along: number): number {
  const reach = 0.38 + 0.62 * along;
  const lateral = 1 - THREE.MathUtils.smoothstep(Math.abs(across), reach * 0.45, reach);
  const rise = THREE.MathUtils.smoothstep(along, 0, 0.14);
  const fall = 1 - THREE.MathUtils.smoothstep(along, 0.35, 1);
  return lateral * rise * fall;
}

function makeLightPoolTexture(): THREE.DataTexture {
  const size = POOL_TEXTURE_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = Math.round(255 * lightPoolIntensity(((x + 0.5) / size) * 2 - 1, (y + 0.5) / size));
      const offset = (y * size + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
