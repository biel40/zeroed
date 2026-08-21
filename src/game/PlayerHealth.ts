/**
 * Player hit points for the Zombies mode. Pure logic, no rendering: tracks
 * HP, the post-hit invulnerability window, delayed health regeneration and
 * death. Kept outside PlayerController (which is shared with the shooting
 * range and stays untouched).
 */
export class PlayerHealth {
  hp: number;
  private invulnTimer = 0;
  private invincible = false;
  /** Seconds since the last landed hit; regen starts once it passes the delay. */
  private regenTimer = 0;

  constructor(
    readonly maxHp = 100,
    private readonly invulnDuration = 0.9,
    /** Seconds without taking damage before regeneration starts. 0 disables it. */
    private readonly regenDelay = 0,
    /** HP recovered per second once the delay has elapsed. 0 disables regen. */
    private readonly regenRate = 0,
  ) {
    this.hp = maxHp;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  get isInvulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  public setInvincible(enabled: boolean): void {
    this.invincible = enabled;
  }

  update(dt: number): void {
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.regenRate <= 0 || this.isDead || this.hp >= this.maxHp) return;
    this.regenTimer += dt;
    // The tick that crosses the delay already heals: the delay gates the
    // START of regeneration, never its rate. HP is hard-capped at maxHp.
    if (this.regenTimer >= this.regenDelay) {
      this.hp = Math.min(this.maxHp, this.hp + this.regenRate * dt);
    }
  }

  /**
   * Applies damage unless the player is dead or still inside the
   * invulnerability window. Returns true when the hit actually landed.
   * A landed hit also restarts the regeneration delay.
   */
  damage(amount: number): boolean {
    if (this.invincible || this.isDead || this.isInvulnerable) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = this.invulnDuration;
    this.regenTimer = 0;
    return true;
  }

  reset(): void {
    this.hp = this.maxHp;
    this.invulnTimer = 0;
    this.regenTimer = 0;
    this.invincible = false;
  }
}
