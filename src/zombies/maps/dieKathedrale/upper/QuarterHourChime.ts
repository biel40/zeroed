const MILLISECONDS_PER_MINUTE = 60_000;
const MINUTES_PER_QUARTER = 15;
/** Hear a live crossing, and skip it if updates stopped across the boundary. */
const MAX_FRAME_GAP_MS = 1000;

export class QuarterHourChime {
  private previousTime: number | null = null;
  private lastStrikeMinute: number | null = null;

  /** Takes a device clock sample in Unix milliseconds and checks the local minute. */
  public update(now: number): boolean {
    const previous = this.previousTime;
    this.previousTime = now;
    if (previous === null || now <= previous || now - previous > MAX_FRAME_GAP_MS) return false;

    const minute = Math.floor(now / MILLISECONDS_PER_MINUTE);
    if (minute === Math.floor(previous / MILLISECONDS_PER_MINUTE) || minute === this.lastStrikeMinute) return false;
    if (new Date(now).getMinutes() % MINUTES_PER_QUARTER !== 0) return false;

    this.lastStrikeMinute = minute;
    return true;
  }

  public reset(): void {
    this.previousTime = null;
    this.lastStrikeMinute = null;
  }
}
