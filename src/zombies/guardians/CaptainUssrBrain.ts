/** An axis-aligned rectangle on the ground, metres. */
export interface GroundRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** Where the boss fights: it never leaves `bounds`, walks around `obstacles` and lands on `landing`. */
export interface CaptainUssrField {
  readonly bounds: GroundRect;
  readonly obstacles: ReadonlyArray<GroundRect>;
  readonly landing: { readonly x: number; readonly z: number };
}

/** Per-phase values: phase 1 (full health), 2 and 3 (enraged). */
type PhaseValues = readonly [number, number, number];

export interface CaptainUssrTuning {
  /** Health when it arrives: `base`, plus `perRound` for every round past the first. */
  readonly health: { readonly base: number; readonly perRound: number };
  /** Body radius kept off the bounds and the obstacles. */
  readonly radius: number;
  /** Seconds of the leap in; it cannot be hurt meanwhile. */
  readonly arrivalSeconds: number;
  /** Seconds after landing before its first attack. */
  readonly openingDelay: number;
  /** Health ratios at or under which phases 2 and 3 begin. */
  readonly phaseThresholds: readonly [number, number];
  readonly walkSpeed: PhaseValues;
  /** Radians per second it turns towards the player. */
  readonly turnRate: PhaseValues;
  /** Seconds between attacks: the phase's minimum plus up to `spread`, drawn from the injected random. */
  readonly cooldown: { readonly min: PhaseValues; readonly spread: number };
  /** Cosine of the half-angle its raised shield covers: shots from inside it are blocked. */
  readonly blockCos: number;
  readonly headMultiplier: number;
  /** Damage multiplier while it is stunned after a charge. */
  readonly stunMultiplier: number;
  /** Close-range shield bash. `arcCos`: cosine of the half-angle it lands in. */
  readonly bash: {
    readonly range: number; readonly windup: number; readonly recovery: number; readonly damage: number; readonly arcCos: number;
  };
  /** The thrown shield: flies to where the player stood at the release, then back to its hand. */
  readonly shieldThrow: {
    readonly minRange: number; readonly range: number; readonly windup: number; readonly speed: number;
    readonly hitRadius: number; readonly damage: number; readonly catchRadius: number; readonly recovery: number;
  };
  /** The charge: locked in a straight line after the windup, until `distance` or a solid stops it. */
  readonly charge: {
    readonly minRange: number; readonly windup: number; readonly speed: number; readonly distance: number;
    readonly hitRadius: number; readonly damage: number; readonly chance: PhaseValues;
    readonly stunSeconds: number; readonly wallStunSeconds: number;
  };
}

export const CAPTAIN_USSR: CaptainUssrTuning = {
  health: { base: 5000, perRound: 350 },
  radius: 0.55,
  arrivalSeconds: 1.5,
  openingDelay: 0.5,
  phaseThresholds: [0.6, 0.3],
  walkSpeed: [1.9, 2.3, 2.9],
  turnRate: [2.6, 3.2, 4.2],
  cooldown: { min: [2.6, 2.1, 1.4], spread: 1.2 },
  // Shots from within 70° of where it faces ring off the shield.
  blockCos: Math.cos((70 * Math.PI) / 180),
  headMultiplier: 2,
  stunMultiplier: 1.5,
  bash: { range: 2.3, windup: 0.55, recovery: 0.6, damage: 30, arcCos: 0.35 },
  shieldThrow: { minRange: 4, range: 18, windup: 0.75, speed: 16, hitRadius: 0.9, damage: 35, catchRadius: 0.7, recovery: 0.45 },
  charge: {
    minRange: 5, windup: 1.0, speed: 11, distance: 16, hitRadius: 1.1, damage: 50,
    chance: [0, 0.5, 0.65], stunSeconds: 1.4, wallStunSeconds: 3.0,
  },
};

/**
 * `dormant` until awakened, `arriving` during its leap, then it `stalks`
 * the player between attacks: a bash, a shield throw (`throwWindup`, then
 * `shieldFlight` until it catches the shield) or a charge that ends
 * `stunned`. Every attack ends `recovering` or `stunned` before the next.
 */
export type CaptainUssrState =
  | 'dormant' | 'arriving' | 'stalking' | 'bashWindup' | 'throwWindup' | 'shieldFlight'
  | 'chargeWindup' | 'charging' | 'stunned' | 'recovering' | 'defeated';

