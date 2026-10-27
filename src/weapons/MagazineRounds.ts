import * as THREE from 'three';
import { mergeAssemblies } from './ViewModelBatching';
import { cylinderZ } from './ProfileGeometry';
import type { Weapon } from './Weapon';
import type { ReloadAnimConfig } from './WeaponTypes';

/**
 * Cartridge dimensions in meters, case head to bullet tip along -Z. A
 * bottleneck rifle case narrows over `shoulderLength`; a straight-walled
 * pistol case has none.
 */
export interface CartridgeSpec {
  readonly caseRadius: number;
  readonly caseLength: number;
  readonly shoulderLength: number;
  readonly bulletRadius: number;
  readonly bulletLength: number;
  /** Radius at the bullet tip: near zero for a spitzer, larger for a round nose. */
  readonly tipRadius: number;
}

/** Cartridges of the firearms that show their rounds, by caliber. */
export const CARTRIDGES = {
  nato556: { caseRadius: 0.0048, caseLength: 0.036, shoulderLength: 0.004, bulletRadius: 0.0029, bulletLength: 0.017, tipRadius: 0.0006 },
  soviet762x39: { caseRadius: 0.0056, caseLength: 0.033, shoulderLength: 0.004, bulletRadius: 0.0039, bulletLength: 0.018, tipRadius: 0.0008 },
  nato762: { caseRadius: 0.006, caseLength: 0.045, shoulderLength: 0.006, bulletRadius: 0.0042, bulletLength: 0.017, tipRadius: 0.0008 },
  bmg50: { caseRadius: 0.01, caseLength: 0.096, shoulderLength: 0.012, bulletRadius: 0.0065, bulletLength: 0.027, tipRadius: 0.001 },
  parabellum9: { caseRadius: 0.0049, caseLength: 0.019, shoulderLength: 0, bulletRadius: 0.0045, bulletLength: 0.01, tipRadius: 0.0025 },
  tokarev762x25: { caseRadius: 0.0049, caseLength: 0.023, shoulderLength: 0.002, bulletRadius: 0.0039, bulletLength: 0.008, tipRadius: 0.0018 },
} as const satisfies Record<string, CartridgeSpec>;

/** Where one cartridge rides: magazine-local [x, y] of its axis and the z of its case head. */
export type CartridgeSeat = readonly [x: number, y: number, rearZ: number];

/**
 * Feed-lip seats of a double-stack magazine: the top round high on one
 * side, the next lower on the other, both proud of the magazine top so
 * they show once it is out of the well.
 */
export function feedLipSeats(spec: CartridgeSpec, topY: number, rearZ: number, stagger: number): CartridgeSeat[] {
  const r = spec.caseRadius;
  return [
    [stagger, topY + r * 0.6, rearZ],
    [-stagger, topY - r * 0.05, rearZ],
  ];
}

/**
 * The rounds riding a magazine: one group per cartridge, top round first,
 * bullets toward -Z. Each view model owns its materials (the view-model
 * depth patch must never reach world objects), so brass and bullet are passed in.
 */
export function buildMagazineRounds(
  name: string,
  spec: CartridgeSpec,
  seats: readonly CartridgeSeat[],
  brass: THREE.Material,
  bullet: THREE.Material,
): THREE.Group {
  const rounds = new THREE.Group();
  rounds.name = name;
  // Drawn only while the magazine is out of the well (see roundsInViewMagazine).
  rounds.visible = false;
  const { caseRadius, caseLength, shoulderLength, bulletRadius, bulletLength, tipRadius } = spec;
  for (const [x, y, rearZ] of seats) {
    const round = new THREE.Group();
    round.name = `${name}-round`;
    round.position.set(x, y, rearZ);
    const caseBody = new THREE.Mesh(cylinderZ(caseRadius, caseRadius, caseLength, 12), brass);
    caseBody.position.z = -caseLength / 2;
    round.add(caseBody);
    if (shoulderLength > 0) {
      const shoulder = new THREE.Mesh(cylinderZ(caseRadius, bulletRadius, shoulderLength, 12), brass);
      shoulder.position.z = -caseLength - shoulderLength / 2;
      round.add(shoulder);
    }
    const tip = new THREE.Mesh(cylinderZ(bulletRadius, tipRadius, bulletLength, 12), bullet);
    tip.position.z = -caseLength - shoulderLength - bulletLength / 2;
    round.add(tip);
    rounds.add(round);
  }
  // One draw call per material and cartridge; each round stays its own pivot.
  mergeAssemblies(rounds);
  return rounds;
}

/** Brass and copper-jacket materials for one view model's cartridges. */
export function cartridgeMaterials(): { brass: THREE.MeshStandardMaterial; copper: THREE.MeshStandardMaterial } {
  return {
    brass: new THREE.MeshStandardMaterial({ color: 0xb8893c, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.4 }),
    copper: new THREE.MeshStandardMaterial({ color: 0x9a5a34, metalness: 0.85, roughness: 0.32, envMapIntensity: 1.3 }),
  };
}

/**
 * Rounds to draw on the view-model magazine this frame: the loaded ones while
 * it can leave the well (reload, inspection), or a full magazine once the
 * fresh one is brought in (the ammunition itself is only granted when the
 * reload completes). A seated magazine hides its rounds inside the receiver,
 * so none are drawn.
 */
export function roundsInViewMagazine(weapon: Weapon, reload: ReloadAnimConfig): number {
  if (weapon.state === 'reloading') {
    return weapon.stateProgress >= reload.magIn ? weapon.definition.magazineSize : weapon.ammoInMagazine;
  }
  return weapon.inspectProgress !== null ? weapon.ammoInMagazine : 0;
}

/** Shows the top `count` cartridges of a rounds group and hides the rest. */
export function showRounds(rounds: THREE.Object3D, count: number): void {
  rounds.visible = count > 0;
  rounds.children.forEach((round, index) => {
    round.visible = index < count;
  });
}
