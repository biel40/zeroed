import * as THREE from 'three';
import { cameraSpatialCue, type SpatialCue } from '../audio/SpatialCue';
import { EndingCinematic } from '../rendering/EndingCinematic';
import { t, type TranslationKey } from '../i18n/i18n';
import type { ObjectiveNote } from '../ui/ObjectiveAnnouncer';
import type { Weapon } from '../weapons/Weapon';
import { selectFlameTargets, type FlameHit } from '../zombies/FlameTargeting';
import { ESCAPE_ALARM, EscapeAlarm, type EscapeAlarmTuning } from '../zombies/evacuation/EscapeAlarm';
import {
  CAPTAIN_USSR,
  CaptainUssrBrain,
  type CaptainUssrHitPart,
  type CaptainUssrHitResult,
  type CaptainUssrState,
  type GuardianDuelPhase,
} from '../zombies/guardians/CaptainUssrBrain';
import { CaptainUssrTelegraphs } from '../zombies/guardians/CaptainUssrTelegraphs';
import { CaptainUssrView } from '../zombies/guardians/CaptainUssrView';
import { GuardianDuelDischarges } from '../zombies/guardians/GuardianDuelDischarges';
import { GuardianEntrance } from '../zombies/guardians/GuardianEntrance';
import { CAPTAIN_USSR_REINFORCEMENTS, GuardianReinforcements } from '../zombies/guardians/GuardianReinforcements';
import type { ArenaEvacuationGuardian, ArenaGuardianEntrance } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';
import type { GrenadeBlastConfig } from '../config/grenades';
import { guardianBlastDamage } from '../zombies/grenades/GrenadeBlast';

/** Camera jolt of its landing (and its fall), of a charge crashing and of each charging stride nearby, at point blank. */
const LANDING_TRAUMA = 0.7;
const CRASH_TRAUMA = 0.45;
const STRIDE_TRAUMA = 0.12;
/** Camera jolt of the scream in a fit of rage in red fury, at point blank. */
const BELLOW_TRAUMA = 0.5;
/** Camera jolt of a ground slam and of a shockwave leaving its feet, at point blank. */
const SLAM_TRAUMA = 0.55;
const SHOCKWAVE_TRAUMA = 0.65;
/** Camera jolt of a sweep striking its strip, at point blank. */
const SWEEP_TRAUMA = 0.4;
/** Camera jolt of a blow that throws the player back. */
const KNOCKBACK_TRAUMA = 0.35;
/** Camera jolt of a bolt striking the ground nearby, at point blank. */
const DISCHARGE_TRAUMA = 0.18;
/**
 * The field's loudspeakers through the duel, from Containment Protocol: the
 * siren and a garbled order over and over; LAST ORDER adds a steady klaxon,
 * the escape alarm's last stretch held for the rest of the fight.
 */
const DUEL_ALARM: EscapeAlarmTuning = {
  sirenEvery: ESCAPE_ALARM.sirenEvery + 1,
  announceEvery: 13,
  klaxonFrom: 1,
  klaxonInterval: { slowest: 2.4, fastest: 2.4 },
};
/** Without loudspeakers on its field, the duel's alarms sound this high over its landing. */
const SPEAKER_HEIGHT = 5;
/** States in which it is not attacking: reinforcements may join only then, so no group lands on top of an attack. */
const CALM: ReadonlySet<CaptainUssrState> = new Set(['stalking', 'recovering', 'stunned', 'enraged']);
/** Seconds its duel's theme takes to fade out once it falls. */
const THEME_FADE_SECONDS = 3;
/** The dropped shield's clang is heard from this impact speed up (m/s). */
const CLANG_FROM = 0.8;
/** Each tick of flame jolts it lightly: a stream keeps it writhing without a full flinch per tick. */
const BURN_FLINCH = 0.35;
/** A grenade going off at its feet staggers it more than a flame tick. */
const BLAST_FLINCH = 0.8;
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

/** What the guardian needs from the run that hosts it. */
export interface GuardianRun {
  /** The current round: its health grows with it. */
  round(): number;
  /** One of its attacks reached the player. */
  hurtPlayer(damage: number): void;
  /** Rattles the camera (0..1). */
  shake(amount: number): void;
  aliveZombies(): number;
  /** Spawns one zombie of the current round; false when none could be placed. */
  spawnZombie(): boolean;
}

/**
 * The guardian of an evacuation (CAPITÁN URSS) in a single-player run: it
 * wakes when the player enters its ground during the escape, routes shots,
 * VORTEX-9 and Tesla bolts and flames at its hitboxes into the brain, turns
 * the brain's events into damage, banners, sounds and camera shake, and
 * keeps its HUD bar and objective note. With a filmed entrance, waking it
 * holds the run (`filming`) while its camera films it on its perch, the
 * roar, the leap and the landing under the HUD's title card. From
 * Containment Protocol (phase 2) it calls small groups of zombies
 * (`GuardianReinforcements`), sounds the field's sirens and orders, and
 * has the map turn its lights to emergency red (`showDuelPhase`); LAST
 * ORDER (phase 3) adds the klaxon and bolts striking around the field.
 * The pure `CaptainUssrBrain` decides; `CaptainUssrView`, its ground
 * telegraphs and the field's discharges present.
 */
