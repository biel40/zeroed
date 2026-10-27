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
} as const satisfies Record<string, RingJingleTune>;

export type RingJingleId = keyof typeof RING_JINGLE_TUNES;

/** Renders one seamless loop of `tune` into a mono buffer (notes past the end wrap to the start). */
export function renderRingJingle(ctx: BaseAudioContext, tune: RingJingleTune): AudioBuffer {
  const { beat, melody, bass, bassEvery, decay } = tune;
  const rate = ctx.sampleRate;
  const length = Math.round(melody.length * beat * rate);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const note = (midi: number, start: number, noteDecay: number, level: number, bell: boolean): void => {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const tail = Math.round(noteDecay * 4 * rate);
    for (let index = 0; index < tail; index++) {
      const time = index / rate;
      const envelope = Math.min(1, time / 0.004) * Math.exp(-time / noteDecay);
      const phase = 2 * Math.PI * frequency * time;
      const tone = bell
        ? Math.sin(phase) + 0.3 * Math.sin(phase * 2) + 0.12 * Math.sin(phase * 4.2)
        : Math.sin(phase);
      data[(start + index) % length] += tone * envelope * level;
    }
  };
  melody.forEach((midi, index) => {
    if (midi > 0) note(midi, Math.round(index * beat * rate), decay, 0.32, true);
  });
  bass.forEach((midi, bar) => note(midi, Math.round(bar * bassEvery * beat * rate), 0.8, 0.22, false));
  return buffer;
}
