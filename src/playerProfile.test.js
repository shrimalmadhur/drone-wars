import { describe, expect, it } from 'vitest';

import { loadPlayerName, sanitizePlayerName, savePlayerName } from './playerProfile.js';

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
  });
});
