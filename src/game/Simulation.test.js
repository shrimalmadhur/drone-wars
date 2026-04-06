import { describe, expect, it } from 'vitest';

import { Simulation } from './Simulation.js';

describe('Simulation spawning', () => {
  it('keeps unspawnable terrain-locked enemies queued', () => {
    const simulation = {
      spawnCooldown: 0,
      spawnQueue: ['ship'],
      getActiveCounts() {
        return { tank: 0, drone: 0, missile: 0, ship: 0 };
      },
      spawnEnemy() {
        return false;
      },
    };

    Simulation.prototype.trySpawnNext.call(simulation, 1);

    expect(simulation.spawnQueue).toEqual(['ship']);
    expect(simulation.spawnCooldown).toBe(0.35);
  });

  it('removes queued enemies after a successful spawn', () => {
    const spawnedTypes = [];
    const simulation = {
      spawnCooldown: 0,
      spawnQueue: ['ship', 'tank'],
      getActiveCounts() {
        return { tank: 0, drone: 0, missile: 0, ship: 0 };
      },
      spawnEnemy(type) {
        spawnedTypes.push(type);
        return type === 'tank';
      },
    };

    Simulation.prototype.trySpawnNext.call(simulation, 1);

    expect(spawnedTypes).toEqual(['ship', 'tank']);
    expect(simulation.spawnQueue).toEqual(['ship']);
    expect(simulation.spawnCooldown).toBeGreaterThan(0.35);
  });
});
