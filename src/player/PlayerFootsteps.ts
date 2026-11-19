import { FOOTSTEP_MIX, FOOTSTEP_STANCE_LOUDNESS, type FootSide, type FootstepSurface } from '../config/footsteps';
import { lerp } from '../utils/math';
import { footstepSurfaceAt, type ArenaFootstepSurfaces } from '../zombies/maps/FootstepSurfaces';
import type { PlayerStance } from './PlayerStance';
import type { WalkGaitSample } from './WalkGait';

/** What sounds a step (the AudioSystem). */
export interface FootstepPlayer {
  playFootstep(surface: FootstepSurface, foot: FootSide, loudness: number): void;
}

/**
 * The local player's footsteps: one per footfall of the shared walking cycle
 * (the same one the head and weapon bob follow), on whatever the map says
 * lies underfoot at that moment. Deterministic; the caller decides when steps
 * are audible (not during menus, cinematics or death).
 */
export class PlayerFootsteps {
  private surfaces: ArenaFootstepSurfaces | null = null;
  private heardFootfalls = 0;

  public constructor(private readonly player: FootstepPlayer) {}

  public setSurfaces(surfaces: ArenaFootstepSurfaces | null): void {
    this.surfaces = surfaces;
  }

  /** Footfalls while not `audible` are passed over, never played late. */
  public update(gait: WalkGaitSample, x: number, z: number, floor: number, stance: PlayerStance, audible: boolean): void {
    const footfalls = gait.footfalls;
    if (footfalls === this.heardFootfalls) return;
    this.heardFootfalls = footfalls;
    const stanceLoudness = FOOTSTEP_STANCE_LOUDNESS[stance];
    if (!audible || stanceLoudness <= 0) return;
    const loudness = stanceLoudness * lerp(FOOTSTEP_MIX.slowPaceLoudness, 1, gait.intensity);
    this.player.playFootstep(footstepSurfaceAt(this.surfaces, x, z, floor), footfalls % 2 === 0 ? 'left' : 'right', loudness);
  }
}
