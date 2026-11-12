import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WeaponFinishLayer, weaponFinishRole, type WeaponFinish, type WeaponFinishOptions } from '../src/weapons/WeaponFinish';
import { seededRandom } from '../src/zombies/maps/shared/ProceduralNoise';
import { applyViewModelDepth } from '../src/rendering/ViewModelDepth';
import { applySurfaceDetail, WEAPON_SURFACE_DETAIL } from '../src/rendering/SurfaceDetail';

const FINISH: WeaponFinish = {
  id: 'test',
  nebula: { deep: 0x0a0318, body: 0x3a0f8c, glow: 0xb32ee0, wisp: 0xffd6ff, scale: 7, flow: 0.12, glowStrength: 0.9 },
  trim: 0x17131f,
  arcs: { color: 0xc9a6ff, count: 4 },
};

/** Stands in for the view model's depth patch every view material carries. */
const DEPTH_MARK = '// view-model depth';
function markDepth(shader: { vertexShader: string }): void {
  shader.vertexShader += `\n${DEPTH_MARK}`;
}

type ShaderSource = THREE.WebGLProgramParametersWithUniforms;

function standardShader(): ShaderSource {
  return {
    vertexShader: THREE.ShaderLib.physical.vertexShader,
    fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    uniforms: {},
  } as unknown as ShaderSource;
}

function compile(material: THREE.Material): ShaderSource {
  const shader = standardShader();
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

interface View {
  root: THREE.Group;
  body: THREE.Mesh;
  bolt: THREE.Mesh;
  bodyMaterial: THREE.MeshStandardMaterial;
  boltMaterial: THREE.MeshStandardMaterial;
  flash: THREE.Mesh;
  energy: THREE.Mesh;
  lens: THREE.Mesh;
}

function makeView(): View {
  const root = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, metalness: 0.78 });
  const boltMaterial = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, metalness: 0.92 });
  for (const material of [bodyMaterial, boltMaterial]) material.onBeforeCompile = markDepth;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.05), bodyMaterial);
  const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), boltMaterial);
  bolt.position.set(0.05, 0.06, 0);
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
  const energy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ emissive: 0x00ff00 }));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.02), new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 }));
  root.add(body, bolt, flash, energy, lens);
  return { root, body, bolt, bodyMaterial, boltMaterial, flash, energy, lens };
}

function layerFor(view: View, options: WeaponFinishOptions = {}): WeaponFinishLayer {
  return new WeaponFinishLayer(view.root, [view.energy.material as THREE.Material], { random: seededRandom(4), ...options });
}

function arcsOf(root: THREE.Object3D): THREE.Object3D | undefined {
  return root.children.find((child) => child.name === 'weapon-finish-arcs');
}

describe('Weapon finish roles', () => {
  it('fills the body with the nebula, keeps bright steel as trim and leaves unlit or see-through parts alone', () => {
    expect(weaponFinishRole(new THREE.MeshStandardMaterial({ metalness: 0.78 }))).toBe('body');
    expect(weaponFinishRole(new THREE.MeshStandardMaterial({ metalness: 0 }))).toBe('body');
    expect(weaponFinishRole(new THREE.MeshStandardMaterial({ metalness: 0.92 }))).toBe('trim');
    expect(weaponFinishRole(new THREE.MeshStandardMaterial({ transparent: true }))).toBeNull();
    expect(weaponFinishRole(new THREE.MeshBasicMaterial())).toBeNull();
  });
});

