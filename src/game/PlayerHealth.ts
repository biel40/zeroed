/**
 * Player hit points for the Zombies mode. Pure logic, no rendering: tracks
 * HP, the post-hit invulnerability window, delayed health regeneration and
 * death. Kept outside PlayerController (which is shared with the shooting
 * range and stays untouched).
 */
export class PlayerHealth {
  hp: number;
  private currentMaxHp: number;
  private invulnTimer = 0;
  private invincible = false;
  /** Seconds since the last landed hit; regen starts once it passes the delay. */
  private regenTimer = 0;

  constructor(
    /** Max HP without bonuses (the Armour ring scales it). */
    readonly baseMaxHp = 100,
    private readonly invulnDuration = 0.9,
    /** Seconds without taking damage before regeneration starts. 0 disables it. */
    private readonly regenDelay = 0,
    /** HP recovered per second once the delay has elapsed. 0 disables regen. */
    private readonly regenRate = 0,
  ) {
    this.currentMaxHp = baseMaxHp;
    this.hp = baseMaxHp;
  }

  get maxHp(): number {
    return this.currentMaxHp;
  }

  /**
   * Max HP becomes `scale` times the base (the Armour ring). Raising it
   * grants the extra HP at once; lowering it caps the current HP. The dead
   * stay dead.
   */
  setMaxHpScale(scale: number): void {
    const next = this.baseMaxHp * scale;
    if (!this.isDead) this.hp = Math.min(next, this.hp + Math.max(0, next - this.currentMaxHp));
    this.currentMaxHp = next;
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
    this.currentMaxHp = this.baseMaxHp;
    this.hp = this.baseMaxHp;
    this.invulnTimer = 0;
    this.regenTimer = 0;
    this.invincible = false;
  }

  /**
   * Restores a fraction of max HP without resetting the run (cooperative
   * revive, Resurrection ring), followed by `invulnerability` seconds of
   * protection (the post-hit window by default).
   */
  revive(fraction: number, invulnerability = this.invulnDuration): void {
    this.hp = Math.max(1, Math.min(this.maxHp, this.maxHp * fraction));
    this.invulnTimer = invulnerability;
    this.regenTimer = 0;
  }
}
