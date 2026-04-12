import { describe, expect, it } from 'vitest';

import {
  getNewUnlocks,
  getOnboardingChecklist,
  getPreflightGuidance,
  shouldShowOnboarding,
} from './onboarding.js';

describe('onboarding helpers', () => {
  it('shows onboarding for fresh profiles and hides it after early progress', () => {
    expect(shouldShowOnboarding({ lifetimeStats: { runsStarted: 0 }, bestWave: 0 })).toBe(true);
    expect(shouldShowOnboarding({ lifetimeStats: { runsStarted: 3 }, bestWave: 3 })).toBe(false);
  });

  it('builds a checklist from player progress milestones', () => {
    const checklist = getOnboardingChecklist({
      bestWave: 2,
      lifetimeStats: {
        runsStarted: 1,
        totalPickupsCollected: 1,
      },
    });

    expect(checklist.every((item) => item.complete)).toBe(true);
  });

  it('reports newly unlocked abilities after a run', () => {
    const unlocks = getNewUnlocks(
      { bestWave: 3 },
      { bestWave: 4 },
    );

    expect(unlocks).toEqual([{
      type: 'ability',
      id: 'dash',
      label: 'Vector Dash',
      summary: 'Short evasive burst with brief invulnerability.',
    }]);
  });

  it('returns context-aware preflight guidance', () => {
    expect(getPreflightGuidance({ lifetimeStats: { runsStarted: 0 }, bestWave: 0 })).toContain('First sortie');
    expect(getPreflightGuidance({ lifetimeStats: { runsStarted: 1 }, bestWave: 1 })).toContain('wave 2');
  });
});
