import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS, ZOMBIES_WEAPON_PRELOAD } from '../src/config/weapons';
import { ZOMBIE_MAPS } from '../src/config/zombieMaps';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { STILL_GAIT } from '../src/player/WalkGait';
import { buildExhalisArrowGeometry, EXHALIS_ARROW } from '../src/weapons/ExhalisArrow';
import { EXHALIS_PROFILE } from '../src/weapons/ExhalisViewModel';
import { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel, WeaponView } from '../src/weapons/WeaponView';
import { DieKathedraleArena } from '../src/zombies/maps/DieKathedraleArena';
import {
  CATACOMB_FLOOR,
  CATACOMB_FLOOR_Y,
  EXHALIS_ALTAR_OFFERING,
  RELIQUARY,
  WIND_BOW_ALTAR,
} from '../src/zombies/maps/DieKathedraleCatacombsConfig';
import { MYSTERY_BOX_POOL } from '../src/zombies/MysteryBox';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

const definition = WEAPON_DEFINITIONS.exhalis;
const view = definition.view;
const DT = 1 / 120;
const IDLE = { trigger: false, ads: false };
const FIRE = { trigger: true, ads: false };

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((object) => { if (object instanceof THREE.Mesh) found.push(object); });
  return found;
}

function ready(): Weapon {
  const weapon = new Weapon(definition, () => 0.5);
  for (let t = 0; t < definition.equipTime + 0.05; t += DT) weapon.update(DT, IDLE);
  weapon.clearEvents();
  return weapon;
}

/** Runs the weapon and its view, telling the view of every shot as Game does. */
function run(weapon: Weapon, viewModel: WeaponView, seconds: number, input: typeof IDLE): number {
  let shots = 0;
  for (let t = 0; t < seconds; t += DT) {
    weapon.update(DT, input);
    for (const event of weapon.pendingEvents) {
      if (event.type !== 'shot') continue;
      shots++;
      viewModel.onShot();
    }
    weapon.clearEvents();
    viewModel.update(DT, weapon, STILL_GAIT, 0, 0);
  }
  return shots;
}

describe('EXHALIS definition', () => {
  it('is a semi-automatic wind bow: no bullets, energy bolts or flame', () => {
    expect(definition.name).toBe('EXHALIS');
    expect(definition.wind).toBeDefined();
    expect(definition.energy).toBeUndefined();
    expect(definition.flame).toBeUndefined();
    expect(definition.fireModes).toEqual(['semi']);
    expect(definition.muzzleFlare).toBeUndefined();
    expect(definition.heat).toBeUndefined();
    expect(definition.audio.energy).toBe('wind');
  });

  it('is crowd control, not a round clearer: fewer breaths and less damage than the VORTEX-9', () => {
    const vortex = WEAPON_DEFINITIONS.vortex9;
    expect(definition.damage + definition.wind!.burstDamage).toBeLessThan(vortex.damage + vortex.energy!.splashDamage);
    expect(definition.magazineSize).toBeLessThan(vortex.magazineSize);
    expect(definition.reserveAmmo).toBe(definition.magazineSize * 6);
    expect(definition.tacticalReloadTime).toBe(definition.reloadTime);
  });

  it('is exclusive to Die Kathedrale: not in the box, not in the shared preload, only in its map registry', () => {
    expect(MYSTERY_BOX_POOL.some((entry) => entry.weaponId === 'exhalis')).toBe(false);
    expect(ZOMBIES_WEAPON_PRELOAD).not.toContain('exhalis');
    expect(ZOMBIE_MAPS['die-kathedrale'].exclusiveWeapons).toEqual(['exhalis']);
    expect(ZOMBIE_MAPS['station-33'].exclusiveWeapons).not.toContain('exhalis');
    expect(new ZombiesMode('die-kathedrale').weaponIds).toContain('exhalis');
    expect(new ZombiesMode('burned-mansion').weaponIds).not.toContain('exhalis');
    expect(new ZombiesMode('station-33').weaponIds).not.toContain('exhalis');
  });
});

