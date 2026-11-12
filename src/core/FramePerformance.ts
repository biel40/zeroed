/** A fixed frame count keeps sampling bounded, including on high-refresh displays. */
export const FRAME_HISTORY_SIZE = 120;
const REFRESH_SECONDS = 0.25;

export type FrameRateStatus = 'good' | 'warning' | 'critical';

/** Wall-clock frame intervals, independent of the simulation's delta limit and the DOM. */
export class FramePerformance {
  private readonly frames = new Float64Array(FRAME_HISTORY_SIZE);
  private readonly sorted = new Float64Array(FRAME_HISTORY_SIZE);
  private next = 0;
  private count = 0;
  private refreshElapsed = 0;
  private meanMs = 0;
  private percentileMs = 0;
  private maximumMs = 0;

  public get frameCount(): number { return this.count; }
  public get averageMs(): number { return this.meanMs; }
  public get p95Ms(): number { return this.percentileMs; }
  public get peakMs(): number { return this.maximumMs; }
  public get fps(): number { return this.meanMs > 0 ? 1000 / this.meanMs : 0; }

  /** Match the rounded FPS shown by the HUD; 60 FPS is a reference, not a hardware diagnosis. */
  public get status(): FrameRateStatus {
    const fps = Math.round(this.fps);
    return fps >= 60 ? 'good' : fps >= 30 ? 'warning' : 'critical';
  }

  /** One unclamped interval in seconds. Returns true when the display should refresh. */
  public sample(seconds: number): boolean {
    if (!Number.isFinite(seconds) || seconds <= 0) return false;
    this.frames[this.next] = seconds * 1000;
    this.next = (this.next + 1) % FRAME_HISTORY_SIZE;
    this.count = Math.min(this.count + 1, FRAME_HISTORY_SIZE);
    this.refreshElapsed += seconds;
    if (this.refreshElapsed < REFRESH_SECONDS - 1e-6) return false;
    this.refreshElapsed = 0;

    let total = 0;
    for (let index = 0; index < this.count; index++) {
      const ms = this.frames[index];
      this.sorted[index] = ms;
      total += ms;
    }
    // The scratch buffer is reused; only the view is created at display refresh time.
    const sorted = this.sorted.subarray(0, this.count);
    sorted.sort();
    this.meanMs = total / this.count;
    this.percentileMs = sorted[Math.ceil(this.count * 0.95) - 1];
    this.maximumMs = sorted[this.count - 1];
    return true;
  }

  /** A valid history index, oldest first, for plotting without copying the buffer. */
  public frameMsAt(index: number): number {
    const oldest = this.count === FRAME_HISTORY_SIZE ? this.next : 0;
    return this.frames[(oldest + index) % FRAME_HISTORY_SIZE];
  }

  public reset(): void {
    this.next = 0;
    this.count = 0;
    this.refreshElapsed = 0;
    this.meanMs = 0;
    this.percentileMs = 0;
    this.maximumMs = 0;
  }
}
