import * as THREE from 'three';
import type { Zombie } from './Zombie';

/** Pooled positional sources: only the nearest zombies ever get one. */
const MAX_AUDIBLE_ZOMBIES = 8;
/** Zombies farther than this are never assigned a source, meters. */
const AUDIBLE_RADIUS = 22;
/** Seconds between nearest-zombie reassignment passes (never per frame). */
const REASSESS_INTERVAL = 0.25;
/**
 * Panner tuning for the 'inverse' distance model: full volume within
 * REF_DISTANCE, a natural 1/d falloff beyond it, clamped at MAX_DISTANCE.
 */
const REF_DISTANCE = 2;
const MAX_DISTANCE = 28;
const ROLLOFF_FACTOR = 1;
/** Meters walked per step: the cadence derives from measured ground speed. */
const STRIDE_LENGTH = 0.7;
const MIN_STEP_INTERVAL = 0.24;
const MAX_STEP_INTERVAL = 1.1;
/** Below this measured speed the zombie is blocked or shoved, not walking. */
const MIN_WALK_SPEED = 0.2;
/** Timing/rate jitter so the horde never marches in perfect sync. */
const STEP_TIMING_JITTER = 0.18;
const MIN_PLAYBACK_RATE = 0.9;
const MAX_PLAYBACK_RATE = 1.12;
const STEP_VOLUME = 0.6;
/** Seconds of the synthesized fallback step. */
const FALLBACK_STEP_DURATION = 0.16;
/** Short grace so a zombie resuming movement steps promptly, not instantly. */
const RESUME_STEP_DELAY = 0.12;
/** Height above the zombie origin (floor) the steps emit from. */
const STEP_EMIT_HEIGHT = 0.1;

/**
 * Optional real footstep sample overriding the synthesized fallback: drop a
 * short, dry single-step file at public/assets/audio/zombies/footsteps.mp3
 * (see ASSETS.md). A missing file never breaks the game: the fallback stays.
 */
const FOOTSTEP_URL = `${import.meta.env.BASE_URL}assets/audio/zombies/footsteps.mp3`;

/**
 * Picks the maxCount closest candidates within radius, nearest first.
 * 3D distance: a zombie one floor up reads as far, not close. Pure and
 * unit-tested without a scene.
 */
export function pickAudibleZombies<T extends { readonly x: number; readonly y: number; readonly z: number }>(
  candidates: readonly T[],
  listenerX: number,
  listenerY: number,
  listenerZ: number,
  maxCount: number,
  radius: number,
): T[] {
  const radiusSq = radius * radius;
  return candidates
    .map((candidate) => {
      const dx = candidate.x - listenerX;
      const dy = candidate.y - listenerY;
      const dz = candidate.z - listenerZ;
      return { candidate, distSq: dx * dx + dy * dy + dz * dz };
    })
    .filter((entry) => entry.distSq <= radiusSq)
    .sort((a, b) => a.distSq - b.distSq)
    .slice(0, Math.max(0, maxCount))
    .map((entry) => entry.candidate);
}

/**
 * Seconds between steps at the given ground speed, clamped so very slow or
 * very fast zombies never fall into machine-gun or frozen cadences. Pure.
 */
export function stepIntervalForSpeed(speed: number): number {
  if (speed <= 0) return MAX_STEP_INTERVAL;
  return Math.min(MAX_STEP_INTERVAL, Math.max(MIN_STEP_INTERVAL, STRIDE_LENGTH / speed));
}

interface FootstepSlot {
  readonly audio: THREE.PositionalAudio;
  zombie: Zombie | null;
  lastX: number;
  lastZ: number;
  stepTimer: number;
}

/**
 * Positional zombie footsteps on a shoestring budget: ONE AudioListener on
 * the player camera (sharing the AudioSystem's single AudioContext — one
 * context per page keeps mobile browsers happy) and a small pool of
 * PositionalAudio sources reassigned every REASSESS_INTERVAL to the nearest
 * alive zombies. Per frame the pool only syncs positions and step timers for
 * the assigned few; the expensive "who is closest" pass runs 4x per second.
 *
 * A step only plays while the zombie is in 'walk' AND actually displacing —
 * attacking, spawning, blocked and dying zombies stay silent. Death releases
 * the source immediately. One shared AudioBuffer for every source; a real
 * sample dropped at FOOTSTEP_URL replaces the synthesized fallback at load.
 */
export class ZombieFootsteps {
  private readonly root = new THREE.Group();
  private readonly slots: FootstepSlot[] = [];
  private listener: THREE.AudioListener | null = null;
  private reassessTimer = 0;
  private readonly tmpListenerPos = new THREE.Vector3();

  constructor(
    parent: THREE.Object3D,
    private readonly camera: THREE.Camera,
  ) {
    this.root.name = 'zombie-footsteps';
    parent.add(this.root);
  }

