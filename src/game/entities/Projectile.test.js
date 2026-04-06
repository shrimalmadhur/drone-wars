import { describe, expect, it } from 'vitest';

import { createProjectileStore, resetProjectileStore, spawnProjectile, stepProjectileStore } from './Projectile.js';

describe('projectile store', () => {
  it('spawns and expires projectiles by lifetime', () => {
    const store = createProjectileStore(2);
    spawnProjectile(store, {
      team: 'player',
      damage: 10,
      origin: { x: 0, y: 0, z: 0 },
      velocity: { x: 10, y: 0, z: 0 },
      maxLife: 0.2,
    });

    stepProjectileStore(store, 0.1, (item) => item.age >= item.maxLife);
    expect(store.items[0].active).toBe(true);
    stepProjectileStore(store, 0.11, (item) => item.age >= item.maxLife);
    expect(store.items[0].active).toBe(false);
  });

  it('resets all active projectiles', () => {
    const store = createProjectileStore(1);
    spawnProjectile(store, {
      team: 'enemy',
      damage: 10,
      origin: { x: 1, y: 2, z: 3 },
      velocity: { x: 0, y: 1, z: 0 },
      maxLife: 1,
    });
    resetProjectileStore(store);
    expect(store.items[0].active).toBe(false);
  });
});
