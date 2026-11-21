import * as THREE from 'three';
import { buildExhalisArrowGeometry, EXHALIS_ARROW } from './ExhalisArrow';
import { strut } from './ProfileGeometry';
import { steelWearTexture, woodGrainTexture } from './ProceduralTextures';
import { mergeAssemblies } from './ViewModelBatching';
import type { Weapon } from './Weapon';
import type { BuiltProcedural, ViewModelLiveParts } from './WeaponView';
import type { ViewModelConfig } from './WeaponTypes';

type LimbPoint = readonly [along: number, back: number];

/**
 * EXHALIS layout in model metres. The root frame keeps -Z towards the
 * target; the shot line (the nock and the arrow) runs `nockY`, three
 * centimetres under the sight line. The bow itself is built in its own
 * plane (y up the riser, z along the shot, x across) around the point where
 * the shot line crosses the riser, and canted by `cant` so its upper half
 * leans left, out of the sight picture; the line passes the riser through a
 * window cut beside its spine. The draw handle hangs plumb from the nock
 * where the ZEUS-77 has its grip, so the right hand closes on it unchanged.
 * A full draw takes the nock, the arrow, the handle and the hand `draw`
 * metres back towards the archer.
 */
export const EXHALIS_PROFILE = {
  nockY: 0.045,
  riserZ: -0.21,
  nockZ: 0.075,
  draw: 0.065,
  cant: 0.35,
  /** Bow-plane heights of the riser's sections, from the lower limb's root to the upper's. */
  riser: { bottom: -0.23, gripBottom: -0.13, windowBottom: -0.02, windowTop: 0.06, top: 0.15, width: 0.03, depth: 0.05 },
  /** Leather-wrapped grip below the window, held by the left hand. */
  grip: { width: 0.032, depth: 0.044 },
  /** Spine left of the window: the only riser the shot line passes. */
  spine: { minX: -0.02, maxX: -0.008 },
  /** Limb centre line from its root (along the riser, back towards the archer); the string leaves `nockIndex`. */
  limb: [[0, 0], [0.1, 0.022], [0.2, 0.05], [0.29, 0.082], [0.34, 0.092], [0.372, 0.074]] as readonly LimbPoint[],
  nockIndex: 4,
  limbWidth: { root: 0.032, tip: 0.013 },
  limbThickness: { root: 0.016, tip: 0.008 },
  /** The breath ampoule set in the back of the upper riser: the part a reload swaps. */
  ampoule: { y: 0.105, z: 0.036, radius: 0.0095, length: 0.046 },
  /** Draw handle under the nock: the ZEUS-77 grip's centre, rake and section. */
  handle: { center: [0, -0.085, 0.091], axis: [0, 0.946, -0.326], length: 0.11, radius: 0.025 },
} as const;

/** Limb swing forward (radians) as a breath is loosed, and how it quivers back. */
const RELEASE_FLEX = 0.075;
const RELEASE_DECAY = 11;
const RELEASE_FREQUENCY = 42;
const RELEASE_SETTLE = 0.6;
/** Extra share of the release quiver after a full draw. */
const RELEASE_DRAWN = 0.8;
/** Limb bend back (radians) at a full draw. */
const DRAW_FLEX = 0.05;
/** Seconds a new arrow takes to gather on the string after a shot (never longer than the shot interval). */
const ARROW_GATHER = 0.55;
/** Peak opacity of the wind swirling round the arrowhead, and the share of it shown undrawn. */
const SWIRL_OPACITY = 0.6;
const SWIRL_REST = 0.15;
/** Swirl turn rate undrawn (rad/s), and how many times faster it adds at a full draw. */
const SWIRL_SPEED = 7;
const SWIRL_DRAWN = 2.5;
/** Glow of the arrow's engraved runes undrawn, and added at a full draw. */
const RUNE_GLOW = 0.5;
const RUNE_DRAWN = 2.6;
/** The full-draw pulse round the arrowhead: seconds, start and end scale, peak opacity. */
const PULSE_SECONDS = 0.3;
const PULSE_FROM = 0.6;
const PULSE_TO = 1.9;
const PULSE_OPACITY = 0.8;
const UP = new THREE.Vector3(0, 1, 0);

