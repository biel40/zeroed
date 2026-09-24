import { afterEach, describe, expect, it, vi } from 'vitest';
import { lerpAngle, RemoteClock, SnapshotBuffer, type SampleBracket } from '../src/network/Interpolation';
import { parseGuestMessage, parseHostMessage, type PlayerNetState } from '../src/network/Protocol';
import { ShotValidator } from '../src/network/ShotValidator';
import { RemotePlayer } from '../src/rendering/RemotePlayer';
import type { RemoteAvatar, RemoteAvatarMotion } from '../src/rendering/RemotePlayerAvatar';
import { WindowBarrier } from '../src/zombies/barriers/WindowBarrier';
import * as THREE from 'three';

interface Sample { readonly t: number; readonly x: number }

function playerState(t: number, x: number, overrides: Partial<PlayerNetState> = {}): PlayerNetState {
  return { t, x, y: 1.7, z: 0, yaw: 0, pitch: 0, floor: 0, weapon: 'm1911', ads: false, reloading: false, ...overrides };
}

afterEach(() => { vi.useRealTimers(); });

describe('snapshot interpolation', () => {
  it('brackets render time between samples and holds at the edges without extrapolating', () => {
    const buffer = new SnapshotBuffer<Sample>(4);
    const out: SampleBracket<Sample> = { from: null, to: null, alpha: 0 };
    expect(buffer.sample(0, out)).toBe(false);
    buffer.push({ t: 1, x: 0 });
    buffer.push({ t: 2, x: 10 });
    buffer.sample(1.25, out);
    expect(out.from?.x).toBe(0);
    expect(out.to?.x).toBe(10);
    expect(out.alpha).toBeCloseTo(0.25);
    buffer.sample(5, out);
    expect(out.from?.x).toBe(10);
    expect(out.to?.x).toBe(10);
    buffer.sample(0, out);
    expect(out.from?.x).toBe(0);
  });

  it('drops stale or out-of-order samples and stays bounded', () => {
    const buffer = new SnapshotBuffer<Sample>(3);
    expect(buffer.push({ t: 2, x: 0 })).toBe(true);
    expect(buffer.push({ t: 1, x: 99 })).toBe(false);
    expect(buffer.push({ t: 2, x: 99 })).toBe(false);
    for (let t = 3; t < 10; t++) buffer.push({ t, x: t });
    expect(buffer.size).toBe(3);
    expect(buffer.latest?.t).toBe(9);
  });

  it('maps the remote clock onto local time with a fixed delay and resyncs after a gap', () => {
    let now = 100;
    const clock = new RemoteClock(0.1, () => now);
    clock.observe(5);
    expect(clock.renderTime).toBeCloseTo(4.9);
    now = 100.05;
    clock.observe(5.07);
    expect(clock.renderTime).toBeGreaterThan(4.94);
    expect(clock.renderTime).toBeLessThan(4.97);
    clock.observe(50);
    expect(clock.renderTime).toBeCloseTo(49.9);
  });

  it('turns through the shortest arc', () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1);
    expect(lerpAngle(0, 1, 0.5)).toBeCloseTo(0.5);
  });

  it('moves a remote player smoothly and derives gait from real speed', () => {
    vi.useFakeTimers({ toFake: ['performance'] });
    const motions: RemoteAvatarMotion[] = [];
    const avatar: RemoteAvatar = {
      group: new THREE.Group(),
      isSkinned: false,
      update: (_dt, motion) => { motions.push({ ...motion }); },
      playFire: vi.fn(),
      dispose: vi.fn(),
    };
    const remote = new RemotePlayer(avatar);
    const start = performance.now() / 1000;
    const xs: number[] = [];
    for (let frame = 0; frame < 60; frame++) {
      if (frame % 3 === 0) remote.push(playerState(start + frame / 60, frame / 60 * 4));
      vi.advanceTimersByTime(1000 / 60);
      remote.update(1 / 60);
      xs.push(remote.root.position.x);
    }
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeLessThan(0.2);
    expect(remote.root.position.y).toBeCloseTo(0);
    expect(motions.at(-1)?.speed).toBeGreaterThan(2);
    expect(remote.root.visible).toBe(true);
    remote.clear();
    expect(remote.root.visible).toBe(false);
  });
});

describe('remote shot validation', () => {
  it('bounds sustained fire rate and grants one hit per accepted shot', () => {
    const shots = new ShotValidator(2, 1);
    expect(shots.tryShoot(0)).toBe(true);
    expect(shots.tryShoot(0)).toBe(true);
    expect(shots.tryShoot(0)).toBe(false);
    expect(shots.tryShoot(1)).toBe(true);
    expect(shots.tryConsumeHit(1)).toBe(true);
    expect(shots.tryConsumeHit(1)).toBe(true);
    expect(shots.tryConsumeHit(1)).toBe(true);
    expect(shots.tryConsumeHit(1)).toBe(false);
  });

  it('expires hit credits that trail their shot for too long', () => {
    const shots = new ShotValidator(4, 4);
    shots.tryShoot(0);
    expect(shots.tryConsumeHit(10)).toBe(false);
  });
});

describe('protocol boundary', () => {
  it('accepts well-formed guest requests and rejects malformed ones', () => {
    expect(parseGuestMessage({ type: 'doorPurchase', doorId: 'to-dining' })).toEqual({ type: 'doorPurchase', doorId: 'to-dining' });
    expect(parseGuestMessage({ type: 'doorPurchase', doorId: 7 })).toBeNull();
    expect(parseGuestMessage({ type: 'playerState', state: playerState(1, 0) })?.type).toBe('playerState');
    expect(parseGuestMessage({ type: 'playerState', state: playerState(1, Number.NaN) })).toBeNull();
    expect(parseGuestMessage({ type: 'playerState', state: playerState(1, 0, { weapon: 'bazooka' as never }) })).toBeNull();
    expect(parseGuestMessage({ type: 'zombieHitClaim', zombieId: 3, part: 'leg' })).toBeNull();
    expect(parseGuestMessage({ type: 'matchState', state: {} })).toBeNull();
  });

  it('never lets a guest message pose as a host message', () => {
    expect(parseHostMessage({ type: 'zombieHitClaim', zombieId: 3, part: 'head' })).toBeNull();
    expect(parseHostMessage({ type: 'doorOpened', doorId: 'to-dining', buyer: 'guest' })?.type).toBe('doorOpened');
    expect(parseHostMessage({ type: 'doorOpened', doorId: 'to-dining', buyer: 'someone' })).toBeNull();
  });
});

describe('barrier replication', () => {
  it('adopts host board health and bumps the revisions the view animates from', () => {
    const barrier = new WindowBarrier('w', 0, 0, 0, 1, { boardCount: 3, boardHp: 2, repairInterval: 1, repairRewardCap: 4 });
    const revision = barrier.boards[0].revision;
    barrier.applyReplicatedBoards([0, 1, 2]);
    expect(barrier.boards.map((board) => board.hp)).toEqual([0, 1, 2]);
    expect(barrier.boards[0].revision).toBe(revision + 1);
    expect(barrier.state).toBe('damaged');
    barrier.applyReplicatedBoards([0, 0, 0]);
    expect(barrier.isOpen).toBe(true);
    barrier.applyReplicatedBoards([2, 2, 2]);
    expect(barrier.state).toBe('intact');
  });
});
