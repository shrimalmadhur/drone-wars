import { describe, expect, it, vi } from 'vitest';

import { Simulation } from './Simulation.js';
import { GAME_STATES } from './state.js';
import { createMissionForRun, createMissionForWave, updateMissionOnWaveStartWithRng } from './systems/missions.js';
import { CONFIG } from './config.js';

describe('Simulation spawning', () => {
  it('stores the selected wave directive when a wave begins', () => {
    const simulation = {
      rng: () => 0,
      state: { mission: null, status: '', waveDirective: null },
      spawnHazardsForWave: vi.fn(),
      spawnAmbientPickup: vi.fn(),
      waveElapsed: 0,
      interWaveDelay: 0,
      wasWaveCleared: false,
      _waveDamageTaken: 12,
    };

    Simulation.prototype.beginWave.call(simulation, 2);

    expect(simulation.state.waveDirective?.id).toBe('hunterSquad');
    expect(simulation.state.status).toContain('Directive: Hunter Squadron');
    expect(simulation.spawnHazardsForWave).toHaveBeenCalledWith(2);
  });

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

  it('tracks drone variants against the shared drone concurrency cap', () => {
    const simulation = {
      enemies: [
        { alive: true, type: 'drone', variant: 'support' },
        { alive: true, type: 'drone', variant: 'jammer' },
      ],
    };

    expect(Simulation.prototype.getActiveCounts.call(simulation)).toEqual({
      tank: 0,
      drone: 2,
      missile: 0,
      turret: 0,
      ship: 0,
      boss: 0,
    });
  });

  it('calculates jammer pressure from nearby jammer drones', () => {
    const simulation = {
      enemies: [
        {
          alive: true,
          type: 'drone',
          variant: 'jammer',
          profile: CONFIG.enemies.drone.variants.jammer,
          group: { position: { distanceTo() { return 0; } } },
        },
      ],
      player: {
        group: { position: {} },
      },
      jammerStrength: 0,
      jammerAlertActive: false,
      setPriorityStatus: vi.fn(),
    };

    Simulation.prototype.updateJammerStrength.call(simulation);

    expect(simulation.jammerStrength).toBeCloseTo(CONFIG.enemies.drone.variants.jammer.jamStrength, 5);
  });

  it('repairs nearby damaged enemies when a support pulse resolves', () => {
    const target = {
      alive: true,
      health: 10,
      maxHealth: 20,
      group: { position: { distanceTo() { return 10; }, x: 1, y: 2, z: 3 } },
    };
    const source = {
      alive: true,
      type: 'drone',
      variant: 'support',
      group: { position: { x: 0, y: 0, z: 0 } },
    };
    const simulation = {
      enemies: [source, target],
      spawnEffect: vi.fn(),
      supportAlertTimer: 0,
      setPriorityStatus: vi.fn(),
    };

    Simulation.prototype.applyEnemyRepairPulse.call(simulation, source, 20, 6);

    expect(target.health).toBe(16);
    expect(simulation.spawnEffect).toHaveBeenCalledTimes(2);
    expect(simulation.supportAlertTimer).toBeGreaterThan(0);
  });

  it('applies directive pickup cadence on top of run modifiers', () => {
    const simulation = {
      rng: () => 0,
      mapThemeGameplay: {
        pickupSpawnIntervalMultiplier: 1,
      },
      player: {
        runModifiers: {
          pickupSpawnIntervalMultiplier: 0.8,
        },
      },
      state: {
        waveDirective: {
          pickupSpawnIntervalMultiplier: 0.5,
        },
      },
      pickupSpawnTimer: 0,
    };

    Simulation.prototype.scheduleNextPickupSpawn.call(simulation);

    expect(simulation.pickupSpawnTimer).toBeCloseTo(CONFIG.powerUps.spawnIntervalMin * 0.4, 5);
  });

  it('applies map theme pickup cadence on top of run modifiers', () => {
    const simulation = {
      rng: () => 0,
      mapThemeGameplay: {
        pickupSpawnIntervalMultiplier: 0.88,
      },
      player: {
        runModifiers: {
          pickupSpawnIntervalMultiplier: 0.8,
        },
      },
      state: {
        waveDirective: null,
      },
      pickupSpawnTimer: 0,
    };

    Simulation.prototype.scheduleNextPickupSpawn.call(simulation);

    expect(simulation.pickupSpawnTimer).toBeCloseTo(CONFIG.powerUps.spawnIntervalMin * 0.704, 5);
  });

  it('applies blackout sector radar and lock penalties in the snapshot', () => {
    const snapshot = Simulation.prototype.getSnapshot.call({
      state: {
        mode: GAME_STATES.RUNNING,
        score: 0,
        bestScore: 0,
        bestWave: 0,
        achievementCount: 0,
        wave: 6,
        health: 70,
        enemyCount: 5,
        status: 'Wave 6 in progress.',
        mission: null,
        waveDirective: {
          id: 'blackoutSector',
          radarRangeMultiplier: 0.62,
          lockInterferenceStrength: 0.28,
        },
        time: 10,
      },
      player: {
        group: { position: { x: 0, y: 0, z: 0 } },
        yaw: 0,
        runModifiers: { radarRangeMultiplier: 1 },
        getCombatStatus() {
          return { abilityLabel: 'EMP Pulse' };
        },
      },
      lastHit: null,
      jammerStrength: 0.1,
      jammerAlertActive: false,
      supportAlertTimer: 0,
      getMissileThreatSnapshot: Simulation.prototype.getMissileThreatSnapshot,
      mapThemeGameplay: {
        radarRangeMultiplier: 0.92,
      },
      hitFlash: 0,
      fireFlash: 0,
      killEvents: [],
      damageEvents: [],
      fireEvents: [],
      impactEvents: [],
      waveCompleteEvents: [],
      pickupEvents: [],
      shieldEvents: [],
      empEvents: [],
      missilePositions: [],
      pickups: [],
    });

    expect(snapshot.jammerStrength).toBeCloseTo(0.38, 5);
    expect(snapshot.radarRange).toBeCloseTo(CONFIG.world.arenaRadius * 0.92 * 0.62 * (1 - 0.38 * 0.45), 5);
  });

  it('reports missile threat proximity and support warning state in the snapshot', () => {
    const snapshot = Simulation.prototype.getSnapshot.call({
      state: {
        mode: GAME_STATES.RUNNING,
        score: 0,
        bestScore: 0,
        bestWave: 0,
        achievementCount: 0,
        wave: 4,
        health: 70,
        enemyCount: 3,
        status: 'Wave 4 in progress.',
        mission: null,
        waveDirective: null,
        time: 10,
      },
      player: {
        group: { position: { x: 0, y: 0, z: 0 } },
        yaw: 0,
        runModifiers: { radarRangeMultiplier: 1 },
        getCombatStatus() {
          return { abilityLabel: 'EMP Pulse' };
        },
      },
      lastHit: null,
      jammerStrength: 0,
      jammerAlertActive: false,
      supportAlertTimer: 1.5,
      missilePositions: [{ id: 'm1', x: 20, y: 0, z: 0 }],
      getMissileThreatSnapshot: Simulation.prototype.getMissileThreatSnapshot,
      mapThemeGameplay: {
        radarRangeMultiplier: 1,
      },
      hitFlash: 0,
      fireFlash: 0,
      killEvents: [],
      damageEvents: [],
      fireEvents: [],
      impactEvents: [],
      waveCompleteEvents: [],
      pickupEvents: [],
      shieldEvents: [],
      empEvents: [],
      pickups: [],
    });

    expect(snapshot.missileThreat.count).toBe(1);
    expect(snapshot.missileThreat.critical).toBe(true);
    expect(snapshot.supportWarningActive).toBe(true);
  });
});

