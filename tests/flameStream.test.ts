import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { PlayerEconomy } from '../src/game/PlayerEconomy';
import { ZombiesFlames } from '../src/modes/ZombiesFlames';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { Weapon } from '../src/weapons/Weapon';
import { selectFlameTargets, type FlameHit } from '../src/zombies/FlameTargeting';
import { BURN_TICK_SECONDS, ZombieBurns } from '../src/zombies/ZombieBurns';
import type { ZombieKillSource } from '../src/zombies/ZombieDeath';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { STATION33_WEAPON_STATIONS, SUBESTACION, station33ZoneAt } from '../src/zombies/maps/Station33Config';
import { MapPower } from '../src/zombies/maps/shared/MapPower';
import { WeaponStation, type WeaponStationLook } from '../src/zombies/maps/shared/WeaponStation';
import { StaticMeshBatch } from '../src/zombies/maps/shared/StaticMeshBatch';

const flame = WEAPON_DEFINITIONS.fakel.flame!;
const originalDocument = globalThis.document;

// Soft-dot and flash textures are drawn on a canvas.
beforeAll(() => {
  const gradient = { addColorStop: () => undefined };
  const context = {
    createRadialGradient: () => gradient, fillStyle: '', fillRect: () => undefined,
    beginPath: () => undefined, arc: () => undefined, fill: () => undefined,
    clearRect: () => undefined, fillText: () => undefined,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } as unknown as Document,
  });
});

afterAll(() => {
  if (originalDocument === undefined) delete (globalThis as { document?: Document }).document;
  else Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
});

/** A stand-in zombie: feet position, floor, health and the fire on its body. */
class FakeZombie {
  readonly position: THREE.Vector3;
  isAlive = true;
  burning = 0;
  constructor(x: number, z: number, public hp = 1000, readonly floor = 0) {
    this.position = new THREE.Vector3(x, 0, z);
  }
  ignite(seconds: number): void {
    this.burning = Math.max(this.burning, seconds);
  }
}

/** ZombieManager.damageZombie, recording who dealt what. */
function fakeManager(zombies: FakeZombie[]) {
  const blows: { zombie: FakeZombie; damage: number; source: ZombieKillSource | undefined; lethal: boolean }[] = [];
  return {
    blows,
    manager: {
      actives: new Set(zombies),
      damageZombie: (zombie: FakeZombie, _part: string, damage: number, source?: ZombieKillSource) => {
        if (!zombie.isAlive) return false;
        zombie.hp -= damage;
        const lethal = zombie.hp <= 0;
        if (lethal) zombie.isAlive = false;
        blows.push({ zombie, damage, source, lethal });
        return lethal;
      },
    },
  };
}

