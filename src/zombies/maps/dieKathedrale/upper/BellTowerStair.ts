import * as THREE from 'three';
import { EYE_HEIGHT, type FloorTransitionZone, type StairCurve, type StairRamp } from '../../../../player/PlayerController';
import type { PlayerBounds } from '../../ZombieArena';
import { BELL_STAIR, UPPER_FLOOR, UPPER_FLOOR_Y, UPPER_PLAYER_BOUNDS } from './UpperCathedralConfig';

const { centerX, centerZ, radius, innerRadius, outerRadius, sweep, lowerLandingX, upperLandingZ, landingHalfWidth } = BELL_STAIR;
const TOP_ANGLE = -Math.PI / 2;
const TWO_PI = 2 * Math.PI;
const Y_PER_RADIAN = UPPER_FLOOR_Y / sweep;
const HEIGHT_TOLERANCE = 0.85;
const LANDING_ANGLE = 0.35;
const STEER_ANGLE = 0.26;
const EXIT_ANGLE = 0.085;
const CENTER_X_BOTTOM = centerX + radius;
const CENTER_Z_TOP = centerZ - radius;

/** Unwrap the horizontal bearing onto the turn nearest the body's feet. */
function flightAngle(x: number, z: number, feetY: number): number | null {
  const offsetX = x - centerX;
  const offsetZ = z - centerZ;
  const radialSq = offsetX * offsetX + offsetZ * offsetZ;
  if (radialSq < innerRadius * innerRadius || radialSq > outerRadius * outerRadius) return null;
  const bearing = Math.atan2(offsetZ, offsetX);
  const angle = bearing + Math.round((feetY / Y_PER_RADIAN - bearing) / TWO_PI) * TWO_PI;
  if (angle < -LANDING_ANGLE || angle > sweep + LANDING_ANGLE) return null;
  return Math.abs(heightAt(angle) - feetY) <= HEIGHT_TOLERANCE ? angle : null;
}

function heightAt(angle: number): number {
  return Math.min(UPPER_FLOOR_Y, Math.max(0, angle * Y_PER_RADIAN));
}

function onLowerLanding(x: number, z: number, y: number): boolean {
  return Math.abs(y) <= HEIGHT_TOLERANCE && x >= CENTER_X_BOTTOM && Math.abs(z - centerZ) <= landingHalfWidth;
}

function onUpperLanding(x: number, z: number, y: number): boolean {
  return Math.abs(y - UPPER_FLOOR_Y) <= HEIGHT_TOLERANCE && z <= CENTER_Z_TOP && Math.abs(x - centerX) <= landingHalfWidth;
}

function upperSide(y: number): boolean {
  return y > UPPER_FLOOR_Y / 2;
}

const bellSpiral: StairCurve = {
  groundAt(x, z, feetY) {
    const angle = flightAngle(x, z, feetY);
    if (angle !== null) return heightAt(angle);
    if (onLowerLanding(x, z, feetY)) return 0;
    if (onUpperLanding(x, z, feetY)) return UPPER_FLOOR_Y;
    return null;
  },

  waypoint(x, y, z, targetX, targetY, targetZ, out) {
    const angle = flightAngle(x, z, y);
    const targetAngle = flightAngle(targetX, targetZ, targetY);
    const targetAbove = upperSide(targetY);
    const endpoint = targetAbove ? sweep : 0;
    const atLowerMouth = onLowerLanding(x, z, y) && x > CENTER_X_BOTTOM + 0.15;
    const atUpperMouth = onUpperLanding(x, z, y) && z < CENTER_Z_TOP - 0.15;

    if (angle === null || atLowerMouth || atUpperMouth) {
      // Walk clear of the mouth before steering laterally around the next room.
      // A direct heading toward a distant goal can aim straight back into the shaft.
      if (atLowerMouth && targetAngle === null && !targetAbove) {
        if (onLowerLanding(targetX, targetZ, targetY)) return void out.set(targetX, targetY, targetZ);
        return void out.set(lowerLandingX + 0.2, 0, centerZ);
      }
      if (atUpperMouth && targetAngle === null && targetAbove) {
        if (onUpperLanding(targetX, targetZ, targetY)) return void out.set(targetX, targetY, targetZ);
        return void out.set(centerX, UPPER_FLOOR_Y, upperLandingZ - 0.2);
      }
      if (upperSide(y)) return void out.set(centerX, UPPER_FLOOR_Y, CENTER_Z_TOP);
      return void out.set(CENTER_X_BOTTOM, 0, centerZ);
    }

    if (targetAngle === null && Math.abs(angle - endpoint) <= EXIT_ANGLE) {
      if (targetAbove) return void out.set(centerX, UPPER_FLOOR_Y, upperLandingZ);
      return void out.set(lowerLandingX, 0, centerZ);
    }
    if (targetAngle !== null && Math.abs(targetAngle - angle) <= STEER_ANGLE) return void out.set(targetX, targetY, targetZ);

    const delta = (targetAngle ?? endpoint) - angle;
    const nextAngle = angle + THREE.MathUtils.clamp(delta, -STEER_ANGLE, STEER_ANGLE);
    const nextBearing = nextAngle === sweep ? TOP_ANGLE : nextAngle;
    out.set(centerX + Math.cos(nextBearing) * radius, heightAt(nextAngle), centerZ + Math.sin(nextBearing) * radius);
  },
};

/** Floor changes happen on the two level landings, outside the overlapping stone flights. */
export function bellTowerTransitions(groundBounds: PlayerBounds): ReadonlyArray<FloorTransitionZone> {
  const ramp: StairRamp = {
    box: new THREE.Box3(
      new THREE.Vector3(centerX - outerRadius, 0, upperLandingZ),
      new THREE.Vector3(lowerLandingX, UPPER_FLOOR_Y + EYE_HEIGHT, centerZ + outerRadius),
    ),
    bottom: { x: lowerLandingX, y: 0, z: centerZ },
    top: { x: centerX, y: UPPER_FLOOR_Y, z: upperLandingZ },
    curve: bellSpiral,
  };
  return [
    {
      box: new THREE.Box3(new THREE.Vector3(centerX - landingHalfWidth, UPPER_FLOOR_Y - 0.1, upperLandingZ - 0.12),
        new THREE.Vector3(centerX + landingHalfWidth, UPPER_FLOOR_Y + 3, BELL_STAIR.upperMouthZ - 0.03)),
      sourceFloor: 0, targetFloor: UPPER_FLOOR, targetY: UPPER_FLOOR_Y + EYE_HEIGHT, bounds: UPPER_PLAYER_BOUNDS, ramp,
    },
    {
      box: new THREE.Box3(new THREE.Vector3(BELL_STAIR.lowerMouthX + 0.03, -0.1, centerZ - landingHalfWidth),
        new THREE.Vector3(lowerLandingX + 0.12, 3, centerZ + landingHalfWidth)),
      sourceFloor: UPPER_FLOOR, targetFloor: 0, targetY: EYE_HEIGHT, bounds: groundBounds, ramp,
    },
  ];
}
