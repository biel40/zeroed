import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cylinderZ, extrudeProfile, profileShape, type ProfilePoint } from './ProfileGeometry';
import { canvasTexture, seededRandom } from './ProceduralTextures';
import { mergeAssemblies } from './ViewModelBatching';
import type { BuiltProcedural } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/**
 * Ray Gun layout in meters: bore on y = 0, -Z towards the emitter. The sight
 * line runs through the open scope tube, so ADS frames the target in it.
 */
export const RAYGUN_LAYOUT = {
  sightY: 0.07,
  scope: { z: 0.04, length: 0.055, radius: 0.022 },
  rearHousing: { rearZ: 0.1, frontZ: -0.01, bottomY: -0.04, topY: 0.045, width: 0.062 },
  chamber: { rearZ: -0.05, frontZ: -0.15, radius: 0.038, coreRadius: 0.032 },
  /** Stacked accelerator discs, rear to front. */
  discs: { rearZ: -0.15, count: 6, pitch: 0.0205, length: 0.019, rearRadius: 0.034, step: 0.0028 },
  emitter: { z: -0.305, radius: 0.024 },
  /** Seated cell top: low enough to stay hidden behind the scope rim in ADS. */
  cellTopY: 0.0405,
  muzzleZ: -0.33,
  /** Arm angles around the bore (0 = straight down, PI = straight up). */
  armAngles: [Math.PI - 1.05, Math.PI + 1.05, 0],
} as const;

/** Swept-back pistol grip under the rear housing. */
const GRIP_PROFILE: readonly ProfilePoint[] = [
  [0.03, -0.034], [0.086, -0.034], [0.104, -0.078], [0.124, -0.148], [0.106, -0.162],
  [0.08, -0.158], [0.068, -0.12], [0.052, -0.07], [0.04, -0.046],
];

/** Hooked fin hanging ahead of the grip, the reference's trigger plate. */
const TRIGGER_FIN_PROFILE: readonly ProfilePoint[] = [
  [0.03, -0.035], [0.012, -0.035], [-0.002, -0.06], [-0.006, -0.095], [0.004, -0.118],
  [0.014, -0.112], [0.012, -0.08], [0.022, -0.055],
];

/**
 * Ray Gun view model: chipped red housings with glowing plasma windows, a
 * stack of tapered accelerator discs ending in the emitter ball, three spiked
 * field arms and an open scope tube. The plasma cell on the chamber is the
 * live reload part ('cell' style); `energyFlow` scrolls through the windows.
 */
