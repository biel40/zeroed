import * as THREE from 'three';
import { RING_DEFINITIONS, type RingId } from '../../../game/rings/RingCatalog';
import { addSolidProxy } from '../shared/SolidProxy';
import type { ArenaRingMachine, RingMachineDisplay } from '../ZombieArena';
import type { DieKathedraleBuildContext } from './DieKathedraleBuildContext';
import type { DieKathedraleRingSite } from './DieKathedraleRingSites';
import { archPoints, ribGeometries } from './GothicVault';

const RING_HEIGHT = 1.16;
const BASE_HALF_WIDTH = 0.46;

/** The cathedral's stone furniture for the shared ring purchase and recharge flow. */
export class DieKathedraleRingShrine implements ArenaRingMachine {
  public readonly id: string;
  public readonly ringId: RingId;
  public readonly position: { readonly x: number; readonly y: number; readonly z: number };
  public readonly floor: number;
  public readonly useRange = 1.8;
  public readonly lookDotMin = 0.55;
  public readonly powered = true;
  private readonly ring: THREE.Mesh;
  private readonly inlay: THREE.MeshBasicMaterial;
  private readonly tint: THREE.Color;

  public constructor(context: DieKathedraleBuildContext, site: DieKathedraleRingSite) {
    const { batch, group, materials } = context;
    const { x, floorY, z } = site;
    this.id = `shrine-${site.ringId}`;
    this.floor = site.floor;
    this.ringId = site.ringId;
    this.position = { x, y: floorY + RING_HEIGHT, z };
    this.tint = new THREE.Color(RING_DEFINITIONS[site.ringId].glowColor);
    this.inlay = new THREE.MeshBasicMaterial({ color: this.tint });
    const facing = Math.sign(site.approach.z - z);

    batch.addBox(materials.dressedStone, x, floorY + 0.085, z, 0.92, 0.17, 0.86);
    batch.add(new THREE.CylinderGeometry(0.24, 0.33, 0.73, 8).translate(x, floorY + 0.535, z), materials.wallStone);
    batch.addBox(materials.dressedStone, x, floorY + 0.935, z, 0.78, 0.15, 0.76);
    batch.addBox(materials.redCloth, x, floorY + 1.03, z, 0.34, 0.04, 0.29);
    const backZ = z - facing * 0.31;
    const arch = archPoints(x - 0.32, backZ, x + 0.32, backZ, floorY + 1.38, 0.39, 5);
    for (const rib of ribGeometries(arch, 0.085, 0.09)) batch.add(rib, materials.dressedStone);
    for (const side of [-1, 1]) {
      batch.addBox(materials.dressedStone, x + side * 0.32, floorY + 1.19, backZ, 0.09, 0.39, 0.09);
      batch.addBox(materials.wax, x + side * 0.29, floorY + 1.06, z, 0.055, 0.1, 0.055);
      batch.add(new THREE.SphereGeometry(0.024, 5, 4).scale(0.75, 1.55, 0.75)
        .translate(x + side * 0.29, floorY + 1.13, z), materials.flame);
    }
    addSolidProxy(context, this.id, { x: x - BASE_HALF_WIDTH, y: floorY, z: z - 0.43 },
      { x: x + BASE_HALF_WIDTH, y: floorY + 1.02, z: z + 0.43 }, 'concrete', 'top');

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.027, 7, 16), materials.gilt);
    this.ring.name = `shrine-ring:${site.ringId}`;
    this.ring.position.set(x, this.position.y, z);
    this.ring.rotation.set(-0.36, 0.24 * facing, 0);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.054), this.inlay);
    gem.position.y = 0.115;
    this.ring.add(gem);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.048), this.inlay);
    marker.position.set(x, floorY + 1.51, backZ + 0.025 * facing);
    group.add(this.ring, marker);
    this.setDisplay('stocked');
  }

  public setDisplay(display: RingMachineDisplay): void {
    this.ring.visible = display === 'stocked';
    const intensity = { stocked: 1.6, recharge: 0.8, empty: 0.17 }[display];
    this.inlay.color.copy(this.tint).multiplyScalar(intensity);
  }
}
