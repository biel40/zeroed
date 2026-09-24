import * as THREE from 'three';
import { vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import type { DeviceProfile } from '../src/core/DeviceProfile';
import type { ModeContext } from '../src/modes/GameMode';
import { CoopGuestMode } from '../src/modes/coop/CoopGuestMode';
import { CoopHostMode } from '../src/modes/coop/CoopHostMode';
import type { CoopConnection } from '../src/network/CoopConnection';
import type { IncomingMessage, OutgoingMessage } from '../src/network/Protocol';
import { PlayerController } from '../src/player/PlayerController';
import { Weapon } from '../src/weapons/Weapon';

export const TEST_PROFILE: DeviceProfile = {
  isMobile: false,
  isTouch: false,
  isLowMemory: false,
  pixelRatioLimit: 2,
  shadowQuality: 2,
  useReducedEffects: true,
  useTouchControls: false,
  anisotropyLimit: 8,
  log: {},
};

/** Arena views paint labels on canvases; node has no DOM. */
export function installCanvasDocument(): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
    fillRect: () => undefined, strokeRect: () => undefined, fillText: () => undefined,
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) },
  });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  };
}

type Side = 'host' | 'guest';

class FakeConnection {
  public onMessage: ((message: IncomingMessage) => void) | null = null;
  public onClose: (() => void) | null = null;
  public disposed = false;

  public constructor(private readonly link: LoopbackRelay, private readonly side: Side) {}

  public send(message: OutgoingMessage): void {
    if (!this.disposed) this.link.forward(this.side, message);
  }

  public dispose(): void {
    this.disposed = true;
    this.onMessage = null;
    this.onClose = null;
  }
}

/** In-memory relay with a JSON round trip, delivered on flush() for deterministic ordering. */
export class LoopbackRelay {
  public readonly host = new FakeConnection(this, 'host');
  public readonly guest = new FakeConnection(this, 'guest');
  public readonly log: Array<{ readonly from: Side; readonly message: OutgoingMessage }> = [];
  public connected = true;
  private readonly queue: Array<{ readonly to: FakeConnection; readonly payload: string }> = [];

  public forward(from: Side, message: OutgoingMessage): void {
    this.log.push({ from, message });
    if (!this.connected) return;
    this.queue.push({ to: from === 'host' ? this.guest : this.host, payload: JSON.stringify(message) });
  }

  public flush(): void {
    while (this.queue.length > 0) {
      const { to, payload } = this.queue.shift() as { to: FakeConnection; payload: string };
      to.onMessage?.(JSON.parse(payload) as IncomingMessage);
    }
  }

  /** Relay-generated presence message (peerJoined / peerLeft). */
  public presence(to: Side, type: 'peerJoined' | 'peerLeft'): void {
    (to === 'host' ? this.host : this.guest).onMessage?.({ type });
  }

  public sent(from: Side, type: string): OutgoingMessage[] {
    return this.log.filter((entry) => entry.from === from && entry.message.type === type).map((entry) => entry.message);
  }
}

function mockObject(): Record<PropertyKey, ReturnType<typeof vi.fn>> {
  return new Proxy({} as Record<PropertyKey, ReturnType<typeof vi.fn>>, {
    get: (target, key) => (target[key] ??= vi.fn()),
  });
}

export interface TestContext {
  readonly ctx: ModeContext;
  readonly player: PlayerController;
  readonly weapon: Weapon;
  readonly hud: Record<PropertyKey, ReturnType<typeof vi.fn>>;
}

export function makeContext(): TestContext {
  const player = new PlayerController(1);
  const weapon = new Weapon(WEAPON_DEFINITIONS.m1911);
  const hud = mockObject();
  const ctx = {
    scene: new THREE.Scene(),
    player,
    input: {},
    hud,
    audio: mockObject(),
    effects: mockObject(),
    stats: mockObject(),
    assets: { getZombieModels: () => ({}), getPlayerModel: () => null },
    profile: TEST_PROFILE,
    hitColliders: [] as THREE.Object3D[],
    lockPointer: vi.fn(),
    unlockPointer: vi.fn(),
    grantWeapon: vi.fn(() => false),
    canGrantWeapon: vi.fn(() => false),
    hasWeapon: vi.fn(() => false),
    getEquippedWeaponId: () => 'm1911',
    getEquippedWeapon: () => weapon,
    canRefillWeaponAmmo: vi.fn(() => false),
    refillWeaponAmmo: vi.fn(() => false),
    canRefillEquippedWeaponAmmo: vi.fn(() => false),
    refillEquippedWeaponAmmo: vi.fn(() => false),
    setWeaponInfiniteReserve: vi.fn(() => false),
    resetArsenal: vi.fn(),
    returnToMainMenu: vi.fn(),
  } as unknown as ModeContext;
  return { ctx, player, weapon, hud };
}

export interface CoopMatch {
  readonly relay: LoopbackRelay;
  readonly host: CoopHostMode;
  readonly guest: CoopGuestMode;
  readonly hostSide: TestContext;
  readonly guestSide: TestContext;
  /** Advances both clients (and the fake clock) and delivers every message. */
  step(dt?: number, frames?: number): void;
}

/** Two real co-op modes wired through the loopback relay. Requires fake timers for performance. */
export function makeMatch(): CoopMatch {
  const relay = new LoopbackRelay();
  const hostSide = makeContext();
  const guestSide = makeContext();
  const host = new CoopHostMode(relay.host as unknown as CoopConnection);
  const guest = new CoopGuestMode(relay.guest as unknown as CoopConnection);
  host.init(hostSide.ctx);
  guest.init(guestSide.ctx);
  const step = (dt = 1 / 30, frames = 1): void => {
    for (let frame = 0; frame < frames; frame++) {
      vi.advanceTimersByTime(dt * 1000);
      host.update(dt);
      relay.flush();
      guest.update(dt);
      relay.flush();
    }
  };
  return { relay, host, guest, hostSide, guestSide, step };
}

/** Puts a first-person rig on a floor spot facing -Z. */
export function placePlayer(player: PlayerController, x: number, z: number, floor = 0, baseY = 0): void {
  player.teleport(x, baseY + 1.7, z, floor);
  player.rig.updateMatrixWorld(true);
}
