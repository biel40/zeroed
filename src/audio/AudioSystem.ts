import type { SurfaceType } from '../shooting/HitTarget';
import type { ReloadPhase, ReloadStyle, WeaponAudioConfig } from '../weapons/WeaponTypes';
import { MusicManager } from './MusicManager';
import { muffleCutoff, type SpatialCue } from './SpatialCue';

const PING_THROTTLE = 0.045;
// Reload foley was hard to hear over gunfire/music; boost it above the raw profile values.
const RELOAD_VOLUME_BOOST = 1.9;

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
};

interface AudioContextParts {
  ctx: AudioContext;
  master: GainNode;
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
  private noiseBuffer: AudioBuffer | null = null;
  private lastPingTime: number = -1;
  private wind: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private mysteryBoxOpenBuffer: AudioBuffer | null = null;
  private dryFireBuffer: AudioBuffer | null = null;
  private doorPurchaseBuffer: AudioBuffer | null = null;
  private readonly mysteryBoxOpenUrl: string = `${import.meta.env.BASE_URL}assets/audio/mystery_box_open.mp3`;
  private readonly dryFireUrl: string = `${import.meta.env.BASE_URL}assets/audio/encasquillada_arma.mp3`;
  private readonly doorPurchaseUrl: string = `${import.meta.env.BASE_URL}assets/audio/door_purchase.mp3`;

  public constructor(music: MusicManager = new MusicManager()) {
    this.music = music;
  }

  /** Must be called from a user gesture before any sound can play. */
  public resume(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);

      const length: number = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data: Float32Array = this.noiseBuffer.getChannelData(0);
      for (let i: number = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
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

  public startEndingAudio(): void {
    this.music.startEndingAudio();
  }

  public stopEndingAudio(): void {
    this.music.stopEndingAudio();
  }

  /** Closes this run's AudioContext; the shared MusicManager keeps the menu theme. */
  public dispose(): void {
    this.stopEndingAudio();
    this.stopWind();
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
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
    const { ctx, master, noise } = audio;
    const t: number = ctx.currentTime;
    const duration: number = config.duration;

    const source: AudioBufferSourceNode = ctx.createBufferSource();
    source.buffer = noise;
    const filter: BiquadFilterNode = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(config.lowpass, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, config.lowpass * 0.3), t + duration);
    const gain: GainNode = ctx.createGain();
    gain.gain.setValueAtTime(config.volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration * 1.7);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + duration * 1.8);

