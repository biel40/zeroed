import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RING_FINGERS, type RingFinger } from '../game/rings/RingCatalog';
import type { FirstPersonArm } from './FirstPersonArm';

/** A worn ring glows while it holds a charge and goes dull once spent. */
export type HandRingState = 'charged' | 'spent';

/** The band's inner edge rests on the skin: the unit torus spans 0.84..1.16. */
const BAND_CLEARANCE = 1.17;
const CHARGED_GLOW = 1.1;
/** Seconds for a pulse (putting the ring on, the ring firing) to fade. */
const PULSE_DECAY = 2.2;

let sharedGeometry: THREE.BufferGeometry | null = null;
let sharedBand: THREE.MeshStandardMaterial | null = null;
let sharedSpent: THREE.MeshStandardMaterial | null = null;

/**
 * Unit ring around the local Z axis (the finger) with an enamel bezel on
 * its +X side (the back of the finger): group 0 is the band, 1 the enamel.
 */
function ringGeometry(): THREE.BufferGeometry {
  if (sharedGeometry) return sharedGeometry;
  const band = new THREE.TorusGeometry(1, 0.16, 6, 20);
  const bezel = new THREE.CylinderGeometry(0.42, 0.42, 0.22, 10).rotateZ(Math.PI / 2).translate(1.12, 0, 0);
  for (const part of [band, bezel]) part.deleteAttribute('uv');
  const merged = mergeGeometries([band, bezel], true);
  band.dispose();
  bezel.dispose();
  if (!merged) throw new Error('Hand ring parts are incompatible');
  sharedGeometry = merged;
  return merged;
}

/** View-model only materials: never shared with the world or weapon views. */
function bandMaterial(): THREE.MeshStandardMaterial {
  sharedBand ??= new THREE.MeshStandardMaterial({ name: 'hand-ring-band', color: 0xb9b4a8, roughness: 0.32, metalness: 1 });
  return sharedBand;
}

function spentMaterial(): THREE.MeshStandardMaterial {
  sharedSpent ??= new THREE.MeshStandardMaterial({ name: 'hand-ring-enamel-spent', color: 0x2c3534, roughness: 0.6, metalness: 0.1 });
  return sharedSpent;
}

/**
 * A ring being put on: still out of sight on its way to the hand, or held
 * somewhere off its seat (carried, then slid along the finger).
 */
type DonningState = 'unseen' | 'held';

interface RingSlot {
  readonly finger: RingFinger;
  readonly mesh: THREE.Mesh;
  readonly lit: THREE.MeshStandardMaterial;
  /** Seat position in the bone frame, and the finger length from there to the tip. */
  readonly seat: THREE.Vector3;
  readonly toTip: number;
  state: HandRingState | null;
  pulse: number;
  donning: DonningState | null;
}

/**
 * Rings worn on one first-person hand, one per finger. Each ring is a
 * child of its finger's proximal bone, so it follows every pose without
 * touching it. Rings are hidden until worn and carry no light: a charged
 * ring glows through its own enamel. The owner (`ViewArms`) applies the
 * view-model depth compression to these materials with the arm's.
 */
export class HandRings {
  private readonly slots = new Map<RingFinger, RingSlot>();
  private warmup = false;

  constructor(arm: FirstPersonArm) {
    const geometry = ringGeometry();
    const side = arm.side === 'right' ? 1 : -1;
    for (const finger of RING_FINGERS) {
      const { bone, along, toTip, halfWidth, back, front } = arm.ringSeat(finger);
      const lit = new THREE.MeshStandardMaterial({ name: `hand-ring-enamel-${finger}`, roughness: 0.25, metalness: 0.1 });
      const mesh = new THREE.Mesh(geometry, [bandMaterial(), lit]);
      mesh.name = `hand-ring-${arm.side}-${finger}`;
      // Centred on the finger section (deeper toward the pad than the back) and
      // fitted to it; mirrored on the left hand so the bezel stays on the back.
      const depth = (back + front) / 2;
      mesh.position.set(((back - front) / 2) * side, 0, -along);
      mesh.scale.set(depth * BAND_CLEARANCE * side, halfWidth * BAND_CLEARANCE, depth * BAND_CLEARANCE);
      mesh.visible = false;
      mesh.frustumCulled = false;
      bone.add(mesh);
      this.slots.set(finger, { finger, mesh, lit, seat: mesh.position.clone(), toTip, state: null, pulse: 0, donning: null });
    }
  }

