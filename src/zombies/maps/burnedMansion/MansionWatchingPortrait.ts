import * as THREE from 'three';
import { MANSION_BANQUET_HALL } from '../BurnedMansionConfig';
import { decalTexture } from '../shared/ProceduralSurface';
import type { MansionBuildContext } from './MansionBuildContext';
import { OFFICER_CANVAS_ASPECT, OFFICER_EYES } from './MansionPainters';
import { addFramedPicture, mansionWallFace, onFace } from './MansionWallMounts';

const WIDTH = 0.98;
const HEIGHT = 1.3;
const BORDER = 0.1;
const CANVAS_WIDTH = WIDTH - BORDER * 2 + 0.01;
const CANVAS_HEIGHT = HEIGHT - BORDER * 2 + 0.01;

/** The painted sockets stay still; only their red pinpoints follow the local observer. */
export class MansionWatchingPortrait {
  private readonly eyes = new THREE.Group();
  private readonly observer = new THREE.Vector3();
  private readonly offset = new THREE.Vector2();
  private readonly target = new THREE.Vector2();
  private readonly eyeY = OFFICER_EYES.y / OFFICER_CANVAS_ASPECT * CANVAS_HEIGHT;
  private readonly pupils: THREE.Mesh[] = [];

  constructor(context: MansionBuildContext) {
    const face = mansionWallFace('banquet-chimney');
    const along = MANSION_BANQUET_HALL.chimney.z;
    addFramedPicture(context, face, along, 2.1, WIDTH, HEIGHT, context.materials.officerPortrait, 0.03, BORDER);
    this.eyes.name = 'mansion-portrait-eyes';
    this.eyes.applyMatrix4(onFace(face, along, 2.1, 0.004, 0.03));
    const size = 64;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const radius = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 0.06;
        const core = 1 - THREE.MathUtils.smoothstep(radius, 0.008, 0.014);
        const index = (y * size + x) * 4;
        data[index] = 255;
        data[index + 1] = Math.round(core * 42);
        data[index + 2] = Math.round(core * 24);
        data[index + 3] = Math.round(Math.max(core, (1 - Math.min(radius / 0.03, 1)) * 0.3) * 255);
      }
    }
    const material = new THREE.MeshBasicMaterial({
      name: 'officer_portrait_pupils',
      map: decalTexture(data, size),
      color: new THREE.Color().setRGB(2.4, 1, 1),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const geometry = new THREE.PlaneGeometry(0.06 * CANVAS_WIDTH, 0.06 / OFFICER_CANVAS_ASPECT * CANVAS_HEIGHT);
    for (const side of [-1, 1]) {
      const pupil = new THREE.Mesh(geometry, material);
      pupil.position.set(side * OFFICER_EYES.x * CANVAS_WIDTH, this.eyeY, 0.013);
      this.pupils.push(pupil);
      this.eyes.add(pupil);
    }
    context.group.add(this.eyes);
  }

  update(dt: number, observerPosition?: THREE.Vector3): void {
    let x = 0;
    let y = 0;
    if (observerPosition) {
      this.observer.copy(observerPosition);
      this.eyes.worldToLocal(this.observer);
      if (this.observer.z > 0) {
        const distance = Math.hypot(this.observer.x, this.observer.y - this.eyeY, this.observer.z);
        // Stay inside the sockets even when the player stands beside the frame.
        x = this.observer.x / distance * 0.018 * CANVAS_WIDTH;
        y = (this.observer.y - this.eyeY) / distance * 0.009 / OFFICER_CANVAS_ASPECT * CANVAS_HEIGHT;
      }
    }
    const blend = 1 - Math.exp(-10 * Math.max(0, dt));
    this.offset.lerp(this.target.set(x, y), blend);
    this.placePupils();
  }

  reset(): void {
    this.offset.set(0, 0);
    this.placePupils();
  }

  private placePupils(): void {
    this.pupils.forEach((pupil, index) => {
      pupil.position.x = (index === 0 ? -1 : 1) * OFFICER_EYES.x * CANVAS_WIDTH + this.offset.x;
      pupil.position.y = this.eyeY + this.offset.y;
    });
  }
}
