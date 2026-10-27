import * as THREE from 'three';
import { makeSoftDotTexture } from './doors/BuyableDoorVisual';
import type { Zombie } from './Zombie';

/** One reusable quest marker: a chest crystal, orbiting energy and an overhead diamond. No dynamic lights. */
export class StartupCrystalView {
  readonly group = new THREE.Group();
  private readonly coreMaterial = new THREE.MeshBasicMaterial({ color: 0xffd5b8, fog: false });
  private readonly redMaterial = new THREE.MeshBasicMaterial({ color: 0xff3020, fog: false });
  private readonly energyMaterial = new THREE.MeshBasicMaterial({
    color: 0xff3020, transparent: true, opacity: 0.65, depthWrite: false, fog: false,
  });
  private readonly crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), this.coreMaterial);
  private readonly cage = new THREE.Mesh(new THREE.OctahedronGeometry(0.25),
    new THREE.MeshBasicMaterial({ color: 0xff3020, wireframe: true, fog: false }));
  private readonly marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), this.redMaterial);
  private readonly rings: THREE.Mesh[] = [];
  private readonly sparks: THREE.Mesh[] = [];
  private readonly halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeSoftDotTexture(), color: 0xff1608, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  private readonly chestPosition = new THREE.Vector3();
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'startup-crystal-objective';
    this.crystal.name = 'startup-crystal-core';
    this.marker.name = 'startup-crystal-marker';
    this.crystal.add(this.cage);
    this.group.add(this.crystal, this.marker, this.halo);
    for (let index = 0; index < 2; index++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 5, 36), this.energyMaterial);
      ring.rotation.x = Math.PI / 2;
      this.rings.push(ring);
      this.group.add(ring);
    }
    const sparkGeometry = new THREE.OctahedronGeometry(0.055);
    for (let index = 0; index < 5; index++) {
      const spark = new THREE.Mesh(sparkGeometry, this.redMaterial);
      this.sparks.push(spark);
      this.group.add(spark);
    }
    scene.add(this.group);
    this.hide();
  }

  update(dt: number, position: Readonly<{ x: number; y: number; z: number }>, carrier: Zombie | null,
    returning: boolean): void {
    this.time += dt;
    this.group.visible = true;
    this.group.position.set(position.x, position.y, position.z);
    const bob = Math.sin(this.time * 3) * 0.08;
    this.crystal.visible = !returning;
    this.crystal.position.set(0, 0.65 + bob, 0);
    if (carrier) {
      carrier.torsoHitbox.getWorldPosition(this.chestPosition);
      this.crystal.position.copy(this.chestPosition).sub(this.group.position);
      this.crystal.position.x += Math.sin(carrier.group.rotation.y) * 0.4;
      this.crystal.position.z += Math.cos(carrier.group.rotation.y) * 0.4;
    }
    this.crystal.rotation.y = this.time * 1.8;
    this.marker.position.set(0, (carrier ? carrier.bodyHeight + 0.5 : returning ? 1.2 : 1.65) + bob, 0);
    this.marker.scale.set(0.7, 1.3, 0.7);
    this.marker.rotation.y = -this.time * 1.5;
    this.halo.position.copy(this.crystal.visible ? this.crystal.position : this.marker.position);
    this.halo.scale.setScalar((carrier ? 2.5 : 1.5) + Math.sin(this.time * 5) * 0.2);
    for (let index = 0; index < this.rings.length; index++) {
      const ring = this.rings[index];
      ring.visible = !returning;
      ring.position.y = carrier ? 0.65 + index * 0.65 : 0.14 + index * 0.12;
      ring.rotation.y = Math.sin(this.time * 2 + index) * 0.3;
    }
    for (let index = 0; index < this.sparks.length; index++) {
      const angle = this.time * 2 + index * Math.PI * 2 / this.sparks.length;
      this.sparks[index].visible = !returning;
      this.sparks[index].position.set(Math.cos(angle) * 0.55,
        (carrier ? 0.8 : 0.5) + Math.sin(angle * 2) * 0.3, Math.sin(angle) * 0.55);
    }
  }

  hide(): void {
    this.group.visible = false;
    this.time = 0;
  }
}
