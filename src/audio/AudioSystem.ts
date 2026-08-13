import type { SurfaceType } from '../shooting/HitTarget';
import type { ReloadPhase, WeaponAudioConfig } from '../weapons/WeaponTypes';

const PING_THROTTLE = 0.045;

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
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPingTime = -1;
  private wind: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private mysteryBoxOpenBuffer: AudioBuffer | null = null;
  private readonly mysteryBoxOpenUrl = `${import.meta.env.BASE_URL}assets/audio/mystery_box_open.mp3`;

  /** Must be called from a user gesture before any sound can play. */
  resume(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);

      const length = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  playShot(config: WeaponAudioConfig): void {
    if (config.energy) {
      this.playEnergyShot(config);
      return;
    }
    const audio = this.context();
    if (!audio) return;
    const { ctx, master, noise } = audio;
    const t = ctx.currentTime;
    const duration = config.duration;

    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(config.lowpass, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, config.lowpass * 0.3), t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(config.volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration * 1.7);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
    source.stop(t + duration * 1.8);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(config.thump, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, config.thump * 0.45), t + 0.08);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(config.volume * 0.7, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(oscGain);
    oscGain.connect(master);
    osc.start(t);
    osc.stop(t + 0.11);
  }

  /**
   * Per-phase reload foley, fired by the ReloadAnimator thresholds so the
   * sound always matches what the hands are doing. Energy weapons get a
   * synthesized cell-swap variant.
   */
  playReloadPhase(phase: ReloadPhase, energy = false): void {
    if (energy) {
      switch (phase) {
        case 'magOut':
          this.sweep(0, 'sine', 320, 170, 0.2, 0.14);
          break;
        case 'magDrop':
          this.tick(0, 500, 0.08);
          break;
        case 'magIn':
          this.sweep(0, 'sine', 210, 520, 0.2, 0.16);
          break;
        case 'magSeat':
          this.tick(0, 1900, 0.24);
          this.sweep(0, 'sine', 420, 940, 0.16, 0.12);
          break;
        case 'chargeStart':
          this.sweep(0, 'sine', 260, 1250, 0.2, 0.5);
          break;
        case 'chargeEnd':
          this.tick(0, 2100, 0.3);
          break;
        default:
          break;
      }
      return;
    }
    switch (phase) {
      case 'magOut':
        this.tick(0, 1100, 0.24);
        break;
      case 'magDrop':
        this.tick(0, 480, 0.1);
        break;
      case 'magIn':
        this.tick(0, 700, 0.28);
        break;
      case 'magSeat':
        this.tick(0, 1500, 0.34);
        this.tick(0.015, 850, 0.22);
        break;
      case 'chargeStart':
        this.tick(0, 1350, 0.3);
        this.tick(0.05, 900, 0.18);
        break;
      case 'chargeEnd':
        this.tick(0, 1850, 0.36);
        break;
      case 'coverOpen':
        this.tick(0, 900, 0.26);
        break;
      case 'coverClose':
        this.tick(0, 1150, 0.3);
        break;
      default:
        break;
    }
  }

  /** Ray Gun shot: bright descending zap with a short high sizzle. */
  private playEnergyShot(config: WeaponAudioConfig): void {
    this.sweep(0, 'sawtooth', 950, 170, config.volume * 0.45, 0.16);
    this.sweep(0, 'square', 1900, 340, config.volume * 0.16, 0.09);
    this.tick(0, 3900, config.volume * 0.18);
  }

  /** Ray Gun impact: energetic pop with a low sub tail. */
  playRayImpact(): void {
    const audio = this.context();
    if (!audio) return;
    const t = audio.ctx.currentTime;
    this.tick(0, 1500, 0.4);
    this.tick(0.015, 420, 0.32);
    this.sweep(0, 'sine', 120, 42, 0.5, 0.3, t);
  }

  /**
   * Tesla shot: a sharp crack (high filtered noise) over a rising mains-hum
   * sweep — a capacitor bank discharging, not a powder report.
   */
  playTeslaShot(): void {
    const audio = this.context();
    if (!audio) return;
    const t = audio.ctx.currentTime;
    this.tick(0, 3600, 0.5);
    this.tick(0.02, 5400, 0.32);
    this.sweep(0, 'sawtooth', 180, 1200, 0.28, 0.22, t);
    this.sweep(0, 'square', 120, 60, 0.2, 0.3, t); // 50/60 Hz-style hum tail
  }

  /**
   * Tesla chain arc: rapid descending crackle as the charge hops between
   * zombies. One call per electrocuted group; the count drives the crackle.
   */
  playTeslaChain(targets: number): void {
    const audio = this.context();
    if (!audio) return;
    const t = audio.ctx.currentTime;
    const crackles = Math.min(targets, 6);
    for (let i = 0; i < crackles; i++) {
      const at = i * 0.045;
      this.tick(at, 2600 - i * 260, 0.3);
      this.sweep(at, 'square', 900 - i * 90, 320, 0.1, 0.06, t);
    }
    this.sweep(0, 'sine', 220, 55, 0.34, 0.34, t); // low discharge body
  }

  /** Tesla unlock milestone: an ascending electric arpeggio + hum swell. */
  playTeslaUnlock(): void {
    const audio = this.context();
    if (!audio) return;
    const t = Math.max(0, audio.ctx.currentTime - 0.08);
    this.tone(t, 'square', 392, 0.14, 0.12);
    this.tone(t + 0.1, 'square', 587, 0.14, 0.12);
    this.tone(t + 0.2, 'square', 784, 0.16, 0.22);
    this.sweep(0.2, 'sawtooth', 100, 400, 0.16, 0.5, t);
  }

  /** Fleshy thud when a bullet connects with a zombie. */
  playZombieHit(): void {
    this.tick(0, 300, 0.38);
    this.tick(0.012, 150, 0.26);
  }

  /** Low guttural drop when a zombie dies. */
  playZombieDeath(): void {
    this.sweep(0, 'sawtooth', 190, 52, 0.3, 0.34);
    this.tick(0.03, 170, 0.3);
  }

  /** Heavy thump when the player takes a hit. */
  playPlayerHurt(): void {
    const audio = this.context();
    if (!audio) return;
    const t = audio.ctx.currentTime;
    this.sweep(0, 'triangle', 130, 65, 0.55, 0.18, t);
    this.tick(0, 380, 0.35);
  }

  /**
   * Zombies-mode ambience: an endless filtered-noise wind bed with a slow
   * LFO on the gain. Quiet on purpose — gunshots must stay in charge.
   */
  startWind(): void {
    const audio = this.context();
    if (!audio || this.wind) return;
    const { ctx, master, noise } = audio;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 240;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.045;
    // Slow swell so the wind breathes instead of hissing flatly.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
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

  stopWind(): void {
    if (!this.wind) return;
    try {
      this.wind.source.stop();
    } catch {
      // Already stopped; safe to ignore.
    }
    this.wind = null;
  }

  /** Far-away groan: low, slow, and quiet enough to be half-imagined. */
  playDistantMoan(): void {
    const audio = this.context();
    if (!audio) return;
    const t = audio.ctx.currentTime;
    const base = 65 + Math.random() * 40;
    this.sweep(0, 'sawtooth', base, base * 0.6, 0.05, 1.4, t);
    this.sweep(0.1, 'triangle', base * 1.5, base, 0.035, 1.1, t);
  }

  /** Two-note ominous sting when a new round begins. */
  playRoundSting(): void {
    const audio = this.context();
    if (!audio) return;
    const t = audio.ctx.currentTime;
    this.tone(t, 'square', 220, 0.12, 0.14);
    this.tone(t + 0.16, 'square', 277, 0.14, 0.2);
  }

  playBolt(): void {
    this.tick(0, 1500, 0.3);
    this.tick(0.16, 1050, 0.36);
  }

  async loadMysteryBoxOpenAsset(): Promise<void> {
    if (this.mysteryBoxOpenBuffer) return;

    const ctx = this.ctx ?? new AudioContext();
    this.ctx = ctx;
    if (!this.master) {
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);

      const length = ctx.sampleRate;
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }

    try {
      const response = await fetch(this.mysteryBoxOpenUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const audioData = await response.arrayBuffer();
      this.mysteryBoxOpenBuffer = await ctx.decodeAudioData(audioData.slice(0));
    } catch (error) {
      console.warn('[AudioSystem] Mystery box open MP3 not available; procedural fallback will be used.', error);
    }
  }

  /**
   * Duration of the decoded Mystery Box opening theme in seconds, or null
   * while the MP3 is still fetching/decoding (or failed to load). Lets the
   * box machine time the weapon reveal against the REAL audio instead of
   * a hardcoded guess.
   */
  getMysteryBoxOpenDuration(): number | null {
    return this.mysteryBoxOpenBuffer ? this.mysteryBoxOpenBuffer.duration : null;
  }

  /** Mystery Box opening: a hollow rising creak with a wooden knock. */
  playMysteryBoxOpen(): void {
    const audio = this.context();
    if (!audio) return;

    if (this.mysteryBoxOpenBuffer) {
      const source = audio.ctx.createBufferSource();
      const gain = audio.ctx.createGain();
      source.buffer = this.mysteryBoxOpenBuffer;
      gain.gain.value = 0.85;
      source.connect(gain);
      gain.connect(audio.master);
      // Compensate for browser scheduling latency so the audio starts on the
      // same moment the player presses the interaction button.
      source.start(Math.max(0, audio.ctx.currentTime - 0.06));
      return;
    }

    this.sweep(0, 'triangle', 110, 330, 0.3, 0.45);
    this.tick(0.04, 620, 0.22);
    this.tick(0.16, 940, 0.18);
  }

  /** Roulette tick: a short mechanical click per weapon flash. */
  playMysteryBoxTick(): void {
    this.tick(0, 1400 + Math.random() * 350, 0.13);
  }

  /**
   * Result reveal. Normal pulls get a two-tone chime; the Ray Gun gets a
   * bright ascending arpeggio with a shimmer tail — the rare-jackpot tell.
   */
  playMysteryBoxReveal(energy: boolean): void {
    const audio = this.context();
    if (!audio) return;
    const t = Math.max(0, audio.ctx.currentTime - 0.08);
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
  playMysteryBoxPickup(): void {
    this.tick(0, 1900, 0.26);
    this.sweep(0.03, 'sine', 520, 880, 0.18, 0.14);
  }

  /** Lid closing (result taken or expired): a low wooden settling thud. */
  playMysteryBoxClose(): void {
    this.sweep(0, 'triangle', 260, 95, 0.24, 0.3);
    this.tick(0.12, 420, 0.2);
  }

  playDryFire(): void {
    this.tick(0, 2500, 0.16);
  }

  playFireMode(): void {
    this.tick(0, 2000, 0.14);
  }

  playPing(): void {
    const audio = this.context();
    if (!audio) return;
    const { ctx } = audio;
    if (ctx.currentTime - this.lastPingTime < PING_THROTTLE) return;
    this.lastPingTime = ctx.currentTime;

    const t = ctx.currentTime;
    const frequency = 1600 + Math.random() * 350;
    this.tone(t, 'sine', frequency, 0.16, 0.28);
    this.tone(t, 'triangle', frequency * 2.03, 0.05, 0.12);
  }

  /** Short surface-dependent impact sound for environment hits. */
  playImpact(surface: SurfaceType): void {
    const audio = this.context();
    if (!audio) return;
    const t = audio.ctx.currentTime;

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
    const audio = this.context();
    if (!audio) return;
    const { ctx, master } = audio;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    const gain = ctx.createGain();
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
  ): void {
    const audio = this.context();
    if (!audio) return;
    const { ctx, master } = audio;
    const t = at ?? ctx.currentTime + offset;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFrequency, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFrequency), t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private tick(offset: number, frequency: number, volume: number): void {
    const audio = this.context();
    if (!audio) return;
    const { ctx, master, noise } = audio;
    const t = ctx.currentTime + offset;

    const source = ctx.createBufferSource();
    source.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t, Math.random() * 0.5, 0.06);
  }

  private context(): AudioContextParts | null {
    if (!this.ctx || !this.master || !this.noiseBuffer) return null;
    if (this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, master: this.master, noise: this.noiseBuffer };
  }
}
