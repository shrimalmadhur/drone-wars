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
});
