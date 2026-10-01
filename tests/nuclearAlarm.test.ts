import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MusicManager,
  NUCLEAR_EXPLOSION_AUDIO_DELAY,
  ZOMBIES_MUSIC_PATHS,
} from '../src/audio/MusicManager';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { NUCLEAR_ENDING_DURATION, ZombiesRunFlow } from '../src/zombies/ZombiesRunFlow';

class FakeAudio {
  static players: FakeAudio[] = [];
  currentTime = 0;
  loop = false;
  volume = 1;
  paused = true;
  play = vi.fn(() => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn(() => { this.paused = true; });
  constructor(readonly src: string) { FakeAudio.players.push(this); }
}

describe('nuclear ending audio', () => {
  afterEach(() => {
    FakeAudio.players = [];
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('replaces gameplay, loops once, and cannot resume after credits', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const music = new MusicManager();
    music.setEnabled(true);
    music.startGameplayLoop();
    music.startEndingAudio();
    vi.advanceTimersByTime(NUCLEAR_EXPLOSION_AUDIO_DELAY * 1000);
    const [gameplay, alarm, explosion, radioactivity] = FakeAudio.players;
    expect(gameplay.paused).toBe(true);
    expect(alarm.src).toBe(ZOMBIES_MUSIC_PATHS.nuclearAlarm);
    expect(alarm.loop).toBe(true);
    expect(explosion.src).toBe(ZOMBIES_MUSIC_PATHS.nuclearExplosion);
    expect(explosion.loop).toBe(false);
    expect(radioactivity.src).toBe(ZOMBIES_MUSIC_PATHS.radioactivity);
    expect(radioactivity.loop).toBe(true);
    music.startEndingAudio();
    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(explosion.play).toHaveBeenCalledTimes(1);
    expect(radioactivity.play).toHaveBeenCalledTimes(1);
    alarm.currentTime = 1;
    music.pause();
    music.stopEndingAudio();
    music.resume();
    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(alarm.currentTime).toBe(0);
    expect(explosion.paused).toBe(true);
    expect(radioactivity.paused).toBe(true);
    expect(explosion.play).toHaveBeenCalledTimes(1);
    expect(radioactivity.play).toHaveBeenCalledTimes(1);
  });

  it('holds the explosion until the on-screen detonation', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const music = new MusicManager();
    music.setEnabled(true);
    music.preload();
    const explosion = FakeAudio.players.find(p => p.src === ZOMBIES_MUSIC_PATHS.nuclearExplosion)!;
    const alarm = FakeAudio.players.find(p => p.src === ZOMBIES_MUSIC_PATHS.nuclearAlarm)!;
    music.startEndingAudio();
    expect(alarm.play).toHaveBeenCalledTimes(1);
    expect(explosion.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(NUCLEAR_EXPLOSION_AUDIO_DELAY * 1000 - 1);
    expect(explosion.play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(explosion.play).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending explosion when the ending audio stops early', () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const music = new MusicManager();
    music.setEnabled(true);
    music.preload();
    const explosion = FakeAudio.players.find(p => p.src === ZOMBIES_MUSIC_PATHS.nuclearExplosion)!;
    music.startEndingAudio();
    music.stopEndingAudio();
    vi.advanceTimersByTime(NUCLEAR_EXPLOSION_AUDIO_DELAY * 1000 * 2);
    expect(explosion.play).not.toHaveBeenCalled();
    music.startEndingAudio();
    music.stop();
    vi.advanceTimersByTime(NUCLEAR_EXPLOSION_AUDIO_DELAY * 1000 * 2);
    expect(explosion.play).not.toHaveBeenCalled();
  });

  it('tolerates a missing or unplayable asset', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    const music = new MusicManager();
    music.setEnabled(true);
    music.preload();
    const alarm = FakeAudio.players.find(p => p.src === ZOMBIES_MUSIC_PATHS.nuclearAlarm)!;
    alarm.play.mockRejectedValue(new Error('Asset missing'));
    music.startEndingAudio();
    vi.advanceTimersByTime(NUCLEAR_EXPLOSION_AUDIO_DELAY * 1000);
    await Promise.resolve();
    for (const player of FakeAudio.players.filter(p =>
      p.src === ZOMBIES_MUSIC_PATHS.nuclearExplosion || p.src === ZOMBIES_MUSIC_PATHS.radioactivity)) {
      expect(player.play).toHaveBeenCalledTimes(1);
    }
    expect(() => music.stopEndingAudio()).not.toThrow();
    expect(alarm.paused).toBe(true);
  });

  it('stops the single-player alarm exactly when the ending reaches credits', () => {
    const mode = new ZombiesMode();
    const stopEndingAudio = vi.fn();
    const showCredits = vi.fn();
    const internals = mode as unknown as {
      ctx: unknown;
      arena: unknown;
      runFlow: ZombiesRunFlow;
    };
    internals.ctx = { audio: { stopEndingAudio }, hud: { showCredits } };
    internals.arena = { update: vi.fn() };
    internals.runFlow.beginEnding();
    mode.update(NUCLEAR_ENDING_DURATION - 0.1);
    expect(stopEndingAudio).not.toHaveBeenCalled();
    mode.update(0.11);
    expect(stopEndingAudio).toHaveBeenCalledTimes(1);
    expect(showCredits).toHaveBeenCalledTimes(1);
    mode.update(1);
    expect(stopEndingAudio).toHaveBeenCalledTimes(1);
  });
});
