import * as THREE from 'three';
import { cameraSpatialCue, type SpatialCue } from '../audio/SpatialCue';
import { EndingCinematic } from '../rendering/EndingCinematic';
import { t, type TranslationKey } from '../i18n/i18n';
import type { ObjectiveNote } from '../ui/ObjectiveAnnouncer';
import type { Weapon } from '../weapons/Weapon';
import { selectFlameTargets, type FlameHit } from '../zombies/FlameTargeting';
import { CAPTAIN_USSR, CaptainUssrBrain, type CaptainUssrHitPart } from '../zombies/guardians/CaptainUssrBrain';
import { CaptainUssrView } from '../zombies/guardians/CaptainUssrView';
import { GuardianEntrance } from '../zombies/guardians/GuardianEntrance';
import type { ArenaEvacuationGuardian, ArenaGuardianEntrance } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';

/** Camera jolt of its landing (and its fall), of a charge crashing and of each charging stride nearby, at point blank. */
const LANDING_TRAUMA = 0.7;
const CRASH_TRAUMA = 0.45;
const STRIDE_TRAUMA = 0.12;
/** Seconds its duel's theme takes to fade out once it falls. */
const THEME_FADE_SECONDS = 3;
/** The dropped shield's clang is heard from this impact speed up (m/s). */
const CLANG_FROM = 0.8;
/** Each tick of flame jolts it lightly: a stream keeps it writhing without a full flinch per tick. */
const BURN_FLINCH = 0.35;
/** Beyond this distance its landing and crashes no longer shake the view. */
const TRAUMA_REACH = 14;
/** The player still counts as within its reach this far outside its field. */
const REACH_MARGIN = 1;
/** Its diegetic title over its name on the entrance's card. */
const KICKER = 'КАПИТАН СССР';
/** Height of its growl over its feet. */
const ROAR_HEIGHT = 1.9;
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
 * VORTEX-9 and Tesla bolts and flames at its hitboxes into the brain, turns
 * the brain's events into damage, banners, sounds and camera shake, and
 * keeps its HUD bar and objective note. With a filmed entrance, waking it
 * holds the run (`filming`) while its camera films it on its perch, the
 * roar, the leap and the landing under the HUD's title card. The pure
 * `CaptainUssrBrain` decides; `CaptainUssrView` presents.
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
  /** Its duel's theme is playing; while it fades out, the seconds left, else null. */
  private themePlaying = false;
  private themeFade: number | null = null;
  /** The filmed entrance: its beats, its clock and its camera; null when it leaps straight in. */
  private readonly entrance: {
    readonly config: ArenaGuardianEntrance;
    readonly clock: GuardianEntrance;
    readonly film: EndingCinematic;
  } | null;

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
    const config = guardian.entrance;
    this.entrance = config ? { config, clock: new GuardianEntrance(config), film: new EndingCinematic(config.shots) } : null;
  }

  /** Its filmed entrance is playing: the run holds while the shell films through `cinematicCamera`. */
  public get filming(): boolean {
    return this.entrance?.clock.playing ?? false;
  }

  /** The entrance's camera while it plays, else null. */
  public get cinematicCamera(): THREE.Camera | null {
    return this.entrance && this.filming ? this.entrance.film.camera : null;
  }

  /** Not yet beaten: nobody boards. */
  public get blocksExtraction(): boolean {
    return this.brain.state !== 'defeated';
  }

  /** Filmed, arriving or fighting: the escape clock and the horde wait for the duel. */
  public get fighting(): boolean {
    return this.filming || (this.brain.state !== 'dormant' && this.brain.state !== 'defeated');
  }

  /** `escaping`: the escape is under way, so the player can wake it. */
  public update(dt: number, escaping: boolean): void {
    this.readPlayer();
    if (escaping && this.brain.state === 'dormant' && !this.filming && this.playerInTrigger()) this.wake();
    if (this.entrance && this.filming) this.updateEntrance(this.entrance.clock, this.entrance.film, dt);
    else this.brain.update(dt, this.player);
    this.processEvents();
    this.view.update(dt, this.brain, this.guardian.groundY, this.leapFrom);
    this.presentBody();
    this.fadeTheme(dt);
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
      this.view.block();
      this.ctx.audio.playImpact('metal');
      this.ctx.effects.puff(point, 0xffcf8a, 0.12);
    } else if (result !== 'ignored') {
      this.ctx.stats.registerHit(distance);
      this.ctx.hud.showHitmarker(part === 'head');
      if (part === 'head') this.ctx.audio.playHeadshotHit();
      else this.ctx.audio.playZombieHit();
      this.ctx.effects.puff(point, 0x4a1410, 0.24);
      this.view.hurt(1, part, point);
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
    // The flamethrower's reward: fire wraps around the shield, every tick lands.
    if (this.brain.takeBurn(damage) !== 'ignored') this.view.hurt(BURN_FLINCH);
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

  /** New run: asleep, out of the ballistics, its bar and any entrance card hidden. */
  public reset(): void {
    this.entrance?.clock.reset();
    this.entrance?.film.stop();
    this.ctx.hud.hideBossIntro();
    this.stopTheme();
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

  /** The player stepped onto its ground: its theme takes over, its entrance starts on the perch, or it leaps straight in. */
  private wake(): void {
    if (this.guardian.music) {
      this.ctx.audio.startDuelTheme(this.guardian.music);
      this.themePlaying = true;
      this.themeFade = null;
    }
    if (!this.entrance) {
      this.awaken(true);
      return;
    }
    const { config, clock, film } = this.entrance;
    const { landing } = this.guardian.field;
    clock.start();
    this.view.perch(this.leapFrom, Math.atan2(landing.x - this.leapFrom.x, landing.z - this.leapFrom.z));
    film.start(this.ctx.player.camera);
    this.ctx.hud.showBossIntro({ kicker: KICKER, name: this.name(), tagline: t('guardian.arrivalSub') }, config.duration, config.titleAt);
    this.ctx.audio.playAmbushScare(this.cueAt(this.leapFrom.x, this.leapFrom.y, this.leapFrom.z));
  }

  /**
   * The entrance's beats: the roar on the perch, then the leap; only the
   * leap runs the brain, so once landed it waits for the camera to hand
   * back before it fights.
   */
  private updateEntrance(clock: GuardianEntrance, film: EndingCinematic, dt: number): void {
    clock.update(dt);
    if (clock.due.roar) {
      this.view.roar();
      this.ctx.audio.playGuardianRoar(this.cueAt(this.leapFrom.x, this.leapFrom.y + ROAR_HEIGHT, this.leapFrom.z), 0);
    }
    if (clock.due.leap) this.awaken(false);
    if (this.brain.state === 'arriving') this.brain.update(dt, this.player);
    film.update(dt, this.ctx.player.camera);
    if (!clock.due.finished) return;
    film.stop();
    this.ctx.hud.hideBossIntro();
  }

  /** Into the fight: the leap starts and its hitboxes join the ballistics; `scare` plays its stinger. */
  private awaken(scare: boolean): void {
    if (!this.brain.awaken(this.run.round(), this.player.x, this.player.z)) return;
    this.register();
    if (scare) this.ctx.audio.playAmbushScare(this.cueAt(this.leapFrom.x, this.leapFrom.y, this.leapFrom.z));
  }

  private processEvents(): void {
    for (const event of this.brain.pendingEvents) {
      switch (event.type) {
        case 'arrived':
          // Filmed, its title card names it. The slam itself is the body's cue, on the frame it lands.
          if (!this.filming) this.ctx.hud.showRoundBanner(this.name(), t('guardian.arrivalSub'));
          this.ctx.audio.playGuardianRoar(this.cueAtBoss(ROAR_HEIGHT), 0);
          break;
        case 'phase':
          this.ctx.hud.showRoundBanner(this.name(), t(PHASE_BANNERS[event.phase]));
          this.ctx.audio.playGuardianRoar(this.cueAtBoss(ROAR_HEIGHT), event.phase === 3 ? 1 : 0.5);
          break;
        case 'chargeWindup':
          // A bellow over the scraping hoof: the charge's warning.
          this.ctx.audio.playGuardianRoar(this.cueAtBoss(ROAR_HEIGHT), 0.4);
          break;
        case 'shieldThrown':
          this.ctx.audio.playKnifeSwing();
          break;
        case 'shieldCaught':
          this.ctx.audio.playImpact('metal');
          break;
        case 'chargeEnded':
          if (!event.crashed) break;
          this.view.crash();
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
          if (this.themePlaying) this.themeFade = THEME_FADE_SECONDS;
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

  /** Its body's weight, heard and felt: footfalls (a charge's strides shake the view), its slams and falls, the dropped shield. */
  private presentBody(): void {
    const { cues } = this.view;
    if (cues.footfall > 0) {
      this.ctx.audio.playGuardianFootfall(this.cueAt(cues.foot.x, cues.foot.y, cues.foot.z), cues.footfall);
      if (this.brain.state === 'charging') this.shakeNear(STRIDE_TRAUMA * cues.footfall);
    }
    if (cues.impact > 0) {
      const at = this.cueAt(cues.impactAt.x, cues.impactAt.y, cues.impactAt.z);
      this.ctx.audio.playGuardianFootfall(at, 1);
      this.ctx.audio.playBarrierBreak(at);
      // Filmed, the entrance's camera shakes on its own.
      if (!this.filming) this.shakeNear(LANDING_TRAUMA * cues.impact);
    }
    if (cues.clang >= CLANG_FROM) this.ctx.audio.playImpact('metal');
  }

  /** Once it falls, its theme fades out and the map's music returns. */
  private fadeTheme(dt: number): void {
    if (this.themeFade === null) return;
    this.themeFade = Math.max(0, this.themeFade - Math.max(0, dt));
    this.ctx.audio.setDuelThemeLevel(this.themeFade / THEME_FADE_SECONDS);
    if (this.themeFade === 0) this.stopTheme();
  }

  private stopTheme(): void {
    this.themeFade = null;
    if (!this.themePlaying) return;
    this.themePlaying = false;
    this.ctx.audio.stopDuelTheme();
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
