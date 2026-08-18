import { describe, expect, it } from 'vitest';
import { ZombiesRunFlow } from '../src/zombies/ZombiesRunFlow';

describe('ZombiesRunFlow', () => {
  it('performs the ending transition exactly once', () => {
    const flow = new ZombiesRunFlow(2);
    expect(flow.state).toBe('PLAYING');
    expect(flow.beginEnding()).toBe(true);
    expect(flow.beginEnding()).toBe(false);
    expect(flow.update(1.99)).toBe(false);
    expect(flow.update(0.01)).toBe(true);
    expect(flow.state).toBe('CREDITS');
    expect(flow.finish()).toBe(true);
    expect(flow.finish()).toBe(false);
    expect(flow.state).toBe('FINISHED');
  });

  it('keeps death mutually exclusive with the successful ending', () => {
    const flow = new ZombiesRunFlow();
    expect(flow.gameOver()).toBe(true);
    expect(flow.beginEnding()).toBe(false);
    flow.reset();
    expect(flow.beginEnding()).toBe(true);
    expect(flow.gameOver()).toBe(false);
  });
});
