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
