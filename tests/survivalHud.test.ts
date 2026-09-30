import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerEconomy } from '../src/game/PlayerEconomy';
import { lampProgress, roundMarks } from '../src/ui/SurvivalPresentation';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { roundConfig } from '../src/zombies/ZombieConfig';

describe('survival statistics', () => {
  it('keeps all rewards in earned points across spending and resets the run', () => {
    const economy = new PlayerEconomy();
    economy.awardHit();
    economy.awardHit(true);
    economy.awardKill(false);
    economy.awardKill(true);
    economy.awardKnifeKill();
    economy.awardRepair();
    expect(economy.totalEarned).toBe(570);
    expect(economy.spend(200)).toBe(true);
    expect(economy.spend(1000)).toBe(false);
    expect(economy.points).toBe(370);
    expect(economy.totalEarned).toBe(570);
    economy.reset();
    expect(economy.totalEarned).toBe(0);
    expect(economy.points).toBe(0);
  });

  it('counts actual damage once across bullets, melee, chains and splash, without overkill', () => {
    const manager = new ZombieManager(() => 0);
    manager.registerColliders([]);
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const [a, b] = [...manager.actives];
    a.position.set(0, 0, 0);
    b.position.set(1, 0, 0);
    let damage = 0;
    const headshotKills: boolean[] = [];
    manager.onZombieDamaged = (amount) => { damage += amount; };
    manager.onZombieKilled = (_zombie, headshot) => headshotKills.push(headshot);
    manager.damageZombie(a, 'head', 10); // 30, survives
    expect(headshotKills).toEqual([]);
    manager.applyChainLightning(a, 10); // 10 each
    manager.damageZombie(a, 'torso', 10, 'knife');
    manager.applySplash(new THREE.Vector3(), 3, 10);
    expect(damage).toBeCloseTo(30 + 20 + 10 + 10 + 10 * (1 - 1 / 3));
    manager.damageZombie(a, 'head', 10000);
    manager.damageZombie(b, 'torso', 10000);
    expect(damage).toBe(200);
    expect(headshotKills).toEqual([true, false]);
    manager.damageZombie(a, 'head', 10000);
    expect(damage).toBe(200);
    expect(headshotKills).toHaveLength(2);
  });
});

describe('survival presentation', () => {
  it.each([0, 1, 3])('renders %i activated lamps without exposing their purpose', (on) => {
    const markup = lampProgress(Array.from({ length: 3 }, (_, i) => i < on));
    expect(markup).toContain(`${on} / 3`);
    expect(markup).toContain(`${on} encendidos · ${3 - on} apagados`);
    expect(markup.match(/aria-label="Farol/g)).toHaveLength(3);
    expect(markup.match(/class="lamp lit"/g) ?? []).toHaveLength(on);
    expect(markup).not.toMatch(/secret|sala|alma|recompensa|desbloque/i);
  });

  it('uses the supplied count, including zero and maps with more than six lamps', () => {
    expect(lampProgress([])).toContain('0 / 0');
    expect(lampProgress(Array(9).fill(true))).toContain('9 / 9');
  });

  it('omits the HUD summary while retaining accessible lamp states and pause detail', () => {
    const lamps = [true, false, false];
    const compact = lampProgress(lamps, true);
    expect(compact).not.toContain('lamp-summary');
    expect(compact).toContain('1 / 3');
    expect(compact).toContain('Farol 1: encendido');
    expect(compact).toContain('Farol 2: apagado');
    expect(lampProgress(lamps)).toContain('1 encendidos · 2 apagados');
  });

  it('bounds scratch marks while keeping the exact high round legible', () => {
    expect(roundMarks(5).match(/<i>/g)).toHaveLength(5);
    expect(roundMarks(12345)).toContain('12345');
    expect(roundMarks(12345).match(/<i>/g)).toHaveLength(3);
  });
});