describe('EXHALIS view model', () => {
  it('stays within its draw budget', () => {
    const built = buildProceduralViewModel(view);
    expect(built.group.name).toBe('exhalis-root');
    expect(meshes(built.group).length).toBeLessThanOrEqual(24);
    expect(built.reloadParts?.magazine?.name).toBe('exhalis-ampoule');
  });

  it('leans every part above the sight line to the left, out of the sight picture', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const sightY = view.sightHeight * view.scale;
    const raycaster = new THREE.Raycaster(new THREE.Vector3(0, sightY + 0.002, 0.5), new THREE.Vector3(0, 0, -1));
    expect(raycaster.intersectObject(built.group, true)).toHaveLength(0);
    const vertex = new THREE.Vector3();
    for (const mesh of meshes(built.group)) {
      if (mesh.name.includes('arrow') || mesh.name.includes('swirl')) continue;
      const position = mesh.geometry.getAttribute('position');
      for (let index = 0; index < position.count; index++) {
        vertex.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
        if (vertex.y > sightY + 0.004) expect(vertex.x, mesh.name).toBeLessThan(0.002);
      }
    }
  });

  it('rests the arrow on the nock line, under the sight line, its head clear ahead of the riser', () => {
    const built = buildProceduralViewModel(view);
    built.group.updateMatrixWorld(true);
    const arrow = built.group.getObjectByName('exhalis-wind-arrow')!;
    const box = new THREE.Box3().setFromObject(arrow);
    expect(box.max.y).toBeLessThan(view.sightHeight - 0.015);
    expect(box.min.z).toBeCloseTo(EXHALIS_PROFILE.nockZ - EXHALIS_ARROW.length, 3);
    expect(box.max.z).toBeCloseTo(EXHALIS_PROFILE.nockZ, 2);
    // Fully drawn, the head still sits in front of the riser's face.
    expect(EXHALIS_PROFILE.nockZ + EXHALIS_PROFILE.draw - EXHALIS_ARROW.length + EXHALIS_ARROW.head.length)
      .toBeLessThan(EXHALIS_PROFILE.riserZ - EXHALIS_PROFILE.riser.depth / 2);
  });

  it('is a physical arrow, not a beam: solid head, shaft and fletching', () => {
    const { body, metal, runes } = buildExhalisArrowGeometry();
    for (const geometry of [body, metal, runes]) geometry.computeBoundingBox();
    // The bronze head reaches the tip and is wider than the shaft.
    expect(metal.boundingBox!.min.z).toBeCloseTo(-EXHALIS_ARROW.length, 4);
    expect(metal.boundingBox!.max.x).toBeGreaterThan(EXHALIS_ARROW.shaftRadius * 1.5);
    // The fletching stands out of the shaft at the back.
    expect(body.boundingBox!.max.x).toBeGreaterThan(EXHALIS_ARROW.shaftRadius + EXHALIS_ARROW.fletching.height * 0.5);
    expect(runes.boundingBox!.max.x).toBeLessThan(EXHALIS_ARROW.shaftRadius * 1.5);
    const built = buildProceduralViewModel(view);
    const arrow = built.group.getObjectByName('exhalis-wind-arrow')!;
    const solids = meshes(arrow).filter((mesh) => !(mesh.material as THREE.Material).transparent);
    expect(solids.length).toBeGreaterThanOrEqual(3);
  });

  it('draws the string, the arrow, the handle and the hand back as the charge grows, bending the limbs', () => {
    const weapon = ready();
    const viewModel = new WeaponView(definition, null);
    const arrow = viewModel.root.getObjectByName('exhalis-wind-arrow')!;
    const handle = viewModel.root.getObjectByName('exhalis-frame')!;
    const limb = viewModel.root.getObjectByName('exhalis-upper-limb')!;
    const hand = (): THREE.Vector3 => {
      const position = new THREE.Vector3();
      viewModel.hands.read('right', position, new THREE.Quaternion());
      return viewModel.root.worldToLocal(position);
    };
    run(weapon, viewModel, 0.1, IDLE);
    const restHand = hand();
    expect(arrow.position.z).toBeCloseTo(EXHALIS_PROFILE.nockZ, 6);

    run(weapon, viewModel, definition.charge!.fullSeconds * 0.5, FIRE);
    const halfDraw = arrow.position.z - EXHALIS_PROFILE.nockZ;
    expect(halfDraw).toBeGreaterThan(0);
    expect(halfDraw).toBeLessThan(EXHALIS_PROFILE.draw);

    run(weapon, viewModel, definition.charge!.fullSeconds, FIRE);
    expect(weapon.chargeLevel).toBe(1);
    expect(arrow.position.z - EXHALIS_PROFILE.nockZ).toBeCloseTo(EXHALIS_PROFILE.draw, 6);
    expect(handle.position.z).toBeCloseTo(EXHALIS_PROFILE.draw, 6);
    expect(hand().z - restHand.z).toBeCloseTo(EXHALIS_PROFILE.draw, 4);
    expect(limb.rotation.x).toBeGreaterThan(0.02);
    expect(arrow.visible).toBe(true);

    expect(run(weapon, viewModel, DT, IDLE)).toBe(1);
    expect(arrow.visible).toBe(false);
    expect(handle.position.z).toBeCloseTo(0, 6);
  });

  it('flashes a short pulse round the arrowhead once, when the draw is full', () => {
    const weapon = ready();
    const viewModel = new WeaponView(definition, null);
    const pulse = viewModel.root.getObjectByName('exhalis-charge-pulse')!;
    run(weapon, viewModel, definition.charge!.fullSeconds * 0.9, FIRE);
    expect(pulse.visible).toBe(false);
    run(weapon, viewModel, definition.charge!.fullSeconds * 0.15, FIRE);
    expect(pulse.visible).toBe(true);
    run(weapon, viewModel, 1, FIRE);
    expect(pulse.visible).toBe(false);
  });

  it('looses the wind arrow with every shot, quivers the limbs and gathers a new one before the next draw', () => {
    const weapon = ready();
    const viewModel = new WeaponView(definition, null);
    const arrow = viewModel.root.getObjectByName('exhalis-wind-arrow')!;
    const limb = viewModel.root.getObjectByName('exhalis-upper-limb')!;
    run(weapon, viewModel, 0.1, IDLE);
    expect(arrow.visible).toBe(true);
    expect(arrow.scale.z).toBeCloseTo(1, 5);

    expect(run(weapon, viewModel, DT, FIRE) + run(weapon, viewModel, DT, IDLE)).toBe(1);
    expect(arrow.visible).toBe(false);
    expect(Math.abs(limb.rotation.x)).toBeGreaterThan(0.03);
    run(weapon, viewModel, 60 / definition.rpm, IDLE);
    expect(arrow.visible).toBe(true);
    expect(arrow.scale.z).toBeCloseTo(1, 5);
    expect(limb.rotation.x).toBeCloseTo(0, 6);
  });

  it('keeps the string on both limb tips and the nock as the limbs move', () => {
    const weapon = ready();
    const viewModel = new WeaponView(definition, null);
    const check = (draw: number): void => {
    viewModel.root.updateMatrixWorld(true);
    const bow = viewModel.root.getObjectByName('exhalis-bow')!;
    const nock = new THREE.Vector3(0, 0, EXHALIS_PROFILE.nockZ + draw - EXHALIS_PROFILE.riserZ);
    for (const [limbName, stringName] of [['exhalis-upper-limb', 'exhalis-upper-string'], ['exhalis-lower-limb', 'exhalis-lower-string']]) {
      const string = bow.getObjectByName(stringName)!;
      const limbNode = bow.getObjectByName(limbName)!;
      const [along, back] = EXHALIS_PROFILE.limb[EXHALIS_PROFILE.nockIndex];
      const sign = limbName.includes('upper') ? 1 : -1;
      const tip = limbNode.localToWorld(new THREE.Vector3(0, sign * along, back));
      bow.worldToLocal(tip);
      expect(string.position.distanceTo(tip), stringName).toBeLessThan(1e-4);
      const end = new THREE.Vector3(0, 1, 0).applyQuaternion(string.quaternion).multiplyScalar(string.scale.y).add(string.position);
      expect(end.distanceTo(nock), stringName).toBeLessThan(1e-4);
    }
    };
    // Mid-draw, and as the limbs quiver after the release.
    run(weapon, viewModel, definition.charge!.fullSeconds * 0.5, FIRE);
    check(viewModel.root.getObjectByName('exhalis-wind-arrow')!.position.z - EXHALIS_PROFILE.nockZ);
    run(weapon, viewModel, DT, IDLE);
    run(weapon, viewModel, 0.03, IDLE);
    check(0);
  });

  it('holds no arrow while empty or reloading, and a fresh one once the ampoule is seated', () => {
    const weapon = ready();
    const viewModel = new WeaponView(definition, null);
    weapon.ammoInMagazine = 0;
    run(weapon, viewModel, 0.3, IDLE);
    const arrow = viewModel.root.getObjectByName('exhalis-wind-arrow')!;
    expect(arrow.visible).toBe(false);
    expect(weapon.reload()).toBe(true);
    run(weapon, viewModel, definition.reloadTime + 0.8, IDLE);
    expect(weapon.ammoInMagazine).toBe(definition.magazineSize);
    expect(arrow.visible).toBe(true);
  });
});

