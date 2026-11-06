import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../src/zombies/maps/shared/ProceduralNoise';
import { PROTOCOL33_SNOWFALL, PROTOCOL33_SURFACE_AMBIENCE, PROTOCOL33_SURFACE_Y } from '../src/zombies/maps/Station33Config';
import { snowflakePosition, SurfaceSnowfall, type Snowflake } from '../src/zombies/maps/station33/SurfaceSnowfall';

const { volume } = PROTOCOL33_SNOWFALL;
const FLAKE: Snowflake = { x: 10, y: PROTOCOL33_SURFACE_Y + 6, z: -90, speed: 0.9, phase: 1.3 };

function inside(position: THREE.Vector3): boolean {
  return position.x >= volume.minX && position.x <= volume.maxX
    && position.y >= volume.minY && position.y <= volume.maxY
    && position.z >= volume.minZ && position.z <= volume.maxZ;
}

function flakes(snowfall: THREE.Points): Float32Array {
  return (snowfall.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
}

describe('Station 33 surface snowfall', () => {
  it('keeps every flake inside the snowfall volume, however long it falls', () => {
    const out = new THREE.Vector3();
    for (let time = 0; time < 600; time += 3.7) {
      expect(inside(snowflakePosition(FLAKE, time, out))).toBe(true);
    }
  });

  it('lets a flake sink at its own speed and drift with the wind', () => {
    const start = snowflakePosition(FLAKE, 0, new THREE.Vector3());
    const later = snowflakePosition(FLAKE, 2, new THREE.Vector3());
    expect(start.y - later.y).toBeCloseTo(FLAKE.speed * 2, 6);
    const sway = PROTOCOL33_SNOWFALL.sway;
    expect(Math.abs(later.x - start.x - PROTOCOL33_SNOWFALL.wind.x * 2)).toBeLessThanOrEqual(2 * sway + 1e-9);
  });

  it('wraps a flake that reaches the ground back to the top of the volume', () => {
    const toGround = (FLAKE.y - volume.minY) / FLAKE.speed;
    const landed = snowflakePosition(FLAKE, toGround + 0.1, new THREE.Vector3());
    expect(landed.y).toBeGreaterThan(volume.maxY - FLAKE.speed * 0.1 - 1e-6);
  });

  it('is deterministic for an injected random source', () => {
    const group = new THREE.Group();
    const first = new SurfaceSnowfall(group, 'low', seededRandom(5));
    const second = new SurfaceSnowfall(new THREE.Group(), 'low', seededRandom(5));
    first.update(1.5, PROTOCOL33_SURFACE_Y + 1.7);
    second.update(1.5, PROTOCOL33_SURFACE_Y + 1.7);
    const points = group.getObjectByName('surface-snowfall') as THREE.Points;
    expect(points).toBeDefined();
    expect(flakes(points).length).toBe(PROTOCOL33_SNOWFALL.flakes.low * 3);
    expect(Array.from(flakes(points))).toEqual(Array.from(flakes(second.points)));
  });

  it('only falls (and draws) once the observer climbs towards the surface', () => {
    const snowfall = new SurfaceSnowfall(new THREE.Group(), 'low', seededRandom(9));
    snowfall.update(0.5, 1.72);
    expect(snowfall.points.visible).toBe(false);
    const frozen = Array.from(flakes(snowfall.points));
    snowfall.update(0.5, 1.72);
    expect(Array.from(flakes(snowfall.points))).toEqual(frozen);
    snowfall.update(0.5, PROTOCOL33_SURFACE_AMBIENCE.blend.from + 0.1);
    expect(snowfall.points.visible).toBe(true);
    expect(Array.from(flakes(snowfall.points))).not.toEqual(frozen);
  });

  it('starts over on reset', () => {
    const snowfall = new SurfaceSnowfall(new THREE.Group(), 'low', seededRandom(11));
    snowfall.update(0, PROTOCOL33_SURFACE_Y + 1.7);
    const initial = Array.from(flakes(snowfall.points));
    snowfall.update(4, PROTOCOL33_SURFACE_Y + 1.7);
    snowfall.reset();
    snowfall.update(0, PROTOCOL33_SURFACE_Y + 1.7);
    expect(Array.from(flakes(snowfall.points))).toEqual(initial);
  });
});
