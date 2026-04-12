import { describe, expect, it } from 'vitest';

import { createRng } from '../math.js';
import { buildEnemySpawnProfile, canSpawnType, createWaveQueue, getSpawnBaseType, getWaveDifficultyModifiers, getWaveSpec, applyMapThemeToSpec } from './waves.js';

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

  it('builds stronger spawn profiles as waves climb', () => {
    const earlyTank = buildEnemySpawnProfile('tank', 1);
    const lateTank = buildEnemySpawnProfile('tank', 8);
    const mutatorTank = buildEnemySpawnProfile('tank', 8, { enemySpeedMultiplier: 1.18 });

    expect(lateTank.health).toBeGreaterThan(earlyTank.health);
    expect(lateTank.damage).toBeGreaterThan(earlyTank.damage);
    expect(lateTank.fireInterval).toBeLessThan(earlyTank.fireInterval);
    expect(lateTank.burstCount).toBeGreaterThan(earlyTank.burstCount);
    expect(mutatorTank.moveSpeed).toBeGreaterThan(lateTank.moveSpeed);
  });

  it('unlocks higher weapon tiers at milestone waves', () => {
    expect(getWaveDifficultyModifiers(5).tankBurstCount).toBe(1);
    expect(getWaveDifficultyModifiers(6).tankBurstCount).toBe(2);
    expect(getWaveDifficultyModifiers(8).shipBroadsideCount).toBe(2);
    expect(getWaveDifficultyModifiers(10).bossMissileVolleyCount).toBe(3);
  });

  it('biases frontier waves toward airborne contacts', () => {
    const spec = applyMapThemeToSpec({
      tank: 3,
      drone: 2,
      droneSupport: 0,
      droneJammer: 0,
      missile: 1,
      turret: 1,
      ship: 0,
      boss: 0,
    }, {
      waveBias: 'airborne',
    });

    expect(spec.tank).toBe(2);
    expect(spec.drone).toBe(3);
    expect(spec.missile).toBe(2);
  });

  it('biases city waves toward heavier formations', () => {
    const spec = applyMapThemeToSpec({
      tank: 2,
      drone: 3,
      droneSupport: 0,
      droneJammer: 0,
      missile: 1,
      turret: 1,
      ship: 1,
      boss: 0,
    }, {
      waveBias: 'heavy',
    });

    expect(spec.tank).toBe(3);
    expect(spec.turret).toBe(2);
    expect(spec.ship).toBe(2);
    expect(spec.drone).toBe(2);
  });
});
