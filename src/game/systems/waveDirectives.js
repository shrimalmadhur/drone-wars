import { chooseFrom } from '../math.js';

export const WAVE_DIRECTIVES = Object.freeze({
  hunterSquad: {
    id: 'hunterSquad',
    label: 'Hunter Squadron',
    description: 'Fast airborne interceptors sweep the sector with relentless pursuit.',
    spawnIntervalMultiplier: 0.88,
    airborneSpeedMultiplier: 1.18,
    airborneProjectileSpeedMultiplier: 1.1,
    enemyScoreMultiplier: 1.16,
  },
  fortifiedConvoy: {
    id: 'fortifiedConvoy',
    label: 'Fortified Convoy',
    description: 'Heavier armor columns advance in a slower but deadlier formation.',
    spawnIntervalMultiplier: 1.06,
    heavyArmorMultiplier: 1.24,
    heavyDamageMultiplier: 1.08,
    enemyScoreMultiplier: 1.18,
  },
  blackoutSector: {
    id: 'blackoutSector',
    label: 'Blackout Sector',
    description: 'Sensor interference collapses radar range and makes target locks less reliable.',
    radarRangeMultiplier: 0.62,
    lockInterferenceStrength: 0.28,
    enemyScoreMultiplier: 1.14,
  },
  salvageSurge: {
    id: 'salvageSurge',
    label: 'Salvage Surge',
    description: 'Debris floods the arena, accelerating pickup drops under combat pressure.',
    pickupSpawnIntervalMultiplier: 0.52,
    immediatePickupDrop: true,
    enemyScoreMultiplier: 1.15,
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
  if (directive.id === 'hunterSquad') {
    next.drone += 1;
    next.missile += 1;
    if (next.droneSupport > 0) {
      next.droneSupport += 1;
    }
  } else if (directive.id === 'fortifiedConvoy') {
    next.tank += 1;
    if (next.turret > 0) {
      next.turret += 1;
    }
    if (next.ship > 0) {
      next.ship += 1;
    }
    next.drone = Math.max(1, next.drone - 1);
    next.missile = Math.max(0, next.missile - 1);
  } else if (directive.id === 'blackoutSector') {
    if (next.droneJammer > 0) {
      next.droneJammer += 1;
    } else if (next.drone > 1) {
      next.drone -= 1;
      next.droneJammer = 1;
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
  const isAirborne = type === 'drone' || type === 'droneSupport' || type === 'droneJammer' || type === 'missile';
  const isHeavy = type === 'tank' || type === 'turret' || type === 'ship';

  if (directive.id === 'hunterSquad' && isAirborne) {
    next.moveSpeed = profile.moveSpeed ? profile.moveSpeed * directive.airborneSpeedMultiplier : profile.moveSpeed;
    next.projectileSpeed = profile.projectileSpeed
      ? profile.projectileSpeed * directive.airborneProjectileSpeedMultiplier
      : profile.projectileSpeed;
  } else if (directive.id === 'fortifiedConvoy' && isHeavy) {
    next.health = profile.health ? Math.round(profile.health * directive.heavyArmorMultiplier) : profile.health;
    next.damage = profile.damage ? Math.round(profile.damage * directive.heavyDamageMultiplier) : profile.damage;
    next.moveSpeed = profile.moveSpeed ? profile.moveSpeed * 0.94 : profile.moveSpeed;
  }
  return next;
}
