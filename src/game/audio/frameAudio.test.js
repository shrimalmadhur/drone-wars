import { describe, expect, it, vi } from 'vitest';

import { GAME_STATES } from '../state.js';
import { applyAudioFrame, createAudioFrameState } from './frameAudio.js';

function createAudioSpy() {
  return {
    startContinuous: vi.fn(),
    stopContinuous: vi.fn(),
    startLowHealthWarning: vi.fn(),
    stopLowHealthWarning: vi.fn(),
    playGameOver: vi.fn(),
    playPlayerFire: vi.fn(),
    playExplosion: vi.fn(),
    playImpact: vi.fn(),
    playPlayerHit: vi.fn(),
    playEnemyFire: vi.fn(),
    playWaveComplete: vi.fn(),
    playLockOn: vi.fn(),
    setEngineSpeed: vi.fn(),
    updateMissileFlybys: vi.fn(),
  };
}

function createSnapshot(overrides = {}) {
  return {
    mode: GAME_STATES.RUNNING,
    health: 100,
    fireFlash: 0,
    killEvents: [],
    impactEvents: [],
    damageEvents: [],
    fireEvents: [],
    waveCompleteEvents: [],
    missilePositions: [],
    playerPosition: { x: 0, y: 0, z: 0 },
    ...overrides,
  };
}

describe('frame audio decisions', () => {
  it('starts loops, triggers rising-edge cues, and updates flybys while running', () => {
    const audio = createAudioSpy();
    const state = createAudioFrameState(GAME_STATES.BOOT);

    applyAudioFrame({
      audio,
      snapshot: createSnapshot({
        fireFlash: 0.12,
        killEvents: [{ position: { x: 1, y: 2, z: 3 } }],
        impactEvents: [{ x: 2, y: 3, z: 4 }],
        damageEvents: [{ sourceX: 3, sourceY: 4, sourceZ: 5, damage: 10 }],
        fireEvents: [{ x: 4, y: 5, z: 6, type: 'drone' }],
        waveCompleteEvents: [{ wave: 1 }],
        missilePositions: [{ id: 'm1', x: 4, y: 0, z: 0 }],
      }),
      aimLocked: true,
      state,
      lowHealthThreshold: 25,
      playerSpeed: 42,
    });

    expect(audio.startContinuous).toHaveBeenCalledTimes(1);
    expect(audio.playPlayerFire).toHaveBeenCalledTimes(1);
    expect(audio.playExplosion).toHaveBeenCalledTimes(1);
    expect(audio.playImpact).toHaveBeenCalledTimes(1);
    expect(audio.playPlayerHit).toHaveBeenCalledTimes(1);
    expect(audio.playEnemyFire).toHaveBeenCalledTimes(1);
    expect(audio.playWaveComplete).toHaveBeenCalledTimes(1);
    expect(audio.playLockOn).toHaveBeenCalledTimes(1);
    expect(audio.setEngineSpeed).toHaveBeenCalledWith(42);
    expect(audio.updateMissileFlybys).toHaveBeenCalledWith(
      { x: 0, y: 0, z: 0 },
      [{ id: 'm1', x: 4, y: 0, z: 0 }],
    );
  });

  it('stops loops and plays game over only on the running-to-game-over edge', () => {
    const audio = createAudioSpy();
    const state = createAudioFrameState(GAME_STATES.RUNNING);

    applyAudioFrame({
      audio,
      snapshot: createSnapshot({ mode: GAME_STATES.GAME_OVER }),
      aimLocked: false,
      state,
      lowHealthThreshold: 25,
      playerSpeed: 0,
    });
    applyAudioFrame({
      audio,
      snapshot: createSnapshot({ mode: GAME_STATES.GAME_OVER }),
      aimLocked: false,
      state,
      lowHealthThreshold: 25,
      playerSpeed: 0,
    });

    expect(audio.stopContinuous).toHaveBeenCalledTimes(1);
    expect(audio.stopLowHealthWarning).toHaveBeenCalledTimes(1);
    expect(audio.playGameOver).toHaveBeenCalledTimes(1);
  });

  it('does not retrigger fire or lock-on and toggles low-health warning on threshold crossings', () => {
    const audio = createAudioSpy();
    const state = createAudioFrameState(GAME_STATES.RUNNING);

    applyAudioFrame({
      audio,
      snapshot: createSnapshot({ health: 20, fireFlash: 0.08 }),
      aimLocked: true,
      state,
      lowHealthThreshold: 25,
      playerSpeed: 10,
    });
    applyAudioFrame({
      audio,
      snapshot: createSnapshot({ health: 20, fireFlash: 0.08 }),
      aimLocked: true,
      state,
      lowHealthThreshold: 25,
      playerSpeed: 10,
    });
    applyAudioFrame({
      audio,
      snapshot: createSnapshot({ health: 40, fireFlash: 0 }),
      aimLocked: false,
      state,
      lowHealthThreshold: 25,
      playerSpeed: 10,
    });

    expect(audio.playPlayerFire).toHaveBeenCalledTimes(1);
    expect(audio.playLockOn).toHaveBeenCalledTimes(1);
    expect(audio.startLowHealthWarning).toHaveBeenCalledTimes(1);
    expect(audio.stopLowHealthWarning).toHaveBeenCalledTimes(1);
  });
});
