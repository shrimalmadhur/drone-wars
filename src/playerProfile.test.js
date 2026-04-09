import { describe, expect, it } from 'vitest';

import { MAP_THEMES } from './mapThemes.js';
import {
  loadPlayerProgress,
  loadMapTheme,
  loadPlayerName,
  purchaseUpgrade,
  recordRunStart,
  recordPlayerRun,
  sanitizePlayerName,
  saveMapTheme,
  savePlayerProgress,
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

  it('loads and saves persistent player progress', () => {
    const storage = createStorage();

    expect(loadPlayerProgress(storage)).toMatchObject({
      version: 2,
      bestScore: 0,
      bestWave: 0,
      currency: 0,
      totalRuns: 0,
      achievements: [],
      upgrades: {
        hull: 0,
        pulse: 0,
        magnet: 0,
        stabilizer: 0,
      },
    });

    expect(savePlayerProgress({
      bestScore: 2400,
      bestWave: 6,
      currency: 180,
      totalRuns: 3,
      achievements: ['firstBlood'],
      lifetimeStats: {
        totalKills: 25,
      },
    }, storage)).toMatchObject({
      version: 2,
      bestScore: 2400,
      bestWave: 6,
      currency: 180,
      totalRuns: 3,
      achievements: ['firstBlood'],
      lifetimeStats: {
        totalKills: 25,
      },
    });
  });

  it('records run progression and only reports newly earned achievements once', () => {
    const storage = createStorage();
    const start = recordRunStart(storage);

    expect(start.progress.lifetimeStats.runsStarted).toBe(1);

    const first = recordPlayerRun({
      score: 5200,
      highestWave: 7,
      kills: 12,
      pickupsCollected: 5,
      flawlessWaves: 1,
      bossesDefeated: 1,
      maxPulseHits: 3,
    }, storage);

    expect(first.progress.bestScore).toBe(5200);
    expect(first.progress.bestWave).toBe(7);
    expect(first.progress.totalRuns).toBe(1);
    expect(first.progress.currency).toBeGreaterThan(0);
    expect(first.newAchievements.length).toBeGreaterThan(1);

    const second = recordPlayerRun({
      score: 100,
      highestWave: 2,
      kills: 1,
      pickupsCollected: 0,
      flawlessWaves: 0,
      bossesDefeated: 0,
      maxPulseHits: 0,
    }, storage);

    expect(second.progress.totalRuns).toBe(2);
    expect(second.newAchievements).toEqual([]);
  });

  it('preserves newer profile fields when recording a completed run', () => {
    const storage = createStorage();

    savePlayerProgress({
      currency: 500,
      upgrades: { hull: 1, pulse: 2, magnet: 0, stabilizer: 1 },
      loadout: { ability: 'pulse', mutator: null },
      preRunSelection: { mutator: null },
    }, storage);

    const result = recordPlayerRun({
      score: 600,
      highestWave: 3,
      kills: 4,
      pickupsCollected: 1,
      bossesDefeated: 0,
      maxPulseHits: 0,
      flawlessWaves: 0,
      timePlayed: 28,
    }, storage);

    expect(result.progress.upgrades).toEqual({
      hull: 1,
      pulse: 2,
      magnet: 0,
      stabilizer: 1,
    });
    expect(result.progress.loadout.ability).toBe('pulse');
    expect(result.progress.currency).toBeGreaterThan(500);
  });

  it('purchases upgrades when enough salvage is available', () => {
    const storage = createStorage();

    savePlayerProgress({ currency: 500 }, storage);
    const purchase = purchaseUpgrade('hull', storage);

    expect(purchase.ok).toBe(true);
    expect(purchase.progress.upgrades.hull).toBe(1);
    expect(purchase.progress.currency).toBeLessThan(500);
  });

  it('rejects upgrades when salvage is insufficient', () => {
    const storage = createStorage();

    savePlayerProgress({ currency: 0 }, storage);
    const purchase = purchaseUpgrade('pulse', storage);

    expect(purchase.ok).toBe(false);
    expect(purchase.error).toContain('Insufficient');
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
