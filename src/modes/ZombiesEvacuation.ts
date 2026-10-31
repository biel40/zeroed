import * as THREE from 'three';
import { cameraSpatialCue, type SpatialCue } from '../audio/SpatialCue';
import type { PlayerEconomy } from '../game/PlayerEconomy';
import { t } from '../i18n/i18n';
import { actionKey } from '../ui/InteractionPrompts';
import { EVACUATION_HORDE, EvacuationHorde } from '../zombies/evacuation/EvacuationHorde';
import { EvacuationProtocol, type EvacuationStage } from '../zombies/evacuation/EvacuationProtocol';
import type { ArenaEnding, ArenaEvacuation, ArenaUsePoint } from '../zombies/maps/ZombieArena';
import type { ModeContext } from './GameMode';
import { BEARING_ARROWS, bearingIndex } from './ObjectiveBearing';

/** Kicker of every evacuation note: the protocol's own (diegetic) name. */
const KICKER = 'ПРОТОКОЛ 33';
const GAUGE_CELLS = 10;
/** Players counted for the horde: single-player runs host one. */
const PLAYERS = 1;
const STAGE_ORDER: readonly EvacuationStage[] = ['locked', 'exploration', 'ready', 'defending', 'escaping', 'completed', 'failed'];

/** What the evacuation needs from the run that hosts it. */
export interface EvacuationRun {
  readonly economy: PlayerEconomy;
  /** The current round: the event's zombies are that round's. */
  round(): number;
  aliveZombies(): number;
  /** Spawns one zombie of the current round; false when none could be placed. */
  spawnZombie(): boolean;
  /** The players boarded in time: the run ends with the map's ending. */
  escaped(ending: ArenaEnding): void;
  /** The escape clock ran out: the run ends as a death. */
  failed(): void;
}

/**
 * A map's evacuation easter egg in a single-player run: prompts and USE at
 * its switches, panel and extraction point, the paid start (charged once,
 * only when the protocol accepts it), the defence check around the panel,
 * the event's own horde in place of the rounds, HUD notes, banners and
 * sounds. The pure `EvacuationProtocol` decides; the map presents.
 */
export class ZombiesEvacuation {
  private readonly protocol: EvacuationProtocol;
  private readonly horde: EvacuationHorde;
  private readonly forward = new THREE.Vector3();
  private objectiveText: string | null = null;
  /** What `objectiveText` was built from; rebuilt only when this changes. */
  private objectiveSignature = Number.NaN;
  /** Bearing (eighths of a turn) and whole metres to the extraction point, measured each frame while escaping. */
  private extractionBearing = 0;
  private extractionMetres = 0;
  /** God mode (MOTDRULES): the panel sells the way out directly, skipping every step. */
  private developerExit = false;

  public constructor(
    private readonly ctx: ModeContext,
    private readonly evacuation: ArenaEvacuation,
    private readonly run: EvacuationRun,
  ) {
    this.protocol = new EvacuationProtocol(evacuation.rules);
    this.horde = new EvacuationHorde(EVACUATION_HORDE, ctx.profile.useReducedEffects);
  }

  /** The defence or the escape is under way: the normal rounds wait. */
  public get isActive(): boolean {
    return this.protocol.active;
  }

  /** The developer command is on: the panel offers to escape at once, for the protocol's price. */
  public enableDeveloperExit(): void {
    this.developerExit = true;
  }

  public update(dt: number): void {
    this.syncPower();
    if (this.protocol.stage === 'defending') {
      this.protocol.update(dt, this.playerDefends());
      this.evacuation.showDefense(this.protocol.defenseProgress, this.protocol.defended);
    } else {
      this.protocol.update(dt, true);
    }
    if (this.protocol.active) this.spawnHorde(dt);
    this.processEvents();
    this.evacuation.showStage(this.protocol.stage);
  }

  /** Prompt of the faced switch, panel or extraction point, else null. */
  public prompt(): string | null {
    this.syncPower();
    const key = actionKey(this.ctx.profile.useTouchControls);
    const powered = this.evacuation.powered;
    for (const { lever, labelKey } of this.evacuation.switches) {
      if (lever.isOn || !this.facing(lever)) continue;
      const system = t(labelKey);
      return powered ? t('evacuation.restorePrompt', { system, key }) : t('evacuation.switchNeedsPower', { system });
    }
    if (this.facing(this.evacuation.panel)) {
      if (this.canSkip()) return t('evacuation.developerExitPrompt', { key, cost: this.evacuation.rules.cost });
      if (!powered) return t('evacuation.panelNeedsPower');
      switch (this.protocol.stage) {
        case 'exploration':
          return this.protocol.briefed ? t('evacuation.panelOffline', { systems: this.systemsStatus(' · ') }) : t('evacuation.panelPrompt', { key });
        case 'ready':
          return t('evacuation.initiatePrompt', { key, cost: this.evacuation.rules.cost });
        default:
          return null;
      }
    }
    if (this.protocol.stage === 'escaping' && this.facing(this.evacuation.extraction)) return t('evacuation.boardPrompt', { key });
    return null;
  }

