import { ABILITY_DEFINITIONS } from './abilities.js';
import { ARCHETYPE_DEFINITIONS } from './archetypes.js';
import { MUTATOR_DEFINITIONS } from './mutators.js';
import { MAP_THEMES } from '../../mapThemes.js';

export const CHALLENGE_MODES = Object.freeze({
  STANDARD: 'standard',
  DAILY: 'daily',
});

const MAP_THEME_ROTATION = Object.freeze([
  MAP_THEMES.FRONTIER,
  MAP_THEMES.CITY,
]);

const ARCHETYPE_ROTATION = Object.freeze([
  'control',
  'interceptor',
  'bruiser',
]);

const ABILITY_ROTATION = Object.freeze([
  'pulse',
  'dash',
]);

const MUTATOR_ROTATION = Object.freeze([
  'highRisk',
  'scavenger',
  'pulsePilot',
]);

export function sanitizeChallengeMode(mode) {
  return mode === CHALLENGE_MODES.DAILY ? CHALLENGE_MODES.DAILY : CHALLENGE_MODES.STANDARD;
}

export function toDateKey(date = new Date()) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickByHash(items, hash, shift) {
  const index = ((hash >>> shift) % items.length + items.length) % items.length;
  return items[index];
}

export function createRandomSeed(random = Math.random) {
  return Math.max(1, Math.floor(random() * 0x100000000) >>> 0);
}

export function createDailyChallenge(date = new Date()) {
  const dateKey = toDateKey(date);
  const hash = hashString(`drone-wars:${dateKey}`);
  const seed = Math.max(1, (hash ^ 0x9e3779b9) >>> 0);
  const mapTheme = pickByHash(MAP_THEME_ROTATION, hash, 0);
  const archetype = pickByHash(ARCHETYPE_ROTATION, hash, 4);
  const ability = pickByHash(ABILITY_ROTATION, hash, 8);
  const mutator = pickByHash(MUTATOR_ROTATION, hash, 12);

  return {
    id: `daily-${dateKey}`,
    mode: CHALLENGE_MODES.DAILY,
    dateKey,
    label: `Daily Challenge ${dateKey}`,
    shortLabel: `Daily ${dateKey}`,
    seed,
    mapTheme,
    loadout: {
      archetype,
      ability,
      mutator,
    },
    summary: [
      ARCHETYPE_DEFINITIONS[archetype]?.label ?? archetype,
      ABILITY_DEFINITIONS[ability]?.label ?? ability,
      MUTATOR_DEFINITIONS[mutator]?.label ?? mutator,
    ].join(' · '),
  };
}
