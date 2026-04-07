/**
 * Lightweight GA4 event tracking for gameplay events.
 * Calls window.gtag() if available; silently no-ops otherwise.
 */
function track(eventName, params = {}) {
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}

export function trackGameStart(playerName, mapTheme) {
  track('game_start', { player_name: playerName, map_theme: mapTheme });
}

export function trackGameRestart(score, wave) {
  track('game_restart', { final_score: score, final_wave: wave });
}

export function trackWaveStart(wave) {
  track('wave_start', { wave_number: wave });
}

export function trackWaveComplete(wave, durationSeconds) {
  track('wave_complete', {
    wave_number: wave,
    wave_duration_sec: Math.round(durationSeconds),
  });
}

export function trackEnemyKilled(enemyType, scoreValue, wave) {
  track('enemy_killed', {
    enemy_type: enemyType,
    score_value: scoreValue,
    wave_number: wave,
  });
}

export function trackGameOver(score, wave, timePlayed) {
  track('game_over', {
    final_score: score,
    final_wave: wave,
    time_played_sec: Math.round(timePlayed),
  });
}