  /** USE pressed; true when it was meant for the evacuation. Its consequences play at once. */
  public interact(): boolean {
    this.syncPower();
    const used = this.use();
    this.processEvents();
    return used;
  }

  /** The persistent HUD note: what to do next, and the clocks while it runs. */
  public objective(): string | null {
    const signature = this.objectiveKey();
    if (signature !== this.objectiveSignature) {
      this.objectiveSignature = signature;
      this.objectiveText = this.buildObjective();
    }
    return this.objectiveText;
  }

  public reset(): void {
    this.protocol.reset();
    this.horde.reset();
    this.objectiveText = null;
    this.objectiveSignature = Number.NaN;
    this.developerExit = false;
  }

  /** The protocol unlocks the moment the map's power is on. */
  private syncPower(): void {
    if (this.evacuation.powered) this.protocol.powerRestored();
  }

  private use(): boolean {
    for (const { lever } of this.evacuation.switches) {
      if (lever.isOn || !this.facing(lever)) continue;
      // Without power it waits silently: the prompt already says what is missing.
      if (this.evacuation.powered && this.protocol.throwSwitch(lever.id)) {
        lever.activate();
        this.ctx.audio.playPowerSwitch();
      }
      return true;
    }
    if (this.facing(this.evacuation.panel)) return this.useControlPanel();
    if (this.protocol.stage === 'escaping' && this.facing(this.evacuation.extraction)) return this.protocol.extract();
    return false;
  }

  private canSkip(): boolean {
    return this.developerExit && this.protocol.stage !== 'completed' && this.protocol.stage !== 'failed';
  }