describe('Flame stream targeting', () => {
  const origin = { x: 0, y: 1.6, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  const config = { coneHalfAngle: flame.coneHalfAngle, maxTargets: 3 };

  it('scorches the bodies inside the cone and reach, nearest first, up to the cap', () => {
    const zombies = [new FakeZombie(0, -5), new FakeZombie(0.4, -2), new FakeZombie(-0.6, -3.5), new FakeZombie(0.2, -6.5)];
    const hits: FlameHit<FakeZombie>[] = [];
    selectFlameTargets(origin, forward, 7, zombies, config, hits);
    expect(hits.map((hit) => hit.target)).toEqual([zombies[1], zombies[2], zombies[0]]);
  });

  it('misses what is behind, beside the cone or past the reach', () => {
    const zombies = [new FakeZombie(0, 3), new FakeZombie(4, -3), new FakeZombie(0, -9)];
    expect(selectFlameTargets(origin, forward, 7, zombies, config, [])).toHaveLength(0);
  });

  it('never misses a zombie right at the nozzle, even off the axis', () => {
    const close = new FakeZombie(0.45, -0.6);
    expect(selectFlameTargets(origin, forward, 7, [close], config, [])).toHaveLength(1);
  });
});

describe('Burns', () => {
  it('bite steadily for their duration and refresh instead of stacking', () => {
    const burns = new ZombieBurns<FakeZombie>();
    const zombie = new FakeZombie(0, 0);
    const bites: number[] = [];
    expect(burns.ignite(zombie, 1, 40, 'fakel')).toBe(true);
    expect(burns.ignite(zombie, 1, 40, 'fakel')).toBe(false);
    for (let t = 0; t < 2; t += 1 / 60) burns.update(1 / 60, (_target, damage) => bites.push(damage));
    expect(bites.length).toBe(Math.round(1 / BURN_TICK_SECONDS));
    expect(bites.reduce((sum, bite) => sum + bite, 0)).toBeCloseTo(40, 5);
    expect(burns.isBurning(zombie)).toBe(false);
  });

  it('drop the dead at once and clear on reset', () => {
    const burns = new ZombieBurns<FakeZombie>();
    const [dead, alive] = [new FakeZombie(0, 0), new FakeZombie(1, 0)];
    burns.ignite(dead, 3, 40, 'fakel');
    burns.ignite(alive, 3, 40, 'fakel');
    dead.isAlive = false;
    const bitten: FakeZombie[] = [];
    burns.update(BURN_TICK_SECONDS, (target) => bitten.push(target));
    expect(bitten).toEqual([alive]);
    expect(burns.count).toBe(1);
    burns.reset();
    expect(burns.count).toBe(0);
  });
});

describe('ZombiesFlames', () => {
  function setup(zombies: FakeZombie[], colliders: THREE.Object3D[] = []) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.updateMatrixWorld(true);
    const weapon = new Weapon(WEAPON_DEFINITIONS.fakel, () => 0.5);
    const economy = new PlayerEconomy();
    const hud = { showHitmarker: vi.fn() };
    const ctx = {
      scene,
      player: { floor: 0, camera },
      hud,
      stats: { registerHit: vi.fn() },
      getEquippedWeapon: () => weapon,
      getMuzzleWorldPosition: (out: THREE.Vector3) => out.set(0.2, 1.4, -0.5),
    };
    const { manager, blows } = fakeManager(zombies);
    const flames = new ZombiesFlames(ctx as never, manager as never, economy, () => colliders, () => 1);
    const fire = (): void => flames.fire(weapon, new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -1));
    return { flames, fire, blows, economy, hud, scene, weapon };
  }

  it('scorches several zombies per tick with the weapon as the source, paying one hit per fresh ignition', () => {
    const zombies = [new FakeZombie(0, -2), new FakeZombie(0.3, -4), new FakeZombie(-0.3, -5)];
    const { fire, blows, economy, hud } = setup(zombies);
    fire();
    fire();
    expect(blows).toHaveLength(6);
    expect(new Set(blows.map((blow) => blow.source))).toEqual(new Set(['fakel']));
    expect(economy.points).toBe(30);
    expect(hud.showHitmarker).toHaveBeenCalledTimes(2);
    for (const zombie of zombies) expect(zombie.burning).toBe(flame.burnSeconds);
  });

  it('keeps burning them after the stream moves on, until the burn ends', () => {
    const zombie = new FakeZombie(0, -3);
    const { flames, fire, blows } = setup([zombie]);
    fire();
    const direct = blows.length;
    for (let t = 0; t < flame.burnSeconds + 0.5; t += 1 / 60) flames.update(1 / 60, true);
    const burn = blows.slice(direct).reduce((sum, blow) => sum + blow.damage, 0);
    expect(burn).toBeCloseTo(flame.burnSeconds * flame.burnDamagePerSecond, 3);
    expect(flames.burningCount).toBe(0);
  });

  it('credits a burn kill to the weapon and never bites the corpse again', () => {
    const zombie = new FakeZombie(0, -3, WEAPON_DEFINITIONS.fakel.damage + 15);
    const { flames, fire, blows } = setup([zombie]);
    fire();
    for (let t = 0; t < flame.burnSeconds; t += 1 / 60) flames.update(1 / 60, true);
    const lethal = blows.filter((blow) => blow.lethal);
    expect(lethal).toHaveLength(1);
    expect(lethal[0].source).toBe('fakel');
    expect(blows[blows.length - 1].lethal).toBe(true);
  });

  it('is stopped by walls: nothing behind one burns', () => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.3));
    wall.position.set(0, 1.5, -2.5);
    wall.updateMatrixWorld(true);
    const behind = new FakeZombie(0, -4);
    const { fire, blows } = setup([behind], [wall]);
    fire();
    expect(blows).toHaveLength(0);
    expect(behind.burning).toBe(0);
  });

  it('stops the burns biting once the run is over and forgets them on reset', () => {
    const zombie = new FakeZombie(0, -3);
    const { flames, fire, blows } = setup([zombie]);
    fire();
    const direct = blows.length;
    flames.update(1, false);
    expect(blows).toHaveLength(direct);
    flames.reset();
    expect(flames.burningCount).toBe(0);
  });

  it('draws the stream only while it is fed, then lets it die out', () => {
    const { flames, scene, weapon } = setup([]);
    const jet = scene.getObjectByName('flame-jet')!;
    for (let t = 0; t < 1; t += 1 / 120) {
      weapon.update(1 / 120, { trigger: true, ads: false });
      weapon.clearEvents();
      flames.update(1 / 120, true);
    }
    expect(jet.visible).toBe(true);
    for (let t = 0; t < 1; t += 1 / 120) {
      weapon.update(1 / 120, { trigger: false, ads: false });
      flames.update(1 / 120, true);
    }
    expect(jet.visible).toBe(false);
  });
});

