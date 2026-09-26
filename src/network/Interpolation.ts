/**
 * Network smoothing primitives, independent of Three.js and of the render
 * rate: remote state arrives at a fixed network tick, render frames sample a
 * slightly delayed timeline and interpolate between the bracketing samples.
 */

export interface TimedSample {
  readonly t: number;
}

export interface SampleBracket<T extends TimedSample> {
  from: T | null;
  to: T | null;
  /** 0 at `from`, 1 at `to`. */
  alpha: number;
}

/** Bounded, time-ordered history of remote samples. Stale or out-of-order samples are dropped. */
export class SnapshotBuffer<T extends TimedSample> {
  private readonly samples: T[] = [];

  public constructor(private readonly capacity = 8) {}

  public get latest(): T | null {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1] : null;
  }

  public get size(): number {
    return this.samples.length;
  }

  public push(sample: T): boolean {
    const latest = this.latest;
    if (latest && sample.t <= latest.t) return false;
    this.samples.push(sample);
    if (this.samples.length > this.capacity) this.samples.shift();
    return true;
  }

  public clear(): void {
    this.samples.length = 0;
  }

  /**
   * Fills `out` with the samples surrounding `time`. Before the history it
   * holds the oldest sample, past it the newest one: the replica never
   * extrapolates, so a late packet cannot throw a body through a wall.
   */
  public sample(time: number, out: SampleBracket<T>): boolean {
    const count = this.samples.length;
    if (count === 0) return false;
    if (count === 1 || time <= this.samples[0].t) {
      out.from = this.samples[0];
      out.to = this.samples[0];
      out.alpha = 0;
      return true;
    }
    for (let index = 1; index < count; index++) {
      const to = this.samples[index];
      if (time > to.t) continue;
      const from = this.samples[index - 1];
      out.from = from;
      out.to = to;
      out.alpha = (time - from.t) / Math.max(1e-6, to.t - from.t);
      return true;
    }
    out.from = this.samples[count - 1];
    out.to = this.samples[count - 1];
    out.alpha = 1;
    return true;
  }
}

/** Offset jumps beyond this are a new timeline (tab throttled, host restarted). */
const CLOCK_RESYNC_THRESHOLD = 1;
const CLOCK_SMOOTHING = 0.1;

/**
 * Maps a remote clock onto the local one. The offset is low-passed so
 * network jitter does not wobble the render timeline, and the render time
 * trails the newest data by `delay` so a bracketing pair is usually present.
 */
export class RemoteClock {
  private offset: number | null = null;

  public constructor(
    private readonly delay: number,
    private readonly now: () => number = defaultNow,
  ) {}

  public observe(remoteTime: number): void {
    const measured = remoteTime - this.now();
    if (this.offset === null || Math.abs(measured - this.offset) > CLOCK_RESYNC_THRESHOLD) {
      this.offset = measured;
      return;
    }
    this.offset += (measured - this.offset) * CLOCK_SMOOTHING;
  }

  public get renderTime(): number {
    return this.now() + (this.offset ?? 0) - this.delay;
  }

  public reset(): void {
    this.offset = null;
  }
}

export function defaultNow(): number {
  return performance.now() / 1000;
}

export function lerpAngle(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * alpha;
}
