import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { PlayerEconomy } from '../src/game/PlayerEconomy';
import { ZombiesFlames } from '../src/modes/ZombiesFlames';
import { VORTEX9_NEON_GREEN, type Vortex9DissolveUniforms } from '../src/rendering/Vortex9DissolveShader';
import { Weapon } from '../src/weapons/Weapon';
import { flameShotLook } from '../src/weapons/WeaponShotLook';
import { WeaponView } from '../src/weapons/WeaponView';
import { FlameJet } from '../src/zombies/FlameJet';
import { FlameParticles } from '../src/zombies/FlameParticles';
import { Zombie, type ZombieForgedDeath } from '../src/zombies/Zombie';
import { roundConfig, ZOMBIE_CINDER_DEATH, ZOMBIE_SPAWN_DURATION } from '../src/zombies/ZombieConfig';
import type { ZombieKillSource } from '../src/zombies/ZombieDeath';
import { ZOMBIE_DEATH_PROFILES } from '../src/zombies/ZombieDeath';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { KOVKA_WEAPON_FINISH } from '../src/zombies/maps/Station33Config';

const DT = 1 / 60;
const LOOK = flameShotLook('fakel', KOVKA_WEAPON_FINISH.shots)!;
const CINDER: ZombieForgedDeath = { kind: 'cinder', detailed: true };
const originalDocument = globalThis.document;

// Soft-dot and flash textures are drawn on a canvas.
beforeAll(() => {
  const context = {
    createRadialGradient: () => ({ addColorStop: () => undefined }), fillStyle: '', fillRect: () => undefined,
    beginPath: () => undefined, arc: () => undefined, fill: () => undefined, clearRect: () => undefined, fillText: () => undefined,
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

afterEach(() => {
  vi.restoreAllMocks();
});

function isBlue(color: THREE.Color): boolean {
  return color.b > color.r * 1.5 && color.b > color.g * 1.2;
}

function shaderMaterials(root: THREE.Object3D): Map<string, THREE.ShaderMaterial> {
  const materials = new Map<string, THREE.ShaderMaterial>();
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (material instanceof THREE.ShaderMaterial) materials.set(material.name, material);
  });
  return materials;
}

/** Seeded Math.random, so two runs of the particles draw the same puffs. */
function seedRandom(): void {
  let state = 12345;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  });
}

describe('Forged ФАКЕЛ-33 stream', () => {
  it('widens the rod and turns the stream and its ribbons to the finish colours; null restores its own fire', () => {
    const jet = new FlameJet();
    const materials = shaderMaterials(jet.group);
    const rod = materials.get('flame_jet_rod')!;
    const helix = materials.get('flame_jet_arcane_helix')!;
    const width = rod.uniforms.uWidth.value as number;
    expect(rod.uniforms.uLook.value).toBe(0);

    jet.setLook(LOOK);
    expect(rod.uniforms.uWidth.value).toBeCloseTo(width * LOOK.width);
    expect(rod.uniforms.uLook.value).toBe(1);
    expect(isBlue(rod.uniforms.uLookBody.value as THREE.Color)).toBe(true);
    expect(helix.uniforms.uSpread.value).toBeCloseTo(LOOK.width);
    expect(isBlue(helix.uniforms.uLookArcane.value as THREE.Color)).toBe(true);

    jet.setLook(null);
    expect(rod.uniforms.uWidth.value).toBeCloseTo(width);
    expect(rod.uniforms.uLook.value).toBe(0);
    expect(helix.uniforms.uSpread.value).toBe(1);
    jet.dispose();
  });

  it('throws its fire wider and blue, and keeps the reduced-effects puffs as small as the basic ones', () => {
    const lateral = (look: typeof LOOK | null, reduced = false): { spread: number; sizes: number[]; fire: THREE.ShaderMaterial } => {
      seedRandom();
      const particles = new FlameParticles(reduced);
      particles.setLook(look);
      const forward = new THREE.Vector3(0, 0, -1);
      for (let t = 0; t < 0.5; t += DT) {
        particles.emit(DT, new THREE.Vector3(), forward, Infinity);
        particles.update(DT);
      }
      const mesh = particles.group.getObjectByName('flame_fireballs') as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
      const offsets = mesh.geometry.getAttribute('aOffset');
      const sizes = mesh.geometry.getAttribute('aSize');
      let spread = 0;
      const sizeList: number[] = [];
      for (let index = 0; index < mesh.geometry.instanceCount; index++) {
        spread = Math.max(spread, Math.abs(offsets.getX(index)));
        sizeList.push(sizes.getX(index));
      }
      vi.restoreAllMocks();
      return { spread, sizes: sizeList, fire: mesh.material };
    };
    const plain = lateral(null);
    const forged = lateral(LOOK);
    expect(forged.spread).toBeGreaterThan(plain.spread * 1.3);
    expect(plain.fire.uniforms.uLook.value).toBe(0);
    expect(forged.fire.uniforms.uLook.value).toBe(1);
    expect(isBlue(forged.fire.uniforms.uLookBody.value as THREE.Color)).toBe(true);
    const total = (sizes: number[]): number => sizes.reduce((sum, size) => sum + size, 0);
    expect(total(forged.sizes)).toBeGreaterThan(total(plain.sizes));
    // Reduced effects: half the puffs, and no bigger than the basic ones (less overdraw).
    const reducedPlain = lateral(null, true);
    const reducedForged = lateral(LOOK, true);
    expect(reducedForged.sizes.length).toBeLessThan(forged.sizes.length);
    expect(total(reducedForged.sizes)).toBeCloseTo(total(reducedPlain.sizes), 6);
    expect(reducedForged.spread).toBeGreaterThan(reducedPlain.spread * 1.3);
  });
});

