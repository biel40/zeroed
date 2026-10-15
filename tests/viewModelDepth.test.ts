import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { applyViewModelDepth } from '../src/rendering/ViewModelDepth';
import { WeaponView } from '../src/weapons/WeaponView';

const originalDocument = globalThis.document;

beforeAll(() => {
  const context = {
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillStyle: '',
    fillRect: () => undefined,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({ width: 0, height: 0, getContext: () => context }),
    } as unknown as Document,
  });
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
  else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

function compiledVertex(material: THREE.Material): string {
  const shader = { vertexShader: 'void main() {\n#include <project_vertex>\n}' } as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader.vertexShader;
}

function materialsOf(root: THREE.Object3D): THREE.Material[] {
  const materials: THREE.Material[] = [];
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (material) materials.push(...(Array.isArray(material) ? material : [material]));
  });
  return materials;
}

describe('view model depth', () => {
  it('squeezes patched meshes into the near depth range', () => {
    const material = new THREE.MeshStandardMaterial();
    const root = new THREE.Group().add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    applyViewModelDepth(root);
    expect(compiledVertex(material)).toContain('gl_Position.z = mix(-gl_Position.w, gl_Position.z');
    // Dropped magazines clone view-model materials and must render as world.
    expect(compiledVertex(material.clone())).not.toContain('gl_Position.z');
  });

  it('keeps every first-person weapon part in front of walls', () => {
    const view = new WeaponView(WEAPON_DEFINITIONS.m60, null);
    const materials = materialsOf(view.root);
    expect(materials.length).toBeGreaterThan(0);
    for (const material of materials) expect(compiledVertex(material)).toContain('gl_Position.z');
  });
});