describe('Weapon finish layer', () => {
  it('keeps Ultra Max surface detail and first-person depth when the forge adds its finish', () => {
    const view = makeView();
    applyViewModelDepth(view.root);
    applySurfaceDetail(view.root, WEAPON_SURFACE_DETAIL);
    const original = view.body.material as THREE.Material;
    const originalKey = original.customProgramCacheKey();
    const originalShader = compile(original);
    const layer = layerFor(view, { firstPerson: true });
    layer.apply(FINISH);
    const finished = view.body.material as THREE.Material;
    const shader = compile(finished);
    expect(shader.vertexShader).toContain('gl_Position.z = mix(');
    expect(shader.vertexShader).toContain('vSurfaceDetailPosition = position;');
    expect(shader.fragmentShader).toContain('surfaceDetailGradient');
    expect(shader.fragmentShader).toContain('finishNebula(');
    expect(shader.uniforms.uSurfaceDetailNoise).toBe(originalShader.uniforms.uSurfaceDetailNoise);
    expect(finished.customProgramCacheKey()).toContain(originalKey);
    layer.apply(null);
    expect(view.body.material).toBe(original);
    expect(compile(original).fragmentShader).not.toContain('finishNebula(');
  });

  it('dresses the body and trim in their own copies, leaves the rest and restores the originals', () => {
    const view = makeView();
    const flashMaterial = view.flash.material;
    const energyMaterial = view.energy.material;
    const lensMaterial = view.lens.material;
    const layer = layerFor(view);
    layer.apply(FINISH);
    const body = view.body.material as THREE.MeshStandardMaterial;
    const trim = view.bolt.material as THREE.MeshStandardMaterial;
    expect(body).not.toBe(view.bodyMaterial);
    expect(trim).not.toBe(view.boltMaterial);
    expect(view.bodyMaterial.color.getHex()).toBe(0x808080);
    expect(view.boltMaterial.color.getHex()).toBe(0xa0a0a0);
    expect(view.flash.material).toBe(flashMaterial);
    expect(view.energy.material).toBe(energyMaterial);
    expect(view.lens.material).toBe(lensMaterial);

    layer.apply(FINISH);
    expect(view.body.material).toBe(body);
    layer.apply(null);
    expect(view.body.material).toBe(view.bodyMaterial);
    expect(view.bolt.material).toBe(view.boltMaterial);
    layer.apply(FINISH);
    expect(view.body.material).toBe(body);
  });

  it('keeps the view-model depth patch and adds the flowing nebula to the body only', () => {
    const view = makeView();
    const layer = layerFor(view);
    layer.apply(FINISH);
    const body = compile(view.body.material as THREE.Material);
    expect(body.vertexShader).toContain(DEPTH_MARK);
    expect(body.vertexShader).toContain('vFinishCoord =');
    expect(body.fragmentShader).toContain('finishNebula(');
    expect(body.fragmentShader).toContain('totalEmissiveRadiance += finishGlow');
    expect(body.fragmentShader).toContain('#define FINISH_WARP');
    expect(body.uniforms.uFinishTime.value).toBe(0);

    expect(body.fragmentShader).not.toContain('#define FINISH_PAINT');

    const trim = compile(view.bolt.material as THREE.Material);
    expect(trim.vertexShader).toContain(DEPTH_MARK);
    expect(trim.fragmentShader).toContain('#define FINISH_TRIM');
    expect(trim.fragmentShader).not.toContain('#define FINISH_WARP');
    expect((trim.uniforms.uFinishTrim.value as THREE.Color).getHex()).toBe(FINISH.trim);

    layer.update(0.5, 1);
    layer.update(0.25, 1);
    expect(body.uniforms.uFinishTime.value).toBeCloseTo(0.75);
    expect((body.uniforms.uFinishGlow.value as THREE.Color).getHex()).toBe(FINISH.nebula.glow);
  });

  it('drops the domain warp on reduced effects, under its own program key', () => {
    const full = makeView();
    const reduced = makeView();
    layerFor(full).apply(FINISH);
    layerFor(reduced, { reducedEffects: true }).apply(FINISH);
    const fullMaterial = full.body.material as THREE.Material;
    const reducedMaterial = reduced.body.material as THREE.Material;
    expect(compile(reducedMaterial).fragmentShader).not.toContain('#define FINISH_WARP');
    expect(compile(reducedMaterial).fragmentShader).toContain('finishNebula(');
    expect(reducedMaterial.customProgramCacheKey()).not.toBe(fullMaterial.customProgramCacheKey());
  });

  it('maps the nebula in the weapon frame, so it sticks to the gun however the view moves', () => {
    const view = makeView();
    const layer = layerFor(view);
    const original = view.body.onBeforeRender;
    layer.apply(FINISH);
    const shader = compile(view.body.material as THREE.Material);
    view.root.position.set(0.2, -0.2, -0.4);
    view.root.rotation.set(0.3, -0.1, 0.2);
    view.root.updateMatrixWorld(true);
    const args = [{}, {}, {}, view.body.geometry, view.body.material, null] as unknown as Parameters<THREE.Object3D['onBeforeRender']>;
    view.body.onBeforeRender(...args);
    const product = (shader.uniforms.uFinishFrame.value as THREE.Matrix4).clone().multiply(view.root.matrixWorld);
    const identity = new THREE.Matrix4().elements;
    product.elements.forEach((value, index) => expect(value).toBeCloseTo(identity[index], 6));

    layer.apply(null);
    expect(view.body.onBeforeRender).toBe(original);
  });

  it('paints the finish on from one end of the weapon to the other as its reveal grows', () => {
    const view = makeView();
    const layer = layerFor(view, { paint: true });
    layer.apply(FINISH);
    const body = compile(view.body.material as THREE.Material);
    const trim = compile(view.bolt.material as THREE.Material);
    for (const shader of [body, trim]) expect(shader.fragmentShader).toContain('#define FINISH_PAINT');
    expect((view.body.material as THREE.Material).customProgramCacheKey())
      .not.toBe((() => { const plain = makeView(); layerFor(plain).apply(FINISH); return (plain.body.material as THREE.Material).customProgramCacheKey(); })());

    // The sweep runs along the weapon's longest axis (x here, 0.6 long), from its positive end.
    const sweep = body.uniforms.uFinishSweep.value as THREE.Vector4;
    const along = (x: number): number => x * sweep.x + sweep.w;
    expect(along(0.3)).toBeCloseTo(0, 6);
    expect(along(-0.3)).toBeCloseTo(1, 6);
    expect(sweep.y).toBe(0);
    expect(sweep.z).toBe(0);

    expect(body.uniforms.uFinishReveal.value).toBe(0);
    layer.setReveal(0.4);
    expect(body.uniforms.uFinishReveal.value).toBeCloseTo(0.4);
    expect(trim.uniforms.uFinishReveal).toBe(body.uniforms.uFinishReveal);
    layer.setReveal(3);
    expect(body.uniforms.uFinishReveal.value).toBe(1);
    layer.setReveal(-1);
    expect(body.uniforms.uFinishReveal.value).toBe(0);
  });

  it('draws first-person arcs in the view model depth range, and world arcs as they are', () => {
    const hand = makeView();
    const handLayer = layerFor(hand, { firstPerson: true });
    handLayer.apply(FINISH);
    const handArcs = arcsOf(hand.root) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(handArcs.material.onBeforeCompile).not.toBe(THREE.Material.prototype.onBeforeCompile);

    const shown = makeView();
    layerFor(shown, { paint: true }).apply(FINISH);
    const shownArcs = arcsOf(shown.root) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(shownArcs.material.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);
  });

  it('crackles arcs over the weapon while it wears a finish that has them, fainter on request', () => {
    const view = makeView();
    const layer = layerFor(view);
    layer.update(0.016, 1);
    expect(arcsOf(view.root)).toBeUndefined();

    layer.apply(FINISH);
    const arcs = arcsOf(view.root) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    expect(arcs).toBeDefined();
    expect(arcs.material.color.getHex()).toBe(FINISH.arcs!.color);
    layer.update(0.016, 1);
    expect(arcs.visible).toBe(true);
    const bright = arcs.material.opacity;
    layer.update(0.016, 0);
    expect(arcs.visible).toBe(false);
    layer.update(0.016, 0.25);
    expect(arcs.material.opacity).toBeLessThan(bright);

    layer.apply(null);
    layer.update(0.016, 1);
    expect(arcs.visible).toBe(false);
    layer.apply({ ...FINISH, id: 'calm', arcs: null });
    layer.update(0.016, 1);
    expect(arcs.visible).toBe(false);
  });
});
