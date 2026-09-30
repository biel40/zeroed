export type ZombiesRunState = 'PLAYING' | 'ENDING' | 'CREDITS' | 'FINISHED' | 'GAME_OVER';

export const NUCLEAR_ENDING_DURATION = 18;

export class ZombiesRunFlow {
  private current: ZombiesRunState = 'PLAYING';
  private endingElapsed = 0;

  constructor(readonly endingDuration = NUCLEAR_ENDING_DURATION) {}

  get state(): ZombiesRunState {
    return this.current;
  }

  get acceptsGameplay(): boolean {
    return this.current === 'PLAYING';
  }

  beginEnding(): boolean {
    if (this.current !== 'PLAYING') return false;
    this.current = 'ENDING';
    this.endingElapsed = 0;
    return true;
  }

  update(dt: number): boolean {
    if (this.current !== 'ENDING') return false;
    this.endingElapsed += Math.max(0, dt);
    if (this.endingElapsed < this.endingDuration) return false;
    this.current = 'CREDITS';
    return true;
  }

  finish(): boolean {
    if (this.current !== 'CREDITS') return false;
    this.current = 'FINISHED';
    return true;
  }

  gameOver(): boolean {
    if (this.current !== 'PLAYING') return false;
    this.current = 'GAME_OVER';
    return true;
  }

  reset(): void {
    this.current = 'PLAYING';
    this.endingElapsed = 0;
  }
}
