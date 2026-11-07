/** One fire of the escape's blaze: a spot of the surface that catches as the front reaches it. */
export interface BlazeSource {
  readonly x: number;
  readonly z: number;
  /** Metres over the surface where its flames start (inside a roof, down a shaft). */
  readonly base: number;
  /** Metres around its centre its flames rise from. */
  readonly radius: number;
  /** Metres its flames stand once it burns steadily. */
  readonly height: number;
  /** Extra level of the burst as it catches (2 triples it for an instant); 0 simply catches. */
  readonly flare: number;
}

/** The blaze that razes the station in the filmed ending (`PROTOCOL33_BLAZE`). */
export interface EscapeBlazeConfig {
  /** Seconds after boarding when the first source bursts; the front spreads from it. */
  readonly from: number;
  /** Metres per second the fire front runs over the surface. */
  readonly spreadSpeed: number;
  /** Seconds a source takes to reach its steady burn once caught. */
  readonly catchSeconds: number;
  /** Time constant, in seconds, of a flare dying back into the burn. */
  readonly flareDecay: number;
  /** The first one is where the blaze starts. */
  readonly sources: ReadonlyArray<BlazeSource>;
}

/** A particle of the blaze, bound to one source and cycling through its life. */
export interface BlazeParticle {
  /** Index into `EscapeBlazeConfig.sources`. */
  readonly source: number;
  /** Where in the source's footprint it rises from, from its centre. */
  readonly offsetX: number;
  readonly offsetZ: number;
  /** Seconds one cycle lasts. */
  readonly life: number;
  /** Where in its cycle it was at time 0 (0..1). */
  readonly phase: number;
}

/** Seconds after boarding when `source` catches: the first source at `from`, the rest as the front reaches them. */
export function blazeIgnition(source: BlazeSource, config: EscapeBlazeConfig): number {
  const origin = config.sources[0];
  return config.from + Math.hypot(source.x - origin.x, source.z - origin.z) / config.spreadSpeed;
}

/**
 * How fiercely `source` burns `time` seconds after boarding: 0 before it
 * catches, its flare bursting at once and dying back while the flames
 * build to a steady 1.
 */
export function blazeLevel(time: number, source: BlazeSource, config: EscapeBlazeConfig): number {
  const since = time - blazeIgnition(source, config);
  if (since < 0) return 0;
  return smoothstep(since / config.catchSeconds) + source.flare * Math.exp(-since / config.flareDecay);
}

/** Share of the blaze burning (0..1), each source weighed by the size of its fire: the glow it throws on the sky. */
export function blazeGlow(time: number, config: EscapeBlazeConfig): number {
  let burning = 0;
  let total = 0;
  for (const source of config.sources) {
    const weight = sourceWeight(source);
    burning += weight * Math.min(1, blazeLevel(time, source, config));
    total += weight;
  }
  return total > 0 ? burning / total : 0;
}

/**
 * `count` particles shared out between the sources by the size of their
 * fires (each source keeps at least one while there are enough), scattered
 * over each footprint with lives in `life`, drawn from `random`.
 */
export function createBlazeParticles(
  count: number,
  config: EscapeBlazeConfig,
  life: { readonly min: number; readonly max: number },
  random: () => number,
): BlazeParticle[] {
  const shares = shareOut(count, config.sources.map(sourceWeight));
  const particles: BlazeParticle[] = [];
  shares.forEach((share, sourceIndex) => {
    const { radius } = config.sources[sourceIndex];
    for (let index = 0; index < share; index++) {
      const distance = radius * Math.sqrt(random());
      const angle = random() * Math.PI * 2;
      particles.push({
        source: sourceIndex,
        offsetX: Math.cos(angle) * distance,
        offsetZ: Math.sin(angle) * distance,
        life: life.min + random() * (life.max - life.min),
        phase: random(),
      });
    }
  });
  return particles;
}

/** Where `particle` is in its cycle `time` seconds into the blaze: 0 as it is born, approaching 1 as it dies. */
export function blazeAge(particle: BlazeParticle, time: number): number {
  const cycle = time / particle.life + particle.phase;
  return cycle - Math.floor(cycle);
}

function sourceWeight(source: BlazeSource): number {
  return source.radius * source.height;
}

/** Largest-remainder split of `count` by `weights`, with one each first when `count` allows it. */
function shareOut(count: number, weights: ReadonlyArray<number>): number[] {
  const floor: number = count >= weights.length ? 1 : 0;
  const shares = weights.map(() => floor);
  const left = count - floor * weights.length;
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (left <= 0 || total <= 0) return shares;
  const exact = weights.map((weight) => (weight / total) * left);
  exact.forEach((value, index) => { shares[index] += Math.floor(value); });
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);
  let missing = count - shares.reduce((sum, share) => sum + share, 0);
  for (const { index } of order) {
    if (missing <= 0) break;
    shares[index]++;
    missing--;
  }
  return shares;
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}
