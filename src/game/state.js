import { CONFIG } from './config.js';

export const GAME_STATES = {
  BOOT: 'boot',
  RUNNING: 'running',
  PAUSED: 'paused',
  GAME_OVER: 'gameOver',
};

export function createGameState() {
  return {
    mode: GAME_STATES.BOOT,
    score: 0,
    bestScore: 0,
    bestWave: 0,
    achievementCount: 0,
    wave: 0,
    health: CONFIG.player.maxHealth,
    enemyCount: 0,
    time: 0,
    status: 'Sweep the battlefield.',
    mission: null,
    waveDirective: null,
  };
}

export function resetGameState(state) {
  state.mode = GAME_STATES.RUNNING;
  state.score = 0;
  state.bestScore = 0;
  state.bestWave = 0;
  state.achievementCount = 0;
  state.wave = 0;
  state.health = CONFIG.player.maxHealth;
  state.enemyCount = 0;
  state.time = 0;
  state.status = 'Sweep the battlefield.';
  state.mission = null;
  state.waveDirective = null;
  return state;
}