describe('ФАКЕЛ-33 weapon station', () => {
  function station(power: MapPower): { station: WeaponStation; group: THREE.Group; solids: number[] } {
    const group = new THREE.Group();
    const solids: number[] = [];
    const material = new THREE.MeshBasicMaterial();
    const look: WeaponStationLook = {
      materials: { greySteel: material, paintedSteel: material, rubber: material },
      plate: { geometry: new THREE.PlaneGeometry(0.7, 0.35), material },
      glowColor: 0xff2416,
      spares: 2,
      mainsGlowBoost: 1.9,
    };
    const kit = {
      group,
      batch: new StaticMeshBatch(),
      collider: material,
      structure: { addBox: (...args: number[]) => solids.push(args[3] * args[5]) },
    };
    // Only the power gate here: the map's own run challenges are not this test's concern.
    const placement = { ...STATION33_WEAPON_STATIONS[0], requiresStartupCrystal: false };
    return { station: new WeaponStation(kit as never, placement, look, power), group, solids };
  }

  it('stands in the machine room, sells the weapon at 3500 and its crystals at 1750', () => {
    const [config] = STATION33_WEAPON_STATIONS;
    expect(config.weaponId).toBe('fakel');
    expect([config.price, config.ammoPrice]).toEqual([3500, 1750]);
    expect(config.requiresPower).toBe(true);
    expect(station33ZoneAt(config.x, config.z - 0.5)).toBe('subestacion');
    expect(config.z).toBe(SUBESTACION.hall.maxZ);
  });

  it('waits dark for the power, is solid, and shows the weapon until it is taken', () => {
    const power = new MapPower();
    const { station: cabinet, group, solids } = station(power);
    expect(solids).toHaveLength(1);
    expect(cabinet.powered).toBe(false);
    const spare = group.getObjectByName('weapon-station-spare') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    cabinet.update(1);
    expect(spare.material.emissiveIntensity).toBe(0);
    power.switchOn();
    for (let t = 0; t < 2; t += 0.1) cabinet.update(0.1);
    expect(cabinet.powered).toBe(true);
    expect(spare.material.emissiveIntensity).toBeGreaterThan(0.5);
    const weapon = group.getObjectByName('weapon-station-weapon')!;
    cabinet.setOwned(true);
    expect(weapon.visible).toBe(false);
    power.reset();
    cabinet.reset();
    expect(weapon.visible).toBe(true);
    expect(cabinet.powered).toBe(false);
  });

  function mode(points: number, powered: boolean, owned = false) {
    const mode = new ZombiesMode('station-33');
    const economy = new PlayerEconomy();
    while (points >= 10) {
      economy.awardHit();
      points -= 10;
    }
    const grants: string[] = [];
    let refills = 0;
    let activations = 0;
    const cabinet = {
      ...STATION33_WEAPON_STATIONS[0], position: { x: 0, y: 1.3, z: 0 }, floor: 0, useRange: 2, lookDotMin: 0.5,
      powered, setOwned: () => undefined, activate: () => { activations++; },
    };
    const internals = mode as unknown as Record<string, unknown>;
    internals.economy = economy;
    internals.gameOver = false;
    internals.ctx = {
      profile: { useTouchControls: false },
      hasWeapon: () => owned,
      canGrantWeapon: () => true,
      grantWeapon: (id: string) => { grants.push(id); return true; },
      canRefillWeaponAmmo: () => true,
      refillWeaponAmmo: () => { refills++; return true; },
      hud: { flashNotEnoughPoints: () => undefined, showRoundBanner: () => undefined, updateZombies: () => undefined },
    };
    for (const name of ['findFacingDoor', 'findRepairableBarrier', 'findFacingSoulLamp', 'findFacingRitualCircle', 'findFacingWallBuy']) {
      internals[name] = () => null;
    }
    internals.findFacingWeaponStation = () => cabinet;
    return { mode, economy, grants, refills: () => refills, activations: () => activations };
  }

  it('says the power is missing and sells nothing until the switch is thrown', () => {
    const { mode: run, economy, grants } = mode(4000, false);
    expect(run.getInteractPrompt()).toBe('ФАКЕЛ-33\nTHE POWER MUST BE TURNED ON');
    run.onInteract();
    expect(economy.points).toBe(4000);
    expect(grants).toEqual([]);
  });

  it('sells the weapon on the mains, then refills its core crystals', () => {
    const buy = mode(4000, true);
    expect(buy.mode.getInteractPrompt()).toBe('BUY ФАКЕЛ-33\nPress E — 3500 PTS');
    buy.mode.onInteract();
    expect(buy.grants).toEqual(['fakel']);
    expect(buy.economy.points).toBe(500);
    expect(buy.activations()).toBe(1);

    const refill = mode(2000, true, true);
    expect(refill.mode.getInteractPrompt()).toBe('ФАКЕЛ-33 CORE CRYSTALS\nPress E — 1750 PTS');
    refill.mode.onInteract();
    expect(refill.refills()).toBe(1);
    expect(refill.economy.points).toBe(250);
  });
});

