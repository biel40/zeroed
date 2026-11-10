import { fireWeight, type FireFootprint } from '../shared/FireParticles';

/** One fire of the escape's blaze: a spot of the surface that catches as the front reaches it. */
export interface BlazeSource extends FireFootprint {
  readonly x: number;
  readonly z: number;
  /** Metres over the surface where its flames start (inside a roof, down a shaft). */
  readonly base: number;
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
    const weight = fireWeight(source);
    burning += weight * Math.min(1, blazeLevel(time, source, config));
    total += weight;
  }
  return total > 0 ? burning / total : 0;
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}
