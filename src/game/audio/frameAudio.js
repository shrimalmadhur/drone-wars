import { GAME_STATES } from '../state.js';

export function createAudioFrameState(initialMode = GAME_STATES.BOOT) {
  return {
    lastMode: initialMode,
    lastAimLocked: false,
    lowHealthActive: false,
    lastFireFlash: 0,
  };
}

export function applyAudioFrame({
  audio,
  snapshot,
  aimLocked,
  state,
  lowHealthThreshold,
  playerSpeed,
}) {
  const previousMode = state.lastMode;
  const currentMode = snapshot.mode;

  if (previousMode !== currentMode) {
    if (previousMode === GAME_STATES.RUNNING && currentMode !== GAME_STATES.RUNNING) {
      audio.stopContinuous();
      audio.stopLowHealthWarning();
    }
    if (currentMode === GAME_STATES.RUNNING) {
      audio.startContinuous();
    }
    if (previousMode === GAME_STATES.RUNNING && currentMode === GAME_STATES.GAME_OVER) {
      audio.playGameOver();
    }
  }

  if (snapshot.fireFlash > 0 && snapshot.fireFlash > state.lastFireFlash) {
    audio.playPlayerFire();
  }

  for (const kill of snapshot.killEvents) {
    audio.playExplosion(kill.position);
  }
  for (const impact of snapshot.impactEvents) {
    audio.playImpact(impact);
  }
  for (const damage of snapshot.damageEvents) {
    audio.playPlayerHit(damage);
  }
  for (const fire of snapshot.fireEvents) {
    audio.playEnemyFire(fire);
  }
  for (const waveEvent of snapshot.waveCompleteEvents) {
    audio.playWaveComplete(waveEvent);
  }

  if (!state.lastAimLocked && aimLocked) {
    audio.playLockOn();
  }

  const lowHealth = currentMode === GAME_STATES.RUNNING && snapshot.health < lowHealthThreshold;
  if (lowHealth && !state.lowHealthActive) {
    audio.startLowHealthWarning();
  } else if (!lowHealth && state.lowHealthActive) {
    audio.stopLowHealthWarning();
  }

  if (currentMode === GAME_STATES.RUNNING) {
    audio.setEngineSpeed(playerSpeed);
    audio.updateMissileFlybys(snapshot.playerPosition, snapshot.missilePositions);
  }

  state.lastMode = currentMode;
  state.lastAimLocked = aimLocked;
  state.lowHealthActive = lowHealth;
  state.lastFireFlash = snapshot.fireFlash;
  return state;
}
