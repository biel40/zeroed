export const CUBE_FACE_COUNT = 6;

/** Float sums of a steady dt must not push the end of a rest one frame late. */
const REST_TOLERANCE = 1e-6;

/**
 * Spreads a cube-map capture over six frames, one face each, then rests.
 * A whole capture in one frame would draw the scene six extra times at once.
 */
export class ReflectionProbeSchedule {
  private nextFace = 0;
  private rest = 0;

  public constructor(private readonly refreshSeconds: number) {}

  /** Advances one frame; returns the cube face to render in it, or null while resting. */
  public advance(dt: number): number | null {
    if (this.nextFace === 0 && this.rest > 0) {
      this.rest -= dt;
      if (this.rest > REST_TOLERANCE) return null;
    }
    const face = this.nextFace;
    this.nextFace = (face + 1) % CUBE_FACE_COUNT;
    if (this.nextFace === 0) this.rest = this.refreshSeconds;
    return face;
  }

  /** Drops the pass in progress: the next frame starts a new one at face 0. */
  public reset(): void {
    this.nextFace = 0;
    this.rest = 0;
  }
}
