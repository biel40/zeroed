/**
 * Pure per-floor walkability grid with A* pathfinding. No Three.js imports:
 * the grid consumes plain XZ rectangles derived from the map colliders, so
 * the whole navigation layer stays unit-testable without WebGL.
 *
 * A cell is walkable when a body of `bodyRadius` standing at its center
 * touches no obstacle — the exact predicate the movement integrator uses,
 * so a grid path is always physically followable.
 */

export interface NavigationBoundsData {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface NavigationRect {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

export interface NavWaypoint {
  readonly x: number;
  readonly z: number;
}

interface SnapResult {
  readonly x: number;
  readonly z: number;
  readonly index: number;
}

/** 8-way expansion; diagonals cost √2. */
const DIRECTIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Farthest cells a smoothing probe may look ahead of the current anchor. */
const SMOOTH_WINDOW = 48;
/** Ring-search radius (cells) when snapping unwalkable endpoints. */
const SNAP_RADIUS = 8;

export class NavigationGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly walkable: Uint8Array;
  // A* scratch buffers, allocated once per grid; a generation stamp avoids
  // clearing them per query, so findPath allocates nothing but its result.
  private readonly gScore: Float32Array;
  private readonly parent: Int32Array;
  private readonly visitStamp: Int32Array;
  private readonly heap: Int32Array;
  private readonly heapScore: Float32Array;
  private generation = 0;
  private heapLength = 0;

