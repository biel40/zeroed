/**
 * A shove that drives a body across the floor for a moment, as a pure state
 * machine so its feel is testable: fastest at first and easing to a stop
 * (quadratic ease-out), so the whole distance is covered in its time. A new
 * shove replaces what is left of the current one only when it carries
 * further, never adds to it, so a volley cannot launch a body beyond a
 * single shot's reach. Collisions belong to whoever moves the body.
 */
export class ZombieKnockback {
  private dirX = 0;
  private dirZ = 0;
  private distance = 0;
  private seconds = 0;
  private elapsed = 0;

  public get active(): boolean {
    return this.elapsed < this.seconds;
  }

  /** Drives the body `distance` metres along (dirX, dirZ), normalised here, over `seconds`. */
  public push(dirX: number, dirZ: number, distance: number, seconds: number): void {
    const length = Math.hypot(dirX, dirZ);
    if (length < 1e-6 || distance <= 0 || seconds <= 0) return;
    if (this.active && distance <= this.distance - this.covered(this.elapsed)) return;
    this.dirX = dirX / length;
    this.dirZ = dirZ / length;
    this.distance = distance;
    this.seconds = seconds;
    this.elapsed = 0;
  }

  /** Writes this frame's displacement into `out`; false (and nothing written) while at rest. */
  public step(dt: number, out: { x: number; z: number }): boolean {
    if (!this.active || dt <= 0) return false;
    const before = this.covered(this.elapsed);
    this.elapsed = Math.min(this.seconds, this.elapsed + dt);
    const travel = this.covered(this.elapsed) - before;
    out.x = this.dirX * travel;
    out.z = this.dirZ * travel;
    return true;
  }

  public reset(): void {
    this.distance = this.seconds = this.elapsed = 0;
  }

  private covered(time: number): number {
    const left = 1 - Math.min(1, time / this.seconds);
    return this.distance * (1 - left * left);
  }
}
