import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { PlayerEconomy } from '../src/game/PlayerEconomy';
import { ZombiesWindShots } from '../src/modes/ZombiesWindShots';
import { Weapon } from '../src/weapons/Weapon';
import type { ZombieKillSource } from '../src/zombies/ZombieDeath';

const definition = WEAPON_DEFINITIONS.exhalis;
const wind = definition.wind!;
const DT = 1 / 60;
const EYE = new THREE.Vector3(0, 1.6, 0);
const NORTH = new THREE.Vector3(0, 0, -1);

/** A stand-in zombie with a torso hitbox the shot can strike. */
class FakeZombie {
  readonly position: THREE.Vector3;
  readonly hitbox: THREE.Mesh;
  isAlive = true;
  constructor(x: number, z: number, public hp = 2000) {
    this.position = new THREE.Vector3(x, 0, z);
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.5));
    this.hitbox.position.set(x, 0.9, z);
    this.hitbox.userData.zombie = this;
    this.hitbox.userData.hitPart = 'torso';
    this.hitbox.updateMatrixWorld(true);
  }
}

interface Shove {
  readonly zombie: FakeZombie;
  readonly dirX: number;
  readonly dirZ: number;
  readonly distance: number;
  readonly seconds: number;
}

function wall(x: number, z: number, width: number, depth: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 3, depth));
  mesh.position.set(x, 1.5, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function setup(zombies: FakeZombie[], walls: THREE.Object3D[] = [], options: { scale?: number; guardian?: THREE.Object3D } = {}) {
  const camera = new THREE.PerspectiveCamera();
  camera.position.copy(EYE);
  camera.updateMatrixWorld(true);
  const blows: { zombie: FakeZombie; damage: number; part: string; source: ZombieKillSource | undefined }[] = [];
  const shoves: Shove[] = [];
  const manager = {
    actives: new Set(zombies),
    damageZombie: (zombie: FakeZombie, part: string, damage: number, source?: ZombieKillSource): boolean => {
      blows.push({ zombie, damage, part, source });
      zombie.hp -= damage;
      if (zombie.hp <= 0) zombie.isAlive = false;
      return !zombie.isAlive;
    },
    knockBack: (zombie: FakeZombie, dirX: number, dirZ: number, distance: number, seconds: number): boolean => {
      shoves.push({ zombie, dirX, dirZ, distance, seconds });
      return true;
    },
  };
  const ctx = {
    scene: new THREE.Scene(),
    hitColliders: [...zombies.map((zombie) => zombie.hitbox), ...walls, ...(options.guardian ? [options.guardian] : [])],
    profile: { useReducedEffects: false },
    player: { camera },
    hud: { showHitmarker: vi.fn() },
    stats: { registerHit: vi.fn() },
    audio: { playWindImpact: vi.fn(), playHeadshotHit: vi.fn() },
  };
  const economy = new PlayerEconomy();
  const guardianStrikes: number[] = [];
  const shots = new ZombiesWindShots(ctx as never, manager as never, economy, () => walls, () => options.scale ?? 1,
    (object, damage) => {
      if (object !== options.guardian) return false;
      guardianStrikes.push(damage);
      return true;
    });
  const weapon = new Weapon(definition, () => 0.5);
  const fire = (direction = NORTH): void => {
    shots.fire(weapon, EYE.clone(), direction.clone().normalize());
    for (let t = 0; t < 1.2; t += DT) shots.update(DT);
  };
  return { fire, blows, shoves, economy, ctx, guardianStrikes, shots };
}

describe('EXHALIS wind shots', () => {
  it('hits the body struck for the weapon\'s damage and shoves the crowd around it away from the player', () => {
    const struck = new FakeZombie(0, -6);
    const beside = new FakeZombie(1.2, -6.4);
    const behind = new FakeZombie(-0.6, -7.8);
    const far = new FakeZombie(0, -10);
    const { fire, blows, shoves, economy, ctx } = setup([struck, beside, behind, far]);
    fire();

    expect(blows[0]).toMatchObject({ zombie: struck, damage: definition.damage, source: 'exhalis' });
    expect(economy.points).toBeGreaterThan(0);
    expect(ctx.hud.showHitmarker).toHaveBeenCalledWith(false, false);
    expect(ctx.audio.playWindImpact).toHaveBeenCalledTimes(1);
    expect(ctx.stats.registerHit).toHaveBeenCalledTimes(1);

    const burst = blows.slice(1);
    expect(burst.map((blow) => blow.zombie)).toEqual([beside, behind]);
    for (const blow of burst) {
      expect(blow.source).toBe('exhalis');
      expect(blow.damage).toBeGreaterThan(0);
      expect(blow.damage).toBeLessThan(wind.burstDamage);
    }

    expect(shoves.map((shove) => shove.zombie)).toEqual([struck, beside, behind]);
    for (const shove of shoves) {
      // Away from the player at the origin: every shove points north-ish, from the player to the body.
      const { x, z } = shove.zombie.position;
      const away = Math.hypot(x, z);
      expect((shove.dirX * x + shove.dirZ * z) / away).toBeCloseTo(1, 5);
      expect(shove.seconds).toBe(wind.pushSeconds);
    }
    expect(shoves[0].distance).toBeGreaterThan(wind.pushDistance * 0.9);
    expect(shoves[0].distance).toBeLessThanOrEqual(wind.pushDistance);
    expect(shoves[2].distance).toBeLessThan(shoves[0].distance);
    expect(shoves[2].distance).toBeGreaterThanOrEqual(wind.pushDistance * wind.edgePush);
  });

  it('leaves bodies the burst cannot see behind a wall untouched', () => {
    const struck = new FakeZombie(0, -6);
    const hidden = new FakeZombie(2, -6);
    const { fire, blows, shoves } = setup([struck, hidden], [wall(1, -6, 0.3, 3)]);
    fire();
    expect(blows.map((blow) => blow.zombie)).toEqual([struck]);
    expect(shoves.map((shove) => shove.zombie)).toEqual([struck]);
  });

  it('bursts on a wall it strikes, shoving the bodies in front of it without a direct hit', () => {
    const near = new FakeZombie(1.5, -6.4);
    const { fire, blows, shoves, economy, ctx } = setup([near], [wall(0, -7, 4, 0.4)]);
    fire();
    expect(blows).toHaveLength(1);
    expect(blows[0].damage).toBeLessThan(wind.burstDamage);
    expect(shoves.map((shove) => shove.zombie)).toEqual([near]);
    // The burst pays for kills only, never for touching a body.
    expect(economy.points).toBe(0);
    expect(ctx.hud.showHitmarker).toHaveBeenCalledWith(false);
  });

  it('disperses where its reach runs out, still shoving what stands there', () => {
    const distant = new FakeZombie(0.5, -wind.range - 0.5);
    const { shots, blows, shoves } = setup([distant]);
    shots.fire(new Weapon(definition, () => 0.5), EYE.clone(), new THREE.Vector3(0, -0.005, -1).normalize());
    for (let t = 0; t < 0.5; t += DT) shots.update(DT);
    expect(shoves).toHaveLength(0);
    for (let t = 0; t < 1; t += DT) shots.update(DT);
    expect(blows).toHaveLength(1);
    expect(shoves.map((shove) => shove.zombie)).toEqual([distant]);
  });

  it('never shoves a body the burst killed, and scales both damages with the weapon', () => {
    const struck = new FakeZombie(0, -6);
    const frail = new FakeZombie(1, -6, 1);
    const { fire, blows, shoves } = setup([struck, frail], [], { scale: 2 });
    fire();
    expect(blows[0].damage).toBe(definition.damage * 2);
    expect(frail.isAlive).toBe(false);
    expect(shoves.map((shove) => shove.zombie)).toEqual([struck]);
  });

  it('spends itself on a guardian: its damage, no burst', () => {
    const guardian = wall(0, -6, 1, 1);
    const crowd = new FakeZombie(1, -6.5);
    const { fire, blows, shoves, guardianStrikes } = setup([crowd], [], { guardian });
    fire();
    expect(guardianStrikes).toEqual([definition.damage]);
    expect(blows).toHaveLength(0);
    expect(shoves).toHaveLength(0);
  });

  it('forgets every shot in flight on reset', () => {
    const struck = new FakeZombie(0, -30);
    const { shots, shoves } = setup([struck]);
    shots.fire(new Weapon(definition, () => 0.5), EYE.clone(), NORTH.clone());
    shots.update(DT);
    shots.reset();
    for (let t = 0; t < 1; t += DT) shots.update(DT);
    expect(shoves).toHaveLength(0);
  });
});
