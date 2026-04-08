export const ACHIEVEMENT_LIST = [
  {
    id: 'firstBlood',
    isUnlocked: (run) => run.kills >= 1,
  },
  {
    id: 'pulseAce',
    isUnlocked: (run) => run.maxPulseHits >= 3,
  },
  {
    id: 'scavenger',
    isUnlocked: (run) => run.pickupsCollected >= 5,
  },
  {
    id: 'flawless',
    isUnlocked: (run) => run.flawlessWaves >= 1,
  },
  {
    id: 'bossBreaker',
    isUnlocked: (run) => run.bossesDefeated >= 1,
  },
  {
    id: 'warlord',
    isUnlocked: (run) => run.score >= 5000,
  },
];

export function createRunStats() {
  return {
    kills: 0,
    pickupsCollected: 0,
    bossesDefeated: 0,
    maxPulseHits: 0,
    flawlessWaves: 0,
    damageTaken: 0,
    score: 0,
    highestWave: 0,
  };
}

export function evaluateAchievements(runStats) {
  return ACHIEVEMENT_LIST
    .filter((achievement) => achievement.isUnlocked(runStats))
    .map((achievement) => achievement.id);
}
