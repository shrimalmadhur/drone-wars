import { describe, expect, it } from 'vitest';

import { createGameState, GAME_STATES, resetGameState } from './state.js';

describe('game state', () => {
  it('resets runtime fields for a fresh run', () => {
    const state = createGameState();
    state.mode = GAME_STATES.GAME_OVER;
    state.score = 999;
    state.wave = 7;
    state.health = 12;
    state.enemyCount = 14;
    state.status = 'bad';
    state.challenge = { id: 'daily-2026-04-14' };

    resetGameState(state);

    expect(state.mode).toBe(GAME_STATES.RUNNING);
    expect(state.score).toBe(0);
    expect(state.bestScore).toBe(0);
    expect(state.bestWave).toBe(0);
    expect(state.achievementCount).toBe(0);
    expect(state.wave).toBe(0);
    expect(state.health).toBe(100);
    expect(state.enemyCount).toBe(0);
    expect(state.status).toContain('Sweep');
    expect(state.challenge).toBeNull();
  });
});