export type CaptainUssrAttack = 'bash' | 'shield' | 'charge';
export type CaptainUssrHitPart = 'head' | 'torso' | 'shield';
/** What a hit did: nothing (not fighting), stopped by the shield, damage, or the last blow. */
export type CaptainUssrHitResult = 'ignored' | 'blocked' | 'hurt' | 'killed';

export type CaptainUssrEvent =
  | { readonly type: 'arrived' }
  | { readonly type: 'phase'; readonly phase: 2 | 3 }
  | { readonly type: 'bashWindup' }
  | { readonly type: 'throwWindup' }
  | { readonly type: 'shieldThrown' }
  | { readonly type: 'shieldCaught' }
  | { readonly type: 'chargeWindup' }
  | { readonly type: 'charge' }
  | { readonly type: 'chargeEnded'; readonly crashed: boolean }
  | { readonly type: 'playerHit'; readonly attack: CaptainUssrAttack; readonly damage: number }
  | { readonly type: 'defeated' };

/** The player as the boss sees them: where they stand, and whether they share its ground. */
export interface CaptainUssrTarget {
  readonly x: number;
  readonly z: number;
  readonly reachable: boolean;
}

/** States that last a set time; `stateProgress` runs 0..1 through them. */
const TIMED: ReadonlySet<CaptainUssrState> = new Set(['arriving', 'bashWindup', 'throwWindup', 'chargeWindup', 'stunned', 'recovering']);

/**
 * CAPITÁN URSS, the zombified Soviet super-soldier guarding an extraction.
 * Pure and deterministic: positions on the ground plane, timers and the
 * injected `random` decide everything. The caller feeds it the player each
 * frame, reports hits with where the shot came from, and drains
 * `pendingEvents` to present attacks, phases and damage to the player.
 */
export class CaptainUssrBrain {
  public readonly pendingEvents: CaptainUssrEvent[] = [];
  private current: CaptainUssrState = 'dormant';
  private currentPhase: 1 | 2 | 3 = 1;
  private hp = 0;
  private maxHp = 0;
  private readonly pos = { x: 0, z: 0 };
  private yaw = 0;
  private stateTime = 0;
  private stateDuration = 0;
  private cooldown = 0;
  private moved = 0;
  private holdingShield = true;
  private readonly shieldPos = { x: 0, z: 0 };
  private readonly shieldTarget = { x: 0, z: 0 };
  private shieldReturning = false;
  /** One hit per attack: a throw or a charge never strikes twice. */
  private attackLanded = false;
  private readonly chargeDir = { x: 0, z: 0 };
  private chargeTravelled = 0;

  public constructor(
    private readonly tuning: CaptainUssrTuning,
    private readonly field: CaptainUssrField,
    private readonly random: () => number,
  ) {}

  public get state(): CaptainUssrState {
    return this.current;
  }

  public get phase(): 1 | 2 | 3 {
    return this.currentPhase;
  }

  public get health(): number {
    return this.hp;
  }

  public get maxHealth(): number {
    return this.maxHp;
  }

