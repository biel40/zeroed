import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS, ZOMBIES_WEAPON_PRELOAD } from '../src/config/weapons';
import { WeaponInventory } from '../src/game/WeaponInventory';
import { COOP_WEAPONS, coopReserveAmmo } from '../src/modes/coop/CoopWeapons';
import { parseGuestMessage, parseHostMessage } from '../src/network/Protocol';
import { HANDLE_RELEASE_FRACTION, HANDLE_TRAVEL, ReloadAnimator } from '../src/weapons/ReloadAnimator';
import { BARRETT_PROFILE } from '../src/weapons/BarrettViewModel';
import { Weapon } from '../src/weapons/Weapon';
import { buildProceduralViewModel, buildWeaponDisplayModel } from '../src/weapons/WeaponView';
import { MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, MysteryBoxMachine } from '../src/zombies/MysteryBox';
import { ZOMBIES_RESERVE_AMMO } from '../src/zombies/ZombieConfig';
import { resolveZombieDeathStyle } from '../src/zombies/ZombieDeath';
import { MANSION_WALL_BUYS } from '../src/zombies/maps/BurnedMansionConfig';
import { STATION33_WALL_BUYS } from '../src/zombies/maps/Station33Config';

const definition = WEAPON_DEFINITIONS.barrett;
const idle = { trigger: false, ads: false };

describe('Barrett .50 integration', () => {
  it('can be rolled and equipped from the box, with finite ammo in both modes', () => {
    expect(ZOMBIES_WEAPON_PRELOAD).toContain('barrett');
    expect(COOP_WEAPONS).toContain('barrett');
    expect([...MANSION_WALL_BUYS, ...STATION33_WALL_BUYS].some((buy) => buy.weaponId === 'barrett')).toBe(false);
    const entry = MYSTERY_BOX_POOL.find((item) => item.weaponId === 'barrett')!;
    const before = MYSTERY_BOX_POOL.slice(0, MYSTERY_BOX_POOL.indexOf(entry)).reduce((sum, item) => sum + item.weight, 0);
    const total = MYSTERY_BOX_POOL.reduce((sum, item) => sum + item.weight, 0);
    const box = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => (before + entry.weight / 2) / total);
    box.tryActivate();
    for (let i = 0; i < 310; i++) box.update(1 / 60);
    expect(box.result).toBe('barrett');
    const inventory = new WeaponInventory(['m1911'], 2);
    const reward = box.tryPickup();
    expect(reward).toBe('barrett');
    inventory.grant(reward!);
    expect(inventory.currentWeapon).toBe('barrett');
    const weapon = new Weapon(definition, () => 0.5, ZOMBIES_RESERVE_AMMO.barrett);
    expect(weapon.ammoInMagazine).toBe(7);
    expect(weapon.reserveAmmo).toBe(40);
    expect(coopReserveAmmo('barrett')).toBe(weapon.reserveAmmo);
    expect(resolveZombieDeathStyle('barrett', false, 0)).toBe('shatter');
  });

  it('fires once per press without a manual bolt cycle and respects its cooldown', () => {
    const weapon = new Weapon(definition);
    weapon.update(1 / 60, { trigger: true, ads: true });
    expect(weapon.pendingEvents.map((event) => event.type)).toEqual(['shot']);
    expect(weapon.state).toBe('ready');
    weapon.clearEvents();
    weapon.update(1, { trigger: true, ads: true });
    expect(weapon.pendingEvents).toEqual([]);
    weapon.update(1 / 60, idle);
    weapon.update(1 / 60, { trigger: true, ads: true });
    expect(weapon.ammoInMagazine).toBe(5);
    weapon.clearEvents();
    weapon.update(1 / 60, idle);
    weapon.update(1 / 60, { trigger: true, ads: true });
    expect(weapon.pendingEvents).toEqual([]);
  });

  it('draws reloads from the reserve and automatically reloads after the last shot', () => {
    const weapon = new Weapon(definition, () => 0.5, 4);
    weapon.ammoInMagazine = 3;
    expect(weapon.reload()).toBe(true);
    expect(weapon.reloadType).toBe('tactical');
    weapon.update(definition.tacticalReloadTime + 0.01, idle);
    expect(weapon.ammoInMagazine).toBe(7);
    expect(weapon.reserveAmmo).toBe(0);
    weapon.resetAmmo();
    weapon.ammoInMagazine = 1;
    weapon.update(1 / 60, { trigger: true, ads: false });
    expect(weapon.state).toBe('reloading');
    expect(weapon.reloadType).toBe('empty');
    weapon.update(definition.reloadTime + 0.01, idle);
    expect(weapon.ammoInMagazine).toBe(4);
    expect(weapon.reserveAmmo).toBe(0);
  });

  it('locks the trigger after four rapid rounds until the barrel has fully cooled', () => {
    const weapon = new Weapon(definition);
    const press = (): string[] => {
      weapon.clearEvents();
      weapon.update(1 / 60, { trigger: true, ads: true });
      const events = weapon.pendingEvents.map((event) => event.type);
      weapon.update(60 / definition.rpm, idle);
      return events;
    };
    for (let shot = 1; shot <= 3; shot++) expect(press()).toEqual(['shot']);
    expect(press()).toEqual(['shot', 'overheated']);
    expect(weapon.heat.overheated).toBe(true);
    expect(weapon.heat.intensity).toBe(1);
    expect(press()).toEqual(['overheated']);
    expect(weapon.ammoInMagazine).toBe(3);
    weapon.update(definition.heat!.coolDelay! + definition.heat!.coolTime, idle);
    expect(weapon.heat.overheated).toBe(false);
    expect(press()).toEqual(['shot']);
  });

  it('never overheats when each round is fired after the barrel had time to shed its heat', () => {
    const weapon = new Weapon(definition);
    for (let shot = 0; shot < definition.magazineSize - 1; shot++) {
      weapon.update(1 / 60, { trigger: true, ads: true });
      weapon.update(1.5, idle);
    }
    expect(weapon.ammoInMagazine).toBe(1);
    expect(weapon.heat.overheated).toBe(false);
  });

  it('accepts the box reward and shots through the existing co-op protocol', () => {
    const shot = { type: 'playerShoot' as const, weapon: 'barrett' as const,
      origin: { x: 0, y: 1.6, z: 0 }, direction: { x: 0, y: 0, z: -1 } };
    expect(parseGuestMessage(shot)).toEqual(shot);
    expect(parseHostMessage(shot)).toEqual(shot);
    expect(parseHostMessage({ type: 'boxGranted', weapon: 'barrett' })).toEqual({ type: 'boxGranted', weapon: 'barrett' });
  });
});

