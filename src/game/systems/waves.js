import { CONFIG } from '../config.js';
import { chooseFrom } from '../math.js';

export function getWaveSpec(wave) {
  const spec = {
    tank: Math.min(CONFIG.waves.maxConcurrent.tank, 1 + wave),
    drone: Math.min(CONFIG.waves.maxConcurrent.drone, wave < 2 ? 1 : 1 + Math.floor(wave * 0.8)),
    droneSupport: 0,
    droneJammer: 0,
    missile: wave < 2 ? 0 : Math.min(CONFIG.waves.maxConcurrent.missile, Math.floor((wave - 1) / 2)),
    turret: wave < 3 ? 0 : Math.min(CONFIG.waves.maxConcurrent.turret, 1 + Math.floor((wave - 2) / 3)),
    ship: wave < 3 ? 0 : Math.min(CONFIG.waves.maxConcurrent.ship, 1 + Math.floor((wave - 3) / 3)),
    boss: wave > 0 && wave % 5 === 0 ? 1 : 0,
  };

  if (wave >= CONFIG.waves.droneVariants.supportStartWave) {
    spec.droneSupport = Math.min(2, 1 + Math.floor((wave - CONFIG.waves.droneVariants.supportStartWave) / 4));
    spec.drone = Math.max(1, spec.drone - spec.droneSupport);
  }
  if (wave >= CONFIG.waves.droneVariants.jammerStartWave) {
    spec.droneJammer = Math.min(2, 1 + Math.floor((wave - CONFIG.waves.droneVariants.jammerStartWave) / 5));
    spec.drone = Math.max(1, spec.drone - spec.droneJammer);
  }

  return spec;
}

export function createWaveQueue(wave, rng) {
  const spec = getWaveSpec(wave);
  const queue = [];
  for (const [type, count] of Object.entries(spec)) {
    for (let index = 0; index < count; index += 1) {
      queue.push(type);
    }
  }

  const shuffled = [];
  while (queue.length > 0) {
    const pick = chooseFrom(rng, queue);
    shuffled.push(pick);
    queue.splice(queue.indexOf(pick), 1);
  }

  return shuffled;
}

export function canSpawnType(type, activeCounts) {
  const baseType = getSpawnBaseType(type);
  return activeCounts[baseType] < CONFIG.waves.maxConcurrent[baseType];
}

export function getSpawnBaseType(type) {
  if (type === 'droneSupport' || type === 'droneJammer') {
    return 'drone';
  }
  return type;
}

export function getWaveDifficultyModifiers(wave) {
  const tier = Math.max(0, wave - 1);
  return {
    healthMultiplier: Math.min(2.2, 1 + tier * 0.09),
    damageMultiplier: Math.min(1.85, 1 + tier * 0.07),
    speedMultiplier: Math.min(1.4, 1 + tier * 0.035),
    projectileSpeedMultiplier: Math.min(1.35, 1 + tier * 0.025),
    fireRateMultiplier: Math.min(1.55, 1 + tier * 0.04),
    scoreMultiplier: Math.min(2.4, 1 + tier * 0.12),
    tankBurstCount: wave >= 11 ? 3 : wave >= 6 ? 2 : 1,
    turretBurstCount: wave >= 12 ? 3 : wave >= 7 ? 2 : 1,
    shipBroadsideCount: wave >= 10 ? 3 : wave >= 8 ? 2 : 1,
    bossSalvoCount: wave >= 10 ? 5 : 3,
    bossMissileVolleyCount: wave >= 10 ? 3 : 2,
  };
}

export function buildEnemySpawnProfile(type, wave) {
  const modifiers = getWaveDifficultyModifiers(wave);
  const configKey = type === 'droneSupport'
    ? 'droneSupport'
    : type === 'droneJammer'
      ? 'droneJammer'
      : type;
  const config = getEnemyConfig(configKey);
  const profile = {
    ...config,
    health: Math.round(config.health * modifiers.healthMultiplier),
    damage: config.damage ? Math.round(config.damage * modifiers.damageMultiplier) : config.damage,
    moveSpeed: config.moveSpeed ? config.moveSpeed * modifiers.speedMultiplier : config.moveSpeed,
    projectileSpeed: config.projectileSpeed ? config.projectileSpeed * modifiers.projectileSpeedMultiplier : config.projectileSpeed,
    fireInterval: config.fireInterval ? config.fireInterval / modifiers.fireRateMultiplier : config.fireInterval,
    missileInterval: config.missileInterval ? config.missileInterval / Math.min(1.35, modifiers.fireRateMultiplier) : config.missileInterval,
    turnRate: config.turnRate ? config.turnRate * Math.min(1.4, modifiers.speedMultiplier) : config.turnRate,
    score: Math.round(config.score * modifiers.scoreMultiplier),
  };

  if (type === 'tank') {
    profile.burstCount = modifiers.tankBurstCount;
  } else if (type === 'turret') {
    profile.burstCount = modifiers.turretBurstCount;
  } else if (type === 'ship') {
    profile.broadsideCount = modifiers.shipBroadsideCount;
  } else if (type === 'boss') {
    profile.salvoCount = modifiers.bossSalvoCount;
    profile.missileVolleyCount = modifiers.bossMissileVolleyCount;
  }

  return profile;
}

function getEnemyConfig(type) {
  if (type === 'droneSupport') {
    return {
      ...CONFIG.enemies.drone,
      ...CONFIG.enemies.drone.variants.support,
    };
  }
  if (type === 'droneJammer') {
    return {
      ...CONFIG.enemies.drone,
      ...CONFIG.enemies.drone.variants.jammer,
    };
  }
  return CONFIG.enemies[type];
}
