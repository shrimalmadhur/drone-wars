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
    missionPrimaryCompleted: false,
    bonusObjectivesCompleted: 0,
    missionScore: 0,
  };
}

export function createLifetimeStats(stats) {
  return {
    totalKills: Math.max(0, Number(stats?.totalKills) || 0),
    totalTimePlayed: Math.max(0, Number(stats?.totalTimePlayed) || 0),
    totalPickupsCollected: Math.max(0, Number(stats?.totalPickupsCollected) || 0),
    totalBossesDefeated: Math.max(0, Number(stats?.totalBossesDefeated) || 0),
    runsStarted: Math.max(0, Number(stats?.runsStarted) || 0),
    runsCompleted: Math.max(0, Number(stats?.runsCompleted) || 0),
    currencyEarned: Math.max(0, Number(stats?.currencyEarned) || 0),
  };
}

export function calculateRunCurrency(runStats) {
  const scoreReward = Math.floor((Number(runStats?.score) || 0) / 120);
  const waveReward = Math.max(0, Number(runStats?.highestWave) || 0) * 10;
  const bossReward = Math.max(0, Number(runStats?.bossesDefeated) || 0) * 40;
  const flawlessReward = Math.max(0, Number(runStats?.flawlessWaves) || 0) * 18;
  const contractReward = (runStats?.missionPrimaryCompleted ? 28 : 0)
    + Math.max(0, Number(runStats?.bonusObjectivesCompleted) || 0) * 10;
  const total = scoreReward + waveReward + bossReward + flawlessReward + contractReward;
  return Math.floor(total * Math.max(1, Number(runStats?.rewardMultiplier) || 1));
}

export function mergeLifetimeStats(currentStats, runStats, { runStarted = false, runCompleted = false } = {}) {
  const current = createLifetimeStats(currentStats);
  return {
    totalKills: current.totalKills + (runCompleted ? Math.max(0, Number(runStats?.kills) || 0) : 0),
    totalTimePlayed: current.totalTimePlayed + (runCompleted ? Math.max(0, Number(runStats?.timePlayed) || 0) : 0),
    totalPickupsCollected: current.totalPickupsCollected + (runCompleted ? Math.max(0, Number(runStats?.pickupsCollected) || 0) : 0),
    totalBossesDefeated: current.totalBossesDefeated + (runCompleted ? Math.max(0, Number(runStats?.bossesDefeated) || 0) : 0),
    runsStarted: current.runsStarted + (runStarted ? 1 : 0),
    runsCompleted: current.runsCompleted + (runCompleted ? 1 : 0),
    currencyEarned: current.currencyEarned + (runCompleted ? calculateRunCurrency(runStats) : 0),
  };
}

export function evaluateAchievements(runStats) {
  return ACHIEVEMENT_LIST
    .filter((achievement) => achievement.isUnlocked(runStats))
    .map((achievement) => achievement.id);
}
