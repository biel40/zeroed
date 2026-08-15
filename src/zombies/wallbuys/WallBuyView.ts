import * as THREE from 'three';
import type { WeaponDefinition } from '../../weapons/WeaponTypes';
import type { WallBuy } from './WallBuy';

const MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xd7dde0,
  emissive: 0xb9c8ce,
  emissiveIntensity: 1.15,
  roughness: 0.72,
  metalness: 0.08,
});

/** Lightweight luminous wall silhouette derived from the weapon's view dimensions. */
export class WallBuyView {
  readonly group = new THREE.Group();

  constructor(wallBuy: WallBuy, definition: WeaponDefinition, parent: THREE.Group) {
    const view = definition.view;
    const totalLength = view.stockLength + view.receiverLength + view.barrelLength;
    const scale = 1.35 / totalLength;
    const receiverLength = view.receiverLength * scale;
    const barrelLength = view.barrelLength * scale;
    const stockLength = view.stockLength * scale;
    const height = 0.16 * view.bulk;
    const receiverX = (stockLength - barrelLength) / 2;

    this.addPart(receiverLength, height, receiverX, 0);
    this.addPart(barrelLength, 0.045, receiverX + receiverLength / 2 + barrelLength / 2, 0.025);
    this.addPart(stockLength, height * 0.8, receiverX - receiverLength / 2 - stockLength / 2, -0.015);
    this.addPart(0.1, 0.34, receiverX - receiverLength * 0.12, -0.19, -0.22);
    this.addPart(0.16, 0.28, receiverX + receiverLength * 0.08, -0.19, 0.14);

    this.group.position.set(wallBuy.position.x, wallBuy.position.y, wallBuy.position.z);
    this.group.rotation.y = wallBuy.config.yaw;
    this.group.name = `wall-buy:${wallBuy.id}`;
    this.group.userData.mapRole = 'wall-buy';
    this.group.userData.weaponId = wallBuy.weaponId;
    parent.add(this.group);
  }

  private addPart(width: number, height: number, x: number, y: number, rotation = 0): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.025), MATERIAL);
    mesh.position.set(x, y, 0);
    mesh.rotation.z = rotation;
    this.group.add(mesh);
  }
}
