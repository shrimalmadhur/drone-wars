import { CONFIG } from '../config.js';
import { chooseFrom } from '../math.js';

export function getWaveSpec(wave) {
  return {
    tank: Math.min(CONFIG.waves.maxConcurrent.tank, 1 + wave),
    drone: Math.min(CONFIG.waves.maxConcurrent.drone, wave < 2 ? 1 : 1 + Math.floor(wave * 0.8)),
    missile: wave < 2 ? 0 : Math.min(CONFIG.waves.maxConcurrent.missile, Math.floor((wave - 1) / 2)),
    turret: wave < 3 ? 0 : Math.min(CONFIG.waves.maxConcurrent.turret, 1 + Math.floor((wave - 2) / 3)),
    ship: wave < 3 ? 0 : Math.min(CONFIG.waves.maxConcurrent.ship, 1 + Math.floor((wave - 3) / 3)),
    boss: wave > 0 && wave % 5 === 0 ? 1 : 0,
  };
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
  return activeCounts[type] < CONFIG.waves.maxConcurrent[type];
}
