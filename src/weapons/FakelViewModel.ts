import * as THREE from 'three';
import { clamp, damp, lerp } from '../utils/math';
import { ramp } from './AnimationCurves';
import { cylinderZ, extrudeProfile, profileShape, strut, type ProfilePoint } from './ProfileGeometry';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture, chippedPaintTexture, steelWearTexture } from './ProceduralTextures';
import { mergeAssemblies } from './ViewModelBatching';
import type { Weapon } from './Weapon';
import type { BuiltProcedural, ViewModelLiveParts } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

/**
 * ФАКЕЛ-33 layout in model metres (-Z towards the nozzle, y = 0 the
 * receiver centre). The pistol grip and the support sleeve sit where the
 * ZEUS-77 holds them, so both weapons share their hand anchors. The core
 * crystal rides a cage on the top-left of the receiver, below and left of
 * the sight line, between the two hands.
 */
export const FAKEL_PROFILE = {
  boreY: 0.012,
  muzzleZ: -0.612,
  receiver: [
    [0.105, 0.028], [-0.125, 0.028], [-0.135, 0.01], [-0.125, -0.04], [0.105, -0.04],
  ] as readonly ProfilePoint[],
  receiverWidth: 0.07,
  /** Same rake and section as the ZEUS-77 grip, so the right hand closes on it unchanged. */
  grip: [[0.045, -0.03], [0.095, -0.035], [0.135, -0.142], [0.082, -0.15]] as readonly ProfilePoint[],
  gripWidth: 0.046,
  /** Rubber-wrapped sleeve the support hand holds, behind the heat shield. */
  sleeve: { rearZ: -0.105, frontZ: -0.205, radius: 0.036 },
  shield: { rearZ: -0.205, frontZ: -0.5, radius: 0.028 },
  fins: { firstZ: -0.4, pitch: 0.019, count: 6, radius: 0.035 },
  tank: { y: -0.083, rearZ: -0.08, frontZ: -0.32, radius: 0.03 },
  /** Core crystal: centre of its cage, hexagonal body and pointed tips. */
  crystal: { x: -0.04, y: 0.046, z: -0.03, radius: 0.016, length: 0.074 },
  cageRadius: 0.022,
  gauge: { x: -0.036, y: -0.012, z: -0.078, radius: 0.017 },
  nozzle: { collarZ: -0.535, hingeZ: -0.55, hingeRadius: 0.032, petalLength: 0.062, petalWidth: 0.031, petals: 6 },
  rearSightZ: 0.05,
  frontSightZ: -0.44,
} as const;

/** Petal hinge angles: converged over the throat at rest, splayed wide while the stream runs. */
const PETAL_CLOSED = -0.4;
const PETAL_OPEN = 0.32;
/** How far the petals stay open while the locked nozzle vents its heat. */
const PETAL_VENTING = 0.65;
const PETAL_OPEN_RATE = 14;
const PETAL_CLOSE_RATE = 3.5;
/** Gauge needle sweep: cold on the left, redline on the right. */
const NEEDLE_COLD = 2.1;
const NEEDLE_HOT = -2.1;
const CRYSTAL_RED = new THREE.Color(0xff2416);
const DULL_RED = new THREE.Color(0x6a0d02);
const HOT_ORANGE = new THREE.Color(0xff6a1a);
const THROAT_COLOR = new THREE.Color(0xffa040);
const PILOT_COLOR = new THREE.Color(0x7fb2ff);

const CRYSTAL_ENERGY_VERTEX = /* glsl */ `
  varying vec3 vLocal;
  varying float vFacing;
  void main() {
    vLocal = position;
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-view.xyz)));
    gl_Position = projectionMatrix * view;
  }
`;

/**
 * Power inside the core crystal: churning veins of red light flowing along
 * it, white-hot where they thicken (core), or a soft glow hugging the
 * crystal's silhouette (rim). `uGlow` follows the charge and the heat.
 */
const CRYSTAL_ENERGY_FRAGMENT = /* glsl */ `
  uniform float uGlow;
  uniform float uTime;
  uniform float uRim;
  varying vec3 vLocal;
  varying float vFacing;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float around = atan(vLocal.y, vLocal.x);
    float veins = noise(vec2(vLocal.z * 80.0 - uTime * 2.6, around * 1.6)) * 0.6
      + noise(vec2(vLocal.z * 190.0 + uTime * 4.1, around * 4.0 + 3.0)) * 0.4;
    vec3 color;
    float light;
    if (uRim > 0.5) {
      light = pow(1.0 - vFacing, 2.2) * 0.7;
      color = vec3(1.0, 0.16, 0.08);
    } else {
      float thread = smoothstep(0.5, 0.9, veins);
      light = pow(vFacing, 1.3) * (0.35 + 0.8 * veins);
      color = mix(vec3(1.0, 0.1, 0.05), vec3(1.0, 0.78, 0.6), thread * smoothstep(0.4, 1.0, vFacing));
    }
    gl_FragColor = vec4(color * light * uGlow, 1.0);
  }
`;

/**
 * An elongated hexagonal crystal with pointed ends, cut a little unevenly
 * (seeded) so its facets catch the light differently: flat-shaded faces,
 * `length` along Z.
 */
