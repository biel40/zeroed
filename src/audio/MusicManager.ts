import { NUCLEAR_DETONATION_TIME } from '../zombies/ZombiesRunFlow';
import { musicGain, onSettingsChange } from '../core/PlayerSettings';

export type MusicTrackName =
  | 'zombies_round_start'
  | 'menu_theme'
  | 'nuclear_alarm'
  | 'nuclear_explosion'
  | 'radioactivity'
  | 'background_music_theme';

export const ZOMBIES_MUSIC_PATHS = {
  roundStart: `${import.meta.env.BASE_URL}assets/audio/zombies_round_start.mp3`,
  menu: `${import.meta.env.BASE_URL}assets/audio/menu_theme.mp3`,
  gameplay: `${import.meta.env.BASE_URL}assets/audio/background_music_theme.mp3`,
  nuclearAlarm: `${import.meta.env.BASE_URL}assets/audio/nuclear_alarm.mp3`,
  nuclearExplosion: `${import.meta.env.BASE_URL}assets/audio/nuclear_explosion.mp3`,
  radioactivity: `${import.meta.env.BASE_URL}assets/audio/radioactivity.mp3`,
} as const;

interface MusicTrackDef {
  readonly name: MusicTrackName;
  readonly path: string;
  readonly volume: number;
  readonly loop: boolean;
}

const MUSIC_TRACKS: Record<MusicTrackName, MusicTrackDef> = {
  nuclear_explosion: {
    name: 'nuclear_explosion',
    path: ZOMBIES_MUSIC_PATHS.nuclearExplosion,
    volume: 0.45,
    loop: false,
  },
  radioactivity: {
    name: 'radioactivity',
    path: ZOMBIES_MUSIC_PATHS.radioactivity,
    volume: 0.25,
    loop: true,
  },
  nuclear_alarm: {
    name: 'nuclear_alarm',
    path: ZOMBIES_MUSIC_PATHS.nuclearAlarm,
    volume: 0.6,
    loop: true,
  },
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

/** nuclear_explosion.mp3 opens with ~0.5 s of silence before the blast. */
const NUCLEAR_EXPLOSION_ONSET = 0.5;
/** Seconds to hold the explosion track so its blast lands on the visual flash. */
export const NUCLEAR_EXPLOSION_AUDIO_DELAY = NUCLEAR_DETONATION_TIME - NUCLEAR_EXPLOSION_ONSET;

/** Audio sets a map ending can request through `ArenaEnding.audio`. */
export type EndingAudioId = 'nuclear';

interface EndingAudioDef {
  /** Every track of the ending; all are created up front so they buffer together. */
  readonly tracks: readonly MusicTrackName[];
  /** One-shot held back so its hit lands on a beat of the cinematic. */
  readonly delayed: MusicTrackName;
  readonly delaySeconds: number;
}

const ENDING_AUDIO: Record<EndingAudioId, EndingAudioDef> = {
  nuclear: {
    tracks: ['nuclear_alarm', 'nuclear_explosion', 'radioactivity'],
    delayed: 'nuclear_explosion',
    delaySeconds: NUCLEAR_EXPLOSION_AUDIO_DELAY,
  },
};
const ENDING_TRACKS: readonly MusicTrackName[] = Object.values(ENDING_AUDIO).flatMap((ending) => ending.tracks);

export class MusicManager {
  public enabled = false;
  private readonly players = new Map<MusicTrackName, HTMLAudioElement>();
  private readonly pauseOffsets = new Map<MusicTrackName, number>();
  private endingAudioStarted = false;
  private explosionTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor() {
    // The manager lives for the whole page, so the subscription is never removed.
    onSettingsChange(() => {
      for (const [name, player] of this.players) player.volume = this.volumeOf(name);
    });
  }

  private volumeOf(name: MusicTrackName): number {
    return MUSIC_TRACKS[name].volume * musicGain();
  }

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
      player.volume = this.volumeOf(name);
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
    this.endingAudioStarted = false;
    this.cancelPendingExplosion();
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

  /**
   * The ending's loops start together; its delayed one-shot (the nuclear
   * blast) waits so it lands on the cinematic's beat.
   */
  startEndingAudio(id: EndingAudioId): void {
    if (!this.enabled || this.endingAudioStarted) return;
    this.stop();
    this.endingAudioStarted = true;
    const ending = ENDING_AUDIO[id];
    for (const name of ending.tracks) {
      // The delayed element is still created now so it buffers meanwhile.
      const player = this.getPlayer(name);
      if (player && name !== ending.delayed) void player.play().catch(() => undefined);
    }
    this.explosionTimer = setTimeout(() => {
      this.explosionTimer = null;
      if (!this.endingAudioStarted) return;
      const player = this.getPlayer(ending.delayed);
      if (player) void player.play().catch(() => undefined);
    }, ending.delaySeconds * 1000);
  }

  stopEndingAudio(): void {
    this.endingAudioStarted = false;
    this.cancelPendingExplosion();
    for (const name of ENDING_TRACKS) {
      this.pauseOffsets.delete(name);
      const player = this.players.get(name);
      if (!player) continue;
      player.pause();
      player.currentTime = 0;
    }
  }

  private cancelPendingExplosion(): void {
    if (this.explosionTimer === null) return;
    clearTimeout(this.explosionTimer);
    this.explosionTimer = null;
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
    player.volume = this.volumeOf(name);
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
    player.volume = this.volumeOf(name);
    void player.play().catch(() => undefined);
  }

  /** Gameplay bed (the map's track): starts once at match start and keeps looping through rounds. */
  startGameplayLoop(name: MusicTrackName): void {
    if (!this.enabled) return;
    const player = this.getPlayer(name);
    if (!player) return;
    if (!player.paused) return;

    player.loop = true;
    player.volume = this.volumeOf(name);
    void player.play().catch(() => undefined);
  }
}