export function buildRayGun(config: ViewModelConfig): BuiltProcedural {
  const group = new THREE.Group();
  group.name = 'raygun-root';
  const L = RAYGUN_LAYOUT;
  const glowColor = config.energyColor ?? 0x5cff3a;
  const grime = grimeTexture();
  const flow = plasmaTexture();

  const paintMap = paintTexture(config.bodyColor, config.accentColor);
  const paint = new THREE.MeshStandardMaterial({
    map: paintMap,
    // The painted map already carries the enamel color.
    color: paintMap ? 0xffffff : config.bodyColor,
    metalness: 0.28,
    roughness: 0.52,
    roughnessMap: grime,
    envMapIntensity: 1.1,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x48423e, map: grime, metalness: 0.7, roughness: 0.5, roughnessMap: grime, envMapIntensity: 1.25,
  });
  const fittings = new THREE.MeshStandardMaterial({
    color: config.accentColor, map: grime, metalness: 0.45, roughness: 0.62, envMapIntensity: 1.05,
  });
  // Extrusion UVs are in meters, so the grip needs its own denser tiling.
  const gripMetal = fittings.clone();
  if (grime) {
    gripMetal.map = grime.clone();
    gripMetal.map.repeat.set(9, 9);
    gripMetal.map.needsUpdate = true;
  }
  const energy = new THREE.MeshStandardMaterial({
    color: 0x0d3a0c,
    roughness: 0.3,
    metalness: 0.1,
    emissive: glowColor,
    emissiveMap: flow,
    emissiveIntensity: 1.5,
  });
  const scopeLining = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9, metalness: 0.2, side: THREE.BackSide });
  const reticle = new THREE.MeshBasicMaterial({ color: glowColor, toneMapped: false });

  const assembly = (name: string, x = 0, y = 0, z = 0): THREE.Group => {
    const part = new THREE.Group();
    part.name = `raygun-${name}`;
    part.position.set(x, y, z);
    group.add(part);
    return part;
  };
  const add = (
    name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    parent: THREE.Object3D, x = 0, y = 0, z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `raygun-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  /** Point on the chamber surface (radius r) at a bore angle. */
  const around = (angle: number, radius: number): [number, number] => [Math.sin(angle) * radius, -Math.cos(angle) * radius];

  // Rear housing: rounded block with plasma windows, side bosses and back plate.
  const body = assembly('body');
  const H = L.rearHousing;
  const housingLength = H.rearZ - H.frontZ;
  add('rear-housing', new RoundedBoxGeometry(H.width, H.topY - H.bottomY, housingLength, 3, 0.012), paint, body,
    0, (H.topY + H.bottomY) / 2, (H.rearZ + H.frontZ) / 2);
  for (const side of [-1, 1]) {
    add('rear-window', new RoundedBoxGeometry(0.004, 0.034, 0.038, 2, 0.0015), energy, body, side * 0.0306, 0.006, 0.062);
    add('window-frame', new RoundedBoxGeometry(0.003, 0.042, 0.046, 2, 0.0012), steel, body, side * 0.0298, 0.006, 0.062);
    const boss = add('side-boss', cylinderZ(0.016, 0.016, 0.006, 16), steel, body, side * 0.033, -0.006, 0.018);
    boss.rotation.y = Math.PI / 2;
    const hub = add('boss-hub', cylinderZ(0.007, 0.007, 0.008, 6), fittings, body, side * 0.037, -0.006, 0.018);
    hub.rotation.y = Math.PI / 2;
  }
  for (const x of [-0.016, 0.016]) {
    add('back-bolt', cylinderZ(0.0035, 0.0035, 0.004, 6), fittings, body, x, 0.024, H.rearZ + 0.001);
  }
  add('hammer-rod', cylinderZ(0.0075, 0.0075, 0.07, 10), fittings, body, 0, -0.02, H.rearZ + 0.035);
  add('hammer-knob', new THREE.SphereGeometry(0.0095, 12, 8), fittings, body, 0, -0.02, H.rearZ + 0.07);

  // Collar rings between the housing and the chamber.
  const C = L.chamber;
  for (const [z, radius, length] of [[-0.017, 0.034, 0.013], [-0.031, 0.037, 0.011], [-0.043, 0.032, 0.012]] as const) {
    add('collar-ring', cylinderZ(radius, radius, length, 18), steel, body, 0, 0, z);
  }

  // Plasma chamber: glowing core behind red top and bottom shells, so the
  // windows on both flanks show the energy flowing through.
  const chamberLength = C.rearZ - C.frontZ;
  const chamberZ = (C.rearZ + C.frontZ) / 2;
  add('plasma-core', cylinderZ(C.coreRadius, C.coreRadius, chamberLength - 0.004, 18), energy, body, 0, 0, chamberZ);
  const shellHalf = 0.96;
  for (const center of [0, Math.PI]) {
    const shell = new THREE.CylinderGeometry(C.radius, C.radius, chamberLength, 14, 1, false, center - shellHalf, shellHalf * 2);
    shell.rotateX(Math.PI / 2);
    add(center === 0 ? 'chamber-belly' : 'chamber-spine', shell, paint, body, 0, 0, chamberZ);
  }
  for (const z of [C.rearZ - 0.007, C.frontZ + 0.007]) {
    add('chamber-band', cylinderZ(C.radius + 0.0018, C.radius + 0.0018, 0.014, 20), paint, body, 0, 0, z);
  }
  for (const z of [-0.08, -0.094, -0.108]) {
    const angle = Math.PI + 0.72;
    const [x, y] = around(angle, C.radius + 0.003);
    const pad = add('grip-pad', new RoundedBoxGeometry(0.005, 0.012, 0.009, 1, 0.0018), fittings, body, x, y, z);
    pad.rotation.z = angle - Math.PI;
  }
  const bolt = add('hex-bolt', cylinderZ(0.0065, 0.0065, 0.006, 6), fittings, body, -0.0395, 0.012, C.rearZ - 0.007);
  bolt.rotation.y = Math.PI / 2;

  // Accelerator: tapered discs on a central rod, then the emitter ball.
  const barrel = assembly('barrel');
  const D = L.discs;
  const barrelFront = D.rearZ - D.count * D.pitch;
  add('barrel-rod', cylinderZ(0.011, 0.011, D.rearZ - L.emitter.z, 10), steel, barrel, 0, 0, (D.rearZ + L.emitter.z) / 2);
  for (let index = 0; index < D.count; index++) {
    const rear = D.rearRadius - index * D.step;
    add('accelerator-disc', cylinderZ(rear, rear * 0.52, D.length, 18), steel, barrel, 0, 0, D.rearZ - D.length / 2 - index * D.pitch);
  }
  add('emitter-glow', new THREE.TorusGeometry(0.0125, 0.003, 6, 18), energy, barrel, 0, 0, barrelFront - 0.008);
  add('emitter-ball', new THREE.SphereGeometry(L.emitter.radius, 18, 14), steel, barrel, 0, 0, L.emitter.z);

  // Field arms: bent rods out of the chamber front, ending in spiked discs.
  const arms = assembly('arms');
  for (const angle of L.armAngles) {
    const point = (radius: number, z: number): THREE.Vector3 => {
      const [x, y] = around(angle, radius);
      return new THREE.Vector3(x, y, z);
    };
    const tip = point(0.064, -0.215);
    add('arm-rod', new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      point(C.radius - 0.004, -0.135), point(0.056, -0.15), point(0.066, -0.18), tip,
    ]), 14, 0.0045, 6, false), fittings, arms);
    add('arm-disc', cylinderZ(0.011, 0.011, 0.006, 12), fittings, arms, tip.x, tip.y, tip.z);
    add('arm-spike', cylinderZ(0.0055, 0.0003, 0.026, 8), steel, arms, tip.x, tip.y, tip.z - 0.016);
  }

  // Scope: open red tube on a mount; its lining and crosshair frame ADS.
  const scope = assembly('scope', 0, L.sightY, L.scope.z);
  const S = L.scope;
  add('scope-tube', openTubeZ(S.radius, S.length), paint, scope);
  add('scope-lining', openTubeZ(S.radius - 0.0025, S.length), scopeLining, scope);
  for (const z of [S.length / 2, -S.length / 2]) {
    add('scope-rim', new THREE.TorusGeometry(S.radius - 0.0012, 0.0028, 6, 20), paint, scope, 0, 0, z);
  }
  for (const z of [-0.012, 0.016]) {
    add('scope-clamp', new THREE.TorusGeometry(S.radius + 0.002, 0.0035, 5, 18), steel, scope, 0, 0, z);
  }
  add('scope-mount', new RoundedBoxGeometry(0.024, 0.026, 0.036, 2, 0.004), fittings, scope, 0, -S.radius - 0.008, 0.002);
  const span = (S.radius - 0.0025) * 2;
  add('reticle-wire', new THREE.BoxGeometry(span, 0.0007, 0.0007), steel, scope, 0, 0, -S.length / 2 + 0.003);
  add('reticle-wire', new THREE.BoxGeometry(0.0007, span, 0.0007), steel, scope, 0, 0, -S.length / 2 + 0.003);
  add('reticle-dot', new THREE.SphereGeometry(0.0022, 8, 6), reticle, scope, 0, 0, -S.length / 2 + 0.003);

  // Grip and the hooked trigger fin, both in the worn fitting metal.
  const grip = assembly('grip');
  add('grip-body', extrudeProfile(profileShape(GRIP_PROFILE), 0.03, 0.006, { segments: 3, keepOutline: true }), gripMetal, grip);
  add('trigger-fin', extrudeProfile(profileShape(TRIGGER_FIN_PROFILE), 0.014, 0.003, { segments: 2, keepOutline: true }), gripMetal, grip);

  // Plasma cell sunk into the chamber spine: only its glowing cap shows,
  // below the scope's field of view; the reload lifts the whole cell out.
  const cell = assembly('cell', 0, L.cellTopY - 0.0225, -0.1);
  add('cell-core', new THREE.CylinderGeometry(0.0095, 0.0095, 0.018, 14), energy, cell, 0, 0.009, 0);
  add('cell-collar', new THREE.CylinderGeometry(0.012, 0.012, 0.004, 14), steel, cell, 0, 0.0205, 0);
  add('cell-window', new THREE.CylinderGeometry(0.0075, 0.0075, 0.0045, 14), energy, cell, 0, 0.0205, 0);

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, 0, L.muzzleZ).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.035, 0, 0.02).multiplyScalar(config.scale),
    sightY: L.sightY * config.scale,
    energyMaterials: [energy],
    energyFlow: flow ?? undefined,
    reloadParts: { magazine: cell },
  };
}

/** Open-ended tube along Z: the scope must stay see-through. */
function openTubeZ(radius: number, length: number): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 20, 1, true);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

const paintTextures = new Map<string, THREE.CanvasTexture | null>();
let grime: THREE.CanvasTexture | null | undefined;
let plasma: THREE.CanvasTexture | null | undefined;

/** sRGB CSS color for canvas drawing, brightness scaled in linear space. */
function css(color: number, scale = 1, alpha = 1): string {
  const { r, g, b } = new THREE.Color(color).multiplyScalar(scale).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
}

/**
 * Hand-painted enamel over metal: mottled tone, chipped spots that show the
 * underlying fitting metal and fine scratches. Rects and radial gradients
 * only, so it draws cheaply on any 2D canvas.
 */
function paintTexture(paintColor: number, metalColor: number): THREE.CanvasTexture | null {
  const key = `${paintColor}:${metalColor}`;
  if (paintTextures.has(key)) return paintTextures.get(key) ?? null;
  const random = seededRandom(1959);
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = css(paintColor);
    ctx.fillRect(0, 0, 256, 256);
    for (let blot = 0; blot < 70; blot++) {
      const x = random() * 256;
      const y = random() * 256;
      const radius = 6 + random() * 26;
      const tone = 0.7 + random() * 0.45;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, css(paintColor, tone, 0.14 + random() * 0.18));
      gradient.addColorStop(1, css(paintColor, tone, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let chip = 0; chip < 34; chip++) {
      const x = random() * 256;
      const y = random() * 256;
      const width = 2 + random() * 7;
      const height = 1.5 + random() * 4;
      const offset = (random() - 0.5) * width;
      // A darker paint lip around two overlapping bare-metal flakes.
      ctx.fillStyle = css(paintColor, 0.45);
      ctx.fillRect(x - 1, y - 1, width + 2, height + 2);
      ctx.fillRect(x + offset - 1, y + height - 1, width * 0.6 + 2, height * 0.8 + 2);
      ctx.fillStyle = css(metalColor, 0.85 + random() * 0.3);
      ctx.fillRect(x, y, width, height);
      ctx.fillRect(x + offset, y + height, width * 0.6, height * 0.8);
    }
    ctx.fillStyle = css(paintColor, 1.35, 0.35);
    for (let scratch = 0; scratch < 40; scratch++) {
      ctx.fillRect(random() * 256, random() * 256, 4 + random() * 18, 0.7);
    }
  });
  if (texture) texture.colorSpace = THREE.SRGBColorSpace;
  paintTextures.set(key, texture);
  return texture;
}

/** Light luminance map: grime speckle and handling scratches for bare metal. */
function grimeTexture(): THREE.CanvasTexture | null {
  if (grime !== undefined) return grime;
  const random = seededRandom(115);
  grime = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = 'rgb(225, 225, 225)';
    ctx.fillRect(0, 0, 256, 256);
    for (let speck = 0; speck < 2200; speck++) {
      const value = 175 + Math.floor(random() * 80);
      ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
    }
    ctx.fillStyle = 'rgba(90, 90, 90, 0.45)';
    for (let scratch = 0; scratch < 60; scratch++) {
      ctx.fillRect(random() * 256, random() * 256, 6 + random() * 30, 0.6);
    }
  });
  return grime;
}

/**
 * Emissive plasma: soft bright blobs and veins over a dim base, tiling
 * vertically so a scrolling offset reads as energy flowing through the gun.
 */
function plasmaTexture(): THREE.CanvasTexture | null {
  if (plasma !== undefined) return plasma;
  const random = seededRandom(7);
  plasma = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = 'rgb(48, 48, 48)';
    ctx.fillRect(0, 0, 128, 128);
    for (let blob = 0; blob < 26; blob++) {
      const x = random() * 128;
      const y = random() * 128;
      const radius = 8 + random() * 22;
      // Draw wrapped copies so the tile has no seams.
      for (const dx of [-128, 0, 128]) {
        for (const dy of [-128, 0, 128]) {
          const gradient = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
          gradient.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
        }
      }
    }
  });
  return plasma;
}
