import * as THREE from 'three';
import { ElectricArcRibbons, type ElectricArcStyle } from '../rendering/ElectricArcRibbons';
import { applyViewModelDepth } from '../rendering/ViewModelDepth';
import {
  createWeaponFinishUniforms, patchWeaponFinishShader, weaponFinishProgramKey,
  type WeaponFinishFrame, type WeaponFinishUniforms, type WeaponFinishVariant, type WeaponNebula,
} from './WeaponFinishShader';
import type { WeaponShotLooks } from './WeaponShotLook';

export type { WeaponNebula } from './WeaponFinishShader';

/**
 * A finish a weapon wears after a machine changes it (an upgrade): a nebula
 * drifting through its body, its bright steel turned to `trim`, optionally
 * arcs crackling over it and its shots restyled. Data only; maps own their
 * finishes.
 */
export interface WeaponFinish {
  readonly id: string;
  readonly nebula: WeaponNebula;
  readonly trim: number;
  readonly arcs: { readonly color: number; readonly count: number } | null;
  /** How the shots of a weapon wearing it look; absent keeps every weapon's own. */
  readonly shots?: WeaponShotLooks;
}

/** Body parts carry the nebula; trim is the bright steel (bolts, barrels, pins) framing it. */
export type WeaponFinishRole = 'body' | 'trim';

/** Bright machined steel stays as trim; parkerized receivers and furniture take the nebula. */
const TRIM_METALNESS = 0.88;
/** Points over the weapon the arcs jump between. */
const ARC_ANCHORS = 12;

type LitMaterial = THREE.MeshStandardMaterial;
type BeforeRender = THREE.Object3D['onBeforeRender'];

function isLit(material: THREE.Material): material is LitMaterial {
  return (material as LitMaterial).isMeshStandardMaterial === true;
}

/** What a weapon material becomes under a finish; null keeps it (unlit, see-through). */
export function weaponFinishRole(material: THREE.Material): WeaponFinishRole | null {
  if (!isLit(material) || material.transparent) return null;
  return material.metalness >= TRIM_METALNESS ? 'trim' : 'body';
}

export interface WeaponFinishOptions {
  /** Cheaper nebula (no domain warp) for devices on reduced effects. */
  readonly reducedEffects?: boolean;
  /** The finish spreads over the weapon with `setReveal` instead of covering it at once. */
  readonly paint?: boolean;
  /** The weapon is a first-person view: its arcs join the view model's depth range. */
  readonly firstPerson?: boolean;
  /** Source for the arcs' anchors and paths. */
  readonly random?: () => number;
}

interface DressedMesh {
  readonly material: THREE.Material;
  readonly role: WeaponFinishRole;
  readonly onBeforeRender: BeforeRender;
}

/**
 * Dresses one weapon in a finish and takes it off again. Body and trim
 * parts swap their materials for copies made once per finish (materials
 * shared with other weapons never change) that keep the originals' shader
 * patches and look until the finish covers them; unlit and see-through
 * parts (flashes, sights, lenses) and the `excluded` ones a view animates
 * itself (energy parts) keep theirs. Built lazily on the first finish;
 * `update` runs the nebula's clock and the arcs, `setReveal` the paint.
 */
export class WeaponFinishLayer {
  private readonly dressed = new Map<THREE.Mesh, DressedMesh>();
  private readonly copies = new Map<string, Map<THREE.Material, THREE.Material>>();
  private readonly uniforms = new Map<string, WeaponFinishUniforms>();
  private readonly frame: WeaponFinishFrame = {
    time: { value: 0 },
    frame: { value: new THREE.Matrix4() },
    reveal: { value: 1 },
    sweep: { value: new THREE.Vector4() },
  };
  /** Bounds of the dressed parts in the weapon's own frame. */
  private readonly extent = new THREE.Box3();
  private readonly trackFrame: BeforeRender;
  private readonly reducedEffects: boolean;
  private readonly paint: boolean;
  private readonly firstPerson: boolean;
  private readonly random: () => number;
  private arcs: ElectricArcRibbons | null = null;
  private current: WeaponFinish | null = null;

  public constructor(
    private readonly root: THREE.Object3D,
    private readonly excluded: ReadonlyArray<THREE.Material> = [],
    options: WeaponFinishOptions = {},
  ) {
    this.reducedEffects = options.reducedEffects ?? false;
    this.paint = options.paint ?? false;
    this.firstPerson = options.firstPerson ?? false;
    this.random = options.random ?? Math.random;
    if (this.paint) this.frame.reveal.value = 0;
    // Matrices are final when a part draws: the frame never lags the weapon.
    this.trackFrame = () => { this.frame.frame.value.copy(this.root.matrixWorld).invert(); };
  }

  /** Puts `finish` on (null takes any finish off). */
  public apply(finish: WeaponFinish | null): void {
    if ((finish?.id ?? null) === (this.current?.id ?? null)) return;
    if (this.dressed.size === 0 && finish) this.collect();
    for (const [mesh, original] of this.dressed) {
      mesh.material = finish ? this.copyOf(original, finish) : original.material;
      mesh.onBeforeRender = finish ? this.trackFrame : original.onBeforeRender;
    }
    this.current = finish;
    if (finish?.arcs) this.arcsFor(finish.arcs.count).mesh.material.color.setHex(finish.arcs.color);
    else this.arcs?.hide();
  }