interface ExhalisParts {
  readonly upperLimb: THREE.Object3D;
  readonly lowerLimb: THREE.Object3D;
  readonly upperString: THREE.Object3D;
  readonly lowerString: THREE.Object3D;
  /** The draw handle, carried back with the nock (and the right hand with it). */
  readonly handle: THREE.Object3D;
  readonly arrow: THREE.Object3D;
  readonly swirl: THREE.Object3D;
  readonly pulse: THREE.Object3D;
  readonly swirlMaterial: THREE.MeshBasicMaterial;
  readonly pulseMaterial: THREE.MeshBasicMaterial;
  readonly runeMaterial: THREE.MeshStandardMaterial;
  /** Bow-plane points the string is laid between. */
  readonly upperRoot: number;
  readonly lowerRoot: number;
  /** Bow-plane nock at rest; drawing moves it back along +Z. */
  readonly nock: THREE.Vector3;
}

/**
 * The bow's moving parts, driven from the weapon state. Drawing (the
 * weapon's charge) takes the nock, the arrow, the draw handle and so the
 * right hand back, bends the limbs and feeds the wind turning round the
 * arrowhead and the glow of its runes; a full draw flashes a short pulse
 * there. Every loosed breath snaps the limbs forward, harder the further it
 * was drawn, and lets them quiver back while the string follows their tips;
 * the arrow vanishes with the shot and a new one gathers on the string, and
 * none is nocked while the bow is empty or being reloaded. Purely visual.
 */
class ExhalisLiveParts implements ViewModelLiveParts {
  private sinceShot = Number.POSITIVE_INFINITY;
  private form = 1;
  private time = 0;
  private swirlAngle = 0;
  private charge = 0;
  private sincePulse = Number.POSITIVE_INFINITY;
  private readonly nock = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();

  public constructor(private readonly parts: ExhalisParts) {
    this.reset();
  }

  public onShot(): void {
    this.sinceShot = 0;
    this.form = 0;
  }

  public update(dt: number, weapon: Weapon, reloadGlow: number): void {
    this.time += dt;
    this.sinceShot += dt;
    this.sincePulse += dt;
    const charge = weapon.chargeLevel;
    if (charge >= 1 && this.charge < 1) this.sincePulse = 0;
    this.charge = charge;
    const drawn = 1 - (1 - charge) * (1 - charge);
    const s = this.sinceShot;
    const release = s < RELEASE_SETTLE
      ? RELEASE_FLEX * (1 + RELEASE_DRAWN * weapon.lastShotCharge) * Math.exp(-RELEASE_DECAY * s) * Math.cos(RELEASE_FREQUENCY * s)
      : 0;
    this.layLimbs(release - DRAW_FLEX * drawn, EXHALIS_PROFILE.draw * drawn);
    const nocked = weapon.ammoInMagazine > 0 && weapon.state !== 'reloading' && weapon.state !== 'equipping';
    const gather = Math.min(ARROW_GATHER, weapon.shotInterval * 0.9);
    this.form = nocked ? Math.min(1, this.form + dt / gather) : Math.max(0, this.form - dt * 6);
    this.swirlAngle = (this.swirlAngle + dt * SWIRL_SPEED * (1 + SWIRL_DRAWN * charge)) % (Math.PI * 2);
    this.showArrow(this.form, 1 + reloadGlow, charge);
  }

  public reset(): void {
    this.sinceShot = Number.POSITIVE_INFINITY;
    this.sincePulse = Number.POSITIVE_INFINITY;
    this.form = 1;
    this.time = 0;
    this.swirlAngle = 0;
    this.charge = 0;
    this.layLimbs(0, 0);
    this.showArrow(1, 1, 0);
  }

