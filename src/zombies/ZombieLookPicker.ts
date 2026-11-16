import type { Zombie } from './Zombie';
import type { ZombieModelSource } from './ZombieVisual';
import { pickShare } from './skins/ZombieSkinShares';

/**
 * Rolls the look of each spawned walker when a map weights its skins
 * (`ZombieModelSource.spawnWeight`). Pooled bodies keep the look they were
 * built with; the roll only chooses which free body comes out next, so
 * appearance never touches type, health, speed or damage.
 */
export class ZombieLookPicker {
  private readonly lookOf = new Map<Zombie, ZombieModelSource>();
  private readonly looks: ZombieModelSource[] = [];
  private readonly weights: number[] = [];
  private rolled: ZombieModelSource | null = null;

  /** Pool predicate: true for a body wearing the last rolled look. */
  public readonly wearsRolledLook = (zombie: Zombie): boolean => this.lookOf.get(zombie) === this.rolled;

  /** Records the look a pooled body wears; unweighted looks are ignored. */
  public register(zombie: Zombie, source: ZombieModelSource | null): void {
    if (!source || !(source.spawnWeight && source.spawnWeight > 0)) return;
    this.lookOf.set(zombie, source);
    if (this.looks.includes(source)) return;
    this.looks.push(source);
    this.weights.push(source.spawnWeight);
  }

  /** True once some body wears a weighted look. */
  public get weighted(): boolean {
    return this.looks.length > 0;
  }

  /** Chooses the next look from a 0..1 roll. */
  public roll(roll: number): void {
    this.rolled = this.looks.length > 0 ? this.looks[pickShare(this.weights, roll)] : null;
  }
}
