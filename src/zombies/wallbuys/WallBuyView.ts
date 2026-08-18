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
    if (view.frame === 'pistol') {
      this.buildPistolSilhouette();
      this.group.userData.silhouette = 'pistol';
    } else {
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
      this.group.userData.silhouette = 'long-gun';
    }

    this.group.position.set(wallBuy.position.x, wallBuy.position.y, wallBuy.position.z);
    this.group.rotation.y = wallBuy.config.yaw;
    this.group.name = `wall-buy:${wallBuy.id}`;
    this.group.userData.mapRole = 'wall-buy';
    this.group.userData.weaponId = wallBuy.weaponId;
    parent.add(this.group);
  }

  private buildPistolSilhouette(): void {
    this.addPart(0.72, 0.11, 0, 0.04).name = 'pistol-slide';
    this.addPart(0.46, 0.08, -0.05, -0.055).name = 'pistol-frame';
    this.addPart(0.035, 0.08, 0.375, 0.035).name = 'pistol-muzzle';
    this.addPart(0.18, 0.36, -0.2, -0.25, -0.2).name = 'pistol-grip';
    this.addPart(0.18, 0.035, 0.06, -0.12).name = 'pistol-trigger-guard';
    this.addPart(0.035, 0.13, 0.145, -0.175).name = 'pistol-trigger-guard';
    this.addPart(0.035, 0.1, -0.035, -0.16).name = 'pistol-trigger-guard';
    this.addPart(0.065, 0.06, -0.36, 0.09, -0.3).name = 'pistol-hammer';
    this.addPart(0.035, 0.035, 0.27, 0.11).name = 'pistol-front-sight';
    this.addPart(0.07, 0.035, -0.27, 0.11).name = 'pistol-rear-sight';
  }

  private addPart(width: number, height: number, x: number, y: number, rotation = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.025), MATERIAL);
    mesh.position.set(x, y, 0);
    mesh.rotation.z = rotation;
    this.group.add(mesh);
    return mesh;
  }
}