/** The crystal's faceted, see-through glass (its meshes are batched, so found by material). */
function crystalGlass(root: THREE.Object3D): THREE.MeshPhysicalMaterial {
  const found: THREE.MeshPhysicalMaterial[] = [];
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (material instanceof THREE.MeshPhysicalMaterial && material.flatShading && material.transparent) found.push(material);
  });
  if (found.length === 0) throw new Error('No crystal glass on the ФАКЕЛ-33 view');
  return found[0];
}

describe('Forged ФАКЕЛ-33 core crystal', () => {
  it('turns dark blue under the KOVKA finish and red again without it', () => {
    const view = new WeaponView(WEAPON_DEFINITIONS.fakel, null);
    const glass = crystalGlass(view.root);
    const energy = shaderMaterials(view.root).get('fakel_crystal_energy')!;
    const red = glass.emissive.getHex();
    expect(isBlue(glass.emissive)).toBe(false);

    view.setFinish(KOVKA_WEAPON_FINISH);
    expect(glass.color.getHex()).toBe(LOOK.crystal.glass);
    expect(glass.emissive.getHex()).toBe(LOOK.crystal.vein);
    expect(isBlue(energy.uniforms.uVein.value as THREE.Color)).toBe(true);

    view.setFinish(null);
    expect(glass.emissive.getHex()).toBe(red);
    expect(isBlue(energy.uniforms.uVein.value as THREE.Color)).toBe(false);
  });
});

/** A stand-in zombie for the stream: feet position, floor, health and the fire on its body. */
class FakeZombie {
  readonly position: THREE.Vector3;
  isAlive = true;
  burning = 0;
  readonly floor = 0;
  constructor(x: number, z: number, public hp = 10_000) {
    this.position = new THREE.Vector3(x, 0, z);
  }
  ignite(seconds: number): void {
    this.burning = Math.max(this.burning, seconds);
  }
}

