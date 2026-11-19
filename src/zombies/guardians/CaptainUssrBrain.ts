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

/** Per-phase values: phase 1 (full health), 2 (Containment Protocol) and 3 (LAST ORDER). */
type PhaseValues = readonly [number, number, number];

/** The duel's phase as it is presented around the fight: 0 when no duel is on. */
export type GuardianDuelPhase = 0 | 1 | 2 | 3;

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
  /** The fit of rage at each new phase: how long it stands screaming, and the seconds from then to its next attack. */
  readonly rage: { readonly seconds: number; readonly attackDelay: number };
  readonly walkSpeed: PhaseValues;
  /** Hunting down a player who keeps away: beyond `from` metres it walks `boost` times faster. */
  readonly pursuit: { readonly from: number; readonly boost: PhaseValues };
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
  /**
   * The charge: locked in a straight line after the windup, until `distance`
   * or a solid stops it. A charge that runs out in the open is followed by
   * `followUps` more, each after a shorter `repeatWindup`; a crash ends the run.
   */
  readonly charge: {
    readonly minRange: number; readonly windup: number; readonly speed: number; readonly distance: number;
    readonly hitRadius: number; readonly damage: number; readonly chance: PhaseValues;
    readonly stunSeconds: number; readonly wallStunSeconds: number;
    readonly followUps: PhaseValues; readonly repeatWindup: number;
  };
  /**
   * The ground slam: the shield heaved overhead and driven into the ground
   * in front of it. It lands in a cone (`arcCos`) up to `range`, aimed
   * until `aimLock` of the windup, and throws the player back (m/s).
   */
  readonly slam: {
    readonly range: number; readonly arcCos: number; readonly windup: number; readonly aimLock: number;
    readonly damage: number; readonly knockback: number; readonly recovery: number; readonly chance: PhaseValues;
  };
  /**
   * The shockwave: a ring of force rolling out from where it stands at
   * `speed` up to `radius`. It strikes once a player its front sweeps
   * over, `band` metres thick; standing beyond its reach or jumping over it is safe.
   */
  readonly shockwave: {
    readonly triggerRange: number; readonly windup: number; readonly speed: number; readonly radius: number;
    readonly band: number; readonly damage: number; readonly knockback: number; readonly recovery: number;
    readonly chance: PhaseValues;
  };
  /**
   * The electrical sweep: the shield driven into the ground sends a current
   * along a strip, `width` wide and up to `length` long (cut at the field's
   * bounds), laid through where the player stands from `minRange` on. It
   * strikes once, `windup` seconds after the strip is marked, everyone in it.
   * `followUps` more strips follow, each across the last one through where
   * the player stood as it struck; after the last it stays `exposedSeconds`
   * stunned with its guard down.
   */
  readonly sweep: {
    readonly minRange: number; readonly windup: number; readonly length: number; readonly width: number;
    readonly damage: number; readonly chance: PhaseValues; readonly followUps: PhaseValues; readonly exposedSeconds: number;
  };
}

export const CAPTAIN_USSR: CaptainUssrTuning = {
  health: { base: 5000, perRound: 350 },
  radius: 0.55,
  arrivalSeconds: 1.5,
  openingDelay: 0.5,
  // Containment Protocol at 70%, LAST ORDER at 35%.
  phaseThresholds: [0.7, 0.35],
  rage: { seconds: 1.9, attackDelay: 0.4 },
  walkSpeed: [1.9, 2.4, 2.9],
  pursuit: { from: 8, boost: [1, 1.25, 1.3] },
  turnRate: [2.6, 3.2, 4.2],
  cooldown: { min: [2.6, 1.9, 1.4], spread: 1.2 },
  // Shots from within 70° of where it faces ring off the shield.
  blockCos: Math.cos((70 * Math.PI) / 180),
  headMultiplier: 2,
  stunMultiplier: 1.5,
  bash: { range: 2.3, windup: 0.55, recovery: 0.6, damage: 30, arcCos: 0.35 },
  shieldThrow: { minRange: 4, range: 18, windup: 0.75, speed: 16, hitRadius: 0.9, damage: 35, catchRadius: 0.7, recovery: 0.45 },
  charge: {
    minRange: 5, windup: 1.0, speed: 11, distance: 16, hitRadius: 1.1, damage: 50,
    chance: [0, 0.5, 0.65], stunSeconds: 1.4, wallStunSeconds: 3.0,
    followUps: [0, 0, 1], repeatWindup: 0.7,
  },
  slam: {
    range: 4.2, arcCos: Math.cos((55 * Math.PI) / 180), windup: 1.0, aimLock: 0.55,
    damage: 40, knockback: 9, recovery: 0.9, chance: [0, 0.45, 0.4],
  },
  shockwave: {
    triggerRange: 6, windup: 1.15, speed: 8, radius: 9, band: 0.9,
    damage: 30, knockback: 7, recovery: 1.0, chance: [0, 0, 0.35],
  },
  // Rolled after a charge that did not come: about one attack in four at range from phase 2.
  sweep: {
    minRange: 4, windup: 1.2, length: 24, width: 2.8, damage: 35,
    chance: [0, 0.5, 0.55], followUps: [0, 0, 1], exposedSeconds: 2.0,
  },
};