  /** Puts a ring on `finger` (or changes its state), glowing in `glowColor` while charged. */
  show(finger: RingFinger, state: HandRingState, glowColor: number): void {
    const slot = this.slots.get(finger)!;
    slot.state = state;
    slot.lit.color.setHex(glowColor);
    slot.lit.emissive.setHex(glowColor);
    this.apply(slot);
  }

  /** Takes every ring off: a new run. */
  clear(): void {
    for (const slot of this.slots.values()) {
      slot.state = null;
      slot.pulse = 0;
      this.seat(slot.finger);
    }
  }

  /** The ring of `finger` is being put on: out of sight until the other hand brings it. */
  beginDonning(finger: RingFinger): void {
    const slot = this.slots.get(finger)!;
    slot.donning = 'unseen';
    this.apply(slot);
  }

  /** While being put on, the ring of `finger` sits at world `point`, still facing along the finger. */
  hold(finger: RingFinger, point: THREE.Vector3): void {
    const slot = this.slots.get(finger)!;
    slot.donning = 'held';
    slot.mesh.position.copy(slot.mesh.parent!.worldToLocal(point.clone()));
    this.apply(slot);
  }

  /** Puts the ring of `finger` on its seat: done being put on. */
  seat(finger: RingFinger): void {
    const slot = this.slots.get(finger)!;
    slot.donning = null;
    slot.mesh.position.copy(slot.seat);
    this.apply(slot);
  }

  /**
   * World point of the ring centre on `finger` after sliding `distance`
   * metres from its seat toward the tip (past it beyond `tipDistance`), on
   * the finger as it is posed now. Exact for a straight finger.
   */
  alongFinger(finger: RingFinger, distance: number, out: THREE.Vector3): THREE.Vector3 {
    const slot = this.slots.get(finger)!;
    out.copy(slot.seat);
    out.z -= distance;
    return slot.mesh.parent!.localToWorld(out);
  }

  /** Finger length from the seat of `finger` out to its tip. */
  tipDistance(finger: RingFinger): number {
    return this.slots.get(finger)!.toTip;
  }

  /** Brief flare of a worn ring: 1 is the strongest (the ring firing). */
  pulse(finger: RingFinger, strength: number): void {
    const slot = this.slots.get(finger)!;
    slot.pulse = Math.max(slot.pulse, strength);
    this.apply(slot);
  }

  /** Whether a ring is currently visible on `finger`. */
  isWorn(finger: RingFinger): boolean {
    return this.slots.get(finger)!.mesh.visible;
  }

  /**
   * Shows every ring, charged and spent, so `Game.prepare` compiles their
   * shaders even though a run starts with none worn.
   */
  setWarmup(enabled: boolean): void {
    this.warmup = enabled;
    for (const slot of this.slots.values()) this.apply(slot);
  }

  update(dt: number): void {
    for (const slot of this.slots.values()) {
      if (slot.pulse <= 0) continue;
      slot.pulse = Math.max(0, slot.pulse - PULSE_DECAY * dt);
      this.apply(slot);
    }
  }

  private apply(slot: RingSlot): void {
    // Warm-up alternates both enamel variants across the fingers.
    const state = this.warmup ? (RING_FINGERS.indexOf(slot.finger) % 2 === 0 ? 'charged' : 'spent') : slot.state;
    slot.mesh.visible = state !== null && (this.warmup || slot.donning !== 'unseen');
    // A spent ring flares too as it fires, then its enamel goes dark.
    const glowing = state === 'charged' || slot.pulse > 0;
    (slot.mesh.material as THREE.Material[])[1] = glowing ? slot.lit : spentMaterial();
    slot.lit.emissiveIntensity = (state === 'charged' ? CHARGED_GLOW : 0) + slot.pulse * 3;
  }
}
