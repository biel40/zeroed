import * as THREE from 'three';

/** Size of one fire, whatever it burns: what its particles are shared out by. */
export interface FireFootprint {
  /** Metres around its centre its flames rise from. */
  readonly radius: number;
  /** Metres its flames stand once it burns steadily. */
  readonly height: number;
}

/** A particle of a fire, bound to one source and cycling through its life. */
export interface FireParticle {
  /** Index into the sources it was created for. */
  readonly source: number;
  /** Where in the source's footprint it rises from, from its centre. */
  readonly offsetX: number;
  readonly offsetZ: number;
  /** Seconds one cycle lasts. */
  readonly life: number;
  /** Where in its cycle it was at time 0 (0..1). */
  readonly phase: number;
}

/** Flame colour along its life, white-hot at the root, through orange and deep red, out to nothing. */
const HEAT: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 0.85, 0.5], [0.4, 1, 0.42, 0.08], [0.75, 0.5, 0.08, 0.02], [1, 0, 0, 0],
];
/** Share of a particle's life spent easing in. */
const FADE_IN = 0.12;

/** How much of the particles a fire takes, by the size of its flames. */
export function fireWeight(source: FireFootprint): number {
  return source.radius * source.height;
}

/**
 * `count` particles shared out between the sources by the size of their
 * fires (each source keeps at least one while there are enough), scattered
 * over each footprint with lives in `life`, drawn from `random`.
 */
export function createFireParticles(
  count: number,
  sources: ReadonlyArray<FireFootprint>,
  life: { readonly min: number; readonly max: number },
  random: () => number,
): FireParticle[] {
  const shares = shareOut(count, sources.map(fireWeight));
  const particles: FireParticle[] = [];
  shares.forEach((share, sourceIndex) => {
    const { radius } = sources[sourceIndex];
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

/** Where `particle` is in its cycle at `time`: 0 as it is born, approaching 1 as it dies. */
export function fireParticleAge(particle: FireParticle, time: number): number {
  const cycle = time / particle.life + particle.phase;
  return cycle - Math.floor(cycle);
}

/** Writes into `out` the colour of a flame `age` (0..1) through its life, and returns it. */
export function fireHeatColor(age: number, out: THREE.Color): THREE.Color {
  let stop = 1;
  while (stop < HEAT.length - 1 && age > HEAT[stop][0]) stop++;
  const [fromAge, r0, g0, b0] = HEAT[stop - 1];
  const [toAge, r1, g1, b1] = HEAT[stop];
  const t = THREE.MathUtils.clamp((age - fromAge) / (toAge - fromAge), 0, 1);
  return out.setRGB(r0 + (r1 - r0) * t, g0 + (g1 - g0) * t, b0 + (b1 - b0) * t);
}

/** Eases a particle in over the first part of its life, so none pops in at full strength. */
export function fireFadeIn(age: number): number {
  return Math.min(1, age / FADE_IN);
}

/**
 * Brightness of firelight at `time` (0.64..1): a fast flutter over a slower
 * sway. `phase` offsets one fire from another so they never pulse together.
 */
export function firelightFlicker(time: number, phase = 0): number {
  return 0.82 + 0.18 * (0.6 * Math.sin(time * 17.3 + phase) + 0.4 * Math.sin(time * 7.1 + 1.3 + phase * 1.7));
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
