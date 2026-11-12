/** Gameplay seconds ignored at the start of a match: shader, texture and audio warm-up. */
const WARMUP_SECONDS = 10;
/** Seconds ignored after a pause or a cinematic. */
const RESUME_WARMUP_SECONDS = 3;
const WINDOW_SECONDS = 1;
/** Rolling history judged before a verdict. */
const HISTORY_WINDOWS = 30;
/** Slow windows within the history that make the tier too heavy. */
const SLOW_WINDOWS_TO_DOWNGRADE = 24;
/** Average frame rate under which a window is slow (the 60 fps target with some margin). */
const SLOW_FPS = 48;
/** Resolution scale at or under which the target is only held by blurring the frame. */
const STRAINED_RESOLUTION_SCALE = 0.6;

/**
 * Judges whether the automatic tier is too heavy for the device. It reads
 * the frame rate together with `DynamicResolution`, which reacts first: slow
 * frames count only while fewer pixels are already being drawn (so a refresh
 * cap or a CPU-bound scene, which that scaler gives up on, is not blamed on
 * the tier), and so does holding the target only at a heavily reduced scale.
 * It asks for at most one downgrade per match and never for an upgrade.
 */
export class AutoQualityGovernor {
  private readonly slowHistory: boolean[] = new Array<boolean>(HISTORY_WINDOWS).fill(false);
  private historyIndex = 0;
  private judgedWindows = 0;
  private slowWindows = 0;
  private warmup = WARMUP_SECONDS;
  private windowTime = 0;
  private windowFrames = 0;
  private scaleSum = 0;
  private decided = false;

  public constructor(private readonly onDowngrade: () => void) {}

  /** Feeds one unpaused gameplay frame and the resolution scale it was drawn at. */
  public sample(dt: number, resolutionScale: number): void {
    if (this.decided) return;
    if (this.warmup > 0) {
      this.warmup -= dt;
      return;
    }
    this.windowTime += dt;
    this.windowFrames++;
    this.scaleSum += resolutionScale;
    if (this.windowTime < WINDOW_SECONDS - 1e-6) return;
    const fps = this.windowFrames / this.windowTime;
    const scale = this.scaleSum / this.windowFrames;
    this.clearWindow();
    this.record((fps < SLOW_FPS && scale < 1) || scale <= STRAINED_RESOLUTION_SCALE);
  }

  /** Drops the partial window and waits again, e.g. after frames that were not sampled. */
  public reset(): void {
    this.clearWindow();
    this.warmup = Math.max(this.warmup, RESUME_WARMUP_SECONDS);
  }

  private record(slow: boolean): void {
    if (this.slowHistory[this.historyIndex]) this.slowWindows--;
    this.slowHistory[this.historyIndex] = slow;
    if (slow) this.slowWindows++;
    this.historyIndex = (this.historyIndex + 1) % HISTORY_WINDOWS;
    this.judgedWindows = Math.min(this.judgedWindows + 1, HISTORY_WINDOWS);
    if (this.judgedWindows < HISTORY_WINDOWS || this.slowWindows < SLOW_WINDOWS_TO_DOWNGRADE) return;
    this.decided = true;
    this.onDowngrade();
  }

  private clearWindow(): void {
    this.windowTime = 0;
    this.windowFrames = 0;
    this.scaleSum = 0;
  }
}
