import type { Zombie } from '../Zombie';
import {
  emergenceDuration,
  emergencePose,
  type ZombieEmergencePose,
  type ZombieEmergenceSite,
  type ZombieEmergenceStage,
  type ZombieEmergenceTiming,
} from './ZombieEmergence';

interface EmergenceRun {
  readonly site: ZombieEmergenceSite;
  readonly timing: ZombieEmergenceTiming;
  elapsed: number;
  breached: boolean;
}

/**
 * Bodies rising out of emergence sites. While a body rises it belongs here:
 * the owner leaves its steering, attacks and recovery alone, and this moves
 * it from inside the prop over the rim to the site's exit, where it is
 * released to hunt. Only rising bodies are visited.
 */
export class ZombieEmergences {
  public onStage: ((site: ZombieEmergenceSite, stage: ZombieEmergenceStage) => void) | null = null;
  private readonly runs = new Map<Zombie, EmergenceRun>();
  private readonly pose: ZombieEmergencePose = { rise: 0, climb: 0 };

  /** `zombie`, just spawned at the site's rise point, starts rising out of `site`. */
  public begin(zombie: Zombie, site: ZombieEmergenceSite, timing: ZombieEmergenceTiming): void {
    zombie.faceTowards(site.exit.x, site.exit.z);
    zombie.beginEmergence();
    this.runs.set(zombie, { site, timing, elapsed: 0, breached: false });
    this.onStage?.(site, 'stir');
  }

  public isEmerging(zombie: Zombie): boolean {
    return this.runs.has(zombie);
  }

  /** Moves a rising body on by `dt`; true while it is still rising, false once released (or never rising). */
  public advance(zombie: Zombie, dt: number): boolean {
    const run = this.runs.get(zombie);
    if (!run) return false;
    if (!zombie.isAlive) {
      this.runs.delete(zombie);
      return false;
    }
    const { site, timing } = run;
    run.elapsed += dt;
    if (!run.breached && run.elapsed >= timing.stir) {
      run.breached = true;
      this.onStage?.(site, 'breach');
    }
    if (run.elapsed >= emergenceDuration(timing)) {
      zombie.position.x = site.exit.x;
      zombie.position.z = site.exit.z;
      zombie.endEmergence();
      this.runs.delete(zombie);
      return false;
    }
    const pose = emergencePose(run.elapsed, timing, this.pose);
    const dx = site.exit.x - site.rise.x;
    const dz = site.exit.z - site.rise.z;
    zombie.position.x = site.rise.x + dx * pose.climb;
    zombie.position.z = site.rise.z + dz * pose.climb;
    zombie.setEmergencePose(pose.rise, pose.climb, site.rim, site.rimDistance - Math.hypot(dx, dz) * pose.climb);
    return true;
  }

  public reset(): void {
    this.runs.clear();
  }
}
