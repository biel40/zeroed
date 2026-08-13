import { describe, expect, it, vi, afterEach } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';

describe('AudioSystem mystery box open sound', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads the MP3 asset and plays it when the box opens', async () => {
    const starts: Array<{ source: string; buffer: AudioBuffer | null }> = [];

    class FakeAudioContext {
      sampleRate = 44100;
      state = 'running';
      destination = {};

      createGain() {
        return {
          gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
        };
      }

      createBufferSource() {
        return {
          buffer: null as AudioBuffer | null,
          connect: vi.fn(),
          start: vi.fn(function (this: { buffer: AudioBuffer | null }) {
            starts.push({ source: 'buffer', buffer: this.buffer ?? null });
          }),
          stop: vi.fn(),
        };
      }

      createBuffer() {
        return {
          getChannelData: () => new Float32Array(1),
        };
      }

      createBiquadFilter() {
        return {
          type: 'lowpass',
          frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          Q: { value: 0 },
          connect: vi.fn(),
        };
      }

      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        };
      }

      decodeAudioData = vi.fn(async () => ({}) as AudioBuffer);
      resume = vi.fn(async () => {
        this.state = 'running';
      });
    }

    // @ts-expect-error: test-only browser API stub for Vitest
    globalThis.AudioContext = FakeAudioContext;

    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const audio = new AudioSystem();
    audio.resume();

    await audio.loadMysteryBoxOpenAsset();
    audio.playMysteryBoxOpen();

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('mystery_box_open.mp3'));
    expect(starts.length).toBeGreaterThan(0);
  });
});
