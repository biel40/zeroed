import * as THREE from 'three';
import {
  GRENADE_DEFINITIONS,
  LETHAL_GRENADE_LOADOUT,
  STARTING_LETHAL_GRENADE,
  type GrenadeBlastConfig,
  type GrenadeDefinition,
} from '../config/grenades';
import type { PlayerEconomy } from '../game/PlayerEconomy';
import { t } from '../i18n/i18n';
import { grenadeBuyPrompt } from '../ui/InteractionPrompts';
import { LETHAL_INPUT_CODES } from '../player/Input';
import type { MeleeArmDriver } from '../weapons/ViewArms';
import { arenaFloorHeight } from '../zombies/maps/ArenaFloors';
import type { ArenaGrenadeBuy, ZombieArena } from '../zombies/maps/ZombieArena';
import type { ZombieManager } from '../zombies/ZombieManager';
import type { ModeContext } from './GameMode';
import { BlastSight } from './grenades/BlastSight';
import { GrenadeBlasts } from './grenades/GrenadeBlasts';
import { GrenadeHand } from './grenades/GrenadeHand';

/** What the mode lends the grenades: damage tuning and its reactions to a blast. */
export interface ZombiesGrenadeHooks {
  readonly damageScale: () => number;
  readonly hurtPlayer: (damage: number) => void;
  readonly shake: (amount: number) => void;
  /** The map's boss, if one is fighting: true when the blast hurt it. */
  readonly blastGuardian: (position: THREE.Vector3, blast: GrenadeBlastConfig, damageScale: number) => boolean;
}

/**
 * Lethal grenades in a single-player run (the F-1): the local hand (pouch,
 * throw and cooking), live grenades and their blasts, which hurt the horde
 * (walls shield it), cripple some survivors, wrap around the guardian's
 * shield and can catch the thrower. A new round adds grenades and a map's
 * grenade wall refills the pouch. `ZombiesMode` delegates every grenade
 * concern here.
 */
export class ZombiesGrenades {
  private readonly definition: GrenadeDefinition = GRENADE_DEFINITIONS[STARTING_LETHAL_GRENADE];
  private readonly hand: GrenadeHand;
  private readonly blasts: GrenadeBlasts<'player'>;
  private readonly sight: BlastSight;
  private readonly forward = new THREE.Vector3();
  /** False on game over: blasts still go off, but hurt nobody. */
  private runLive = true;

  public constructor(
    private readonly ctx: ModeContext,
    private readonly zombies: ZombieManager,
    private readonly economy: PlayerEconomy,
    private readonly arena: ZombieArena,
    private readonly hooks: ZombiesGrenadeHooks,
  ) {
    const colliders = (): ReadonlyArray<THREE.Object3D> => arena.colliders;
    this.sight = new BlastSight(colliders);
    this.blasts = new GrenadeBlasts<'player'>(ctx, colliders, hooks.shake);
    this.blasts.onDetonate = (position, definition) => this.resolveBlast(position, definition);
    this.hand = new GrenadeHand(ctx, this.definition, LETHAL_GRENADE_LOADOUT,
      () => arenaFloorHeight(arena.navigationBounds, arena.floorTransitions ?? [], ctx.player.floor));
    this.hand.onLaunch = (launch) => this.blasts.launch(this.definition, launch, 'player');
  }

  /** The throw borrows the right arm while it plays. */
  public get armDriver(): MeleeArmDriver | null {
    return this.hand.armDriver;
  }

  public get isThrowing(): boolean {
    return this.hand.isThrowing;
  }

  /** Starts a throw when a grenade is left and the arm is free; true when it started. */
  public throw(): boolean {
    return this.hand.throw();
  }

  /** `runLive` false (game over, ending) lets live grenades go off harmlessly. */
  public update(dt: number, runLive: boolean): void {
    this.runLive = runLive;
    this.hand.update(dt, LETHAL_INPUT_CODES.some((code) => this.ctx.input.isDown(code)));
    this.blasts.update(dt);
  }

  /** A new round hands out its grenades. */
  public grantRound(): void {
    this.hand.grantRound();
  }

  /** Prompt while facing a grenade wall, else null. */
  public prompt(): string | null {
    const buy = this.facingBuy();
    return buy ? grenadeBuyPrompt(t(this.definition.nameKey), buy.cost, this.ctx.profile.useTouchControls) : null;
  }

  /** USE at a grenade wall: fills the pouch for its price. False when no wall is faced. */
  public interact(): boolean {
    const buy = this.facingBuy();
    if (!buy) return false;
    if (this.hand.isFull) {
      this.ctx.hud.showRoundBanner(t('banner.grenadesFull'));
      return true;
    }
    if (!this.economy.spend(buy.cost)) {
      this.ctx.hud.flashNotEnoughPoints();
      this.ctx.hud.showRoundBanner(t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost: buy.cost }));
      return true;
    }
    this.hand.refill();
    this.ctx.audio.playMysteryBoxPickup();
    return true;
  }

  /** The map's solids changed (a door opened): grenades bounce off the new set. */
  public syncTopology(): void {
    this.blasts.syncTopology();
  }

  /** Throw interrupted by a state change that stops gameplay; the grenade stays in the pouch. */
  public cancelThrow(): void {
    this.hand.cancel();
  }

  /** New run: the starting pouch, nothing live and no scorch left. */
  public reset(): void {
    this.hand.reset();
    this.blasts.reset();
  }

  /** Leaving the run: no grenade row on the shared HUD. */
  public exit(): void {
    this.hand.clearHud();
  }

  private resolveBlast(position: THREE.Vector3, definition: GrenadeDefinition): void {
    if (!this.runLive) return;
    const blast = definition.blast;
    const scale = this.hooks.damageScale();
    this.sight.aimFrom(position);
    const survivors = this.zombies.applyExplosion(position, blast, definition.id, scale,
      (zombie) => !this.sight.shields(zombie));
    for (let index = 0; index < survivors; index++) this.economy.awardHit(false);
    if (survivors > 0) this.ctx.hud.showHitmarker(false);
    this.hooks.blastGuardian(position, blast, scale);
    const eye = this.ctx.player.rig.position;
    const damage = this.sight.playerDamage(blast, position, eye.x, eye.y, eye.z);
    if (damage > 0) this.hooks.hurtPlayer(damage);
  }

  private facingBuy(): ArenaGrenadeBuy | null {
    const player = this.ctx.player;
    const forward = player.camera.getWorldDirection(this.forward);
    for (const buy of this.arena.grenadeBuys ?? []) {
      if (buy.floor !== player.floor) continue;
      const dx = buy.position.x - player.rig.position.x;
      const dz = buy.position.z - player.rig.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > buy.useRange) continue;
      if (distance < 1e-3 || (forward.x * dx + forward.z * dz) / distance >= buy.lookDotMin) return buy;
    }
    return null;
  }
}
