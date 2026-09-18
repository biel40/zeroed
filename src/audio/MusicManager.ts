export type MusicTrackName =
  | 'zombies_round_start'
  | 'menu_theme'
  | 'background_music_theme';

export const ZOMBIES_MUSIC_PATHS = {
  roundStart: `${import.meta.env.BASE_URL}assets/audio/zombies_round_start.mp3`,
  menu: `${import.meta.env.BASE_URL}assets/audio/menu_theme.mp3`,
  gameplay: `${import.meta.env.BASE_URL}assets/audio/background_music_theme.mp3`,
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
  menu_theme: {
    name: 'menu_theme',
    path: ZOMBIES_MUSIC_PATHS.menu,
    volume: 0.22,
    loop: true,
  },
  background_music_theme: {
    name: 'background_music_theme',
    path: ZOMBIES_MUSIC_PATHS.gameplay,
    volume: 0.2,
    loop: true,
  },
};

export class MusicManager {
  public enabled = false;
  private readonly players = new Map<MusicTrackName, HTMLAudioElement>();
  private readonly pauseOffsets = new Map<MusicTrackName, number>();

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  private getPlayer(name: MusicTrackName): HTMLAudioElement | null {
    if (!this.enabled || typeof Audio === 'undefined') return null;

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
    if (!this.enabled) return;
    for (const name of Object.keys(MUSIC_TRACKS) as MusicTrackName[]) {
      const player = this.getPlayer(name);
      if (!player) continue;
      if (player.readyState === 0 && typeof player.load === 'function') player.load();
    }
  }

  resume(): void {
    if (!this.enabled) return;
    // Only tracks explicitly paused (pause()) resume here; a freshly
    // preloaded-but-never-played track must wait for its own trigger
    // (playRoundStartOnce / startMenuLoop), not restart on every gesture.
    for (const [name, offset] of this.pauseOffsets) {
      const player = this.players.get(name);
      if (!player) continue;
      player.currentTime = Math.max(0, offset);
      void player.play().catch(() => undefined);
    }
    this.pauseOffsets.clear();
  }

  pause(): void {
    if (!this.enabled) return;
    for (const [name, player] of this.players) {
      if (player.paused) continue;
      this.pauseOffsets.set(name, player.currentTime);
      player.pause();
    }
  }

  stop(): void {
    this.pauseOffsets.clear();
    for (const player of this.players.values()) {
      player.pause();
      player.currentTime = 0;
    }
  }

  stopMenuLoop(): void {
    if (!this.enabled) return;
    const player = this.players.get('menu_theme');
    if (!player) return;
    // A hard stop, not a pause-for-later: must NOT land in pauseOffsets, or
    // the next resume() call replays it straight over the match's audio.
    this.pauseOffsets.delete('menu_theme');
    player.pause();
    player.currentTime = 0;
  }

  playRoundStartOnce(): void {
    if (!this.enabled) return;
    const name: MusicTrackName = 'zombies_round_start';
    const player = this.getPlayer(name);
    if (!player) return;

    const isAlreadyPlaying = !player.paused && !player.ended;
    if (isAlreadyPlaying) return;

    player.currentTime = 0;
    player.loop = false;
    player.volume = MUSIC_TRACKS[name].volume;
    void player.play().catch(() => undefined);
  }

  startMenuLoop(): void {
    if (!this.enabled) return;
    const name: MusicTrackName = 'menu_theme';
    const player = this.getPlayer(name);
    if (!player) return;
    if (!player.paused) return;

    player.currentTime = this.pauseOffsets.get(name) ?? 0;
    player.loop = true;
    player.volume = MUSIC_TRACKS[name].volume;
    void player.play().catch(() => undefined);
  }

  /** Gameplay bed: starts once at match start and keeps looping through rounds. */
  startGameplayLoop(): void {
    if (!this.enabled) return;
    const name: MusicTrackName = 'background_music_theme';
    const player = this.getPlayer(name);
    if (!player) return;
    if (!player.paused) return;

    player.loop = true;
    player.volume = MUSIC_TRACKS[name].volume;
    void player.play().catch(() => undefined);
  }
}