describe('Barrett .50 model', () => {
  it('builds the reference silhouette at full length within the procedural rendering budget', () => {
    const built = buildProceduralViewModel(definition.view);
    expect(built.group.name).toBe('barrett-root');
    for (const name of ['stock', 'receiver', 'shroud', 'barrel', 'muzzle-brake', 'scope', 'magazine', 'bipod']) {
      expect(built.group.getObjectByName(`barrett-${name}`)).toBeDefined();
    }
    const bounds = new THREE.Box3().setFromObject(built.group);
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(1.4);
    expect(bounds.max.z - bounds.min.z).toBeLessThan(1.5);
    expect(built.muzzlePosition.z).toBeLessThan(bounds.min.z);
    expect(built.sightY).toBe(definition.view.sightHeight);
    let meshes = 0;
    let triangles = 0;
    built.group.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      meshes++;
      triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
    });
    // Draw calls stay at the mobile cap; the perforated shroud, two-chamber brake,
    // full-length rail, visible bolt and rivet rows are worth the extra triangles.
    expect(meshes).toBeLessThanOrEqual(30);
    expect(triangles).toBeLessThan(18000);
    const display = buildWeaponDisplayModel(definition, null, 0.72);
    expect(new THREE.Box3().setFromObject(display).getSize(new THREE.Vector3()).z).toBeCloseTo(0.72);
  });

  it('has real openings in the shroud, muzzle brake and folded bipod', () => {
    const built = buildProceduralViewModel(definition.view);
    built.group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    for (const [part, y, z, solidY] of [
      ['shroud', 0.003, -0.222, 0.025], ['shroud', -0.034, -0.244, -0.045], ['muzzle-brake', 0.017, -0.911, 0.026],
      ['bipod', -0.086, -0.603, -0.096],
    ] as const) {
      ray.set(new THREE.Vector3(0.2, y, z), new THREE.Vector3(-1, 0, 0));
      expect(ray.intersectObject(built.group.getObjectByName(`barrett-${part}`)!, true)).toHaveLength(0);
      ray.set(new THREE.Vector3(0.2, solidY, z), new THREE.Vector3(-1, 0, 0));
      expect(ray.intersectObject(built.group.getObjectByName(`barrett-${part}`)!, true).length).toBeGreaterThan(0);
    }
  });

  it('carries an M82A1 solid buttstock with a raised cheek rest above the comb', () => {
    const built = buildProceduralViewModel(definition.view);
    built.group.updateMatrixWorld(true);
    const stock = built.group.getObjectByName('barrett-stock')!;
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(0.2, -0.085, 0.36), new THREE.Vector3(-1, 0, 0));
    expect(ray.intersectObject(stock, true).length).toBeGreaterThan(0);
    ray.set(new THREE.Vector3(0, 0.2, 0.3), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObject(stock, true)[0].point.y).toBeGreaterThan(0.05);
  });

  it('leaves the brake bore open and recesses the carrier inside the ejection port', () => {
    const built = buildProceduralViewModel(definition.view);
    built.group.updateMatrixWorld(true);
    const brake = built.group.getObjectByName('barrett-muzzle-brake')!;
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, -1.02), new THREE.Vector3(0, 0, 1), 0, 0.1);
    expect(ray.intersectObject(brake, true)).toHaveLength(0);
    ray.set(new THREE.Vector3(0.02, 0, -1.02), new THREE.Vector3(0, 0, 1));
    expect(ray.intersectObject(brake, true).length).toBeGreaterThan(0);
    ray.far = 1;
    ray.set(new THREE.Vector3(0.2, 0.006, -0.084), new THREE.Vector3(-1, 0, 0));
    const port = ray.intersectObject(built.group, true);
    expect(port.length).toBeGreaterThan(0);
    expect(port[0].point.x).toBeLessThan(0.02);
  });

  it('shows the bolt through the port and the rivet rows of the stamped receiver and shroud', () => {
    const built = buildProceduralViewModel(definition.view);
    built.group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const firstHitX = (part: string, y: number, z: number): number | undefined => {
      ray.set(new THREE.Vector3(0.2, y, z), new THREE.Vector3(-1, 0, 0));
      return ray.intersectObject(built.group.getObjectByName(`barrett-${part}`)!, true)[0]?.point.x;
    };
    const { carrier, seamRivets, shroudRivets, shroud } = BARRETT_PROFILE;
    // The bolt head sits inside the port, well clear of the left cover plate.
    expect(firstHitX('receiver', carrier.y, carrier.frontZ + 0.012)).toBeGreaterThan(0.005);
    // Rivet heads stand proud of the flanks; between them the flank is flush.
    const seamZ = seamRivets.firstZ - seamRivets.pitch;
    expect(firstHitX('receiver', seamRivets.y, seamZ)).toBeGreaterThan(0.0375);
    expect(firstHitX('shroud', shroudRivets.y, shroudRivets.firstZ)).toBeGreaterThan(shroud.width / 2 + 0.0012);
    expect(firstHitX('shroud', shroudRivets.y, shroudRivets.firstZ - shroudRivets.pitch / 2)).toBeLessThan(shroud.width / 2 + 0.0005);
  });

  it('racks the charging handle only on an empty reload and restores the magazine', () => {
    const { reloadParts } = buildProceduralViewModel(definition.view);
    const { magazine, handle, rounds } = reloadParts!;
    const anim = definition.view.reloadAnim!;
    const animator = new ReloadAnimator(anim, { magazine: magazine!, handle: handle!, rounds: rounds!, cover: null }, null);
    const home = handle!.position.clone();
    const magazineHome = magazine!.position.clone();
    const weapon = new Weapon(definition);
    weapon.ammoInMagazine = 0;
    const update = (progress: number, empty: boolean): void => {
      Object.defineProperties(weapon, {
        state: { configurable: true, value: 'reloading' },
        stateProgress: { configurable: true, value: progress },
        reloadType: { configurable: true, value: empty ? 'empty' : 'tactical' },
      });
      animator.update(weapon);
    };
    update((anim.magOut + anim.magDrop) / 2, true);
    expect(magazine!.position.y).toBeLessThan(magazineHome.y - 0.03);
    expect(rounds!.visible).toBe(false);
    update(anim.magIn + 0.02, true);
    expect(rounds!.visible).toBe(true);
    const pulled = anim.charge + (anim.chargeEnd - anim.charge) * HANDLE_RELEASE_FRACTION;
    update(pulled, false);
    expect(handle!.position.toArray()).toEqual(home.toArray());
    update(pulled, true);
    expect(handle!.position.z).toBeCloseTo(home.z + HANDLE_TRAVEL);
    expect(handle!.rotation.z).toBeCloseTo(0);
    update(1, true);
    expect(handle!.position.toArray()).toEqual(home.toArray());
    expect(magazine!.position.toArray()).toEqual(magazineHome.toArray());
  });
});
