import { PROTOCOL33_DEPARTURE, PROTOCOL33_ESCAPE_HORDE } from '../Station33Config';
import { createEscapeDrivePose, escapeDrivePose, escapeHordeDue, escapeHordeSpot } from './EscapeDrive';
import type { EscapeTruck } from './EscapeTruck';
import type { YardGate } from './YardGate';

/** Asks for one zombie of the escape's horde at a yard spot; true when it came out. */
export type EscapeHordeRequest = (x: number, z: number) => boolean;

/**
 * The map side of Station 33's filmed ending: from `start`, the truck and
 * the gate follow `escapeDrivePose` on the ending's clock and the horde is
 * let out of the stairhead on `PROTOCOL33_ESCAPE_HORDE`'s schedule (a
 * refused zombie is asked for again next frame). Before it (and after
 * `reset`) both stand as the run left them: truck parked, doors open, lamps
 * dark, gate shut.
 */
export class EscapeDeparture {
  private readonly pose = createEscapeDrivePose();
  private readonly spot = { x: 0, z: 0 };
  /** Seconds since boarding, or null while the truck waits. */
  private elapsed: number | null = null;
  /** Zombies of the horde already out. */
  private released = 0;

  public constructor(
    private readonly truck: EscapeTruck,
    private readonly gate: YardGate,
    private readonly requestZombie: EscapeHordeRequest,
  ) {
    this.apply(0);
  }

  public start(): void {
    this.elapsed = 0;
    this.released = 0;
    this.apply(0);
  }

  public update(dt: number): void {
    if (this.elapsed === null) return;
    this.elapsed += Math.max(0, dt);
    this.apply(this.elapsed);
    this.releaseHorde(this.elapsed);
  }

  public reset(): void {
    this.elapsed = null;
    this.released = 0;
    this.apply(0);
  }

  private apply(time: number): void {
    escapeDrivePose(time, PROTOCOL33_DEPARTURE, this.pose);
    this.truck.pose(this.pose);
    this.gate.swing(this.pose.gateSwing);
  }

  private releaseHorde(time: number): void {
    const due = escapeHordeDue(time, PROTOCOL33_ESCAPE_HORDE);
    while (this.released < due) {
      const { x, z } = escapeHordeSpot(this.released, PROTOCOL33_ESCAPE_HORDE, this.spot);
      if (!this.requestZombie(x, z)) return;
      this.released++;
    }
  }
}
