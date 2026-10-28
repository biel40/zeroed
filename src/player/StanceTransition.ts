/** Normalized posture blend with continuous velocity and no frame-rate dependent steps. */
export class StanceTransition {
  private amount: number;
  private velocity = 0;

  public constructor(initial = 0) { this.amount = initial; }

  public reset(): void {
    this.amount = 0;
    this.velocity = 0;
  }

  public update(target: number, dt: number): number {
    // Exact critically damped response: about 0.4 s to settle, accelerating
    // gently from rest and retaining velocity when the player changes their mind.
    const frequency = 12;
    const elapsed = Math.max(0, dt);
    const offset = this.amount - target;
    const drive = this.velocity + frequency * offset;
    const decay = Math.exp(-frequency * elapsed);
    const next = target + (offset + drive * elapsed) * decay;
    this.velocity = (this.velocity - frequency * drive * elapsed) * decay;
    this.amount = Math.max(0, Math.min(1, next));
    if (this.amount !== next) this.velocity = 0;
    return this.amount;
  }
}
