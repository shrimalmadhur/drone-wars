import { DEFAULT_MAP_THEME, sanitizeMapTheme } from './mapThemes.js';
import { evaluateAchievements } from './game/progression.js';

const PLAYER_NAME_KEY = 'drone-wars.player-name';
const MAP_THEME_KEY = 'drone-wars.map-theme';
const PLAYER_PROGRESS_KEY = 'drone-wars.player-progress';
const MAX_PLAYER_NAME_LENGTH = 24;

export const DEFAULT_PLAYER_PROGRESS = {
  bestScore: 0,
  bestWave: 0,
  totalRuns: 0,
  achievements: [],
};

function sanitizePlayerProgress(progress) {
  const achievements = Array.isArray(progress?.achievements)
    ? [...new Set(progress.achievements.filter(value => typeof value === 'string'))]
    : [];

  return {
    bestScore: Math.max(0, Number(progress?.bestScore) || 0),
    bestWave: Math.max(0, Number(progress?.bestWave) || 0),
    totalRuns: Math.max(0, Number(progress?.totalRuns) || 0),
    achievements,
  };
}

export function sanitizePlayerName(name) {
  if (typeof name !== 'string') {
    return '';
  }

  return name.trim().replace(/\s+/g, ' ').slice(0, MAX_PLAYER_NAME_LENGTH);
}

export function loadPlayerName(storage = globalThis?.localStorage) {
  try {
    return sanitizePlayerName(storage?.getItem(PLAYER_NAME_KEY) ?? '');
  } catch {
    return '';
  }
}

export function loadMapTheme(storage = globalThis?.localStorage) {
  try {
    return sanitizeMapTheme(storage?.getItem(MAP_THEME_KEY) ?? DEFAULT_MAP_THEME);
  } catch {
    return DEFAULT_MAP_THEME;
  }
}

export function loadPlayerProgress(storage = globalThis?.localStorage) {
  try {
    const raw = storage?.getItem(PLAYER_PROGRESS_KEY);
    if (!raw) {
      return { ...DEFAULT_PLAYER_PROGRESS };
    }
    return sanitizePlayerProgress(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PLAYER_PROGRESS };
  }
}

export function savePlayerName(name, storage = globalThis?.localStorage) {
  const sanitized = sanitizePlayerName(name);

  if (!sanitized) {
    return '';
  }

  try {
    storage?.setItem(PLAYER_NAME_KEY, sanitized);
  } catch {
    // Ignore storage failures so the game can still launch.
  }

  return sanitized;
}

export function saveMapTheme(theme, storage = globalThis?.localStorage) {
  const sanitized = sanitizeMapTheme(theme);

  try {
    storage?.setItem(MAP_THEME_KEY, sanitized);
  } catch {
    // Ignore storage failures so the game can still launch.
  }

  return sanitized;
}

export function savePlayerProgress(progress, storage = globalThis?.localStorage) {
  const sanitized = sanitizePlayerProgress(progress);

  try {
    storage?.setItem(PLAYER_PROGRESS_KEY, JSON.stringify(sanitized));
  } catch {
    // Ignore storage failures so the game can still launch.
  }

  return sanitized;
}

export function recordPlayerRun(runSummary, storage = globalThis?.localStorage) {
  const previous = loadPlayerProgress(storage);
  const unlocked = evaluateAchievements(runSummary);
  const achievements = [...new Set([...previous.achievements, ...unlocked])];
  const next = savePlayerProgress({
    bestScore: Math.max(previous.bestScore, runSummary?.score ?? 0),
    bestWave: Math.max(previous.bestWave, runSummary?.highestWave ?? 0),
    totalRuns: previous.totalRuns + 1,
    achievements,
  }, storage);

  return {
    progress: next,
    newAchievements: unlocked.filter(id => !previous.achievements.includes(id)),
  };
}
