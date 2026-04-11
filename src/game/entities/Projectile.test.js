import { describe, expect, it, vi } from 'vitest';

import { ProjectilePool, createProjectileStore, resetProjectileStore, spawnProjectile, stepProjectileStore } from './Projectile.js';

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

  it('records an impact when a projectile strikes the ground', () => {
    const mockInstancedMesh = {
      setMatrixAt() {},
      setColorAt() {},
      instanceMatrix: { needsUpdate: false },
      instanceColor: { needsUpdate: false },
    };
    const pool = {
      store: {
        items: [{
          active: true,
          _idx: 0,
          team: 'player',
          damage: 10,
          radius: 0.9,
          x: 0,
          y: 0.4,
          z: 0,
          prevX: 0,
          prevY: 1.4,
          prevZ: 0,
          vx: 0,
          vy: -4,
          vz: 0,
          age: 0,
          maxLife: 1,
          targetId: null,
          turnRate: 0,
        }],
      },
      spheres: { ...mockInstancedMesh },
      trails: { ...mockInstancedMesh },
    };
    const recordImpact = vi.fn();
    const spawnEffect = vi.fn();

    ProjectilePool.prototype.update.call(pool, 0.1, {
      terrain: { getGroundHeight() { return 0; } },
      playerPosition: { x: 0, y: 0, z: 0 },
      recordImpact,
      spawnEffect,
      resolveEnemyHit() { return false; },
      resolvePlayerHit() { return false; },
      getEnemyById() { return null; },
      tempOrigin: { set() { return this; } },
      tempAim: { copy() { return this; }, add() { return this; }, sub() { return this; }, normalize() { return this; }, multiplyScalar() { return this; } },
      tempVelocity: { set() { return this; }, lerp() { return this; } },
      enemyAimOffset: {},
    });

    expect(recordImpact).toHaveBeenCalledWith(0, 0, 0);
    expect(spawnEffect).toHaveBeenCalledWith(0, 0, 0, 0.8);
    expect(pool.store.items[0].active).toBe(false);
  });
});
