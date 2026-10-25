import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { PPSH41_PROFILE, ppsh41ShroudSlots } from '../src/weapons/PPSH41ViewModel';
import { STATION33_WALL_BUYS } from '../src/zombies/maps/Station33Config';
import { WallBuy } from '../src/zombies/wallbuys/WallBuy';
import { WallBuyView } from '../src/zombies/wallbuys/WallBuyView';

function buildWall(): WallBuyView {
  const config = STATION33_WALL_BUYS.find((buy) => buy.weaponId === 'ppsh41')!;
  const wall = new WallBuyView(new WallBuy({
    ...config, position: { x: 0, y: 0, z: 0 }, yaw: 0,
  }), WEAPON_DEFINITIONS.ppsh41, new THREE.Group());
  wall.group.updateMatrixWorld(true);
  return wall;
}

describe('PPSh-41 wall buy', () => {
  it('offers the PPSh in the former Vector location for 1250 points and 625 ammunition', () => {
    const buy = STATION33_WALL_BUYS.find((entry) => entry.weaponId === 'ppsh41');
    expect(buy).toMatchObject({
      id: 'vestibule-ppsh41', price: 1250, ammoPrice: 625,
      position: { y: 1.45, z: 2 }, yaw: -Math.PI / 2, floor: 0,
    });
    expect(STATION33_WALL_BUYS.some((entry) => entry.weaponId === 'vector')).toBe(false);
  });

  it('shows the wooden stock, vented jacket and narrow drum edge at a readable wall scale', () => {
    const wall = buildWall();
    expect(wall.group.userData.silhouette).toBe('ppsh41');
    for (const part of ['stock', 'receiver', 'trigger-guard', 'trigger', 'shroud', 'drum', 'front-sight', 'rear-sight']) {
      expect(wall.group.getObjectByName(`ppsh41-wall-${part}`), part).toBeDefined();
    }
    const size = new THREE.Box3().setFromObject(wall.group).getSize(new THREE.Vector3());
    expect(size.x).toBeGreaterThan(1.3);
    expect(size.x).toBeLessThan(1.4);
    expect(size.y).toBeLessThan(0.5);

    const drum = wall.group.getObjectByName('ppsh41-wall-drum')!;
    const drumSize = new THREE.Box3().setFromObject(drum).getSize(new THREE.Vector3());
    expect(drumSize.y).toBeGreaterThan(drumSize.x * 2.5);
    expect(drumSize.x).toBeCloseTo(PPSH41_PROFILE.magazine.depth * 1.6, 3);
    expect(drumSize.y).toBeCloseTo(PPSH41_PROFILE.magazine.radius * 2 * 1.6, 3);
  });

  it('cuts the cooling slots through the luminous jacket', () => {
    const wall = buildWall();
    const shroud = wall.group.getObjectByName('ppsh41-wall-shroud')!;
    const hits = (z: number, y: number): THREE.Intersection[] => new THREE.Raycaster(
      new THREE.Vector3(-(z + 0.0455) * 1.6, (y + 0.065) * 1.6, 0.1),
      new THREE.Vector3(0, 0, -1),
    ).intersectObject(shroud);

    for (const slot of ppsh41ShroudSlots()) {
      const z = slot.reduce((sum, point) => sum + point[0], 0) / slot.length;
      const y = slot.reduce((sum, point) => sum + point[1], 0) / slot.length;
      expect(hits(z, y)).toHaveLength(0);
    }
    const jacket = PPSH41_PROFILE.shroud;
    expect(hits((jacket.rearZ + jacket.frontZ) / 2, jacket.topY - 0.001).length).toBeGreaterThan(0);
  });
});
