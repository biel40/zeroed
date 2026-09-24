import type { ZombieState } from '../zombies/Zombie';
import { ZOMBIE_TYPE_CONFIGS, type ZombieTypeId } from '../zombies/ZombieConfig';
import { WEAPON_DEFINITIONS } from '../config/weapons';
import type { WeaponId } from '../weapons/WeaponTypes';
import type { MysteryBoxSnapshot } from '../zombies/MysteryBox';
import type { SecretRoomSnapshot } from '../zombies/secret-room/SecretRoomSystem';

/**
 * Wire contract of the two-player co-op. The relay only pairs sockets and
 * forwards peer messages; the host browser is the single match authority.
 * Guest → host messages are requests/inputs, host → guest messages are
 * authoritative state and one-shot events. Every inbound peer message is
 * validated here before a mode touches it.
 */
export type CoopPlayerId = 'host' | 'guest';
export type MatchPhase = 'waiting' | 'playing' | 'gameOver' | 'ending' | 'credits';
export const RELAY_PROTOCOL_VERSION = 4;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Networked gameplay state of one player. `t` is the sender clock in seconds. */
export interface PlayerNetState {
  readonly t: number;
  /** Eye position (camera rig), not the feet. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly floor: number;
  readonly weapon: WeaponId;
  readonly ads: boolean;
  readonly reloading: boolean;
  readonly repairBarrierId?: string | null;
}

export interface PlayerMatchStats {
  readonly hp: number;
  readonly points: number;
  readonly kills: number;
  readonly headshots: number;
  readonly alive: boolean;
}

export interface ZombieNetState {
  readonly id: number;
  readonly type: ZombieTypeId;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly floor: number;
  readonly scale: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly state: ZombieState;
}

export interface BarrierNetState {
  readonly id: string;
  readonly boards: readonly number[];
}

/** Authoritative match snapshot, broadcast by the host at a fixed network rate. */
export interface MatchState {
  readonly t: number;
  readonly phase: MatchPhase;
  readonly round: number;
  readonly host: PlayerNetState;
  readonly stats: Readonly<Record<CoopPlayerId, PlayerMatchStats>>;
  readonly zombies: readonly ZombieNetState[];
  readonly openDoorIds: readonly string[];
  readonly barriers: readonly BarrierNetState[];
  readonly box: MysteryBoxSnapshot & { readonly owner: CoopPlayerId | null };
  readonly secret: SecretRoomSnapshot;
  readonly claimedPickupIds: readonly string[];
}

export type HitPart = 'head' | 'torso';
export type DoorFailureReason = 'insufficientPoints' | 'unavailable';

export type GuestMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'playerState'; readonly state: PlayerNetState }
  | { readonly type: 'playerShoot'; readonly weapon: WeaponId; readonly origin: Vec3; readonly direction: Vec3 }
  | { readonly type: 'zombieHitClaim'; readonly weapon: WeaponId; readonly zombieId: number; readonly part: HitPart }
  | { readonly type: 'knifeHitClaim'; readonly zombieId: number }
  | { readonly type: 'doorPurchase'; readonly doorId: string }
  | { readonly type: 'wallBuyPurchase'; readonly wallBuyId: string; readonly refill: boolean; readonly equippedWeapon: WeaponId }
  | { readonly type: 'boxUse'; readonly action: 'activate' | 'pickup'; readonly equippedWeapon: WeaponId }
  | { readonly type: 'mapUse'; readonly kind: 'lamp' | 'ritual' | 'pickup' | 'ammo' | 'completion'; readonly id: string;
    readonly equippedWeapon: WeaponId };

