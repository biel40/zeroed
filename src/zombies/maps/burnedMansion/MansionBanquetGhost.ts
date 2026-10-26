import * as THREE from 'three';
import { MANSION_BANQUET_GHOST } from '../BurnedMansionConfig';
import { decalTexture, type Rgb } from '../shared/ProceduralSurface';

const TEXTURE_SIZE = 128;
const FADE_IN_SECONDS = 0.3;
const FADE_OUT_SECONDS = 0.7;
const PEAK_OPACITY = 0.92;

const HAZE: Rgb = [132, 66, 172];
const BODY: Rgb = [44, 18, 62];
const EYE: Rgb = [242, 238, 250];
const PUPIL: Rgb = [8, 4, 10];
const MOUTH: Rgb = [72, 0, 20];
const FANG: Rgb = [236, 232, 240];

/** Lower lip and upper lip of the grin as ellipses in sprite units ([-1, 1], y up). */
const LOWER_LIP = { y: -0.06, rx: 0.33, ry: 0.3 } as const;
const UPPER_LIP = { y: 0.04, rx: 0.36, ry: 0.28 } as const;
const FANG_X = 0.11;
const FANG_LENGTH = 0.07;
const FANG_HALF_WIDTH = 0.03;

/**
 * A grinning ball of dark gas in a violet haze, a nod to the ghosts of
 * Pokémon's Burned Tower. Painted once in sprite units (x right, y up);
 * every feature is a signed distance, positive inside, turned into
 * one-texel antialiased coverage and composited back to front.
 */
function makeGhostTexture(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const texel = 2 / size;
  const cover = (inside: number): number => THREE.MathUtils.clamp(inside / texel + 0.5, 0, 1);
  const upperLipY = (x: number): number => UPPER_LIP.y - UPPER_LIP.ry * Math.sqrt(Math.max(0, 1 - (x / UPPER_LIP.rx) ** 2));
  const color: Rgb = [0, 0, 0];
  let alpha = 0;
  const over = (paint: Rgb, coverage: number): void => {
    if (coverage <= 0) return;
    const below = alpha * (1 - coverage);
    const result = coverage + below;
    for (let channel = 0; channel < 3; channel++) {
      color[channel] = (paint[channel] * coverage + color[channel] * below) / result;
    }
    alpha = result;
  };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) * texel - 1;
      const y = (py + 0.5) * texel - 1;
      const distance = Math.hypot(x, y);
      const angle = Math.atan2(y, x);
      color[0] = color[1] = color[2] = 0;
      alpha = 0;

      // Gas haze: lobes around the rim, twisted with distance into a slow swirl.
      const swirl = angle + distance * 3;
      const reach = 0.7 + 0.12 * Math.sin(swirl * 5 + 0.7) + 0.06 * Math.sin(swirl * 9 - 1.2)
        + 0.03 * Math.sin(swirl * 17 + 2.1);
      const haze = THREE.MathUtils.clamp((reach - distance) / 0.3, 0, 1) ** 1.5 * 0.62;
      over(HAZE, haze);

      // Body lit from the upper left.
      const light = Math.max(0, (-0.6 * x + 0.8 * y) / 0.47);
      const shade = 0.7 + 0.7 * light - 0.35 * (distance / 0.47) ** 4;
      over([BODY[0] * shade, BODY[1] * shade, BODY[2] * shade], cover(0.47 - distance));

      // Slanted almond eyes, inner corners low, with small pupils.
      for (const side of [-1, 1]) {
        const ex = x - side * 0.19;
        const ey = y - 0.12;
        const tilt = side * 0.35;
        const along = ex * Math.cos(tilt) + ey * Math.sin(tilt);
        const across = -ex * Math.sin(tilt) + ey * Math.cos(tilt);
        over(EYE, cover((1 - Math.hypot(along / 0.15, across / 0.07)) * 0.07));
        over(PUPIL, cover(0.035 - Math.hypot(x - side * 0.16, y - 0.115)));
      }

      // Crescent grin between the two lips, with two fangs off the upper lip.
      const insideLower = (1 - Math.hypot(x / LOWER_LIP.rx, (y - LOWER_LIP.y) / LOWER_LIP.ry)) * LOWER_LIP.ry;
      const belowUpper = (Math.hypot(x / UPPER_LIP.rx, (y - UPPER_LIP.y) / UPPER_LIP.ry) - 1) * UPPER_LIP.ry;
      over(MOUTH, cover(Math.min(insideLower, belowUpper)));
      for (const side of [-1, 1]) {
        const drop = upperLipY(side * FANG_X) + 0.01 - y;
        if (drop < 0 || drop > FANG_LENGTH) continue;
        over(FANG, cover(FANG_HALF_WIDTH * (1 - drop / FANG_LENGTH) - Math.abs(x - side * FANG_X)));
      }

      const offset = (py * size + px) * 4;
      data[offset] = Math.round(color[0]);
      data[offset + 1] = Math.round(color[1]);
      data[offset + 2] = Math.round(color[2]);
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  return decalTexture(data, size);
}

/**
 * Easter egg: opening the banquet door rarely shows a ghost over the head
 * of the table that grins, drifts toward the west wall and fades within a
 * few seconds. Presentation only: never solid, never a target.
 */
export class MansionBanquetGhost {
  private readonly sprite: THREE.Sprite;
  private readonly material: THREE.SpriteMaterial;
  /** Seconds since the ghost appeared; negative while hidden. */
  private elapsed = -1;

  constructor(parent: THREE.Object3D) {
    this.material = new THREE.SpriteMaterial({
      name: 'mansion_banquet_ghost',
      map: makeGhostTexture(TEXTURE_SIZE),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.name = 'banquet-ghost';
    this.sprite.userData.mapRole = 'banquet-ghost-easter-egg';
    this.sprite.frustumCulled = false;
    this.sprite.visible = false;
    parent.add(this.sprite);
  }

  get visible(): boolean {
    return this.elapsed >= 0;
  }

  /** Rolls the easter egg; returns whether the ghost shows up. */
  tryAppear(random: () => number = Math.random): boolean {
    if (this.visible || random() >= MANSION_BANQUET_GHOST.chance) return false;
    this.elapsed = 0;
    this.sprite.visible = true;
    this.update(0);
    return true;
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.elapsed += Math.max(0, dt);
    const { durationSeconds, position, driftX, size } = MANSION_BANQUET_GHOST;
    if (this.elapsed >= durationSeconds) {
      this.reset();
      return;
    }
    const time = this.elapsed;
    const fade = Math.min(1, time / FADE_IN_SECONDS, (durationSeconds - time) / FADE_OUT_SECONDS);
    const flicker = 0.85 + 0.15 * Math.sin(time * 37);
    this.material.opacity = PEAK_OPACITY * fade * flicker;
    this.sprite.position.set(
      position.x + driftX * THREE.MathUtils.smoothstep(time / durationSeconds, 0, 1),
      position.y + 0.08 * Math.sin(time * 5),
      position.z,
    );
    this.sprite.scale.setScalar(size * (1 + 0.04 * Math.sin(time * 9)));
  }

  reset(): void {
    this.elapsed = -1;
    this.material.opacity = 0;
    this.sprite.visible = false;
  }
}
