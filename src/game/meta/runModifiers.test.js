import { describe, expect, it } from 'vitest';

import { createRunModifiers } from './runModifiers.js';

describe('run modifiers', () => {
  it('applies passive upgrade levels to runtime stats', () => {
    const modifiers = createRunModifiers({
      upgrades: {
        hull: 2,
        pulse: 1,
        magnet: 3,
        stabilizer: 2,
      },
    });

    expect(modifiers.maxHealth).toBeGreaterThan(100);
    expect(modifiers.pulseCooldown).toBeLessThan(10);
    expect(modifiers.collectionRadius).toBeGreaterThan(5.4);
    expect(modifiers.spreadAngle).toBeLessThan(0.14);
  });

  it('applies the selected mutator through the shared modifier pipeline', () => {
    const modifiers = createRunModifiers({
      preRunSelection: { mutator: 'pulsePilot' },
      upgrades: { hull: 0, pulse: 0, magnet: 0, stabilizer: 0 },
    });

    expect(modifiers.mutatorId).toBe('pulsePilot');
    expect(modifiers.pulseCooldown).toBeLessThan(10);
    expect(modifiers.playerDamageMultiplier).toBeLessThan(1);
    expect(modifiers.rewardMultiplier).toBeGreaterThan(1);
  });

  it('applies the selected archetype through the shared modifier pipeline', () => {
    const interceptor = createRunModifiers({
      loadout: { archetype: 'interceptor' },
      upgrades: { hull: 0, pulse: 0, magnet: 0, stabilizer: 0 },
    });
    const bruiser = createRunModifiers({
      loadout: { archetype: 'bruiser' },
      upgrades: { hull: 0, pulse: 0, magnet: 0, stabilizer: 0 },
    });

    expect(interceptor.archetypeId).toBe('interceptor');
    expect(interceptor.flightSpeedMultiplier).toBeGreaterThan(1);
    expect(interceptor.dashCooldown).toBeLessThan(7.5);
    expect(bruiser.maxHealth).toBeGreaterThan(interceptor.maxHealth);
    expect(bruiser.playerDamageMultiplier).toBeGreaterThan(1);
  });
});
