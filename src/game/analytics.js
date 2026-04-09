/**
 * Lightweight GA4 event tracking for gameplay events.
 * Calls gtag() if available; silently no-ops otherwise.
 */
function track(eventName, params = {}) {
  const gtag = globalThis?.gtag ?? globalThis?.window?.gtag;
  if (typeof gtag === 'function') {
    gtag('event', eventName, params);
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

export function trackRunStarted({ profileId, runId, runIndex, mapTheme } = {}) {
  track('run_started', {
    profile_id: profileId,
    run_id: runId,
    run_index: runIndex,
    map_theme: mapTheme,
  });
}

export function trackRunCompleted({ profileId, runId, runIndex, score, wave, currencyEarned } = {}) {
  track('run_completed', {
    profile_id: profileId,
    run_id: runId,
    run_index: runIndex,
    final_score: score,
    final_wave: wave,
    currency_earned: currencyEarned,
  });
}

export function trackRunSummaryViewed({ profileId, runId, runIndex } = {}) {
  track('run_summary_viewed', {
    profile_id: profileId,
    run_id: runId,
    run_index: runIndex,
  });
}

export function trackRunRestartedFromSummary({ profileId, runId, runIndex } = {}) {
  track('run_restarted_from_summary', {
    profile_id: profileId,
    run_id: runId,
    run_index: runIndex,
  });
}

export function trackUpgradePurchased({ profileId, upgradeId, newLevel, cost } = {}) {
  track('upgrade_purchased', {
    profile_id: profileId,
    upgrade_id: upgradeId,
    new_level: newLevel,
    upgrade_cost: cost,
  });
}
