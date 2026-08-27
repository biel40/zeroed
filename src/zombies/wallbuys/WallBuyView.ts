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
    if (definition.id === 'ak47') {
      this.buildAk47Silhouette();
      this.group.userData.silhouette = 'ak47';
    } else if (definition.id === 'm1911') {
      this.buildM1911Silhouette();
      this.group.userData.silhouette = 'm1911';
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

  /**
   * AK-47 profile: fixed stock (trapezoid with the sloped buttplate) →
   * receiver → curved banana magazine → two-piece handguard with the gas
   * line on top → full-length barrel ending at the protected front post.
   * Readable as an AK even as a flat untextured shape. +X is the muzzle.
   */
  private buildAk47Silhouette(): void {
    // Stock: extruded trapezoid so the butt reads deeper than the wrist.
    const shape = new THREE.Shape();
    shape.moveTo(-0.36, 0.03); // wrist top (overlaps the receiver rear)
    shape.lineTo(-0.655, -0.005); // buttplate top
    shape.lineTo(-0.64, -0.095); // buttplate bottom (angled)
    shape.lineTo(-0.36, -0.035); // wrist bottom
    shape.closePath();
    const stockGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.025,
      bevelEnabled: false,
    });
    stockGeometry.translate(0, 0, -0.0125);
    const stock = new THREE.Mesh(stockGeometry, MATERIAL);
    stock.name = 'ak47-stock';
    this.group.add(stock);

    this.addPart(0.34, 0.09, -0.19, -0.005).name = 'ak47-receiver';
    this.addPart(0.3, 0.03, -0.19, 0.05).name = 'ak47-dust-cover';
    this.addPart(0.07, 0.2, -0.31, -0.135, -0.3).name = 'ak47-grip';
    this.addPart(0.11, 0.02, -0.175, -0.065).name = 'ak47-trigger-guard';

    // Banana magazine: four plates stepping down-forward along the feed
    // curve — the pronounced 7.62 sweep is the strongest AK cue.
    let magX = -0.1;
    let magY = -0.05;
    const segH = 0.08;
    for (let i = 0; i < 4; i++) {
      const angle = 0.18 + (i + 0.5) * 0.17;
      const seg = this.addPart(0.07, segH, magX, magY - segH / 2, angle);
      seg.name = 'ak47-magazine';
      const next = 0.18 + (i + 1) * 0.17;
      magX += Math.sin(next) * segH;
      magY -= Math.cos(next) * segH;
    }

    this.addPart(0.33, 0.085, 0.145, 0.005).name = 'ak47-handguard';
    this.addPart(0.28, 0.035, 0.15, 0.0625).name = 'ak47-gas-tube';
    this.addPart(0.035, 0.08, 0.315, 0.045).name = 'ak47-gas-block';
    this.addPart(0.42, 0.028, 0.505, 0.028).name = 'ak47-barrel';
    this.addPart(0.04, 0.035, 0.72, 0.028).name = 'ak47-muzzle-nut';
    this.addPart(0.03, 0.05, 0.66, 0.055).name = 'ak47-front-sight-base';
    this.addPart(0.012, 0.045, 0.66, 0.09).name = 'ak47-front-sight';
    this.addPart(0.06, 0.035, -0.03, 0.075).name = 'ak47-tangent-sight';
  }

  /** Classic M1911A1 side profile. +X points toward the muzzle. */
  private buildM1911Silhouette(): void {
    const addShape = (shape: THREE.Shape, name: string): THREE.Mesh => {
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false });
      geometry.translate(0, 0, -0.0125);
      const mesh = new THREE.Mesh(geometry, MATERIAL);
      mesh.name = name;
      this.group.add(mesh);
      return mesh;
    };

    // Long, low Government slide with an almost square muzzle face.
    const slide = new THREE.Shape();
    slide.moveTo(-0.35, 0.012);
    slide.lineTo(-0.35, 0.092);
    slide.lineTo(0.365, 0.092);
    slide.lineTo(0.39, 0.078);
    slide.lineTo(0.39, 0.012);
    slide.closePath();
    addShape(slide, 'm1911-wall-slide');

    // Frame, round guard and rear-raked single-stack grip form one continuous
    // outline. The hole is deliberate: negative space makes the icon readable.
    const frame = new THREE.Shape();
    frame.moveTo(-0.34, 0.018);
    frame.lineTo(0.34, 0.018);
    frame.lineTo(0.34, -0.052);
    frame.lineTo(0.11, -0.075);
    frame.lineTo(0.105, -0.18);
    frame.lineTo(-0.075, -0.2);
    frame.lineTo(-0.1, -0.075);
    frame.lineTo(-0.2, -0.4);
    frame.lineTo(-0.36, -0.4);
    frame.lineTo(-0.26, -0.06);
    frame.lineTo(-0.39, -0.018);
    frame.closePath();
    const triggerOpening = new THREE.Path();
    triggerOpening.absellipse(0.005, -0.13, 0.078, 0.052, 0, Math.PI * 2, true);
    frame.holes.push(triggerOpening);
    addShape(frame, 'm1911-wall-frame');

    this.addPart(0.055, 0.045, -0.38, 0.055, -0.38).name = 'm1911-wall-spur-hammer';
    this.addPart(0.026, 0.025, 0.28, 0.104).name = 'm1911-wall-front-sight';
    this.addPart(0.05, 0.027, -0.27, 0.105).name = 'm1911-wall-rear-sight';
  }

  private addPart(width: number, height: number, x: number, y: number, rotation = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.025), MATERIAL);
    mesh.position.set(x, y, 0);
    mesh.rotation.z = rotation;
    this.group.add(mesh);
    return mesh;
  }
}