  public get healthRatio(): number {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  /** Feet on the ground plane. */
  public get position(): { readonly x: number; readonly z: number } {
    return this.pos;
  }

  /** Heading in radians: 0 faces +z, π/2 faces +x. */
  public get heading(): number {
    return this.yaw;
  }

  /** 0..1 through the current timed state (leap, windups, stun, recovery); 0 otherwise. */
  public get stateProgress(): number {
    return TIMED.has(this.current) && this.stateDuration > 0 ? Math.min(1, this.stateTime / this.stateDuration) : 0;
  }

  /** Metres per second it walked or charged last frame. */
  public get speed(): number {
    return this.moved;
  }

  public get shieldHeld(): boolean {
    return this.holdingShield;
  }

  /** The shield on the ground plane: in its hand, or in flight. */
  public get shield(): { readonly x: number; readonly z: number } {
    return this.shieldPos;
  }

  /** In the fight: it can be hurt and can hurt. */
  public get engaged(): boolean {
    return this.current !== 'dormant' && this.current !== 'arriving' && this.current !== 'defeated';
  }

  /** Its shield covers its front right now: raised while it walks, bashes or charges. */
  public get blocking(): boolean {
    return this.holdingShield && this.engaged && this.current !== 'throwWindup' && this.current !== 'stunned';
  }

  /** Lands it facing the player, at full health for `round`; once until a reset. */
  public awaken(round: number, playerX: number, playerZ: number): boolean {
    if (this.current !== 'dormant') return false;
    const { health } = this.tuning;
    this.maxHp = health.base + health.perRound * Math.max(0, Math.floor(round) - 1);
    this.hp = this.maxHp;
    this.pos.x = this.field.landing.x;
    this.pos.z = this.field.landing.z;
    this.yaw = Math.atan2(playerX - this.pos.x, playerZ - this.pos.z);
    this.syncShield();
    this.enter('arriving', this.tuning.arrivalSeconds);
    return true;
  }

  public update(dt: number, player: CaptainUssrTarget): void {
    const step = Math.max(0, dt);
    this.moved = 0;
    if (this.current === 'dormant' || this.current === 'defeated') return;
    this.stateTime += step;
    switch (this.current) {
      case 'arriving':
        if (this.stateTime < this.stateDuration) return;
        this.cooldown = this.tuning.openingDelay;
        this.enter('stalking', 0);
        this.pendingEvents.push({ type: 'arrived' });
        return;
      case 'stalking':
        this.stalk(step, player);
        return;
      case 'bashWindup':
        this.turnTowards(player, step);
        if (this.stateTime >= this.stateDuration) this.resolveBash(player);
        return;
      case 'throwWindup':
        this.turnTowards(player, step);
        if (this.stateTime >= this.stateDuration) this.releaseShield(player);
        return;
      case 'shieldFlight':
        this.turnTowards(player, step);
        this.flyShield(step, player);
        return;
      case 'chargeWindup':
        this.turnTowards(player, step);
        if (this.stateTime >= this.stateDuration) this.startCharge();
        return;
      case 'charging':
        this.chargeOn(step, player);
        return;
      case 'stunned':
      case 'recovering':
        if (this.stateTime >= this.stateDuration) this.enter('stalking', 0);
        return;
    }
  }

  /**
   * A shot from (`fromX`, `fromZ`): the shield (held or flying) stops it,
   * so does its raised front; anything else hurts, the head and a stunned
   * body more. Crossing a phase threshold or dying is an event.
   */
  public takeHit(damage: number, part: CaptainUssrHitPart, fromX: number, fromZ: number): CaptainUssrHitResult {
    if (!this.engaged) return 'ignored';
    if (part === 'shield' || (this.blocking && this.faces(fromX, fromZ))) return 'blocked';
    return this.applyDamage(damage, part);
  }

  /**
   * A flame weapon's tick: fire wraps around the shield, so it is never
   * blocked, from any side; it counts as a body hit (stun bonus included).
   */
  public takeBurn(damage: number): CaptainUssrHitResult {
    if (!this.engaged) return 'ignored';
    return this.applyDamage(damage, 'torso');
  }

  public clearEvents(): void {
    this.pendingEvents.length = 0;
  }

  /** Back to sleep, unhurt, shield in hand. */
  public reset(): void {
    this.current = 'dormant';
    this.currentPhase = 1;
    this.hp = 0;
    this.maxHp = 0;
    this.pos.x = this.field.landing.x;
    this.pos.z = this.field.landing.z;
    this.yaw = 0;
    this.stateTime = 0;
    this.stateDuration = 0;
    this.cooldown = 0;
    this.moved = 0;
    this.holdingShield = true;
    this.shieldReturning = false;
    this.attackLanded = false;
    this.chargeTravelled = 0;
    this.syncShield();
    this.pendingEvents.length = 0;
  }

  /** Damage that got through: the head and a stunned body take more; crossing a threshold or dying is an event. */
  private applyDamage(damage: number, part: CaptainUssrHitPart): CaptainUssrHitResult {
    const scale = (part === 'head' ? this.tuning.headMultiplier : 1) * (this.current === 'stunned' ? this.tuning.stunMultiplier : 1);
    this.hp = Math.max(0, this.hp - Math.max(0, damage) * scale);
    this.updatePhase();
    if (this.hp > 0) return 'hurt';
    this.current = 'defeated';
    this.holdingShield = true;
    this.syncShield();
    this.pendingEvents.push({ type: 'defeated' });
    return 'killed';
  }

  private stalk(dt: number, player: CaptainUssrTarget): void {
    this.turnTowards(player, dt);
    const dx = player.x - this.pos.x;
    const dz = player.z - this.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance > this.tuning.bash.range * 0.85) {
      const stride = this.tuning.walkSpeed[this.currentPhase - 1] * dt;
      const forwardX = Math.sin(this.yaw);
      const forwardZ = Math.cos(this.yaw);
      const beforeX = this.pos.x;
      const beforeZ = this.pos.z;
      this.moveBy(forwardX * stride, forwardZ * stride);
      if (dt > 0) this.moved = Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ) / dt;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0 || !player.reachable) return;
    this.chooseAttack(distance);
  }

  private chooseAttack(distance: number): void {
    const { bash, shieldThrow, charge } = this.tuning;
    if (distance <= bash.range) {
      this.enter('bashWindup', bash.windup);
      this.pendingEvents.push({ type: 'bashWindup' });
      return;
    }
    if (distance >= charge.minRange && this.random() < charge.chance[this.currentPhase - 1]) {
      this.enter('chargeWindup', charge.windup);
      this.pendingEvents.push({ type: 'chargeWindup' });
      return;
    }
    if (distance >= shieldThrow.minRange && distance <= shieldThrow.range) {
      this.enter('throwWindup', shieldThrow.windup);
      this.pendingEvents.push({ type: 'throwWindup' });
    }
  }

  private resolveBash(player: CaptainUssrTarget): void {
    const { bash } = this.tuning;
    const dx = player.x - this.pos.x;
    const dz = player.z - this.pos.z;
    const distance = Math.hypot(dx, dz);
    if (player.reachable && distance <= bash.range + 0.4 && (distance < 1e-6 || this.faces(player.x, player.z, bash.arcCos))) {
      this.pendingEvents.push({ type: 'playerHit', attack: 'bash', damage: bash.damage });
    }
    this.finishAttack('recovering', bash.recovery);
  }

  private releaseShield(player: CaptainUssrTarget): void {
    const { shieldThrow } = this.tuning;
    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    this.holdingShield = false;
    this.shieldReturning = false;
    this.attackLanded = false;
    this.shieldPos.x = this.pos.x + forwardX * 0.6;
    this.shieldPos.z = this.pos.z + forwardZ * 0.6;
    // Aimed where the player stands now, no further than its range.
    const dx = player.x - this.pos.x;
    const dz = player.z - this.pos.z;
    const reach = Math.min(Math.hypot(dx, dz), shieldThrow.range);
    this.shieldTarget.x = this.pos.x + forwardX * reach;
    this.shieldTarget.z = this.pos.z + forwardZ * reach;
    this.enter('shieldFlight', 0);
    this.pendingEvents.push({ type: 'shieldThrown' });
  }

  private flyShield(dt: number, player: CaptainUssrTarget): void {
    const { shieldThrow } = this.tuning;
    const goalX = this.shieldReturning ? this.pos.x : this.shieldTarget.x;
    const goalZ = this.shieldReturning ? this.pos.z : this.shieldTarget.z;
    const dx = goalX - this.shieldPos.x;
    const dz = goalZ - this.shieldPos.z;
    const left = Math.hypot(dx, dz);
    const stride = shieldThrow.speed * dt;
    if (stride >= left) {
      this.shieldPos.x = goalX;
      this.shieldPos.z = goalZ;
    } else {
      this.shieldPos.x += (dx / left) * stride;
      this.shieldPos.z += (dz / left) * stride;
    }
    if (!this.attackLanded && player.reachable
      && Math.hypot(player.x - this.shieldPos.x, player.z - this.shieldPos.z) <= shieldThrow.hitRadius) {
      this.attackLanded = true;
      this.pendingEvents.push({ type: 'playerHit', attack: 'shield', damage: shieldThrow.damage });
    }
    if (!this.shieldReturning) {
      if (stride >= left) this.shieldReturning = true;
      return;
    }
    if (Math.hypot(this.pos.x - this.shieldPos.x, this.pos.z - this.shieldPos.z) > shieldThrow.catchRadius) return;
    this.holdingShield = true;
    this.syncShield();
    this.pendingEvents.push({ type: 'shieldCaught' });
    this.finishAttack('recovering', shieldThrow.recovery);
  }

  private startCharge(): void {
    this.chargeDir.x = Math.sin(this.yaw);
    this.chargeDir.z = Math.cos(this.yaw);
    this.chargeTravelled = 0;
    this.attackLanded = false;
    this.enter('charging', 0);
    this.pendingEvents.push({ type: 'charge' });
  }

  private chargeOn(dt: number, player: CaptainUssrTarget): void {
    const { charge } = this.tuning;
    const stride = Math.min(charge.speed * dt, charge.distance - this.chargeTravelled);
    const beforeX = this.pos.x;
    const beforeZ = this.pos.z;
    const crashed = !this.moveBy(this.chargeDir.x * stride, this.chargeDir.z * stride, true);
    const travelled = Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ);
    this.chargeTravelled += travelled;
    if (dt > 0) this.moved = travelled / dt;
    this.syncShield();
    if (!this.attackLanded && player.reachable && Math.hypot(player.x - this.pos.x, player.z - this.pos.z) <= charge.hitRadius) {
      this.attackLanded = true;
      this.pendingEvents.push({ type: 'playerHit', attack: 'charge', damage: charge.damage });
    }
    if (!crashed && this.chargeTravelled < charge.distance - 1e-9) return;
    this.pendingEvents.push({ type: 'chargeEnded', crashed });
    this.finishAttack('stunned', crashed ? charge.wallStunSeconds : charge.stunSeconds);
  }

  private finishAttack(state: 'recovering' | 'stunned', seconds: number): void {
    const { min, spread } = this.tuning.cooldown;
    this.cooldown = min[this.currentPhase - 1] + spread * this.random();
    this.enter(state, seconds);
  }

  private enter(state: CaptainUssrState, seconds: number): void {
    this.current = state;
    this.stateTime = 0;
    this.stateDuration = seconds;
  }

  private updatePhase(): void {
    const [second, third] = this.tuning.phaseThresholds;
    const ratio = this.healthRatio;
    if (this.currentPhase === 1 && ratio <= second) {
      this.currentPhase = 2;
      this.pendingEvents.push({ type: 'phase', phase: 2 });
    }
    if (this.currentPhase === 2 && ratio <= third) {
      this.currentPhase = 3;
      this.pendingEvents.push({ type: 'phase', phase: 3 });
    }
  }

  /** Turns towards the player, no faster than the phase allows. */
  private turnTowards(player: CaptainUssrTarget, dt: number): void {
    const dx = player.x - this.pos.x;
    const dz = player.z - this.pos.z;
    if (dx * dx + dz * dz < 1e-8) return;
    const wanted = Math.atan2(dx, dz);
    let delta = wanted - this.yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    const limit = this.tuning.turnRate[this.currentPhase - 1] * dt;
    this.yaw += Math.max(-limit, Math.min(limit, delta));
    this.yaw = Math.atan2(Math.sin(this.yaw), Math.cos(this.yaw));
  }

  /** (`x`, `z`) lies within the cone of cosine `minCos` around its heading. */
  private faces(x: number, z: number, minCos = this.tuning.blockCos): boolean {
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) return true;
    return (Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz) / length >= minCos;
  }

  /**
   * Moves inside the bounds and around the obstacles, sliding along them.
   * Returns false when anything held it back (`strict`: any shortfall).
   */
  private moveBy(dx: number, dz: number, strict = false): boolean {
    const { bounds } = this.field;
    const r = this.tuning.radius;
    const clampX = (x: number): number => Math.min(bounds.maxX - r, Math.max(bounds.minX + r, x));
    const clampZ = (z: number): number => Math.min(bounds.maxZ - r, Math.max(bounds.minZ + r, z));
    const wantedX = this.pos.x + dx;
    const wantedZ = this.pos.z + dz;
    const x = clampX(wantedX);
    const z = clampZ(wantedZ);
    let clamped = x !== wantedX || z !== wantedZ;
    if (this.free(x, z)) {
      this.pos.x = x;
      this.pos.z = z;
    } else if (!strict && this.free(x, this.pos.z)) {
      this.pos.x = x;
      clamped = true;
    } else if (!strict && this.free(this.pos.x, z)) {
      this.pos.z = z;
      clamped = true;
    } else {
      clamped = true;
    }
    if (this.holdingShield) this.syncShield();
    return !clamped;
  }

  private free(x: number, z: number): boolean {
    const r = this.tuning.radius;
    for (const rect of this.field.obstacles) {
      if (x > rect.minX - r && x < rect.maxX + r && z > rect.minZ - r && z < rect.maxZ + r) return false;
    }
    return true;
  }

  private syncShield(): void {
    this.shieldPos.x = this.pos.x;
    this.shieldPos.z = this.pos.z;
  }
}
