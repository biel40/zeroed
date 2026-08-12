import type { SurfaceType } from '../shooting/HitTarget';
import type { WeaponAudioConfig } from '../weapons/WeaponTypes';

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

  playReload(duration: number): void {
    this.tick(0, 1300, 0.28);
    this.tick(duration * 0.45, 900, 0.3);
    this.tick(duration * 0.85, 1800, 0.34);
  }

  playBolt(): void {
    this.tick(0, 1500, 0.3);
    this.tick(0.16, 1050, 0.36);
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
