const PLAYER_NAME_KEY = 'drone-wars.player-name';
const MAX_PLAYER_NAME_LENGTH = 24;

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
