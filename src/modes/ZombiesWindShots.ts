import * as THREE from 'three';
import { WEAPON_DEFINITIONS } from '../config/weapons';
import type { PlayerEconomy } from '../game/PlayerEconomy';
import type { Weapon } from '../weapons/Weapon';
import type { WeaponId } from '../weapons/WeaponTypes';
import { selectWindConeTargets, selectWindGustTargets, type WindGustHit } from '../zombies/WindGust';
import { WindShots } from '../zombies/WindShots';
import type { WindShotStats } from '../zombies/WindShotStats';
import type { Zombie } from '../zombies/Zombie';
import { splashDamageAt, type ZombieHitPart } from '../zombies/ZombieConfig';
import type { ZombieManager } from '../zombies/ZombieManager';
import type { ModeContext } from './GameMode';

/** Height above the feet a line of sight aims at: the torso. */
const TORSO_HEIGHT = 1.1;
/** Slack before a body, so its own collider never blocks the sight line to it. */
const SIGHT_SLACK = 0.3;
/** How far towards the shooter the burst's sight lines start, so a wall it struck never hides the room in front of it. */
const BURST_PULLBACK = 0.25;

/**
 * A strike on a map's guardian, which takes the shot's damage and its own
 * way of reacting; true when `object` belonged to it (nothing is shoved).
 */
export type WindGuardianStrike = (object: THREE.Object3D, damage: number, point: THREE.Vector3, distance: number) => boolean;

/**
 * Wind weapons in a single-player run (EXHALIS). A shot flies as a visible
 * gust (`WindShots`) and bursts on the first body or wall it meets: the
 * body struck takes the weapon's damage (a head counts double, as ever)
 * and the burst shoves every zombie in its radius and in sight of it away
 * from the player, nearest first and up to its cap; those beyond the body
 * struck also take burst damage that falls off with distance. How far the
 * bow was drawn (`Weapon.lastShotCharge`) scales the shot through its
 * config's `charged` values, and a full draw that strikes a body also
 * drives a gust down the shot line, shoving the bodies queued behind the
 * burst without damage. The weapon's damage scale (an upgrade) applies to
 * both damages, and the shot's own config carries the reach, the shove and
 * the look, so a stronger variant is only data. Rewards follow the usual
 * rules: the direct hit pays like a bullet, the burst pays only for its
 * kills. `ZombiesMode` delegates every wind concern here.
 */