function crystalGeometry(radius: number, length: number, seed: number): THREE.BufferGeometry {
  const sides = 6;
  let state = seed;
  const jitter = (amount: number): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return 1 + (state / 4294967296 - 0.5) * amount;
  };
  const shoulder = length / 2 - radius * 0.85;
  const ring = (z: number): THREE.Vector3[] => Array.from({ length: sides }, (_, side) => {
    const angle = (side / sides) * Math.PI * 2 + 0.1 * (jitter(1) - 1);
    const r = radius * jitter(0.22);
    return new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, z * jitter(0.08));
  });
  const back = ring(shoulder);
  const front = ring(-shoulder);
  const tipBack = new THREE.Vector3(radius * 0.12, -radius * 0.08, length / 2);
  const tipFront = new THREE.Vector3(-radius * 0.1, radius * 0.1, -length / 2);
  const positions: number[] = [];
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    triangle(back[side], front[side], front[next]);
    triangle(back[side], front[next], back[next]);
    triangle(tipBack, back[side], back[next]);
    triangle(tipFront, front[next], front[side]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function crystalEnergyMaterial(rim: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: rim ? 'fakel_crystal_rim' : 'fakel_crystal_energy',
    uniforms: { uGlow: { value: 1.3 }, uTime: { value: 0 }, uRim: { value: rim ? 1 : 0 } },
    vertexShader: CRYSTAL_ENERGY_VERTEX,
    fragmentShader: CRYSTAL_ENERGY_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: rim ? THREE.BackSide : THREE.FrontSide,
  });
}

/** Stencil atlas rows: the model name on the receiver, the flammable warning on the tank. */
const STENCIL_ROWS = ['ФАКЕЛ-33  ОПЫТНЫЙ', 'ОГНЕОПАСНО'] as const;

let stencilTexture: THREE.CanvasTexture | null | undefined;

