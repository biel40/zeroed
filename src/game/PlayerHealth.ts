/**
 * Player hit points for the Zombies mode. Pure logic, no rendering: tracks
 * HP, the post-hit invulnerability window and death. Kept outside
 * PlayerController (which is shared with the shooting range and stays
 * untouched).
 */
export class PlayerHealth {
  hp: number;
  private invulnTimer = 0;

  constructor(
    readonly maxHp = 100,
    private readonly invulnDuration = 0.9,
  ) {
    this.hp = maxHp;
  }

  get isDead(): boolean {
    return this.hp <= 0;
  }

  get isInvulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  update(dt: number): void {
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
  }

  /**
   * Applies damage unless the player is dead or still inside the
   * invulnerability window. Returns true when the hit actually landed.
   */
  damage(amount: number): boolean {
    if (this.isDead || this.isInvulnerable) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = this.invulnDuration;
    return true;
  }

  reset(): void {
    this.hp = this.maxHp;
    this.invulnTimer = 0;
  }
}
