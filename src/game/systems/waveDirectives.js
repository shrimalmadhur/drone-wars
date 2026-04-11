import { chooseFrom } from '../math.js';

export const WAVE_DIRECTIVES = Object.freeze({
  reinforcements: {
    id: 'reinforcements',
    label: 'Reinforcements',
    description: 'Reserve armor and drones arrive faster than normal.',
    spawnIntervalMultiplier: 0.82,
    enemyScoreMultiplier: 1.08,
  },
  salvageStorm: {
    id: 'salvageStorm',
    label: 'Salvage Storm',
    description: 'Power-up debris floods the sector during this wave.',
    pickupSpawnIntervalMultiplier: 0.62,
    enemyScoreMultiplier: 1.12,
    immediatePickupDrop: true,
  },
  hazardField: {
    id: 'hazardField',
    label: 'Hazard Field',
    description: 'Environmental anomalies spread across the arena.',
    extraHazards: 1,
    hazardRadiusMultiplier: 1.2,
    enemyScoreMultiplier: 1.1,
  },
  aceSquadron: {
    id: 'aceSquadron',
    label: 'Ace Squadron',
    description: 'Elite airborne units surge in with higher pressure.',
    droneSpeedMultiplier: 1.16,
    enemyScoreMultiplier: 1.14,
  },
});

const DIRECTIVE_IDS = Object.keys(WAVE_DIRECTIVES);

export function selectWaveDirective(wave, rng) {
  if (wave < 2 || wave % 5 === 0) {
    return null;
  }
  return WAVE_DIRECTIVES[chooseFrom(rng, DIRECTIVE_IDS)];
}

export function applyWaveDirectiveToSpec(spec, directive) {
  if (!directive) {
    return spec;
  }

  const next = { ...spec };
  if (directive.id === 'reinforcements') {
    next.tank += 1;
    next.drone += 1;
  } else if (directive.id === 'aceSquadron') {
    next.drone += 1;
    if (next.droneSupport > 0) {
      next.droneSupport += 1;
    } else if (next.droneJammer > 0) {
      next.droneJammer += 1;
    }
  }
  return next;
}

export function applyWaveDirectiveToProfile(type, profile, directive) {
  if (!directive) {
    return profile;
  }

  const next = {
    ...profile,
    score: Math.round(profile.score * (directive.enemyScoreMultiplier ?? 1)),
  };
  if (directive.id === 'aceSquadron' && (type === 'drone' || type === 'droneSupport' || type === 'droneJammer' || type === 'missile')) {
    next.moveSpeed = profile.moveSpeed ? profile.moveSpeed * directive.droneSpeedMultiplier : profile.moveSpeed;
  }
  return next;
}
