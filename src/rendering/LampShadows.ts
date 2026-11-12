import * as THREE from 'three';

/** Tuning of the real-time lamp shadows; every value is a look or cost decision. */
export const LAMP_SHADOWS = {
  /** Lamps casting at once. Fixed for the whole match: a different count recompiles every lit shader. */
  casters: 2,
  /** Pixels per cube face. Each caster owns a 4 x 2 atlas of them. */
  mapSize: 1024,
  /** Nothing closer than this to the bulb casts, so its own fixture cannot black the room out. */
  near: 0.4,
  bias: -0.0005,
  normalBias: 0.025,
  /** How much brighter a lamp must look than the weakest caster to challenge it. */
  hysteresis: 1.5,
  /** Seconds a challenger must stay ahead before it takes over: flashes and flicker never do. */
  swapDelay: 0.75,
  /** Lights reaching less than this many metres are glows, not lamps. */
  minReach: 4,
} as const;

/** Reach assumed for a light without a cutoff distance. */
const UNBOUNDED_REACH = 20;

type LampShadow = THREE.PointLight['shadow'];

interface Lamp {
  readonly light: THREE.PointLight;
  /** The light's own, never rendered shadow; restored whenever it stops casting. */
  readonly ownShadow: LampShadow;
  readonly reachSq: number;
  score: number;
  eligible: boolean;
  /** Index of the pooled shadow it casts with, or -1. */
  slot: number;
}

function isShown(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/**
 * Real-time shadows from the lamps that matter most to the observer. Point
 * light shadows cost six scene passes each, so only `casters` lamps cast and
 * their shadow maps are refreshed in turn, one per frame. The maps live in a
 * fixed pool that moves between lamps: memory and the compiled light setup
 * stay constant while the player crosses the map.
 */
export class LampShadows {
  private readonly lamps: Lamp[] = [];
  private readonly pool: LampShadow[] = [];
  /** Pool slot -> lamp casting with it. */
  private readonly owners: Array<Lamp | null> = [];
  private readonly position = new THREE.Vector3();
  private challenger: Lamp | null = null;
  private challengerTime = 0;
  private frame = 0;

  /**
   * Takes the point lights already in `scene`; lights added later never cast.
   * @param excluded Lights that are effects rather than lamps (the muzzle flash).
   */
  public constructor(scene: THREE.Object3D, excluded: ReadonlySet<THREE.Light>) {
    scene.traverse((object) => {
      if (!(object instanceof THREE.PointLight) || excluded.has(object)) return;
      const reach = object.distance || UNBOUNDED_REACH;
      if (reach < LAMP_SHADOWS.minReach) return;
      this.lamps.push({ light: object, ownShadow: object.shadow, reachSq: reach * reach, score: 0, eligible: false, slot: -1 });
    });
    const size = Math.min(LAMP_SHADOWS.casters, this.lamps.length);
    for (let slot = 0; slot < size; slot++) {
      // A spare light is the only public way to build a point-light shadow.
      const shadow = new THREE.PointLight().shadow;
      shadow.mapSize.set(LAMP_SHADOWS.mapSize, LAMP_SHADOWS.mapSize);
      shadow.camera.near = LAMP_SHADOWS.near;
      shadow.bias = LAMP_SHADOWS.bias;
      shadow.normalBias = LAMP_SHADOWS.normalBias;
      shadow.autoUpdate = false;
      this.pool.push(shadow);
      this.owners.push(null);
    }
  }

  /** Picks the casters for this frame. Call after the map has shown and hidden its lights. */
  public update(dt: number, observer: THREE.Vector3): void {
    if (this.pool.length === 0) return;
    for (const lamp of this.lamps) {
      lamp.eligible = isShown(lamp.light);
      const distanceSq = lamp.light.getWorldPosition(this.position).distanceToSquared(observer);
      lamp.score = lamp.eligible ? lamp.light.intensity * lamp.reachSq / (1 + distanceSq) : 0;
      // A hidden lamp is no longer among the renderer's lights: its slot must go to one that is.
      if (!lamp.eligible && lamp.slot >= 0) this.release(lamp);
    }
    for (let slot = 0; slot < this.pool.length; slot++) {
      if (this.owners[slot]) continue;
      const best = this.strongestIdle();
      if (best) this.assign(best, slot);
    }
    this.challenge(dt);
    this.pool[this.frame++ % this.pool.length].needsUpdate = true;
  }

  public dispose(): void {
    for (const lamp of this.lamps) if (lamp.slot >= 0) this.release(lamp);
    for (const shadow of this.pool) shadow.dispose();
  }

  /** Lets the strongest idle lamp replace the weakest caster once it has clearly outshone it for a while. */
  private challenge(dt: number): void {
    let weakest: Lamp | null = null;
    for (const owner of this.owners) {
      if (owner && (!weakest || owner.score < weakest.score)) weakest = owner;
    }
    const strongest = this.strongestIdle();
    if (!weakest || !strongest || strongest.score <= weakest.score * LAMP_SHADOWS.hysteresis) {
      this.challenger = null;
      return;
    }
    if (strongest !== this.challenger) {
      this.challenger = strongest;
      this.challengerTime = 0;
    }
    this.challengerTime += dt;
    if (this.challengerTime < LAMP_SHADOWS.swapDelay) return;
    const slot = weakest.slot;
    this.release(weakest);
    this.assign(strongest, slot);
    this.challenger = null;
  }

  private strongestIdle(): Lamp | null {
    let best: Lamp | null = null;
    for (const lamp of this.lamps) {
      if (lamp.eligible && lamp.slot < 0 && (!best || lamp.score > best.score)) best = lamp;
    }
    return best;
  }

  private assign(lamp: Lamp, slot: number): void {
    lamp.slot = slot;
    this.owners[slot] = lamp;
    lamp.light.shadow = this.pool[slot];
    lamp.light.castShadow = true;
    this.pool[slot].needsUpdate = true;
  }

  private release(lamp: Lamp): void {
    this.owners[lamp.slot] = null;
    lamp.slot = -1;
    lamp.light.castShadow = false;
    lamp.light.shadow = lamp.ownShadow;
  }
}