  private showArrow(form: number, glow: number, charge: number): void {
    const { arrow, swirl, swirlMaterial, runeMaterial, pulse, pulseMaterial } = this.parts;
    arrow.visible = form > 0.02;
    if (!arrow.visible) return;
    const eased = form * form * (3 - 2 * form);
    arrow.scale.set(0.6 + 0.4 * eased, 0.6 + 0.4 * eased, eased);
    swirl.rotation.z = this.swirlAngle;
    swirl.scale.setScalar(1 + 0.2 * charge * (0.8 + 0.2 * Math.sin(this.time * 23)));
    const gathered = SWIRL_REST + (1 - SWIRL_REST) * charge;
    swirlMaterial.opacity = SWIRL_OPACITY * gathered * eased * glow * (0.85 + 0.15 * Math.sin(this.time * 9));
    runeMaterial.emissiveIntensity = (RUNE_GLOW + RUNE_DRAWN * charge) * glow;
    const p = this.sincePulse / PULSE_SECONDS;
    pulse.visible = p < 1;
    if (!pulse.visible) return;
    pulse.scale.setScalar(PULSE_FROM + (PULSE_TO - PULSE_FROM) * (1 - (1 - p) * (1 - p)));
    pulseMaterial.opacity = PULSE_OPACITY * (1 - p);
  }

  /**
   * Limbs swung forward by `flex` radians, the nock, arrow and handle drawn
   * `draw` metres back, and the string laid from both tips to the nock.
   */
  private layLimbs(flex: number, draw: number): void {
    const { parts } = this;
    parts.upperLimb.rotation.x = -flex;
    parts.lowerLimb.rotation.x = flex;
    this.nock.copy(parts.nock).z += draw;
    parts.handle.position.z = draw;
    parts.arrow.position.z = EXHALIS_PROFILE.nockZ + draw;
    this.stretch(parts.upperString, limbTip(1, parts.upperRoot, -flex, this.tip));
    this.stretch(parts.lowerString, limbTip(-1, parts.lowerRoot, flex, this.tip));
  }

  /** Lays a unit string segment (its base at the origin, along +Y) from `from` to the nock. */
  private stretch(segment: THREE.Object3D, from: THREE.Vector3): void {
    this.direction.subVectors(this.nock, from);
    const length = this.direction.length();
    segment.position.copy(from);
    segment.quaternion.setFromUnitVectors(UP, this.direction.divideScalar(length));
    segment.scale.set(1, length, 1);
  }
}

/** Bow-plane position of a limb's string nock, the limb swung `angle` about its root. */
function limbTip(sign: 1 | -1, rootY: number, angle: number, out: THREE.Vector3): THREE.Vector3 {
  const [along, back] = EXHALIS_PROFILE.limb[EXHALIS_PROFILE.nockIndex];
  const y = sign * along;
  return out.set(0, rootY + y * Math.cos(angle) - back * Math.sin(angle), y * Math.sin(angle) + back * Math.cos(angle));
}

/**
 * A limb: a flat strip tapering from its root to its tip along the limb's
 * centre line, `sign` 1 up the riser and -1 down it, with metric UVs along
 * its length so the wood grain runs down the limb.
 */
