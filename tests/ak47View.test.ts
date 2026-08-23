import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { buildProceduralViewModel, buildWeaponDisplayModel } from '../src/weapons/WeaponView';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

/**
 * Contract tests for the procedural AK-47 (Type 3) view model. The old
 * Quaternius GLB read as an AKS-74U hybrid: blocky receiver, short barrel,
 * prism stock. The dedicated builder must produce the classic full-size
 * silhouette — fixed wood stock, two-piece handguard over a visible gas
 * tube, full-length barrel with a protected front post, tangent rear sight
 * and a pronounced banana magazine — with every piece under one root group.
 */

const definition = WEAPON_DEFINITIONS.ak47;
const SIGHT_Y = definition.view.sightHeight * definition.view.scale;

interface MeshBounds {
  name: string;
  center: THREE.Vector3;
  size: THREE.Vector3;
}

function meshBounds(root: THREE.Object3D): MeshBounds[] {
  root.updateMatrixWorld(true);
  const out: MeshBounds[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const box = new THREE.Box3().setFromObject(object);
      out.push({
        name: object.name,
        center: box.getCenter(new THREE.Vector3()),
        size: box.getSize(new THREE.Vector3()),
      });
    }
  });
  return out;
}

describe('AK-47 procedural view model', () => {
  it('dispatches to the dedicated builder through the shared entry point', () => {
    const built = buildProceduralViewModel(definition.view);
    expect(built.group.getObjectByName('ak47-receiver')).toBeTruthy();
  });

  it('lays out the classic full-size silhouette along -Z: butt → muzzle', () => {
    const built = buildProceduralViewModel(definition.view);
    const bounds = meshBounds(built.group);
    const stock = bounds.find((m) => m.name === 'ak47-stock')!;
    const receiver = bounds.find((m) => m.name === 'ak47-receiver')!;
    const lower = bounds.find((m) => m.name === 'ak47-handguard-lower')!;
    const barrel = bounds.find((m) => m.name === 'ak47-barrel')!;
    const grip = bounds.find((m) => m.name === 'ak47-grip')!;

    // stock → receiver → handguard → barrel, strictly rear to front.
    expect(stock.center.z).toBeGreaterThan(receiver.center.z);
    expect(receiver.center.z).toBeGreaterThan(lower.center.z);
    expect(lower.center.z).toBeGreaterThan(barrel.center.z);
    // The grip hangs below the receiver, behind the magazine well.
    expect(grip.center.y).toBeLessThan(receiver.center.y);
    expect(grip.center.z).toBeGreaterThan(0);
    // Full-size barrel: the exposed tube runs well past the handguard.
    expect(barrel.center.z - barrel.size.z / 2).toBeLessThan(lower.center.z - lower.size.z / 2);
  });

  it('joins every assembly: no floating pieces along the weapon spine', () => {
    const built = buildProceduralViewModel(definition.view);
    const bounds = meshBounds(built.group);
    // From butt to muzzle, consecutive spine pieces must overlap in Z.
    const spine = ['ak47-stock', 'ak47-receiver', 'ak47-handguard-lower', 'ak47-barrel']
      .map((n) => bounds.find((m) => m.name === n)!)
      .sort((a, b) => b.center.z - a.center.z);
    for (let i = 0; i < spine.length - 1; i++) {
      const rear = spine[i];
      const front = spine[i + 1];
      const rearFront = rear.center.z - rear.size.z / 2;
      const frontRear = front.center.z + front.size.z / 2;
      expect(frontRear).toBeGreaterThan(rearFront);
    }
  });

  it('runs a visible gas tube over the barrel, into the upper handguard', () => {
    const built = buildProceduralViewModel(definition.view);
    const bounds = meshBounds(built.group);
    const tube = bounds.find((m) => m.name === 'ak47-gas-tube')!;
    const barrel = bounds.find((m) => m.name === 'ak47-barrel')!;
    const upper = bounds.find((m) => m.name === 'ak47-handguard-upper')!;
    const gasBlock = bounds.find((m) => m.name === 'ak47-gas-block')!;

    // Tube above the bore line, handguard wood wrapping it mid-run.
    expect(tube.center.y).toBeGreaterThan(barrel.center.y);
    const upperFront = upper.center.z - upper.size.z / 2;
    const upperRear = upper.center.z + upper.size.z / 2;
    expect(tube.center.z - tube.size.z / 2).toBeLessThan(upperFront); // enters the gas block zone
    expect(tube.center.z + tube.size.z / 2).toBeGreaterThan(upperRear); // exits into the sight block
    // Gas block straddles barrel and tube ahead of the handguard.
    expect(gasBlock.center.z).toBeLessThan(upperFront);
    expect(gasBlock.center.y + gasBlock.size.y / 2).toBeGreaterThan(tube.center.y);
    expect(gasBlock.center.y - gasBlock.size.y / 2).toBeLessThan(barrel.center.y);
  });

  it('puts a protected front post at the muzzle, tip exactly on the sight line', () => {
    const built = buildProceduralViewModel(definition.view);
    const bounds = meshBounds(built.group);
    const barrel = bounds.find((m) => m.name === 'ak47-barrel')!;
    const post = bounds.find((m) => m.name === 'ak47-front-sight-post')!;
    const wings = bounds.filter((m) => m.name === 'ak47-front-sight-wing');

    // Post sits near the muzzle (not mid-barrel like an AKS-74U assembly).
    const muzzleZ = barrel.center.z - barrel.size.z / 2;
    expect(post.center.z).toBeLessThan(barrel.center.z);
    expect(post.center.z).toBeLessThan(muzzleZ + 0.08);
    expect(post.center.y + post.size.y / 2).toBeCloseTo(SIGHT_Y, 3);
    // Protected: a wing on each side, just below the post tip.
    expect(wings).toHaveLength(2);
    for (const wing of wings) {
      expect(wing.center.y + wing.size.y / 2).toBeLessThanOrEqual(SIGHT_Y + 1e-6);
      expect(Math.abs(wing.center.x)).toBeGreaterThan(0);
    }
  });

  it('carries a tangent rear sight whose notch rides the sight line', () => {
    const built = buildProceduralViewModel(definition.view);
    const bounds = meshBounds(built.group);
    const leaf = bounds.find((m) => m.name === 'ak47-tangent-leaf')!;
    const ears = bounds.filter((m) => m.name === 'ak47-tangent-ear');
    const handguard = bounds.find((m) => m.name === 'ak47-handguard-lower')!;

    // The tangent sits between receiver front and handguard rear.
    expect(leaf.center.z).toBeLessThan(0);
    expect(leaf.center.z).toBeGreaterThan(handguard.center.z - handguard.size.z / 2);
    expect(leaf.center.y).toBeGreaterThan(0.04);
    // Two ears leave the rear notch; nothing may rise above the post line.
    expect(ears).toHaveLength(2);
    for (const ear of ears) {
      expect(ear.center.y + ear.size.y / 2).toBeLessThanOrEqual(SIGHT_Y + 1e-6);
      expect(ear.center.y + ear.size.y / 2).toBeGreaterThan(SIGHT_Y - 0.012);
    }
  });

  it('keeps every part at or below the front-post sight line (clean ADS)', () => {
    const built = buildProceduralViewModel(definition.view);
    for (const m of meshBounds(built.group)) {
      expect(m.center.y + m.size.y / 2).toBeLessThanOrEqual(SIGHT_Y + 1e-3);
    }
  });

  it('hangs a strongly curved banana magazine from the well', () => {
    const built = buildProceduralViewModel(definition.view);
    const mag = built.group.getObjectByName('ak47-magazine') as THREE.Group;
    expect(mag).toBeTruthy();
    const segments = mag.children.filter((c) => c.name === 'ak47-magazine-segment');
    expect(segments.length).toBeGreaterThanOrEqual(4);

    mag.updateMatrixWorld(true);
    const centers = segments.map((s) => s.getWorldPosition(new THREE.Vector3()));
    // Each segment hangs lower AND further forward (-Z) than the previous:
    // the defining 7.62×39 banana curve.
    for (let i = 1; i < centers.length; i++) {
      expect(centers[i].y).toBeLessThan(centers[i - 1].y);
      expect(centers[i].z).toBeLessThan(centers[i - 1].z);
    }
    // Pronounced sweep: the floor plate sits well ahead of the feed lips.
    expect(centers[0].z - centers[centers.length - 1].z).toBeGreaterThan(0.08);
    // Well placement: ahead of the trigger guard, lips inside the receiver.
    expect(mag.position.z).toBeLessThan(0);
  });

  it('exposes the banana magazine and charging handle as live reload parts', () => {
    const built = buildProceduralViewModel(definition.view);
    expect(built.reloadParts?.magazine?.name).toBe('ak47-magazine');
    expect(built.reloadParts?.handle?.name).toBe('ak47-charging-handle');
    // The handle rides the right flank so the rock-and-lock rack reads.
    expect(built.reloadParts!.handle!.position.x).toBeGreaterThan(0);
  });

  it('reports the muzzle at the muzzle-nut tip, ahead of the barrel', () => {
    const built = buildProceduralViewModel(definition.view);
    const barrel = meshBounds(built.group).find((m) => m.name === 'ak47-barrel')!;
    const barrelTip = barrel.center.z - barrel.size.z / 2;
    expect(built.muzzlePosition.z).toBeLessThan(barrelTip);
    expect(built.muzzlePosition.y).toBeCloseTo(barrel.center.y, 2);
  });

  it('builds the same AK for world display models (Mystery Box, pickups)', () => {
    const display = buildWeaponDisplayModel(definition, null, 0.72);
    expect(display.getObjectByName('ak47-receiver')).toBeTruthy();
    expect(display.getObjectByName('ak47-stock')).toBeTruthy();
    expect(display.getObjectByName('ak47-magazine')).toBeTruthy();
    const size = new THREE.Box3().setFromObject(display).getSize(new THREE.Vector3());
    expect(size.z).toBeGreaterThan(size.x); // long gun, not a stub
  });
});