export class ZombiesGuardian {
  private readonly brain: CaptainUssrBrain;
  private readonly view: CaptainUssrView;
  private readonly telegraphs: CaptainUssrTelegraphs;
  private readonly discharges: GuardianDuelDischarges;
  private readonly reinforcements: GuardianReinforcements;
  private readonly alarm = new EscapeAlarm(DUEL_ALARM);
  private readonly speaker: { readonly x: number; readonly y: number; readonly z: number };
  /** The phase last shown to the map. */
  private shownPhase: GuardianDuelPhase = 0;
  private readonly leapFrom: THREE.Vector3;
  private readonly player = { x: 0, z: 0, reachable: false, airborne: false };
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
    const fullEffects = !ctx.profile.useReducedEffects;
    this.view = new CaptainUssrView(fullEffects, random);
    this.telegraphs = new CaptainUssrTelegraphs(CAPTAIN_USSR);
    this.discharges = new GuardianDuelDischarges(guardian.field, guardian.groundY, random, fullEffects);
    this.reinforcements = new GuardianReinforcements(CAPTAIN_USSR_REINFORCEMENTS, ctx.profile.useReducedEffects);
    const { landing } = guardian.field;
    this.speaker = guardian.loudspeaker ?? { x: landing.x, y: guardian.groundY + SPEAKER_HEIGHT, z: landing.z };
    ctx.scene.add(this.view.group, this.telegraphs.group, this.discharges.group);
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

  /** Still asleep: nothing has woken it this run. */
  public get dormant(): boolean {
    return this.brain.state === 'dormant' && !this.filming;
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
    this.telegraphs.update(dt, this.brain, this.guardian.groundY);
    this.presentBody();
    const phase: GuardianDuelPhase = this.brain.engaged ? this.brain.phase : 0;
    this.showPhase(phase);
    this.presentDischarges(dt, phase);
    this.soundDuelAlarm(dt, phase);
    if (phase !== 0) this.reinforce(dt, phase);
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
    this.presentHit(this.brain.takeHit(damage, part, this.camera.x, this.camera.z), part, point, distance);
    return true;
  }

