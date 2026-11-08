import * as THREE from 'three';
import { cameraSpatialCue } from '../../audio/SpatialCue';
import type { GrenadeDefinition } from '../../config/grenades';
import { refreshGibWalls, type GibWalls } from '../../zombies/GibWalls';
import { blastTrauma } from '../../zombies/grenades/GrenadeBlast';
import { GrenadeExplosionView } from '../../zombies/grenades/GrenadeExplosionView';
import { ThrownGrenades, type GrenadeLaunch } from '../../zombies/grenades/ThrownGrenades';
import type { ModeContext } from '../GameMode';

/** Bounce speed that clinks at full strength, m/s. */
const LOUD_BOUNCE = 8;

/**
 * Grenades in a run's world, whoever threw them: they fly and bounce
 * through the map's solids, and each blast is seen, heard and felt here
 * (explosion, sound with the ringing of a close call, camera shake). What a
 * blast does to the horde and the players is the mode's: it receives
 * `onDetonate` with who threw it.
 */
export class GrenadeBlasts<Owner> {
  /** After the blast is shown: where it went off and whose it was. */
  public onDetonate: ((position: THREE.Vector3, definition: GrenadeDefinition, owner: Owner) => void) | null = null;

  private readonly walls: GibWalls = { boxes: [] };
  private readonly live: ThrownGrenades<Owner>;
  private readonly explosions: GrenadeExplosionView;
  private readonly listener = new THREE.Vector3();

  public constructor(
    private readonly ctx: ModeContext,
    private readonly staticColliders: () => ReadonlyArray<THREE.Object3D>,
    private readonly shake: (amount: number) => void,
  ) {
    this.live = new ThrownGrenades<Owner>(this.walls, !ctx.profile.useReducedEffects);
    this.explosions = new GrenadeExplosionView(ctx.profile.useReducedEffects);
    ctx.scene.add(this.live.group, this.explosions.group);
    this.live.onBounce = (position, speed) =>
      ctx.audio.playGrenadeBounce(cameraSpatialCue(ctx.player.camera, position), speed / LOUD_BOUNCE);
    this.live.onDetonate = (position, surfaceY, definition, owner) => this.detonate(position, surfaceY, definition, owner);
    this.syncTopology();
  }

  public get liveCount(): number {
    return this.live.activeCount;
  }

  /** Puts a throw into the world; false when too many are already live. */
  public launch(definition: GrenadeDefinition, launch: GrenadeLaunch, owner: Owner): boolean {
    return this.live.throw(definition, launch, owner);
  }

  public update(dt: number): void {
    this.live.update(dt);
    this.explosions.update(dt);
  }

  /** The map's solids changed (a door opened): grenades bounce off the new set. */
  public syncTopology(): void {
    refreshGibWalls(this.walls, this.staticColliders());
  }

  /** New run: nothing live is left and no scorch stays on the floor. */
  public reset(): void {
    this.live.reset();
    this.explosions.reset();
  }

  private detonate(position: THREE.Vector3, surfaceY: number, definition: GrenadeDefinition, owner: Owner): void {
    const blast = definition.blast;
    this.explosions.explode(position, surfaceY);
    const camera = this.ctx.player.camera;
    camera.getWorldPosition(this.listener);
    const distance = this.listener.distanceTo(position);
    this.ctx.audio.playGrenadeExplosion(definition.audio, cameraSpatialCue(camera, position),
      Math.max(0, 1 - distance / blast.shakeRadius));
    this.shake(blastTrauma(blast, distance));
    this.onDetonate?.(position, definition, owner);
  }
}
