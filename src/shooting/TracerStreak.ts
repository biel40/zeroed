import * as THREE from 'three';

/** The tracer streak of a round, in metres and seconds. */
export const TRACER_STREAK = {
  /** Longest stretch of the path lit at once: a streak, never a continuous beam. */
  length: 3,
  /** Travel over which the streak slides from the muzzle onto the round's true path. */
  converge: 10,
  /** Seconds the streak takes to pull into the point where the round stopped. */
  fade: 0.07,
} as const;

/**
 * The visible streak of one round. The round itself flies from the eye; its
 * streak starts at the muzzle and slides onto the true path over the first
 * metres, so it reads as leaving the gun yet ends exactly where the round
 * lands. Pure state, allocation free after construction; drawing it is the
 * owner's job.
 */
export class TracerStreak {
  /** Front of the streak: where the round is drawn. */
  public readonly head = new THREE.Vector3();
  /** Back of the streak, at most `TRACER_STREAK.length` behind the head. */
  public readonly tail = new THREE.Vector3();
  /** Muzzle minus eye at the shot: how far the drawn path starts off the true one. */
  private readonly offset = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  /** Path drawn so far, capped at the streak's length. */
  private lit = 0;
  /** Seconds left of the pull into the stopping point; 0 while the round flies. */
  private fading = 0;
  private live = false;

  public get visible(): boolean {
    return this.live;
  }

  public get length(): number {
    return this.head.distanceTo(this.tail);
  }

  /** A round leaves `origin` (the eye) while the gun's `muzzle` fires it. */
  public begin(muzzle: THREE.Vector3Like, origin: THREE.Vector3Like): void {
    this.offset.set(muzzle.x - origin.x, muzzle.y - origin.y, muzzle.z - origin.z);
    this.head.set(muzzle.x, muzzle.y, muzzle.z);
    this.tail.copy(this.head);
    this.lit = 0;
    this.fading = 0;
    this.live = true;
  }

  /** The round is at (x, y, z) after `travelled` metres. */
  public follow(x: number, y: number, z: number, travelled: number): void {
    if (!this.live || this.fading > 0) return;
    const pull = Math.max(0, 1 - travelled / TRACER_STREAK.converge);
    this.advanceTo(this.target.set(x, y, z).addScaledVector(this.offset, pull));
  }

  /** The round stopped at (x, y, z): the streak reaches it and pulls into it. */
  public land(x: number, y: number, z: number): void {
    if (!this.live || this.fading > 0) return;
    this.advanceTo(this.target.set(x, y, z));
    this.fading = TRACER_STREAK.fade;
  }

  /** The round ran out of range: the streak pulls in where it is. */
  public fadeOut(): void {
    if (this.live && this.fading === 0) this.fading = TRACER_STREAK.fade;
  }

  public cancel(): void {
    this.live = false;
    this.fading = 0;
  }

  /** Runs the pull into the stopping point; false once the streak is gone. */
  public update(dt: number): boolean {
    if (!this.live || this.fading <= 0) return this.live;
    const before = this.fading;
    this.fading = Math.max(0, before - Math.max(0, dt));
    if (this.fading === 0) {
      this.live = false;
      return false;
    }
    this.tail.lerp(this.head, 1 - this.fading / before);
    return true;
  }

  private advanceTo(point: THREE.Vector3): void {
    this.step.subVectors(point, this.head);
    const distance = this.step.length();
    this.head.copy(point);
    if (distance < 1e-6) return;
    this.lit = Math.min(TRACER_STREAK.length, this.lit + distance);
    this.tail.copy(point).addScaledVector(this.step, -this.lit / distance);
  }
}