export type HostMessage =
  | { readonly type: 'matchState'; readonly state: MatchState }
  | { readonly type: 'playerShoot'; readonly weapon: WeaponId; readonly origin: Vec3; readonly direction: Vec3 }
  | { readonly type: 'teslaChain'; readonly points: readonly Vec3[] }
  | { readonly type: 'zombieSpawn'; readonly zombie: ZombieNetState }
  | { readonly type: 'zombieAttack'; readonly zombieId: number; readonly target: CoopPlayerId }
  | {
    readonly type: 'zombieHit';
    readonly zombieId: number;
    readonly headshot: boolean;
    readonly amount: number;
    readonly fromX: number;
    readonly fromZ: number;
  }
  | { readonly type: 'zombieDeath'; readonly zombieId: number; readonly killer: CoopPlayerId }
  | { readonly type: 'roundStart'; readonly round: number }
  | { readonly type: 'roundEnd'; readonly round: number }
  | { readonly type: 'doorOpened'; readonly doorId: string; readonly buyer: CoopPlayerId }
  | { readonly type: 'doorPurchaseFailed'; readonly doorId: string; readonly reason: DoorFailureReason }
  | { readonly type: 'wallBuyDelivered'; readonly weapon: WeaponId; readonly refill: boolean }
  | { readonly type: 'wallBuyFailed'; readonly reason: 'unavailable' | 'insufficientPoints' | 'ammoFull' }
  | { readonly type: 'boxGranted'; readonly weapon: WeaponId }
  | { readonly type: 'milestoneWeapon'; readonly weapon: WeaponId }
  | { readonly type: 'mapUsed'; readonly kind: 'lamp' | 'ritual' | 'pickup' | 'ammo'; readonly id: string;
    readonly buyer: CoopPlayerId; readonly weapon?: WeaponId }
  | { readonly type: 'mapUseFailed'; readonly reason: 'unavailable' | 'insufficientPoints' | 'ammoFull' }
  | { readonly type: 'boxFailed'; readonly reason: 'unavailable' | 'insufficientPoints' | 'reserved' }
  | { readonly type: 'playerDamaged'; readonly damage: number }
  | { readonly type: 'matchRestart' };

export type LobbyClientMessage =
  | { readonly type: 'hello'; readonly version: number }
  | { readonly type: 'create' }
  | { readonly type: 'join'; readonly code: string };

/** Messages generated by the relay itself; peers can never forge these. */
export type RelayMessage =
  | { readonly type: 'relayReady'; readonly version: number }
  | { readonly type: 'created'; readonly code: string }
  | { readonly type: 'joined'; readonly code: string }
  | { readonly type: 'peerJoined' }
  | { readonly type: 'peerLeft' }
  | { readonly type: 'error'; readonly message: string };

export type OutgoingMessage = LobbyClientMessage | GuestMessage | HostMessage;

/** Anything the socket delivers: relay messages or an unvalidated peer payload. */
export type IncomingMessage = RelayMessage | { readonly type: string; readonly [key: string]: unknown };

export const RELAY_MESSAGE_TYPES: ReadonlySet<string> = new Set(['relayReady', 'created', 'joined', 'peerJoined', 'peerLeft', 'error']);

const ZOMBIE_STATES: ReadonlySet<string> = new Set([
  'spawn', 'walk', 'attack', 'hit', 'death', 'barrierAttack', 'barrierBreak',
]);
const MAX_COORDINATE = 1000;
const MAX_ID_LENGTH = 40;

type Loose = { readonly [key: string]: unknown };

function isObject(value: unknown): value is Loose {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isCoordinate(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) < MAX_COORDINATE;
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isPlayerId(value: unknown): value is CoopPlayerId {
  return value === 'host' || value === 'guest';
}

function isVec3(value: unknown): value is Vec3 {
  return isObject(value) && isCoordinate(value.x) && isCoordinate(value.y) && isCoordinate(value.z);
}

function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(WEAPON_DEFINITIONS, value);
}

export function isPlayerNetState(value: unknown): value is PlayerNetState {
  return isObject(value)
    && isFiniteNumber(value.t)
    && isCoordinate(value.x) && isCoordinate(value.y) && isCoordinate(value.z)
    && isFiniteNumber(value.yaw) && isFiniteNumber(value.pitch)
    && Number.isInteger(value.floor)
    && isWeaponId(value.weapon)
    && typeof value.ads === 'boolean' && typeof value.reloading === 'boolean'
    && (value.repairBarrierId === undefined || value.repairBarrierId === null || isId(value.repairBarrierId));
}

function isStats(value: unknown): value is PlayerMatchStats {
  return isObject(value) && isFiniteNumber(value.hp) && isFiniteNumber(value.points)
    && isFiniteNumber(value.kills) && isFiniteNumber(value.headshots) && typeof value.alive === 'boolean';
}

export function isZombieNetState(value: unknown): value is ZombieNetState {
  return isObject(value)
    && Number.isInteger(value.id)
    && typeof value.type === 'string' && Object.prototype.hasOwnProperty.call(ZOMBIE_TYPE_CONFIGS, value.type)
    && isCoordinate(value.x) && isCoordinate(value.y) && isCoordinate(value.z)
    && isFiniteNumber(value.yaw) && Number.isInteger(value.floor)
    && isFiniteNumber(value.scale) && value.scale > 0
    && isFiniteNumber(value.hp) && isFiniteNumber(value.maxHp)
    && typeof value.state === 'string' && ZOMBIE_STATES.has(value.state);
}

