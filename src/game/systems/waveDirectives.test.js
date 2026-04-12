import { describe, expect, it } from 'vitest';

import {
  WAVE_DIRECTIVES,
  applyWaveDirectiveToProfile,
  applyWaveDirectiveToSpec,
  selectWaveDirective,
} from './waveDirectives.js';

describe('wave directives', () => {
  it('skips directives on the opening wave and boss waves', () => {
    expect(selectWaveDirective(1, () => 0)).toBeNull();
    expect(selectWaveDirective(5, () => 0)).toBeNull();
  });

  it('adds extra airborne pressure for hunter squad', () => {
    const spec = applyWaveDirectiveToSpec({
      tank: 3,
      drone: 2,
      droneSupport: 0,
      droneJammer: 0,
      missile: 1,
      turret: 1,
      ship: 0,
      boss: 0,
    }, WAVE_DIRECTIVES.hunterSquad);

    expect(spec.drone).toBe(3);
    expect(spec.missile).toBe(2);
  });

  it('recomposes the wave into a heavier convoy', () => {
    const spec = applyWaveDirectiveToSpec({
      tank: 2,
      drone: 3,
      droneSupport: 0,
      droneJammer: 0,
      missile: 1,
      turret: 1,
      ship: 1,
      boss: 0,
    }, WAVE_DIRECTIVES.fortifiedConvoy);

    expect(spec.tank).toBe(3);
    expect(spec.turret).toBe(2);
    expect(spec.ship).toBe(2);
    expect(spec.drone).toBe(2);
    expect(spec.missile).toBe(0);
  });

  it('boosts airborne threat profiles for hunter squad', () => {
    const profile = applyWaveDirectiveToProfile('drone', {
      health: 20,
      moveSpeed: 24,
      projectileSpeed: 80,
      score: 40,
    }, WAVE_DIRECTIVES.hunterSquad);

    expect(profile.moveSpeed).toBeCloseTo(28.32, 5);
    expect(profile.projectileSpeed).toBeCloseTo(88, 5);
    expect(profile.score).toBe(46);
  });

  it('adds heavier armor to convoy units', () => {
    const profile = applyWaveDirectiveToProfile('tank', {
      health: 100,
      moveSpeed: 10,
      damage: 20,
      score: 50,
    }, WAVE_DIRECTIVES.fortifiedConvoy);

    expect(profile.health).toBe(124);
    expect(profile.damage).toBe(22);
    expect(profile.moveSpeed).toBeCloseTo(9.4, 5);
    expect(profile.score).toBe(59);
  });
});