/** Faded white army stencil lettering, worn at the edges; null outside a DOM. */
function fakelStencilTexture(): THREE.CanvasTexture | null {
  if (stencilTexture !== undefined) return stencilTexture;
  stencilTexture = canvasTexture(512, 128, (ctx) => {
    // A fresh canvas is already transparent; headless stand-ins (tests) cannot draw text.
    if (typeof ctx.fillText !== 'function') return;
    ctx.fillStyle = 'rgba(226, 222, 204, 0.9)';
    ctx.font = 'bold 44px Impact, "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    STENCIL_ROWS.forEach((row, index) => ctx.fillText(row, 256, 32 + index * 64, 500));
    // Worn away in flecks, like paint scraped by gloves and crates.
    ctx.globalCompositeOperation = 'destination-out';
    for (let fleck = 0; fleck < 260; fleck++) {
      ctx.fillStyle = `rgba(0, 0, 0, ${0.3 + Math.random() * 0.7})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 128, 1 + Math.random() * 4, 1 + Math.random() * 3);
    }
  });
  if (stencilTexture) {
    stencilTexture.wrapS = THREE.ClampToEdgeWrapping;
    stencilTexture.wrapT = THREE.ClampToEdgeWrapping;
    stencilTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return stencilTexture;
}

/** Plane showing one stencil row; it faces -X (the left flank) unless turned. */
function stencilPlane(row: number, width: number, height: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.getAttribute('uv');
  const top = 1 - row / STENCIL_ROWS.length;
  const bottom = top - 1 / STENCIL_ROWS.length;
  for (let index = 0; index < uv.count; index++) uv.setY(index, uv.getY(index) > 0.5 ? top : bottom);
  return geometry.rotateY(-Math.PI / 2);
}

interface FakelParts {
  readonly petals: readonly THREE.Object3D[];
  readonly lever: THREE.Object3D;
  readonly needle: THREE.Object3D;
  readonly pilot: THREE.Mesh;
  readonly nozzleHeat: THREE.MeshStandardMaterial;
  readonly finHeat: THREE.MeshStandardMaterial;
  readonly throat: THREE.MeshBasicMaterial;
  readonly crystal: THREE.MeshStandardMaterial;
  /** Energy veins inside the crystal and the glow round its silhouette. */
  readonly crystalEnergy: readonly THREE.ShaderMaterial[];
}

/**
 * The ФАКЕЛ-33's moving and glowing parts, driven by the weapon state: the
 * nozzle petals open with the stream and stay ajar while the locked nozzle
 * vents; petals, collar and fins run from dark steel to red and orange with
 * the heat; the gauge needle climbs to the redline; the core crystal fades
 * as its charge runs out, dies while a spent one is pulled and flares when
 * a fresh one locks in; the blue pilot flame goes out while the weapon
 * cannot fire and lights again when it can.
 */
class FakelLiveParts implements ViewModelLiveParts {
  private open = 0;
  private squeeze = 0;
  private time = 0;
  private readonly color = new THREE.Color();

  constructor(private readonly parts: FakelParts) {
    this.reset();
  }

  update(dt: number, weapon: Weapon, reloadGlow: number): void {
    const { parts } = this;
    this.time += dt;
    const firing = weapon.isFiring;
    const locked = weapon.heat.overheated;
    const heat = weapon.heat.level;
    const flicker = 0.5 + 0.5 * Math.sin(this.time * 37) * Math.sin(this.time * 23 + 1.3);

    const openTarget = firing ? 1 : locked ? PETAL_VENTING : 0;
    this.open = damp(this.open, openTarget, openTarget > this.open ? PETAL_OPEN_RATE : PETAL_CLOSE_RATE, dt);
    const hinge = lerp(PETAL_CLOSED, PETAL_OPEN, this.open);
    for (const petal of parts.petals) petal.rotation.x = hinge;
    this.squeeze = damp(this.squeeze, firing ? 1 : 0, 18, dt);
    parts.lever.rotation.x = this.squeeze * 0.22;
    parts.needle.rotation.z = lerp(NEEDLE_COLD, NEEDLE_HOT, heat) + (firing ? (flicker - 0.5) * 0.06 : 0);

    // Heat reaches the nozzle first, the fins behind it later.
    const nozzle = clamp((heat - 0.2) / 0.8, 0, 1);
    const fins = clamp((heat - 0.45) / 0.55, 0, 1);
    this.heatGlow(parts.nozzleHeat, nozzle, 1.9);
    this.heatGlow(parts.finHeat, fins, 1.2);
    const throat = firing ? 2 + flicker * 0.8 : 0.2 + nozzle * 1.3;
    parts.throat.color.copy(THROAT_COLOR).multiplyScalar(throat);

    const glow = this.crystalGlow(weapon, firing, flicker, heat, reloadGlow);
    parts.crystal.emissiveIntensity = glow * 0.9;
    for (const material of parts.crystalEnergy) {
      material.uniforms.uGlow.value = glow;
      material.uniforms.uTime.value = this.time;
    }

    const pilotLit = !locked && weapon.state !== 'equipping' && !this.coreOut(weapon);
    parts.pilot.visible = pilotLit;
    if (pilotLit) {
      parts.pilot.scale.set(1, 0.8 + flicker * 0.5, 1);
      (parts.pilot.material as THREE.MeshBasicMaterial).color.copy(PILOT_COLOR).multiplyScalar(0.7 + flicker * 0.5);
    }
  }

  reset(): void {
    const { parts } = this;
    this.open = 0;
    this.squeeze = 0;
    this.time = 0;
    for (const petal of parts.petals) petal.rotation.x = PETAL_CLOSED;
    parts.lever.rotation.x = 0;
    parts.needle.rotation.z = NEEDLE_COLD;
    this.heatGlow(parts.nozzleHeat, 0, 0);
    this.heatGlow(parts.finHeat, 0, 0);
    parts.throat.color.copy(THROAT_COLOR).multiplyScalar(0.2);
    parts.crystal.emissiveIntensity = 1.4;
    for (const material of parts.crystalEnergy) material.uniforms.uGlow.value = 1.3;
    // Lit by the next update of a weapon in hand; a stored or displayed one shows none.
    parts.pilot.visible = false;
  }

  private heatGlow(material: THREE.MeshStandardMaterial, t: number, peak: number): void {
    material.emissive.copy(this.color.copy(DULL_RED).lerp(HOT_ORANGE, t));
    material.emissiveIntensity = t * t * peak;
  }

  /** The core dims with its charge; a spent one dies as it is pulled, a fresh one flares as the cage locks. */
  private crystalGlow(weapon: Weapon, firing: boolean, flicker: number, heat: number, reloadGlow: number): number {
    const charge = weapon.ammoInMagazine / weapon.definition.magazineSize;
    let glow = 0.35 + 1.25 * charge + heat * 0.35 + (firing ? 0.45 + flicker * 0.3 : 0);
    const reload = weapon.definition.view.reloadAnim;
    if (weapon.state === 'reloading' && reload) {
      const p = weapon.stateProgress;
      glow = p < reload.magIn
        ? lerp(glow, 0.1, ramp(p, reload.magOut - 0.05, reload.magOut + 0.05))
        : 1 + reloadGlow * 2.6;
    }
    return glow;
  }

  /** From the moment the spent crystal leaves the cage until the fresh one is energised. */
  private coreOut(weapon: Weapon): boolean {
    const reload = weapon.definition.view.reloadAnim;
    if (weapon.state !== 'reloading' || !reload) return false;
    const p = weapon.stateProgress;
    return p >= reload.magOut && p < reload.chargeEnd;
  }
}

/**
 * ФАКЕЛ-33 view model: an experimental Soviet decontamination flamethrower.
 * Worn green-painted receiver on a tubular steel stock, bakelite grip with
 * a squeeze lever, the red core crystal in a hinged steel cage, a fuel tank
 * on clamp bands with its valve and feed line, a pressure gauge, a finned
 * heat shield and a mechanical nozzle of six petals over an incandescent
 * throat, with a blue pilot flame under it. The crystal is the reload part
 * and its cage lid the cover the shared ReloadAnimator swings open.
 */
export function buildFakel(config: ViewModelConfig): BuiltProcedural {
  const P = FAKEL_PROFILE;
  const group = new THREE.Group();
  group.name = 'fakel-root';
  const sightY = config.sightHeight;
  const boreY = P.boreY;
  const wear = steelWearTexture();

  const paint = new THREE.MeshStandardMaterial({
    color: config.bodyColor, map: chippedPaintTexture(), roughness: 0.74, metalness: 0.28, roughnessMap: wear,
  });
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x0e1011, roughness: 0.62, metalness: 0.7 });
  const warningPaint = new THREE.MeshStandardMaterial({ color: 0x6b1c14, map: chippedPaintTexture(), roughness: 0.78, metalness: 0.2 });
  const stencil = new THREE.MeshStandardMaterial({
    map: fakelStencilTexture(), transparent: true, alphaTest: 0.25, roughness: 0.8, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, depthWrite: false,
  });
  const gaugeGlass = new THREE.MeshStandardMaterial({
    color: 0xc8d4d8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.22, depthWrite: false,
  });
  const steel = new THREE.MeshStandardMaterial({ color: config.accentColor, roughness: 0.5, metalness: 0.78, roughnessMap: wear });
  const bakelite = new THREE.MeshStandardMaterial({ color: 0x2b1d16, roughness: 0.62, metalness: 0.05 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0 });
  const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a34, roughness: 0.42, metalness: 0.85 });
  const copper = new THREE.MeshStandardMaterial({ color: 0x8c4a2c, roughness: 0.4, metalness: 0.85 });
  const dial = new THREE.MeshStandardMaterial({ color: 0xd8d0b8, roughness: 0.7, metalness: 0 });
  const redline = new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.7, metalness: 0, emissive: 0x3a0603 });
  const nozzleHeat = new THREE.MeshStandardMaterial({ color: 0x1d1f21, roughness: 0.46, metalness: 0.82, roughnessMap: wear, emissive: 0x000000 });
  const finHeat = new THREE.MeshStandardMaterial({ color: 0x24272a, roughness: 0.5, metalness: 0.8, roughnessMap: wear, emissive: 0x000000 });
  const throat = new THREE.MeshBasicMaterial({ color: THROAT_COLOR.clone(), toneMapped: false });
  // Deep red glass under a glossy clear coat: every facet throws its own highlight.
  const crystalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x5a0605, roughness: 0.06, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04,
    emissive: CRYSTAL_RED.clone(), emissiveIntensity: 1.4, transparent: true, opacity: 0.74, flatShading: true,
    envMapIntensity: 1.8,
  });
  const crystalEnergy = [crystalEnergyMaterial(false), crystalEnergyMaterial(true)];
  const pilotMaterial = new THREE.MeshBasicMaterial({
    color: PILOT_COLOR.clone(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    toneMapped: false, side: THREE.DoubleSide,
  });

  const assembly = (name: string): THREE.Group => {
    const part = new THREE.Group();
    part.name = `fakel-${name}`;
    group.add(part);
    return part;
  };
  const add = (
    parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    x = 0, y = 0, z = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `fakel-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const tube = (parent: THREE.Object3D, name: string, points: readonly THREE.Vector3[], radius: number, material: THREE.Material): void => {
    add(parent, name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3([...points]), 16, radius, 6, false), material);
  };
  const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const rivetGeometry = new THREE.SphereGeometry(0.0021, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  /** A dome-headed rivet on a flank: `side` -1 left, 1 right. */
  const rivet = (parent: THREE.Object3D, side: number, y: number, z: number, x: number): void => {
    add(parent, 'rivet', rivetGeometry.clone().rotateZ(-side * Math.PI / 2), steel, side * x, y, z);
  };
  /** A bolt head on a round part, pointing out from the axis at `angle`. */
  const radialBolt = (parent: THREE.Object3D, radius: number, angle: number, z: number): void => {
    const bolt = add(parent, 'bolt-head', new THREE.CylinderGeometry(0.0026, 0.0026, 0.0028, 6), darkSteel,
      Math.cos(angle) * radius, boreY + Math.sin(angle) * radius, z);
    bolt.rotation.z = angle - Math.PI / 2;
  };

  // Tubular steel stock: welded collars, a painted cheek plate, a sling loop and a ribbed rubber pad.
  // Every static part shares one assembly, so each material draws once for the whole body.
  const frame = assembly('frame');
  const stock = frame;
  add(stock, 'stock-top', strut(v(0, 0.016, 0.1), v(0, 0.006, 0.272), 0.0075), steel);
  add(stock, 'stock-bottom', strut(v(0, -0.034, 0.128), v(0, -0.074, 0.272), 0.0075), steel);
  add(stock, 'stock-brace', strut(v(0, 0.006, 0.2), v(0, -0.058, 0.226), 0.005), steel);
  add(stock, 'cheek-plate', extrudeProfile(profileShape([[0.13, 0.012], [0.25, 0.006], [0.25, -0.052], [0.15, -0.036]]), 0.005, 0.001), paint);
  for (const [y, z] of [[0.016, 0.102], [-0.034, 0.13], [0.006, 0.268], [-0.074, 0.268]] as const) {
    add(stock, 'stock-collar', cylinderZ(0.0098, 0.0098, 0.008, 10), darkSteel, 0, y, z);
  }
  const sling = add(stock, 'sling-loop', new THREE.TorusGeometry(0.009, 0.0018, 5, 12), steel, 0, -0.084, 0.255);
  sling.rotation.y = Math.PI / 2;
  add(stock, 'butt-plate', new THREE.BoxGeometry(0.044, 0.118, 0.006), steel, 0, -0.033, 0.27);
  add(stock, 'butt-pad', new THREE.BoxGeometry(0.042, 0.112, 0.018), rubber, 0, -0.033, 0.281);
  for (let rib = 0; rib < 5; rib++) {
    add(stock, 'butt-rib', new THREE.BoxGeometry(0.044, 0.003, 0.004), darkSteel, 0, -0.077 + rib * 0.022, 0.291);
  }

  // Painted receiver, data plate, pressure relief valve and the crystal's feed cable.
  const receiver = frame;
  add(receiver, 'receiver-housing', extrudeProfile(profileShape(P.receiver), P.receiverWidth, 0.003), paint);
  add(receiver, 'receiver-top-strip', new THREE.BoxGeometry(0.03, 0.006, 0.19), steel, 0.012, 0.031, -0.015);
  add(receiver, 'data-plate', new THREE.BoxGeometry(0.0016, 0.02, 0.042), brass, -0.0358, -0.008, 0.045);
  for (const z of [0.028, 0.062]) {
    for (const y of [-0.015, -0.001]) rivet(receiver, -1, y, z, 0.0367);
  }
  add(receiver, 'name-stencil', stencilPlane(0, 0.09, 0.0225), stencil, -0.0358, 0.013, -0.045);
  // Pressed panel seams and rivet rows along both flanks.
  for (const side of [-1, 1]) {
    const x = side * (P.receiverWidth / 2 + 0.0002);
    add(receiver, 'panel-seam', new THREE.BoxGeometry(0.0012, 0.0016, 0.22), darkSteel, x, 0.004, -0.012);
    for (const z of [-0.06, 0.012]) add(receiver, 'panel-seam', new THREE.BoxGeometry(0.0012, 0.04, 0.0016), darkSteel, x, -0.018, z);
    for (let index = 0; index < 7; index++) {
      const z = -0.11 + index * 0.034;
      rivet(receiver, side, 0.021, z, P.receiverWidth / 2);
      rivet(receiver, side, -0.033, z, P.receiverWidth / 2);
    }
  }
  // Threaded coupling where the fuel tube leaves the receiver, and the ignition switch on the right.
  add(receiver, 'tube-coupling', cylinderZ(0.022, 0.022, 0.014, 12), darkSteel, 0, boreY, -0.134);
  for (let flat = 0; flat < 6; flat++) radialBolt(receiver, 0.022, (flat / 6) * Math.PI * 2, -0.134);
  add(receiver, 'switch-box', new THREE.BoxGeometry(0.012, 0.022, 0.032), steel, 0.041, -0.006, -0.03);
  const toggle = add(receiver, 'switch-toggle', new THREE.CylinderGeometry(0.0022, 0.0018, 0.016, 6), brass, 0.05, 0.002, -0.03);
  toggle.rotation.set(0.5, 0, -0.9);
  add(receiver, 'relief-valve', cylinderZ(0.007, 0.007, 0.02, 10).rotateX(Math.PI / 2), brass, 0.022, 0.04, -0.1);
  add(receiver, 'relief-valve-cap', new THREE.CylinderGeometry(0.009, 0.009, 0.004, 10), steel, 0.022, 0.051, -0.1);
  tube(receiver, 'core-feed-cable', [v(-0.046, 0.03, 0.014), v(-0.05, 0.01, 0.032), v(-0.038, -0.018, 0.03)], 0.0035, rubber);
  // Rear notch sight: two blades either side of the sight line.
  add(receiver, 'rear-sight-base', new THREE.BoxGeometry(0.026, 0.014, 0.016), steel, 0, 0.042, P.rearSightZ);
  for (const side of [-1, 1]) {
    add(receiver, 'rear-sight-blade', new THREE.BoxGeometry(0.005, 0.03, 0.006), steel, side * 0.0075, sightY - 0.012, P.rearSightZ);
  }

  // Bakelite grip and the squeeze lever in front of it.
  const grip = frame;
  add(grip, 'grip', extrudeProfile(profileShape(P.grip), P.gripWidth, 0.004), bakelite);
  // Moulded grooves across the bakelite, raked like the grip, and its screw.
  for (let groove = 0; groove < 6; groove++) {
    const t = 0.18 + groove * 0.13;
    const mark = add(grip, 'grip-groove', new THREE.BoxGeometry(P.gripWidth + 0.0012, 0.0022, 0.034), darkSteel,
      0, -0.035 - t * 0.11, 0.088 + t * 0.031);
    mark.rotation.x = -0.33;
  }
  add(grip, 'grip-screw', cylinderZ(0.0042, 0.0042, P.gripWidth + 0.002, 8).rotateY(Math.PI / 2), brass, 0, -0.082, 0.1);
  const lever = new THREE.Group();
  lever.name = 'fakel-squeeze-lever';
  lever.position.set(0, -0.042, 0.03);
  group.add(lever);
  add(lever, 'squeeze-bar', strut(v(0, 0, 0), v(0, -0.08, 0.026), 0.0045), steel);

  // Fuel tank on two clamp bands, its valve and the feed and pilot lines.
  const tank = frame;
  const tankLength = P.tank.rearZ - P.tank.frontZ;
  const tankZ = (P.tank.rearZ + P.tank.frontZ) / 2;
  add(tank, 'tank-body', cylinderZ(P.tank.radius, P.tank.radius, tankLength, 16), paint, 0, P.tank.y, tankZ);
  for (const [end, z] of [[1, P.tank.rearZ], [-1, P.tank.frontZ]] as const) {
    add(tank, 'tank-cap', new THREE.SphereGeometry(P.tank.radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
      .rotateX(end * Math.PI / 2).scale(1, 1, 0.35), steel, 0, P.tank.y, z);
  }
  for (const z of [-0.12, -0.28]) {
    add(tank, 'tank-band', cylinderZ(P.tank.radius + 0.003, P.tank.radius + 0.003, 0.012, 16), steel, 0, P.tank.y, z);
    add(tank, 'tank-hanger', new THREE.BoxGeometry(0.012, 0.034, 0.01), steel, 0, P.tank.y + P.tank.radius + 0.012, z);
    add(tank, 'band-buckle', new THREE.BoxGeometry(0.008, 0.01, 0.016), darkSteel, 0, P.tank.y - P.tank.radius - 0.004, z);
  }
  // Weld seams, the flammable band with its stencil, a filler cap and a skid strip underneath.
  for (const z of [-0.08 - tankLength * 0.33, -0.08 - tankLength * 0.66]) {
    add(tank, 'weld-seam', cylinderZ(P.tank.radius + 0.0008, P.tank.radius + 0.0008, 0.003, 16), darkSteel, 0, P.tank.y, z);
  }
  add(tank, 'warning-band', cylinderZ(P.tank.radius + 0.0005, P.tank.radius + 0.0005, 0.03, 16), warningPaint, 0, P.tank.y, -0.2);
  add(tank, 'warning-stencil', stencilPlane(1, 0.07, 0.0175), stencil, -P.tank.radius - 0.0012, P.tank.y, -0.2);
  add(tank, 'filler-neck', new THREE.CylinderGeometry(0.008, 0.009, 0.01, 10), steel, -0.016, P.tank.y + P.tank.radius - 0.002, -0.09);
  add(tank, 'filler-cap', new THREE.CylinderGeometry(0.0105, 0.0105, 0.005, 10), brass, -0.016, P.tank.y + P.tank.radius + 0.005, -0.09);
  add(tank, 'skid-strip', new THREE.BoxGeometry(0.008, 0.004, tankLength * 0.8), steel, 0, P.tank.y - P.tank.radius - 0.001, tankZ);
  add(tank, 'valve-neck', cylinderZ(0.008, 0.008, 0.03, 8), brass, 0, P.tank.y, P.tank.frontZ - 0.02);
  add(tank, 'valve-body', new THREE.BoxGeometry(0.018, 0.018, 0.014), brass, 0, P.tank.y, P.tank.frontZ - 0.024);
  add(tank, 'valve-wheel', new THREE.TorusGeometry(0.016, 0.0028, 6, 14), steel, 0, P.tank.y, P.tank.frontZ - 0.038);
  for (let spoke = 0; spoke < 3; spoke++) {
    add(tank, 'valve-spoke', new THREE.BoxGeometry(0.032, 0.003, 0.003), steel, 0, P.tank.y, P.tank.frontZ - 0.038).rotation.z = (spoke * Math.PI) / 3;
  }
  tube(tank, 'feed-line', [v(0, P.tank.y + 0.01, P.tank.frontZ - 0.025), v(0, -0.05, -0.36), v(0, boreY - 0.016, -0.375)], 0.0055, rubber);
  for (const [y, z] of [[P.tank.y + 0.014, P.tank.frontZ - 0.03], [boreY - 0.02, -0.374]] as const) {
    add(tank, 'hose-clamp', cylinderZ(0.0075, 0.0075, 0.006, 10).rotateX(Math.PI / 2 - 0.5), steel, 0, y, z);
  }
  tube(tank, 'pilot-line', [v(0.008, P.tank.y, P.tank.frontZ - 0.028), v(0.01, -0.06, -0.45), v(0, boreY - 0.038, -0.535)], 0.0028, copper);

  // Fuel tube, rubber sleeve, heat shield with its bands and the front sight.
  const barrel = frame;
  const tubeLength = 0.53 - 0.125;
  add(barrel, 'fuel-tube', cylinderZ(0.016, 0.016, tubeLength, 12), steel, 0, boreY, -0.125 - tubeLength / 2);
  const sleeveLength = P.sleeve.rearZ - P.sleeve.frontZ;
  add(barrel, 'grip-sleeve', cylinderZ(P.sleeve.radius, P.sleeve.radius, sleeveLength, 18), rubber, 0, boreY, (P.sleeve.rearZ + P.sleeve.frontZ) / 2);
  for (let ridge = 0; ridge < 4; ridge++) {
    add(barrel, 'sleeve-ridge', cylinderZ(P.sleeve.radius + 0.002, P.sleeve.radius + 0.002, 0.006, 18), rubber,
      0, boreY, P.sleeve.rearZ - 0.016 - ridge * 0.023);
  }
  const shieldLength = P.shield.rearZ - P.shield.frontZ;
  add(barrel, 'heat-shield', cylinderZ(P.shield.radius, P.shield.radius, shieldLength, 16), paint, 0, boreY, (P.shield.rearZ + P.shield.frontZ) / 2);
  for (const z of [-0.225, -0.33]) {
    add(barrel, 'shield-band', cylinderZ(0.031, 0.031, 0.01, 16), steel, 0, boreY, z);
    radialBolt(barrel, 0.031, -Math.PI / 2, z);
  }
  // Vent slots punched round the shield, in staggered rows.
  for (let row = 0; row < 5; row++) {
    const z = -0.245 - row * 0.03 - (row > 2 ? 0.02 : 0);
    for (let slot = 0; slot < 8; slot++) {
      const angle = ((slot + (row % 2) * 0.5) / 8) * Math.PI * 2;
      const vent = add(barrel, 'vent-slot', new THREE.BoxGeometry(0.0055, 0.0012, 0.016), darkSteel,
        Math.cos(angle) * (P.shield.radius + 0.0003), boreY + Math.sin(angle) * (P.shield.radius + 0.0003), z);
      vent.rotation.z = angle - Math.PI / 2;
    }
  }
  add(barrel, 'front-sight-bracket', new THREE.BoxGeometry(0.008, sightY - boreY - P.shield.radius - 0.004, 0.014), steel,
    0, (sightY + boreY + P.shield.radius - 0.004) / 2 - 0.004, P.frontSightZ);
  add(barrel, 'front-sight-post', new THREE.BoxGeometry(0.0022, 0.01, 0.003), steel, 0, sightY - 0.005, P.frontSightZ);
  for (const side of [-1, 1]) {
    add(barrel, 'front-sight-ear', new THREE.BoxGeometry(0.003, 0.018, 0.01), steel, side * 0.011, sightY - 0.006, P.frontSightZ);
  }

  // Cooling fins just behind the nozzle: they heat after it.
  const fins = assembly('fins');
  for (let fin = 0; fin < P.fins.count; fin++) {
    add(fins, 'cooling-fin', cylinderZ(P.fins.radius, P.fins.radius, 0.004, 16), finHeat, 0, boreY, P.fins.firstZ - fin * P.fins.pitch);
  }

  // Nozzle collar, incandescent throat and the igniter with its pilot flame.
  const nozzle = assembly('nozzle');
  add(nozzle, 'nozzle-collar', cylinderZ(0.039, 0.034, 0.03, 18), nozzleHeat, 0, boreY, P.nozzle.collarZ);
  add(nozzle, 'nozzle-throat', cylinderZ(0.019, 0.019, 0.012, 14), throat, 0, boreY, P.nozzle.hingeZ - 0.008);
  // Swirl vanes across the throat: their silhouettes stand out against the glow.
  for (let vane = 0; vane < 4; vane++) {
    const blade = add(nozzle, 'swirl-vane', new THREE.BoxGeometry(0.034, 0.002, 0.006), darkSteel, 0, boreY, P.nozzle.hingeZ - 0.012);
    blade.rotation.set(0.5, 0, (vane * Math.PI) / 4);
  }
  // Collar bolts and the hinge ring with a knuckle under every petal.
  for (let bolt = 0; bolt < 6; bolt++) radialBolt(nozzle, 0.037, (bolt / 6) * Math.PI * 2 + Math.PI / 6, P.nozzle.collarZ + 0.006);
  add(nozzle, 'hinge-ring', new THREE.TorusGeometry(P.nozzle.hingeRadius + 0.001, 0.0022, 6, 24), nozzleHeat, 0, boreY, P.nozzle.hingeZ);
  for (let knuckle = 0; knuckle < P.nozzle.petals; knuckle++) {
    const angle = (knuckle / P.nozzle.petals) * Math.PI * 2 + Math.PI / 2;
    const pin = add(nozzle, 'hinge-knuckle', new THREE.CylinderGeometry(0.0032, 0.0032, 0.014, 8), nozzleHeat,
      Math.cos(angle) * P.nozzle.hingeRadius, boreY + Math.sin(angle) * P.nozzle.hingeRadius, P.nozzle.hingeZ);
    pin.rotation.z = angle;
  }
  add(nozzle, 'igniter', cylinderZ(0.004, 0.004, 0.045, 8), steel, 0, boreY - 0.04, -0.555);
  const pilot = new THREE.Mesh(
    new THREE.PlaneGeometry(0.012, 0.02).translate(0, 0.01, 0),
    pilotMaterial,
  );
  pilot.add(new THREE.Mesh(pilot.geometry.clone().rotateY(Math.PI / 2), pilotMaterial));
  pilot.name = 'fakel-pilot-flame';
  pilot.position.set(0, boreY - 0.036, -0.579);
  group.add(pilot);

  // Six petals hinged round the throat; each pivot opens about its own tangent.
  const petals: THREE.Object3D[] = [];
  // A tapered plate with a pressed stiffening rib and two rivets at its root.
  const petalPlate = new THREE.BoxGeometry(P.nozzle.petalWidth, 0.003, P.nozzle.petalLength).translate(0, 0, -P.nozzle.petalLength / 2);
  const plateTaper = petalPlate.getAttribute('position');
  for (let index = 0; index < plateTaper.count; index++) {
    plateTaper.setX(index, plateTaper.getX(index) * (1 + (plateTaper.getZ(index) / P.nozzle.petalLength) * 0.35));
  }
  const petalGeometry = mergeGeometries([
    petalPlate,
    new THREE.BoxGeometry(0.0045, 0.0026, P.nozzle.petalLength * 0.8).translate(0, 0.0026, -P.nozzle.petalLength * 0.45),
    ...[-0.0095, 0.0095].map((x) => new THREE.CylinderGeometry(0.0022, 0.0022, 0.0018, 6).translate(x, 0.002, -0.006)),
  ].map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry)))!;
  for (let index = 0; index < P.nozzle.petals; index++) {
    const angle = (index / P.nozzle.petals) * Math.PI * 2 + Math.PI / 2;
    const petal = new THREE.Group();
    petal.name = 'fakel-petal';
    petal.rotation.order = 'ZXY';
    petal.rotation.z = angle - Math.PI / 2;
    petal.position.set(Math.cos(angle) * P.nozzle.hingeRadius, boreY + Math.sin(angle) * P.nozzle.hingeRadius, P.nozzle.hingeZ);
    group.add(petal);
    add(petal, 'petal-plate', petalGeometry, nozzleHeat);
    petals.push(petal);
  }

  // The crystal cage, fixed to the receiver's top-left edge.
  const C = P.crystal;
  const cage = assembly('cage');
  const collarGeometry = new THREE.TorusGeometry(P.cageRadius, 0.0035, 6, 18);
  for (const z of [C.z + C.length / 2 + 0.005, C.z - C.length / 2 - 0.005]) add(cage, 'cage-collar', collarGeometry, steel, C.x, C.y, z);
  for (const angle of [Math.PI * 1.15, Math.PI * 1.85]) {
    add(cage, 'cage-bar', cylinderZ(0.0028, 0.0028, C.length + 0.012, 6), steel,
      C.x + Math.cos(angle) * P.cageRadius, C.y + Math.sin(angle) * P.cageRadius, C.z);
  }
  add(cage, 'cage-saddle', new THREE.BoxGeometry(0.03, 0.01, C.length), steel, C.x + 0.012, 0.027, C.z);
  // Spring contacts that press on the crystal's ferrules, and the lid's hinge pin.
  for (const end of [-1, 1]) {
    add(cage, 'cage-contact', new THREE.BoxGeometry(0.008, 0.012, 0.003), copper, C.x, C.y - P.cageRadius + 0.006, C.z + end * (C.length / 2 + 0.002));
  }
  add(cage, 'lid-hinge-pin', cylinderZ(0.0028, 0.0028, 0.03, 8).rotateY(Math.PI / 2), darkSteel, C.x, C.y + P.cageRadius, C.z - C.length / 2 - 0.005);

  // Hinged lid: front-hinged, it swings up and forward to free the crystal.
  const lid = new THREE.Group();
  lid.name = 'fakel-cage-lid';
  lid.position.set(C.x, C.y + P.cageRadius, C.z - C.length / 2 - 0.005);
  group.add(lid);
  const lidLength = C.length + 0.01;
  for (const side of [-1, 1]) add(lid, 'lid-bar', cylinderZ(0.0026, 0.0026, lidLength, 6), steel, side * 0.011, 0, lidLength / 2);
  add(lid, 'lid-cross', new THREE.BoxGeometry(0.026, 0.004, 0.005), steel, 0, 0, lidLength);
  add(lid, 'lid-latch', new THREE.BoxGeometry(0.01, 0.006, 0.008), brass, 0, 0, lidLength + 0.004);

  // The core crystal itself: hexagonal, pointed, brass contact ferrules, a glow inside.
  const crystal = new THREE.Group();
  crystal.name = 'fakel-core-crystal';
  crystal.position.set(C.x, C.y, C.z);
  group.add(crystal);
  const gem = crystalGeometry(C.radius, C.length, 33);
  add(crystal, 'crystal-body', gem, crystalMaterial);
  // The veins burn inside; the rim glow wraps the silhouette from just outside it.
  add(crystal, 'crystal-energy', gem.clone().scale(0.62, 0.62, 0.86), crystalEnergy[0]);
  add(crystal, 'crystal-rim', gem.clone().scale(1.12, 1.12, 1.05), crystalEnergy[1]);
  // Brass contact bands where the cage's springs touch it, each with a contact pad.
  for (const end of [-1, 1]) {
    const z = end * (C.length / 2 - C.radius * 1.4);
    add(crystal, 'crystal-ferrule', cylinderZ(C.radius * 1.08, C.radius * 1.08, 0.0035, 6), brass, 0, 0, z);
    add(crystal, 'crystal-contact', new THREE.BoxGeometry(0.004, 0.003, 0.006), brass, 0, -C.radius * 1.08, z);
  }

  // Pressure gauge on the left flank, face tipped up to the eye; the needle reads the heat.
  const gauge = assembly('gauge');
  gauge.position.set(P.gauge.x, P.gauge.y, P.gauge.z);
  gauge.rotation.set(-0.5, -Math.PI / 2, 0, 'YXZ');
  add(gauge, 'gauge-case', cylinderZ(P.gauge.radius, P.gauge.radius, 0.012, 18), brass, 0, 0, -0.004);
  add(gauge, 'gauge-face', cylinderZ(P.gauge.radius * 0.86, P.gauge.radius * 0.86, 0.002, 18), dial, 0, 0, 0.0025);
  add(gauge, 'gauge-redline', new THREE.RingGeometry(P.gauge.radius * 0.62, P.gauge.radius * 0.8, 10, 1, -0.55, 1.2), redline, 0, 0, 0.0037);
  add(gauge, 'gauge-stem', cylinderZ(0.004, 0.004, 0.012, 8), brass, 0, 0, -0.014);
  add(gauge, 'gauge-bezel', new THREE.TorusGeometry(P.gauge.radius * 0.93, 0.0016, 5, 20), brass, 0, 0, 0.0035);
  // Graduations round the dial, over the same sweep as the needle.
  for (let mark = 0; mark <= 8; mark++) {
    const angle = Math.PI / 2 + NEEDLE_COLD - (mark / 8) * (NEEDLE_COLD - NEEDLE_HOT);
    const tick = add(gauge, 'gauge-tick', new THREE.BoxGeometry(0.0009, mark % 2 === 0 ? 0.0034 : 0.0022, 0.0006), rubber,
      Math.cos(angle) * P.gauge.radius * 0.7, Math.sin(angle) * P.gauge.radius * 0.7, 0.0037);
    tick.rotation.z = angle - Math.PI / 2;
  }
  add(gauge, 'gauge-glass', cylinderZ(P.gauge.radius * 0.88, P.gauge.radius * 0.88, 0.0008, 18), gaugeGlass, 0, 0, 0.0058);
  const needle = new THREE.Group();
  needle.name = 'fakel-gauge-needle';
  needle.position.z = 0.0044;
  gauge.add(needle);
  add(needle, 'gauge-needle', new THREE.BoxGeometry(0.0016, P.gauge.radius * 0.72, 0.0008).translate(0, P.gauge.radius * 0.32, 0), rubber);

  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  const liveParts = new FakelLiveParts({
    petals, lever, needle, pilot, nozzleHeat, finHeat, throat, crystal: crystalMaterial, crystalEnergy,
  });
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, boreY, P.muzzleZ).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.036, 0.01, -0.1).multiplyScalar(config.scale),
    sightY: sightY * config.scale,
    reloadParts: { magazine: crystal, cover: lid },
    liveParts,
  };
}
