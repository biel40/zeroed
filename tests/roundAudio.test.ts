import { describe, expect, it } from 'vitest';
import { RoundCueGate } from '../src/audio/RoundCueGate';
import { VoiceLimiter } from '../src/audio/VoiceLimiter';

describe('RoundCueGate', () => {
  it('lets each round transition cue through exactly once', () => {
    const gate = new RoundCueGate();
    expect(gate.claim('start', 1)).toBe(true);
    expect(gate.claim('start', 1)).toBe(false);
    expect(gate.claim('end', 1)).toBe(true);
    expect(gate.claim('end', 1)).toBe(false);
    expect(gate.claim('start', 2)).toBe(true);
  });

  it('ignores stale rounds delivered late', () => {
    const gate = new RoundCueGate();
    gate.claim('start', 3);
    expect(gate.claim('start', 2)).toBe(false);
  });

  it('starts over from round one after a restart', () => {
    const gate = new RoundCueGate();
    gate.claim('start', 1);
    gate.claim('end', 1);
    gate.reset();
    expect(gate.claim('start', 1)).toBe(true);
    expect(gate.claim('end', 1)).toBe(true);
  });
});

describe('VoiceLimiter', () => {
  it('caps overlapping voices and frees slots as they finish', () => {
    const limiter = new VoiceLimiter(2, 0);
    expect(limiter.tryStart(0, 1, false)).toBe(true);
    expect(limiter.tryStart(0.1, 1, false)).toBe(true);
    expect(limiter.tryStart(0.2, 1, false)).toBe(false);
    expect(limiter.tryStart(1.05, 1, false)).toBe(true);
  });

  it('keeps reserved slots for nearby voices only', () => {
    const limiter = new VoiceLimiter(1, 1);
    expect(limiter.tryStart(0, 1, false)).toBe(true);
    expect(limiter.tryStart(0, 1, false)).toBe(false);
    expect(limiter.tryStart(0, 1, true)).toBe(true);
    expect(limiter.tryStart(0, 1, true)).toBe(false);
  });

  it('forgets every voice on reset', () => {
    const limiter = new VoiceLimiter(1, 0);
    limiter.tryStart(0, 10, false);
    limiter.reset();
    expect(limiter.tryStart(0.1, 1, false)).toBe(true);
  });
});
