import { describe, expect, it, vi } from 'vitest';

import { Game } from './Game.js';
import { GAME_STATES } from './state.js';

describe('Game run lifecycle', () => {
  it('records a completed run exactly once when entering game over', () => {
    const onRunComplete = vi.fn(() => ({
      progress: {
        bestScore: 1200,
        bestWave: 4,
        achievements: ['firstBlood'],
      },
    }));
    const game = {
      didRecordRun: false,
      onRunComplete,
      simulation: {
        state: {
          mode: GAME_STATES.GAME_OVER,
          bestScore: 0,
          bestWave: 0,
          achievementCount: 0,
        },
        getRunSummary: vi.fn(() => ({ score: 1200, highestWave: 4 })),
      },
    };

    Game.prototype.finalizeCompletedRun.call(game, GAME_STATES.GAME_OVER);
    Game.prototype.finalizeCompletedRun.call(game, GAME_STATES.GAME_OVER);

    expect(onRunComplete).toHaveBeenCalledTimes(1);
    expect(game.simulation.state.bestScore).toBe(1200);
    expect(game.simulation.state.bestWave).toBe(4);
    expect(game.simulation.state.achievementCount).toBe(1);
  });

  it('re-arms completion tracking when the next run starts', () => {
    const game = {
      didRecordRun: true,
      onRunComplete: vi.fn(),
      simulation: {
        state: {
          mode: GAME_STATES.RUNNING,
        },
        getRunSummary: vi.fn(),
      },
    };

    Game.prototype.finalizeCompletedRun.call(game, GAME_STATES.RUNNING);

    expect(game.didRecordRun).toBe(false);
    expect(game.onRunComplete).not.toHaveBeenCalled();
  });

  it('keeps externally provided input controllers alive on dispose', () => {
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('window', { removeEventListener: vi.fn() });
    vi.stubGlobal('document', { removeEventListener: vi.fn() });
    const input = { dispose: vi.fn() };
    const mount = {
      removeChild: vi.fn(),
    };
    const game = {
      frame: 0,
      onResize: () => {},
      onBlur: () => {},
      onVisibility: () => {},
      cameraShake: { reset: vi.fn() },
      clearHitIndicators: vi.fn(),
      explosions: { dispose: vi.fn() },
      scorePops: { dispose: vi.fn() },
      input,
      ownsInput: false,
      portalSystem: { dispose: vi.fn() },
      simulation: { dispose: vi.fn() },
      audio: { dispose: vi.fn(() => Promise.resolve()) },
      renderer: {
        dispose: vi.fn(),
        domElement: { parentNode: mount },
      },
      mount,
    };

    Game.prototype.dispose.call(game);

    expect(input.dispose).not.toHaveBeenCalled();
    expect(mount.removeChild).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
