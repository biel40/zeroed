import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { buildProceduralViewModel, buildWeaponDisplayModel } from '../src/weapons/WeaponView';

/**
 * Contract tests for the dedicated M60 view-model builder. The M60 has no
 * GLB (see ASSETS.md), so its first-person model is procedural — these tests
 * pin the detail bar (buildPistol tier, not the old generic 'box' fallback)
 * and the belt-reload contract the ReloadAnimator drives: left-hung ammo
 * box (magazine), rear-hinged feed cover (cover) and right-flank charging
 * handle (handle, racked +Z).
 */

const view = WEAPON_DEFINITIONS.m60.view;

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) count++;
  });
  return count;
}

describe('M60 dedicated view model', () => {
  it('opts into the lmg frame so the dispatch picks the dedicated builder', () => {
    expect(view.frame).toBe('lmg');
  });

  it('builds a buildPistol-tier mesh count, not the old box fallback', () => {
    const built = buildProceduralViewModel(view);
    // The retired generic 'box' branch produced ~15 meshes; the dedicated
    // builder (gas tube, bipod, carry handle, feed tray, stock details…)
    // lands in the same ~30 range as the M1911.
    expect(countMeshes(built.group)).toBeGreaterThanOrEqual(28);
  });

  it('exposes the full belt reload contract (magazine + cover + handle)', () => {
    const built = buildProceduralViewModel(view);
    const { magazine, cover, handle } = built.reloadParts ?? {};
    expect(magazine).toBeTruthy();
    expect(cover).toBeTruthy();
    expect(handle).toBeTruthy();
  });

  it('hangs the ammo box off the LEFT flank, below the receiver line', () => {
    const built = buildProceduralViewModel(view);
    const magazine = built.reloadParts?.magazine;
    expect(magazine).toBeTruthy();
    // Belt style racks it further left and down from this home pose.
    expect(magazine!.position.x).toBeLessThan(0);
    expect(magazine!.position.y).toBeLessThan(0);
    // The box carries visible detail (lid, belt rounds) as children.
    let children = 0;
    magazine!.traverse((object) => {
      if (object instanceof THREE.Mesh) children++;
    });
    expect(children).toBeGreaterThanOrEqual(4);
  });

  it('hinges the feed cover at the REAR with the plate extending forward', () => {
    const built = buildProceduralViewModel(view);
    const cover = built.reloadParts?.cover;
    expect(cover).toBeTruthy();
    // The animator drives cover.rotateX(-…): with the plate forward of the
    // pivot (-Z), that rotation swings the front edge up open.
    expect(cover!.children.length).toBeGreaterThan(0);
    expect(cover!.children[0].position.z).toBeLessThan(0);
  });

  it('puts the charging handle on the RIGHT flank', () => {
    const built = buildProceduralViewModel(view);
    const handle = built.reloadParts?.handle;
    expect(handle).toBeTruthy();
    expect(handle!.position.x).toBeGreaterThan(0);
  });

  it('aligns sight line, muzzle and ejection with the config geometry', () => {
    const built = buildProceduralViewModel(view);
    expect(built.sightY).toBeCloseTo(view.sightHeight * view.scale, 5);
    // Muzzle at (or past, with the flash hider) the barrel tip.
    const barrelTipZ = (-view.receiverLength / 2 - view.barrelLength) * view.scale;
    expect(built.muzzlePosition.z).toBeLessThanOrEqual(barrelTipZ + 1e-6);
    // The M60 barrel rides the top half of the receiver, above the origin.
    expect(built.muzzlePosition.y).toBeGreaterThan(0);
    // Ejection on the right flank.
    expect(built.ejectionPosition.x).toBeGreaterThan(0);
  });

  it('drives the Mystery Box display model through the same builder', () => {
    const display = buildWeaponDisplayModel(WEAPON_DEFINITIONS.m60, null);
    expect(countMeshes(display)).toBeGreaterThanOrEqual(28);
  });
});
