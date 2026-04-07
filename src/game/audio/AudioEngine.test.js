import { describe, expect, it, vi } from 'vitest';

import { CONFIG } from '../config.js';
import { AudioEngine } from './AudioEngine.js';

function createFakeContext() {
  const gain = {
    value: 1,
    setValueAtTime(value) {
      this.value = value;
    },
  };

  return {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    resume: vi.fn(async function resume() {
      this.state = 'running';
    }),
    close: vi.fn(async () => {}),
    createGain() {
      return {
        gain,
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    },
  };
}

describe('AudioEngine', () => {
  it('no-ops gracefully when audio context support is unavailable', async () => {
    const engine = new AudioEngine({ globalObject: {} });

    await expect(engine.resume()).resolves.toBe(false);
    expect(() => engine.toggleMute()).not.toThrow();
    expect(() => engine.updateMissileFlybys({ x: 0, y: 0, z: 0 }, [])).not.toThrow();
  });

  it('applies mute state to the master gain once resumed', async () => {
    const context = createFakeContext();
    const engine = new AudioEngine({
      createContext: () => context,
      globalObject: {},
    });

    engine.toggleMute();
    await engine.resume();
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(engine.masterGain.gain.value).toBe(0);

    engine.toggleMute();
    expect(engine.masterGain.gain.value).toBe(CONFIG.audio.masterVolume);
  });

  it('returns false instead of rejecting when resume fails', async () => {
    const engine = new AudioEngine({
      createContext: () => {
        throw new Error('boom');
      },
      globalObject: {},
    });

    await expect(engine.resume()).resolves.toBe(false);
    expect(engine.context).toBe(null);
    expect(engine.masterGain).toBe(null);
  });

  it('enforces flyby cooldowns per missile id', () => {
    const engine = new AudioEngine({ globalObject: {} });
    engine.context = { currentTime: 0 };
    engine.playMissileFlyby = vi.fn();

    engine.updateMissileFlybys(
      { x: 0, y: 0, z: 0 },
      [{ id: 'm1', x: 10, y: 0, z: 0 }, { id: 'm2', x: 12, y: 0, z: 0 }],
    );
    engine.updateMissileFlybys(
      { x: 0, y: 0, z: 0 },
      [{ id: 'm1', x: 9, y: 0, z: 0 }],
    );
    engine.context.currentTime = 2.1;
    engine.updateMissileFlybys(
      { x: 0, y: 0, z: 0 },
      [{ id: 'm1', x: 8, y: 0, z: 0 }],
    );

    expect(engine.playMissileFlyby).toHaveBeenCalledTimes(3);
  });

  it('swallows close failures during dispose', async () => {
    const engine = new AudioEngine({ globalObject: {} });
    engine.context = {
      close: vi.fn(async () => {
        throw new Error('cannot close');
      }),
    };
    engine.masterGain = { gain: { value: 1 } };

    await expect(engine.dispose()).resolves.toBeUndefined();
    expect(engine.context).toBe(null);
    expect(engine.masterGain).toBe(null);
  });
});