/**
 * `dormant` until awakened, `arriving` during its leap, then it `stalks`
 * the player between attacks: a bash, a shield throw (`throwWindup`, then
 * `shieldFlight` until it catches the shield) or a charge that ends
 * `stunned`. From phase 2 it also slams the ground (`slamWindup`) and
 * sweeps a strip with current (`sweepWindup`, twice in a row in phase 3),
 * and in phase 3 it sends out a shockwave (`shockwaveWindup`). Every attack
 * ends `recovering` or `stunned` before the next. Each new phase stops it
 * `enraged`, screaming with its guard down.
 */
export type CaptainUssrState =
  | 'dormant' | 'arriving' | 'stalking' | 'bashWindup' | 'throwWindup' | 'shieldFlight'
  | 'chargeWindup' | 'charging' | 'slamWindup' | 'shockwaveWindup' | 'sweepWindup'
  | 'stunned' | 'recovering' | 'enraged' | 'defeated';

export type CaptainUssrAttack = 'bash' | 'shield' | 'charge' | 'slam' | 'shockwave' | 'sweep';
export type CaptainUssrHitPart = 'head' | 'torso' | 'shield';
/** What a hit did: nothing (not fighting), stopped by the shield, damage, or the last blow. */
export type CaptainUssrHitResult = 'ignored' | 'blocked' | 'hurt' | 'killed';

export type CaptainUssrEvent =
  | { readonly type: 'arrived' }
  | { readonly type: 'bashWindup' }
  | { readonly type: 'throwWindup' }
  | { readonly type: 'shieldThrown' }
  | { readonly type: 'shieldCaught' }
  | { readonly type: 'chargeWindup' }
  | { readonly type: 'charge' }
  | { readonly type: 'chargeEnded'; readonly crashed: boolean }
  | { readonly type: 'slamWindup' }
  | { readonly type: 'slam' }
  | { readonly type: 'shockwaveWindup' }
  | { readonly type: 'shockwave' }
  /** A strip is marked (`sweepWindup`) or struck (`sweep`); (`x`, `z`) is its point nearest the player, for its sound. */
  | { readonly type: 'sweepWindup'; readonly x: number; readonly z: number }
  | { readonly type: 'sweep'; readonly x: number; readonly z: number }
  /** `push`: the velocity (m/s, on the ground plane) the blow throws the player back with, if any. */
  | { readonly type: 'playerHit'; readonly attack: CaptainUssrAttack; readonly damage: number; readonly push?: { readonly x: number; readonly z: number } }
  | { readonly type: 'defeated' };

/** The player as the boss sees them: where they stand, whether they share its ground and whether they are in the air. */
export interface CaptainUssrTarget {
  readonly x: number;
  readonly z: number;
  readonly reachable: boolean;
  readonly airborne?: boolean;
}

