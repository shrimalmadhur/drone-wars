import { describe, expect, it, vi } from 'vitest';

import { Simulation } from './Simulation.js';
import { GAME_STATES } from './state.js';
import { createMissionForRun, createMissionForWave } from './systems/missions.js';

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
  it('describes pulse misses clearly when no enemies are in range', () => {
    const simulation = {
      player: {
        canUsePulse() { return true; },
        triggerPulse: vi.fn(),
        group: { position: { clone() { return { x: 0, y: 0, z: 0 }; } } },
      },
      enemies: [
        {
          alive: true,
          type: 'drone',
          group: { position: { distanceTo() { return 999; } } },
        },
      ],
      runStats: { maxPulseHits: 0 },
      spawnEffect: vi.fn(),
      state: { status: '' },
    };

    const result = Simulation.prototype.activatePulse.call(simulation);

    expect(result).toBe(true);
    expect(simulation.state.status).toContain('No enemies');
  });

  it('spawns an emergency repair pickup when health is critically low', () => {
    const simulation = {
      pickupSpawnTimer: 99,
      emergencyRepairTimer: 0,
      pickups: [],
      player: {
        health: 20,
        runModifiers: { collectionRadius: 5.4 },
        group: { position: { x: 0, y: 0, z: 0 } },
      },
      rng: () => 0,
      terrain: {
        getGroundHeight() { return 0; },
      },
      spawnPickup: vi.fn(function spawnPickup(position, type) {
        this.pickups.push({
          type,
          age: 0,
          baseY: position.y,
          mesh: {
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { y: 0 },
            children: [],
          },
        });
      }),
      spawnEmergencyRepairPickup: Simulation.prototype.spawnEmergencyRepairPickup,
      scheduleNextPickupSpawn: vi.fn(),
      state: { status: '' },
    };

    Simulation.prototype.updatePickups.call(simulation, 0.1);

    expect(simulation.pickups.some((pickup) => pickup.type === 'repair')).toBe(true);
    expect(simulation.state.status).toContain('Emergency repair');
  });

  it('still spawns an emergency repair pickup when several other pickups already exist', () => {
    const simulation = {
      pickupSpawnTimer: 99,
      emergencyRepairTimer: 0,
      pickups: Array.from({ length: 4 }, (_, index) => ({
        type: index === 0 ? 'overdrive' : 'shield',
        age: index,
        baseY: 8,
        mesh: {
          position: { x: index * 5, y: 8, z: index * 5 },
          rotation: { y: 0 },
          children: [],
          traverse(callback) { callback(this); },
        },
      })),
      player: {
        health: 18,
        runModifiers: { collectionRadius: 5.4 },
        group: { position: { x: 0, y: 0, z: 0 } },
      },
      rng: () => 0,
      terrain: {
        getGroundHeight() { return 0; },
      },
      spawnPickup: vi.fn(function spawnPickup(position, type) {
        this.pickups.push({
          type,
          age: 0,
          baseY: position.y,
          mesh: {
            position: { x: position.x, y: position.y, z: position.z },
            rotation: { y: 0 },
            children: [],
            traverse(callback) { callback(this); },
          },
        });
      }),
      spawnEmergencyRepairPickup: Simulation.prototype.spawnEmergencyRepairPickup,
      scheduleNextPickupSpawn: vi.fn(),
      state: { status: '' },
    };

    Simulation.prototype.updatePickups.call(simulation, 0.1);

    expect(simulation.pickups).toHaveLength(5);
    expect(simulation.pickups.some((pickup) => pickup.type === 'repair')).toBe(true);
    expect(simulation.state.status).toContain('Emergency repair');
  });

  it('continues ambient pickup spawning even when many pickups are already active', () => {
    const simulation = {
      pickupSpawnTimer: 0,
      emergencyRepairTimer: 99,
      pickups: Array.from({ length: 6 }, (_, index) => ({
        type: 'shield',
        age: index,
        baseY: 8,
        mesh: {
          position: {
            x: index * 40,
            y: 8,
            z: index * 40,
            distanceToSquared() { return 9999; },
          },
          rotation: { y: 0 },
          children: [],
        },
      })),
      player: {
        health: 100,
        runModifiers: { collectionRadius: 5.4 },
        group: { position: { x: 0, y: 0, z: 0 } },
      },
      rng: () => 0,
      terrain: {
        getGroundHeight() { return 0; },
      },
      spawnPickup: vi.fn(function spawnPickup(position, type) {
        this.pickups.push({
          type,
          age: 0,
          baseY: position.y,
          mesh: {
            position: {
              x: position.x,
              y: position.y,
              z: position.z,
              distanceToSquared() { return 9999; },
            },
            rotation: { y: 0 },
            children: [],
          },
        });
      }),
      spawnAmbientPickup: Simulation.prototype.spawnAmbientPickup,
      choosePickupType() { return 'overdrive'; },
      scheduleNextPickupSpawn: vi.fn(),
      state: { status: '' },
    };

    Simulation.prototype.updatePickups.call(simulation, 0.1);

    expect(simulation.pickups).toHaveLength(7);
    expect(simulation.pickups.at(-1).type).toBe('overdrive');
    expect(simulation.scheduleNextPickupSpawn).toHaveBeenCalled();
  });

  it('records enemy fire and missile damage with compatible payloads', () => {
    const applyDamage = vi.fn(() => true);
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

  it('does not damage the player when shield is active', () => {
    const applyDamage = vi.fn(() => false);
    const simulation = {
      fireEvents: [],
      damageEvents: [],
      player: { applyDamage, health: 100, activePowerUp: 'shield' },
      state: { health: 100, status: '' },
      projectiles: { spawn: vi.fn(() => true) },
      spawnEffect: vi.fn(),
      recordPlayerDamage: Simulation.prototype.recordPlayerDamage,
    };

    Simulation.prototype.handleEnemyEvents.call(
      simulation,
      { type: 'drone', group: { position: { x: 9, y: 8, z: 7 } } },
      [{ type: 'impactPlayer', damage: 20, sourceX: 4, sourceY: 5, sourceZ: 6 }],
    );

    expect(applyDamage).toHaveBeenCalledWith(20);
    expect(simulation.damageEvents).toEqual([]);
    expect(simulation.state.health).toBe(100);
    expect(simulation.state.status).toContain('Shield absorbed');
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

  it('updates mission progress when matching enemies are destroyed', () => {
    const simulation = {
      state: {
        mission: createMissionForWave(2),
        score: 0,
        wave: 2,
      },
      runStats: {
        score: 0,
        kills: 0,
        bossesDefeated: 0,
      },
      registerEnemyHit: vi.fn(),
      killEvents: [],
      spawnEffect: vi.fn(),
    };
    const enemy = {
      type: 'drone',
      scoreValue: 150,
      group: { position: { x: 1, y: 2, z: 3, clone() { return { x: 1, y: 2, z: 3 }; } } },
      takeDamage() { return true; },
      alive: false,
      health: 0,
    };

    Simulation.prototype.applyDamageToEnemy.call(simulation, enemy, enemy.group.position, 20);

    expect(simulation.state.mission.progress).toBe(1);
    expect(simulation.state.score).toBe(150);
  });

  it('includes mission data in run summaries', () => {
    const simulation = {
      state: {
        wave: 3,
        score: 250,
        mission: {
          id: 'survival',
          label: 'Survival',
          description: 'Reach wave 3',
          progress: 3,
          target: 3,
          completed: true,
        },
      },
      runStats: {
        kills: 4,
        pickupsCollected: 1,
        bossesDefeated: 0,
        maxPulseHits: 0,
        flawlessWaves: 0,
        damageTaken: 12,
        score: 250,
        highestWave: 3,
      },
    };

    const summary = Simulation.prototype.getRunSummary.call(simulation);

    expect(summary.mission).toMatchObject({
      id: 'survival',
      completed: true,
    });
  });

  it('keeps the same mission for the whole run instead of replacing it by wave', () => {
    const simulation = {
      state: {
        wave: 0,
        mission: createMissionForRun(() => 0.4),
        status: '',
      },
      rng: () => 0.9,
      spawnQueue: [],
      spawnCooldown: 0,
      waveElapsed: 0,
      interWaveDelay: 0,
      wasWaveCleared: false,
      _waveDamageTaken: 0,
      spawnHazardsForWave: vi.fn(),
    };

    Simulation.prototype.beginWave.call(simulation, 1);
    Simulation.prototype.beginWave.call(simulation, 4);

    expect(simulation.state.mission.id).toBe('hunter');
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