describe('ZombiesFlames with a forged ФАКЕЛ-33', () => {
  function setup(zombies: FakeZombie[], forged: boolean) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 1.6, 0);
    camera.updateMatrixWorld(true);
    const weapon = new Weapon(WEAPON_DEFINITIONS.fakel, () => 0.5);
    const economy = new PlayerEconomy();
    const ctx = {
      scene,
      profile: { useReducedEffects: false },
      player: { floor: 0, camera },
      hud: { showHitmarker: vi.fn() },
      stats: { registerHit: vi.fn() },
      getEquippedWeapon: () => weapon,
      getMuzzleWorldPosition: (out: THREE.Vector3) => out.set(0.2, 1.4, -0.5),
    };
    const blows: { zombie: FakeZombie; source?: ZombieKillSource }[] = [];
    const disintegrated: { zombie: FakeZombie; source: ZombieKillSource; death: ZombieForgedDeath }[] = [];
    const manager = {
      actives: new Set(zombies),
      damageZombie: (zombie: FakeZombie, _part: string, damage: number, source?: ZombieKillSource) => {
        zombie.hp -= damage;
        blows.push({ zombie, source });
        if (zombie.hp > 0) return false;
        zombie.isAlive = false;
        return true;
      },
      disintegrateZombie: (zombie: FakeZombie, source: ZombieKillSource, death: ZombieForgedDeath) => {
        if (!zombie.isAlive) return false;
        zombie.isAlive = false;
        disintegrated.push({ zombie, source, death });
        return true;
      },
    };
    const flames = new ZombiesFlames(ctx as never, manager as never, economy, () => [], () => (forged ? 2 : 1),
      (id) => (forged && id === 'fakel' ? { look: LOOK, death: CINDER } : null));
    const fire = (): void => flames.fire(weapon, new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -1));
    return { flames, fire, blows, disintegrated, economy, scene, weapon };
  }

  it('burns every zombie it touches to cinders on first contact, once each, with no afterburn to pay or bite', () => {
    const zombies = [new FakeZombie(0, -2), new FakeZombie(0.3, -4), new FakeZombie(-0.3, -6)];
    const { fire, flames, blows, disintegrated, economy } = setup(zombies, true);
    fire();
    expect(disintegrated.map((entry) => entry.zombie)).toEqual(zombies);
    for (const entry of disintegrated) {
      expect(entry.source).toBe('fakel');
      expect(entry.death).toBe(CINDER);
    }
    expect(blows).toHaveLength(0);
    expect(flames.burningCount).toBe(0);
    // Kill rewards are the manager's; no ignition hit is paid on top.
    expect(economy.points).toBe(0);
    fire();
    flames.update(5, true);
    expect(disintegrated).toHaveLength(3);
    expect(blows).toHaveLength(0);
  });

  it('keeps the basic stream on its own damage, burns and fire', () => {
    const zombie = new FakeZombie(0, -3);
    const { fire, flames, blows, disintegrated, scene } = setup([zombie], false);
    fire();
    expect(disintegrated).toHaveLength(0);
    expect(blows).toHaveLength(1);
    expect(flames.burningCount).toBe(1);
    flames.update(DT, true);
    expect(shaderMaterials(scene).get('flame_jet_rod')!.uniforms.uLook.value).toBe(0);
  });

  it('dresses the stream in the forged look while the forged weapon is in hand', () => {
    const { flames, scene, weapon } = setup([], true);
    weapon.update(1, { trigger: true, ads: false });
    flames.update(DT, true);
    expect(shaderMaterials(scene).get('flame_jet_rod')!.uniforms.uLook.value).toBe(1);
  });
});

function standingZombie(): Zombie {
  const zombie = new Zombie();
  zombie.spawn(0, 0, 100, 1);
  zombie.update(ZOMBIE_SPAWN_DURATION, 0);
  return zombie;
}

function bodyMaterials(zombie: Zombie): THREE.MeshStandardMaterial[] {
  const materials = new Set<THREE.MeshStandardMaterial>();
  zombie.visual.root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial
      && object.material.userData.vortex9Dissolve) materials.add(object.material);
  });
  return [...materials];
}

const dissolveOf = (material: THREE.Material): Vortex9DissolveUniforms => material.userData.vortex9Dissolve as Vortex9DissolveUniforms;

function advance(zombie: Zombie, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) zombie.update(DT, 0);
}

const flamesOf = (zombie: Zombie): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> =>
  zombie.group.getObjectByName('zombie-flames') as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

