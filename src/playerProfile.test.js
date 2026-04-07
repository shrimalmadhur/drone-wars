import { describe, expect, it } from 'vitest';

import { MAP_THEMES } from './mapThemes.js';
import {
  loadMapTheme,
  loadPlayerName,
  sanitizePlayerName,
  saveMapTheme,
  savePlayerName,
} from './playerProfile.js';

function createStorage() {
  const values = new Map();

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('player profile', () => {
  it('sanitizes names for display and storage', () => {
    expect(sanitizePlayerName('   Ace    Pilot   ')).toBe('Ace Pilot');
    expect(sanitizePlayerName('x'.repeat(40))).toHaveLength(24);
  });

  it('loads and saves the player name via storage', () => {
    const storage = createStorage();

    expect(savePlayerName('  Phoenix   Leader ', storage)).toBe('Phoenix Leader');
    expect(loadPlayerName(storage)).toBe('Phoenix Leader');
  });

  it('loads and saves the selected map theme via storage', () => {
    const storage = createStorage();

    expect(saveMapTheme(MAP_THEMES.CITY, storage)).toBe(MAP_THEMES.CITY);
    expect(loadMapTheme(storage)).toBe(MAP_THEMES.CITY);
    expect(saveMapTheme('bogus-theme', storage)).toBe(MAP_THEMES.FRONTIER);
    expect(loadMapTheme(storage)).toBe(MAP_THEMES.FRONTIER);
  });

  it('gracefully handles missing or failing storage', () => {
    const brokenStorage = {
      getItem() {
        throw new Error('unavailable');
      },
      setItem() {
        throw new Error('unavailable');
      },
    };

    expect(loadPlayerName(brokenStorage)).toBe('');
    expect(savePlayerName('Maverick', brokenStorage)).toBe('Maverick');
    expect(loadMapTheme(brokenStorage)).toBe(MAP_THEMES.FRONTIER);
    expect(saveMapTheme(MAP_THEMES.CITY, brokenStorage)).toBe(MAP_THEMES.CITY);
  });
});