  /** A VORTEX-9 or ZEUS-77 bolt struck `object`: like `hit`, but it goes through the shield. */
  public bolt(object: THREE.Object3D, damage: number, point: THREE.Vector3, distance: number): boolean {
    const part = object.userData.guardianPart as CaptainUssrHitPart | undefined;
    if (!part) return false;
    this.presentHit(this.brain.takeBolt(damage, part), part, point, distance);
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

  /**
   * A grenade going off at `position`: on its floor and within the blast,
   * the explosion wraps around the shield (`guardianBlastDamage`, scaled by
   * `damageScale`). True when it hurt the guardian.
   */
  public blast(position: THREE.Vector3, blast: GrenadeBlastConfig, damageScale: number): boolean {
    if (!this.brain.engaged || Math.abs(position.y - this.guardian.groundY) > blast.verticalReach) return false;
    const { x, z } = this.brain.position;
    const distance = Math.max(0, Math.hypot(x - position.x, z - position.z) - this.brain.radius);
    const damage = guardianBlastDamage(blast, distance) * damageScale;
    if (damage <= 0 || this.brain.takeBlast(damage) === 'ignored') return false;
    this.ctx.hud.showHitmarker(false);
    this.view.hurt(BLAST_FLINCH);
    this.processEvents();
    return true;
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
    this.telegraphs.reset();
    this.discharges.reset();
    this.reinforcements.reset();
    this.alarm.reset();
    this.showPhase(0);
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
    this.player.airborne = this.ctx.player.airborne;
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

  /** What a hit on `part` looks and sounds like, by what the brain made of it. */
  private presentHit(result: CaptainUssrHitResult, part: CaptainUssrHitPart, point: THREE.Vector3, distance: number): void {
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
  }

  private processEvents(): void {
    for (const event of this.brain.pendingEvents) {
      switch (event.type) {
        case 'arrived':
          // Filmed, its title card names it. The slam itself is the body's cue, on the frame it lands.
          if (!this.filming) this.ctx.hud.showRoundBanner(this.name(), t('guardian.arrivalSub'));
          this.ctx.audio.playGuardianRoar(this.cueAtBoss(ROAR_HEIGHT), 0);
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
        case 'slamWindup':
        case 'shockwaveWindup':
          // A roar as it heaves the shield overhead: the ground is about to be struck.
          this.ctx.audio.playGuardianRoar(this.cueAtBoss(ROAR_HEIGHT), event.type === 'shockwaveWindup' ? 1 : 0.6);
          break;
        case 'slam':
        case 'shockwave':
          this.strikeGround(event.type === 'shockwave');
          break;
        case 'sweepWindup':
          // Each strip counts down on its own, heard from where it runs nearest the player.
          this.ctx.audio.playSweepCharge(this.cueAt(event.x, this.guardian.groundY + 0.1, event.z), CAPTAIN_USSR.sweep.windup);
          break;
        case 'sweep':
          this.strikeSweep(event.x, event.z);
          break;
        case 'playerHit':
          this.run.hurtPlayer(event.damage);
          if (event.push) {
            this.ctx.player.applyKnockback(event.push.x, event.push.z);
            this.run.shake(KNOCKBACK_TRAUMA);
          }
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
    if (cues.bellow > 0) {
      this.ctx.audio.playGuardianRoar(this.cueAtBoss(ROAR_HEIGHT), cues.bellow);
      this.shakeNear(BELLOW_TRAUMA * cues.bellow);
    }
    if (cues.arc > 0) this.ctx.audio.playElectricArc(this.cueAtBoss(1.3), cues.arc);
  }

  /** The shield driven into the ground (a slam, or a shockwave leaving its feet): heard and felt. */
  private strikeGround(shockwave: boolean): void {
    const at = this.cueAtBoss(0.2);
    this.ctx.audio.playGuardianFootfall(at, 1);
    this.ctx.audio.playBarrierBreak(at);
    if (shockwave) this.ctx.audio.playElectricArc(at, 1);
    this.shakeNear(shockwave ? SHOCKWAVE_TRAUMA : SLAM_TRAUMA);
  }

  /** A sweep strikes its strip: the shield's thud at its feet, the discharge where the strip runs nearest (`x`, `z`), felt there. */
  private strikeSweep(x: number, z: number): void {
    this.ctx.audio.playGuardianFootfall(this.cueAtBoss(0.2), 1);
    this.ctx.audio.playElectricArc(this.cueAt(x, this.guardian.groundY + 0.1, z), 1);
    const distance = Math.hypot(x - this.player.x, z - this.player.z);
    if (this.player.reachable && distance < TRAUMA_REACH) this.run.shake(SWEEP_TRAUMA * (1 - distance / TRAUMA_REACH));
  }

  /** The map answers each change of phase (its lights); 0 once the duel is over. */
  private showPhase(phase: GuardianDuelPhase): void {
    if (phase === this.shownPhase) return;
    this.shownPhase = phase;
    this.guardian.showDuelPhase?.(phase);
  }

  /** Sparks, smoke and bolts around the field from Containment Protocol, each heard (and a bolt felt) where it strikes. */
  private presentDischarges(dt: number, phase: GuardianDuelPhase): void {
    this.discharges.update(dt, phase);
    const { cue } = this.discharges;
    if (cue.strength <= 0) return;
    this.ctx.audio.playElectricArc(this.cueAt(cue.at.x, cue.at.y, cue.at.z), cue.strength);
    if (cue.strength >= 1 && this.player.reachable) {
      const distance = Math.hypot(cue.at.x - this.player.x, cue.at.z - this.player.z);
      if (distance < TRAUMA_REACH) this.run.shake(DISCHARGE_TRAUMA * (1 - distance / TRAUMA_REACH));
    }
  }

  /** The field's loudspeakers from Containment Protocol on: sirens, the garbled order and, in LAST ORDER, the klaxon. */
  private soundDuelAlarm(dt: number, phase: GuardianDuelPhase): void {
    if (phase >= 2 && !this.alarm.isRunning) this.alarm.start();
    if (phase < 2 && this.alarm.isRunning) this.alarm.stop();
    this.alarm.update(dt, phase === 3 ? DUEL_ALARM.klaxonFrom : Number.POSITIVE_INFINITY);
    const { siren, announcement, klaxon } = this.alarm.due;
    if (!siren && !announcement && !klaxon) return;
    const cue = this.cueAt(this.speaker.x, this.speaker.y, this.speaker.z);
    if (siren) this.ctx.audio.playEvacuationSiren(cue, true);
    if (announcement) this.ctx.audio.playIntercomAnnouncement(cue, true);
    if (klaxon) this.ctx.audio.playEscapeKlaxon(cue, true);
  }

  /** Small groups of zombies join the duel, never on top of an attack and never past the phase's cap. */
  private reinforce(dt: number, phase: 1 | 2 | 3): void {
    const due = this.reinforcements.update(dt, phase, this.run.aliveZombies(), CALM.has(this.brain.state));
    for (let spawned = 0; spawned < due; spawned++) {
      if (!this.run.spawnZombie()) return;
    }
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
