import type { SurfaceType } from '../shooting/HitTarget';
import type { ReloadPhase, ReloadStyle, WeaponAudioConfig } from '../weapons/WeaponTypes';
import { HANDLE_RELEASE_FRACTION } from '../weapons/ReloadAnimator';
import { effectsGain, onSettingsChange } from '../core/PlayerSettings';
import { FlameStreamLoop } from './FlameStreamLoop';
import { MusicManager, type EndingAudioId } from './MusicManager';
import { RING_JINGLE_TUNES, renderRingJingle, type RingJingleId } from './RingJingleTunes';
import { muffleCutoff, type SpatialCue } from './SpatialCue';
import { AmbientBed, type AmbientBedId } from './AmbientBed';
import { VoiceLimiter } from './VoiceLimiter';
import { shotGainScale, shotPlaybackRate } from './ShotVariation';

const PING_THROTTLE = 0.045;
// Reload foley was hard to hear over gunfire/music; boost it above the raw profile values.
const RELOAD_VOLUME_BOOST = 1.9;
/** Mix level of every procedural effect before the player's volume settings. */
const EFFECTS_MIX = 0.55;

interface ReloadProfile {
  start: number;
  magOut: number;
  magDrop: number;
  magIn: number;
  magSeat: number;
  chargeStart: number;
  chargeEnd: number;
  coverOpen: number;
  coverClose: number;
  complete: number;
}

/**
 * Start frequency of the low thump under each style's reload impacts;
 * heavier actions sit lower. The AK has its own rock-and-lock foley and
 * energy weapons their synth voices, so they take none.
 */
const RELOAD_IMPACT_BODY: Partial<Record<ReloadStyle, number>> = { pistol: 160, rifle: 150, bolt: 140, belt: 120, drum: 105 };

const RELOAD_PROFILES: Record<ReloadStyle, ReloadProfile> = {
  pistol: {
    start: 1750,
    magOut: 1100,
    magDrop: 480,
    magIn: 700,
    magSeat: 1500,
    chargeStart: 1350,
    chargeEnd: 1850,
    coverOpen: 900,
    coverClose: 1150,
    complete: 2100,
  },
  rifle: {
    start: 1550,
    magOut: 1200,
    magDrop: 520,
    magIn: 780,
    magSeat: 1650,
    chargeStart: 1400,
    chargeEnd: 2000,
    coverOpen: 980,
    coverClose: 1240,
    complete: 2300,
  },
  drum: {
    start: 1180,
    magOut: 850,
    magDrop: 360,
    magIn: 600,
    magSeat: 960,
    chargeStart: 1050,
    chargeEnd: 1420,
    coverOpen: 760,
    coverClose: 980,
    complete: 1550,
  },
  rock: {
    start: 1250,
    magOut: 900,
    magDrop: 430,
    magIn: 650,
    magSeat: 1400,
    chargeStart: 1200,
    chargeEnd: 1700,
    coverOpen: 820,
    coverClose: 1060,
    complete: 1900,
  },
  belt: {
    start: 820,
    magOut: 760,
    magDrop: 360,
    magIn: 560,
    magSeat: 1240,
    chargeStart: 1100,
    chargeEnd: 1540,
    coverOpen: 700,
    coverClose: 920,
    complete: 1650,
  },
  bolt: {
    start: 1100,
    magOut: 850,
    magDrop: 410,
    magIn: 620,
    magSeat: 1300,
    chargeStart: 1180,
    chargeEnd: 1600,
    coverOpen: 800,
    coverClose: 1010,
    complete: 1800,
  },
  cell: {
    start: 1900,
    magOut: 1500,
    magDrop: 620,
    magIn: 900,
    magSeat: 1800,
    chargeStart: 1600,
    chargeEnd: 2200,
    coverOpen: 1100,
    coverClose: 1380,
    complete: 2600,
  },
  // Glass core crystal in a steel cage: its own foley (playCrystalReloadPhase) reads these as pitches.
  crystal: {
    start: 1900,
    magOut: 3600,
    magDrop: 2800,
    magIn: 2200,
    magSeat: 1200,
    chargeStart: 70,
    chargeEnd: 160,
    coverOpen: 2400,
    coverClose: 1500,
    complete: 2600,
  },
  // A heavy screw-on canister: deeper twists than the light cell.
  canister: {
    start: 1500,
    magOut: 1150,
    magDrop: 560,
    magIn: 820,
    magSeat: 1350,
    chargeStart: 1600,
    chargeEnd: 2200,
    coverOpen: 1100,
    coverClose: 1380,
    complete: 2400,
  },
};

/** Map ambience with a procedural voice in this class. */
export type AmbientCueSound =
  | 'pa-crackle' | 'distant-train' | 'power-dip' | 'metal-echo' | 'machinery'
  | 'wood-creak' | 'distant-knock' | 'wind-gust' | 'ember-crackle' | 'distant-howl';

/** What to play for a map ambient event; `sampleFile` (in `assets/audio/`) replaces the procedural sound. */
export interface AmbientCuePlayback {
  readonly sound: AmbientCueSound;
  readonly sampleFile?: string;
}

/** Ambient cues set the mood of the whole map, so distance never buries them. */
const AMBIENT_CUE_MIN_ATTENUATION = 0.35;
/**
 * Ambience mix (bed and map cues) between rounds: the last kill opens a
 * quiet breath, the next round's sting builds it back up.
 */
const AMBIENCE_BREAK_LEVEL = 0.3;
const AMBIENCE_BREAK_FADE = 1.5;
const AMBIENCE_ROUND_SWELL = 6;
/** Pausing hushes the ambience quickly; resuming brings it back gently. */
const AMBIENCE_PAUSE_FADE = 0.3;
const AMBIENCE_RESUME_FADE = 1;
/**
 * Zombie voices (spawn groans, distant moans) that may overlap; voices at
 * least this loud (nearby) may use the reserved slots.
 */
const ZOMBIE_VOICE_CAPACITY = 3;
const ZOMBIE_VOICE_RESERVE = 2;
const NEARBY_VOICE_ATTENUATION = 0.6;
const SPAWN_VOICE_SECONDS = 0.85;
const MOAN_VOICE_SECONDS = 1.5;
/** A teammate's gunfire sits under the player's own and never vanishes across the map. */
const REMOTE_SHOT_GAIN = 0.7;
const REMOTE_SHOT_MIN_ATTENUATION = 0.12;
/** Loudest the ring-machine jingle gets, standing at the machine: background, never over the fight. */
const RING_JINGLE_GAIN = 0.16;
/** Smallest change worth a new automation event on the jingle's nodes. */
const RING_JINGLE_EPSILON = 0.01;

interface RingJingle {
  source: AudioBufferSourceNode;
  /** Tune the loop plays now, and whether it is that tune's MP3 rather than the procedural one. */
  tune: RingJingleId;
  sampled: boolean;
  readonly input: AudioNode;
  readonly gain: GainNode;
  readonly lowpass: BiquadFilterNode;
  readonly panner: StereoPannerNode | null;
  volume: number;
  pan: number;
  muffle: number;
}

/** Seconds after activation at which the ritual scare's visual beats land. */
export interface RitualScareBeats {
  readonly strike: number;
  readonly impact: number;
  readonly vanish: number;
}

interface AudioContextParts {
  ctx: AudioContext;
  master: GainNode;
  /** Bus of the map ambience (bed and cues), ducked by round transitions and pauses. */
  ambience: GainNode;
  noise: AudioBuffer;
}

/**
 * Procedural Web Audio sounds: filtered noise bursts for gunshots, short
 * band-passed ticks for mechanics and a sine ping for steel hits. No audio
 * assets required; the class is the only place that knows about sound.
 */
export class AudioSystem {
  public readonly music: MusicManager;
  /**
   * The shared AudioContext, created on the first user gesture (resume()).
   * Positional consumers (a THREE.AudioListener) MUST share this context via
   * THREE.AudioContext.setContext(): one context per page keeps mobile
   * browsers within their context limits.
   */
  public get rawContext(): AudioContext | null {
    return this.ctx;
  }
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPingTime: number = -1;
  /** The map's bed: requested before the first gesture, built once the graph exists. */
  private requestedBed: AmbientBedId | null = null;
  private ambientBed: AmbientBed | null = null;
  private ambienceLevel = 1;
  private ambienceSuspended = false;
  /** True while this class suspended the context because the page went to the background. */
  private suspendedWhileHidden = false;
  private readonly zombieVoices = new VoiceLimiter(ZOMBIE_VOICE_CAPACITY, ZOMBIE_VOICE_RESERVE);
  private mysteryBoxOpenBuffer: AudioBuffer | null = null;
  private dryFireBuffer: AudioBuffer | null = null;
  private doorPurchaseBuffer: AudioBuffer | null = null;
  private readonly optionalSamples = new Map<string, AudioBuffer | null>();
  private ringJingle: RingJingle | null = null;
  /** Looping layers of a flame stream, built on its first burst. */
  private flameLoop: FlameStreamLoop | null = null;
  private flameOn = false;
  private nextFlameCrackle = 0;
  private nextCoolingTick = 0;
  /** Rendered procedural loops and decoded MP3s per tune (a requested MP3 stays null until it decodes). */
  private readonly ringJingleLoops = new Map<RingJingleId, AudioBuffer>();
  private readonly ringJingleSamples = new Map<RingJingleId, AudioBuffer | null>();
  private readonly mysteryBoxOpenUrl: string = `${import.meta.env.BASE_URL}assets/audio/mystery_box_open.mp3`;
  private readonly dryFireUrl: string = `${import.meta.env.BASE_URL}assets/audio/encasquillada_arma.mp3`;
  private readonly doorPurchaseUrl: string = `${import.meta.env.BASE_URL}assets/audio/door_purchase.mp3`;

