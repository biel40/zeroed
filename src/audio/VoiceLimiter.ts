/**
 * Caps how many one-shot voices of a family overlap. A horde spawning in
 * the same frame must not stack a dozen groans; nearby voices may use a
 * few reserved slots so the threat at arm's length is never the one dropped.
 * Fixed slots, no allocation per call.
 */
export class VoiceLimiter {
  private readonly endTimes: Float64Array;

  public constructor(
    private readonly capacity: number,
    reserved: number,
  ) {
    this.endTimes = new Float64Array(capacity + reserved).fill(-Infinity);
  }

  /** Claims a slot until `now + duration`; false when the voice should be skipped. */
  public tryStart(now: number, duration: number, nearby: boolean): boolean {
    const limit = nearby ? this.endTimes.length : this.capacity;
    let playing = 0;
    let free = -1;
    for (let index = 0; index < this.endTimes.length; index++) {
      if (this.endTimes[index] > now) playing++;
      else if (free < 0) free = index;
    }
    if (playing >= limit || free < 0) return false;
    this.endTimes[free] = now + duration;
    return true;
  }

  public reset(): void {
    this.endTimes.fill(-Infinity);
  }
}
