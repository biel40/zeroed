import * as THREE from 'three';
import { cameraSpatialCue, type SpatialCue } from '../audio/SpatialCue';
import { t, type TranslationKey } from '../i18n/i18n';
import type { ObjectiveNote } from '../ui/ObjectiveAnnouncer';
import type { Weapon } from '../weapons/Weapon';
import { selectFlameTargets, type FlameHit } from '../zombies/FlameTargeting';
import { CAPTAIN_USSR, CaptainUssrBrain, type CaptainUssrHitPart } from '../zombies/guardians/CaptainUssrBrain';
import { CaptainUssrView } from '../zombies/guardians/CaptainUssrView';
import type { ArenaEvacuationGuardian } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';

/** Camera jolt of its landing and of a charge crashing nearby, at point blank. */
const LANDING_TRAUMA = 0.7;
const CRASH_TRAUMA = 0.45;
/** Beyond this distance its landing and crashes no longer shake the view. */
const TRAUMA_REACH = 14;
/** The player still counts as within its reach this far outside its field. */
const REACH_MARGIN = 1;
const HINTS: Readonly<Record<1 | 2 | 3, TranslationKey>> = {
  1: 'guardian.captainUssr.hint1',
  2: 'guardian.captainUssr.hint2',
  3: 'guardian.captainUssr.hint3',
};
const PHASE_BANNERS: Readonly<Record<2 | 3, TranslationKey>> = {
  2: 'guardian.captainUssr.phase2',
  3: 'guardian.captainUssr.phase3',
};

/** What the guardian needs from the run that hosts it. */
export interface GuardianRun {
  /** The current round: its health grows with it. */
  round(): number;
  /** One of its attacks reached the player. */
  hurtPlayer(damage: number): void;
  /** Rattles the camera (0..1). */
  shake(amount: number): void;
}

/**
 * The guardian of an evacuation (CAPITÁN URSS) in a single-player run: it
 * wakes when the player enters its ground during the escape, routes shots,
 * Ray Gun and Tesla bolts and flames at its hitboxes into the brain, turns
 * the brain's events into damage, banners, sounds and camera shake, and
 * keeps its HUD bar and objective note. The pure `CaptainUssrBrain`
 * decides; `CaptainUssrView` presents.
 */
export class ZombiesGuardian {
  private readonly brain: CaptainUssrBrain;
  private readonly view: CaptainUssrView;
  private readonly leapFrom: THREE.Vector3;
  private readonly player = { x: 0, z: 0, reachable: false };
  private readonly camera = new THREE.Vector3();
  private readonly flameHits: FlameHit<{ position: THREE.Vector3 }>[] = [];
  private readonly flameBody = { position: new THREE.Vector3() };
  private readonly flameCandidates = [this.flameBody];
  /** The HUD bar, refilled every frame of the fight. */
  private readonly bar: { name: string; health: number; readonly marks: readonly number[] } = {
    name: '', health: 1, marks: CAPTAIN_USSR.phaseThresholds,
  };
  /** Its hitboxes are in the ballistics. */
  private registered = false;
  private note: ObjectiveNote | null = null;
  private notePhase = 0;

  public constructor(
    private readonly ctx: ModeContext,
    private readonly guardian: ArenaEvacuationGuardian,
    private readonly run: GuardianRun,
    random: () => number,
  ) {
    this.brain = new CaptainUssrBrain(CAPTAIN_USSR, guardian.field, random);
    this.view = new CaptainUssrView(!ctx.profile.useReducedEffects);
    ctx.scene.add(this.view.group);
    this.leapFrom = new THREE.Vector3(guardian.leapFrom.x, guardian.leapFrom.y, guardian.leapFrom.z);
  }

  /** Not yet beaten: nobody boards. */
  public get blocksExtraction(): boolean {
    return this.brain.state !== 'defeated';
  }

  /** Arriving or fighting: the escape clock and the horde wait for the duel. */
  public get fighting(): boolean {
    return this.brain.state !== 'dormant' && this.brain.state !== 'defeated';
  }

  /** `escaping`: the escape is under way, so the player can wake it. */
  public update(dt: number, escaping: boolean): void {
    this.readPlayer();
    if (escaping && this.brain.state === 'dormant' && this.playerInTrigger()) this.awaken();
    this.brain.update(dt, this.player);
    this.processEvents();
    this.view.update(dt, this.brain, this.guardian.groundY, this.leapFrom);
    this.showBar();
  }

  /**
   * A shot, bolt or blow struck `object`: true when it was one of the
   * guardian's hitboxes, whatever came of it (blocked, hurt, ignored).
   */
  public hit(object: THREE.Object3D, damage: number, point: THREE.Vector3, distance: number): boolean {
    const part = object.userData.guardianPart as CaptainUssrHitPart | undefined;
    if (!part) return false;
    this.ctx.player.camera.getWorldPosition(this.camera);
    const result = this.brain.takeHit(damage, part, this.camera.x, this.camera.z);
    if (result === 'blocked') {
      this.ctx.audio.playImpact('metal');
      this.ctx.effects.puff(point, 0xffcf8a, 0.12);
    } else if (result !== 'ignored') {
      this.ctx.stats.registerHit(distance);
      this.ctx.hud.showHitmarker(part === 'head');
      if (part === 'head') this.ctx.audio.playHeadshotHit();
      else this.ctx.audio.playZombieHit();
      this.ctx.effects.puff(point, 0x4a1410, 0.24);
      this.view.flash();
    }
    this.processEvents();
    return true;
  }

