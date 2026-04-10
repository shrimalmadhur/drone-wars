import { DEFAULT_MAP_THEME, sanitizeMapTheme } from './mapThemes.js';
import {
  calculateRunCurrency,
  createLifetimeStats,
  evaluateAchievements,
  mergeLifetimeStats,
} from './game/progression.js';
import { DEFAULT_LOADOUT, sanitizeLoadout, sanitizePreRunSelection } from './game/meta/loadout.js';
import { DEFAULT_UPGRADES, canPurchaseUpgrade, sanitizeUpgradeLevels } from './game/meta/upgrades.js';

const PLAYER_NAME_KEY = 'drone-wars.player-name';
const MAP_THEME_KEY = 'drone-wars.map-theme';
const PLAYER_PROGRESS_KEY = 'drone-wars.player-progress';
const MAX_PLAYER_NAME_LENGTH = 24;
const PLAYER_PROFILE_VERSION = 2;

export const DEFAULT_PLAYER_PROGRESS = {
  version: PLAYER_PROFILE_VERSION,
  profileId: '',
  bestScore: 0,
  bestWave: 0,
  currency: 0,
  totalRuns: 0,
  achievements: [],
  lifetimeStats: createLifetimeStats(),
  upgrades: { ...DEFAULT_UPGRADES },
  loadout: { ...DEFAULT_LOADOUT },
  missionUnlocks: {},
  preRunSelection: sanitizePreRunSelection(),
};

function createProfileId() {
  const cryptoApi = globalThis?.crypto;
  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }
  return `pilot-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizePlayerProgress(progress) {
  const achievements = Array.isArray(progress?.achievements)
    ? [...new Set(progress.achievements.filter(value => typeof value === 'string'))]
    : [];
  const missionUnlocks = typeof progress?.missionUnlocks === 'object' && progress?.missionUnlocks
    ? Object.fromEntries(
      Object.entries(progress.missionUnlocks).filter(([, value]) => Boolean(value)),
    )
    : {};

  return {
    version: PLAYER_PROFILE_VERSION,
    profileId: typeof progress?.profileId === 'string' && progress.profileId ? progress.profileId : createProfileId(),
    bestScore: Math.max(0, Number(progress?.bestScore) || 0),
    bestWave: Math.max(0, Number(progress?.bestWave) || 0),
    currency: Math.max(0, Number(progress?.currency) || 0),
    totalRuns: Math.max(0, Number(progress?.totalRuns) || 0),
    achievements,
    lifetimeStats: createLifetimeStats(progress?.lifetimeStats),
    upgrades: sanitizeUpgradeLevels(progress?.upgrades),
    loadout: sanitizeLoadout(progress?.loadout),
    missionUnlocks,
    preRunSelection: sanitizePreRunSelection(progress?.preRunSelection),
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
      return sanitizePlayerProgress(DEFAULT_PLAYER_PROGRESS);
    }
    return sanitizePlayerProgress(JSON.parse(raw));
  } catch {
    return sanitizePlayerProgress(DEFAULT_PLAYER_PROGRESS);
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

export function recordRunStart(storage = globalThis?.localStorage) {
  const previous = loadPlayerProgress(storage);
  const next = savePlayerProgress({
    ...previous,
    lifetimeStats: mergeLifetimeStats(previous.lifetimeStats, null, { runStarted: true }),
  }, storage);

  return { progress: next };
}

export function recordRunComplete(runSummary, storage = globalThis?.localStorage) {
  const previous = loadPlayerProgress(storage);
  const unlocked = evaluateAchievements(runSummary);
  const achievements = [...new Set([...previous.achievements, ...unlocked])];
  const currencyEarned = calculateRunCurrency(runSummary);
  const next = savePlayerProgress({
    ...previous,
    bestScore: Math.max(previous.bestScore, runSummary?.score ?? 0),
    bestWave: Math.max(previous.bestWave, runSummary?.highestWave ?? 0),
    currency: previous.currency + currencyEarned,
    totalRuns: previous.totalRuns + 1,
    achievements,
    lifetimeStats: mergeLifetimeStats(
      previous.lifetimeStats,
      runSummary,
      { runCompleted: true },
    ),
  }, storage);

  return {
    progress: next,
    newAchievements: unlocked.filter(id => !previous.achievements.includes(id)),
    currencyEarned,
    runSummary,
  };
}

export function recordPlayerRun(runSummary, storage = globalThis?.localStorage) {
  return recordRunComplete(runSummary, storage);
}

export function purchaseUpgrade(upgradeId, storage = globalThis?.localStorage) {
  const previous = loadPlayerProgress(storage);
  const check = canPurchaseUpgrade(previous, upgradeId);
  if (!check.ok) {
    return {
      ok: false,
      error: check.reason,
      progress: previous,
    };
  }

  const upgrades = {
    ...previous.upgrades,
    [upgradeId]: check.nextLevel,
  };
  const next = savePlayerProgress({
    ...previous,
    currency: previous.currency - check.cost,
    upgrades,
  }, storage);

  return {
    ok: true,
    cost: check.cost,
    progress: next,
  };
}

export function setPreRunSelection(selection, storage = globalThis?.localStorage) {
  const previous = loadPlayerProgress(storage);
  const next = savePlayerProgress({
    ...previous,
    preRunSelection: {
      ...previous.preRunSelection,
      ...sanitizePreRunSelection(selection),
    },
  }, storage);
  return next;
}

export function setEquippedAbility(ability, storage = globalThis?.localStorage) {
  const previous = loadPlayerProgress(storage);
  const next = savePlayerProgress({
    ...previous,
    loadout: {
      ...previous.loadout,
      ability,
    },
  }, storage);
  return next;
}