function isBarrierState(value: unknown): value is BarrierNetState {
  return isObject(value) && isId(value.id) && Array.isArray(value.boards)
    && value.boards.length <= 16 && value.boards.every(isFiniteNumber);
}

function isBoxState(value: unknown): value is MatchState['box'] {
  return isObject(value)
    && (value.phase === 'closed' || value.phase === 'opening' || value.phase === 'rolling'
      || value.phase === 'awaitingPickup' || value.phase === 'closing')
    && isWeaponId(value.displayWeapon)
    && (value.result === null || isWeaponId(value.result))
    && (value.owner === null || isPlayerId(value.owner));
}

function isSecretState(value: unknown): value is SecretRoomSnapshot {
  return isObject(value) && Array.isArray(value.lamps) && value.lamps.length <= 8
    && value.lamps.every((lamp: unknown) => isObject(lamp) && typeof lamp.activated === 'boolean'
      && Number.isInteger(lamp.currentSouls) && (lamp.currentSouls as number) >= 0
      && typeof lamp.completed === 'boolean')
    && typeof value.unlocked === 'boolean' && typeof value.doorOpen === 'boolean'
    && typeof value.ritualScareTriggered === 'boolean';
}

function isMatchState(value: unknown): value is MatchState {
  return isObject(value)
    && isFiniteNumber(value.t)
    && (value.phase === 'waiting' || value.phase === 'playing' || value.phase === 'gameOver'
      || value.phase === 'ending' || value.phase === 'credits')
    && Number.isInteger(value.round)
    && isPlayerNetState(value.host)
    && isObject(value.stats) && isStats(value.stats.host) && isStats(value.stats.guest)
    && Array.isArray(value.zombies) && value.zombies.every(isZombieNetState)
    && Array.isArray(value.openDoorIds) && value.openDoorIds.every(isId)
    && Array.isArray(value.barriers) && value.barriers.every(isBarrierState)
    && isBoxState(value.box) && isSecretState(value.secret)
    && Array.isArray(value.claimedPickupIds) && value.claimedPickupIds.every(isId);
}

/** Host-side boundary: a guest payload is either a well-formed request or dropped. */
export function parseGuestMessage(message: IncomingMessage): GuestMessage | null {
  const raw = message as Loose;
  switch (message.type) {
    case 'ready':
      return { type: 'ready' };
    case 'playerState':
      return isPlayerNetState(raw.state) ? { type: 'playerState', state: raw.state } : null;
    case 'playerShoot':
      return isWeaponId(raw.weapon) && isVec3(raw.origin) && isVec3(raw.direction)
        ? { type: 'playerShoot', weapon: raw.weapon, origin: raw.origin, direction: raw.direction }
        : null;
    case 'zombieHitClaim':
      return isWeaponId(raw.weapon) && Number.isInteger(raw.zombieId) && (raw.part === 'head' || raw.part === 'torso')
        ? { type: 'zombieHitClaim', weapon: raw.weapon, zombieId: raw.zombieId as number, part: raw.part }
        : null;
    case 'knifeHitClaim':
      return Number.isInteger(raw.zombieId) && (raw.zombieId as number) >= 0
        ? { type: 'knifeHitClaim', zombieId: raw.zombieId as number }
        : null;
    case 'doorPurchase':
      return isId(raw.doorId) ? { type: 'doorPurchase', doorId: raw.doorId } : null;
    case 'wallBuyPurchase':
      return isId(raw.wallBuyId) && typeof raw.refill === 'boolean' && isWeaponId(raw.equippedWeapon)
        ? { type: 'wallBuyPurchase', wallBuyId: raw.wallBuyId, refill: raw.refill, equippedWeapon: raw.equippedWeapon } : null;
    case 'boxUse':
      return (raw.action === 'activate' || raw.action === 'pickup') && isWeaponId(raw.equippedWeapon)
        ? { type: 'boxUse', action: raw.action, equippedWeapon: raw.equippedWeapon } : null;
    case 'mapUse':
      return (raw.kind === 'lamp' || raw.kind === 'ritual' || raw.kind === 'pickup'
        || raw.kind === 'ammo' || raw.kind === 'completion') && isId(raw.id) && isWeaponId(raw.equippedWeapon)
        ? { type: 'mapUse', kind: raw.kind, id: raw.id, equippedWeapon: raw.equippedWeapon } : null;
    default:
      return null;
  }
}

