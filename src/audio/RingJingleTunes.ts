/**
 * Procedural tunes of the ring machines, one per ring, each an endless loop
 * of music-box notes (MIDI, 0 = rest) over a soft bass. A machine's MP3 in
 * `assets/audio/` (`sampleFile`) replaces its tune once it decodes.
 */
export interface RingJingleTune {
  /** Seconds per melody step. */
  readonly beat: number;
  readonly melody: readonly number[];
  /** One bass note every `bassEvery` melody steps. */
  readonly bass: readonly number[];
  readonly bassEvery: number;
  /** Seconds each melody note rings out. */
  readonly decay: number;
  readonly sampleFile: string;
}

export const RING_JINGLE_TUNES = {
  /** Resurrection: a music-box waltz in A minor, eight 1 s bars. */
  musicBox: {
    beat: 1 / 3,
    melody: [69, 72, 76, 74, 72, 71, 69, 64, 69, 68, 71, 76, 77, 76, 74, 72, 71, 69, 71, 68, 64, 69, 0, 0],
    bass: [45, 50, 45, 40, 50, 45, 40, 45],
    bassEvery: 3,
    decay: 0.45,
    sampleFile: 'ring_machine_jingle.mp3',
  },
  /**
   * Sleight of Hand: a conjurer's tiptoe in D minor, staccato and a touch
   * mischievous, with a chromatic slip before each turn; eight 1 s bars.
   */
  conjurer: {
    beat: 1 / 4,
    melody: [
      62, 0, 65, 69, 68, 69, 65, 0,
      62, 0, 65, 69, 72, 71, 69, 0,
      70, 0, 69, 67, 65, 67, 69, 0,
      64, 65, 67, 64, 61, 0, 62, 0,
    ],
    bass: [38, 45, 38, 45, 43, 46, 45, 38],
    bassEvery: 4,
    decay: 0.22,
    sampleFile: 'ring_sleight_jingle.mp3',
  },
  /** Armour: a militia band's march in G minor, square and clipped; eight 1 s bars. */
  march: {
    beat: 1 / 4,
    melody: [
      67, 0, 67, 70, 74, 0, 72, 70,
      69, 0, 65, 69, 72, 0, 70, 69,
      67, 0, 67, 70, 74, 0, 75, 74,
      72, 70, 69, 65, 67, 0, 0, 0,
    ],
    bass: [43, 50, 41, 48, 43, 50, 45, 43],
    bassEvery: 4,
    decay: 0.18,
    sampleFile: 'ring_armor_jingle.mp3',
  },
  /** Double Tap: paired staccato notes over a brisk workshop rhythm. */
  doubleTime: {
    beat: 1 / 8,
    melody: [64, 64, 0, 67, 67, 0, 71, 71, 72, 72, 0, 71, 69, 69, 67, 0,
      64, 64, 0, 67, 67, 0, 71, 71, 69, 69, 67, 66, 64, 64, 0, 0],
    bass: [40, 47, 45, 40, 40, 47, 45, 40],
    bassEvery: 4,
    decay: 0.14,
    sampleFile: 'ring_double_tap_jingle.mp3',
  },
} as const satisfies Record<string, RingJingleTune>;

export type RingJingleId = keyof typeof RING_JINGLE_TUNES;

/**
 * Renders one seamless loop of `tune` into a mono buffer (notes past the end
 * wrap to the start). It runs on the main thread the first time a machine is
 * heard, so each partial is a rotating phasor and the decay a running
 * product: no `Math.sin`/`Math.exp` per sample.
 */
export function renderRingJingle(ctx: BaseAudioContext, tune: RingJingleTune): AudioBuffer {
  const { beat, melody, bass, bassEvery, decay } = tune;
  const rate = ctx.sampleRate;
  const length = Math.round(melody.length * beat * rate);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const attackSamples = 0.004 * rate;
  const note = (midi: number, start: number, noteDecay: number, level: number, bell: boolean): void => {
    const step = (2 * Math.PI * 440 * 2 ** ((midi - 69) / 12)) / rate;
    const tail = Math.round(noteDecay * 4 * rate);
    const fall = Math.exp(-1 / (noteDecay * rate));
    // sin/cos of the fundamental and of the 4.2x partial; the octave is 2·sin·cos.
    const stepCos = Math.cos(step);
    const stepSin = Math.sin(step);
    const highCos = Math.cos(step * 4.2);
    const highSin = Math.sin(step * 4.2);
    let sin = 0;
    let cos = 1;
    let highSinValue = 0;
    let highCosValue = 1;
    let decayLevel = level;
    for (let index = 0; index < tail; index++) {
      const tone = bell ? sin + 0.6 * sin * cos + 0.12 * highSinValue : sin;
      data[(start + index) % length] += tone * decayLevel * Math.min(1, index / attackSamples);
      const nextSin = sin * stepCos + cos * stepSin;
      cos = cos * stepCos - sin * stepSin;
      sin = nextSin;
      const nextHighSin = highSinValue * highCos + highCosValue * highSin;
      highCosValue = highCosValue * highCos - highSinValue * highSin;
      highSinValue = nextHighSin;
      decayLevel *= fall;
    }
  };
  melody.forEach((midi, index) => {
    if (midi > 0) note(midi, Math.round(index * beat * rate), decay, 0.32, true);
  });
  bass.forEach((midi, bar) => note(midi, Math.round(bar * bassEvery * beat * rate), 0.8, 0.22, false));
  return buffer;
}