describe('Simulation audio events', () => {
  it('describes pulse misses clearly when no enemies are in range', () => {
    const simulation = {
      empEvents: [],
      player: {
        equippedAbility: 'pulse',
        canUseAbility() { return true; },
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
      spawnPulseEffect: vi.fn(),
      recordEmpEvent: Simulation.prototype.recordEmpEvent,
      state: { status: '' },
    };

    const result = Simulation.prototype.activatePulse.call(simulation);

    expect(result).toBe(true);
    expect(simulation.empEvents).toHaveLength(1);
    expect(simulation.empEvents[0].hits).toBe(0);
    expect(simulation.spawnPulseEffect).toHaveBeenCalled();
    expect(simulation.state.status).toContain('No enemies');
  });

  it('activates dash through the equipped ability path', () => {
    const simulation = {
      player: {
        equippedAbility: 'dash',
        canUseAbility() { return true; },
        triggerDash: vi.fn(),
        group: { position: { x: 4, y: 5, z: 6 } },
      },
      spawnEffect: vi.fn(),
      state: { status: '' },
    };

    const result = Simulation.prototype.activateEquippedAbility.call(simulation);

    expect(result).toBe(true);
    expect(simulation.player.triggerDash).toHaveBeenCalled();
    expect(simulation.spawnEffect).toHaveBeenCalledWith(4, 5, 6, 2.3);
    expect(simulation.state.status).toContain('Vector dash');
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

  it('forces a repair pickup after the repair cadence expires', () => {
    const simulation = {
      pickups: [],
      repairCadenceTimer: 0,
      shouldForceRepairPickup: Simulation.prototype.shouldForceRepairPickup,
      player: {
        health: 100,
        runModifiers: { maxHealth: 100 },
      },
    };

    expect(Simulation.prototype.choosePickupType.call(simulation)).toBe('repair');
  });

  it('resets the repair cadence when a repair pickup spawns', () => {
    const simulation = {
      rng: () => 0,
      pickups: [],
      repairCadenceTimer: 0,
      scene: { add() {} },
      scheduleRepairCadence: Simulation.prototype.scheduleRepairCadence,
    };

    Simulation.prototype.spawnPickup.call(simulation, { x: 1, y: 2, z: 3 }, 'repair');

    expect(simulation.repairCadenceTimer).toBe(CONFIG.powerUps.repairCadenceMin);
    expect(simulation.pickups).toHaveLength(1);
    expect(simulation.pickups[0].type).toBe('repair');
  });

  it('adds stronger repair bias when the player is hurt', () => {
    const simulation = {
      rng: () => 0,
      pickups: [],
      repairCadenceTimer: 99,
      shouldForceRepairPickup: Simulation.prototype.shouldForceRepairPickup,
      player: {
        health: 55,
        runModifiers: { maxHealth: 100 },
      },
    };

    expect(Simulation.prototype.choosePickupType.call(simulation)).toBe('repair');
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
      shieldEvents: [],
      player: { applyDamage, health: 100, activePowerUp: 'shield' },
      state: { health: 100, status: '' },
      projectiles: { spawn: vi.fn(() => true) },
      spawnEffect: vi.fn(),
      recordShieldEvent: Simulation.prototype.recordShieldEvent,
      recordPlayerDamage: Simulation.prototype.recordPlayerDamage,
    };

    Simulation.prototype.handleEnemyEvents.call(
      simulation,
      { type: 'drone', group: { position: { x: 9, y: 8, z: 7 } } },
      [{ type: 'impactPlayer', damage: 20, sourceX: 4, sourceY: 5, sourceZ: 6 }],
    );

    expect(applyDamage).toHaveBeenCalledWith(20);
    expect(simulation.damageEvents).toEqual([]);
    expect(simulation.shieldEvents).toEqual([{ type: 'absorbed' }]);
    expect(simulation.state.health).toBe(100);
    expect(simulation.state.status).toContain('Shield absorbed');
  });

  it('records shield expiry as a frame event', () => {
    const simulation = {
      state: { mode: GAME_STATES.RUNNING, time: 0, health: 100, wave: 1, status: '', enemyCount: 0, score: 0 },
      wasWaveCleared: false,
      waveElapsed: 0,
      hitFlash: 0,
      fireFlash: 0,
      player: {
        health: 100,
        group: { position: {} },
        update: vi.fn(),
        consumeShieldExpiredEvent: vi.fn(() => true),
        wantsToFire: vi.fn(() => false),
      },
      environment: { update: vi.fn() },
      terrain: { update: vi.fn(), updateWater: vi.fn() },
      trySpawnNext: vi.fn(),
      enemies: [],
      projectiles: { update: vi.fn() },
      cleanupEnemies: vi.fn(),
      updateJammerStrength: vi.fn(),
      syncMissilePositions: vi.fn(),
      updatePickups: vi.fn(),
      updateHazards: vi.fn(),
      updateEffects: vi.fn(),
      spawnQueue: [],
      interWaveDelay: 1,
      shieldEvents: [],
      killEvents: [],
      damageEvents: [],
      fireEvents: [],
      impactEvents: [],
      waveCompleteEvents: [],
      pickupEvents: [],
      missilePositions: [],
      runStats: { highestWave: 1, score: 0 },
      recordShieldEvent: Simulation.prototype.recordShieldEvent,
    };

    Simulation.prototype.update.call(simulation, 1 / 60, { abilityPressed: false, pausePressed: false });

    expect(simulation.shieldEvents).toEqual([{ type: 'expired' }]);
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

  it('awards score for completing a bonus mission objective', () => {
    const simulation = {
      state: {
        mission: updateMissionOnWaveStartWithRng(createMissionForWave(2), 3, () => 0.99),
        score: 0,
      },
      runStats: {
        score: 0,
        missionScore: 0,
        bonusObjectivesCompleted: 0,
      },
    };

    Simulation.prototype.applyMissionUpdate.call(
      simulation,
      {
        ...simulation.state.mission,
        bonusObjective: {
          ...simulation.state.mission.bonusObjective,
          progress: 2,
          completed: true,
        },
      },
    );

    expect(simulation.state.score).toBe(130);
    expect(simulation.runStats.bonusObjectivesCompleted).toBe(1);
    expect(simulation.state.mission.bonusCompletedCount).toBe(1);
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

  it('keeps the active mission stable across waves unless a chain advances it', () => {
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
      spawnAmbientPickup: vi.fn(),
    };

    Simulation.prototype.beginWave.call(simulation, 1);
    Simulation.prototype.beginWave.call(simulation, 4);

    expect(simulation.state.mission.id).toBe('demolition');
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
      terrain: { update() {}, updateWater() {} },
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
      terrain: { update() {}, updateWater() {} },
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
