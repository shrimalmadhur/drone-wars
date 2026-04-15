import { describe, expect, it } from 'vitest';

import {
  CHALLENGE_MODES,
  createDailyChallenge,
  createRandomSeed,
  sanitizeChallengeMode,
  toDateKey,
} from './challenges.js';

describe('challenge helpers', () => {
  it('sanitizes challenge mode values', () => {
    expect(sanitizeChallengeMode('daily')).toBe(CHALLENGE_MODES.DAILY);
    expect(sanitizeChallengeMode('bogus')).toBe(CHALLENGE_MODES.STANDARD);
  });

  it('creates a stable daily challenge from the same date key', () => {
    const first = createDailyChallenge('2026-04-14');
    const second = createDailyChallenge('2026-04-14');

    expect(first).toEqual(second);
    expect(first.id).toBe('daily-2026-04-14');
    expect(first.seed).toBeGreaterThan(0);
  });

  it('normalizes Date inputs into local date keys', () => {
    expect(toDateKey(new Date(2026, 3, 14))).toBe('2026-04-14');
  });

  it('creates non-zero random seeds', () => {
    expect(createRandomSeed(() => 0)).toBe(1);
    expect(createRandomSeed(() => 0.5)).toBeGreaterThan(0);
  });
});
