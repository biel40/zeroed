import type { Zombie } from './Zombie';
import type { ZombieModelId } from './ZombieConfig';
import type { ZombieModelSource } from './ZombieVisual';
import { pickShare } from './skins/ZombieSkinShares';

/** Weighted looks of one reserve: the horde's (floor null) or one floor's own. */
interface LookGroup {
  readonly looks: ZombieModelSource[];
  readonly weights: number[];
}

/**
 * Rolls the look of each spawned body when a map weights its skins
 * (`ZombieModelSource.spawnWeight`) or keeps a reserve of bodies for one
 * floor (`ZombieArena.zombieFloorLook`). Pooled bodies keep the look they
 * were built with; the roll only chooses which free body comes out next, so
 * appearance never touches type, health, speed or damage.
 */
export class ZombieLookPicker {
  private readonly lookOf = new Map<Zombie, ZombieModelSource>();
  /** Floor a reserved body rises on; horde bodies are absent. */
  private readonly floorOf = new Map<Zombie, number>();
  /** Floors each model keeps a reserve for. */
  private readonly reserves = new Map<ZombieModelId, Set<number>>();
  private readonly groups = new Map<number | null, LookGroup>();
  private rolled: ZombieModelSource | null = null;
  private rolledFloor: number | null = null;

  /** Pool preference: true for a body wearing the last rolled look. */
  public readonly wearsRolledLook = (zombie: Zombie): boolean => this.lookOf.get(zombie) === this.rolled;

  /** Pool filter: true for a body of the rolled reserve (a floor's own, or the horde's). */
  public readonly risesOnRolledFloor = (zombie: Zombie): boolean => (this.floorOf.get(zombie) ?? null) === this.rolledFloor;

  /** Records the look a pooled body wears; `floor` reserves it to walkers rising there. */
  public register(zombie: Zombie, source: ZombieModelSource | null, floor: number | null = null): void {
    if (floor !== null) {
      this.floorOf.set(zombie, floor);
      const modelId = zombie.visual.modelId;
      const floors = this.reserves.get(modelId) ?? new Set<number>();
      this.reserves.set(modelId, floors.add(floor));
    }
    if (!source || !(source.spawnWeight && source.spawnWeight > 0)) return;
    this.lookOf.set(zombie, source);
    let group = this.groups.get(floor);
    if (!group) this.groups.set(floor, group = { looks: [], weights: [] });
    if (group.looks.includes(source)) return;
    group.looks.push(source);
    group.weights.push(source.spawnWeight);
  }

  /** True once some body wears a weighted look or is reserved to a floor. */
  public get active(): boolean {
    return this.groups.size > 0 || this.floorOf.size > 0;
  }

  /**
   * Chooses the next look from a 0..1 roll, among the looks of the reserve a
   * `modelId` body rising on `floor` comes from.
   */
  public roll(roll: number, modelId?: ZombieModelId, floor?: number): void {
    this.rolledFloor = modelId !== undefined && floor !== undefined && this.reserves.get(modelId)?.has(floor) ? floor : null;
    const group = this.groups.get(this.rolledFloor);
    this.rolled = group ? group.looks[pickShare(group.weights, roll)] : null;
  }
}