  private useControlPanel(): boolean {
    const { cost } = this.evacuation.rules;
    if (this.canSkip()) {
      // Charged like the real start, once: the skip only succeeds before the run's end.
      if (!this.run.economy.canAfford(cost)) {
        this.ctx.hud.flashNotEnoughPoints();
        return true;
      }
      if (this.protocol.skipToExtraction() && !this.run.economy.spend(cost)) throw new Error('Evacuation became unaffordable after validation');
      return true;
    }
    if (!this.evacuation.powered) return true;
    switch (this.protocol.stage) {
      case 'exploration':
        this.protocol.brief();
        this.ctx.hud.showRoundBanner(KICKER, t('evacuation.briefing', { systems: this.systemsStatus(', ') }));
        return true;
      case 'ready':
        if (!this.run.economy.canAfford(cost)) {
          this.ctx.hud.flashNotEnoughPoints();
          this.ctx.hud.showRoundBanner(t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost }));
          return true;
        }
        // The protocol starts once; only then is the price taken, so it is paid exactly once.
        if (!this.protocol.initiate()) return true;
        if (!this.run.economy.spend(cost)) throw new Error('Evacuation became unaffordable after validation');
        return true;
      default:
        return false;
    }
  }

  private processEvents(): void {
    for (const event of this.protocol.pendingEvents) {
      switch (event.type) {
        case 'switchThrown': {
          const entry = this.evacuation.switches.find((candidate) => candidate.lever.id === event.switchId);
          if (entry) this.ctx.hud.showRoundBanner(t('evacuation.restoredBanner', { system: t(entry.labelKey) }), KICKER);
          break;
        }
        case 'ready':
          this.ctx.hud.showRoundBanner(t('evacuation.readyBanner'), t('evacuation.readySub', { cost: this.evacuation.rules.cost }));
          break;
        case 'initiated':
          this.horde.start(this.run.round(), PLAYERS);
          this.ctx.audio.playEvacuationSiren(this.cueAt(this.evacuation.panel.position));
          this.ctx.audio.playIntercomAnnouncement(this.cueAt(this.evacuation.panel.position));
          this.ctx.hud.showRoundBanner(t('evacuation.surviveBanner'), KICKER);
          break;
        case 'defensePaused':
          this.ctx.hud.showRoundBanner(t('evacuation.pausedBanner'), t('evacuation.pausedSub'));
          break;
        case 'defenseResumed':
          // The note and the panel's gauge already show it running again.
          break;
        case 'doorOpened':
          this.ctx.audio.playBlastDoorOpen(this.cueAt(this.evacuation.exitPosition));
          this.ctx.audio.playEvacuationSiren(this.cueAt(this.evacuation.panel.position));
          this.ctx.hud.showRoundBanner(t('evacuation.escapeBanner', { seconds: this.evacuation.rules.escapeSeconds }), KICKER);
          break;
        case 'escapeFailed':
          this.horde.stop();
          this.ctx.hud.showRoundBanner(t('evacuation.failedBanner'), KICKER);
          this.run.failed();
          break;
        case 'extracted':
          this.horde.stop();
          this.run.escaped(this.evacuation.ending);
          break;
      }
    }
    this.protocol.clearEvents();
  }

  private spawnHorde(dt: number): void {
    const due = this.horde.update(dt, this.run.aliveZombies());
    for (let spawned = 0; spawned < due; spawned++) {
      if (this.run.spawnZombie()) continue;
      this.horde.requeue();
      return;
    }
  }

  /** The (only) player is alive here and close enough to the panel, on its floor. */
  private playerDefends(): boolean {
    const { panel, defenseRadius } = this.evacuation;
    const player = this.ctx.player;
    if (player.floor !== panel.floor) return false;
    const dx = panel.position.x - player.rig.position.x;
    const dz = panel.position.z - player.rig.position.z;
    return dx * dx + dz * dz <= defenseRadius * defenseRadius;
  }

  private facing(point: ArenaUsePoint): boolean {
    const player = this.ctx.player;
    if (point.floor !== player.floor) return false;
    const dx = point.position.x - player.rig.position.x;
    const dz = point.position.z - player.rig.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > point.useRange) return false;
    const forward = player.camera.getWorldDirection(this.forward);
    return distance < 1e-3 || (forward.x * dx + forward.z * dz) / distance >= point.lookDotMin;
  }

  private systemsStatus(separator: string): string {
    return this.evacuation.switches
      .map(({ lever, labelKey }) => `${t(labelKey)} ${this.protocol.isSwitchThrown(lever.id) ? '✓' : '✗'}`)
      .join(separator);
  }

  private cueAt(position: ArenaUsePoint['position']): SpatialCue {
    return cameraSpatialCue(this.ctx.player.camera, position);
  }

  /**
   * Everything the note shows, folded into one number: the stage, what is
   * restored, whole seconds on the clocks and, while escaping, the bearing
   * and distance to the extraction point.
   */
  private objectiveKey(): number {
    const stage = STAGE_ORDER.indexOf(this.protocol.stage);
    const { switches } = this.evacuation;
    let restored = this.protocol.briefed ? 1 : 0;
    for (let index = 0; index < switches.length; index++) {
      if (this.protocol.isSwitchThrown(switches[index].lever.id)) restored |= 2 << index;
    }
    if (this.protocol.stage === 'defending') {
      return stage * 1e7 + (this.protocol.defended ? 1e6 : 0) + Math.ceil(this.protocol.defenseRemaining);
    }
    if (this.protocol.stage === 'escaping') {
      this.measureExtraction();
      return stage * 1e7 + Math.ceil(this.protocol.escapeRemaining) * 1e4 + this.extractionMetres * 10 + this.extractionBearing;
    }
    return stage * 1e7 + restored;
  }

  private buildObjective(): string | null {
    const { rules } = this.evacuation;
    switch (this.protocol.stage) {
      case 'exploration': {
        if (!this.protocol.briefed) return null;
        const lines = this.evacuation.switches.map(({ lever, labelKey }) =>
          `${this.protocol.isSwitchThrown(lever.id) ? '✓' : '✗'} ${t(labelKey)}`);
        return `${KICKER} · ${t('evacuation.objectiveRestore')}\n${lines.join('\n')}`;
      }
      case 'ready':
        return `${KICKER} · ${t('evacuation.objectiveInitiate', { cost: rules.cost })}`;
      case 'defending': {
        const progress = this.protocol.defenseProgress;
        const cells = Math.floor(progress * GAUGE_CELLS);
        const gauge = `${'▮'.repeat(cells)}${'▯'.repeat(GAUGE_CELLS - cells)}`;
        const status = this.protocol.defended ? t('evacuation.objectiveHold') : t('evacuation.objectivePaused');
        return `${KICKER} · ${t('evacuation.surviveBanner')}\n${t('evacuation.objectiveDoor')} ${gauge} ${Math.floor(progress * 100)}% · ${clock(this.protocol.defenseRemaining)}\n${status}`;
      }
      case 'escaping': {
        const arrow = BEARING_ARROWS[this.extractionBearing];
        return `${KICKER} · ${t('evacuation.objectiveEscape')} · ${clock(this.protocol.escapeRemaining)}\n${arrow} ${this.extractionMetres} m`;
      }
      default:
        return null;
    }
  }

  /** Where the extraction point lies from the player's view. */
  private measureExtraction(): void {
    const player = this.ctx.player;
    const target = this.evacuation.extraction.position;
    const dx = target.x - player.rig.position.x;
    const dz = target.z - player.rig.position.z;
    player.camera.getWorldDirection(this.forward);
    this.extractionBearing = bearingIndex(this.forward.x, this.forward.z, dx, dz);
    this.extractionMetres = Math.ceil(Math.hypot(dx, dz));
  }
}

/** Whole seconds as m:ss, rounded up so the clock reads 0:00 only at the end. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