describe('Burnt to cinders by the forged ФАКЕЛ-33', () => {
  it('writhes in its burn clip and is gone fast, in well under the time a normal burn death lingers', () => {
    expect(ZOMBIE_CINDER_DEATH.clip).toBe(ZOMBIE_DEATH_PROFILES.burn.duration);
    expect(ZOMBIE_CINDER_DEATH.disintegrateStart).toBeLessThanOrEqual(0.4);
    expect(ZOMBIE_CINDER_DEATH.duration).toBeGreaterThanOrEqual(0.9);
    expect(ZOMBIE_CINDER_DEATH.duration).toBeLessThanOrEqual(1.5);
  });

  it('only a lethal forged blow burns to cinders; other fire kills keep their burn death', () => {
    const plain = standingZombie();
    expect(plain.applyDamage(1000, false, 0, 5, 'fakel')).toBe(true);
    expect(plain.deathKind).toBe('normal');

    const cinder = standingZombie();
    expect(cinder.applyDamage(1000, false, 0, 5, 'fakel', CINDER)).toBe(true);
    expect(cinder.deathStyle).toBe('burn');
    expect(cinder.deathKind).toBe('cinder');
  });

  it('is engulfed in blue fire, dissolves in blue without a blood pool, and leaves no corpse', () => {
    const zombie = standingZombie();
    const finished = vi.fn();
    zombie.onDeathFinished = finished;
    zombie.applyDamage(1000, false, 0, 5, 'fakel', CINDER);
    const materials = bodyMaterials(zombie);
    expect(materials.length).toBeGreaterThan(0);

    // Past the killing blow's red flash, the body blazes blue.
    advance(zombie, 0.3);
    const fire = flamesOf(zombie);
    expect(fire.visible).toBe(true);
    expect(isBlue(fire.material.uniforms.uBody.value as THREE.Color)).toBe(true);
    expect(materials.some((material) => isBlue(material.emissive))).toBe(true);
    expect(isBlue(materials[0].userData.zombieChar.uCharEmberColor.value as THREE.Color)).toBe(true);

    advance(zombie, 0.35);
    const melting = dissolveOf(materials[0]);
    expect(melting.uDissolveProgress.value).toBeGreaterThan(0);
    expect(melting.uDissolveProgress.value).toBeLessThan(1);
    expect(isBlue(melting.uDissolveEdgeColor.value)).toBe(true);
    expect(zombie.group.getObjectByName('zombie-blood-pool')?.visible ?? false).toBe(false);
    expect(finished).not.toHaveBeenCalled();

    advance(zombie, ZOMBIE_CINDER_DEATH.duration);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(zombie.group.visible).toBe(false);
    expect(zombie.group.position.y).toBe(0);
  });

  it('comes back from the pool as an ordinary body with the basic fire and dissolve colours', () => {
    const zombie = standingZombie();
    const plainFire = (flamesOf(zombie).material.uniforms.uBody.value as THREE.Color).getHex();
    zombie.applyDamage(1000, false, 0, 5, 'fakel', CINDER);
    advance(zombie, ZOMBIE_CINDER_DEATH.disintegrateStart + 0.2);
    zombie.spawn(0, 0, 100, 1);
    zombie.update(DT, 0);
    for (const material of bodyMaterials(zombie)) {
      expect(dissolveOf(material).uDissolveProgress.value).toBe(0);
      expect(dissolveOf(material).uDissolveEdgeColor.value.getHex()).toBe(VORTEX9_NEON_GREEN);
      expect(material.userData.zombieChar.uCharAmount.value).toBe(0);
      expect(isBlue(material.userData.zombieChar.uCharEmberColor.value as THREE.Color)).toBe(false);
    }
    expect((flamesOf(zombie).material.uniforms.uBody.value as THREE.Color).getHex()).toBe(plainFire);
    // A basic burn death afterwards burns orange again.
    zombie.update(ZOMBIE_SPAWN_DURATION, 0);
    zombie.applyDamage(1000, false, 0, 5, 'fakel');
    expect(zombie.deathKind).toBe('normal');
    expect(isBlue(flamesOf(zombie).material.uniforms.uBody.value as THREE.Color)).toBe(false);
  });

  it('trims the ash on reduced effects', () => {
    const ashCount = (death: ZombieForgedDeath): number => {
      const zombie = standingZombie();
      zombie.applyDamage(1000, false, 0, 5, 'fakel', death);
      return (zombie.visual.root.getObjectByName('vortex9-ash-particles') as THREE.Points).geometry.drawRange.count;
    };
    expect(ashCount({ kind: 'cinder', detailed: false })).toBeLessThan(ashCount(CINDER));
  });
});

describe('ZombieManager.disintegrateZombie', () => {
  it('kills even a body far tougher than the blow at once, pulls it out of play and credits one kill', () => {
    const hitColliders: THREE.Object3D[] = [];
    const killed = vi.fn();
    const damaged = vi.fn();
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(hitColliders);
    manager.onZombieKilled = killed;
    manager.onZombieDamaged = damaged;
    expect(manager.spawnZombie(roundConfig(1), 0, 4)).toBe(true);
    const zombie = [...manager.actives][0];
    zombie.skipSpawnRise();
    zombie.hp = 50_000;
    expect(hitColliders).toHaveLength(2);

    expect(manager.disintegrateZombie(zombie, 'fakel', CINDER)).toBe(true);
    expect(zombie.isAlive).toBe(false);
    expect(zombie.deathKind).toBe('cinder');
    expect(hitColliders).toHaveLength(0);
    expect(killed).toHaveBeenCalledTimes(1);
    expect(killed).toHaveBeenCalledWith(zombie, false, 'fakel', expect.anything());
    expect(damaged).toHaveBeenCalledWith(50_000);
    expect(zombie.tryAttack()).toBe(false);

    // A corpse still in its death is never killed or rewarded twice.
    expect(manager.disintegrateZombie(zombie, 'fakel', CINDER)).toBe(false);
    expect(manager.damageZombie(zombie, 'torso', 1000, 'fakel')).toBe(false);
    expect(killed).toHaveBeenCalledTimes(1);
    manager.dispose();
  });
});
