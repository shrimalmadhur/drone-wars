import { describe, expect, it } from 'vitest';

import { createRng } from '../math.js';
import { canSpawnType, createWaveQueue, getSpawnBaseType, getWaveSpec } from './waves.js';

describe('wave system', () => {
  it('scales wave composition by wave number', () => {
    expect(getWaveSpec(1)).toEqual({
      tank: 2,
      drone: 1,
      droneSupport: 0,
      droneJammer: 0,
      missile: 0,
      turret: 0,
      ship: 0,
      boss: 0,
    });
    expect(getWaveSpec(4).missile).toBeGreaterThan(0);
    expect(getWaveSpec(4).ship).toBeGreaterThan(0);
    expect(getWaveSpec(4).droneSupport).toBeGreaterThan(0);
    expect(getWaveSpec(5).droneJammer).toBeGreaterThan(0);
  });

  it('creates deterministic queues from RNG', () => {
    const queueA = createWaveQueue(3, createRng(3));
    const queueB = createWaveQueue(3, createRng(3));
    expect(queueA).toEqual(queueB);
  });

  it('enforces per-type concurrency caps', () => {
    expect(canSpawnType('tank', { tank: 2, drone: 0, missile: 0, turret: 0, ship: 0, boss: 0 })).toBe(true);
    expect(canSpawnType('tank', { tank: 6, drone: 0, missile: 0, turret: 0, ship: 0, boss: 0 })).toBe(false);
    expect(canSpawnType('droneSupport', { tank: 0, drone: 7, missile: 0, turret: 0, ship: 0, boss: 0 })).toBe(false);
    expect(getSpawnBaseType('droneJammer')).toBe('drone');
  });
});
