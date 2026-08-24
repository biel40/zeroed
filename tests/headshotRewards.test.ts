import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { HEADSHOT_POINTS } from '../src/game/CombatConfig';
import { PlayerEconomy } from '../src/game/PlayerEconomy';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { HitTarget } from '../src/shooting/HitTarget';
import { Weapon } from '../src/weapons/Weapon';
import type { WeaponId } from '../src/weapons/WeaponTypes';
import type { Zombie } from '../src/zombies/Zombie';
import type { ZombieHitPart } from '../src/zombies/ZombieConfig';

const STANDARD_FIREARMS: readonly WeaponId[] = ['m1911', 'm4a1', 'ak47', 'm60', 'l96'];
const TARGET: HitTarget = { acceptsDecals: false, surface: 'flesh', onHit: () => undefined };

function hitZombie(weaponId: WeaponId, part: ZombieHitPart, lethal: boolean) {
  const mode = new ZombiesMode();
  const economy = new PlayerEconomy();
  const calls: Array<{ part: ZombieHitPart; damage: number }> = [];
  const zombie = {} as Zombie;
  const showHitmarker = vi.fn();
  const playZombieHit = vi.fn();
  const playHeadshotHit = vi.fn();
  const playZombieDeath = vi.fn();

  (mode as unknown as { economy: PlayerEconomy }).economy = economy;
  (mode as unknown as { ctx: unknown }).ctx = {
    stats: { registerHit: () => undefined },
    hud: { showHitmarker },
    audio: { playZombieHit, playHeadshotHit, playZombieDeath },
    effects: { puff: () => undefined },
  };
  (mode as unknown as { zombies: unknown }).zombies = {
    damageZombie: (_zombie: Zombie, hitPart: ZombieHitPart, damage: number) => {
      calls.push({ part: hitPart, damage });
      if (lethal) {
        const onKilled = (mode as unknown as { onZombieKilled: (headshot: boolean) => void })
          .onZombieKilled;
        onKilled.call(mode, hitPart === 'head');
      }
      return lethal;
    },
  };

  const object = new THREE.Object3D();
  object.userData.zombie = zombie;
  object.userData.hitPart = part;
  mode.onTargetHit(
    TARGET,
    10,
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
    object,
    new Weapon(WEAPON_DEFINITIONS[weaponId]),
  );

  return { calls, points: economy.points, showHitmarker, playZombieHit, playHeadshotHit, playZombieDeath };
}

describe('global firearm headshot rewards', () => {
  it.each(STANDARD_FIREARMS)('%s routes head hits through shared damage and awards 150', (weaponId) => {
    const result = hitZombie(weaponId, 'head', false);
    expect(result.calls).toEqual([{ part: 'head', damage: WEAPON_DEFINITIONS[weaponId].damage }]);
    expect(result.points).toBe(HEADSHOT_POINTS);
    expect(result.showHitmarker).toHaveBeenCalledOnce();
    expect(result.showHitmarker).toHaveBeenCalledWith(true);
    expect(result.playZombieHit).not.toHaveBeenCalled();
    expect(result.playHeadshotHit).toHaveBeenCalledOnce();
  });

  it('keeps body-hit scoring unchanged', () => {
    const result = hitZombie('m4a1', 'torso', false);
    expect(result.points).toBe(10);
    expect(result.showHitmarker).toHaveBeenCalledOnce();
    expect(result.showHitmarker).toHaveBeenCalledWith(false);
    expect(result.playZombieHit).toHaveBeenCalledOnce();
    expect(result.playHeadshotHit).not.toHaveBeenCalled();
  });

  it('awards a lethal headshot exactly once', () => {
    const result = hitZombie('m4a1', 'head', true);
    expect(result.points).toBe(HEADSHOT_POINTS);
    expect(result.showHitmarker).toHaveBeenCalledOnce();
    expect(result.showHitmarker).toHaveBeenCalledWith(true);
    expect(result.playHeadshotHit).toHaveBeenCalledOnce();
    expect(result.playZombieDeath).not.toHaveBeenCalled();
  });
});