  /** How far a painting finish has spread over the weapon, 0 (bare) to 1 (covered). */
  public setReveal(reveal: number): void {
    this.frame.reveal.value = THREE.MathUtils.clamp(reveal, 0, 1);
  }

  /** Advances the nebula and the arcs; `arcStrength` 0..1 dims the arcs (aiming down sights, painting). */
  public update(dt: number, arcStrength: number): void {
    if (!this.current) return;
    this.frame.time.value += dt;
    if (this.current.arcs) this.arcs?.update(dt, arcStrength);
  }

  private collect(): void {
    this.root.updateWorldMatrix(true, true);
    const toRoot = this.root.matrixWorld.clone().invert();
    const partBox = new THREE.Box3();
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || this.excluded.includes(mesh.material)) return;
      const role = weaponFinishRole(mesh.material);
      if (!role) return;
      this.dressed.set(mesh, { material: mesh.material, role, onBeforeRender: mesh.onBeforeRender });
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      partBox.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).applyMatrix4(toRoot);
      this.extent.union(partBox);
    });
    this.frame.sweep.value.copy(sweepAlong(this.extent));
  }

  private copyOf(original: DressedMesh, finish: WeaponFinish): THREE.Material {
    let byOriginal = this.copies.get(finish.id);
    if (!byOriginal) {
      byOriginal = new Map();
      this.copies.set(finish.id, byOriginal);
    }
    let copy = byOriginal.get(original.material);
    if (!copy) {
      copy = this.finishCopy(original.material as LitMaterial, original.role, finish);
      byOriginal.set(original.material, copy);
    }
    return copy;
  }

  /** The original with the finish's shader on top of its own patches; the shader paints, lights and polishes it. */
  private finishCopy(original: LitMaterial, role: WeaponFinishRole, finish: WeaponFinish): LitMaterial {
    let uniforms = this.uniforms.get(finish.id);
    if (!uniforms) {
      uniforms = createWeaponFinishUniforms(finish.nebula, finish.trim, this.frame);
      this.uniforms.set(finish.id, uniforms);
    }
    const variant: WeaponFinishVariant = { role, paint: this.paint, reducedEffects: this.reducedEffects };
    const copy = original.clone();
    copy.name = `${original.name}:${finish.id}`;
    const originalPatch = original.onBeforeCompile;
    copy.onBeforeCompile = (shader, renderer) => {
      originalPatch.call(original, shader, renderer);
      patchWeaponFinishShader(shader, uniforms, variant);
    };
    const key = `${original.customProgramCacheKey()}|${weaponFinishProgramKey(variant)}`;
    copy.customProgramCacheKey = () => key;
    return copy;
  }

  private arcsFor(count: number): ElectricArcRibbons {
    if (this.arcs) return this.arcs;
    const size = this.extent.getSize(new THREE.Vector3());
    const length = Math.max(size.x, size.y, size.z, 0.1);
    const style: ElectricArcStyle = {
      arcs: count,
      pointsPerArc: 8,
      rerollInterval: 0.06,
      halfWidth: length * 0.0045,
      jitter: length * 0.07,
      skinOffset: length * 0.015,
      color: 0xffffff,
      activeChance: 0.6,
    };
    this.arcs = new ElectricArcRibbons(this.sampleAnchors(), style, this.random);
    this.arcs.mesh.name = 'weapon-finish-arcs';
    if (this.firstPerson) applyViewModelDepth(this.arcs.mesh);
    this.root.add(this.arcs.mesh);
    return this.arcs;
  }

  /**
   * Anchors on random vertices of the dressed parts, weighted by their
   * vertex count, parented to their part so they ride the moving ones
   * (magazine, bolt) through reloads.
   */
  private sampleAnchors(): THREE.Object3D[] {
    const meshes = [...this.dressed.keys()];
    const total = meshes.reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
    const anchors: THREE.Object3D[] = [];
    if (total === 0) return anchors;
    for (let i = 0; i < ARC_ANCHORS; i++) {
      let pick = Math.floor(this.random() * total);
      const mesh = meshes.find((candidate) => {
        const count = candidate.geometry.getAttribute('position').count;
        if (pick < count) return true;
        pick -= count;
        return false;
      })!;
      const anchor = new THREE.Object3D();
      anchor.name = 'weapon-finish-anchor';
      anchor.position.fromBufferAttribute(mesh.geometry.getAttribute('position'), pick);
      mesh.add(anchor);
      anchors.push(anchor);
    }
    return anchors;
  }
}

/**
 * Sweep of the paint over `extent`: along its longest axis, from the
 * positive end (the stock of a weapon facing -Z) to the negative one, as
 * `dot(point, xyz) + w` running 0..1.
 */
function sweepAlong(extent: THREE.Box3): THREE.Vector4 {
  const size = extent.getSize(new THREE.Vector3());
  const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  const length = Math.max(size[axis], 1e-6);
  const sweep = new THREE.Vector4(0, 0, 0, extent.max[axis] / length);
  sweep[axis] = -1 / length;
  return sweep;
}
