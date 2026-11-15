import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Game } from '../src/core/Game';
import { Weapon } from '../src/weapons/Weapon';
import type { WeaponDefinition } from '../src/weapons/WeaponTypes';

interface ShotHarness {
  processWeaponEvents(): void;
}

/** Runs the shared shot routing without constructing a renderer or weapon view. */
function shotHarness(weapon: Weapon, handledByMode: boolean): {
  game: ShotHarness;
  modeDirections: THREE.Vector3[];
  ballisticDirections: THREE.Vector3[];
} {
  const modeDirections: THREE.Vector3[] = [];
  const ballisticDirections: THREE.Vector3[] = [];
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld(true);
  const view = {
    getMuzzleWorldPosition: (out: THREE.Vector3): THREE.Vector3 => out.set(0, 0, -0.5),
    onShot: vi.fn(),
  };
  const game = Object.create(Game.prototype) as ShotHarness;
  Object.assign(game, {
    inventory: { currentWeapon: weapon.definition.id },
    arsenal: new Map([[weapon.definition.id, { weapon, view }]]),
    profile: { useAdvancedRendering: false },
    player: { camera },
    stats: { registerShot: vi.fn() },
    audio: { playShot: vi.fn() },
    mode: {
      onWeaponFired: (_weapon: Weapon, _origin: THREE.Vector3, direction: THREE.Vector3): boolean => {
        modeDirections.push(direction.clone());
        return handledByMode;
      },
    },
    ballistics: {
      spawn: (_origin: THREE.Vector3, direction: THREE.Vector3): void => {
        ballisticDirections.push(direction.clone());
      },
    },
    barrelSmoke: { onShot: vi.fn() },
    ejectShell: vi.fn(),
    flashLight: new THREE.PointLight(),
    tmpOrigin: new THREE.Vector3(),
    tmpDirection: new THREE.Vector3(),
    tmpMuzzle: new THREE.Vector3(),
    tmpRight: new THREE.Vector3(),
    spreadRight: new THREE.Vector3(),
    spreadUp: new THREE.Vector3(),
  });
  return { game, modeDirections, ballisticDirections };
}

const FORWARD = new THREE.Vector3(0, 0, -1);

afterEach(() => vi.restoreAllMocks());

describe('Shared shot dispersion', () => {
  it.each([false, true])('gives ADS a tighter actual trajectory (mode handles shot: %s)', (handledByMode) => {
    // Identical cone samples isolate the hip/ADS accuracy difference.
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const hip = new Weapon(WEAPON_DEFINITIONS.m4a1, () => 0.5);
    const ads = new Weapon(WEAPON_DEFINITIONS.m4a1, () => 0.5);
    ads.adsAlpha = 1;
    hip.update(0, { trigger: true, ads: false });
    ads.update(0, { trigger: true, ads: true });
    const hipShot = shotHarness(hip, handledByMode);
    const adsShot = shotHarness(ads, handledByMode);

    hipShot.game.processWeaponEvents();
    adsShot.game.processWeaponEvents();

    const hipDirection = hipShot.modeDirections[0];
    const adsDirection = adsShot.modeDirections[0];
    const hipAngle = hipDirection.angleTo(FORWARD);
    const adsAngle = adsDirection.angleTo(FORWARD);
    expect(hipDirection.length()).toBeCloseTo(1, 12);
    expect(adsDirection.length()).toBeCloseTo(1, 12);
    expect(hipAngle).toBeGreaterThan(adsAngle * 4);
    // A representative shot stays useful nearby but can miss a torso farther away.
    expect(Math.tan(hipAngle) * 5).toBeLessThan(0.25);
    expect(Math.tan(hipAngle) * 30).toBeGreaterThan(0.5);
    expect(Math.tan(adsAngle) * 30).toBeLessThan(0.1);
    if (handledByMode) {
      expect(hipShot.ballisticDirections).toHaveLength(0);
      expect(adsShot.ballisticDirections).toHaveLength(0);
    } else {
      expect(hipShot.ballisticDirections).toEqual([hipDirection]);
      expect(adsShot.ballisticDirections).toEqual([adsDirection]);
    }
  });

  it('uses each round’s own spread when a frame queues several automatic shots', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const definition: WeaponDefinition = {
      ...WEAPON_DEFINITIONS.m4a1,
      rpm: 1200,
      magazineSize: 100,
      heat: undefined,
      spread: {
        hipBase: 0.02,
        adsBase: 0.001,
        bloomPerShot: 0.005,
        maxBloom: 0.04,
        bloomRecovery: 0,
      },
    };
    const weapon = new Weapon(definition, () => 0.5);
    weapon.update(0, { trigger: true, ads: false });
    weapon.update(0.2, { trigger: true, ads: false });
    const shot = shotHarness(weapon, false);

    shot.game.processWeaponEvents();

    expect(shot.ballisticDirections).toHaveLength(5);
    const angles = shot.ballisticDirections.map((direction) => direction.angleTo(FORWARD));
    expect(Math.tan(angles[0])).toBeCloseTo(definition.spread.hipBase * 0.5, 10);
    for (let index = 1; index < angles.length; index++) {
      expect(angles[index]).toBeGreaterThan(angles[index - 1]);
    }
    expect(shot.modeDirections).toEqual(shot.ballisticDirections);
    expect(weapon.pendingEvents).toHaveLength(0);
  });
});
