import * as THREE from 'three';
import { WEAPON_DEFINITIONS } from '../../../config/weapons';
import { buildWeaponDisplayModel } from '../../../weapons/WeaponView';
import type { WeaponId } from '../../../weapons/WeaponTypes';
import type { ArenaWeaponPickup } from '../ZombieArena';
import type { MapBuildKit } from './MapBuildKit';
import { addSolidProxy } from './SolidProxy';
import type { CodeWeaponChestPlacement } from './CodeWeaponChestConfig';

/** Solid steel chest with an animated lid and a single free weapon per run. */
export class CodeWeaponChest implements ArenaWeaponPickup {
  public readonly cost = 0;
  public readonly floor = 0;
  public readonly useRange = 2;
  public readonly lookDotMin = 0.65;
  public readonly id: string;
  public readonly weaponId: WeaponId;
  public readonly requiredDoorId: string;
  public readonly interactionLabel: string;
  public readonly position: { x: number; y: number; z: number };
  public get codeLock(): this { return this; }
  public get locked(): boolean { return !this.opened; }
  private opened = false;
  private claimed = false;
  private readonly lid = new THREE.Group();
  private readonly padlock = new THREE.Group();
  private readonly weapon: THREE.Group;

  public constructor(kit: Pick<MapBuildKit, 'group' | 'structure' | 'collider'>, private readonly config: CodeWeaponChestPlacement) {
    this.id = config.id;
    this.weaponId = config.weaponId;
    this.requiredDoorId = config.requiredDoorId;
    this.interactionLabel = WEAPON_DEFINITIONS[config.weaponId].name;
    this.position = { x: config.x + Math.sin(config.yaw) * 0.4, y: 0.8, z: config.z + Math.cos(config.yaw) * 0.4 };
    const group = new THREE.Group();
    group.name = `code-chest:${this.id}`;
    group.position.set(config.x, 0, config.z);
    group.rotation.y = config.yaw;
    kit.group.add(group);
    const steel = new THREE.MeshStandardMaterial({ color: 0x37463d, metalness: 0.65, roughness: 0.75 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x747c7e, metalness: 0.8, roughness: 0.4 });
    const lining = new THREE.MeshStandardMaterial({ color: 0x151b18, roughness: 1 });
    const box = (parent: THREE.Group, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number): void => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    };
    box(group, lining, 0, 0.18, 0, 1.9, 0.16, 0.8);
    for (const x of [-0.98, 0.98]) box(group, steel, x, 0.43, 0, 0.08, 0.6, 0.88);
    for (const z of [-0.4, 0.4]) box(group, steel, 0, 0.43, z, 1.9, 0.6, 0.08);
    this.lid.name = 'chest-lid';
    this.lid.position.set(0, 0.74, -0.44);
    box(this.lid, steel, 0, 0, 0.44, 2.04, 0.12, 0.9);
    for (const x of [-0.75, 0.75]) {
      box(group, trim, x, 0.43, 0.449, 0.06, 0.6, 0.025);
      box(this.lid, trim, x, 0.068, 0.44, 0.06, 0.018, 0.9);
    }
    this.padlock.position.set(0, 0.62, 0.49);
    box(this.padlock, trim, 0, -0.04, 0, 0.19, 0.18, 0.08);
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.015, 6, 12, Math.PI), trim);
    shackle.position.y = 0.06;
    this.padlock.add(shackle);
    for (let digit = 0; digit < 4; digit++) box(this.padlock, lining, -0.06 + digit * 0.04, -0.04, 0.045, 0.025, 0.06, 0.012);
    this.weapon = buildWeaponDisplayModel(WEAPON_DEFINITIONS[this.weaponId], null, 1.65);
    this.weapon.name = 'chest-weapon';
    this.weapon.rotation.y = Math.PI / 2;
    this.weapon.position.set(0, 0.58, 0);
    group.add(this.lid, this.padlock, this.weapon);
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3(new THREE.Vector3(-1.02, 0, -0.46), new THREE.Vector3(1.02, 0.8, 0.46)).applyMatrix4(group.matrix);
    addSolidProxy(kit, this.id, bounds.min, bounds.max, 'metal');
    this.reset();
  }

  public get available(): boolean { return !this.claimed; }

  public acceptsCode(code: string): boolean {
    return this.available && code === this.config.code;
  }

  public unlock(code: string): boolean {
    if (!this.acceptsCode(code)) return false;
    this.applyUnlocked();
    return true;
  }

  public applyUnlocked(): void {
    this.opened = true;
    this.padlock.visible = false;
    this.weapon.visible = !this.claimed;
  }

  public claim(): boolean {
    if (!this.opened || this.claimed) return false;
    this.claimed = true;
    this.weapon.visible = false;
    return true;
  }

  public update(dt: number): void {
    const target = this.opened ? -Math.PI * 0.62 : 0;
    this.lid.rotation.x += (target - this.lid.rotation.x) * (1 - Math.exp(-5 * Math.max(0, dt)));
  }

  public reset(): void {
    this.opened = false;
    this.claimed = false;
    this.lid.rotation.x = 0;
    this.padlock.visible = true;
    this.weapon.visible = false;
  }
}
