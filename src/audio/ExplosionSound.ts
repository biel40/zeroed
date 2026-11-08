/** Explosion layers in seconds: how long the boom and the rumble tail ring out. */
const BOOM_SECONDS = 2.2;
const TAIL_SECONDS = 3.4;
const SUB_SECONDS = 0.7;
/** Fragments and debris rattling down after the blast. */
const DEBRIS_GRAINS = 14;
/** Closer than this share of full proximity, the ears ring. */
const RINGING_PROXIMITY = 0.55;

/**
 * Procedural grenade blast, played into `output` (already panned, muffled
 * and attenuated by the caller): the supersonic crack, a lowpassed boom
 * that sweeps down as it rolls away, a sub-bass thump felt more than heard,
 * fragments and debris rattling down, a long rumbling tail and, when it
 * went off close (`proximity` near 1), the ears ringing afterwards.
 */
export function playProceduralExplosion(
  ctx: AudioContext,
  output: AudioNode,
  noise: AudioBuffer,
  volume: number,
  proximity: number,
): void {
  const t = ctx.currentTime;
  noiseBurst(ctx, output, noise, t, 'highpass', 1800, 1800, volume * 0.55, 0.07);
  noiseBurst(ctx, output, noise, t, 'lowpass', 2600, 160, volume * 1.1, BOOM_SECONDS);
  noiseBurst(ctx, output, noise, t + 0.05, 'lowpass', 420, 70, volume * 0.5, TAIL_SECONDS);
  tone(ctx, output, t, 'sine', 78, 26, volume * 0.95, SUB_SECONDS);
  tone(ctx, output, t, 'triangle', 140, 45, volume * 0.35, 0.25);
  for (let grain = 0; grain < DEBRIS_GRAINS; grain++) {
    const at = t + 0.25 + Math.random() * 1.4;
    const pitch = 1400 + Math.random() * 3200;
    noiseBurst(ctx, output, noise, at, 'bandpass', pitch, pitch, volume * (0.05 + Math.random() * 0.07), 0.04 + Math.random() * 0.05);
  }
  if (proximity > RINGING_PROXIMITY) {
    const ringing = (proximity - RINGING_PROXIMITY) / (1 - RINGING_PROXIMITY);
    tone(ctx, output, t + 0.15, 'sine', 3300, 3150, 0.05 * ringing, 2.4);
  }
}

/** A sampled blast: the file as recorded, its loudness set by the caller's bus. */
export function playSampledExplosion(ctx: AudioContext, output: AudioNode, sample: AudioBuffer, volume: number): void {
  const gain = ctx.createGain();
  gain.gain.value = volume;
  gain.connect(output);
  const source = ctx.createBufferSource();
  source.buffer = sample;
  source.connect(gain);
  source.start();
}

/** The pin coming out of the fuse: a bright metallic ping over a dry click. */
export function playPinPull(ctx: AudioContext, output: AudioNode, noise: AudioBuffer): void {
  const t = ctx.currentTime;
  noiseBurst(ctx, output, noise, t, 'bandpass', 3800, 3800, 0.14, 0.03);
  tone(ctx, output, t + 0.01, 'sine', 2900, 2700, 0.07, 0.18);
  noiseBurst(ctx, output, noise, t + 0.09, 'bandpass', 1600, 1600, 0.09, 0.025);
}

/** One second of the fuse burning in the hand: a dry spring tick. */
export function playCookTick(ctx: AudioContext, output: AudioNode, noise: AudioBuffer): void {
  const t = ctx.currentTime;
  noiseBurst(ctx, output, noise, t, 'bandpass', 2600, 2600, 0.08, 0.02);
  tone(ctx, output, t, 'triangle', 1700, 1500, 0.025, 0.05);
}

/** The arm whipping the grenade away: a quick airy whoosh. */
export function playThrowWhoosh(ctx: AudioContext, output: AudioNode, noise: AudioBuffer): void {
  noiseBurst(ctx, output, noise, ctx.currentTime, 'bandpass', 900, 300, 0.16, 0.2);
}

/** Cast iron hitting the floor or a wall; `strength` 0..1 by impact speed. */
export function playGrenadeBounce(ctx: AudioContext, output: AudioNode, noise: AudioBuffer, strength: number): void {
  const t = ctx.currentTime;
  const level = Math.min(1, Math.max(0, strength));
  noiseBurst(ctx, output, noise, t, 'bandpass', 2300, 2300, 0.05 + 0.12 * level, 0.035);
  tone(ctx, output, t, 'triangle', 1250 + Math.random() * 300, 900, 0.03 + 0.06 * level, 0.09);
  tone(ctx, output, t, 'sine', 220, 120, 0.04 + 0.08 * level, 0.07);
}

function noiseBurst(
  ctx: AudioContext,
  output: AudioNode,
  noise: AudioBuffer,
  at: number,
  type: BiquadFilterType,
  fromFrequency: number,
  toFrequency: number,
  volume: number,
  duration: number,
): void {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = duration > noise.duration;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(fromFrequency, at);
  if (toFrequency !== fromFrequency) filter.frequency.exponentialRampToValueAtTime(Math.max(20, toFrequency), at + duration);
  if (type === 'bandpass') filter.Q.value = 4;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, volume), at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(output);
  source.start(at, Math.random() * Math.max(0, noise.duration - 0.1));
  source.stop(at + duration + 0.05);
}

function tone(
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
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(fromFrequency, at);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, toFrequency), at + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, volume), at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain);
  gain.connect(output);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.05);
}