/** Guest-side boundary: malformed host data is ignored instead of crashing the replica. */
export function parseHostMessage(message: IncomingMessage): HostMessage | null {
  const raw = message as Loose;
  switch (message.type) {
    case 'matchState':
      return isMatchState(raw.state) ? { type: 'matchState', state: raw.state } : null;
    case 'playerShoot':
      return isWeaponId(raw.weapon) && isVec3(raw.origin) && isVec3(raw.direction)
        ? { type: 'playerShoot', weapon: raw.weapon, origin: raw.origin, direction: raw.direction }
        : null;
    case 'teslaChain':
      return Array.isArray(raw.points) && raw.points.length <= 8 && raw.points.every(isVec3)
        ? { type: 'teslaChain', points: raw.points } : null;
    case 'zombieSpawn':
      return isZombieNetState(raw.zombie) ? { type: 'zombieSpawn', zombie: raw.zombie } : null;
    case 'zombieAttack':
      return Number.isInteger(raw.zombieId) && isPlayerId(raw.target)
        ? { type: 'zombieAttack', zombieId: raw.zombieId as number, target: raw.target }
        : null;
    case 'zombieHit':
      return Number.isInteger(raw.zombieId) && typeof raw.headshot === 'boolean'
        && isFiniteNumber(raw.amount) && isCoordinate(raw.fromX) && isCoordinate(raw.fromZ)
        ? {
          type: 'zombieHit', zombieId: raw.zombieId as number, headshot: raw.headshot,
          amount: raw.amount, fromX: raw.fromX, fromZ: raw.fromZ,
        }
        : null;
    case 'zombieDeath':
      return Number.isInteger(raw.zombieId) && isPlayerId(raw.killer)
        ? { type: 'zombieDeath', zombieId: raw.zombieId as number, killer: raw.killer }
        : null;
    case 'roundStart':
    case 'roundEnd':
      return Number.isInteger(raw.round) ? { type: message.type, round: raw.round as number } : null;
    case 'doorOpened':
      return isId(raw.doorId) && isPlayerId(raw.buyer)
        ? { type: 'doorOpened', doorId: raw.doorId, buyer: raw.buyer }
        : null;
    case 'doorPurchaseFailed':
      return isId(raw.doorId) && (raw.reason === 'insufficientPoints' || raw.reason === 'unavailable')
        ? { type: 'doorPurchaseFailed', doorId: raw.doorId, reason: raw.reason }
        : null;
    case 'wallBuyDelivered':
      return isWeaponId(raw.weapon) && typeof raw.refill === 'boolean'
        ? { type: 'wallBuyDelivered', weapon: raw.weapon, refill: raw.refill } : null;
    case 'wallBuyFailed':
      return raw.reason === 'unavailable' || raw.reason === 'insufficientPoints' || raw.reason === 'ammoFull'
        ? { type: 'wallBuyFailed', reason: raw.reason } : null;
    case 'boxGranted':
      return isWeaponId(raw.weapon) ? { type: 'boxGranted', weapon: raw.weapon } : null;
    case 'milestoneWeapon':
      return raw.weapon === 'raygun' ? { type: 'milestoneWeapon', weapon: raw.weapon } : null;
    case 'mapUsed':
      return (raw.kind === 'lamp' || raw.kind === 'ritual' || raw.kind === 'pickup' || raw.kind === 'ammo')
        && isId(raw.id) && isPlayerId(raw.buyer) && (raw.weapon === undefined || isWeaponId(raw.weapon))
        ? { type: 'mapUsed', kind: raw.kind, id: raw.id, buyer: raw.buyer, weapon: raw.weapon as WeaponId | undefined }
        : null;
    case 'mapUseFailed':
      return raw.reason === 'unavailable' || raw.reason === 'insufficientPoints' || raw.reason === 'ammoFull'
        ? { type: 'mapUseFailed', reason: raw.reason } : null;
    case 'boxFailed':
      return raw.reason === 'unavailable' || raw.reason === 'insufficientPoints' || raw.reason === 'reserved'
        ? { type: 'boxFailed', reason: raw.reason } : null;
    case 'playerDamaged':
      return isFiniteNumber(raw.damage) ? { type: 'playerDamaged', damage: raw.damage } : null;
    case 'matchRestart':
      return { type: 'matchRestart' };
    default:
      return null;
  }
}