function limbGeometry(sign: 1 | -1): THREE.BufferGeometry {
  const P = EXHALIS_PROFILE;
  const curve = new THREE.CatmullRomCurve3(P.limb.map(([along, back]) => new THREE.Vector3(0, sign * along, back)));
  const samples = 14;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const across = new THREE.Vector3(1, 0, 0);
  const normal = new THREE.Vector3();
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  for (let index = 0; index <= samples; index++) {
    const t = index / samples;
    curve.getPoint(t, point);
    curve.getTangent(t, tangent);
    normal.crossVectors(tangent, across).normalize();
    const halfWidth = THREE.MathUtils.lerp(P.limbWidth.root, P.limbWidth.tip, t) / 2;
    const halfThick = THREE.MathUtils.lerp(P.limbThickness.root, P.limbThickness.tip, t) / 2;
    for (const [w, h] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      positions.push(point.x + w * halfWidth, point.y + normal.y * h * halfThick, point.z + normal.z * h * halfThick);
      uvs.push(t * 3, (w + 1) * 0.25 + (h + 1) * 0.05);
    }
  }
  for (let index = 0; index < samples; index++) {
    const a = index * 4;
    const b = a + 4;
    for (let side = 0; side < 4; side++) {
      const next = (side + 1) % 4;
      indices.push(a + side, b + side, b + next, a + side, b + next, a + next);
    }
  }
  const tipRing = samples * 4;
  indices.push(0, 2, 1, 0, 3, 2, tipRing, tipRing + 1, tipRing + 2, tipRing, tipRing + 2, tipRing + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
}

/**
 * EXHALIS, "the last breath": a Gothic relic bow of petrified, blackened
 * wood with aged bronze crowns and fittings, funerary finials on its recurved
 * tips, a pale whisper-string and runes of contained wind inlaid in the
 * riser. A bronze-caged ampoule of breath sits in the back of the riser
 * (the reload part), a bronze draw handle hangs from the nock (the right
 * hand's grip) and an arrow rests on the string and the shelf, its
 * broadhead ahead of the riser, ready to be drawn and loosed.
 */
export function buildExhalis(config: ViewModelConfig): BuiltProcedural {
  const P = EXHALIS_PROFILE;
  const R = P.riser;
  const group = new THREE.Group();
  group.name = 'exhalis-root';
  const wear = steelWearTexture();

  const wood = new THREE.MeshStandardMaterial({ color: config.bodyColor, map: woodGrainTexture(), roughness: 0.74, metalness: 0.06 });
  const bronze = new THREE.MeshStandardMaterial({ color: config.accentColor, roughness: 0.42, metalness: 0.86, roughnessMap: wear });
  const verdigris = new THREE.MeshStandardMaterial({ color: 0x3f5a4e, roughness: 0.7, metalness: 0.45 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x2b1713, roughness: 0.86, metalness: 0.02 });
  // Dim on purpose: the view's energy pulse multiplies them, and the wind must stay contained, never neon.
  const inlay = new THREE.MeshStandardMaterial({
    name: 'exhalis-inlay', color: 0x0d2522, emissive: 0x24695f, emissiveIntensity: 1.2, roughness: 0.45, metalness: 0.1,
  });
  const breath = new THREE.MeshStandardMaterial({
    name: 'exhalis-breath', color: 0x9fe9de, emissive: 0x3c9d90, emissiveIntensity: 1.3, roughness: 0.2, metalness: 0,
  });
  const glass = new THREE.MeshStandardMaterial({ color: 0xc8f1ea, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false });
  const string = new THREE.MeshStandardMaterial({ color: 0xd8ece6, emissive: 0x2f7d73, emissiveIntensity: 0.55, roughness: 0.55, metalness: 0 });
  // Bleached ash shaft and grey-goose vanes: pale against the blackened bow.
  const ash = new THREE.MeshStandardMaterial({
    name: 'exhalis-arrow-ash', color: 0xc9bea6, map: woodGrainTexture(), roughness: 0.78, metalness: 0, side: THREE.DoubleSide,
  });
  // Driven by the draw: faint at rest, bright when full.
  const runeMaterial = new THREE.MeshStandardMaterial({
    name: 'exhalis-arrow-rune', color: 0x0d2522, emissive: 0x3fb8a4, emissiveIntensity: RUNE_GLOW, roughness: 0.4, metalness: 0.1,
  });
  const windGlow = (name: string): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
    name, color: config.energyColor ?? 0x8fe3d6, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const swirlMaterial = windGlow('exhalis-wind-swirl');
  const pulseMaterial = windGlow('exhalis-charge-pulse');

  const assembly = (parent: THREE.Object3D, name: string): THREE.Group => {
    const part = new THREE.Group();
    part.name = `exhalis-${name}`;
    parent.add(part);
    return part;
  };
  const add = (parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, material: THREE.Material,
    x = 0, y = 0, z = 0): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `exhalis-${name}`;
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const box = (parent: THREE.Object3D, name: string, material: THREE.Material, size: readonly [number, number, number],
    x: number, y: number, z: number): THREE.Mesh => add(parent, name, new THREE.BoxGeometry(...size), material, x, y, z);

  // The bow in its own canted plane, around where the shot line crosses the riser.
  const bow = assembly(group, 'bow');
  bow.position.set(0, P.nockY, P.riserZ);
  bow.rotation.z = P.cant;

  // Riser of petrified wood: the lower block, the wrapped grip, the spine beside the window and the upper block.
  const riserBlock = (name: string, bottom: number, top: number): void => {
    box(bow, name, wood, [R.width, top - bottom, R.depth], 0, (bottom + top) / 2, 0);
  };
  riserBlock('riser-lower', R.bottom, R.gripBottom);
  riserBlock('riser-upper', R.windowTop, R.top);
  const gripHeight = R.windowBottom - R.gripBottom;
  add(bow, 'grip', new THREE.CylinderGeometry(0.5, 0.5, 1, 12).scale(P.grip.width, gripHeight, P.grip.depth), leather,
    0, (R.gripBottom + R.windowBottom) / 2, 0);
  for (let wrap = 0; wrap < 5; wrap++) {
    add(bow, 'grip-binding', new THREE.CylinderGeometry(0.5, 0.5, 1, 12).scale(P.grip.width + 0.002, 0.003, P.grip.depth + 0.002), bronze,
      0, R.gripBottom + gripHeight * (0.12 + wrap * 0.19), 0);
  }
  const spineWidth = P.spine.maxX - P.spine.minX;
  box(bow, 'spine', wood, [spineWidth, R.windowTop - R.windowBottom, R.depth], (P.spine.minX + P.spine.maxX) / 2, (R.windowBottom + R.windowTop) / 2, 0);
  // Bronze shelf the wind arrow rests on, and the collar closing the window above it.
  box(bow, 'shelf', bronze, [R.width + 0.002, 0.006, R.depth + 0.004], 0, R.windowBottom + 0.003, 0);
  box(bow, 'window-collar', bronze, [R.width + 0.004, 0.008, R.depth + 0.004], 0, R.windowTop + 0.004, 0);
  // Crowns where the limbs leave the riser: a bronze band ringed with small points, a funerary-regal touch.
  for (const [sign, y] of [[1, R.top], [-1, R.bottom]] as const) {
    add(bow, 'crown', new THREE.CylinderGeometry(0.5, 0.5, 1, 10).scale(R.width + 0.008, 0.022, R.depth + 0.008), bronze, 0, y - sign * 0.011, 0);
    for (let point = 0; point < 5; point++) {
      const z = (point - 2) * (R.depth / 4.4);
      const spike = add(bow, 'crown-point', new THREE.ConeGeometry(0.0035, 0.014, 4), bronze, 0, y + sign * 0.006, z);
      spike.rotation.x = sign < 0 ? Math.PI : 0;
    }
  }
  // Runes of contained wind carved in the riser's back, a faint turquoise in the wood.
  const back = R.depth / 2 + 0.0008;
  box(bow, 'rune', inlay, [0.0026, 0.07, 0.0016], -0.006, (R.bottom + R.gripBottom) / 2 + 0.005, back);
  for (const y of [R.bottom + 0.022, R.bottom + 0.05]) {
    for (const side of [-1, 1]) {
      const chevron = box(bow, 'rune', inlay, [0.0022, 0.016, 0.0016], -0.006 + side * 0.005, y, back);
      chevron.rotation.z = side * 0.7;
    }
  }
  box(bow, 'rune', inlay, [0.0026, 0.024, 0.0016], -0.006, R.top - 0.016, back);
  // The ampoule's cage on the back of the upper riser.
  const A = P.ampoule;
  for (const angle of [-0.9, 0.9, Math.PI]) {
    box(bow, 'cage-bar', bronze, [0.0022, A.length + 0.006, 0.0022], Math.sin(angle) * (A.radius + 0.003), A.y, A.z + Math.cos(angle) * (A.radius + 0.003));
  }
  box(bow, 'cage-seat', verdigris, [0.026, 0.006, 0.026], 0, A.y - A.length / 2 - 0.004, A.z - 0.004);

  // Limbs on their own pivots at the crowns: blackened wood, a bronze band and a funerary finial at each tip.
  const limb = (name: string, sign: 1 | -1, rootY: number): THREE.Group => {
    const pivot = assembly(bow, name);
    pivot.position.set(0, rootY, 0);
    add(pivot, 'limb', limbGeometry(sign), wood);
    const [bandAlong, bandBack] = P.limb[2];
    box(pivot, 'limb-band', verdigris, [0.026, 0.006, 0.014], 0, sign * bandAlong, bandBack);
    const [tipAlong, tipBack] = P.limb[P.limb.length - 1];
    const finial = add(pivot, 'finial', new THREE.SphereGeometry(0.008, 8, 6).scale(1, 1.9, 1), bronze, 0, sign * (tipAlong + 0.008), tipBack);
    finial.rotation.x = sign * 0.6;
    const [nockAlong, nockBack] = P.limb[P.nockIndex];
    add(pivot, 'limb-nock', new THREE.TorusGeometry(0.006, 0.0018, 4, 10).rotateY(Math.PI / 2), bronze, 0, sign * nockAlong, nockBack);
    return pivot;
  };
  const upperLimb = limb('upper-limb', 1, R.top);
  const lowerLimb = limb('lower-limb', -1, R.bottom);

  // The whisper-string: two unit segments the live parts lay from each tip to the nock.
  const segment = (name: string): THREE.Group => {
    const pivot = assembly(bow, name);
    add(pivot, 'string', new THREE.CylinderGeometry(0.0014, 0.0014, 1, 5).translate(0, 0.5, 0), string);
    return pivot;
  };
  const upperString = segment('upper-string');
  const lowerString = segment('lower-string');

  // The breath ampoule: a glass vial of pale wind between bronze caps.
  const ampoule = assembly(bow, 'ampoule');
  ampoule.position.set(0, A.y, A.z);
  add(ampoule, 'ampoule-glass', new THREE.CylinderGeometry(A.radius, A.radius, A.length, 10), glass);
  add(ampoule, 'ampoule-breath', new THREE.CylinderGeometry(A.radius * 0.55, A.radius * 0.55, A.length * 0.8, 8), breath);
  for (const end of [-1, 1]) {
    add(ampoule, 'ampoule-cap', new THREE.CylinderGeometry(A.radius + 0.0015, A.radius + 0.0015, 0.006, 10), bronze, 0, end * (A.length / 2 + 0.002), 0);
  }
  add(ampoule, 'ampoule-ring', new THREE.TorusGeometry(0.004, 0.0012, 4, 8), bronze, 0, A.length / 2 + 0.008, 0);

  // Draw handle hanging plumb from the nock: a bronze clasp on the string, its stem and the wrapped handle.
  const H = P.handle;
  const frame = assembly(group, 'frame');
  const axis = new THREE.Vector3(...H.axis).normalize();
  const center = new THREE.Vector3(...H.center);
  const handleTop = center.clone().addScaledVector(axis, H.length / 2);
  const handleBottom = center.clone().addScaledVector(axis, -H.length / 2);
  const handle = add(frame, 'handle', new THREE.CylinderGeometry(H.radius * 0.94, H.radius, H.length, 12), leather, center.x, center.y, center.z);
  handle.quaternion.setFromUnitVectors(UP, axis);
  for (const end of [handleTop, handleBottom]) {
    const cap = add(frame, 'handle-cap', new THREE.CylinderGeometry(H.radius + 0.002, H.radius + 0.002, 0.008, 12), bronze, end.x, end.y, end.z);
    cap.quaternion.copy(handle.quaternion);
  }
  add(frame, 'handle-pommel', new THREE.SphereGeometry(0.011, 8, 6), bronze,
    handleBottom.x, handleBottom.y - 0.006, handleBottom.z + 0.002);
  add(frame, 'stem', strut(handleTop, new THREE.Vector3(0, P.nockY - 0.008, P.nockZ), 0.0045), bronze);
  box(frame, 'clasp', bronze, [0.012, 0.016, 0.014], 0, P.nockY - 0.002, P.nockZ);

  // The arrow nocked on the string, its shaft through the window over the shelf and its head
  // ahead of the riser; wind gathers round the head as the bow is drawn.
  const arrow = new THREE.Group();
  arrow.name = 'exhalis-wind-arrow';
  arrow.position.set(0, P.nockY, P.nockZ);
  group.add(arrow);
  const arrowGeometry = buildExhalisArrowGeometry();
  add(arrow, 'arrow-body', arrowGeometry.body, ash);
  add(arrow, 'arrow-metal', arrowGeometry.metal, bronze);
  add(arrow, 'arrow-runes', arrowGeometry.runes, runeMaterial);
  const headBase = EXHALIS_ARROW.length - EXHALIS_ARROW.head.length;
  const swirl = new THREE.Group();
  swirl.name = 'exhalis-wind-swirl';
  arrow.add(swirl);
  const swirlLength = 0.13;
  const helix = new THREE.CatmullRomCurve3(Array.from({ length: 26 }, (_, index) => {
    const t = index / 25;
    const angle = t * Math.PI * 5;
    // Widest round the head's base, closing on the tip.
    const radius = 0.0105 * Math.sin(Math.PI * (0.15 + 0.75 * t));
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, -(headBase - swirlLength + 0.03 + t * swirlLength));
  }));
  add(swirl, 'arrow-swirl', new THREE.TubeGeometry(helix, 24, 0.0011, 3, false), swirlMaterial);
  const pulse = new THREE.Group();
  pulse.name = 'exhalis-charge-pulse';
  pulse.position.z = -(headBase + EXHALIS_ARROW.head.length * 0.3);
  pulse.visible = false;
  arrow.add(pulse);
  add(pulse, 'charge-pulse', new THREE.TorusGeometry(0.011, 0.0011, 3, 16), pulseMaterial);

  mergeAssemblies(bow);
  mergeAssemblies(group);
  group.scale.setScalar(config.scale);
  const liveParts = new ExhalisLiveParts({
    upperLimb, lowerLimb, upperString, lowerString, handle: frame, arrow, swirl, pulse, swirlMaterial, pulseMaterial, runeMaterial,
    upperRoot: R.top, lowerRoot: R.bottom, nock: new THREE.Vector3(0, 0, P.nockZ - P.riserZ),
  });
  return {
    group,
    muzzlePosition: new THREE.Vector3(0, P.nockY, P.riserZ - 0.035).multiplyScalar(config.scale),
    ejectionPosition: new THREE.Vector3(0.03, P.nockY, P.nockZ).multiplyScalar(config.scale),
    sightY: config.sightHeight * config.scale,
    energyMaterials: [inlay, breath],
    reloadParts: { magazine: ampoule },
    rightGrip: frame,
    liveParts,
  };
}