/** The shockwave rolling out: its centre and the radius of its front, negative when none is out. */
export interface CaptainUssrShockwave {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/** A strip of the electrical sweep on the ground: its centre line from (`fromX`, `fromZ`) to (`toX`, `toZ`), `sweep.width` wide. */
export interface CaptainUssrStrip {
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
}

/** States that last a set time; `stateProgress` runs 0..1 through them. */
const TIMED: ReadonlySet<CaptainUssrState> = new Set([
  'arriving', 'bashWindup', 'throwWindup', 'chargeWindup', 'slamWindup', 'shockwaveWindup', 'sweepWindup', 'stunned', 'recovering', 'enraged',
]);
/** States a fit of rage can break into; it waits out a shield in the air, a charge under way and a stun. */
const RAGE_BREAKS_INTO: ReadonlySet<CaptainUssrState> = new Set([
  'stalking', 'bashWindup', 'throwWindup', 'chargeWindup', 'slamWindup', 'shockwaveWindup', 'sweepWindup', 'recovering',
]);
/** Its shield is lifted off its front: thrown, heaved overhead for a slam, a shockwave or a sweep, or let fall. */
const GUARD_DOWN: ReadonlySet<CaptainUssrState> = new Set(['throwWindup', 'slamWindup', 'shockwaveWindup', 'sweepWindup', 'stunned', 'enraged']);

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
  /** A new phase began: the fit of rage plays as soon as it can break in. */
  private rageDue = false;
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
  /** Charges still to follow the current one, if it does not crash. */
  private chargesLeft = 0;
  /** Its last attack: a slam or a shockwave is never repeated back to back. */
  private lastAttack: CaptainUssrAttack | null = null;
  private readonly wave = { x: 0, z: 0, radius: -1 };
  private waveLanded = false;
  /** The strip about to be struck, while `stripMarked`. */
  private readonly strip = { fromX: 0, fromZ: 0, toX: 0, toZ: 0 };
  private stripMarked = false;
  /** Strips still to follow the marked one. */
  private sweepsLeft = 0;
  private strikes = 0;

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

  /** The shockwave rolling out, if any (`radius` negative when none). */
  public get shockwave(): CaptainUssrShockwave {
    return this.wave;
  }

  /** The strip marked for its sweep and about to be struck; null when none is. */
  public get sweepMark(): CaptainUssrStrip | null {
    return this.stripMarked ? this.strip : null;
  }

  /** Strips struck since it was last put to sleep: a change means one just struck. */
  public get sweepStrikes(): number {
    return this.strikes;
  }

  /** Radius of its body, metres. */
  public get radius(): number {
    return this.tuning.radius;
  }

  /** In the fight: it can be hurt and can hurt. */
  public get engaged(): boolean {
    return this.current !== 'dormant' && this.current !== 'arriving' && this.current !== 'defeated';
  }