  /**
   * audioContext is AudioSystem.rawContext: null until the first user
   * gesture creates it, which simply delays initialization until then.
   */
  update(dt: number, zombies: ReadonlySet<Zombie>, audioContext: AudioContext | null): void {
    if (!this.listener) {
      if (!audioContext) return;
      this.initAudio(audioContext);
    }
    this.camera.getWorldPosition(this.tmpListenerPos);

    this.reassessTimer -= dt;
    if (this.reassessTimer <= 0) {
      this.reassessTimer = REASSESS_INTERVAL;
      this.reassign(zombies);
    }

    for (const slot of this.slots) {
      const zombie = slot.zombie;
      if (!zombie) continue;
      // Death or pool recycling releases the source immediately.
      if (!zombie.isAlive) {
        this.releaseSlot(slot, true);
        continue;
      }
      const pos = zombie.position;
      slot.audio.position.set(pos.x, pos.y + STEP_EMIT_HEIGHT, pos.z);

      if (dt <= 0) {
        slot.lastX = pos.x;
        slot.lastZ = pos.z;
        continue;
      }
      // Measured speed, not the configured one: a zombie pushing against a
      // wall is NOT stepping even while its state says 'walk'.
      const speed = Math.hypot(pos.x - slot.lastX, pos.z - slot.lastZ) / dt;
      slot.lastX = pos.x;
      slot.lastZ = pos.z;

      if (zombie.state !== 'walk' || speed < MIN_WALK_SPEED) {
        slot.stepTimer = Math.min(slot.stepTimer, RESUME_STEP_DELAY);
        continue;
      }
      slot.stepTimer -= dt;
      if (slot.stepTimer <= 0) {
        this.playStep(slot.audio);
        slot.stepTimer =
          stepIntervalForSpeed(speed) * (1 + (Math.random() * 2 - 1) * STEP_TIMING_JITTER);
      }
    }
  }

  /** Run restart: silence every source and drop every assignment at once. */
  reset(): void {
    for (const slot of this.slots) this.releaseSlot(slot, true);
    this.reassessTimer = 0;
  }

  private initAudio(context: AudioContext): void {
    // The listener MUST run on the game's single AudioContext: getContext()
    // would otherwise spawn a second one (mobile browsers cap contexts).
    THREE.AudioContext.setContext(context);
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);

    const fallback = this.buildFallbackStep(context);
    for (let i = 0; i < MAX_AUDIBLE_ZOMBIES; i++) {
      const audio = new THREE.PositionalAudio(this.listener);
      audio.setDistanceModel('inverse');
      audio.setRefDistance(REF_DISTANCE);
      audio.setMaxDistance(MAX_DISTANCE);
      audio.setRolloffFactor(ROLLOFF_FACTOR);
      audio.setBuffer(fallback);
      audio.setVolume(STEP_VOLUME);
      this.root.add(audio);
      this.slots.push({ audio, zombie: null, lastX: 0, lastZ: 0, stepTimer: 0 });
    }
    this.loadFootstepAsset(context);
  }

  /** Same graceful-absence pattern as AudioSystem.loadMysteryBoxOpenAsset. */
  private loadFootstepAsset(context: AudioContext): void {
    fetch(FOOTSTEP_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        for (const slot of this.slots) slot.audio.setBuffer(buffer);
      })
      .catch((error: unknown) => {
        console.warn(
          '[ZombieFootsteps] No footstep sample available; synthesized fallback stays active.',
          error,
        );
      });
  }

  /**
   * Synthesized single step: a low fleshy thump with a fast pitch drop plus
   * a short noise shuffle, both under exponential decays. Generated directly
   * into an AudioBuffer — no base64, no extra assets.
   */
  private buildFallbackStep(context: AudioContext): AudioBuffer {
    const rate = context.sampleRate;
    const length = Math.max(1, Math.floor(FALLBACK_STEP_DURATION * rate));
    const buffer = context.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const progress = t / FALLBACK_STEP_DURATION;
      const frequency = 85 - 40 * progress;
      phase += (2 * Math.PI * frequency) / rate;
      const thump = Math.sin(phase) * Math.exp(-t * 26);
      const shuffle = (Math.random() * 2 - 1) * Math.exp(-t * 55) * 0.35;
      data[i] = (thump * 0.8 + shuffle) * 0.9;
    }
    return buffer;
  }

  /** Re-picks which zombies own the pooled sources, nearest-first. */
  private reassign(zombies: ReadonlySet<Zombie>): void {
    const pos = this.tmpListenerPos;
    const candidates: { zombie: Zombie; x: number; y: number; z: number }[] = [];
    for (const zombie of zombies) {
      if (!zombie.isAlive) continue;
      candidates.push({ zombie, x: zombie.position.x, y: zombie.position.y, z: zombie.position.z });
    }
    const picked = pickAudibleZombies(
      candidates,
      pos.x,
      pos.y,
      pos.z,
      MAX_AUDIBLE_ZOMBIES,
      AUDIBLE_RADIUS,
    );
    const keep = new Set(picked.map((entry) => entry.zombie));
    for (const slot of this.slots) {
      // Reassignment is not an emergency: a playing step finishes its short
      // tail instead of being hard-stopped mid-thump.
      if (slot.zombie && !keep.has(slot.zombie)) this.releaseSlot(slot, false);
    }
    for (const entry of picked) {
      if (this.slots.some((slot) => slot.zombie === entry.zombie)) continue;
      const free = this.slots.find((slot) => slot.zombie === null);
      if (!free) return;
      free.zombie = entry.zombie;
      free.lastX = entry.x;
      free.lastZ = entry.z;
      // Random first-step delay: assigned zombies never start in lockstep.
      free.stepTimer = Math.random() * 0.3;
    }
  }

  private releaseSlot(slot: FootstepSlot, stopSound: boolean): void {
    if (stopSound && slot.audio.isPlaying) slot.audio.stop();
    slot.zombie = null;
    slot.stepTimer = 0;
  }

  private playStep(audio: THREE.PositionalAudio): void {
    // THREE.Audio.play() warns and no-ops while playing; restart instead.
    if (audio.isPlaying) audio.stop();
    audio.setPlaybackRate(
      MIN_PLAYBACK_RATE + Math.random() * (MAX_PLAYBACK_RATE - MIN_PLAYBACK_RATE),
    );
    audio.play();
  }
}
