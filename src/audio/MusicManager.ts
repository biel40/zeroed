export type MusicTrackName = 'zombies_round_start' | 'zombies_background_loop';

export const ZOMBIES_MUSIC_PATHS = {
  roundStart: `${import.meta.env.BASE_URL}assets/audio/zombies_round_start.mp3`,
  backgroundLoop: `${import.meta.env.BASE_URL}assets/audio/zombies_background_loop.mp3`,
} as const;

interface MusicTrackDef {
  readonly name: MusicTrackName;
  readonly path: string;
  readonly volume: number;
  readonly loop: boolean;
}

const MUSIC_TRACKS: Record<MusicTrackName, MusicTrackDef> = {
  zombies_round_start: {
    name: 'zombies_round_start',
    path: ZOMBIES_MUSIC_PATHS.roundStart,
    volume: 0.6,
    loop: false,
  },
  zombies_background_loop: {
    name: 'zombies_background_loop',
    path: ZOMBIES_MUSIC_PATHS.backgroundLoop,
    volume: 0.22,
    loop: true,
  },
};
const ROUND_START_DURATION_MS = 3000;

export class MusicManager {
  private readonly players = new Map<MusicTrackName, HTMLAudioElement>();
  private readonly pauseOffsets = new Map<MusicTrackName, number>();
  private currentTrack: MusicTrackName | null = null;
  private roundStartTimer: ReturnType<typeof setTimeout> | null = null;

  private getPlayer(name: MusicTrackName): HTMLAudioElement | null {
    if (typeof Audio === 'undefined') return null;

    let player = this.players.get(name);
    if (!player) {
      const def = MUSIC_TRACKS[name];
      player = new Audio(def.path);
      player.preload = 'auto';
      player.loop = def.loop;
      player.volume = def.volume;
      if (typeof player.load === 'function') player.load();
      this.players.set(name, player);
    }
    return player;
  }

  preload(): void {
    for (const name of Object.keys(MUSIC_TRACKS) as MusicTrackName[]) {
      const player = this.getPlayer(name);
      if (!player) continue;
      if (player.readyState === 0 && typeof player.load === 'function') player.load();
    }
  }

  resume(): void {
    for (const [name, player] of this.players) {
      if (!player.paused) continue;
      const offset = this.pauseOffsets.get(name) ?? player.currentTime;
      player.currentTime = Math.max(0, offset);
      void player.play().catch(() => undefined);
    }
    this.pauseOffsets.clear();
  }

  pause(): void {
    for (const [name, player] of this.players) {
      if (player.paused) continue;
      this.pauseOffsets.set(name, player.currentTime);
      player.pause();
    }
  }

  stop(): void {
    this.currentTrack = null;
    this.pauseOffsets.clear();
    if (this.roundStartTimer !== null) {
      globalThis.clearTimeout(this.roundStartTimer);
      this.roundStartTimer = null;
    }
    for (const player of this.players.values()) {
      player.pause();
      player.currentTime = 0;
      player.loop = false;
    }
  }

  stopBackgroundLoop(): void {
    const player = this.players.get('zombies_background_loop');
    if (!player) return;
    this.currentTrack = null;
    this.pauseOffsets.set('zombies_background_loop', 0);
    player.pause();
    player.currentTime = 0;
  }

  playRoundStartOnce(): void {
    const name: MusicTrackName = 'zombies_round_start';
    const player = this.getPlayer(name);
    if (!player) return;

    const isAlreadyPlaying = this.currentTrack === name && !player.paused && !player.ended;
    if (isAlreadyPlaying) return;

    this.currentTrack = name;
    player.currentTime = 0;
    player.loop = false;
    player.volume = MUSIC_TRACKS[name].volume;
    void player.play().catch(() => undefined);

    if (this.roundStartTimer !== null) globalThis.clearTimeout(this.roundStartTimer);
    this.roundStartTimer = globalThis.setTimeout(() => {
      if (!player.paused) {
        player.pause();
        player.currentTime = 0;
      }
      this.roundStartTimer = null;
      this.currentTrack = null;
    }, ROUND_START_DURATION_MS);
  }

  startBackgroundLoop(): void {
    const name: MusicTrackName = 'zombies_background_loop';
    const player = this.getPlayer(name);
    if (!player) return;
    if (!player.paused) return;

    this.currentTrack = name;
    player.currentTime = this.pauseOffsets.get(name) ?? 0;
    player.loop = true;
    player.volume = MUSIC_TRACKS[name].volume;
    void player.play().catch(() => undefined);
  }
}