  /** Its shield covers its front right now: raised while it walks, bashes or charges. */
  public get blocking(): boolean {
    return this.holdingShield && this.engaged && !GUARD_DOWN.has(this.current);
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
    this.spreadShockwave(step, player);
    if (this.rageDue && RAGE_BREAKS_INTO.has(this.current)) {
      this.rageDue = false;
      this.chargesLeft = 0;
      this.clearSweep();
      this.enter('enraged', this.tuning.rage.seconds);
      return;
    }
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
      case 'slamWindup':
        // Aimed until late in the windup: the last moments are the player's to step out of the cone.
        if (this.stateProgress < this.tuning.slam.aimLock) this.turnTowards(player, step);
        if (this.stateTime >= this.stateDuration) this.resolveSlam(player);
        return;
      case 'shockwaveWindup':
        this.turnTowards(player, step);
        if (this.stateTime >= this.stateDuration) this.releaseShockwave();
        return;
      case 'sweepWindup':
        // The strip stays where it was marked: only the body turns.
        this.turnTowards(player, step);
        if (this.stateTime >= this.stateDuration) this.strikeSweep(player);
        return;
      case 'stunned':
      case 'recovering':
        if (this.stateTime >= this.stateDuration) this.enter('stalking', 0);
        return;
      case 'enraged':
        this.turnTowards(player, step);
        if (this.stateTime < this.stateDuration) return;
        this.cooldown = this.tuning.rage.attackDelay;
        this.enter('stalking', 0);
        return;
    }
  }

  /**
   * A shot from (`fromX`, `fromZ`): the shield (held or flying) stops it,
   * so does its raised front; anything else hurts, the head and a stunned
   * body more.
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

  /**
   * A bolt of an energy weapon (VORTEX-9, ZEUS-77): it goes through the
   * shield on its arm as a body hit, from any side. The shield in flight
   * has no body behind it, so a bolt that strikes it is spent.
   */
  public takeBolt(damage: number, part: CaptainUssrHitPart): CaptainUssrHitResult {
    if (!this.engaged) return 'ignored';
    if (part === 'shield' && !this.holdingShield) return 'blocked';
    return this.applyDamage(damage, part === 'shield' ? 'torso' : part);
  }

  /** A grenade blast: like fire, it wraps around the shield and lands as a body hit. */
  public takeBlast(damage: number): CaptainUssrHitResult {
    return this.takeBurn(damage);
  }

  public clearEvents(): void {
    this.pendingEvents.length = 0;
  }

  /** Back to sleep, unhurt, shield in hand. */
  public reset(): void {
    this.current = 'dormant';
    this.currentPhase = 1;
    this.rageDue = false;
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
    this.chargesLeft = 0;
    this.lastAttack = null;
    this.wave.radius = -1;
    this.waveLanded = false;
    this.clearSweep();
    this.strikes = 0;
    this.syncShield();
    this.pendingEvents.length = 0;
  }

  /** Damage that got through: the head and a stunned body take more; crossing a threshold enrages it, dying is an event. */
  private applyDamage(damage: number, part: CaptainUssrHitPart): CaptainUssrHitResult {
    const scale = (part === 'head' ? this.tuning.headMultiplier : 1) * (this.current === 'stunned' ? this.tuning.stunMultiplier : 1);
    this.hp = Math.max(0, this.hp - Math.max(0, damage) * scale);
    this.updatePhase();
    if (this.hp > 0) return 'hurt';
    this.current = 'defeated';
    this.wave.radius = -1;
    this.clearSweep();
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
      const { pursuit, walkSpeed } = this.tuning;
      const boost = distance > pursuit.from ? pursuit.boost[this.currentPhase - 1] : 1;
      const stride = walkSpeed[this.currentPhase - 1] * boost * dt;
      const forwardX = Math.sin(this.yaw);
      const forwardZ = Math.cos(this.yaw);
      const beforeX = this.pos.x;
      const beforeZ = this.pos.z;
      this.moveBy(forwardX * stride, forwardZ * stride);
      if (dt > 0) this.moved = Math.hypot(this.pos.x - beforeX, this.pos.z - beforeZ) / dt;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0 || !player.reachable) return;
    this.chooseAttack(distance, player);
  }

  /**
   * The phase's attack for the player's distance: the shockwave and the slam
   * first when the phase has them (never twice in a row), else the bash up
   * close, a charge, a sweep (never twice in a row, never over a rolling
   * shockwave) or a throw further out.
   */
  private chooseAttack(distance: number, player: CaptainUssrTarget): void {
    const { bash, shieldThrow, charge, slam, shockwave, sweep } = this.tuning;
    const phase = this.currentPhase - 1;
    if (distance <= shockwave.triggerRange && this.lastAttack !== 'shockwave' && this.rolls(shockwave.chance[phase])) {
      this.beginAttack('shockwave', 'shockwaveWindup', shockwave.windup);
      this.pendingEvents.push({ type: 'shockwaveWindup' });
      return;
    }
    if (distance <= slam.range && this.lastAttack !== 'slam' && this.rolls(slam.chance[phase])) {
      this.beginAttack('slam', 'slamWindup', slam.windup);
      this.pendingEvents.push({ type: 'slamWindup' });
      return;
    }
    if (distance <= bash.range) {
      this.beginAttack('bash', 'bashWindup', bash.windup);
      this.pendingEvents.push({ type: 'bashWindup' });
      return;
    }
    if (distance >= charge.minRange && this.random() < charge.chance[phase]) {
      this.chargesLeft = charge.followUps[phase];
      this.beginAttack('charge', 'chargeWindup', charge.windup);
      this.pendingEvents.push({ type: 'chargeWindup' });
      return;
    }
    if (distance >= sweep.minRange && this.lastAttack !== 'sweep' && this.wave.radius < 0 && this.rolls(sweep.chance[phase])) {
      this.sweepsLeft = sweep.followUps[phase];
      this.lastAttack = 'sweep';
      this.markSweep(player, player.x - this.pos.x, player.z - this.pos.z);
      return;
    }
    if (distance >= shieldThrow.minRange && distance <= shieldThrow.range) {
      this.beginAttack('shield', 'throwWindup', shieldThrow.windup);
      this.pendingEvents.push({ type: 'throwWindup' });
    }
  }

  /** Draws from the random only for an attack the phase allows, so phases without it keep their sequence. */
  private rolls(chance: number): boolean {
    return chance > 0 && this.random() < chance;
  }

  private beginAttack(attack: CaptainUssrAttack, windup: CaptainUssrState, seconds: number): void {
    this.lastAttack = attack;
    this.enter(windup, seconds);
  }

  /** The shield driven into the ground: a player in the cone before it is hurt and thrown back. */
  private resolveSlam(player: CaptainUssrTarget): void {
    const { slam } = this.tuning;
    const dx = player.x - this.pos.x;
    const dz = player.z - this.pos.z;
    const distance = Math.hypot(dx, dz);
    this.pendingEvents.push({ type: 'slam' });
    if (player.reachable && distance <= slam.range + 0.3 && (distance < 1e-6 || this.faces(player.x, player.z, slam.arcCos))) {
      this.hitPlayer('slam', slam.damage, dx, dz, slam.knockback);
    }
    this.finishAttack('recovering', slam.recovery);
  }

  /** The shockwave leaves its feet; it rolls on by itself while it recovers. */
  private releaseShockwave(): void {
    const { shockwave } = this.tuning;
    this.wave.x = this.pos.x;
    this.wave.z = this.pos.z;
    this.wave.radius = 0;
    this.waveLanded = false;
    this.pendingEvents.push({ type: 'shockwave' });
    this.finishAttack('recovering', shockwave.recovery);
  }

  /** The front rolls out; the first time it sweeps over a grounded player it strikes them, once. */
  private spreadShockwave(dt: number, player: CaptainUssrTarget): void {
    if (this.wave.radius < 0) return;
    const { shockwave } = this.tuning;
    const before = this.wave.radius;
    this.wave.radius = Math.min(shockwave.radius, before + shockwave.speed * dt);
    if (!this.waveLanded && player.reachable && !player.airborne) {
      const dx = player.x - this.wave.x;
      const dz = player.z - this.wave.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= this.wave.radius && distance >= before - shockwave.band) {
        this.waveLanded = true;
        this.hitPlayer('shockwave', shockwave.damage, dx, dz, shockwave.knockback);
      }
    }
    if (this.wave.radius >= shockwave.radius) this.wave.radius = -1;
  }

  /**
   * Marks a strip through where the player stands, along (`dirX`, `dirZ`),
   * cut at the field's bounds, and winds up to strike it.
   */
  private markSweep(player: CaptainUssrTarget, dirX: number, dirZ: number): void {
    const { bounds } = this.field;
    const { sweep } = this.tuning;
    let length = Math.hypot(dirX, dirZ);
    if (length < 1e-6) {
      dirX = Math.sin(this.yaw);
      dirZ = Math.cos(this.yaw);
      length = 1;
    }
    const x = Math.min(bounds.maxX, Math.max(bounds.minX, player.x));
    const z = Math.min(bounds.maxZ, Math.max(bounds.minZ, player.z));
    const unitX = dirX / length;
    const unitZ = dirZ / length;
    const ahead = this.reachInBounds(x, z, unitX, unitZ, sweep.length / 2);
    const behind = this.reachInBounds(x, z, -unitX, -unitZ, sweep.length / 2);
    this.strip.fromX = x - unitX * behind;
    this.strip.fromZ = z - unitZ * behind;
    this.strip.toX = x + unitX * ahead;
    this.strip.toZ = z + unitZ * ahead;
    this.stripMarked = true;
    this.enter('sweepWindup', sweep.windup);
    this.pushSweepEvent('sweepWindup', player);
  }

  /**
   * The current runs along the marked strip: whoever stands in it is struck,
   * once. A follow-up is marked across it through where the player stands;
   * after the last, it is left stunned and open.
   */
  private strikeSweep(player: CaptainUssrTarget): void {
    const { sweep } = this.tuning;
    this.strikes++;
    this.pushSweepEvent('sweep', player);
    if (player.reachable && this.inStrip(player.x, player.z)) {
      this.pendingEvents.push({ type: 'playerHit', attack: 'sweep', damage: sweep.damage });
    }
    this.stripMarked = false;
    if (this.sweepsLeft > 0) {
      this.sweepsLeft--;
      this.markSweep(player, -(this.strip.toZ - this.strip.fromZ), this.strip.toX - this.strip.fromX);
      return;
    }
    this.finishAttack('stunned', sweep.exposedSeconds);
  }

  private clearSweep(): void {
    this.stripMarked = false;
    this.sweepsLeft = 0;
  }

  /** (`x`, `z`) lies on the marked strip: between its ends and within half its width of its centre line. */
  private inStrip(x: number, z: number): boolean {
    const { fromX, fromZ, toX, toZ } = this.strip;
    const length = Math.hypot(toX - fromX, toZ - fromZ);
    if (length < 1e-6) return false;
    const along = ((x - fromX) * (toX - fromX) + (z - fromZ) * (toZ - fromZ)) / length;
    const across = Math.abs((x - fromX) * (toZ - fromZ) - (z - fromZ) * (toX - fromX)) / length;
    return along >= 0 && along <= length && across <= this.tuning.sweep.width / 2;
  }

  /** A sweep event at the marked strip's point nearest the player. */
  private pushSweepEvent(type: 'sweepWindup' | 'sweep', player: CaptainUssrTarget): void {
    const { fromX, fromZ, toX, toZ } = this.strip;
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 1e-12 ? Math.min(1, Math.max(0, ((player.x - fromX) * dx + (player.z - fromZ) * dz) / lengthSq)) : 0;
    this.pendingEvents.push({ type, x: fromX + dx * t, z: fromZ + dz * t });
  }

  /** How far from (`x`, `z`) inside the bounds one can go along the unit (`dirX`, `dirZ`), up to `limit`. */
  private reachInBounds(x: number, z: number, dirX: number, dirZ: number, limit: number): number {
    const { bounds } = this.field;
    let reach = limit;
    if (dirX > 1e-9) reach = Math.min(reach, (bounds.maxX - x) / dirX);
    else if (dirX < -1e-9) reach = Math.min(reach, (bounds.minX - x) / dirX);
    if (dirZ > 1e-9) reach = Math.min(reach, (bounds.maxZ - z) / dirZ);
    else if (dirZ < -1e-9) reach = Math.min(reach, (bounds.minZ - z) / dirZ);
    return Math.max(0, reach);
  }

  /** A blow that throws the player back along (`dx`, `dz`) from it at `knockback` m/s; straight ahead of it when on top of it. */
  private hitPlayer(attack: CaptainUssrAttack, damage: number, dx: number, dz: number, knockback: number): void {
    const length = Math.hypot(dx, dz);
    const x = length > 1e-6 ? dx / length : Math.sin(this.yaw);
    const z = length > 1e-6 ? dz / length : Math.cos(this.yaw);
    this.pendingEvents.push({ type: 'playerHit', attack, damage, push: { x: x * knockback, z: z * knockback } });
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
    if (!crashed && this.chargesLeft > 0) {
      // LAST ORDER: it wheels round and gathers again, briefly, for the next charge.
      this.chargesLeft--;
      this.enter('chargeWindup', charge.repeatWindup);
      this.pendingEvents.push({ type: 'chargeWindup' });
      return;
    }
    this.chargesLeft = 0;
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
      this.rageDue = true;
    }
    if (this.currentPhase === 2 && ratio <= third) {
      this.currentPhase = 3;
      this.rageDue = true;
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
