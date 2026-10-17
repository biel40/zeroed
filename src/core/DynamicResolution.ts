/** Seconds of gameplay averaged before each decision. */
const WINDOW_SECONDS = 1;
/** Average frame time that triggers a downscale (under ~50 fps). */
const SLOW_FRAME = 1 / 50;
/** Average frame time that counts as headroom: a 60 Hz vsync-capped frame qualifies. */
const FAST_FRAME = 1 / 57;
const STEP = 0.1;
export const MIN_RESOLUTION_SCALE = 0.5;
/** Fast windows required before trying a higher scale; doubles after each failed try. */
const BASE_CALM_WINDOWS = 3;
const MAX_CALM_WINDOWS = 48;
/** A downscale must cut the frame time at least this much to count as GPU relief. */
const MIN_DOWNSCALE_GAIN = 0.95;
/** Windows without downscaling after one gave no gain (CPU-bound or refresh-capped). */
const NO_GAIN_COOLDOWN_WINDOWS = 15;

/**
 * Picks a render-resolution scale from measured frame times. vsync hides
 * GPU headroom, so upscales are probes: one that slows the game down again
 * makes the next probe wait twice as long. A downscale that does not speed
 * the frame up is undone, since resolution was not the bottleneck.
 */
export class DynamicResolution {
  private currentScale = 1;
  private windowTime = 0;
  private windowFrames = 0;
  private calmWindows = 0;
  private requiredCalmWindows = BASE_CALM_WINDOWS;
  private cooldownWindows = 0;
  private lastChange: 'up' | 'down' | null = null;
  private frameTimeBeforeDownscale = 0;
  private scaleBeforeDownscale = 1;

  public get scale(): number {
    return this.currentScale;
  }

  /** Feeds one gameplay frame; returns true when the scale changed. */
  public sample(dt: number): boolean {
    this.windowTime += dt;
    this.windowFrames++;
    // The tolerance keeps float sums of a steady dt from spilling one frame over.
    if (this.windowTime < WINDOW_SECONDS - 1e-6) return false;
    const frameTime = this.windowTime / this.windowFrames;
    this.windowTime = 0;
    this.windowFrames = 0;
    return this.decide(frameTime);
  }

  /** Discards the partial window, e.g. after a pause whose frames were not sampled. */
  public resetWindow(): void {
    this.windowTime = 0;
    this.windowFrames = 0;
  }

  private decide(frameTime: number): boolean {
    const previous = this.currentScale;
    if (this.cooldownWindows > 0) this.cooldownWindows--;

    if (this.lastChange === 'down' && frameTime > this.frameTimeBeforeDownscale * MIN_DOWNSCALE_GAIN) {
      // Fewer pixels did not help: restore them and stop scaling for a while.
      this.currentScale = this.scaleBeforeDownscale;
      this.cooldownWindows = NO_GAIN_COOLDOWN_WINDOWS;
      this.lastChange = null;
      this.calmWindows = 0;
      return this.currentScale !== previous;
    }

    if (frameTime > SLOW_FRAME) {
      this.calmWindows = 0;
      if (this.lastChange === 'up') this.requiredCalmWindows = Math.min(this.requiredCalmWindows * 2, MAX_CALM_WINDOWS);
      if (this.cooldownWindows > 0 || this.currentScale <= MIN_RESOLUTION_SCALE) {
        this.lastChange = null;
        return false;
      }
      this.frameTimeBeforeDownscale = frameTime;
      this.scaleBeforeDownscale = this.currentScale;
      this.currentScale = Math.max(MIN_RESOLUTION_SCALE, round(this.currentScale - STEP));
      this.lastChange = 'down';
      return true;
    }

    this.lastChange = null;
    if (frameTime >= FAST_FRAME) {
      this.calmWindows = 0;
      return false;
    }
    if (++this.calmWindows < this.requiredCalmWindows || this.currentScale >= 1) return false;
    this.calmWindows = 0;
    this.currentScale = Math.min(1, round(this.currentScale + STEP));
    this.lastChange = 'up';
    return true;
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
