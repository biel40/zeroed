/** Timing of one recurring ambient event; the payload is whatever the map needs to play it. */
export interface AmbientEventTiming {
  /** Seconds before the first occurrence can happen. */
  readonly initialDelay: number;
  readonly minInterval: number;
  readonly maxInterval: number;
}

/**
 * Fires each map ambient event at irregular intervals inside its window.
 * Pure timing: no Three.js, no audio. The map decides what an event does
 * when `update` hands it over.
 */
export class AmbientEventScheduler<TEvent extends AmbientEventTiming> {
  private readonly timers: number[];

  constructor(
    private readonly events: ReadonlyArray<TEvent>,
    private readonly rng: () => number = Math.random,
  ) {
    this.timers = events.map((event) => this.firstDelay(event));
  }

  update(dt: number, fire: (event: TEvent) => void): void {
    if (dt <= 0) return;
    for (let index = 0; index < this.events.length; index++) {
      this.timers[index] -= dt;
      if (this.timers[index] > 0) continue;
      const event = this.events[index];
      this.timers[index] = this.nextDelay(event);
      fire(event);
    }
  }

  reset(): void {
    for (let index = 0; index < this.events.length; index++) {
      this.timers[index] = this.firstDelay(this.events[index]);
    }
  }

  private firstDelay(event: TEvent): number {
    return event.initialDelay + this.rng() * (event.maxInterval - event.minInterval);
  }

  private nextDelay(event: TEvent): number {
    return event.minInterval + this.rng() * (event.maxInterval - event.minInterval);
  }
}