  constructor(
    private readonly bounds: NavigationBoundsData,
    private readonly obstacles: readonly NavigationRect[],
    private readonly cellSize = 0.35,
    private readonly bodyRadius = 0.42,
  ) {
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cellSize));
    this.rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cellSize));
    this.walkable = new Uint8Array(this.cols * this.rows);
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const x = bounds.minX + (col + 0.5) * cellSize;
        const z = bounds.minZ + (row + 0.5) * cellSize;
        this.walkable[row * this.cols + col] = this.isClearPoint(x, z) ? 1 : 0;
      }
    }
    const cellCount = this.cols * this.rows;
    this.gScore = new Float32Array(cellCount);
    this.parent = new Int32Array(cellCount);
    this.visitStamp = new Int32Array(cellCount);
    // A node is re-pushed only when its g improves; twice the cell count is
    // a generous capacity for a consistent heuristic on an 8-way grid.
    this.heap = new Int32Array(cellCount * 2 + 16);
    this.heapScore = new Float32Array(cellCount * 2 + 16);
  }

  public contains(x: number, z: number): boolean {
    return (
      x >= this.bounds.minX &&
      x <= this.bounds.maxX &&
      z >= this.bounds.minZ &&
      z <= this.bounds.maxZ
    );
  }

  /** Exact circle-vs-rect clearance, the predicate movement collision uses. */
  public isClearPoint(x: number, z: number): boolean {
    if (!this.contains(x, z)) return false;
    const radiusSq = this.bodyRadius * this.bodyRadius;
    for (const rect of this.obstacles) {
      const nearestX = Math.max(rect.minX, Math.min(rect.maxX, x));
      const nearestZ = Math.max(rect.minZ, Math.min(rect.maxZ, z));
      const dx = x - nearestX;
      const dz = z - nearestZ;
      if (dx * dx + dz * dz < radiusSq) return false;
    }
    return true;
  }

  /** Sampled exact clearance along the segment, at body-radius steps. */
  public hasLineOfSight(fromX: number, fromZ: number, toX: number, toZ: number): boolean {
    const distance = Math.hypot(toX - fromX, toZ - fromZ);
    if (distance <= 1e-6) return this.isClearPoint(toX, toZ);
    const steps = Math.max(1, Math.ceil(distance / this.bodyRadius));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isClearPoint(fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t)) return false;
    }
    return true;
  }

  /** Nearest walkable cell center within SNAP_RADIUS, or null when enclosed. */
  public closestWalkable(x: number, z: number): NavWaypoint | null {
    const snap = this.closestWalkableCell(x, z);
    return snap ? { x: snap.x, z: snap.z } : null;
  }

  /**
   * A* between the snapped endpoints, then greedy line-of-sight smoothing:
   * every consecutive pair of returned waypoints is mutually clear, so the
   * follower never needs to cut a corner blindly.
   */
  public findPath(fromX: number, fromZ: number, toX: number, toZ: number): NavWaypoint[] | null {
    const start = this.snap(fromX, fromZ);
    const goal = this.snap(toX, toZ);
    if (!start || !goal) return null;
    if (start.index === goal.index) return [{ x: goal.x, z: goal.z }];
    const cells = this.astar(start.index, goal.index);
    if (cells.length === 0) return null;
    return this.smooth(start.x, start.z, cells, goal);
  }

  /** Walkable cell containing the point, else the nearest walkable center. */
  private snap(x: number, z: number): SnapResult | null {
    const col = this.toColumn(x);
    const row = this.toRow(z);
    const index = row * this.cols + col;
    if (this.walkable[index] === 1 && this.isClearPoint(x, z)) return { x, z, index };
    return this.closestWalkableCell(x, z);
  }

  private closestWalkableCell(x: number, z: number): SnapResult | null {
    const centerCol = this.toColumn(x);
    const centerRow = this.toRow(z);
    let best: SnapResult | null = null;
    let bestDistance = Infinity;
    for (let radius = 0; radius <= SNAP_RADIUS; radius++) {
      for (let row = centerRow - radius; row <= centerRow + radius; row++) {
        for (let col = centerCol - radius; col <= centerCol + radius; col++) {
          if (Math.max(Math.abs(col - centerCol), Math.abs(row - centerRow)) !== radius) continue;
          if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) continue;
          const index = row * this.cols + col;
          if (this.walkable[index] !== 1) continue;
          const candidateX = this.bounds.minX + (col + 0.5) * this.cellSize;
          const candidateZ = this.bounds.minZ + (row + 0.5) * this.cellSize;
          const distance = Math.hypot(candidateX - x, candidateZ - z);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = { x: candidateX, z: candidateZ, index };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Forward cell path (start..goal) via lazy-deletion A*; [] when none. */
  private astar(start: number, goal: number): number[] {
    this.generation++;
    const stamp = this.generation;
    this.heapLength = 0;
    this.gScore[start] = 0;
    this.parent[start] = -1;
    this.visitStamp[start] = stamp;
    this.push(start, this.heuristic(start, goal));

    while (this.heapLength > 0) {
      const current = this.pop();
      if (current === goal) return this.reconstruct(start, goal);
      const col = current % this.cols;
      const row = Math.floor(current / this.cols);
      for (const [columnStep, rowStep, cost] of DIRECTIONS) {
        const nextCol = col + columnStep;
        const nextRow = row + rowStep;
        if (nextCol < 0 || nextCol >= this.cols || nextRow < 0 || nextRow >= this.rows) continue;
        const next = nextRow * this.cols + nextCol;
        if (this.walkable[next] !== 1) continue;
        if (
          columnStep !== 0 &&
          rowStep !== 0 &&
          (this.walkable[row * this.cols + nextCol] !== 1 ||
            this.walkable[nextRow * this.cols + col] !== 1)
        ) {
          // Never cut the corner between two blocked orthogonal cells.
          continue;
        }
        const g = this.gScore[current] + cost;
        if (this.visitStamp[next] === stamp && g >= this.gScore[next]) continue;
        this.visitStamp[next] = stamp;
        this.gScore[next] = g;
        this.parent[next] = current;
        this.push(next, g + this.heuristic(next, goal));
      }
    }
    return [];
  }

  private reconstruct(start: number, goal: number): number[] {
    const reversed: number[] = [];
    for (let current = goal; current >= 0; current = this.parent[current]) {
      reversed.push(current);
      if (current === start) break;
    }
    reversed.reverse();
    return reversed;
  }

  private smooth(
    anchorX: number,
    anchorZ: number,
    cells: readonly number[],
    goal: SnapResult,
  ): NavWaypoint[] {
    const waypoints: NavWaypoint[] = [];
    let index = 1;
    while (index < cells.length) {
      let farthest = index;
      const limit = Math.min(cells.length - 1, index + SMOOTH_WINDOW);
      for (let probe = limit; probe > index; probe--) {
        const probeX = this.centerX(cells[probe]);
        const probeZ = this.centerZ(cells[probe]);
        if (this.hasLineOfSight(anchorX, anchorZ, probeX, probeZ)) {
          farthest = probe;
          break;
        }
      }
      const waypoint =
        farthest === cells.length - 1
          ? { x: goal.x, z: goal.z }
          : { x: this.centerX(cells[farthest]), z: this.centerZ(cells[farthest]) };
      waypoints.push(waypoint);
      anchorX = waypoint.x;
      anchorZ = waypoint.z;
      index = farthest + 1;
    }
    return waypoints;
  }

  /** Octile distance in cell units: admissible and consistent on 8-way grids. */
  private heuristic(a: number, b: number): number {
    const dx = Math.abs((a % this.cols) - (b % this.cols));
    const dz = Math.abs(Math.floor(a / this.cols) - Math.floor(b / this.cols));
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  }

  private push(index: number, score: number): void {
    if (this.heapLength >= this.heap.length) return;
    let slot = this.heapLength++;
    this.heap[slot] = index;
    this.heapScore[slot] = score;
    while (slot > 0) {
      const parentSlot = (slot - 1) >> 1;
      if (this.heapScore[parentSlot] <= this.heapScore[slot]) break;
      this.swapHeap(slot, parentSlot);
      slot = parentSlot;
    }
  }

  private pop(): number {
    const top = this.heap[0];
    this.heapLength--;
    if (this.heapLength > 0) {
      this.heap[0] = this.heap[this.heapLength];
      this.heapScore[0] = this.heapScore[this.heapLength];
      let slot = 0;
      for (;;) {
        const left = slot * 2 + 1;
        const right = left + 1;
        let smallest = slot;
        if (left < this.heapLength && this.heapScore[left] < this.heapScore[smallest]) smallest = left;
        if (right < this.heapLength && this.heapScore[right] < this.heapScore[smallest]) smallest = right;
        if (smallest === slot) break;
        this.swapHeap(slot, smallest);
        slot = smallest;
      }
    }
    return top;
  }

  private swapHeap(a: number, b: number): void {
    const index = this.heap[a];
    this.heap[a] = this.heap[b];
    this.heap[b] = index;
    const score = this.heapScore[a];
    this.heapScore[a] = this.heapScore[b];
    this.heapScore[b] = score;
  }

  private toColumn(x: number): number {
    return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.bounds.minX) / this.cellSize)));
  }

  private toRow(z: number): number {
    return Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.bounds.minZ) / this.cellSize)));
  }

  private centerX(index: number): number {
    return this.bounds.minX + ((index % this.cols) + 0.5) * this.cellSize;
  }

  private centerZ(index: number): number {
    return this.bounds.minZ + (Math.floor(index / this.cols) + 0.5) * this.cellSize;
  }
}
