import * as THREE from 'three';
import { AK47_PROFILE, ak47MagazineFloorplate, ak47MagazineOutline } from '../../weapons/AK47ViewModel';
import { L96_PROFILE } from '../../weapons/L96ViewModel';
import { M60_PROFILE, m60BipodLeg, m60FrontSight, m60HeatShieldSlots, m60LeafTop } from '../../weapons/M60ViewModel';
import { MP5_PROFILE } from '../../weapons/MP5ViewModel';
import { PPSH41_PROFILE, ppsh41ShroudSlots } from '../../weapons/PPSH41ViewModel';
import { VECTOR_PROFILE } from '../../weapons/VectorViewModel';
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
      this.buildAk47Silhouette(view.sightHeight);
      this.group.userData.silhouette = 'ak47';
    } else if (definition.id === 'm4a1') {
      this.buildM4A1Silhouette();
      this.group.userData.silhouette = 'm4a1';
    } else if (definition.id === 'mp5') {
      this.buildMP5Silhouette(view.sightHeight);
      this.group.userData.silhouette = 'mp5';
    } else if (definition.id === 'vector') {
      this.buildVectorSilhouette(view.sightHeight);
      this.group.userData.silhouette = 'vector';
    } else if (definition.id === 'ppsh41') {
      this.buildPPSH41Silhouette(view.sightHeight);
      this.group.userData.silhouette = 'ppsh41';
    } else if (definition.id === 'm1911') {
      this.buildM1911Silhouette();
      this.group.userData.silhouette = 'm1911';
    } else if (definition.id === 'l96') {
      this.buildL96Silhouette(view.sightHeight);
      this.group.userData.silhouette = 'l96';
    } else if (definition.id === 'm60') {
      this.buildM60Silhouette(view.sightHeight);
      this.group.userData.silhouette = 'm60';
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
   * AK-47 profile traced from the same AK47_PROFILE as the view model:
   * stock, grip, receiver with its dust cover, curved magazine, two-piece
   * handguard under the gas tube, barrel and eared front sight. +X points
   * toward the muzzle.
   */
  private buildAk47Silhouette(sightHeight: number): void {
    const scale = 1.55;
    const toWall = ([z, y]: readonly [number, number]): THREE.Vector2 =>
      new THREE.Vector2(-(z + 0.095) * scale, (y + 0.06) * scale);
    const outline = (points: ReadonlyArray<readonly [number, number]>): THREE.Shape => new THREE.Shape(points.map(toWall));
    const rect = (rearZ: number, frontZ: number, topY: number, bottomY: number): THREE.Shape =>
      outline([[rearZ, topY], [frontZ, topY], [frontZ, bottomY], [rearZ, bottomY]]);
    const profile = AK47_PROFILE;

    this.addShape(outline(profile.stock), 'ak47-wall-stock');
    this.addShape(outline(profile.buttplate), 'ak47-wall-buttplate');
    this.addShape(outline(profile.grip), 'ak47-wall-grip');
    this.addShape(outline(profile.receiver), 'ak47-wall-receiver');
    const cover = profile.dustCover;
    this.addShape(outline([
      [cover.rearZ, cover.bottomY], [cover.rearZ, cover.topY - 0.006], [cover.rearZ - 0.008, cover.topY],
      [cover.frontZ, cover.topY], [cover.frontZ, cover.bottomY],
    ]), 'ak47-wall-dust-cover');
    const guard = outline(profile.triggerGuard);
    guard.holes.push(new THREE.Path(profile.triggerOpening.map(toWall)));
    this.addShape(guard, 'ak47-wall-trigger-guard');

    const mag = profile.magazine;
    const toWeapon = ([z, y]: readonly [number, number]): readonly [number, number] => [z + mag.wellZ, y + mag.wellY];
    this.addShape(outline(ak47MagazineOutline().map(toWeapon)), 'ak47-wall-magazine');
    this.addShape(outline(ak47MagazineFloorplate().map(toWeapon)), 'ak47-wall-magazine');

    this.addShape(outline(profile.rearSightBlock), 'ak47-wall-rear-sight');
    const leaf = profile.tangentLeaf;
    this.addShape(outline([[leaf.notchZ, sightHeight], [leaf.hingeZ, leaf.hingeY + 0.003], [leaf.hingeZ, 0.028], [leaf.notchZ, 0.028]]), 'ak47-wall-rear-sight');
    this.addShape(outline(profile.upperHandguard), 'ak47-wall-handguard');
    this.addShape(outline(profile.lowerHandguard), 'ak47-wall-handguard');
    const tube = profile.gasTube;
    this.addShape(rect(tube.rearZ, tube.frontZ, tube.y + tube.radius, tube.y - tube.radius), 'ak47-wall-gas-tube');
    this.addShape(outline(profile.gasBlock), 'ak47-wall-gas-block');

    const barrel = profile.barrel;
    this.addShape(outline([
      [barrel.rearZ, barrel.rearRadius], [barrel.frontZ, barrel.frontRadius],
      [barrel.frontZ, -barrel.frontRadius], [barrel.rearZ, -barrel.rearRadius],
    ]), 'ak47-wall-barrel');
    const nut = profile.muzzleNut;
    this.addShape(rect(nut.rearZ, nut.frontZ, nut.radius, -nut.radius), 'ak47-wall-barrel');
    this.addShape(outline(profile.frontSightTower), 'ak47-wall-front-sight');
    this.addShape(outline(profile.frontSightEar), 'ak47-wall-front-sight');
    this.addShape(rect(-0.474, -0.52, 0.0125, -0.024), 'ak47-wall-front-sight');
  }

  private buildM4A1Silhouette(): void {
    const stock = new THREE.Shape();
    stock.moveTo(-0.78, 0.04);
    stock.lineTo(-0.49, 0.045);
    stock.lineTo(-0.4, 0.005);
    stock.lineTo(-0.48, -0.055);
    stock.lineTo(-0.67, -0.135);
    stock.lineTo(-0.76, -0.13);
    stock.closePath();
    const stockOpening = new THREE.Path();
    stockOpening.moveTo(-0.68, 0.005);
    stockOpening.lineTo(-0.51, 0.01);
    stockOpening.lineTo(-0.47, -0.012);
    stockOpening.lineTo(-0.65, -0.072);
    stockOpening.closePath();
    stock.holes.push(stockOpening);
    this.addShape(stock, 'm4a1-wall-stock');

    this.addPart(0.25, 0.028, -0.37, 0.012).name = 'm4a1-wall-buffer-tube';
    this.addPart(0.44, 0.085, -0.07, 0.025).name = 'm4a1-wall-upper-receiver';

    const lower = new THREE.Shape();
    lower.moveTo(-0.29, 0.012);
    lower.lineTo(0.15, 0.012);
    lower.lineTo(0.12, -0.075);
    lower.lineTo(-0.03, -0.095);
    lower.lineTo(-0.23, -0.075);
    lower.closePath();
    this.addShape(lower, 'm4a1-wall-lower-receiver');

    const carryHandle = new THREE.Shape();
    carryHandle.moveTo(-0.24, 0.066);
    carryHandle.lineTo(0.09, 0.066);
    carryHandle.lineTo(0.055, 0.137);
    carryHandle.lineTo(-0.18, 0.137);
    carryHandle.closePath();
    const handleOpening = new THREE.Path();
    handleOpening.absellipse(-0.07, 0.103, 0.09, 0.019, 0, Math.PI * 2, true);
    carryHandle.holes.push(handleOpening);
    this.addShape(carryHandle, 'm4a1-wall-carry-handle');

    this.addPart(0.065, 0.205, -0.18, -0.17, -0.3).name = 'm4a1-wall-pistol-grip';

    const magazine = new THREE.Shape();
    magazine.moveTo(-0.005, -0.065);
    magazine.lineTo(0.09, -0.065);
    magazine.lineTo(0.125, -0.325);
    magazine.lineTo(0.025, -0.345);
    magazine.closePath();
    this.addShape(magazine, 'm4a1-wall-stanag-magazine');

    this.addPart(0.43, 0.03, 0.365, 0.02).name = 'm4a1-wall-handguard';
    for (let index = 0; index < 6; index++) {
      this.addPart(0.052, 0.105, 0.177 + index * 0.075, 0.02).name = 'm4a1-wall-handguard-rib';
    }

    const frontSight = new THREE.Shape();
    frontSight.moveTo(0.55, 0.055);
    frontSight.lineTo(0.68, 0.055);
    frontSight.lineTo(0.63, 0.185);
    frontSight.lineTo(0.622, 0.23);
    frontSight.lineTo(0.607, 0.23);
    frontSight.lineTo(0.6, 0.185);
    frontSight.closePath();
    const sightOpening = new THREE.Path();
    sightOpening.moveTo(0.575, 0.07);
    sightOpening.lineTo(0.655, 0.07);
    sightOpening.lineTo(0.615, 0.165);
    sightOpening.closePath();
    frontSight.holes.push(sightOpening);
    this.addShape(frontSight, 'm4a1-wall-front-sight');

    this.addPart(0.4, 0.024, 0.81, 0.025).name = 'm4a1-wall-barrel';
    this.addPart(0.09, 0.035, 1.055, 0.025).name = 'm4a1-wall-flash-hider';
  }

  /**
   * MP5A3 profile traced from the same MP5_PROFILE as the view model:
   * retractable stock, receiver with cocking tube, drum rear sight, grip,
   * curved magazine, slim handguard, hooded front sight and the three-lug
   * barrel. +X points toward the muzzle.
   */
  private buildMP5Silhouette(sightHeight: number): void {
    const scale = 1.9;
    const toWall = ([z, y]: readonly [number, number]): THREE.Vector2 =>
      new THREE.Vector2(-(z + 0.04) * scale, (y + 0.065) * scale);
    const outline = (points: ReadonlyArray<readonly [number, number]>): THREE.Shape => new THREE.Shape(points.map(toWall));
    const rect = (rearZ: number, frontZ: number, topY: number, bottomY: number): THREE.Shape =>
      outline([[rearZ, topY], [frontZ, topY], [frontZ, bottomY], [rearZ, bottomY]]);
    const profile = MP5_PROFILE;

    this.addShape(outline(profile.butt), 'mp5-wall-stock');
    const strut = profile.strut;
    this.addShape(rect(strut.rearZ, strut.frontZ, strut.y + strut.radius, strut.y - strut.radius), 'mp5-wall-stock');
    this.addShape(outline(profile.receiver), 'mp5-wall-receiver');
    const upper = profile.receiverTube;
    this.addShape(rect(upper.rearZ, upper.frontZ, upper.y + upper.radius, upper.y - upper.radius), 'mp5-wall-receiver');
    const tube = profile.cockingTube;
    this.addShape(rect(tube.rearZ, tube.frontZ, tube.y + tube.radius, tube.y - tube.radius), 'mp5-wall-receiver');
    this.addShape(outline(profile.housing), 'mp5-wall-lower');
    this.addShape(outline(profile.grip), 'mp5-wall-grip');
    this.addShape(outline(profile.triggerGuard), 'mp5-wall-trigger-guard');

    const [, seatY, seatZ] = profile.magazine.seat;
    this.addShape(outline(profile.magazine.outline.map(([z, y]) => [z + seatZ, y + seatY] as const)), 'mp5-wall-magazine');
    this.addShape(outline(profile.handguard), 'mp5-wall-handguard');

    const rear = profile.rearSight;
    this.addShape(rect(rear.z + 0.015, rear.z - 0.015, sightHeight + 0.004, 0.047), 'mp5-wall-rear-sight');
    this.addShape(outline(profile.frontSightBlock), 'mp5-wall-front-sight');
    const hood = toWall([profile.frontSightZ, sightHeight - 0.002]);
    const ring = new THREE.Shape();
    ring.absarc(hood.x, hood.y, (profile.hoodRadius + 0.003) * scale, 0, Math.PI * 2, false);
    const opening = new THREE.Path();
    opening.absarc(hood.x, hood.y, (profile.hoodRadius - 0.002) * scale, 0, Math.PI * 2, true);
    ring.holes.push(opening);
    this.addShape(ring, 'mp5-wall-front-sight');

    const { boreY } = profile;
    const barrel = profile.barrel;
    this.addShape(rect(barrel.rearZ, barrel.muzzleZ, boreY + barrel.radius, boreY - barrel.radius), 'mp5-wall-barrel');
    const lug = profile.triLug;
    this.addShape(rect(lug.rearZ, lug.frontZ, boreY + lug.radius, boreY - lug.radius), 'mp5-wall-barrel');
  }

  /**
   * KRISS Vector profile traced from the same VECTOR_PROFILE as the view
   * model: adjustable stock on its tube, railed upper, the "Super V" lower
   * with its open guard, grip, long straight magazine, folding sights and
   * the birdcage flash hider. +X points toward the muzzle.
   */
  private buildVectorSilhouette(sightHeight: number): void {
    const scale = 2;
    const toWall = ([z, y]: readonly [number, number]): THREE.Vector2 =>
      new THREE.Vector2(-(z + 0.025) * scale, (y + 0.09) * scale);
    const outline = (points: ReadonlyArray<readonly [number, number]>): THREE.Shape => new THREE.Shape(points.map(toWall));
    const rect = (rearZ: number, frontZ: number, topY: number, bottomY: number): THREE.Shape =>
      outline([[rearZ, topY], [frontZ, topY], [frontZ, bottomY], [rearZ, bottomY]]);
    const profile = VECTOR_PROFILE;

    this.addShape(outline(profile.stock), 'vector-wall-stock');
    const tube = profile.stockTube;
    this.addShape(rect(tube.rearZ, tube.frontZ, tube.y + tube.radius, tube.y - tube.radius), 'vector-wall-stock');
    this.addShape(outline(profile.upper), 'vector-wall-upper');
    const rail = profile.rail;
    this.addShape(rect(rail.rearZ, rail.frontZ, rail.topY, rail.baseY - 0.001), 'vector-wall-rail');
    const lower = outline(profile.lower);
    lower.holes.push(new THREE.Path(profile.triggerOpening.map(toWall)));
    this.addShape(lower, 'vector-wall-lower');
    this.addShape(outline(profile.grip), 'vector-wall-grip');

    const [, seatY, seatZ] = profile.magazine.seat;
    const toSeat = ([z, y]: readonly [number, number]) => [z + seatZ, y + seatY] as const;
    this.addShape(outline(profile.magazine.outline.map(toSeat)), 'vector-wall-magazine');
    this.addShape(outline(profile.magazine.floorplate.map(toSeat)), 'vector-wall-magazine');

    for (const z of [profile.frontSightZ, profile.rearSightZ]) {
      this.addShape(rect(z + 0.008, z - 0.008, sightHeight + 0.004, rail.topY - 0.001), 'vector-wall-sight');
    }
    const hider = profile.flashHider;
    this.addShape(rect(hider.rearZ + 0.002, hider.frontZ, profile.boreY + hider.radius, profile.boreY - hider.radius), 'vector-wall-flash-hider');
  }

  /** Wooden stock, perforated jacket and drum from the first-person PPSh-41 profile. */
  private buildPPSH41Silhouette(sightHeight: number): void {
    const scale = 1.6;
    const toWall = ([z, y]: readonly [number, number]): THREE.Vector2 =>
      new THREE.Vector2(-(z + 0.0455) * scale, (y + 0.065) * scale);
    const outline = (points: ReadonlyArray<readonly [number, number]>): THREE.Shape => new THREE.Shape(points.map(toWall));
    const rect = (rearZ: number, frontZ: number, topY: number, bottomY: number): THREE.Shape =>
      outline([[rearZ, topY], [frontZ, topY], [frontZ, bottomY], [rearZ, bottomY]]);
    const profile = PPSH41_PROFILE;

    this.addShape(outline(profile.stock), 'ppsh41-wall-stock');
    this.addShape(outline(profile.receiver), 'ppsh41-wall-receiver');
    const guard = outline(profile.triggerGuard);
    guard.holes.push(new THREE.Path(profile.triggerOpening.map(toWall)));
    this.addShape(guard, 'ppsh41-wall-trigger-guard');
    this.addShape(outline(profile.trigger), 'ppsh41-wall-trigger');

    const shroud = profile.shroud;
    const jacket = rect(shroud.rearZ, shroud.frontZ, shroud.topY, shroud.bottomY);
    for (const slot of ppsh41ShroudSlots()) jacket.holes.push(new THREE.Path(slot.map(toWall)));
    this.addShape(jacket, 'ppsh41-wall-shroud');

    const magazine = profile.magazine;
    const drumCenterY = magazine.seat[1] + magazine.centerY;
    // The drum's circular faces point along the bore. From the flank its
    // narrow edge hangs below the receiver, rather than a circular disc.
    const rearZ = magazine.seat[2] + magazine.depth / 2;
    const frontZ = magazine.seat[2] - magazine.depth / 2;
    const topY = drumCenterY + magazine.radius;
    const bottomY = drumCenterY - magazine.radius;
    const bevel = 0.004;
    this.addShape(outline([
      [rearZ - bevel, topY], [frontZ + bevel, topY], [frontZ, topY - bevel], [frontZ, bottomY + bevel],
      [frontZ + bevel, bottomY], [rearZ - bevel, bottomY], [rearZ, bottomY + bevel], [rearZ, topY - bevel],
    ]), 'ppsh41-wall-drum');
    this.addShape(rect(magazine.seat[2] + 0.019, magazine.seat[2] - 0.019, -0.02, drumCenterY), 'ppsh41-wall-magazine-neck');

    this.addShape(rect(profile.rearSightZ + 0.014, profile.rearSightZ - 0.014, sightHeight + 0.003, 0.02), 'ppsh41-wall-rear-sight');
    this.addShape(rect(profile.frontSightZ + 0.008, profile.frontSightZ - 0.008, sightHeight + profile.hoodRadius, shroud.topY), 'ppsh41-wall-front-sight');
  }

  /** Classic M1911A1 side profile. +X points toward the muzzle. */
  private buildM1911Silhouette(): void {
    // Long, low Government slide with an almost square muzzle face.
    const slide = new THREE.Shape();
    slide.moveTo(-0.35, 0.012);
    slide.lineTo(-0.35, 0.092);
    slide.lineTo(0.365, 0.092);
    slide.lineTo(0.39, 0.078);
    slide.lineTo(0.39, 0.012);
    slide.closePath();
    this.addShape(slide, 'm1911-wall-slide');

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
    this.addShape(frame, 'm1911-wall-frame');

    this.addPart(0.055, 0.045, -0.38, 0.055, -0.38).name = 'm1911-wall-spur-hammer';
    this.addPart(0.026, 0.025, 0.28, 0.104).name = 'm1911-wall-front-sight';
    this.addPart(0.05, 0.027, -0.27, 0.105).name = 'm1911-wall-rear-sight';
  }

  /**
   * L96A1 profile traced from the same L96_PROFILE as the view model:
   * thumbhole stock, action, long barrel, scope with both bells, bolt knob,
   * box magazine and folded bipod. +X points toward the muzzle.
   */
  private buildL96Silhouette(sightHeight: number): void {
    const scale = 1.45;
    const toWall = ([z, y]: readonly [number, number]): THREE.Vector2 =>
      new THREE.Vector2(-(z + 0.23) * scale, (y + 0.03) * scale);
    const outline = (points: ReadonlyArray<readonly [number, number]>): THREE.Shape => new THREE.Shape(points.map(toWall));
    const rect = (rearZ: number, frontZ: number, topY: number, bottomY: number): THREE.Shape =>
      outline([[rearZ, topY], [frontZ, topY], [frontZ, bottomY], [rearZ, bottomY]]);

    const stock = outline(L96_PROFILE.stock);
    stock.holes.push(new THREE.Path(L96_PROFILE.thumbhole.map(toWall)));
    const opening = L96_PROFILE.triggerOpening;
    const center = toWall([opening.z, opening.y]);
    const guard = new THREE.Path();
    guard.absellipse(center.x, center.y, opening.radiusZ * scale, opening.radiusY * scale, 0, Math.PI * 2, true);
    stock.holes.push(guard);
    this.addShape(stock, 'l96-wall-stock');
    this.addShape(rect(0.338, 0.358, 0.018, -0.13), 'l96-wall-buttpad');
    this.addShape(outline(L96_PROFILE.receiver), 'l96-wall-receiver');

    const barrel = L96_PROFILE.barrel;
    this.addShape(outline([
      [barrel.rearZ, barrel.rearRadius], [barrel.muzzleZ, barrel.muzzleRadius],
      [barrel.muzzleZ, -barrel.muzzleRadius], [barrel.rearZ, -barrel.rearRadius],
    ]), 'l96-wall-barrel');

    const scope = L96_PROFILE.scope;
    this.addShape(outline([
      ...scope.map(([radius, z]) => [z, sightHeight + radius] as const),
      ...[...scope].reverse().map(([radius, z]) => [z, sightHeight - radius] as const),
    ]), 'l96-wall-scope');
    const turretZ = L96_PROFILE.turretZ;
    this.addShape(rect(turretZ + 0.0135, turretZ - 0.0135, sightHeight + 0.042, sightHeight), 'l96-wall-turret');
    for (const z of L96_PROFILE.ringZ) this.addShape(rect(z + 0.008, z - 0.008, sightHeight, 0.02), 'l96-wall-scope-mount');

    const knob = L96_PROFILE.boltKnob;
    this.addShape(rect(0.115, 0.07, 0.012, -0.012), 'l96-wall-bolt-shroud');
    this.addShape(outline([[0.055, 0.004], [knob.z, knob.y + 0.004], [knob.z, knob.y - 0.004], [0.055, -0.004]]), 'l96-wall-bolt-handle');
    const knobCenter = toWall([knob.z, knob.y]);
    const knobShape = new THREE.Shape();
    knobShape.absarc(knobCenter.x, knobCenter.y, knob.radius * scale, 0, Math.PI * 2, false);
    this.addShape(knobShape, 'l96-wall-bolt-knob');

    const magazine = L96_PROFILE.magazine;
    this.addShape(rect(magazine.z + magazine.depth / 2, magazine.z - magazine.depth / 2, -0.05, magazine.bottomY), 'l96-wall-magazine');
    const bipod = L96_PROFILE.bipod;
    this.addShape(rect(bipod.mountZ + 0.017, bipod.mountZ - 0.017, -0.044, -0.066), 'l96-wall-bipod');
    this.addShape(rect(bipod.mountZ, bipod.footZ, bipod.legY + 0.006, bipod.legY - 0.006), 'l96-wall-bipod');
  }

  /**
   * M60 profile traced from the same M60_PROFILE as the view model: fluted
   * butt, grip, receiver with its feed cover and raised rear leaf, belt
   * pouch, ribbed forearm under the slotted heat shield, gas cylinder, tall
   * front sight, slotted flash hider and the bipod deployed like the
   * reference photo. +X points toward the muzzle.
   */
  private buildM60Silhouette(sightHeight: number): void {
    const scale = 1.27;
    const toWall = ([z, y]: readonly [number, number]): THREE.Vector2 =>
      new THREE.Vector2(-(z + 0.232) * scale, (y + 0.1) * scale);
    const outline = (points: ReadonlyArray<readonly [number, number]>): THREE.Shape => new THREE.Shape(points.map(toWall));
    const hole = (points: ReadonlyArray<readonly [number, number]>): THREE.Path => new THREE.Path(points.map(toWall));
    const rect = (rearZ: number, frontZ: number, topY: number, bottomY: number): [number, number][] =>
      [[rearZ, topY], [frontZ, topY], [frontZ, bottomY], [rearZ, bottomY]];
    const profile = M60_PROFILE;

    this.addShape(outline(profile.stock), 'm60-wall-stock');
    this.addShape(outline(profile.grip), 'm60-wall-grip');
    this.addShape(outline(profile.receiver), 'm60-wall-receiver');
    this.addShape(outline(profile.cover), 'm60-wall-feed-cover');
    this.addShape(outline(profile.coverLatch), 'm60-wall-feed-cover');
    this.addShape(outline(profile.rearSightBase), 'm60-wall-rear-sight');
    const leaf = profile.rearSightLeaf;
    this.addShape(outline(rect(leaf.z + 0.008, leaf.z - 0.008, m60LeafTop(sightHeight), leaf.bottomY)), 'm60-wall-rear-sight');
    const guard = outline(profile.triggerGuard);
    guard.holes.push(hole(profile.triggerOpening));
    this.addShape(guard, 'm60-wall-trigger-guard');
    this.addShape(outline(profile.trigger), 'm60-wall-trigger-guard');

    const bag = profile.pouch;
    const [rearZ, frontZ] = [bag.z + bag.depth / 2, bag.z - bag.depth / 2];
    const [topY, bottomY] = [bag.y + bag.height / 2, bag.y - bag.height / 2];
    this.addShape(outline([
      [rearZ, topY], [frontZ, topY], [frontZ - 0.003, topY - 0.008], [frontZ - 0.003, bottomY + 0.008],
      [frontZ + 0.006, bottomY], [rearZ - 0.006, bottomY], [rearZ, bottomY + 0.008],
    ]), 'm60-wall-pouch');

    this.addShape(outline(profile.forearm), 'm60-wall-forearm');
    const shield = outline(profile.heatShield);
    for (const slot of m60HeatShieldSlots()) shield.holes.push(hole(slot));
    this.addShape(shield, 'm60-wall-heat-shield');

    const barrel = profile.barrel;
    const shieldFrontZ = Math.min(...profile.heatShield.map(([z]) => z));
    this.addShape(outline([
      [shieldFrontZ, barrel.rearRadius], [barrel.frontZ, barrel.frontRadius],
      [barrel.frontZ, -barrel.frontRadius], [shieldFrontZ, -barrel.rearRadius],
    ]), 'm60-wall-barrel');
    const band = profile.barrelBand;
    this.addShape(outline(rect(band.rearZ, band.frontZ, band.radius, -band.radius)), 'm60-wall-barrel');
    const gas = profile.gasCylinder;
    this.addShape(outline(rect(gas.rearZ, gas.nutZ, gas.y + gas.radius, gas.y - gas.radius)), 'm60-wall-gas-cylinder');
    this.addShape(outline(rect(gas.nutZ, gas.nutFrontZ, gas.y + gas.nutRadius, gas.y - gas.nutRadius)), 'm60-wall-gas-cylinder');
    this.addShape(outline(rect(gas.nutFrontZ, gas.frontZ, gas.y + gas.frontRadius, gas.y - gas.frontRadius)), 'm60-wall-gas-cylinder');
    this.addShape(outline(profile.gasBlock), 'm60-wall-gas-cylinder');
    this.addShape(outline(profile.gasBand), 'm60-wall-gas-cylinder');
    const stud = profile.gasStud;
    this.addShape(outline(rect(stud.z + 0.006, stud.z - 0.006, stud.topY, stud.bottomY)), 'm60-wall-gas-cylinder');

    const sight = profile.frontSight;
    const frontSight = outline(m60FrontSight(sightHeight));
    frontSight.holes.push(hole(profile.frontSightHole));
    this.addShape(frontSight, 'm60-wall-front-sight');
    this.addShape(outline(rect(sight.bandRearZ, sight.bandFrontZ, sight.bandRadius, -sight.bandRadius)), 'm60-wall-front-sight');

    const hider = profile.flashHider;
    const flashHider = outline([
      [hider.collarZ, barrel.frontRadius + 0.0016], [hider.rearZ, hider.radius], [hider.frontZ, hider.radius],
      [hider.frontZ, -hider.radius], [hider.rearZ, -hider.radius], [hider.collarZ, -barrel.frontRadius - 0.0016],
    ]);
    flashHider.holes.push(hole(rect(hider.slotRearZ, hider.slotFrontZ, 0.0024, -0.0024)));
    this.addShape(flashHider, 'm60-wall-flash-hider');

    this.addShape(outline(profile.yoke), 'm60-wall-bipod');
    for (const angle of [profile.bipod.deployed, -profile.bipod.deployed]) {
      const leg = m60BipodLeg(angle);
      const plate = outline(leg.plate);
      for (const opening of leg.holes) plate.holes.push(hole(opening));
      this.addShape(plate, 'm60-wall-bipod');
      this.addShape(outline(leg.foot), 'm60-wall-bipod');
    }
  }

  private addShape(shape: THREE.Shape, name: string): THREE.Mesh {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false });
    geometry.translate(0, 0, -0.0125);
    const mesh = new THREE.Mesh(geometry, MATERIAL);
    mesh.name = name;
    this.group.add(mesh);
    return mesh;
  }

  private addPart(width: number, height: number, x: number, y: number, rotation = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.025), MATERIAL);
    mesh.position.set(x, y, 0);
    mesh.rotation.z = rotation;
    this.group.add(mesh);
    return mesh;
  }
}
