import * as THREE from 'three';
import type { PlayerEconomy } from '../game/PlayerEconomy';
import type { Weapon } from '../weapons/Weapon';
import type { WeaponId } from '../weapons/WeaponTypes';
import { FlameJet } from '../zombies/FlameJet';
import { selectFlameTargets, type FlameHit } from '../zombies/FlameTargeting';
import type { Zombie } from '../zombies/Zombie';
import { ZombieBurns } from '../zombies/ZombieBurns';
import type { ZombieManager } from '../zombies/ZombieManager';
import type { ModeContext } from './GameMode';

/** Height above the feet a line of sight aims at: the torso. */
const TORSO_HEIGHT = 1.1;
/** Slack before a body, so its own collider never blocks the sight line to it. */
const SIGHT_SLACK = 0.3;

/**
 * Flame weapons in a single-player run (ФАКЕЛ-33). Each shot event is one
 * tick of the stream: it scorches the living zombies of the player's floor
 * inside the cone and in sight (walls and closed doors stop it), sets them
 * burning and pays one hit reward per fresh ignition; a burn keeps biting
 * after they leave the stream and every bite and kill is the weapon's own,
 * so rewards and death styles follow the usual rules. It also draws the
 * world-space stream from the nozzle to its reach or to the wall that cuts
 * it. `ZombiesMode` delegates every flame concern here.
 */
export class ZombiesFlames {
  private readonly burns = new ZombieBurns<Zombie>();
  private readonly jet = new FlameJet();
  private readonly raycaster = new THREE.Raycaster();
  private readonly rayHits: THREE.Intersection[] = [];
  private readonly candidates: Zombie[] = [];
  private readonly hits: FlameHit<Zombie>[] = [];
  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly muzzle = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly torso = new THREE.Vector3();
  /** Reach of the last flame weapon, kept so a cut stream fades out where it was. */
  private range = 0;

  constructor(
    private readonly ctx: ModeContext,
    private readonly zombies: ZombieManager,
    private readonly economy: PlayerEconomy,
    /** The arena's static colliders: walls, solids and closed doors. */
    private readonly staticColliders: () => ReadonlyArray<THREE.Object3D>,
    private readonly damageScale: (id: WeaponId) => number,
  ) {
    ctx.scene.add(this.jet.group);
  }

  /** Zombies burning right now. */
  get burningCount(): number {
    return this.burns.count;
  }

  /** One tick of the stream of `weapon`, fired from the camera along `direction`. */
  fire(weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3): void {
    const flame = weapon.definition.flame;
    if (!flame) return;
    this.range = flame.range;
    const reach = this.reachAlong(origin, direction, flame.range);
    const floor = this.ctx.player.floor;
    this.candidates.length = 0;
    for (const zombie of this.zombies.actives) {
      if (zombie.isAlive && zombie.floor === floor) this.candidates.push(zombie);
    }
    selectFlameTargets(origin, direction, reach, this.candidates, flame, this.hits);
    const { id, damage } = weapon.definition;
    const scale = this.damageScale(id);
    let nearest = Infinity;
    for (const { target, distance } of this.hits) {
      if (!this.inSight(origin, target, distance)) continue;
      nearest = Math.min(nearest, distance);
      // The fire stays on the body, alive or falling.
      target.ignite(flame.burnSeconds);
      if (this.zombies.damageZombie(target, 'torso', damage * scale, id)) continue;
      if (this.burns.ignite(target, flame.burnSeconds, flame.burnDamagePerSecond * scale, id)) this.economy.awardHit(false);
    }
    if (nearest < Infinity) {
      this.ctx.stats.registerHit(nearest);
      this.ctx.hud.showHitmarker(false);
    }
  }

  /** `runLive` false (game over, ending) lets the stream fade but stops the burns biting. */
  update(dt: number, runLive: boolean): void {
    if (runLive && this.burns.count > 0) {
      this.burns.update(dt, (zombie, damage, source) => {
        this.zombies.damageZombie(zombie, 'torso', damage, source);
      });
    }
    const weapon = this.ctx.getEquippedWeapon();
    const flame = weapon.definition.flame;
    const active = runLive && flame !== undefined && weapon.isFiring;
    if (!active && !this.jet.burning) return;
    if (flame) this.range = flame.range;
    const camera = this.ctx.player.camera;
    camera.getWorldPosition(this.origin);
    camera.getWorldDirection(this.direction);
    const reach = this.reachAlong(this.origin, this.direction, this.range);
    this.end.copy(this.origin).addScaledVector(this.direction, reach);
    this.ctx.getMuzzleWorldPosition(this.muzzle);
    this.jet.update(dt, active, this.muzzle, this.end);
  }

  /** Restart: nobody burns and the stream is gone. */
  reset(): void {
    this.burns.reset();
    this.jet.reset();
  }

  /** Distance the stream travels along a ray before a wall cuts it. */
  private reachAlong(origin: THREE.Vector3, direction: THREE.Vector3, range: number): number {
    this.raycaster.set(origin, direction);
    this.raycaster.near = 0;
    this.raycaster.far = range;
    this.rayHits.length = 0;
    this.raycaster.intersectObjects(this.staticColliders() as THREE.Object3D[], false, this.rayHits);
    return this.rayHits.length > 0 ? this.rayHits[0].distance : range;
  }

  private inSight(origin: THREE.Vector3, zombie: Zombie, distance: number): boolean {
    this.torso.set(zombie.position.x, zombie.position.y + TORSO_HEIGHT, zombie.position.z).sub(origin);
    const length = this.torso.length();
    if (length < 1e-4) return true;
    this.raycaster.set(origin, this.torso.divideScalar(length));
    this.raycaster.near = 0;
    this.raycaster.far = Math.max(0, Math.min(length, distance) - SIGHT_SLACK);
    this.rayHits.length = 0;
    this.raycaster.intersectObjects(this.staticColliders() as THREE.Object3D[], false, this.rayHits);
    return this.rayHits.length === 0;
  }
}
