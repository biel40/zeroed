import * as THREE from 'three';
import { makeSoftDotTexture } from '../../doors/BuyableDoorVisual';
import type { MapPower } from '../shared/MapPower';
import { STATION33_DOORS, STATION33_WALL_THICKNESS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

const HATCH = STATION33_DOORS.find((door) => door.zone === 'kovka')!;
/** Over the plate on the machine-room side of the hatch. */
const LAMP_Y = 2.95;
const SEALED_COLOR = new THREE.Color(0xff2412);
const OPEN_COLOR = new THREE.Color(0x3cff7a);

/**
 * The KOVKA hatch's status lamp, on the machine-room side where the player
 * meets it first: it pulses red while the hatch is sealed (no power) and
 * holds a steady green once the main switch feeds the forge. Emissive
 * material and a halo, never a light.
 */
export class KovkaHatchLamp {
  private readonly lens: THREE.MeshBasicMaterial;
  private readonly halo: THREE.SpriteMaterial;
  private time = 0;

  public constructor(context: Station33BuildContext, private readonly power: MapPower) {
    const { batch, materials, group } = context;
    const out = -(STATION33_WALL_THICKNESS / 2 + 0.06);
    const x = HATCH.x + HATCH.outwardX * out;
    const z = HATCH.z + HATCH.outwardZ * out;
    const yaw = Math.atan2(-HATCH.outwardX, -HATCH.outwardZ);
    batch.addBox(materials.greySteel, HATCH.x - HATCH.outwardX * (STATION33_WALL_THICKNESS / 2 + 0.03), LAMP_Y, z, 0.06, 0.28, 0.28, 0, yaw, 0);
    this.lens = new THREE.MeshBasicMaterial({ name: 'kovka_hatch_lamp', color: SEALED_COLOR.clone() });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), this.lens);
    lens.name = 'kovka-hatch-lamp';
    lens.position.set(x, LAMP_Y, z);
    this.halo = new THREE.SpriteMaterial({
      name: 'kovka_hatch_halo', map: makeSoftDotTexture(), color: SEALED_COLOR.clone(), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    });
    const halo = new THREE.Sprite(this.halo);
    halo.position.copy(lens.position);
    halo.scale.setScalar(0.9);
    group.add(lens, halo);
    this.update(0);
  }

  /** True while the lamp shows the hatch is open for sale. */
  public get green(): boolean {
    return this.power.on;
  }

  public update(dt: number): void {
    this.time += Math.max(0, dt);
    const color = this.power.on ? OPEN_COLOR : SEALED_COLOR;
    const level = this.power.on ? 1 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * 4));
    this.lens.color.copy(color).multiplyScalar(level);
    this.halo.color.copy(color);
    this.halo.opacity = 0.55 * level;
  }

  public reset(): void {
    this.time = 0;
    this.update(0);
  }
}
