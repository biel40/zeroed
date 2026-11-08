import * as THREE from 'three';
import type { GrenadeBlastConfig } from '../../config/grenades';
import { EYE_HEIGHT } from '../../player/PlayerController';
import { selfBlastDamage } from '../../zombies/grenades/GrenadeBlast';
import type { Zombie } from '../../zombies/Zombie';

/** The blast is seen from just above where it went off, so a lip of floor never hides a body. */
const BLAST_EYE_LIFT = 0.3;
/** Height above the feet the blast must reach: the torso, or the back of a crawler. */
const STANDING_TORSO = 1;
const CRAWLING_TORSO = 0.3;
/** Slack before the target, so its own collider never blocks the sight line to it. */
const SIGHT_SLACK = 0.3;

/**
 * Line of sight from one blast to its victims: walls and closed doors (the
 * map's static solids) shield whatever stands behind them. `aimFrom` sets
 * the blast once; every check after it reuses the same temporaries.
 */
export class BlastSight {
  private readonly centre = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];

  public constructor(private readonly staticColliders: () => ReadonlyArray<THREE.Object3D>) {}

  public aimFrom(position: THREE.Vector3): void {
    this.centre.copy(position);
    this.centre.y += BLAST_EYE_LIFT;
  }

  /** A wall or closed door stands between the blast and the zombie's body. */
  public shields(zombie: Zombie): boolean {
    const torso = zombie.isCrippled ? CRAWLING_TORSO : STANDING_TORSO;
    return this.blocked(zombie.position.x, zombie.position.y + torso, zombie.position.z);
  }

  /**
   * Damage the blast deals to a player whose standing eye anchor is at
   * (x, eyeY, z): only within reach and in sight, falling off with distance.
   */
  public playerDamage(blast: GrenadeBlastConfig, position: THREE.Vector3, x: number, eyeY: number, z: number): number {
    const feetY = eyeY - EYE_HEIGHT;
    if (Math.abs(feetY - position.y) > blast.verticalReach) return 0;
    const damage = selfBlastDamage(blast, Math.hypot(x - position.x, z - position.z));
    return damage > 0 && !this.blocked(x, feetY + STANDING_TORSO, z) ? damage : 0;
  }

  private blocked(x: number, y: number, z: number): boolean {
    this.toTarget.set(x, y, z).sub(this.centre);
    const length = this.toTarget.length();
    if (length <= SIGHT_SLACK) return false;
    this.raycaster.set(this.centre, this.toTarget.divideScalar(length));
    this.raycaster.near = 0;
    this.raycaster.far = length - SIGHT_SLACK;
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.staticColliders() as THREE.Object3D[], false, this.hits);
    return this.hits.length > 0;
  }
}
