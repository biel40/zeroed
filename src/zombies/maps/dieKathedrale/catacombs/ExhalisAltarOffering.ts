import * as THREE from 'three';
import type { TranslationKey } from '../../../../i18n/i18n';
import { EXHALIS_PROFILE } from '../../../../weapons/ExhalisViewModel';
import type { WeaponDefinition, WeaponId } from '../../../../weapons/WeaponTypes';
import { buildProceduralViewModel } from '../../../../weapons/WeaponView';
import { CATACOMB_FLOOR, CATACOMB_FLOOR_Y, EXHALIS_ALTAR_OFFERING, WIND_BOW_ALTAR } from '../../DieKathedraleCatacombsConfig';
import type { ArenaWeaponStation } from '../../ZombieArena';

/** The floating bow breathes: a slow rise and fall, and its runes swell with it. */
const BOB_HEIGHT = 0.012;
const BOB_RATE = 1.4;
const GLOW = { rest: 1.1, swell: 0.35, flash: 3 } as const;
const FLASH_DECAY = 2.5;

/**
 * The base EXHALIS waiting over the reliquary's altar, as the map's weapon
 * station until the Wind Bow's quest exists: the relic bow floats flat above
 * the three empty sockets, its runes breathing a faint turquoise, and the
 * mode sells it (then its breath ampoules) like any station. Once taken the
 * altar stands bare; a purchase or refill makes the runes flare. No power,
 * no light of its own: the bow's emissive runes and the altar's candles
 * show it. Purely presentation; the mode charges and grants.
 */
export class ExhalisAltarOffering implements ArenaWeaponStation {
  public readonly id: string;
  public readonly weaponId: WeaponId;
  public readonly price: number;
  public readonly ammoPrice: number;
  public readonly ammoPromptKey: TranslationKey = 'prompt.breathAmpoules';
  public readonly position: { readonly x: number; readonly y: number; readonly z: number };
  public readonly floor = CATACOMB_FLOOR;
  public readonly useRange: number;
  public readonly lookDotMin = 0.5;
  public readonly powered = true;
  private readonly bow: THREE.Group;
  private readonly runes: readonly THREE.MeshStandardMaterial[];
  private readonly restY: number;
  private time = 0;
  private flash = 0;

  public constructor(parent: THREE.Object3D, definition: WeaponDefinition) {
    const offering = EXHALIS_ALTAR_OFFERING;
    if (definition.id !== offering.weaponId) throw new Error(`The reliquary altar offers ${offering.weaponId}, not ${definition.id}`);
    this.id = offering.id;
    this.weaponId = offering.weaponId;
    this.price = offering.price;
    this.ammoPrice = offering.ammoPrice;
    this.useRange = offering.useRange;
    const top = CATACOMB_FLOOR_Y + WIND_BOW_ALTAR.height;
    this.position = { x: WIND_BOW_ALTAR.x, y: top + offering.hover, z: WIND_BOW_ALTAR.z };
    this.restY = this.position.y;

    // The view model at its real size, turned so its limbs lie along the altar and its plane flat,
    // the string towards the room and the shot line pointing at the end wall.
    const built = buildProceduralViewModel(definition.view);
    this.runes = built.energyMaterials ?? [];
    built.group.rotation.set(0, 0, -Math.PI / 2 - EXHALIS_PROFILE.cant);
    this.bow = new THREE.Group();
    this.bow.name = 'exhalis-altar-offering';
    this.bow.add(built.group);
    // Centred over the sockets, its lowest point `hover` above the altar's top.
    built.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(built.group);
    const center = bounds.getCenter(new THREE.Vector3());
    built.group.position.set(-center.x, -bounds.min.y, -center.z);
    this.bow.position.set(this.position.x, this.position.y, this.position.z);
    for (const object of [this.bow, built.group]) object.traverse((child) => { child.castShadow = false; });
    parent.add(this.bow);
    this.reset();
  }

  public setOwned(owned: boolean): void {
    this.bow.visible = !owned;
  }

  public activate(): void {
    this.flash = 1;
  }

  public update(dt: number): void {
    this.time += Math.max(0, dt);
    this.flash = Math.max(0, this.flash - FLASH_DECAY * dt);
    const breath = Math.sin(this.time * BOB_RATE);
    this.bow.position.y = this.restY + breath * BOB_HEIGHT;
    const glow = GLOW.rest + GLOW.swell * breath + this.flash * GLOW.flash;
    for (const material of this.runes) material.emissiveIntensity = glow;
  }

  public reset(): void {
    this.time = 0;
    this.flash = 0;
    this.setOwned(false);
    this.update(0);
  }
}