  /** One tick of a flame `weapon`'s stream, `damage` strong, from `origin` along `direction` (normalised). */
  public scorch(weapon: Weapon, origin: THREE.Vector3, direction: THREE.Vector3, damage: number): void {
    const flame = weapon.definition.flame;
    if (!flame || !this.brain.engaged || this.ctx.player.floor !== this.guardian.floor) return;
    const { x, z } = this.brain.position;
    this.flameBody.position.set(x, this.guardian.groundY, z);
    selectFlameTargets(origin, direction, flame.range, this.flameCandidates, flame, this.flameHits);
    if (this.flameHits.length === 0) return;
    this.ctx.player.camera.getWorldPosition(this.camera);
    if (this.brain.takeHit(damage, 'torso', this.camera.x, this.camera.z) !== 'blocked') this.view.flash();
    this.processEvents();
  }

  /** The note while the duel lasts: beat it, with the phase's advice. */
  public objective(): ObjectiveNote | null {
    if (!this.fighting) return null;
    if (this.note === null || this.notePhase !== this.brain.phase) {
      this.notePhase = this.brain.phase;
      this.note = { kicker: this.name(), title: t('guardian.objective'), details: t(HINTS[this.brain.phase]) };
    }
    return this.note;
  }

  /** The prompt at the extraction point while it stands. */
  public blockedPrompt(): string {
    return t('guardian.blocksBoarding', { name: this.name() });
  }

  /** New run: asleep, out of the ballistics, its bar hidden. */
  public reset(): void {
    this.brain.reset();
    this.view.reset();
    this.unregister();
    this.note = null;
    this.notePhase = 0;
    this.ctx.hud.setBossBar?.(null);
  }

  private name(): string {
    return t('guardian.captainUssr');
  }

  private readPlayer(): void {
    const { rig, floor } = this.ctx.player;
    const { bounds } = this.guardian.field;
    this.player.x = rig.position.x;
    this.player.z = rig.position.z;
    this.player.reachable = floor === this.guardian.floor
      && rig.position.x > bounds.minX - REACH_MARGIN && rig.position.x < bounds.maxX + REACH_MARGIN
      && rig.position.z > bounds.minZ - REACH_MARGIN && rig.position.z < bounds.maxZ + REACH_MARGIN;
  }

  private playerInTrigger(): boolean {
    const { trigger, floor } = this.guardian;
    const { x, z } = this.player;
    return this.ctx.player.floor === floor && x > trigger.minX && x < trigger.maxX && z > trigger.minZ && z < trigger.maxZ;
  }

  private awaken(): void {
    if (!this.brain.awaken(this.run.round(), this.player.x, this.player.z)) return;
    this.register();
    this.ctx.audio.playAmbushScare(this.cueAt(this.leapFrom.x, this.leapFrom.y, this.leapFrom.z));
  }

  private processEvents(): void {
    for (const event of this.brain.pendingEvents) {
      switch (event.type) {
        case 'arrived':
          this.ctx.hud.showRoundBanner(this.name(), t('guardian.arrivalSub'));
          this.shakeNear(LANDING_TRAUMA);
          this.ctx.audio.playBarrierBreak(this.cueAtBoss(0.2));
          break;
        case 'phase':
          this.ctx.hud.showRoundBanner(this.name(), t(PHASE_BANNERS[event.phase]));
          this.ctx.audio.playZombieSpawn(this.cueAtBoss(1.9));
          break;
        case 'chargeWindup':
          this.ctx.audio.playZombieSpawn(this.cueAtBoss(1.9));
          break;
        case 'shieldThrown':
          this.ctx.audio.playKnifeSwing();
          break;
        case 'shieldCaught':
          this.ctx.audio.playImpact('metal');
          break;
        case 'chargeEnded':
          if (!event.crashed) break;
          this.ctx.audio.playBarrierBreak(this.cueAtBoss(1.2));
          this.shakeNear(CRASH_TRAUMA);
          break;
        case 'playerHit':
          this.run.hurtPlayer(event.damage);
          break;
        case 'defeated':
          this.unregister();
          this.ctx.hud.showRoundBanner(t('guardian.defeatedBanner', { name: this.name() }), t('guardian.defeatedSub'));
          this.ctx.audio.playRoundEndCue();
          break;
        case 'bashWindup':
        case 'throwWindup':
        case 'charge':
          // Their tells are the body's own: the view shows the windup.
          break;
      }
    }
    this.brain.clearEvents();
  }

  private showBar(): void {
    if (!this.fighting) {
      this.ctx.hud.setBossBar?.(null);
      return;
    }
    this.bar.name = this.name();
    this.bar.health = this.brain.healthRatio;
    this.ctx.hud.setBossBar?.(this.bar);
  }

  private shakeNear(amount: number): void {
    const { x, z } = this.brain.position;
    const distance = Math.hypot(x - this.player.x, z - this.player.z);
    if (this.player.reachable && distance < TRAUMA_REACH) this.run.shake(amount * (1 - distance / TRAUMA_REACH));
  }

  private register(): void {
    if (this.registered) return;
    this.registered = true;
    this.ctx.hitColliders.push(...this.view.hitboxes);
  }

  private unregister(): void {
    if (!this.registered) return;
    this.registered = false;
    for (const hitbox of this.view.hitboxes) {
      const index = this.ctx.hitColliders.indexOf(hitbox);
      if (index >= 0) this.ctx.hitColliders.splice(index, 1);
    }
  }

  private cueAtBoss(height: number): SpatialCue {
    const { x, z } = this.brain.position;
    return this.cueAt(x, this.guardian.groundY + height, z);
  }

  private cueAt(x: number, y: number, z: number): SpatialCue {
    return cameraSpatialCue(this.ctx.player.camera, { x, y, z });
  }
}
