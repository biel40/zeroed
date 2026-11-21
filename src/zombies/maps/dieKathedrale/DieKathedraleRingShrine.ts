import * as THREE from 'three';
import { RING_DEFINITIONS, type RingId } from '../../../game/rings/RingCatalog';
import { addSolidProxy } from '../shared/SolidProxy';
import type { ArenaRingMachine, RingMachineDisplay } from '../ZombieArena';
import type { DieKathedraleBuildContext } from './DieKathedraleBuildContext';
import type { DieKathedraleRingSite } from './DieKathedraleRingSites';
import { archPoints, ribGeometries } from './GothicVault';

const RING_HEIGHT = 1.16;
const BASE_HALF_WIDTH = 0.46;
const BASE_HALF_DEPTH = 0.43;

/**
 * The cathedral's stone furniture for the shared ring purchase and recharge flow.
 * It faces its site's approach along the dominant axis, its back to the wall behind.
 */
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

    const facesX = Math.abs(site.approach.x - x) > Math.abs(site.approach.z - z);
    const facing = facesX ? Math.sign(site.approach.x - x) : Math.sign(site.approach.z - z);
    // Local frame: `along` runs towards the approach, `across` along the wall behind.
    const point = (across: number, along: number): { x: number; z: number } => (facesX
      ? { x: x + along * facing, z: z + across }
      : { x: x + across, z: z + along * facing });
    const box = (material: THREE.Material, across: number, along: number, y: number, width: number, height: number, depth: number): void => {
      const at = point(across, along);
      batch.addBox(material, at.x, y, at.z, facesX ? depth : width, height, facesX ? width : depth);
    };

    box(materials.dressedStone, 0, 0, floorY + 0.085, 0.92, 0.17, 0.86);
    batch.add(new THREE.CylinderGeometry(0.24, 0.33, 0.73, 8).translate(x, floorY + 0.535, z), materials.wallStone);
    box(materials.dressedStone, 0, 0, floorY + 0.935, 0.78, 0.15, 0.76);
    box(materials.redCloth, 0, 0, floorY + 1.03, 0.34, 0.04, 0.29);
    const archStart = point(-0.32, -0.31);
    const archEnd = point(0.32, -0.31);
    const arch = archPoints(archStart.x, archStart.z, archEnd.x, archEnd.z, floorY + 1.38, 0.39, 5);
    for (const rib of ribGeometries(arch, 0.085, 0.09)) batch.add(rib, materials.dressedStone);
    for (const side of [-1, 1]) {
      box(materials.dressedStone, side * 0.32, -0.31, floorY + 1.19, 0.09, 0.39, 0.09);
      box(materials.wax, side * 0.29, 0, floorY + 1.06, 0.055, 0.1, 0.055);
      const flame = point(side * 0.29, 0);
      batch.add(new THREE.SphereGeometry(0.024, 5, 4).scale(0.75, 1.55, 0.75)
        .translate(flame.x, floorY + 1.13, flame.z), materials.flame);
    }
    const halfX = facesX ? BASE_HALF_DEPTH : BASE_HALF_WIDTH;
    const halfZ = facesX ? BASE_HALF_WIDTH : BASE_HALF_DEPTH;
    addSolidProxy(context, this.id, { x: x - halfX, y: floorY, z: z - halfZ },
      { x: x + halfX, y: floorY + 1.02, z: z + halfZ }, 'concrete', 'top');

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.104, 0.027, 7, 16), materials.gilt);
    this.ring.name = `shrine-ring:${site.ringId}`;
    this.ring.position.set(x, this.position.y, z);
    const yaw = facesX ? facing * Math.PI / 2 : (facing < 0 ? Math.PI : 0);
    this.ring.rotation.set(-0.36, yaw + 0.24, 0, 'YXZ');
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.054), this.inlay);
    gem.position.y = 0.115;
    this.ring.add(gem);
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.048), this.inlay);
    const markerAt = point(0, -0.285);
    marker.position.set(markerAt.x, floorY + 1.51, markerAt.z);
    group.add(this.ring, marker);
    this.setDisplay('stocked');
  }

  public setDisplay(display: RingMachineDisplay): void {
    this.ring.visible = display === 'stocked';
    const intensity = { stocked: 1.6, recharge: 0.8, empty: 0.17 }[display];
    this.inlay.color.copy(this.tint).multiplyScalar(intensity);
  }
}
