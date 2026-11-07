import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicManager, ZOMBIES_MUSIC_PATHS } from '../src/audio/MusicManager';

class FakeAudio {
  public static players: FakeAudio[] = [];
  public static failing = new Set<string>();
  public currentTime = 0;
  public volume = 1;
  public loop = false;
  public paused = true;
  public ended = false;
  public readyState = 0;

  public constructor(public readonly src: string) {
    FakeAudio.players.push(this);
  }

  public play = vi.fn(() => {
    if (FakeAudio.failing.has(this.src)) return Promise.reject(new Error('NotSupportedError'));
    this.paused = false;
    return Promise.resolve();
  });

  public pause = vi.fn(() => {
    this.paused = true;
  });

  public load = vi.fn(() => {
    this.readyState = 4;
  });
}

const BED = 'station33_theme';
const THEME = 'captain_ussr_theme';
const player = (src: string): FakeAudio | undefined => FakeAudio.players.find((candidate) => candidate.src === src);

function music(): MusicManager {
  const manager = new MusicManager();
  manager.setEnabled(true);
  manager.startGameplayLoop(BED);
  return manager;
}

describe('Duel theme', () => {
  beforeEach(() => {
    FakeAudio.players = [];
    FakeAudio.failing = new Set();
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pauses the map\'s bed under the duel and gives it back where it left off', async () => {
    const manager = music();
    const bed = player(ZOMBIES_MUSIC_PATHS.station33)!;
    bed.currentTime = 42;
    manager.startDuelTheme(THEME);
    await Promise.resolve();
    const theme = player(ZOMBIES_MUSIC_PATHS.captainUssr)!;
    expect(bed.paused).toBe(true);
    expect(theme.paused).toBe(false);
    expect(theme.loop).toBe(true);
    expect(theme.currentTime).toBe(0);

    manager.stopDuelTheme();
    expect(theme.paused).toBe(true);
    expect(bed.paused).toBe(false);
    expect(bed.currentTime).toBe(42);
  });

  it('fades the theme with its level, on top of the music volume', () => {
    const manager = music();
    manager.startDuelTheme(THEME);
    const theme = player(ZOMBIES_MUSIC_PATHS.captainUssr)!;
    const full = theme.volume;
    expect(full).toBeGreaterThan(0);
    manager.setDuelThemeLevel(0.25);
    expect(theme.volume).toBeCloseTo(full * 0.25, 6);
    manager.setDuelThemeLevel(-1);
    expect(theme.volume).toBe(0);
  });

  it('keeps the map\'s bed when the theme\'s file is missing', async () => {
    FakeAudio.failing.add(ZOMBIES_MUSIC_PATHS.captainUssr);
    const manager = music();
    manager.startDuelTheme(THEME);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(player(ZOMBIES_MUSIC_PATHS.station33)!.paused).toBe(false);
    // Nothing left to stop: the bed keeps playing.
    manager.stopDuelTheme();
    expect(player(ZOMBIES_MUSIC_PATHS.station33)!.paused).toBe(false);
  });

  it('is not preloaded with the other tracks: it loads when a duel starts', () => {
    const manager = new MusicManager();
    manager.setEnabled(true);
    manager.preload();
    expect(player(ZOMBIES_MUSIC_PATHS.captainUssr)).toBeUndefined();
    expect(player(ZOMBIES_MUSIC_PATHS.station33)).toBeDefined();
  });

  it('holds through the pause menu and never starts the bed while paused', () => {
    const manager = music();
    manager.startDuelTheme(THEME);
    const theme = player(ZOMBIES_MUSIC_PATHS.captainUssr)!;
    const bed = player(ZOMBIES_MUSIC_PATHS.station33)!;
    manager.pause();
    expect(theme.paused).toBe(true);
    manager.stopDuelTheme();
    expect(bed.paused).toBe(true);
    manager.resume();
    expect(bed.paused).toBe(false);
    expect(theme.paused).toBe(true);
  });

  it('does not let the match start the bed again over a playing duel', () => {
    const manager = music();
    manager.startDuelTheme(THEME);
    manager.startGameplayLoop(BED);
    expect(player(ZOMBIES_MUSIC_PATHS.station33)!.paused).toBe(true);
  });

  it('stays silent while music is disabled', () => {
    const manager = new MusicManager();
    manager.startDuelTheme(THEME);
    manager.stopDuelTheme();
    expect(FakeAudio.players).toEqual([]);
  });

  it('forgets the duel when every track stops', () => {
    const manager = music();
    manager.startDuelTheme(THEME);
    manager.stop();
    manager.startGameplayLoop(BED);
    expect(player(ZOMBIES_MUSIC_PATHS.station33)!.paused).toBe(false);
    expect(player(ZOMBIES_MUSIC_PATHS.captainUssr)!.paused).toBe(true);
  });
});
