const AIRBORNE_TYPES = new Set(['drone', 'missile', 'boss']);
const HEAVY_TYPES = new Set(['tank', 'turret', 'ship', 'boss']);

export function classifyEnemyForMissions(type) {
  return {
    airborne: AIRBORNE_TYPES.has(type),
    heavy: HEAVY_TYPES.has(type),
  };
}

export function createMissionForWave(wave) {
  if (wave >= 4) {
    return {
      id: 'demolition',
      label: 'Demolition',
      description: 'Destroy 4 heavy targets',
      target: 4,
      progress: 0,
      completed: false,
    };
  }

  if (wave >= 2) {
    return {
      id: 'hunter',
      label: 'Hunter',
      description: 'Destroy 5 airborne enemies',
      target: 5,
      progress: 0,
      completed: false,
    };
  }

  return {
    id: 'survival',
    label: 'Survival',
    description: 'Reach wave 3',
    target: 3,
    progress: 1,
    completed: false,
  };
}

export function updateMissionOnWaveStart(mission, wave) {
  if (!mission || mission.completed || mission.id !== 'survival') {
    return mission;
  }

  const progress = Math.max(mission.progress, wave);
  return {
    ...mission,
    progress,
    completed: progress >= mission.target,
  };
}

export function updateMissionOnEnemyDestroyed(mission, enemyType) {
  if (!mission || mission.completed) {
    return mission;
  }

  const classification = classifyEnemyForMissions(enemyType);
  const countsForHunter = mission.id === 'hunter' && classification.airborne;
  const countsForDemolition = mission.id === 'demolition' && classification.heavy;
  if (!countsForHunter && !countsForDemolition) {
    return mission;
  }

  const progress = Math.min(mission.target, mission.progress + 1);
  return {
    ...mission,
    progress,
    completed: progress >= mission.target,
  };
}