  private readonly stopSettingsListener: () => void;

  public constructor(music: MusicManager = new MusicManager()) {
    this.music = music;
    this.stopSettingsListener = onSettingsChange(() => {
      if (this.ctx && this.master) this.master.gain.setTargetAtTime(masterGain(), this.ctx.currentTime, 0.02);
    });
    pageDocument()?.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /** Must be called from a user gesture before any sound can play. */
  public resume(): void {
    const ctx = this.ensureGraph();
    if (ctx.state === 'suspended') void ctx.resume();
    this.suspendedWhileHidden = false;
    this.music.preload();
  }

  public pauseMusic(): void {
    this.music.pause();
  }

  public resumeMusic(): void {
    this.music.resume();
  }

  public stopMusic(): void {
    this.music.stop();
  }

  public startEndingAudio(id: EndingAudioId): void {
    this.music.startEndingAudio(id);
  }

  public stopEndingAudio(): void {
    this.music.stopEndingAudio();
  }

  /** Closes this run's AudioContext; the shared MusicManager keeps the menu theme. */
  public dispose(): void {
    this.stopSettingsListener();
    pageDocument()?.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.stopEndingAudio();
    this.setAmbientBed(null);
    this.stopRingJingle();
    this.flameLoop?.stop();
    this.flameLoop = null;
    this.flameOn = false;
    this.zombieVoices.reset();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.ambienceBus = null;
    this.noiseBuffer = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
  }

  public playShot(config: WeaponAudioConfig): void {
    if (config.energy === 'raygun') {
      this.playRayGunShot(config);
      return;
    }
    if (config.energy) {
      this.playEnergyShot(config);
      return;
    }
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const sample = config.sampleFile ? this.optionalSample(config.sampleFile) : null;
    if (sample) {
      this.playSampledShot(audio, sample, config, config.volume, audio.master);
      return;
    }
    this.playReport(audio, config, 1, audio.master);
    if (config.tail) this.playShotTail(config.volume, config.tail);
    // Gas-operated actions: the carrier rides back and slams into battery.
    if (config.mechanism) {
      this.metalClang(0.038, 1250, config.mechanism, 0.05);
      this.tick(0.052, 430, config.mechanism * 0.8, 3, 0.06);
    }
  }

  /**
   * A teammate's shot heard from where they stand: the report alone, without
   * the mechanism foley or room tail that belong to the player's own gun.
   */
  public playRemoteShot(config: WeaponAudioConfig, cue: SpatialCue): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, cue, REMOTE_SHOT_MIN_ATTENUATION);
    const volume = config.volume * REMOTE_SHOT_GAIN;
    if (config.energy) {
      const t = audio.ctx.currentTime;
      this.sweep(0, 'sawtooth', 950, 170, volume * 0.45, 0.16, t, output);
      this.tick(0, 3900, volume * 0.18, 6, 0.05, output);
      return;
    }
    const sample = config.sampleFile ? this.optionalSample(config.sampleFile) : null;
    if (sample) this.playSampledShot(audio, sample, config, volume, output);
    else this.playReport(audio, config, REMOTE_SHOT_GAIN, output);
  }

  /**
   * Procedural powder report: a filtered noise burst over a low thump; a
   * full-power rifle's supersonic crack leads it. `scale` sets its loudness.
   */
  private playReport(audio: AudioContextParts, config: WeaponAudioConfig, scale: number, output: AudioNode): void {
    const { ctx, noise } = audio;
    const volume: number = config.volume * scale;
    const t: number = ctx.currentTime;
    const duration: number = config.duration;

    const source: AudioBufferSourceNode = ctx.createBufferSource();
    source.buffer = noise;
    const filter: BiquadFilterNode = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(config.lowpass, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, config.lowpass * 0.3), t + duration);
    const gain: GainNode = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration * 1.7);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output);
    source.start(t);
    source.stop(t + duration * 1.8);

    const osc: OscillatorNode = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(config.thump, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, config.thump * 0.45), t + 0.08);
    const oscGain: GainNode = ctx.createGain();
    oscGain.gain.setValueAtTime(volume * 0.7, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(oscGain);
    oscGain.connect(output);
    osc.start(t);
    osc.stop(t + 0.11);

    if (config.crack) this.tick(0, 4600, config.crack * scale, 0.7, 0.028, output);
  }

  /** Starts decoding a weapon's optional shot MP3 so the first trigger pull already uses it. */
  public preloadShotSample(config: WeaponAudioConfig): void {
    if (config.sampleFile) this.optionalSample(config.sampleFile);
  }

  /**
   * Redlined barrel: steam hissing off the hot steel and a dull tick of the
   * locked trigger. Plays when the lockout starts and on each blocked pull.
   */
  public playBarrelOverheat(): void {
    this.scrape(0, 5200, 2600, 0.16, 0.55);
    this.tick(0, 2200, 0.14);
    this.metalClang(0.04, 3100, 0.06, 0.18);
  }

  /**
   * Per-frame state of a flame weapon's stream (ФАКЕЛ-33): the roar loop
   * follows `on` and `heat` (0..1), ignition and cut-off play on the edges,
   * sparse crackles ride the burning stream and a hot nozzle ticks as it
   * cools. A silent call with no stream and no heat costs nothing.
   */
  public setFlameStream(on: boolean, heat: number): void {
    if (!on && !this.flameOn && heat <= 0 && !this.flameLoop) return;
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    this.flameLoop ??= new FlameStreamLoop(audio.ctx, audio.master, audio.noise);
    this.flameLoop.set(on ? 1 : 0, heat);
    if (on && !this.flameOn) this.playFlameIgnite();
    if (!on && this.flameOn) this.playFlameCutoff();
    this.flameOn = on;
    const t = audio.ctx.currentTime;
    if (on && t >= this.nextFlameCrackle) {
      this.nextFlameCrackle = t + 0.07 + Math.random() * 0.18;
      const pops = 1 + Math.floor(Math.random() * 3);
      for (let pop = 0; pop < pops; pop++) {
        this.tick(pop * 0.018 * Math.random(), 1600 + Math.random() * 2800, 0.025 + Math.random() * 0.035, 3, 0.022);
      }
    }
    if (!on && heat > 0.4 && t >= this.nextCoolingTick) {
      // Hot steel contracting: a faint tink now and then until it cools.
      this.nextCoolingTick = t + 0.45 + Math.random() * 1.1;
      this.metalClang(0, 3300 + Math.random() * 1600, 0.035 * heat, 0.05);
    }
  }

  /** The stream catches: igniter snap, a fireball ripping open with a deep whoomp and a sub punch. */
  private playFlameIgnite(): void {
    this.tick(0, 3200, 0.14, 8, 0.03);
    this.scrape(0, 260, 2600, 0.34, 0.34);
    this.scrape(0.02, 900, 4200, 0.12, 0.22);
    this.sweep(0, 'sine', 120, 38, 0.5, 0.42);
    this.sweep(0.01, 'triangle', 70, 30, 0.3, 0.5);
  }

  /** The valve shuts: the roar folds down and the line vents its pressure. */
  private playFlameCutoff(): void {
    this.scrape(0, 1400, 320, 0.12, 0.3);
    this.tick(0.03, 5200, 0.05, 2, 0.26);
  }

  /** The nozzle nears the redline: a rising whistle over steam and a groan of the hot metal. */
  public playFlameHeatWarning(): void {
    this.sweep(0, 'sine', 900, 1900, 0.11, 0.45);
    this.scrape(0, 6000, 3500, 0.08, 0.5);
    this.metalClang(0.1, 700, 0.1, 0.2);
  }

  /** The locked nozzle cooled: valve click, the pilot flame relighting and a bright ping. */
  public playFlameReady(): void {
    this.tick(0, 2600, 0.2, 10, 0.03);
    this.scrape(0.05, 300, 1600, 0.12, 0.18);
    this.sweep(0.06, 'sine', 1400, 1800, 0.06, 0.12);
  }

  /**
   * Core crystal swap, phase by phase: the cage latch and hinge, the spent
   * crystal sliding out as its hum dies and clinking away, the fresh one
   * sliding in and seating, the lid slammed and latched, then the core
   * charging up (over the charge window) and pulsing alive.
   */
  private playCrystalReloadPhase(phase: ReloadPhase, profile: ReloadProfile, actionDuration: number): void {
    const boost = AudioSystem.boostReloadVolume;
    switch (phase) {
      case 'coverOpen':
        this.tick(0, profile.coverOpen, boost(0.22), 10, 0.03);
        this.scrape(0.02, 900, 1500, boost(0.12), 0.16);
        break;
      case 'magOut':
        this.scrape(0, profile.magOut, profile.magOut * 0.66, boost(0.1), 0.22);
        this.sweep(0, 'sine', 420, 90, boost(0.12), 0.35);
        break;
      case 'magDrop':
        this.tick(0, profile.magDrop, boost(0.08), 12, 0.06);
        break;
      case 'magIn':
        this.scrape(0, profile.magIn, profile.magIn * 1.55, boost(0.1), 0.2);
        break;
      case 'magSeat':
        this.tick(0, profile.magSeat, boost(0.24));
        this.sweep(0, 'triangle', 180, 70, boost(0.3), 0.08);
        break;
      case 'coverClose':
        this.metalClang(0, profile.coverClose, boost(0.34), 0.1);
        this.tick(0.02, profile.coverOpen, boost(0.2), 10, 0.03);
        break;
      case 'chargeStart': {
        const duration = Math.max(0.2, actionDuration);
        this.sweep(0, 'sine', profile.chargeStart, profile.chargeStart * 5, boost(0.22), duration);
        this.sweep(0, 'triangle', profile.chargeStart * 2, profile.chargeStart * 10, boost(0.07), duration);
        break;
      }
      case 'chargeEnd':
        this.sweep(0, 'sine', profile.chargeEnd, profile.chargeEnd * 0.32, boost(0.4), 0.25);
        this.tick(0, 3800, boost(0.16), 4, 0.08);
        break;
      default:
        break;
    }
  }

  /** Decaying room echo after a heavy report: sub boom, rumble and two early reflections. */
  private playShotTail(volume: number, tail: number): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const { ctx, master, noise } = audio;
    const t: number = ctx.currentTime + 0.02;
    const duration: number = Math.min(tail, 0.95);
    const source: AudioBufferSourceNode = ctx.createBufferSource();
    source.buffer = noise;
    const filter: BiquadFilterNode = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1100, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + duration);
    const gain: GainNode = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume * 0.26, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, 0, duration + 0.04);

    this.sweep(0, 'sine', 64, 30, volume * 0.55, 0.3);
    this.tick(0.075, 520, volume * 0.22, 0.8, 0.12);
    this.tick(0.17, 380, volume * 0.13, 0.8, 0.16);
  }

  /**
   * Per-phase reload foley, fired by the ReloadAnimator thresholds so the
   * sound always matches what the visible mechanism is doing. Each style has
   * its own
   * cadence so the same action feels different for a pistol, rifle, belt-fed,
   * bolt-action or energy weapon. `actionDuration` (seconds of the
   * charge window) lets a bolt action replay its full cycle in sync.
   */
  public playReloadPhase(
    phase: ReloadPhase,
    energy: boolean = false,
    style: ReloadStyle = 'rifle',
    actionDuration: number = 0,
  ): void {
    const profile: ReloadProfile = RELOAD_PROFILES[style] ?? RELOAD_PROFILES.rifle;
    const boost = AudioSystem.boostReloadVolume;

    if (style === 'crystal') {
      this.playCrystalReloadPhase(phase, profile, actionDuration);
      return;
    }
    if (energy) {
      switch (phase) {
        case 'magOut':
          this.sweep(0, 'sine', profile.magOut * 0.22, profile.magOut * 0.12, boost(0.2), 0.14);
          break;
        case 'magDrop':
          this.tick(0, profile.magDrop, boost(0.08));
          break;
        case 'magIn':
          this.sweep(0, 'sine', profile.magIn * 0.3, profile.magIn, boost(0.2), 0.16);
          break;
        case 'magSeat':
          this.tick(0, profile.magSeat, boost(0.24));
          this.sweep(0, 'sine', profile.magSeat * 0.22, profile.magSeat * 0.52, boost(0.16), 0.12);
          break;
        case 'chargeStart':
          this.sweep(0, 'sine', profile.chargeStart * 0.2, profile.chargeStart, boost(0.2), 0.5);
          break;
        case 'chargeEnd':
          this.tick(0, profile.chargeEnd, boost(0.3));
          break;
        default:
          break;
      }
      return;
    }
    if (style === 'rock') {
      this.playRockReloadPhase(phase, profile);
      return;
    }
    switch (phase) {
      case 'magOut':
        this.tick(0, profile.magOut, boost(0.24));
        break;
      case 'magDrop':
        this.tick(0, profile.magDrop, boost(0.1));
        break;
      case 'magIn':
        this.tick(0, profile.magIn, boost(0.28));
        break;
      case 'magSeat':
        this.metalClang(0, profile.magSeat, boost(0.34), 0.11);
        this.tick(0.015, profile.magIn * 1.2, boost(0.22));
        break;
      case 'chargeStart':
        if (style === 'drum') {
          this.scrape(0, profile.chargeStart, profile.chargeStart * 0.65, boost(0.24),
            actionDuration > 0 ? actionDuration * HANDLE_RELEASE_FRACTION : 0.2);
          break;
        }
        if (style === 'bolt' && actionDuration > 0) {
          this.playBolt(actionDuration);
          break;
        }
        this.tick(0, profile.chargeStart, boost(0.3));
        this.tick(0.05, profile.magIn, boost(0.18));
        break;
      case 'chargeEnd':
        // The open bolt catches on the rear sear; it does not slam forward.
        if (style === 'drum') {
          this.tick(0, profile.chargeEnd, boost(0.3), 7, 0.045);
          break;
        }
        // The bolt cycle already ends with its own lock-down.
        if (style === 'bolt' && actionDuration > 0) break;
        this.metalClang(0, profile.chargeEnd, boost(0.36), 0.1);
        break;
      case 'coverOpen':
        this.tick(0, profile.coverOpen, boost(0.26));
        break;
      case 'coverClose':
        this.metalClang(0, profile.coverClose, boost(0.3), 0.09);
        break;
      default:
        break;
    }
    this.layerImpactBody(phase, style, actionDuration);
  }

  /**
   * The big reload moments get a low body under the generic clack: the
   * magazine slapped home, the feed cover slammed shut and the action
   * slamming into battery (a worked bolt already ends with its own lock).
   */
  private layerImpactBody(phase: ReloadPhase, style: ReloadStyle, actionDuration: number): void {
    const body = RELOAD_IMPACT_BODY[style];
    if (body === undefined) return;
    const boost = AudioSystem.boostReloadVolume;
    if (phase === 'magSeat' || phase === 'coverClose') {
      this.sweep(0, 'triangle', body, body * 0.375, boost(0.42), 0.09);
    } else if (phase === 'chargeEnd' && style !== 'drum' && !(style === 'bolt' && actionDuration > 0)) {
      this.sweep(0, 'triangle', body * 1.19, body * 0.34, boost(0.5), 0.12);
      this.metalClang(0.012, 2600, boost(0.22), 0.07);
    }
  }

  /**
   * AK rock-and-lock foley: the catch paddle and the magazine rocking off
   * its front lug, the fresh one hooking in and slapping home, then the long
   * carrier stroke against its spring and the heavy slam into battery.
   */
  private playRockReloadPhase(phase: ReloadPhase, profile: ReloadProfile): void {
    const boost = AudioSystem.boostReloadVolume;
    switch (phase) {
      case 'magOut':
        this.metalClang(0.15, profile.magOut, boost(0.2), 0.07);
        this.scrape(0.02, profile.magOut * 1.4, profile.magOut * 0.7, boost(0.2), 0.16);
        this.tick(0, 2600, boost(0.16), 10, 0.03);
        break;
      case 'magDrop':
        this.tick(0, profile.magDrop, boost(0.12), 4, 0.08);
        break;
      case 'magIn':
        this.scrape(0, profile.magIn * 1.6, profile.magIn, boost(0.18), 0.12);
        this.metalClang(0.1, profile.magIn * 1.5, boost(0.24), 0.06);
        break;
      case 'magSeat':
        this.sweep(0, 'triangle', 140, 55, boost(0.4), 0.1);
        this.metalClang(0, profile.magSeat, boost(0.42), 0.12);
        this.tick(0.012, 2400, boost(0.2), 10, 0.04);
        break;
      case 'chargeStart':
        this.metalClang(0, profile.chargeStart * 1.4, boost(0.26), 0.05);
        this.scrape(0.01, 1500, 2600, boost(0.22), 0.2);
        this.metalClang(0.22, profile.chargeStart * 0.8, boost(0.28), 0.07);
        break;
      case 'chargeEnd':
        this.sweep(0, 'triangle', 170, 50, boost(0.5), 0.12);
        this.metalClang(0, profile.chargeEnd * 0.6, boost(0.48), 0.13);
        this.metalClang(0.01, profile.chargeEnd * 1.3, boost(0.24), 0.08);
        break;
      default:
        break;
    }
  }

  /** Immediate handling sound so every accepted reload has audible feedback. */
  public playReloadStart(energy: boolean = false, style: ReloadStyle = 'rifle'): void {
    const profile: ReloadProfile = RELOAD_PROFILES[style] ?? RELOAD_PROFILES.rifle;
    const boost = AudioSystem.boostReloadVolume;
    if (energy) {
      this.sweep(0, 'sine', profile.start * 0.3, profile.start * 0.7, boost(0.18), 0.09);
      return;
    }
    if (style === 'crystal') {
      // The feed valve shuts and the line vents before the cage is opened.
      this.tick(0, profile.start, boost(0.2));
      this.scrape(0.04, 5000, 2500, boost(0.1), 0.28);
      return;
    }
    // A low body thump under the ticks so the cue reads as a mechanical
    // handling sound, not just a faint click lost under gunfire/music.
    this.sweep(0, 'triangle', 150, 50, boost(style === 'pistol' ? 0.65 : 0.58), 0.12);
    this.metalClang(0, profile.start * 0.55, boost(style === 'pistol' ? 0.55 : 0.45), 0.08);
    this.metalClang(0.022, profile.start, boost(style === 'pistol' ? 0.46 : 0.36), 0.08);
  }

  /** Authoritative reload completion: a compact mechanical lock, never fired on cancellation. */
  public playReloadComplete(energy: boolean = false, style: ReloadStyle = 'rifle'): void {
    const profile: ReloadProfile = RELOAD_PROFILES[style] ?? RELOAD_PROFILES.rifle;
    const boost = AudioSystem.boostReloadVolume;
    if (energy) {
      this.sweep(0, 'sine', profile.complete * 0.28, profile.complete * 0.72, boost(0.16), 0.1);
      this.tick(0.045, profile.complete, boost(0.24));
      return;
    }
    if (style === 'crystal') {
      // The pilot flame relights on the fresh core.
      this.scrape(0, 300, 1500, boost(0.12), 0.2);
      this.tick(0, profile.complete, boost(0.18), 10, 0.03);
      return;
    }
    if (style === 'drum') {
      // A brief handling confirmation, with no fictitious closing-bolt impact.
      this.tick(0, profile.complete, boost(0.3), 7, 0.045);
      return;
    }
    // Original two-stage lock: low receiver clack followed by a crisp latch,
    // louder than the phase ticks so the confirmation is unmistakable.
    this.metalClang(0, profile.complete * 0.42, boost(0.48), 0.12);
    this.metalClang(0.018, profile.complete, boost(0.7), 0.13);
    this.sweep(0, 'triangle', profile.complete * 0.18, profile.complete * 0.05, boost(0.26), 0.13);
  }

  /** Clamped multiplier applied to every reload sound so it reads clearly over gunfire/music. */
  private static boostReloadVolume(volume: number): number {
    return Math.min(1, volume * RELOAD_VOLUME_BOOST);
  }

  /** Arc weapon shot: bright descending zap with a short high sizzle. */
  private playEnergyShot(config: WeaponAudioConfig): void {
    this.sweep(0, 'sawtooth', 950, 170, config.volume * 0.45, 0.16);
    this.sweep(0, 'square', 1900, 340, config.volume * 0.16, 0.09);
    this.tick(0, 3900, config.volume * 0.18);
  }

  /**
   * Ray Gun shot: a warbling sawtooth zap dropping through a resonant
   * low-pass sweep, over a sub punch, a bright sizzle and a softer echo zap.
   */
  private playRayGunShot(config: WeaponAudioConfig): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const { ctx, master } = audio;
    const t: number = ctx.currentTime;
    const volume: number = config.volume;

    const zap: OscillatorNode = ctx.createOscillator();
    zap.type = 'sawtooth';
    zap.frequency.setValueAtTime(1500, t);
    zap.frequency.exponentialRampToValueAtTime(140, t + 0.22);
    // Fast vibrato that settles as the pitch falls: the unstable "wobble".
    const vibrato: OscillatorNode = ctx.createOscillator();
    vibrato.type = 'sine';
    vibrato.frequency.setValueAtTime(42, t);
    const vibratoDepth: GainNode = ctx.createGain();
    vibratoDepth.gain.setValueAtTime(90, t);
    vibratoDepth.gain.exponentialRampToValueAtTime(8, t + 0.22);
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(zap.frequency);
    const filter: BiquadFilterNode = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 9;
    filter.frequency.setValueAtTime(config.lowpass, t);
    filter.frequency.exponentialRampToValueAtTime(320, t + 0.24);
    const gain: GainNode = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume * 0.5, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    zap.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    zap.start(t);
    vibrato.start(t);
    zap.stop(t + 0.28);
    vibrato.stop(t + 0.28);

    this.sweep(0, 'sine', config.thump, 45, volume * 0.6, 0.16);
    this.tick(0, 5200, volume * 0.22, 1.2, 0.07);
    this.sweep(0, 'square', 2600, 900, volume * 0.08, 0.08);
    this.sweep(0.075, 'triangle', 900, 160, volume * 0.16, 0.2);
  }

  /** Ray Gun impact: a plasma whoomph through a closing low-pass, sub drop and crackle. */
  public playRayImpact(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const { ctx, master, noise } = audio;
    const t: number = ctx.currentTime;
    const source: AudioBufferSourceNode = ctx.createBufferSource();
    source.buffer = noise;
    const filter: BiquadFilterNode = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(2600, t);
    filter.frequency.exponentialRampToValueAtTime(160, t + 0.4);
    const gain: GainNode = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, Math.random() * 0.5, 0.45);

    this.sweep(0, 'sine', 120, 38, 0.55, 0.38, t);
    this.tick(0, 1500, 0.32);
    this.tick(0.02, 3400, 0.18, 2, 0.06);
    this.tick(0.05, 900, 0.16, 3, 0.08);
  }

  /**
   * Tesla shot: a sharp crack (high filtered noise) over a rising mains-hum
   * sweep — a capacitor bank discharging, not a powder report.
   */
  public playTeslaShot(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;
    this.tick(0, 3600, 0.5);
    this.tick(0.02, 5400, 0.32);
    this.sweep(0, 'sawtooth', 180, 1200, 0.28, 0.22, t);
    this.sweep(0, 'square', 120, 60, 0.2, 0.3, t); // 50/60 Hz-style hum tail
  }

  /**
   * A map's main switch thrown: the rusted lever grinds over, its knife
   * blades slam into the contacts with an arc, and the motor-generators spin
   * up into a low hum while the lights come back.
   */
  public playPowerSwitch(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;
    this.scrape(0, 420, 260, 0.22, 0.45);
    this.tick(0.46, 900, 0.7, 3, 0.12);
    this.tick(0.47, 2200, 0.45, 4, 0.08);
    this.sweep(0.48, 'sawtooth', 1600, 220, 0.18, 0.25);
    this.tick(0.5, 5200, 0.35);
    this.sweep(0, 'sawtooth', 28, 100, 0.2, 3.6, t + 0.7);
    this.sweep(0, 'square', 25, 50, 0.08, 4.2, t + 0.9);
  }

  /**
   * Tesla chain arc: rapid descending crackle as the charge hops between
   * zombies. One call per electrocuted group; the count drives the crackle.
   */
  public playTeslaChain(targets: number): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;
    const crackles: number = Math.min(targets, 6);
    for (let i: number = 0; i < crackles; i++) {
      const at: number = i * 0.045;
      this.tick(at, 2600 - i * 260, 0.3);
      this.sweep(at, 'square', 900 - i * 90, 320, 0.1, 0.06, t);
    }
    this.sweep(0, 'sine', 220, 55, 0.34, 0.34, t); // low discharge body
  }

  /** Tesla unlock milestone: an ascending electric arpeggio + hum swell. */
  public playTeslaUnlock(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = Math.max(0, audio.ctx.currentTime - 0.08);
    this.tone(t, 'square', 392, 0.14, 0.12);
    this.tone(t + 0.1, 'square', 587, 0.14, 0.12);
    this.tone(t + 0.2, 'square', 784, 0.16, 0.22);
    this.sweep(0.2, 'sawtooth', 100, 400, 0.16, 0.5, t);
  }

  /** Fleshy thud when a bullet connects with a zombie. */
  public playZombieHit(): void {
    this.tick(0, 300, 0.38);
    this.tick(0.012, 150, 0.26);
  }

  /** Fast air cut for the knife wind-up. */
  public playKnifeSwing(): void {
    const audio = this.context();
    if (!audio) return;
    const source = audio.ctx.createBufferSource();
    source.buffer = audio.noise;
    const filter = audio.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, audio.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(420, audio.ctx.currentTime + 0.11);
    filter.Q.value = 0.7;
    const gain = audio.ctx.createGain();
    gain.gain.setValueAtTime(0.18, audio.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + 0.13);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    source.start();
    source.stop(audio.ctx.currentTime + 0.14);
  }

  /** Wet low impact with a short metallic edge from the heavy blade. */
  public playKnifeHit(): void {
    this.tick(0, 240, 0.5, 0.75, 0.1);
    this.tick(0.012, 1150, 0.22, 1.1, 0.055);
  }

  /** Dry palm contact with a low body thump for the cooperative revive. */
  public playReviveContact(): void {
    this.tick(0, 900, 0.3, 0.7, 0.07);
    this.tick(0.018, 180, 0.28, 0.7, 0.09);
  }

  /** Standalone skull impact: a fleshy body followed by a distinct dry crack. */
  public playHeadshotHit(): void {
    // Delaying the crack slightly keeps it perceptually separate from the
    // weapon report. Low Q values retain a broad, audible noise spectrum;
    // the old resonant ticks measured loud but contained very little energy.
    this.tick(0.014, 480, 0.85, 0.8, 0.11);
    this.tick(0.028, 1450, 1.25, 0.9, 0.09);
    this.tick(0.046, 3200, 0.65, 1.2, 0.06);
  }

  /** Short wood/hammer tick for each rebuilt barrier board. */
  public playRepairBoard(): void {
    this.tick(0, 420, 0.28);
    this.tick(0.04, 180, 0.18);
  }

  /** Layered crack from the window where a zombie tears a board away. */
  public playBarrierBreak(cue: SpatialCue): void {
    const audio = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, cue);
    this.tick(0, 680, 0.2, 1.4, 0.07, output);
    this.tick(0.025, 230, 0.14, 1.1, 0.1, output);
  }

  /**
   * Paid door opening: `door_purchase.mp3` when present, otherwise a coin
   * chime over a splintering crack and a low thud.
   */
  public playDoorUnlock(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    if (this.doorPurchaseBuffer) {
      this.playSample(audio, this.doorPurchaseBuffer, 0.9, 0.04);
      return;
    }
    const t: number = audio.ctx.currentTime;
    this.tone(t, 'triangle', 988, 0.13, 0.12);
    this.tone(t + 0.07, 'triangle', 1319, 0.12, 0.26);
    this.tick(0.12, 260, 0.32);
    this.tick(0.14, 780, 0.2, 1.6, 0.09);
    this.tick(0.2, 420, 0.16, 1.2, 0.08);
    this.sweep(0.12, 'sine', 160, 48, 0.28, 0.3);
  }

  /** A ring slid onto the finger: a small metal chime over the locker's latch. */
  public playRingPurchase(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;
    this.tick(0, 1400, 0.22);
    this.tone(t + 0.04, 'sine', 1568, 0.12, 0.5);
    this.tone(t + 0.09, 'sine', 2349, 0.08, 0.7);
    this.tone(t + 0.12, 'triangle', 784, 0.07, 0.6);
  }

  /** A spent ring taking its charge again: a rising shimmer that settles on one note. */
  public playRingRecharge(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;
    this.sweep(0, 'sine', 520, 1560, 0.11, 0.45);
    this.tone(t + 0.42, 'sine', 1568, 0.1, 0.55);
    this.tick(0.02, 1400, 0.16);
  }

  /** Resurrection firing: a heartbeat restarting under a cold swelling chord. */
  public playResurrection(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;
    this.sweep(0, 'sine', 70, 38, 0.42, 0.22);
    this.sweep(0.34, 'sine', 70, 38, 0.36, 0.22);
    this.tone(t + 0.15, 'sine', 659, 0.12, 1.3);
    this.tone(t + 0.25, 'sine', 988, 0.1, 1.2);
    this.tone(t + 0.38, 'triangle', 1319, 0.07, 1.0);
    this.sweep(0.1, 'sawtooth', 160, 1200, 0.05, 0.9);
  }

  /**
   * The music of the ring machines, heard around them like a perk jingle:
   * one endless loop whose volume, pan and muffle follow the listener, and
   * whose tune is the nearest machine's (omitted, it keeps the current one).
   * A tune's MP3 in `assets/audio/` replaces its procedural loop once it
   * decodes. Volume 0 keeps the loop running silently; the loop only starts
   * the first time it is audible. Allocation free per frame while the tune
   * stays the same.
   */
  public setRingJingle(volume: number, pan: number, muffle: number, tune?: RingJingleId): void {
    if (volume <= 0 && !this.ringJingle) return;
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const wanted = tune ?? this.ringJingle?.tune ?? 'musicBox';
    const sample = this.ringJingleSample(wanted);
    const jingle = this.ringJingle ?? this.startRingJingle(audio, wanted);
    if (jingle.tune !== wanted || (sample && !jingle.sampled)) this.swapRingJingleSource(audio, jingle, wanted, sample);
    const t = audio.ctx.currentTime;
    if (Math.abs(volume - jingle.volume) > RING_JINGLE_EPSILON) {
      jingle.volume = volume;
      jingle.gain.gain.setTargetAtTime(clamp(volume, 0, 1) * RING_JINGLE_GAIN, t, 0.15);
    }
    if (Math.abs(muffle - jingle.muffle) > RING_JINGLE_EPSILON) {
      jingle.muffle = muffle;
      jingle.lowpass.frequency.setTargetAtTime(muffleCutoff(muffle), t, 0.1);
    }
    if (jingle.panner && Math.abs(pan - jingle.pan) > RING_JINGLE_EPSILON) {
      jingle.pan = pan;
      jingle.panner.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.1);
    }
  }

  /** The tune's decoded MP3, requested on first use; null until (unless) it decodes. */
  private ringJingleSample(tune: RingJingleId): AudioBuffer | null {
    if (!this.ringJingleSamples.has(tune)) {
      this.ringJingleSamples.set(tune, null);
      const url = `${import.meta.env.BASE_URL}assets/audio/${RING_JINGLE_TUNES[tune].sampleFile}`;
      void this.loadSample(url).then((buffer) => { this.ringJingleSamples.set(tune, buffer); });
    }
    return this.ringJingleSamples.get(tune) ?? null;
  }

  /** The tune's procedural loop, rendered once. */
  private ringJingleLoop(ctx: AudioContext, tune: RingJingleId): AudioBuffer {
    let loop = this.ringJingleLoops.get(tune);
    if (!loop) {
      loop = renderRingJingle(ctx, RING_JINGLE_TUNES[tune]);
      this.ringJingleLoops.set(tune, loop);
    }
    return loop;
  }

  private startRingJingle(audio: AudioContextParts, tune: RingJingleId): RingJingle {
    const { ctx, master } = audio;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = muffleCutoff(0);
    lowpass.Q.value = 0.5;
    lowpass.connect(gain);
    const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    panner?.connect(lowpass);
    const input: AudioNode = panner ?? lowpass;
    const source = this.loopSource(ctx, this.ringJingleLoop(ctx, tune), input);
    this.ringJingle = { source, tune, sampled: false, input, gain, lowpass, panner, volume: 0, pan: 0, muffle: 0 };
    return this.ringJingle;
  }

  /** Restarts the loop on `tune`: its MP3 when decoded, else its procedural loop. */
  private swapRingJingleSource(audio: AudioContextParts, jingle: RingJingle, tune: RingJingleId, sample: AudioBuffer | null): void {
    const previous = jingle.source;
    jingle.source = this.loopSource(audio.ctx, sample ?? this.ringJingleLoop(audio.ctx, tune), jingle.input);
    jingle.tune = tune;
    jingle.sampled = sample !== null;
    try {
      previous.stop();
    } catch {
      // Already stopped; safe to ignore.
    }
  }

  private loopSource(ctx: AudioContext, buffer: AudioBuffer, output: AudioNode): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(output);
    source.start();
    return source;
  }

  private stopRingJingle(): void {
    if (!this.ringJingle) return;
    try {
      this.ringJingle.source.stop();
    } catch {
      // Already stopped; safe to ignore.
    }
    this.ringJingle = null;
  }

  /** Quiet stereo cue emitted from a soul lamp when one soul reaches it. */
  public playSoulAbsorb(cue: SpatialCue): void {
    const audio = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, cue);
    const t = audio.ctx.currentTime;
    this.sweepTo(audio.ctx, output, t, 'sine', 430, 820, 0.12, 0.13);
    this.toneTo(audio.ctx, output, t + 0.045, 'triangle', 1120, 0.055, 0.09);
  }

  /** Bright two-stage chime for a fully charged soul lamp. */
  public playSoulLampComplete(cue: SpatialCue): void {
    const audio = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, cue);
    const t = audio.ctx.currentTime;
    this.toneTo(audio.ctx, output, t, 'triangle', 392, 0.24, 0.24);
    this.toneTo(audio.ctx, output, t + 0.1, 'triangle', 587, 0.2, 0.3);
    this.toneTo(audio.ctx, output, t + 0.2, 'sine', 880, 0.13, 0.4);
  }

  /** Heavy map-wide cue for the hidden bunker wall beginning to move. */
  public playSecretRoomUnlock(cue: SpatialCue): void {
    const audio = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, cue, 0.5);
    const t = audio.ctx.currentTime;
    this.sweepTo(audio.ctx, output, t, 'sawtooth', 105, 42, 0.38, 0.7);
    this.sweepTo(audio.ctx, output, t + 0.15, 'triangle', 240, 720, 0.2, 0.55);
    this.toneTo(audio.ctx, output, t + 0.48, 'sine', 960, 0.14, 0.38);
  }

  /**
   * Secret-room jumpscare scheduled on the visual beats: candles choking out
   * over a heartbeat and a swelling whisper, a dissonant stab when the circle
   * erupts, a shriek that climbs while the figure charges, a hit in the face
   * and a hard cut into a low rumble.
   */
  public playRitualScare(cue: SpatialCue, beats: RitualScareBeats): void {
    const audio = this.context();
    if (!audio) return;
    const { ctx, noise } = audio;
    // The player stands on the circle: keep the direction, never soften it.
    const spatial = this.spatialBus(audio, { ...cue, attenuation: 1, muffle: 0 });
    // A limiter lets the stacked layers hit hard without clipping the master bus.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 4;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.3;
    limiter.connect(spatial);
    const bus = ctx.createGain();
    bus.gain.value = 1.8;
    bus.connect(limiter);

    const t = ctx.currentTime;
    const strike = t + beats.strike;
    const impact = t + beats.impact;
    const vanish = t + beats.vanish;
    const envelope = (start: number, peak: number, end: number, volume: number, output: AudioNode = bus): GainNode => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, peak);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.connect(output);
      return gain;
    };
    const oscillator = (type: OscillatorType, from: number, to: number, start: number, end: number,
      output: AudioNode): OscillatorNode => {
      const node = ctx.createOscillator();
      node.type = type;
      node.frequency.setValueAtTime(from, start);
      node.frequency.exponentialRampToValueAtTime(Math.max(20, to), end);
      node.connect(output);
      node.start(start);
      node.stop(end + 0.05);
      return node;
    };
    const noiseBand = (type: BiquadFilterType, from: number, to: number, q: number, start: number, end: number,
      output: AudioNode): void => {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, start);
      filter.frequency.exponentialRampToValueAtTime(to, end);
      source.connect(filter);
      filter.connect(output);
      source.start(start, Math.random() * 0.5);
      source.stop(end + 0.05);
    };

    // Candles choke out; a heartbeat and a whisper swell until the strike.
    noiseBand('lowpass', 2600, 220, 0.8, t, t + 0.4, envelope(t, t + 0.015, t + 0.4, 0.55));
    oscillator('sine', 74, 38, t + 0.12, t + 0.3, envelope(t + 0.12, t + 0.13, t + 0.3, 0.9));
    oscillator('sine', 70, 36, t + 0.34, t + 0.5, envelope(t + 0.34, t + 0.35, t + 0.5, 0.65));
    oscillator('sine', 44, 33, t, strike, envelope(t, strike - 0.02, strike + 0.08, 0.55));
    noiseBand('bandpass', 420, 2800, 4, t, strike, envelope(t, strike - 0.01, strike + 0.05, 0.4));

    // Strike: blast, sub drop and a dissonant cluster stab.
    noiseBand('lowpass', 8000, 240, 0.7, strike, strike + 0.9, envelope(strike, strike + 0.006, strike + 0.9, 1));
    oscillator('sine', 120, 26, strike, strike + 1.2, envelope(strike, strike + 0.006, strike + 1.2, 1));
    const stab = ctx.createBiquadFilter();
    stab.type = 'lowpass';
    stab.frequency.value = 3200;
    stab.connect(envelope(strike, strike + 0.01, vanish + 0.5, 0.42));
    for (const frequency of [196, 207.7, 220, 293.7, 311.1, 415.3, 440]) {
      oscillator('sawtooth', frequency, frequency * 0.94, strike, vanish + 0.5, stab);
    }

    // Shriek: detuned voices climbing through a vocal formant with a fast
    // vibrato, peaking at the face and cut dead on the vanish.
    const shriekStart = strike + 0.08;
    const shriek = ctx.createGain();
    shriek.gain.setValueAtTime(0.0001, shriekStart);
    shriek.gain.exponentialRampToValueAtTime(0.12, shriekStart + 0.12);
    shriek.gain.exponentialRampToValueAtTime(0.75, impact);
    shriek.gain.setValueAtTime(0.75, vanish - 0.03);
    shriek.gain.linearRampToValueAtTime(0, vanish);
    shriek.connect(bus);
    const formant = ctx.createBiquadFilter();
    formant.type = 'peaking';
    formant.frequency.value = 1250;
    formant.Q.value = 1.4;
    formant.gain.value = 14;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 380;
    formant.connect(highpass);
    highpass.connect(shriek);
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 15;
    vibrato.start(shriekStart);
    vibrato.stop(vanish + 0.05);
    for (const [frequency, type] of [[560, 'sawtooth'], [843, 'sawtooth'], [1190, 'square']] as const) {
      const voice = oscillator(type, frequency, frequency * 1.9, shriekStart, impact, formant);
      const depth = ctx.createGain();
      depth.gain.value = frequency * 0.06;
      vibrato.connect(depth);
      depth.connect(voice.frequency);
      voice.stop(vanish + 0.05);
    }
    noiseBand('bandpass', 1800, 3600, 1.1, shriekStart, vanish, shriek);

    // Impact in the face: wide crack, metallic screech and a second sub hit.
    noiseBand('bandpass', 3200, 900, 0.7, impact, impact + 0.45, envelope(impact, impact + 0.004, impact + 0.45, 1));
    oscillator('square', 2300, 420, impact, impact + 0.35, envelope(impact, impact + 0.005, impact + 0.35, 0.3));
    oscillator('sine', 100, 28, impact, impact + 0.8, envelope(impact, impact + 0.005, impact + 0.8, 1));

    // After the cut: a long low rumble and a fading exhale.
    noiseBand('lowpass', 420, 70, 0.9, vanish, vanish + 1.8, envelope(vanish, vanish + 0.04, vanish + 1.8, 0.6));
    noiseBand('bandpass', 1400, 450, 2, vanish + 0.2, vanish + 1.6,
      envelope(vanish + 0.2, vanish + 0.5, vanish + 1.6, 0.14));
  }

  /**
   * Map ambush: casements slamming against their stops and a dissonant,
   * shrieking stab from the zombie behind them. Never softened by distance:
   * the player is always right there.
   */
  public playAmbushScare(cue: SpatialCue): void {
    const audio = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, { ...cue, attenuation: 1, muffle: 0 });
    const t = audio.ctx.currentTime;
    this.tick(0, 520, 0.9, 1.2, 0.12, output);
    this.tick(0.02, 160, 0.8, 0.9, 0.22, output);
    this.tick(0.19, 900, 0.35, 2, 0.06, output);
    this.sweep(0, 'sawtooth', 620, 1180, 0.32, 0.55, t, output);
    this.sweep(0, 'square', 655, 1240, 0.16, 0.5, t, output);
    this.sweep(0.05, 'sawtooth', 110, 52, 0.4, 0.8, t + 0.05, output);
  }

  /**
   * Rising earthy groan from the point where a zombie enters the map: an
   * upward glide reads as "arriving".
   */
  public playZombieSpawn(cue: SpatialCue): void {
    const audio = this.context();
    if (!audio || !this.claimZombieVoice(audio, cue, SPAWN_VOICE_SECONDS)) return;
    const output = this.spatialBus(audio, cue);
    const t = audio.ctx.currentTime;
    this.tick(0, 120, 0.3, 0.8, 0.32, output);
    this.sweep(0.08, 'sawtooth', 58, 96, 0.2, 0.7, t + 0.08, output);
    this.sweep(0.14, 'triangle', 90, 150, 0.12, 0.55, t + 0.14, output);
  }

  /**
   * The map's looping bed (null silences it). Safe before the first user
   * gesture: the bed starts as soon as the audio graph exists, fading in
   * and out instead of clicking.
   */
  public setAmbientBed(bed: AmbientBedId | null): void {
    this.requestedBed = bed;
    this.syncAmbientBed();
  }

  /** Pause menu: the ambience hushes with the music and returns on resume. */
  public setAmbienceSuspended(suspended: boolean): void {
    if (this.ambienceSuspended === suspended) return;
    this.ambienceSuspended = suspended;
    this.applyAmbienceLevel(suspended ? AMBIENCE_PAUSE_FADE : AMBIENCE_RESUME_FADE);
  }

  /** Low, slow groan from a living zombie, quiet enough to be half-imagined. */
  public playDistantMoan(cue: SpatialCue): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio || !this.claimZombieVoice(audio, cue, MOAN_VOICE_SECONDS)) return;
    const output = this.spatialBus(audio, cue);
    const t: number = audio.ctx.currentTime;
    const base: number = 65 + Math.random() * 40;
    this.sweep(0, 'sawtooth', base, base * 0.6, 0.09, 1.4, t, output);
    this.sweep(0.1, 'triangle', base * 1.5, base, 0.06, 1.1, t + 0.1, output);
  }

  /**
   * A map's positioned ambience: its MP3 from `assets/audio/` once loaded,
   * otherwise the procedural version of that sound.
   */
  public playAmbientCue(cue: AmbientCuePlayback, spatial: SpatialCue): void {
    const audio = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, spatial, AMBIENT_CUE_MIN_ATTENUATION, audio.ambience);
    const sample = cue.sampleFile ? this.optionalSample(cue.sampleFile) : null;
    if (sample) {
      const source = audio.ctx.createBufferSource();
      source.buffer = sample;
      source.connect(output);
      source.start();
      return;
    }
    const t = audio.ctx.currentTime;
    switch (cue.sound) {
      case 'pa-crackle': this.playPaCrackle(audio, output, t); break;
      case 'distant-train': this.playDistantTrain(output, t); break;
      case 'power-dip': this.playPowerDip(audio, output, t); break;
      case 'metal-echo': this.playMetalEcho(output); break;
      case 'machinery': this.playMachinery(output, t); break;
      case 'wood-creak': this.playWoodCreak(output, t); break;
      case 'distant-knock': this.playDistantKnock(output); break;
      case 'wind-gust': this.playWindGust(output, t); break;
      case 'ember-crackle': this.playEmberCrackle(output); break;
      case 'distant-howl': this.playDistantHowl(output, t); break;
    }
  }

  /** Optional ambience and weapon files load on first use; null until (or unless) they decode. */
  private optionalSample(file: string): AudioBuffer | null {
    if (!this.optionalSamples.has(file)) {
      this.optionalSamples.set(file, null);
      void this.loadSample(`${import.meta.env.BASE_URL}assets/audio/${file}`)
        .then((buffer) => this.optionalSamples.set(file, buffer));
    }
    return this.optionalSamples.get(file) ?? null;
  }

  /** Dead public-address horn: static, a warped two-tone chime and a garbled voice. */
  private playPaCrackle(audio: AudioContextParts, output: AudioNode, t: number): void {
    for (let index = 0; index < 9; index++) {
      this.tick(Math.random() * 0.4, 2400 + Math.random() * 1600, 0.05 + Math.random() * 0.06, 3, 0.025, output);
    }
    this.toneTo(audio.ctx, output, t + 0.38, 'triangle', 652, 0.07, 0.5);
    this.toneTo(audio.ctx, output, t + 0.66, 'triangle', 517, 0.07, 0.7);
    // A narrow formant over a buzz reads as speech through a broken speaker.
    const formant = audio.ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 1050;
    formant.Q.value = 1.4;
    formant.connect(output);
    for (let syllable = 0; syllable < 7; syllable++) {
      const at = t + 1.2 + syllable * 0.19 + Math.random() * 0.05;
      const pitch = 120 + Math.random() * 45;
      this.sweep(0, 'sawtooth', pitch, pitch * 0.85, 0.11, 0.15, at, formant);
    }
    for (let index = 0; index < 6; index++) {
      this.tick(1.2 + Math.random() * 1.4, 3000 + Math.random() * 1500, 0.04, 3, 0.02, output);
    }
    this.tick(2.7, 1900, 0.09, 2, 0.06, output);
  }

  /** A train that never arrives: a swelling sub rumble and a faint wheel squeal far below. */
  private playDistantTrain(output: AudioNode, t: number): void {
    const swell = [0.07, 0.13, 0.19, 0.22, 0.17, 0.1, 0.05];
    for (let index = 0; index < swell.length; index++) {
      this.tick(index * 0.5, 75 + index * 4, swell[index], 0.8, 1.6, output);
    }
    this.sweep(0, 'sine', 36, 52, 0.16, 3.2, t + 0.4, output);
    this.tick(1.6, 2350, 0.022, 16, 1.4, output);
  }

  /** Mains relay dropping out, the hum dying and the tube starters clicking back. */
  private playPowerDip(audio: AudioContextParts, output: AudioNode, t: number): void {
    this.tick(0, 170, 0.32, 2, 0.08, output);
    this.sweep(0, 'sawtooth', 100, 48, 0.05, 0.8, t, output);
    this.toneTo(audio.ctx, output, t + 1.15, 'sawtooth', 100, 0.04, 0.45);
    for (const offset of [1.12, 1.24, 1.31, 1.47]) this.tick(offset, 3300, 0.12, 9, 0.02, output);
  }

  /** A far-off tunnel strike ringing down the vaults: one clang and its fading echoes. */
  private playMetalEcho(output: AudioNode): void {
    for (let echo = 0; echo < 5; echo++) {
      const level = Math.pow(0.55, echo);
      this.tick(echo * 0.32, 1150, 0.16 * level, 18, 0.18, output);
      this.tick(echo * 0.32 + 0.006, 2100, 0.06 * level, 22, 0.1, output);
    }
  }

  /** Something still running deep in the depot: slow pump strokes, a ratchet and a motor drone. */
  private playMachinery(output: AudioNode, t: number): void {
    for (let stroke = 0; stroke < 6; stroke++) {
      this.tick(stroke * 0.55, 90, 0.18, 1, 0.25, output);
      this.tick(stroke * 0.55 + 0.27, 1700, 0.03, 8, 0.04, output);
    }
    this.sweep(0, 'sawtooth', 62, 58, 0.03, 3.2, t, output);
  }

  /** Burnt timber taking a weight: stick-slip chatter rising in pitch under a dull groan. */
  private playWoodCreak(output: AudioNode, t: number): void {
    for (let slip = 0; slip < 14; slip++) {
      this.tick(slip * 0.045 + Math.random() * 0.015, 380 + slip * 12, 0.05, 9, 0.03, output);
    }
    this.sweep(0, 'triangle', 190, 240, 0.03, 0.7, t, output);
  }

  /** Three or four dull knocks somewhere in the house, never quite in rhythm. */
  private playDistantKnock(output: AudioNode): void {
    const knocks = 3 + Math.floor(Math.random() * 2);
    for (let knock = 0; knock < knocks; knock++) {
      const at = knock * 0.42 + Math.random() * 0.08;
      this.tick(at, 140, 0.3, 1.2, 0.12, output);
      this.tick(at + 0.01, 600, 0.06, 2, 0.04, output);
    }
  }

  /** Wind forcing through the gutted walls: overlapping noise swells and a thin whistle. */
  private playWindGust(output: AudioNode, t: number): void {
    this.tick(0, 300, 0.05, 0.8, 1.6, output);
    this.tick(0.5, 520, 0.07, 0.9, 1.8, output);
    this.tick(1.1, 380, 0.05, 0.8, 1.6, output);
    this.sweep(0.3, 'sine', 700, 980, 0.012, 2, t + 0.3, output);
  }

  /** The smouldering ruin spitting: scattered pops over a faint hiss. */
  private playEmberCrackle(output: AudioNode): void {
    this.tick(0, 2600, 0.02, 0.7, 1.4, output);
    for (let pop = 0; pop < 10; pop++) {
      this.tick(Math.random() * 1.6, 1400 + Math.random() * 2600, 0.03 + Math.random() * 0.04, 3, 0.025, output);
    }
  }

  /** Something screaming far outside: a rising howl that breaks and falls away. */
  private playDistantHowl(output: AudioNode, t: number): void {
    this.sweep(0, 'sawtooth', 230, 480, 0.06, 0.9, t, output);
    this.sweep(0, 'triangle', 345, 720, 0.03, 0.9, t, output);
    this.sweep(0.85, 'sawtooth', 480, 190, 0.05, 1.3, t + 0.85, output);
  }

  /**
   * A new round begins: two-note ominous sting over a sub drop; the
   * ambience hushed by the last round builds back up under it.
   */
  public playRoundStartCue(): void {
    this.setAmbienceLevel(1, AMBIENCE_ROUND_SWELL);
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;
    this.sweep(0, 'sine', 72, 40, 0.26, 0.9, t);
    this.tone(t, 'square', 220, 0.12, 0.14);
    this.tone(t + 0.16, 'square', 277, 0.14, 0.2);
  }

  /**
   * The last zombie of the round fell: a slow, falling bell toll with
   * inharmonic partials, then the ambience drops into a tense quiet.
   */
  public playRoundEndCue(): void {
    this.setAmbienceLevel(AMBIENCE_BREAK_LEVEL, AMBIENCE_BREAK_FADE);
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;
    for (const [at, root, volume] of [[0, 98, 0.2], [1.1, 82.4, 0.15]] as const) {
      this.tone(t + at, 'sine', root, volume, 2.8);
      this.tone(t + at, 'sine', root * 2.76, volume * 0.35, 1.6);
      this.tone(t + at, 'sine', root * 5.4, volume * 0.15, 0.9);
    }
    this.sweep(0.15, 'triangle', 147, 92, 0.06, 2.4, t + 0.15);
  }

  /**
   * Bolt-action cycle timed to the ReloadAnimator stroke (lift, rear at 40 %,
   * forward from 55 %, lock-down at the end) so each sound matches the
   * visible bolt: cam lift, rearward slide and stop, ejected case, forward
   * stroke chambering the round and the handle locking down.
   */
  public playBolt(cycleTime: number = 0.7): void {
    const at = (fraction: number): number => fraction * cycleTime;
    this.metalClang(0, 1850, 0.34, 0.06);
    this.tick(0.012, 620, 0.22, 2.2, 0.05);
    this.scrape(at(0.1), 900, 2300, 0.2, at(0.3));
    this.metalClang(at(0.4), 1250, 0.42, 0.09);
    this.tick(at(0.44), 4200, 0.12, 18, 0.12);
    this.scrape(at(0.55), 2100, 850, 0.18, at(0.25));
    this.metalClang(at(0.8), 700, 0.4, 0.1);
    this.metalClang(at(0.92), 2300, 0.38, 0.07);
  }

  public async loadMysteryBoxOpenAsset(): Promise<void> {
    // Without the asset the procedural opening sound remains available.
    this.mysteryBoxOpenBuffer ??= await this.loadSample(this.mysteryBoxOpenUrl);
  }

  public async loadDryFireAsset(): Promise<void> {
    // Without the asset the procedural dry-fire sound remains available.
    this.dryFireBuffer ??= await this.loadSample(this.dryFireUrl);
  }

  public async loadDoorPurchaseAsset(): Promise<void> {
    // Without the asset the procedural purchase cue remains available.
    this.doorPurchaseBuffer ??= await this.loadSample(this.doorPurchaseUrl);
  }

  /** Mystery Box opening: a hollow rising creak with a wooden knock. */
  public playMysteryBoxOpen(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;

    if (this.mysteryBoxOpenBuffer) {
      this.playSample(audio, this.mysteryBoxOpenBuffer, 0.85, 0.06);
      return;
    }

    this.sweep(0, 'triangle', 110, 330, 0.3, 0.45);
    this.tick(0.04, 620, 0.22);
    this.tick(0.16, 940, 0.18);
  }

  /** Roulette tick: a short mechanical click per weapon flash. */
  public playMysteryBoxTick(): void {
    this.tick(0, 1400 + Math.random() * 350, 0.13);
  }

  /**
   * Result reveal. Normal pulls get a two-tone chime; the Ray Gun gets a
   * bright ascending arpeggio with a shimmer tail — the rare-jackpot tell.
   */
  public playMysteryBoxReveal(energy: boolean): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = Math.max(0, audio.ctx.currentTime - 0.08);
    if (energy) {
      this.tone(t, 'square', 523, 0.14, 0.12);
      this.tone(t + 0.1, 'square', 784, 0.14, 0.12);
      this.tone(t + 0.2, 'square', 1046, 0.16, 0.2);
      this.sweep(0.2, 'sine', 1400, 2600, 0.12, 0.4, t);
      return;
    }
    this.tone(t, 'triangle', 330, 0.2, 0.16);
    this.tone(t + 0.14, 'triangle', 415, 0.2, 0.24);
  }

  /** Weapon taken from the box: a confirming click-chime. */
  public playMysteryBoxPickup(): void {
    this.tick(0, 1900, 0.26);
    this.sweep(0.03, 'sine', 520, 880, 0.18, 0.14);
  }

  /** Lid closing (result taken or expired): a low wooden settling thud. */
  public playMysteryBoxClose(): void {
    this.sweep(0, 'triangle', 260, 95, 0.24, 0.3);
    this.tick(0.12, 420, 0.2);
  }

  public playDryFire(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    if (this.dryFireBuffer) {
      this.playSample(audio, this.dryFireBuffer, 0.5);
      return;
    }
    this.tick(0, 2500, 0.16);
  }

  public playFireMode(): void {
    this.tick(0, 2000, 0.14);
  }

  public playPing(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const { ctx } = audio;
    if (ctx.currentTime - this.lastPingTime < PING_THROTTLE) return;
    this.lastPingTime = ctx.currentTime;

    const t: number = ctx.currentTime;
    const frequency: number = 1600 + Math.random() * 350;
    this.tone(t, 'sine', frequency, 0.16, 0.28);
    this.tone(t, 'triangle', frequency * 2.03, 0.05, 0.12);
  }

  /** Short surface-dependent impact sound for environment hits. */
  public playImpact(surface: SurfaceType): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;

    switch (surface) {
      case 'wood':
        this.tick(0, 750, 0.26);
        this.tick(0.02, 420, 0.16);
        break;
      case 'metal':
        this.tone(t, 'sine', 1200 + Math.random() * 300, 0.07, 0.14);
        this.tone(t, 'triangle', 2450 + Math.random() * 300, 0.03, 0.07);
        break;
      case 'paper':
        this.tick(0, 1800, 0.09);
        break;
      default:
        // dirt / concrete: low thud.
        this.tick(0, 320, 0.3);
        this.tick(0.012, 160, 0.2);
        break;
    }
  }

  private tone(
    at: number,
    type: OscillatorType,
    frequency: number,
    volume: number,
    duration: number,
  ): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const { ctx, master } = audio;
    const osc: OscillatorNode = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    const gain: GainNode = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  /** Oscillator glissando: the workhorse for sci-fi and creature sounds. */
  private sweep(
    offset: number,
    type: OscillatorType,
    fromFrequency: number,
    toFrequency: number,
    volume: number,
    duration: number,
    at?: number,
    output?: AudioNode,
  ): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const { ctx, master } = audio;
    const t: number = at ?? ctx.currentTime + offset;
    const osc: OscillatorNode = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFrequency, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFrequency), t + duration);
    const gain: GainNode = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(output ?? master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private tick(
    offset: number,
    frequency: number,
    volume: number,
    q: number = 6,
    duration: number = 0.05,
    output?: AudioNode,
  ): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const { ctx, master, noise } = audio;
    const t: number = ctx.currentTime + offset;

    const source: AudioBufferSourceNode = ctx.createBufferSource();
    source.buffer = noise;
    const filter: BiquadFilterNode = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain: GainNode = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(output ?? master);
    source.start(t, Math.random() * 0.5, Math.max(0.06, duration + 0.02));
  }

  /** Band-passed noise glide: metal parts sliding against each other. */
  private scrape(offset: number, fromFrequency: number, toFrequency: number, volume: number, duration: number): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const { ctx, master, noise } = audio;
    const t: number = ctx.currentTime + offset;
    const source: AudioBufferSourceNode = ctx.createBufferSource();
    source.buffer = noise;
    const filter: BiquadFilterNode = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(fromFrequency, t);
    filter.frequency.exponentialRampToValueAtTime(toFrequency, t + duration);
    filter.Q.value = 2.4;
    const gain: GainNode = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + duration * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, Math.random() * 0.5, duration + 0.02);
  }

  /** Resonant core tone plus a detuned overtone, for a metal-on-metal clang instead of a plain click. */
  private metalClang(offset: number, frequency: number, volume: number, duration: number = 0.1): void {
    this.tick(offset, frequency, volume, 16, duration);
    this.tick(offset + 0.006, frequency * 1.85, volume * 0.42, 22, duration * 0.6);
  }

  /**
   * Per-cue chain: [panner] -> low-pass (muffle) -> gain -> master.
   * `minAttenuation` keeps critical warnings audible across the map.
   */
  private spatialBus(
    audio: AudioContextParts,
    cue: SpatialCue,
    minAttenuation: number = 0,
    destination: AudioNode = audio.master,
  ): AudioNode {
    const gain = audio.ctx.createGain();
    gain.gain.value = clamp(Math.max(minAttenuation, cue.attenuation), 0, 1);
    gain.connect(destination);
    let input: AudioNode = gain;
    if (cue.muffle > 0) {
      const lowpass = audio.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = muffleCutoff(cue.muffle);
      lowpass.Q.value = 0.5;
      lowpass.connect(input);
      input = lowpass;
    }
    if (typeof audio.ctx.createStereoPanner !== 'function') return input;
    const panner = audio.ctx.createStereoPanner();
    panner.pan.value = clamp(cue.pan, -1, 1);
    panner.connect(input);
    return panner;
  }

  private toneTo(
    ctx: AudioContext,
    output: AudioNode,
    at: number,
    type: OscillatorType,
    frequency: number,
    volume: number,
    duration: number,
  ): void {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  private sweepTo(
    ctx: AudioContext,
    output: AudioNode,
    at: number,
    type: OscillatorType,
    fromFrequency: number,
    toFrequency: number,
    volume: number,
    duration: number,
  ): void {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromFrequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, toFrequency), at + duration);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  /** Decodes an optional MP3; null keeps the caller on its procedural fallback. */
  private async loadSample(url: string): Promise<AudioBuffer | null> {
    const ctx: AudioContext = this.ensureGraph();
    try {
      const response: Response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const audioData: ArrayBuffer = await response.arrayBuffer();
      return await ctx.decodeAudioData(audioData.slice(0));
    } catch {
      return null;
    }
  }

  /**
   * `lead` starts the sample slightly in the past to compensate for browser
   * scheduling latency, so it lands on the moment the player pressed USE.
   */
  /**
   * A decoded gunshot recording: a fresh one-shot source per trigger pull,
   * so rapid fire overlaps the earlier tails instead of cutting them.
   */
  private playSampledShot(
    audio: AudioContextParts,
    sample: AudioBuffer,
    config: WeaponAudioConfig,
    volume: number,
    output: AudioNode,
  ): void {
    const gain = volume * shotGainScale(config.variation);
    this.playSample(audio, sample, gain, 0, output, shotPlaybackRate(config.variation));
  }

  private playSample(
    audio: AudioContextParts,
    buffer: AudioBuffer,
    volume: number,
    lead: number = 0,
    output: AudioNode = audio.master,
    playbackRate: number = 1,
  ): void {
    const source: AudioBufferSourceNode = audio.ctx.createBufferSource();
    const gain: GainNode = audio.ctx.createGain();
    source.buffer = buffer;
    if (playbackRate !== 1) source.playbackRate.value = playbackRate;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(output);
    source.start(Math.max(0, audio.ctx.currentTime - lead));
  }

  /** One context per run: master and ambience buses, the shared noise buffer and any pending bed. */
  private ensureGraph(): AudioContext {
    if (this.ctx && this.master && this.ambienceBus && this.noiseBuffer) return this.ctx;
    const ctx: AudioContext = this.ctx ?? new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = masterGain();
    this.master.connect(ctx.destination);
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = this.ambienceSuspended ? 0 : this.ambienceLevel;
    this.ambienceBus.connect(this.master);

    const length: number = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data: Float32Array = this.noiseBuffer.getChannelData(0);
    for (let i: number = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.syncAmbientBed();
    return ctx;
  }

  /** Builds, swaps or fades out the bed to match the requested one; nothing before the graph exists. */
  private syncAmbientBed(): void {
    if (this.ambientBed?.id === this.requestedBed) return;
    this.ambientBed?.stop();
    this.ambientBed = null;
    if (!this.requestedBed || !this.ctx || !this.ambienceBus || !this.noiseBuffer) return;
    this.ambientBed = new AmbientBed(this.ctx, this.ambienceBus, this.noiseBuffer, this.requestedBed);
  }

  private setAmbienceLevel(level: number, seconds: number): void {
    this.ambienceLevel = level;
    this.applyAmbienceLevel(seconds);
  }

  /** Glides the ambience bus to its level (zero while paused) over roughly `seconds`. */
  private applyAmbienceLevel(seconds: number): void {
    if (!this.ctx || !this.ambienceBus) return;
    const target = this.ambienceSuspended ? 0 : this.ambienceLevel;
    const gain = this.ambienceBus.gain;
    gain.cancelScheduledValues(this.ctx.currentTime);
    gain.setTargetAtTime(target, this.ctx.currentTime, seconds / 3);
  }

  /** A horde never stacks a wall of groans: only a few voices overlap, nearby ones first. */
  private claimZombieVoice(audio: AudioContextParts, cue: SpatialCue, seconds: number): boolean {
    return this.zombieVoices.tryStart(audio.ctx.currentTime, seconds, cue.attenuation >= NEARBY_VOICE_ATTENUATION);
  }

  /**
   * Backgrounding (tab switch, Android app switch) suspends the effects
   * context so no loop keeps running unseen; returning resumes only what
   * this handler suspended. Music elements follow the shell's own pause.
   */
  private readonly handleVisibilityChange = (): void => {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    if (document.visibilityState === 'hidden') {
      if (ctx.state !== 'running') return;
      this.suspendedWhileHidden = true;
      void ctx.suspend().catch(() => undefined);
    } else if (this.suspendedWhileHidden) {
      this.suspendedWhileHidden = false;
      void ctx.resume().catch(() => undefined);
    }
  };

  private context(): AudioContextParts | null {
    if (!this.ctx || !this.master || !this.ambienceBus || !this.noiseBuffer) return null;
    if (this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, master: this.master, ambience: this.ambienceBus, noise: this.noiseBuffer };
  }
}

function masterGain(): number {
  return EFFECTS_MIX * effectsGain();
}

/** The page document when it can report visibility; null in workers and headless runs. */
function pageDocument(): Document | null {
  return typeof document !== 'undefined' && typeof document.addEventListener === 'function' ? document : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
