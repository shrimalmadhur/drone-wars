const AIRBORNE_TYPES = new Set(['drone', 'missile', 'boss']);
const HEAVY_TYPES = new Set(['tank', 'turret', 'ship', 'boss']);

const MISSION_DEFINITIONS = {
  survival: {
    id: 'survival',
    label: 'Survival',
    description: 'Reach wave 3',
    target: 3,
    initialProgress: 1,
    rewardScore: 250,
  },
  hunter: {
    id: 'hunter',
    label: 'Hunter',
    description: 'Destroy 5 airborne enemies',
    target: 5,
    initialProgress: 0,
    rewardScore: 250,
  },
  demolition: {
    id: 'demolition',
    label: 'Demolition',
    description: 'Destroy 4 heavy targets',
    target: 4,
    initialProgress: 0,
    rewardScore: 250,
  },
};

const BONUS_OBJECTIVE_DEFINITIONS = {
  cleanSweep: {
    id: 'cleanSweep',
    label: 'Clean Sweep',
    description: 'Take no hull damage this wave',
    target: 1,
    rewardScore: 120,
  },
  airIntercept: {
    id: 'airIntercept',
    label: 'Air Intercept',
    description: 'Destroy 3 airborne enemies this wave',
    target: 3,
    rewardScore: 120,
  },
  heavyBreak: {
    id: 'heavyBreak',
    label: 'Armor Break',
    description: 'Destroy 2 heavy targets this wave',
    target: 2,
    rewardScore: 140,
  },
  scavengeRun: {
    id: 'scavengeRun',
    label: 'Scavenge Run',
    description: 'Collect 2 pickups this wave',
    target: 2,
    rewardScore: 120,
  },
};

function createMission(id) {
  const definition = MISSION_DEFINITIONS[id];
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    target: definition.target,
    progress: definition.initialProgress,
    completed: false,
    rewardScore: definition.rewardScore,
    bonusObjective: null,
    bonusCompletedCount: 0,
  };
}

function createBonusObjective(id, wave) {
  const definition = BONUS_OBJECTIVE_DEFINITIONS[id];
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    target: definition.target,
    progress: 0,
    completed: false,
    rewardScore: definition.rewardScore,
    wave,
  };
}

function chooseBonusObjectiveId(wave, rng) {
  const objectiveIds = Object.keys(BONUS_OBJECTIVE_DEFINITIONS);
  const available = wave < 3
    ? objectiveIds.filter((id) => id !== 'scavengeRun')
    : objectiveIds;
  const index = Math.min(Math.floor(rng() * available.length), available.length - 1);
  return available[index];
}

function updatePrimaryMission(mission, enemyType, wave) {
  if (!mission || mission.completed) {
    return mission;
  }
  if (mission.id === 'survival') {
    const progress = Math.max(mission.progress, wave ?? mission.progress);
    return {
      ...mission,
      progress,
      completed: progress >= mission.target,
    };
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

function updateBonusObjectiveProgress(mission, updater) {
  const bonusObjective = mission?.bonusObjective;
  if (!bonusObjective || bonusObjective.completed) {
    return mission;
  }
  const nextBonus = updater(bonusObjective);
  if (nextBonus === bonusObjective) {
    return mission;
  }
  return {
    ...mission,
    bonusObjective: nextBonus,
  };
}

export function classifyEnemyForMissions(type) {
  return {
    airborne: AIRBORNE_TYPES.has(type),
    heavy: HEAVY_TYPES.has(type),
  };
}

export function createMissionForRun(rng = Math.random) {
  const missionIds = Object.keys(MISSION_DEFINITIONS);
  const index = Math.min(Math.floor(rng() * missionIds.length), missionIds.length - 1);
  return createMission(missionIds[index]);
}

export function createMissionForWave(wave) {
  if (wave >= 4) {
    return createMission('demolition');
  }

  if (wave >= 2) {
    return createMission('hunter');
  }

  return createMission('survival');
}

export function updateMissionOnWaveStart(mission, wave) {
  return updateMissionOnWaveStartWithRng(mission, wave, Math.random);
}

export function updateMissionOnWaveStartWithRng(mission, wave, rng = Math.random) {
  if (!mission) {
    return mission;
  }

  const nextMission = updatePrimaryMission(mission, null, wave);
  if (wave < 2 || wave % 5 === 0) {
    return {
      ...nextMission,
      bonusObjective: null,
    };
  }

  return {
    ...nextMission,
    bonusObjective: createBonusObjective(chooseBonusObjectiveId(wave, rng), wave),
  };
}

export function updateMissionOnEnemyDestroyed(mission, enemyType) {
  if (!mission) {
    return mission;
  }

  const primaryUpdated = updatePrimaryMission(mission, enemyType);
  const classification = classifyEnemyForMissions(enemyType);
  return updateBonusObjectiveProgress(primaryUpdated, (bonusObjective) => {
    const countsForIntercept = bonusObjective.id === 'airIntercept' && classification.airborne;
    const countsForHeavyBreak = bonusObjective.id === 'heavyBreak' && classification.heavy;
    if (!countsForIntercept && !countsForHeavyBreak) {
      return bonusObjective;
    }

    const progress = Math.min(bonusObjective.target, bonusObjective.progress + 1);
    return {
      ...bonusObjective,
      progress,
      completed: progress >= bonusObjective.target,
    };
  });
}

export function updateMissionOnPickupCollected(mission) {
  return updateBonusObjectiveProgress(mission, (bonusObjective) => {
    if (bonusObjective.id !== 'scavengeRun') {
      return bonusObjective;
    }

    const progress = Math.min(bonusObjective.target, bonusObjective.progress + 1);
    return {
      ...bonusObjective,
      progress,
      completed: progress >= bonusObjective.target,
    };
  });
}

export function updateMissionOnWaveCleared(mission, waveDamageTaken = 0) {
  return updateBonusObjectiveProgress(mission, (bonusObjective) => {
    if (bonusObjective.id !== 'cleanSweep' || waveDamageTaken > 0) {
      return bonusObjective;
    }

    return {
      ...bonusObjective,
      progress: bonusObjective.target,
      completed: true,
    };
  });
}
