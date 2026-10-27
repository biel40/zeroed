/** Loudest the roar gets at full stream, before the effects mix. */
const ROAR_GAIN = 0.3;
const RUMBLE_GAIN = 0.22;
/** Hiss of the hot nozzle: faint while cold, loudest at the redline. */
const HISS_GAIN = 0.07;
/** Roar brightness: a dull blowtorch when cold, a harsher bark at the redline. */
const ROAR_CUTOFF = { cold: 700, hot: 1500 } as const;
/** Fade times (s): the stream catches fast and dies a touch slower. */
const ATTACK = 0.05;
const RELEASE = 0.12;
/** Smallest change worth a new automation event. */
const EPSILON = 0.01;

/**
 * Continuous roar of a flame stream: a low-passed noise roar, a sub rumble
 * under it and a nozzle hiss that rises with the heat. The graph is built
 * once, keeps running silently between bursts and only receives new
 * automation when the level or heat actually change (no per-frame
 * allocations). One-shot cues (ignition, crackles, warnings) live in
 * AudioSystem; this class only owns the looping layers.
 */
export class FlameStreamLoop {
  private readonly sources: AudioBufferSourceNode[] = [];
  private readonly roarFilter: BiquadFilterNode;
  private readonly roarGain: GainNode;
  private readonly rumbleGain: GainNode;
  private readonly hissGain: GainNode;
  private level = 0;
  private heat = 0;

  constructor(private readonly ctx: AudioContext, output: AudioNode, noise: AudioBuffer) {
    this.roarFilter = ctx.createBiquadFilter();
    this.roarFilter.type = 'lowpass';
    this.roarFilter.frequency.value = ROAR_CUTOFF.cold;
    this.roarFilter.Q.value = 0.8;
    this.roarGain = this.gain(output);
    this.roarFilter.connect(this.roarGain);
    this.loop(noise, this.roarFilter, 1);

    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 160;
    this.rumbleGain = this.gain(output);
    rumbleFilter.connect(this.rumbleGain);
    this.loop(noise, rumbleFilter, 0.73);

    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'highpass';
    hissFilter.frequency.value = 4200;
    this.hissGain = this.gain(output);
    hissFilter.connect(this.hissGain);
    this.loop(noise, hissFilter, 1.31);
  }

  /** `level` 0..1 is the stream (on or off), `heat` 0..1 the nozzle temperature. */
  set(level: number, heat: number): void {
    if (Math.abs(level - this.level) < EPSILON && Math.abs(heat - this.heat) < EPSILON) return;
    const t = this.ctx.currentTime;
    const fade = level > this.level ? ATTACK : RELEASE;
    this.level = level;
    this.heat = heat;
    this.roarGain.gain.setTargetAtTime(level * ROAR_GAIN * (0.85 + heat * 0.3), t, fade);
    this.rumbleGain.gain.setTargetAtTime(level * RUMBLE_GAIN, t, fade);
    this.roarFilter.frequency.setTargetAtTime(ROAR_CUTOFF.cold + (ROAR_CUTOFF.hot - ROAR_CUTOFF.cold) * heat, t, 0.2);
    // The hot nozzle keeps hissing between bursts until it cools.
    this.hissGain.gain.setTargetAtTime(HISS_GAIN * heat * heat * (0.4 + level * 0.6), t, 0.25);
  }

  stop(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped; safe to ignore.
      }
    }
    this.sources.length = 0;
  }

  private gain(output: AudioNode): GainNode {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(output);
    return gain;
  }

  /** Endless noise source; distinct rates decorrelate the layers. */
  private loop(noise: AudioBuffer, input: AudioNode, rate: number): void {
    const source = this.ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.playbackRate.value = rate;
    source.connect(input);
    source.start();
    this.sources.push(source);
  }
}