describe('AK-47 wall-buy silhouette', () => {
  it('renders the dedicated AK profile instead of the generic long-gun', () => {
    const parent = new THREE.Group();
    const buy = new WallBuy({
      id: 'test-ak47',
      weaponId: 'ak47',
      price: 300,
      ammoPrice: 150,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      floor: 0,
    });
    const view = new WallBuyView(buy, definition, parent);

    expect(view.group.userData.silhouette).toBe('ak47');
    // The required read: stock → receiver → curved mag → handguard/gas → barrel/post.
    expect(view.group.getObjectByName('ak47-stock')).toBeTruthy();
    expect(view.group.getObjectByName('ak47-receiver')).toBeTruthy();
    expect(view.group.getObjectByName('ak47-handguard')).toBeTruthy();
    expect(view.group.getObjectByName('ak47-gas-tube')).toBeTruthy();
    expect(view.group.getObjectByName('ak47-barrel')).toBeTruthy();
    expect(view.group.getObjectByName('ak47-front-sight')).toBeTruthy();
    expect(view.group.getObjectByName('ak47-tangent-sight')).toBeTruthy();

    // The magazine is a multi-plate banana, not one straight slab.
    const magPlates: THREE.Object3D[] = [];
    view.group.traverse((o) => {
      if (o.name === 'ak47-magazine') magPlates.push(o);
    });
    expect(magPlates.length).toBeGreaterThanOrEqual(3);
    view.group.updateMatrixWorld(true);
    const centers = magPlates.map((p) => p.getWorldPosition(new THREE.Vector3()));
    for (let i = 1; i < centers.length; i++) {
      expect(centers[i].y).toBeLessThan(centers[i - 1].y);
      expect(centers[i].x).toBeGreaterThan(centers[i - 1].x); // sweeps toward the muzzle
    }

    // Left-to-right order: stock (min x) → … → front sight / muzzle (max x).
    const box = new THREE.Box3().setFromObject(view.group);
    const stock = view.group.getObjectByName('ak47-stock')!;
    const post = view.group.getObjectByName('ak47-front-sight')!;
    const stockBox = new THREE.Box3().setFromObject(stock);
    const postBox = new THREE.Box3().setFromObject(post);
    expect(stockBox.min.x).toBeCloseTo(box.min.x, 3);
    expect(postBox.max.x).toBeGreaterThan(box.max.x - 0.12);
  });
});
