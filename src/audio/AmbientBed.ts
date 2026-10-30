/** Continuous bed under a map: wind through a ruin or the hum of dead machinery. */
export type AmbientBedId = 'wind' | 'mains-hum';

/** Seconds the bed takes to swell in, and to die away when it stops. */
const FADE_IN = 4;
const FADE_OUT = 1.2;

interface NoiseLayer {
  readonly filter: BiquadFilterType;
  readonly frequency: number;
  readonly q: number;
  readonly gain: number;
  /** Playback rate of the shared noise buffer: distinct rates decorrelate layers. */
  readonly rate: number;
  /** Slow swell on the layer's gain so it breathes instead of hissing flatly. */
  readonly swell: { readonly rate: number; readonly depth: number };
}

interface ToneLayer {
  readonly type: OscillatorType;
  readonly frequency: number;
  readonly gain: number;
}

interface BedRecipe {
  readonly noise: readonly NoiseLayer[];
  readonly tones: readonly ToneLayer[];
}

/**
 * Quiet on purpose: gunshots, steps and groans must stay in charge. The
 * Station 33 hum sits on 50 Hz, the Soviet mains frequency.
 */
const BED_RECIPES: Readonly<Record<AmbientBedId, BedRecipe>> = {
  wind: {
    noise: [
      { filter: 'bandpass', frequency: 240, q: 0.6, gain: 0.045, rate: 1, swell: { rate: 0.09, depth: 0.02 } },
      // A thin whistle through broken boards, swelling on a slower cycle.
      { filter: 'bandpass', frequency: 880, q: 5, gain: 0.008, rate: 0.83, swell: { rate: 0.047, depth: 0.007 } },
    ],
    tones: [],
  },
  'mains-hum': {
    noise: [
      // Ventilation and the far tunnels: a sub rumble that never settles.
      { filter: 'lowpass', frequency: 95, q: 0.7, gain: 0.07, rate: 0.61, swell: { rate: 0.035, depth: 0.03 } },
    ],
    tones: [
      { type: 'sawtooth', frequency: 50, gain: 0.006 },
      { type: 'sine', frequency: 100, gain: 0.007 },
    ],
  },
};

/**
 * One looping ambient bed. Built once per map, it fades in on creation and
 * fades out before its sources stop, so the bed never clicks on or off.
 */
export class AmbientBed {
  private readonly fade: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];

  public constructor(
    private readonly ctx: AudioContext,
    output: AudioNode,
    noise: AudioBuffer,
    public readonly id: AmbientBedId,
  ) {
    const t = ctx.currentTime;
    this.fade = ctx.createGain();
    this.fade.gain.setValueAtTime(0, t);
    this.fade.gain.linearRampToValueAtTime(1, t + FADE_IN);
    this.fade.connect(output);
    const recipe = BED_RECIPES[id];
    for (const layer of recipe.noise) this.addNoise(noise, layer);
    for (const layer of recipe.tones) this.addTone(layer);
  }

  public stop(): void {
    const t = this.ctx.currentTime;
    // Hold where a cut-short fade-in got to; cancelling alone would snap back to its start.
    const level = this.fade.gain.value;
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setValueAtTime(level, t);
    this.fade.gain.setTargetAtTime(0, t, FADE_OUT / 4);
    for (const source of this.sources) {
      try {
        source.stop(t + FADE_OUT);
      } catch {
        // Already stopped; safe to ignore.
      }
    }
    this.sources.length = 0;
  }

  private addNoise(noise: AudioBuffer, layer: NoiseLayer): void {
    const source = this.ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.playbackRate.value = layer.rate;
    const filter = this.ctx.createBiquadFilter();
    filter.type = layer.filter;
    filter.frequency.value = layer.frequency;
    filter.Q.value = layer.q;
    const gain = this.ctx.createGain();
    gain.gain.value = layer.gain;
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = layer.swell.rate;
    const lfoDepth = this.ctx.createGain();
    lfoDepth.gain.value = layer.swell.depth;
    lfo.connect(lfoDepth);
    lfoDepth.connect(gain.gain);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.fade);
    source.start();
    lfo.start();
    this.sources.push(source, lfo);
  }

  private addTone(layer: ToneLayer): void {
    const oscillator = this.ctx.createOscillator();
    oscillator.type = layer.type;
    oscillator.frequency.value = layer.frequency;
    const gain = this.ctx.createGain();
    gain.gain.value = layer.gain;
    oscillator.connect(gain);
    gain.connect(this.fade);
    oscillator.start();
    this.sources.push(oscillator);
  }
}
