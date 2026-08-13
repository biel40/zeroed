import { describe, expect, it } from 'vitest';
import type { Input } from '../src/player/Input';
import { PLAYER_BOUNDS, PlayerController } from '../src/player/PlayerController';
import type { Weapon } from '../src/weapons/Weapon';

const DT = 1 / 60;

/** Only what PlayerController.update reads from Input. */
function inputStub(keys: ReadonlySet<string>, axes: { x?: number; y?: number } = {}): Input {
  return {
    isDown: (code: string) => keys.has(code),
    wasPressed: () => false,
    mouseDeltaX: 0,
    mouseDeltaY: 0,
    moveAxisX: axes.x ?? 0,
    moveAxisY: axes.y ?? 0,
  } as unknown as Input;
}

/** Only what PlayerController.update reads from Weapon. */
const weaponStub = {
  definition: { ads: { fov: 60, sensitivity: 1 }, moveSpeedMultiplier: 1 },
  adsAlpha: 0,
  recoil: { pitch: 0, yaw: 0 },
} as unknown as Weapon;

function step(player: PlayerController, input: Input, seconds: number): void {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) player.update(DT, input, weaponStub);
}

describe('PlayerController movement bounds', () => {
  it('the bench is a hard frontier: walking forward never crosses it', () => {
    const player = new PlayerController(1);
    // Sprint straight at the lanes far longer than needed to reach them.
    step(player, inputStub(new Set(['KeyW'])), 6);
    // The bench back edge is z = 1.6; the player must stay behind it.
    expect(player.rig.position.z).toBeGreaterThanOrEqual(1.6);
    expect(player.rig.position.z).toBeCloseTo(PLAYER_BOUNDS.minZ, 3);
  });

  it('snaps a position beyond the bench line back into the walkable area', () => {
    const player = new PlayerController(1);
    player.rig.position.z = 0; // somehow past the bench (teleport, bug, ...)
    step(player, inputStub(new Set()), DT * 2);
    expect(player.rig.position.z).toBeGreaterThanOrEqual(PLAYER_BOUNDS.minZ);
  });

  it('keeps the player between the side walls', () => {
    const player = new PlayerController(1);
    step(player, inputStub(new Set(['KeyA'])), 6);
    expect(player.rig.position.x).toBeCloseTo(PLAYER_BOUNDS.minX, 3);

    const other = new PlayerController(1);
    step(other, inputStub(new Set(['KeyD'])), 6);
    expect(other.rig.position.x).toBeCloseTo(PLAYER_BOUNDS.maxX, 3);
  });

  it('keeps the player in front of the back wall', () => {
    const player = new PlayerController(1);
    step(player, inputStub(new Set(['KeyS'])), 6);
    expect(player.rig.position.z).toBeCloseTo(PLAYER_BOUNDS.maxZ, 3);
  });
});

describe('PlayerController analog movement (virtual joystick)', () => {
  it('half stick deflection moves the player slower than full deflection', () => {
    const full = new PlayerController(1);
    step(full, inputStub(new Set(), { y: 1 }), 0.5);
    const half = new PlayerController(1);
    step(half, inputStub(new Set(), { y: 0.5 }), 0.5);
    // Forward is -z: the slower player stays closer to the spawn z.
    expect(half.rig.position.z).toBeGreaterThan(full.rig.position.z);
    expect(full.rig.position.z).toBeGreaterThan(PLAYER_BOUNDS.minZ);
  });

  it('clamps keyboard + joystick combined input to full deflection', () => {
    const blended = new PlayerController(1);
    step(blended, inputStub(new Set(['KeyW']), { y: 1 }), 0.5);
    const keysOnly = new PlayerController(1);
    step(keysOnly, inputStub(new Set(['KeyW'])), 0.5);
    expect(blended.rig.position.z).toBeCloseTo(keysOnly.rig.position.z, 5);
  });

  it('drives diagonal movement from stick axes alone', () => {
    const player = new PlayerController(1);
    step(player, inputStub(new Set(), { x: 1, y: 1 }), 0.5);
    expect(player.rig.position.x).toBeGreaterThan(0);
    expect(player.rig.position.z).toBeLessThan(4);
  });
});