export class ZombiesWindShots {
  private readonly shots: WindShots;
  private readonly candidates: Zombie[] = [];
  private readonly targets: WindGustHit<Zombie>[] = [];
  private readonly gusted: WindGustHit<Zombie>[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly rayHits: THREE.Intersection[] = [];
  private readonly shooter = new THREE.Vector3();
  private readonly center = new THREE.Vector3();
  private readonly toBody = new THREE.Vector3();

  public constructor(
    private readonly ctx: ModeContext,
    private readonly zombies: ZombieManager,
    private readonly economy: PlayerEconomy,
    /** The arena's static colliders: walls, solids and closed doors. */
    private readonly staticColliders: () => ReadonlyArray<THREE.Object3D>,
    private readonly damageScale: (id: WeaponId) => number,
    private readonly strikeGuardian: WindGuardianStrike = () => false,
  ) {
    this.shots = new WindShots(ctx.hitColliders, ctx.scene, ctx.profile.useReducedEffects);
    this.shots.onImpact = (point, object, distance, stats, direction, source) =>
      this.burst(point, object, distance, stats, direction, source);
  }

  /** Looses the shot of `weapon`, drawn as far as its last release, from the eye along `direction`. */
  public fire(weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3): void {
    const wind = weapon.definition.wind;
    if (wind) this.shots.fire(origin, direction, wind, weapon.lastShotCharge, weapon.definition.id);
  }

  public update(dt: number): void {
    this.shots.update(dt);
  }

  /** Restart: every shot in flight and every burst is gone. */
  public reset(): void {
    this.shots.reset();
  }

  private burst(
    point: THREE.Vector3, object: THREE.Object3D | null, distance: number, stats: WindShotStats, direction: THREE.Vector3,
    source: WeaponId,
  ): void {
    this.ctx.audio.playWindImpact(stats.charge);
    const scale = this.damageScale(source);
    const damage = WEAPON_DEFINITIONS[source].damage * scale * stats.damageScale;
    if (object && this.strikeGuardian(object, damage, point, distance)) return;

    const struck = object?.userData.zombie as Zombie | undefined;
    let hitAny = false;
    if (struck?.isAlive) {
      hitAny = true;
      const part = (object?.userData.hitPart as ZombieHitPart | undefined) ?? 'torso';
      const headshot = part === 'head';
      if (headshot) this.ctx.audio.playHeadshotHit();
      const lethal = this.zombies.damageZombie(struck, part, damage, source);
      this.ctx.hud.showHitmarker(headshot, lethal);
      if (!lethal) this.economy.awardHit(headshot);
    }

    this.ctx.player.camera.getWorldPosition(this.shooter);
    this.center.set(this.shooter.x - point.x, 0, this.shooter.z - point.z);
    const toShooter = this.center.length();
    this.center.multiplyScalar(toShooter > 1e-4 ? Math.min(BURST_PULLBACK, toShooter) / toShooter : 0).add(point);
    this.candidates.length = 0;
    for (const zombie of this.zombies.actives) if (zombie.isAlive) this.candidates.push(zombie);
    selectWindGustTargets(point, this.shooter, this.candidates, stats, this.targets);
    for (const { target, distance: fromImpact, share, dirX, dirZ } of this.targets) {
      if (target !== struck) {
        if (!this.inSight(target)) continue;
        const burstDamage = splashDamageAt(stats.burstDamage * scale, fromImpact, stats.burstRadius);
        if (burstDamage > 0) {
          hitAny = true;
          if (this.zombies.damageZombie(target, 'torso', burstDamage, source)) continue;
        }
      }
      if (target.isAlive) this.zombies.knockBack(target, dirX, dirZ, stats.pushDistance * share, stats.pushSeconds);
    }
    if (struck && stats.gust) this.gust(point, direction, stats);
    if (!hitAny) return;
    this.ctx.stats.registerHit(distance);
    if (!struck) this.ctx.hud.showHitmarker(false);
  }

  /**
   * A full draw's gust behind the body struck: the bodies queued down the
   * shot line past the burst, in sight of it, are shoved along the line.
   */
  private gust(point: THREE.Vector3, direction: THREE.Vector3, stats: WindShotStats): void {
    const gust = stats.gust;
    const flat = Math.hypot(direction.x, direction.z);
    if (!gust || flat < 1e-4) return;
    selectWindConeTargets(point, direction.x / flat, direction.z / flat, stats.burstRadius, this.candidates, gust, this.gusted);
    for (const { target, share, dirX, dirZ } of this.gusted) {
      if (target.isAlive && this.inSight(target)) this.zombies.knockBack(target, dirX, dirZ, gust.pushDistance * share, stats.pushSeconds);
    }
  }

  /** Whether walls and closed doors leave `zombie`'s torso open to the burst. */
  private inSight(zombie: Zombie): boolean {
    this.toBody.set(zombie.position.x, zombie.position.y + TORSO_HEIGHT, zombie.position.z).sub(this.center);
    const length = this.toBody.length();
    if (length < SIGHT_SLACK) return true;
    this.raycaster.set(this.center, this.toBody.divideScalar(length));
    this.raycaster.near = 0;
    this.raycaster.far = length - SIGHT_SLACK;
    this.rayHits.length = 0;
    this.raycaster.intersectObjects(this.staticColliders() as THREE.Object3D[], false, this.rayHits);
    return this.rayHits.length === 0;
  }
}
