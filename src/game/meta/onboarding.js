import { ABILITY_DEFINITIONS, getUnlockedAbilities, isAbilityUnlocked } from './abilities.js';

export function shouldShowOnboarding(progress) {
  const runsStarted = Math.max(0, Number(progress?.lifetimeStats?.runsStarted) || 0);
  const bestWave = Math.max(0, Number(progress?.bestWave) || 0);
  return runsStarted < 2 || bestWave < 2;
}

export function getOnboardingChecklist(progress) {
  const runsStarted = Math.max(0, Number(progress?.lifetimeStats?.runsStarted) || 0);
  const bestWave = Math.max(0, Number(progress?.bestWave) || 0);
  return [
    {
      id: 'launch',
      label: 'Launch a run',
      complete: runsStarted > 0,
    },
    {
      id: 'reach-wave-2',
      label: 'Reach wave 2',
      complete: bestWave >= 2,
    },
    {
      id: 'collect-pickup',
      label: 'Fly through a pickup for an instant boost',
      complete: Math.max(0, Number(progress?.lifetimeStats?.totalPickupsCollected) || 0) > 0,
    },
  ];
}

export function getPreflightGuidance(progress) {
  const runsStarted = Math.max(0, Number(progress?.lifetimeStats?.runsStarted) || 0);
  const bestWave = Math.max(0, Number(progress?.bestWave) || 0);
  if (runsStarted === 0) {
    return 'First sortie: stay mobile, fire in short bursts, and use your ability as soon as pressure builds.';
  }
  if (bestWave < 2) {
    return 'Next target: break through wave 2. Prioritize pickups and avoid fighting every enemy head-on.';
  }
  return 'Preflight complete. Tune your build, push deeper, and spend salvage between runs.';
}

export function getNewUnlocks(previousProgress, nextProgress) {
  const previousAbilities = new Set(getUnlockedAbilities(previousProgress).map((ability) => ability.id));
  return Object.values(ABILITY_DEFINITIONS)
    .filter((ability) => isAbilityUnlocked(ability.id, nextProgress) && !previousAbilities.has(ability.id))
    .map((ability) => ({
      type: 'ability',
      id: ability.id,
      label: ability.label,
      summary: ability.summary,
    }));
}
