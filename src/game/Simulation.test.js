import { describe, expect, it, vi } from 'vitest';

import { Simulation } from './Simulation.js';
import { GAME_STATES } from './state.js';

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

  it('keeps distant objective spawns alive until the player gets back within range', () => {
    const simulation = {
      enemies: [
        {
          alive: true,
          preventAutoDespawn: true,
          group: {
            position: { distanceTo() { return 320; } },
          },
        },
      ],
      player: {
        group: { position: {} },
      },
    };

    Simulation.prototype.cleanupEnemies.call(simulation);

    expect(simulation.enemies).toHaveLength(1);
    expect(simulation.enemies[0].preventAutoDespawn).toBe(true);
  });

  it('does not mark distant ground spawns as persistent objectives', () => {
    const simulation = {
      player: {
        group: { position: {} },
      },
    };
    const distantPosition = {
      distanceTo() { return 320; },
    };

    expect(Simulation.prototype.shouldPersistDistantSpawn.call(simulation, 'ship', distantPosition)).toBe(true);
    expect(Simulation.prototype.shouldPersistDistantSpawn.call(simulation, 'tank', distantPosition)).toBe(false);
    expect(Simulation.prototype.shouldPersistDistantSpawn.call(simulation, 'turret', distantPosition)).toBe(false);
  });
});

describe('Simulation audio events', () => {
  it('records enemy fire and missile damage with compatible payloads', () => {
    const applyDamage = vi.fn();
    const spawn = vi.fn(() => true);
    const simulation = {
      fireEvents: [],
      damageEvents: [],
      player: { applyDamage, health: 64 },
      state: { health: 100 },
      projectiles: { spawn },
      recordPlayerDamage: Simulation.prototype.recordPlayerDamage,
    };

    Simulation.prototype.handleEnemyEvents.call(
      simulation,
      { type: 'missile', group: { position: { x: 9, y: 8, z: 7 } } },
      [
        { type: 'spawnProjectile', spec: { origin: { x: 1, y: 2, z: 3 } } },
        { type: 'impactPlayer', damage: 20, sourceX: 4, sourceY: 5, sourceZ: 6 },
      ],
    );

    expect(spawn).toHaveBeenCalledWith({ origin: { x: 1, y: 2, z: 3 } });
    expect(simulation.fireEvents).toEqual([{ x: 1, y: 2, z: 3, type: 'missile' }]);
    expect(simulation.damageEvents).toEqual([{ sourceX: 4, sourceY: 5, sourceZ: 6, damage: 20 }]);
    expect(applyDamage).toHaveBeenCalledWith(20);
    expect(simulation.state.health).toBe(64);
  });

  it('only records enemy fire events when projectile spawn succeeds', () => {
    const simulation = {
      fireEvents: [],
      damageEvents: [],
      player: { applyDamage() {}, health: 100 },
      state: { health: 100 },
      projectiles: { spawn: vi.fn(() => false) },
      recordPlayerDamage: Simulation.prototype.recordPlayerDamage,
    };

    Simulation.prototype.handleEnemyEvents.call(
      simulation,
      { type: 'drone', group: { position: { x: 0, y: 0, z: 0 } } },
      [{ type: 'spawnProjectile', spec: { origin: { x: 1, y: 2, z: 3 } } }],
    );

    expect(simulation.projectiles.spawn).toHaveBeenCalledWith({ origin: { x: 1, y: 2, z: 3 } });
    expect(simulation.fireEvents).toEqual([]);
  });

  it('emits wave complete exactly once when a running wave is cleared', () => {
    const simulation = {
      state: {
        mode: GAME_STATES.RUNNING,
        wave: 2,
        health: 100,
        time: 0,
        status: '',
        enemyCount: 0,
      },
      wasWaveCleared: false,
      waveElapsed: 0,
      hitFlash: 0,
      fireFlash: 0,
      spawnQueue: [],
      enemies: [],
      waveCompleteEvents: [],
      player: {
        health: 100,
        group: { position: { x: 0, y: 0, z: 0 } },
        update() {},
        wantsToFire() { return false; },
      },
      environment: { update() {} },
      terrain: { update() {} },
      trySpawnNext() {},
      projectiles: { update() {} },
      cleanupEnemies() {},
      syncMissilePositions() {},
      updateEffects() {},
    };

    Simulation.prototype.update.call(simulation, 0.1, { restartPressed: false, pausePressed: false });
    Simulation.prototype.update.call(simulation, 0.1, { restartPressed: false, pausePressed: false });

    expect(simulation.waveCompleteEvents).toEqual([{ wave: 2 }]);
    expect(simulation.wasWaveCleared).toBe(true);
  });

  it('does not emit a wave complete event when the player dies on the same tick', () => {
    const simulation = {
      state: {
        mode: GAME_STATES.RUNNING,
        wave: 2,
        health: 100,
        time: 0,
        status: '',
        enemyCount: 0,
        score: 0,
      },
      wasWaveCleared: false,
      waveElapsed: 0,
      hitFlash: 0,
      fireFlash: 0,
      spawnQueue: [],
      enemies: [],
      waveCompleteEvents: [],
      interWaveDelay: 1,
      player: {
        health: 0,
        group: { position: { x: 0, y: 0, z: 0 } },
        update() {},
        wantsToFire() { return false; },
      },
      environment: { update() {} },
      terrain: { update() {} },
      trySpawnNext() {},
      projectiles: { update() {} },
      cleanupEnemies() {},
      syncMissilePositions() {},
      updateEffects() {},
    };

    const previousWindow = globalThis.window;
    globalThis.window = { gtag: null };
    try {
      Simulation.prototype.update.call(simulation, 0.1, { restartPressed: false, pausePressed: false });
    } finally {
      globalThis.window = previousWindow;
    }

    expect(simulation.state.mode).toBe(GAME_STATES.GAME_OVER);
    expect(simulation.waveCompleteEvents).toEqual([]);
  });

  it('clears frame events but preserves missile positions', () => {
    const simulation = {
      killEvents: [{ id: 1 }],
      damageEvents: [{ id: 2 }],
      fireEvents: [{ id: 3 }],
      impactEvents: [{ id: 4 }],
      waveCompleteEvents: [{ id: 5 }],
      missilePositions: [{ id: 'm1', x: 1, y: 2, z: 3 }],
    };

    Simulation.prototype.clearFrameEvents.call(simulation);

    expect(simulation.killEvents).toEqual([]);
    expect(simulation.damageEvents).toEqual([]);
    expect(simulation.fireEvents).toEqual([]);
    expect(simulation.impactEvents).toEqual([]);
    expect(simulation.waveCompleteEvents).toEqual([]);
    expect(simulation.missilePositions).toEqual([{ id: 'm1', x: 1, y: 2, z: 3 }]);
  });
});