    const osc: OscillatorNode = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(config.thump, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, config.thump * 0.45), t + 0.08);
    const oscGain: GainNode = ctx.createGain();
    oscGain.gain.setValueAtTime(config.volume * 0.7, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(oscGain);
    oscGain.connect(master);
    osc.start(t);
    osc.stop(t + 0.11);

    // Full-power rifle layers: the supersonic crack leads the report and
    // the room keeps rumbling after it.
    if (config.crack) this.tick(0, 4600, config.crack, 0.7, 0.028);
    if (config.tail) this.playShotTail(config.volume, config.tail);
    // Gas-operated actions: the carrier rides back and slams into battery.
    if (config.mechanism) {
      this.metalClang(0.038, 1250, config.mechanism, 0.05);
      this.tick(0.052, 430, config.mechanism * 0.8, 3, 0.06);
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
        if (style === 'bolt' && actionDuration > 0) {
          this.playBolt(actionDuration);
          break;
        }
        this.tick(0, profile.chargeStart, boost(0.3));
        this.tick(0.05, profile.magIn, boost(0.18));
        break;
      case 'chargeEnd':
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

  /** Low guttural drop when a zombie dies. */
  public playZombieDeath(): void {
    this.sweep(0, 'sawtooth', 190, 52, 0.3, 0.34);
    this.tick(0.03, 170, 0.3);
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

  /** Abrupt layered sting for the secret-room ritual apparition. */
  public playRitualScare(cue: SpatialCue): void {
    const audio = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, cue, 0.65);
    const t = audio.ctx.currentTime;
    this.sweepTo(audio.ctx, output, t, 'sawtooth', 760, 58, 0.2, 0.78);
    this.toneTo(audio.ctx, output, t + 0.025, 'square', 46, 0.32, 0.62);
    this.sweepTo(audio.ctx, output, t + 0.13, 'triangle', 120, 510, 0.18, 0.4);
  }

  /**
   * Rising earthy groan from the point where a zombie enters the map: an
   * upward glide reads as "arriving", the opposite of the death drop.
   */
  public playZombieSpawn(cue: SpatialCue): void {
    const audio = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, cue);
    const t = audio.ctx.currentTime;
    this.tick(0, 120, 0.3, 0.8, 0.32, output);
    this.sweep(0.08, 'sawtooth', 58, 96, 0.2, 0.7, t + 0.08, output);
    this.sweep(0.14, 'triangle', 90, 150, 0.12, 0.55, t + 0.14, output);
  }

  /** Wind-up cue from the attacker: Brutus roars, every other zombie snarls. */
  public playZombieAttack(cue: SpatialCue, brute: boolean): void {
    if (brute) this.playBruteRoar(cue);
    else this.playZombieAttackTell(cue);
  }

  /**
   * Snarl at the start of a zombie wind-up, from the attacker's position:
   * it lands ~0.5 s before the hit, enough to turn or step out of reach.
   */
  private playZombieAttackTell(cue: SpatialCue): void {
    const audio = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, cue);
    const t = audio.ctx.currentTime;
    this.sweep(0, 'sawtooth', 210, 120, 0.26, 0.24, t, output);
    this.sweep(0.02, 'square', 140, 90, 0.08, 0.2, t + 0.02, output);
    this.tick(0, 1100, 0.16, 1.2, 0.12, output);
  }

  /** Brutus attack tell: a layered sub-bass roar distinct from common zombie vocals. */
  public playBruteRoar(cue: SpatialCue): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    // The roar is a lethal warning: never let distance bury it.
    const output = this.spatialBus(audio, cue, 0.6);
    const t: number = audio.ctx.currentTime;
    this.sweep(0, 'sawtooth', 92, 38, 0.48, 0.62, t, output);
    this.sweep(0.035, 'triangle', 138, 54, 0.3, 0.48, t, output);
    this.tick(0.09, 78, 0.34, 0.7, 0.22, output);
  }

  /**
   * Heavy thump when the player takes a hit, centered. With the attacker's
   * cue, a claw rasp also comes from the side the hit came from.
   */
  public playPlayerHurt(from?: SpatialCue): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;
    this.sweep(0, 'triangle', 130, 65, 0.55, 0.18, t);
    this.tick(0, 380, 0.35);
    if (!from) return;
    // Point-blank by definition: keep the direction, not the distance.
    const output = this.spatialBus(audio, { ...from, attenuation: 1 });
    this.tick(0, 1600, 0.3, 1.5, 0.08, output);
    this.tick(0.03, 620, 0.2, 1.1, 0.1, output);
  }

  /**
   * Zombies-mode ambience: an endless filtered-noise wind bed with a slow
   * LFO on the gain. Quiet on purpose — gunshots must stay in charge.
   */
  public startWind(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio || this.wind) return;
    const { ctx, master, noise } = audio;
    const source: AudioBufferSourceNode = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter: BiquadFilterNode = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 240;
    filter.Q.value = 0.6;
    const gain: GainNode = ctx.createGain();
    gain.gain.value = 0.045;
    // Slow swell so the wind breathes instead of hissing flatly.
    const lfo: OscillatorNode = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.09;
    const lfoGain: GainNode = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    lfo.start();
    this.wind = { source, gain };
  }

  public stopWind(): void {
    if (!this.wind) return;
    try {
      this.wind.source.stop();
    } catch {
      // Already stopped; safe to ignore.
    }
    this.wind = null;
  }

  /** Low, slow groan from a living zombie, quiet enough to be half-imagined. */
  public playDistantMoan(cue: SpatialCue): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const output = this.spatialBus(audio, cue);
    const t: number = audio.ctx.currentTime;
    const base: number = 65 + Math.random() * 40;
    this.sweep(0, 'sawtooth', base, base * 0.6, 0.09, 1.4, t, output);
    this.sweep(0.1, 'triangle', base * 1.5, base, 0.06, 1.1, t + 0.1, output);
  }

  /** Two-note ominous sting when a new round begins. */
  public playRoundSting(): void {
    const audio: AudioContextParts | null = this.context();
    if (!audio) return;
    const t: number = audio.ctx.currentTime;
    this.tone(t, 'square', 220, 0.12, 0.14);
    this.tone(t + 0.16, 'square', 277, 0.14, 0.2);
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
  private spatialBus(audio: AudioContextParts, cue: SpatialCue, minAttenuation: number = 0): AudioNode {
    const gain = audio.ctx.createGain();
    gain.gain.value = clamp(Math.max(minAttenuation, cue.attenuation), 0, 1);
    gain.connect(audio.master);
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
    const ctx: AudioContext = this.ctx ?? new AudioContext();
    this.ctx = ctx;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);

      const length: number = ctx.sampleRate;
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data: Float32Array = this.noiseBuffer.getChannelData(0);
      for (let i: number = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }

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
  private playSample(audio: AudioContextParts, buffer: AudioBuffer, volume: number, lead: number = 0): void {
    const source: AudioBufferSourceNode = audio.ctx.createBufferSource();
    const gain: GainNode = audio.ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(audio.master);
    source.start(Math.max(0, audio.ctx.currentTime - lead));
  }

  private context(): AudioContextParts | null {
    if (!this.ctx || !this.master || !this.noiseBuffer) return null;
    if (this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, master: this.master, noise: this.noiseBuffer };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
