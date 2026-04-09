const AIRBORNE_TYPES = new Set(['drone', 'missile', 'boss']);
const HEAVY_TYPES = new Set(['tank', 'turret', 'ship', 'boss']);

const MISSION_DEFINITIONS = {
  survival: {
    id: 'survival',
    label: 'Survival',
    description: 'Reach wave 3',
    target: 3,
    initialProgress: 1,
  },
  hunter: {
    id: 'hunter',
    label: 'Hunter',
    description: 'Destroy 5 airborne enemies',
    target: 5,
    initialProgress: 0,
  },
  demolition: {
    id: 'demolition',
    label: 'Demolition',
    description: 'Destroy 4 heavy targets',
    target: 4,
    initialProgress: 0,
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
