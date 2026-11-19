import * as THREE from 'three';
import type { AudioSystem, ZombieMoanPlayback } from '../audio/AudioSystem';
import { spatialCue, type SpatialCue } from '../audio/SpatialCue';
import { ZombieMoanScheduler } from './ZombieMoanScheduler';
import type { Zombie } from './Zombie';

export interface ZombieMoanPopulation {
  readonly actives: ReadonlySet<Zombie>;
  networkIdOf(zombie: Zombie): number | null;
}

interface PlayingMoan {
  readonly zombie: Zombie;
  readonly spawnId: number | null;
  readonly playback: ZombieMoanPlayback;
}

/** Tracks the animated head and the current observer for the life of a moan. */
export class ZombieMoans {
  private readonly scheduler: ZombieMoanScheduler;
  private readonly listener = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly head = new THREE.Vector3();
  private readonly cue = { pan: 0, attenuation: 1, muffle: 0 };
  private playing: PlayingMoan | null = null;

  public constructor(random: () => number = Math.random) {
    this.scheduler = new ZombieMoanScheduler(random);
  }

  public update(dt: number, camera: THREE.Camera, population: ZombieMoanPopulation,
    audio: Pick<AudioSystem, 'playZombieMoan'>): void {
    const zombies = population.actives;
    if (zombies.size > 0) camera.getWorldPosition(this.listener);
    const next = this.scheduler.update(dt, zombies, this.listener);
    if (!this.playing && !next) return;
    camera.getWorldDirection(this.forward);

    const current = this.playing;
    if (current) {
      const { zombie, spawnId, playback } = current;
      if (!zombies.has(zombie) || !zombie.isAlive || zombie.state === 'spawn'
        || population.networkIdOf(zombie) !== spawnId) {
        playback.stop();
        this.playing = null;
      } else if (!playback.update(this.cueFor(zombie))) this.playing = null;
    }

    if (!next || this.playing) return;
    const playback = audio.playZombieMoan(this.cueFor(next));
    if (playback) this.playing = { zombie: next, spawnId: population.networkIdOf(next), playback };
  }

  public reset(): void {
    this.playing?.playback.stop();
    this.playing = null;
    this.scheduler.reset();
  }

  private cueFor(zombie: Zombie): SpatialCue {
    return spatialCue(this.listener, this.forward, zombie.headHitbox.getWorldPosition(this.head), this.cue);
  }
}