describe('Burnt to death', () => {
  function burnKill() {
    const manager = new ZombieManager(() => 0);
    manager.registerColliders([]);
    expect(manager.spawnZombie(roundConfig(1), 0, -5, 1)).toBe(true);
    const zombie = [...manager.actives][0];
    for (let t = 0; t < 1.2; t += 1 / 60) zombie.update(1 / 60);
    expect(manager.damageZombie(zombie, 'torso', 5000, 'fakel')).toBe(true);
    const materials: THREE.MeshStandardMaterial[] = [];
    zombie.group.traverse((object) => {
      const material = (object as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (material?.userData?.zombieChar) materials.push(material);
    });
    return { manager, zombie, materials };
  }
  const charOf = (material: THREE.MeshStandardMaterial): number => material.userData.zombieChar.uCharAmount.value;

  it('falls with its own death, chars to charcoal with glowing cracks and bleeds on the floor', () => {
    const { manager, zombie, materials } = burnKill();
    expect(zombie.deathStyle).toBe('burn');
    expect(materials.length).toBeGreaterThan(0);
    for (let t = 0; t < 1.5; t += 1 / 60) zombie.update(1 / 60);
    for (const material of materials) {
      expect(charOf(material)).toBe(1);
      expect(material.userData.zombieChar.uCharEmber.value).toBeGreaterThan(0.5);
    }
    const pool = zombie.group.getObjectByName('zombie-blood-pool')!;
    expect(pool.visible).toBe(true);
    expect(zombie.group.getObjectByName('zombie-flames')!.visible).toBe(true);
    expect(zombie.group.getObjectByName('zombie-burn-embers')!.visible).toBe(true);
    manager.dispose();
  });

  it('is clean again when the pooled body respawns', () => {
    const { manager, zombie, materials } = burnKill();
    for (let t = 0; t < 1; t += 1 / 60) zombie.update(1 / 60);
    zombie.spawn(0, -5, 100, 1);
    for (const material of materials) expect(charOf(material)).toBe(0);
    expect(zombie.group.getObjectByName('zombie-blood-pool')!.visible).toBe(false);
    expect(zombie.group.getObjectByName('zombie-flames')!.visible).toBe(false);
    manager.dispose();
  });
});
