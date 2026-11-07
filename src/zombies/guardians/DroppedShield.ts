const GRAVITY = 9.8;
/** Share of its falling speed a bounce keeps; slower landings just stop. */
const RESTITUTION = 0.32;
const BOUNCE_FROM = 0.6;
/** How fast sliding along the ground dies away (1/s). */
const FRICTION = 4;
/** Pull of its weight toppling it about the rim (rad/s² when lying at 45°), and the roll's drag (1/s). */
const TOPPLE = 14;
const TILT_DRAG = 1.2;
/** Slapping flat faster than this (rad/s) bounces it back up off its rim. */
const SLAP_BOUNCE_FROM = 1.6;
/** The wobble left once it lies flat: starting tilt, how fast it dies (1/s), when it stops, and its top precession rate. */
const WOBBLE = { from: 0.05, perSlap: 0.035, max: 0.13, decay: 1.25, rest: 0.003, maxRate: 42 } as const;
/** A drop starts at most this upright, so it never balances on its rim. */
const MAX_DROP_TILT = Math.PI / 2 - 0.05;
const MAX_STEP = 1 / 120;
const MAX_FRAME = 0.1;

type Point = { x: number; y: number; z: number };

/**
 * The shield let go: it falls, bounces on its rim, topples flat with a
 * clang and rattles to rest like a spun coin, its wobble ever faster and
 * smaller. A disc of `radius` and `thickness`, tilted `tilt` from lying
 * face up (π/2 on its rim) towards `heading` (radians, 0 towards +z).
 * Pure and deterministic; the view turns it into a transform.
 */
export class DroppedShield {
  /** Its centre. */
  public readonly position: Point = { x: 0, y: 0, z: 0 };
  private readonly velocity: Point = { x: 0, y: 0, z: 0 };
  private tiltAngle = 0;
  private tiltRate = 0;
  private headingAngle = 0;
  /** Once flat: what is left of its wobble, else null. */
  private wobble: number | null = null;
  private atRest = true;
  private hit = 0;

  public constructor(private readonly radius: number, private readonly thickness: number) {}

  /** Radians from lying face up. */
  public get tilt(): number {
    return this.tiltAngle;
  }

  /** Where it leans to: its face's normal points that way, `tilt` off the vertical. */
  public get heading(): number {
    return this.headingAngle;
  }

  public get resting(): boolean {
    return this.atRest;
  }

  /** It struck the ground this update: how hard (m/s), 0 when it did not. */
  public get impact(): number {
    return this.hit;
  }

  /** Lets it go at `at` with `velocity`, tilted `tilt` towards `heading`; it always falls face up. */
  public drop(at: Point, velocity: Point, tilt: number, heading: number): void {
    Object.assign(this.position, at);
    Object.assign(this.velocity, velocity);
    this.tiltAngle = Math.min(MAX_DROP_TILT, Math.max(0, tilt));
    this.tiltRate = 0;
    this.headingAngle = heading;
    this.wobble = null;
    this.atRest = false;
    this.hit = 0;
  }

  public update(dt: number, groundY: number): void {
    this.hit = 0;
    let left = Math.min(MAX_FRAME, Math.max(0, dt));
    while (left > 1e-9 && !this.atRest) {
      const step = Math.min(MAX_STEP, left);
      left -= step;
      if (this.wobble === null) this.fall(step, groundY);
      else this.settle(step, groundY);
    }
  }

  /** Flying or toppling on its rim. */
  private fall(step: number, groundY: number): void {
    this.velocity.y -= GRAVITY * step;
    this.position.x += this.velocity.x * step;
    this.position.y += this.velocity.y * step;
    this.position.z += this.velocity.z * step;
    this.tiltAngle = Math.min(Math.PI / 2, Math.max(0, this.tiltAngle + this.tiltRate * step));
    const below = groundY - this.lowestPoint();
    if (below < 0) return;
    // On the ground: lifted out of it, bouncing or stopping, sliding to a halt, toppling about the rim.
    this.position.y += below;
    if (this.velocity.y < 0) {
      this.hit = Math.max(this.hit, -this.velocity.y);
      this.velocity.y = -this.velocity.y > BOUNCE_FROM ? -this.velocity.y * RESTITUTION : 0;
    }
    const slide = Math.exp(-FRICTION * step);
    this.velocity.x *= slide;
    this.velocity.z *= slide;
    this.tiltRate -= TOPPLE * Math.SQRT2 * Math.cos(this.tiltAngle) * step;
    this.tiltRate *= Math.exp(-TILT_DRAG * step);
    if (this.tiltAngle > 0 || this.tiltRate > 0) return;
    // Slapped down flat: a hard slap rocks it back up, a soft one leaves it wobbling.
    const slap = -this.tiltRate;
    this.hit = Math.max(this.hit, slap * this.radius);
    if (slap > SLAP_BOUNCE_FROM) {
      this.tiltRate = slap * RESTITUTION;
      return;
    }
    this.wobble = Math.min(WOBBLE.max, WOBBLE.from + slap * WOBBLE.perSlap);
    this.tiltRate = 0;
  }

  /** Lying flat on a wobble that dies away while its rim's contact races round ever faster. */
  private settle(step: number, groundY: number): void {
    const wobble = (this.wobble ?? 0) * Math.exp(-WOBBLE.decay * step);
    this.wobble = wobble;
    const slide = Math.exp(-FRICTION * step);
    this.velocity.x *= slide;
    this.velocity.z *= slide;
    this.velocity.y = 0;
    this.position.x += this.velocity.x * step;
    this.position.z += this.velocity.z * step;
    if (wobble < WOBBLE.rest) {
      this.wobble = null;
      this.atRest = true;
      this.tiltAngle = 0;
      this.position.y = groundY + this.thickness / 2;
      return;
    }
    this.headingAngle += Math.min(WOBBLE.maxRate, 1.6 / Math.sqrt(wobble)) * step;
    this.tiltAngle = wobble;
    // Resting on the rim's lowest point.
    this.position.y = groundY + this.radius * Math.sin(wobble) + (this.thickness / 2) * Math.cos(wobble);
  }

  /** Height of its lowest rim point. */
  private lowestPoint(): number {
    return this.position.y - this.radius * Math.sin(this.tiltAngle) - (this.thickness / 2) * Math.abs(Math.cos(this.tiltAngle));
  }
}
