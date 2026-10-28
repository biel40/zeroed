import * as THREE from 'three';
import { t, type TranslationKey } from '../../../i18n/i18n';
import type { ArenaAmmoRefill } from '../ZombieArena';
import type { MapBuildKit } from './MapBuildKit';
import { addSolidProxy } from './SolidProxy';

/** Map-owned placement; purchase and ammunition policy belong to the mode. */
export interface AmmoRefillPlacement {
  readonly id: string;
  readonly cost: number;
  readonly labelKey: TranslationKey;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
  readonly useRange: number;
  readonly lookDotMin: number;
}

/** Shared civil-defence ammunition chest and purchase feedback. */
export function buildAmmoRefill(kit: Pick<MapBuildKit, 'group' | 'structure' | 'collider'>, config: AmmoRefillPlacement, material: THREE.Material, emitLight = true): ArenaAmmoRefill {
  const group = new THREE.Group();
  group.name = config.id;
  group.position.set(config.position.x, 0, config.position.z);
  group.userData.mapRole = 'ammo-refill';
  group.userData.activeFeedback = false;

  // The arena supplies the paint so the shared chest fits each map.
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.58, 0.68), material);
  base.position.y = 0.29;
  base.userData.surface = 'metal';
  base.userData.mapRole = 'ammo-box-body';
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.12, 0.72), material);
  lid.position.set(0, 0.64, 0);
  lid.userData.mapRole = 'ammo-box-lid';
  const iconPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.015, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xd2bd3f }),
  );
  iconPlate.position.set(0, 0.705, 0);
  iconPlate.userData.mapRole = 'ammo-box-marking';

  const ammoIcon = new THREE.Group();
  ammoIcon.position.y = 0.745;
  ammoIcon.userData.mapRole = 'ammo-box-icon';
  const casingMaterial = new THREE.MeshStandardMaterial({ color: 0xb8862d, metalness: 0.75, roughness: 0.28 });
  const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0x40362b, metalness: 0.45, roughness: 0.4 });
  for (const x of [-0.2, 0, 0.2]) {
    const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.25, 10), casingMaterial);
    casing.position.set(x, 0, 0.025);
    casing.rotation.x = Math.PI / 2;
    casing.userData.mapRole = 'ammo-icon-casing';
    const projectile = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 10), projectileMaterial);
    projectile.position.set(x, 0, -0.16);
    projectile.rotation.x = -Math.PI / 2;
    projectile.userData.mapRole = 'ammo-icon-projectile';
    ammoIcon.add(casing, projectile);
  }
  const glow = new THREE.PointLight(0xe4cd4e, 0.35, 2.2, 2);
  glow.visible = emitLight;
  glow.position.set(0, 0.85, 0);
  group.add(base, lid, iconPlate, ammoIcon, glow);
  kit.group.add(group);
  addSolidProxy(kit, config.id + '-collider',
    { x: config.position.x - 0.525, y: 0, z: config.position.z - 0.34 },
    { x: config.position.x + 0.525, y: 0.58, z: config.position.z + 0.34 }, 'metal');

  return new AmmoRefill(
    config.id,
    config.cost,
    config.labelKey,
    config.position,
    config.floor,
    config.useRange,
    config.lookDotMin,
    group,
    lid,
    glow,
  );

}

class AmmoRefill implements ArenaAmmoRefill {
  private feedbackTimer = 0;

  constructor(
    public readonly id: string,
    public readonly cost: number,
    private readonly labelKey: TranslationKey,
    public readonly position: { readonly x: number; readonly y: number; readonly z: number },
    public readonly floor: number,
    public readonly useRange: number,
    public readonly lookDotMin: number,
    private readonly view: THREE.Group,
    private readonly lid: THREE.Object3D,
    private readonly glow: THREE.PointLight,
  ) {}

  public get interactionLabel(): string {
    return t(this.labelKey, { cost: this.cost });
  }

  public activate(): void {
    this.feedbackTimer = 0.45;
    this.view.userData.activeFeedback = true;
  }

  public update(dt: number): void {
    if (this.feedbackTimer <= 0) return;
    this.feedbackTimer = Math.max(0, this.feedbackTimer - dt);
    const active = this.feedbackTimer > 0;
    this.lid.rotation.x = active ? -0.16 : 0;
    this.glow.intensity = active ? 1.4 : 0.35;
    this.view.userData.activeFeedback = active;
  }

  public reset(): void {
    this.feedbackTimer = 0;
    this.lid.rotation.x = 0;
    this.glow.intensity = 0.35;
    this.view.userData.activeFeedback = false;
  }
}