describe('EXHALIS in Die Kathedrale', () => {
  function arena(): DieKathedraleArena {
    const built = new DieKathedraleArena(new THREE.Scene(), TEST_PROFILE);
    built.init();
    return built;
  }

  it('waits over the reliquary altar as the map\'s only weapon station, on the catacomb floor', () => {
    const map = arena();
    expect(map.weaponStations).toHaveLength(1);
    const [altar] = map.weaponStations;
    expect(altar.weaponId).toBe('exhalis');
    expect(altar.floor).toBe(CATACOMB_FLOOR);
    expect(altar.powered).toBe(true);
    expect(altar.price).toBe(EXHALIS_ALTAR_OFFERING.price);
    expect(altar.ammoPromptKey).toBe('prompt.breathAmpoules');
    expect(altar.position.x).toBeCloseTo(WIND_BOW_ALTAR.x);
    expect(altar.position.z).toBeCloseTo(WIND_BOW_ALTAR.z);
    expect(altar.position.y).toBeGreaterThan(CATACOMB_FLOOR_Y + WIND_BOW_ALTAR.height);
    // In reach from the floor in front of the altar, inside the reliquary.
    const front = WIND_BOW_ALTAR.z + WIND_BOW_ALTAR.depth / 2 + 0.6;
    expect(front).toBeLessThan(RELIQUARY.maxZ);
    expect(front - altar.position.z).toBeLessThan(altar.useRange);
  });

  it('floats the bow flat over the sockets, clear of the altar, and bares the altar once it is taken', () => {
    const map = arena();
    const offering = map.group.getObjectByName('exhalis-altar-offering')!;
    offering.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(offering);
    const top = CATACOMB_FLOOR_Y + WIND_BOW_ALTAR.height;
    expect(box.min.y).toBeGreaterThan(top);
    expect(box.max.y - box.min.y).toBeLessThan(0.35);
    expect(box.max.x - box.min.x).toBeGreaterThan(0.9);
    expect(box.max.x - box.min.x).toBeLessThan(WIND_BOW_ALTAR.width + 0.4);
    const [altar] = map.weaponStations;
    altar.setOwned(true);
    expect(offering.visible).toBe(false);
    map.reset();
    expect(offering.visible).toBe(true);
  });
});
