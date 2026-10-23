import * as THREE from 'three';
import { MANSION_BUNKER_CEILING_Y, MANSION_GROUND_CEILING_Y, type MansionAreaLight } from '../BurnedMansionConfig';
import type { MansionBuildContext } from './MansionBuildContext';

/** Chandelier arms; the last one snapped and hangs down without its shade. */
const CHANDELIER_ARMS = 4;
const ARM_LENGTH = 0.3;
const BULB_RADIUS = 0.055;

/**
 * Builds the visible fixture of one area light and returns the bulb's
 * material for the flicker controller. The bulb, its cord and its ceiling
 * mount stay standalone meshes (their map roles anchor tests and floor
 * culling); arms, shades and cages go to the static batch.
 */
export function buildLightFixture(context: MansionBuildContext, light: MansionAreaLight): THREE.MeshBasicMaterial {
  const ceilingY = light.floor === 0 ? MANSION_GROUND_CEILING_Y : MANSION_BUNKER_CEILING_Y;
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(BULB_RADIUS, 10, 8), bulbMaterial);
  bulb.position.set(light.x, light.y, light.z);
  bulb.userData.mapRole = 'damaged-bulb';
  context.group.add(bulb);
  if (light.floor === 0) addChandelier(context, light, ceilingY);
  else addCagedBulkhead(context, light, ceilingY);
  return bulbMaterial;
}

function addStandalone(context: MansionBuildContext, geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3, role: string): void {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.userData.mapRole = role;
  context.group.add(mesh);
}

/** Tarnished brass gasolier converted to electricity: rose, chain, hub, frosted bowl and tulip shades. */
function addChandelier(context: MansionBuildContext, light: MansionAreaLight, ceilingY: number): void {
  const { batch, materials } = context;
  const { x, y, z } = light;
  const hubY = y + 0.12;
  const chainBottom = hubY + 0.2;
  const chainLength = Math.max(0.05, ceilingY - chainBottom);
  addStandalone(context, new THREE.CylinderGeometry(0.14, 0.17, 0.05, 16), materials.brass, new THREE.Vector3(x, ceilingY - 0.025, z), 'light-mount');
  addStandalone(context, new THREE.CylinderGeometry(0.012, 0.012, chainLength, 6), materials.brass, new THREE.Vector3(x, chainBottom + chainLength / 2, z), 'light-cord');

  const stem = new THREE.CylinderGeometry(0.022, 0.03, chainBottom - hubY, 8);
  stem.translate(x, (hubY + chainBottom) / 2, z);
  batch.add(stem, materials.brass);
  const hub = new THREE.SphereGeometry(0.075, 12, 8).scale(1, 0.75, 1);
  hub.translate(x, hubY, z);
  batch.add(hub, materials.brass);
  // Frosted bowl cupping the red bulb from below.
  const bowl = new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  bowl.translate(x, y + 0.04, z);
  batch.add(bowl, materials.shadeGlass);
  const finial = new THREE.ConeGeometry(0.025, 0.08, 8).rotateX(Math.PI);
  finial.translate(x, y - 0.13, z);
  batch.add(finial, materials.brass);

  const phase = (x * 0.73 + z * 0.41) % (Math.PI * 2);
  for (let arm = 0; arm < CHANDELIER_ARMS; arm++) {
    const angle = phase + arm * (Math.PI * 2 / CHANDELIER_ARMS);
    const broken = arm === CHANDELIER_ARMS - 1;
    const droop = broken ? 0.9 : -0.12;
    const tipX = x + Math.cos(angle) * ARM_LENGTH * Math.cos(droop);
    const tipZ = z + Math.sin(angle) * ARM_LENGTH * Math.cos(droop);
    const tipY = hubY - Math.sin(droop) * ARM_LENGTH;
    const armGeometry = new THREE.CylinderGeometry(0.011, 0.011, ARM_LENGTH, 6).rotateZ(Math.PI / 2 - droop);
    armGeometry.rotateY(-angle);
    armGeometry.translate((x + tipX) / 2, (hubY + tipY) / 2, (z + tipZ) / 2);
    batch.add(armGeometry, materials.brass);
    if (broken) continue;
    const cup = new THREE.CylinderGeometry(0.035, 0.025, 0.04, 10);
    cup.translate(tipX, tipY + 0.02, tipZ);
    batch.add(cup, materials.brass);
    const tulip = new THREE.CylinderGeometry(0.065, 0.035, 0.1, 12, 1, true);
    tulip.translate(tipX, tipY + 0.09, tipZ);
    batch.add(tulip, materials.shadeGlass);
    const drop = new THREE.OctahedronGeometry(0.02).scale(0.7, 1.4, 0.7);
    drop.translate(tipX, tipY - 0.06, tipZ);
    batch.add(drop, materials.windowGlass);
  }
}

/** Bunker bulkhead: conduit drop, olive enamel shade and a wire cage around the bulb. */
function addCagedBulkhead(context: MansionBuildContext, light: MansionAreaLight, ceilingY: number): void {
  const { batch, materials } = context;
  const { x, y, z } = light;
  const shadeTop = y + 0.16;
  const conduitLength = Math.max(0.05, ceilingY - shadeTop);
  addStandalone(context, new THREE.BoxGeometry(0.22, 0.04, 0.22), materials.metal, new THREE.Vector3(x, ceilingY - 0.02, z), 'light-mount');
  addStandalone(context, new THREE.CylinderGeometry(0.018, 0.018, conduitLength, 6), materials.metal, new THREE.Vector3(x, shadeTop + conduitLength / 2, z), 'light-cord');

  const shade = new THREE.CylinderGeometry(0.05, 0.21, 0.13, 16, 1, true);
  shade.translate(x, y + 0.095, z);
  batch.add(shade, materials.enamelShade);
  const socket = new THREE.CylinderGeometry(0.035, 0.035, 0.08, 10);
  socket.translate(x, y + 0.1, z);
  batch.add(socket, materials.metal);
  for (let bar = 0; bar < 4; bar++) {
    const angle = bar * Math.PI / 2 + Math.PI / 4;
    batch.addBox(materials.metal, x + Math.cos(angle) * 0.1, y - 0.03, z + Math.sin(angle) * 0.1, 0.008, 0.2, 0.008);
  }
  const ring = new THREE.TorusGeometry(0.1, 0.006, 4, 16).rotateX(Math.PI / 2);
  ring.translate(x, y - 0.13, z);
  batch.add(ring, materials.metal);
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    batch.addBox(materials.metal, x, y - 0.13, z, 0.2, 0.008, 0.008, 0, angle, 0);
  }
}
