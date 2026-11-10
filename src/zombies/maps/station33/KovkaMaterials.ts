import * as THREE from 'three';
import type { Station33Materials } from '../Station33Materials';

/**
 * The KOVKA chamber's own finishes, on top of the station's. Untextured
 * paints are plain materials; the vault reuses the service concrete's
 * baked map, so the chamber adds no texture to load.
 */
export interface KovkaMaterials {
  /** Service concrete seen from below, on the curved vault and its flat end infills alike. */
  readonly vaultConcrete: THREE.MeshStandardMaterial;
  /** Red-lead primer of the chamber's steelwork: rails, catwalks, ladders and masts. */
  readonly primer: THREE.MeshStandardMaterial;
  /** Faded blue-grey enamel of the reactor's yoke wheels and lattice ring. */
  readonly reactorSteel: THREE.MeshStandardMaterial;
  /** Dark steel lining the reactor's bore, seen from inside. */
  readonly boreLining: THREE.MeshStandardMaterial;
  /** Bare copper of the coils, busbars and electrodes. */
  readonly copper: THREE.MeshStandardMaterial;
}

export function createKovkaMaterials(materials: Station33Materials): KovkaMaterials {
  const vaultConcrete = materials.serviceConcrete.clone();
  vaultConcrete.name = 'station33_kovka_vault_concrete';
  vaultConcrete.side = THREE.DoubleSide;
  return {
    vaultConcrete,
    primer: new THREE.MeshStandardMaterial({ name: 'station33_kovka_primer', color: 0x5a2419, roughness: 0.72, metalness: 0.35 }),
    reactorSteel: new THREE.MeshStandardMaterial({ name: 'station33_kovka_reactor_steel', color: 0x3b4855, roughness: 0.5, metalness: 0.6 }),
    boreLining: new THREE.MeshStandardMaterial({ name: 'station33_kovka_bore', color: 0x191c1e, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }),
    copper: new THREE.MeshStandardMaterial({ name: 'station33_kovka_copper', color: 0x8a4b2c, roughness: 0.38, metalness: 0.85 }),
  };
}
