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

  it('adds extra frontline pressure for reinforcements', () => {
    const spec = applyWaveDirectiveToSpec({
      tank: 3,
      drone: 2,
      droneSupport: 0,
      droneJammer: 0,
      missile: 1,
      turret: 1,
      ship: 0,
      boss: 0,
    }, WAVE_DIRECTIVES.reinforcements);

    expect(spec.tank).toBe(4);
    expect(spec.drone).toBe(3);
  });

  it('boosts airborne threat profiles for ace squadron', () => {
    const profile = applyWaveDirectiveToProfile('drone', {
      health: 20,
      moveSpeed: 24,
      score: 40,
    }, WAVE_DIRECTIVES.aceSquadron);

    expect(profile.moveSpeed).toBeCloseTo(27.84, 5);
    expect(profile.score).toBe(46);
  });
});
