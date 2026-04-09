import * as THREE from 'three';

import { CONFIG } from './config.js';
import { createRng, segmentIntersectsSphereAt } from './math.js';
import { createRunStats } from './progression.js';
import { createGameState, GAME_STATES, resetGameState } from './state.js';
import { trackEnemyKilled, trackGameOver, trackGameRestart, trackWaveComplete, trackWaveStart } from './analytics.js';
import { createMissionForRun, updateMissionOnEnemyDestroyed, updateMissionOnWaveStart } from './systems/missions.js';
import { DroneEnemy } from './entities/DroneEnemy.js';
import { BossEnemy } from './entities/BossEnemy.js';
import { MissileEnemy } from './entities/MissileEnemy.js';
import { Player } from './entities/Player.js';
import { ProjectilePool } from './entities/Projectile.js';
import { ShipEnemy } from './entities/ShipEnemy.js';
import { TankEnemy } from './entities/TankEnemy.js';
import { TurretEnemy } from './entities/TurretEnemy.js';
import { canSpawnType, createWaveQueue } from './systems/waves.js';
import { createEnvironment } from './world/environment.js';
import { createTerrain } from './world/terrain.js';

function createEffectMesh(size) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(size, 10, 10),
    new THREE.MeshBasicMaterial({
      color: CONFIG.palette.effect,
      transparent: true,
      opacity: 0.8,
    }),
  );
  mesh.visible = false;
  return mesh;
}

function createPickupMesh(type) {
  const color = CONFIG.palette.pickup[type] ?? CONFIG.palette.effect;
  const group = new THREE.Group();
  const coreMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.7,
    roughness: 0.26,
    metalness: 0.45,
    transparent: true,
    opacity: 0.92,
  });
  const beaconMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.16,
  });

  let core;
  if (type === 'repair') {
    core = new THREE.Group();
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.6), coreMaterial);
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 0.6), coreMaterial);
    horizontal.castShadow = true;
    vertical.castShadow = true;
    core.add(horizontal, vertical);
  } else {
    core = new THREE.Mesh(new THREE.OctahedronGeometry(1.2, 0), coreMaterial);
    core.castShadow = true;
  }

  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.75, 18, 8, 1, true),
    beaconMaterial,
  );
  beacon.position.y = 8;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.85, 0.1, 8, 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
    }),
  );
  ring.rotation.x = Math.PI * 0.5;
  ring.position.y = -0.9;

  group.add(core, beacon, ring);
  return group;
}

function createHazardMesh(radius) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({
      color: CONFIG.palette.hazard,
      transparent: true,
      opacity: 0.16,
      wireframe: true,
    }),
  );
}

function disposeObject3D(scene, object) {
  scene.remove(object);
  object.traverse((child) => {
    if (child.geometry?.dispose) {
      child.geometry.dispose();
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      material?.dispose?.();
    }
  });
}

export class Simulation {
  constructor(scene, { seed = 1337, mapTheme, playerProgress, runModifiers } = {}) {
    this.scene = scene;
    this.seed = seed;
    this.rng = createRng(seed);
    this.environment = createEnvironment(scene, { mapTheme });
    this.terrain = createTerrain(scene, this.rng, { mapTheme });
    this.player = new Player(scene, this.terrain, runModifiers);
    this.projectiles = new ProjectilePool(scene);
    this.state = createGameState();
    this.state.bestScore = playerProgress?.bestScore ?? 0;
    this.state.bestWave = playerProgress?.bestWave ?? 0;
    this.state.achievementCount = playerProgress?.achievements?.length ?? 0;
    this.enemies = [];
    this.pickups = [];
    this.hazards = [];
    this.killEvents = [];
    this.damageEvents = [];
    this.fireEvents = [];
    this.impactEvents = [];
    this.waveCompleteEvents = [];
    this.pickupEvents = [];
    this.missilePositions = [];
    this.effects = [];
    this.runStats = createRunStats();
    this.spawnQueue = [];
    this.spawnCooldown = 0;
    this.pickupSpawnTimer = 0;
    this.interWaveDelay = CONFIG.waves.interWaveDelay;
    this.waveElapsed = 0;
    this.wasWaveCleared = false;
    this.lastHit = null;
    this.hitFlash = 0;
    this.fireFlash = 0;
    this.tempOrigin = new THREE.Vector3();
    this.tempAim = new THREE.Vector3();
    this.tempVelocity = new THREE.Vector3();
    this.enemyAimOffset = new THREE.Vector3(0, 1.5, 0);
    this._waveDamageTaken = 0;
    this.emergencyRepairTimer = 0;
  }

  setRunConfig({ playerProgress, runModifiers } = {}) {
    if (playerProgress) {
      this.state.bestScore = playerProgress.bestScore ?? this.state.bestScore;
      this.state.bestWave = playerProgress.bestWave ?? this.state.bestWave;
      this.state.achievementCount = playerProgress.achievements?.length ?? this.state.achievementCount;
    }
    if (runModifiers) {
      this.player.setRunModifiers(runModifiers);
    }
  }

  restart() {
    if (this.state.mode !== GAME_STATES.BOOT) {
      trackGameRestart(this.state.score, this.state.wave);
    }
    const bestScore = this.state.bestScore;
    const bestWave = this.state.bestWave;
    const achievementCount = this.state.achievementCount;
    resetGameState(this.state);
    this.state.bestScore = bestScore;
    this.state.bestWave = bestWave;
    this.state.achievementCount = achievementCount;
    this.player.reset();
    this.environment.update(this.player.group.position, 0);
    this.terrain.update(this.player.group.position, 0);
    this.projectiles.reset();
    this.clearEnemies();
    this.clearEffects();
    this.clearPickups();
    this.clearHazards();
    this.spawnQueue = [];
    this.spawnCooldown = 0;
    this.pickupSpawnTimer = 0;
    this.interWaveDelay = 0;
    this.waveElapsed = 0;
    this.lastHit = null;
    this.hitFlash = 0;
    this.fireFlash = 0;
    this.killEvents.length = 0;
    this.damageEvents.length = 0;
    this.fireEvents.length = 0;
    this.impactEvents.length = 0;
    this.waveCompleteEvents.length = 0;
    this.pickupEvents.length = 0;
    this.missilePositions = [];
    this.runStats = createRunStats();
    this.wasWaveCleared = false;
    this._waveDamageTaken = 0;
    this.emergencyRepairTimer = 0;
    this.state.mission = createMissionForRun(this.rng);
    this.scheduleNextPickupSpawn(true);
    this.beginWave(1);
  }

  clearEnemies() {
    for (const enemy of this.enemies) {
      enemy.dispose();
    }
    this.enemies = [];
  }

  clearEffects() {
    for (const effect of this.effects) {
      disposeObject3D(this.scene, effect.mesh);
    }
    this.effects = [];
  }

  clearPickups() {
    for (const pickup of this.pickups) {
      disposeObject3D(this.scene, pickup.mesh);
    }
    this.pickups = [];
  }

  clearHazards() {
    for (const hazard of this.hazards) {
      disposeObject3D(this.scene, hazard.mesh);
    }
    this.hazards = [];
  }

  beginWave(wave) {
    if (wave > 1) {
      trackWaveComplete(wave - 1, this.waveElapsed);
    }
    this.state.wave = wave;
    this.state.mission = this.state.mission ?? createMissionForRun(this.rng);
    this.state.mission = updateMissionOnWaveStart(this.state.mission, wave);
    this.spawnQueue = createWaveQueue(wave, this.rng);
    this.spawnCooldown = 0.25;
    this.waveElapsed = 0;
    this.interWaveDelay = CONFIG.waves.interWaveDelay;
    this.wasWaveCleared = false;
    this._waveDamageTaken = 0;
    this.spawnHazardsForWave(wave);
    this.state.status = `Wave ${wave} incoming.`;
    trackWaveStart(wave);
  }

  pause(reason = 'Paused') {
    if (this.state.mode === GAME_STATES.RUNNING) {
      this.state.mode = GAME_STATES.PAUSED;
      this.state.status = reason;
    }
  }

  resume() {
    if (this.state.mode === GAME_STATES.PAUSED) {
      this.state.mode = GAME_STATES.RUNNING;
      this.state.status = `Wave ${this.state.wave} in progress.`;
    }
  }

  spawnEnemy(type) {
    const terrainSpawnType = type === 'turret' ? 'tank' : type === 'boss' ? 'drone' : type;
    const allowDistantObjectiveSpawn = type === 'ship';
    const position = this.terrain.getSpawnPoint(
      terrainSpawnType,
      this.player.group.position,
      { allowDistant: allowDistantObjectiveSpawn },
    );
    if (!position) {
      return false;
    }

    let enemy = null;
    if (type === 'tank') {
      enemy = new TankEnemy(this.scene, position, this.rng);
    } else if (type === 'drone') {
      enemy = new DroneEnemy(this.scene, position, this.rng);
    } else if (type === 'missile') {
      enemy = new MissileEnemy(this.scene, position);
    } else if (type === 'turret') {
      enemy = new TurretEnemy(this.scene, position, this.rng);
    } else if (type === 'ship') {
      enemy = new ShipEnemy(this.scene, position);
    } else if (type === 'boss') {
      enemy = new BossEnemy(this.scene, position, this.rng);
    }
    if (!enemy) {
      return false;
    }

    enemy.preventAutoDespawn = this.shouldPersistDistantSpawn(type, enemy.group.position);
    this.enemies.push(enemy);
    return true;
  }

  getActiveCounts() {
    const counts = { tank: 0, drone: 0, missile: 0, turret: 0, ship: 0, boss: 0 };
    for (const enemy of this.enemies) {
      if (enemy.alive) {
        counts[enemy.type] += 1;
      }
    }
    return counts;
  }

  shouldPersistDistantSpawn(type, position) {
    return type === 'ship'
      && position.distanceTo(this.player.group.position) > CONFIG.world.enemyDespawnDistance;
  }

  trySpawnNext(dt) {
    this.spawnCooldown -= dt;
    if (this.spawnCooldown > 0 || this.spawnQueue.length === 0) {
      return;
    }

    const activeCounts = this.getActiveCounts();
    for (let index = 0; index < this.spawnQueue.length; index += 1) {
      const type = this.spawnQueue[index];
      if (!canSpawnType(type, activeCounts)) {
        continue;
      }
      if (!this.spawnEnemy(type)) {
        continue;
      }

      this.spawnQueue.splice(index, 1);
      this.spawnCooldown = CONFIG.waves.spawnInterval;
      return;
    }

    this.spawnCooldown = 0.35;
  }

  spawnEffect(x, y, z, size) {
    const mesh = createEffectMesh(size);
    mesh.position.set(x, y, z);
    mesh.visible = true;
    this.scene.add(mesh);
    this.effects.push({
      mesh,
      age: 0,
      life: 0.36 + size * 0.12,
      size,
    });
  }

  updateEffects(dt) {
    this.effects = this.effects.filter((effect) => {
      effect.age += dt;
      const progress = effect.age / effect.life;
      if (progress >= 1) {
        disposeObject3D(this.scene, effect.mesh);
        return false;
      }
      effect.mesh.scale.setScalar(1 + progress * 2.2);
      effect.mesh.material.opacity = 0.8 - progress * 0.8;
      return true;
    });
  }

  registerEnemyHit(enemy) {
    this.lastHit = {
      type: enemy.type,
      health: Math.max(0, enemy.health),
      maxHealth: enemy.maxHealth,
      destroyed: !enemy.alive,
    };
    this.hitFlash = 0.18;
  }

  recordImpact(x, y, z) {
    this.impactEvents.push({ x, y, z });
  }

  recordPlayerDamage(sourceX, sourceY, sourceZ, damage) {
    this.damageEvents.push({
      sourceX,
      sourceY,
      sourceZ,
      damage,
    });
    if (this.runStats) {
      this.runStats.damageTaken += damage;
    }
    if (typeof this._waveDamageTaken === 'number') {
      this._waveDamageTaken += damage;
    }
  }

  spawnPickup(position, type) {
    const mesh = createPickupMesh(type);
    mesh.position.copy(position);
    mesh.position.y += 4;
    this.scene.add(mesh);
    this.pickups.push({
      type,
      age: 0,
      baseY: mesh.position.y,
      mesh,
    });
  }

  choosePickupType() {
    const weights = CONFIG.powerUps.weights ?? {};
    const isLowHealth = this.player.health <= CONFIG.powerUps.lowHealthRepairThreshold;
    const total = CONFIG.powerUps.types.reduce((sum, type) => {
      const bonus = isLowHealth && type === 'repair' ? 5 : 0;
      return sum + (weights[type] ?? 1) + bonus;
    }, 0);
    let roll = this.rng() * total;
    for (const type of CONFIG.powerUps.types) {
      roll -= (weights[type] ?? 1) + (isLowHealth && type === 'repair' ? 5 : 0);
      if (roll <= 0) {
        return type;
      }
    }
    return CONFIG.powerUps.types[0];
  }

  scheduleNextPickupSpawn(immediate = false) {
    if (immediate) {
      this.pickupSpawnTimer = 1.5;
      return;
    }
    const { spawnIntervalMin, spawnIntervalMax } = CONFIG.powerUps;
    this.pickupSpawnTimer = spawnIntervalMin + this.rng() * (spawnIntervalMax - spawnIntervalMin);
  }

  spawnAmbientPickup() {
    const playerPosition = this.player.group.position;
    for (let attempts = 0; attempts < 8; attempts += 1) {
      const angle = this.rng() * Math.PI * 2;
      const distance = CONFIG.powerUps.spawnDistanceMin
        + this.rng() * (CONFIG.powerUps.spawnDistanceMax - CONFIG.powerUps.spawnDistanceMin);
      const x = playerPosition.x + Math.cos(angle) * distance;
      const z = playerPosition.z + Math.sin(angle) * distance;
      if (Math.hypot(x, z) > CONFIG.world.arenaRadius - 8) {
        continue;
      }
      const y = this.terrain.getGroundHeight(x, z) + 8;
      const nearbyPickup = this.pickups.some((pickup) => pickup.mesh.position.distanceToSquared(new THREE.Vector3(x, y, z)) < 196);
      if (nearbyPickup) {
        continue;
      }
      this.spawnPickup(new THREE.Vector3(x, y, z), this.choosePickupType());
      return true;
    }
    return false;
  }

  spawnEmergencyRepairPickup() {
    const playerPosition = this.player.group.position;
    for (let attempts = 0; attempts < 10; attempts += 1) {
      const angle = this.rng() * Math.PI * 2;
      const distance = 20 + this.rng() * 28;
      const x = playerPosition.x + Math.cos(angle) * distance;
      const z = playerPosition.z + Math.sin(angle) * distance;
      if (Math.hypot(x, z) > CONFIG.world.arenaRadius - 8) {
        continue;
      }
      const y = this.terrain.getGroundHeight(x, z) + 8;
      this.spawnPickup(new THREE.Vector3(x, y, z), 'repair');
      this.emergencyRepairTimer = CONFIG.powerUps.emergencyRepairCooldown;
      this.state.status = 'Emergency repair drop deployed nearby.';
      return true;
    }
    return false;
  }

  spawnHazardsForWave(wave) {
    this.clearHazards();
    if (wave < 4) {
      return;
    }

    const hazardCount = Math.min(2, 1 + Math.floor((wave - 4) / 4));
    for (let index = 0; index < hazardCount; index += 1) {
      const angle = this.rng() * Math.PI * 2;
      const radius = 32 + this.rng() * 92;
      const x = this.player.group.position.x + Math.cos(angle) * radius;
      const z = this.player.group.position.z + Math.sin(angle) * radius;
      const y = this.terrain.getGroundHeight(x, z) + 8;
      const mesh = createHazardMesh(CONFIG.hazards.radius);
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.hazards.push({
        mesh,
        age: 0,
        tick: 0,
        position: mesh.position.clone(),
        radius: CONFIG.hazards.radius,
      });
    }
  }

  applyDamageToEnemy(enemy, impactPoint, damage = CONFIG.projectiles.playerDamage) {
    this.spawnEffect(impactPoint.x, impactPoint.y, impactPoint.z, 1.1);
    const destroyed = enemy.takeDamage(damage);
    this.registerEnemyHit(enemy);
    if (destroyed) {
      this.state.mission = updateMissionOnEnemyDestroyed(this.state.mission, enemy.type);
      this.state.score += enemy.scoreValue;
      if (this.runStats) {
        this.runStats.score = this.state.score;
        this.runStats.kills += 1;
      }
      if (this.runStats && enemy.type === 'boss') {
        this.runStats.bossesDefeated += 1;
      }
      this.killEvents.push({
        position: enemy.group.position.clone(),
        type: enemy.type,
        score: enemy.scoreValue,
      });
      this.spawnEffect(enemy.group.position.x, enemy.group.position.y + 2, enemy.group.position.z, 2);
      trackEnemyKilled(enemy.type, enemy.scoreValue, this.state.wave);
    }
  }

  resolveEnemyHit(projectile, start, end) {
    const obstacleHit = this.terrain.getSegmentObstacleHit(start, end, projectile.radius);
    let nearestTarget = null;
    let nearestTargetT = Number.POSITIVE_INFINITY;

    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }
      const hitT = enemy.intersectSegmentAt(start, end, projectile.radius);
      if (hitT === null) {
        continue;
      }
      if (obstacleHit && obstacleHit.t <= hitT) {
        continue;
      }
      if (hitT >= nearestTargetT) {
        continue;
      }

      nearestTarget = enemy;
      nearestTargetT = hitT;
    }

    if (nearestTarget) {
      this.applyDamageToEnemy(nearestTarget, new THREE.Vector3(projectile.x, projectile.y, projectile.z));
      return true;
    }

    if (obstacleHit) {
      this.recordImpact(projectile.x, projectile.y, projectile.z);
      this.spawnEffect(projectile.x, projectile.y, projectile.z, 0.95);
      return true;
    }

    return false;
  }

  firePlayerWeapon(controls) {
    this.player.consumeShotCooldown();
    const specs = this.player.buildShotSpecs(controls.aimDirection, controls.lockedTargetId);
    let spawnedAny = false;
    for (const spec of specs) {
      spawnedAny = this.projectiles.spawn(spec) || spawnedAny;
    }
    if (!spawnedAny) {
      this.state.status = 'Weapon grid saturated.';
      return;
    }
    this.player.triggerMuzzleFlash(specs[0].origin);
    this.spawnEffect(this.player.fireOrigin.x, this.player.fireOrigin.y, this.player.fireOrigin.z, 0.65);
    this.fireFlash = 0.12;
    this.state.status = this.player.activePowerUp === 'spread'
      ? 'Spread barrage unleashed.'
      : controls.lockedTargetId ? 'Tracking shot launched.' : 'Weapons firing.';
  }

  resolvePlayerHit(projectile, start, end) {
    const obstacleHit = this.terrain.getSegmentObstacleHit(start, end, projectile.radius);
    const playerHitT = segmentIntersectsSphereAt(
      start,
      end,
      this.player.group.position,
      CONFIG.player.collisionRadius + projectile.radius,
    );
    if (obstacleHit && (playerHitT === null || obstacleHit.t <= playerHitT)) {
      this.recordImpact(projectile.x, projectile.y, projectile.z);
      this.spawnEffect(projectile.x, projectile.y, projectile.z, 0.95);
      return true;
    }
    const hit = playerHitT !== null;
    if (!hit) {
      return false;
    }

    const applied = this.player.applyDamage(projectile.damage);
    if (applied) {
      this.recordPlayerDamage(projectile.prevX, projectile.prevY, projectile.prevZ, projectile.damage);
      this.state.health = this.player.health;
      this.spawnEffect(this.player.group.position.x, this.player.group.position.y, this.player.group.position.z, 1.3);
    } else if (this.player.activePowerUp === 'shield') {
      this.state.status = 'Shield absorbed incoming fire.';
      this.spawnEffect(this.player.group.position.x, this.player.group.position.y, this.player.group.position.z, 0.9);
    }
    if (this.player.health <= 0) {
      this.state.mode = GAME_STATES.GAME_OVER;
      this.state.status = 'Drone destroyed. Press R to relaunch.';
    }
    return true;
  }

  handleEnemyEvents(enemy, events) {
    for (const event of events) {
      if (event.type === 'spawnProjectile') {
        if (this.projectiles.spawn(event.spec)) {
          this.fireEvents.push({
            x: event.spec.origin.x,
            y: event.spec.origin.y,
            z: event.spec.origin.z,
            type: enemy.type,
          });
        }
      } else if (event.type === 'impactPlayer') {
        const applied = this.player.applyDamage(event.damage);
        if (applied) {
          this.recordPlayerDamage(
            event.sourceX ?? enemy.group.position.x,
            event.sourceY ?? enemy.group.position.y,
            event.sourceZ ?? enemy.group.position.z,
            event.damage,
          );
        } else if (this.player.activePowerUp === 'shield') {
          this.state.status = 'Shield absorbed incoming fire.';
          this.spawnEffect(
            event.sourceX ?? enemy.group.position.x,
            event.sourceY ?? enemy.group.position.y,
            event.sourceZ ?? enemy.group.position.z,
            0.9,
          );
        }
        this.state.health = this.player.health;
      } else if (event.type === 'effect') {
        this.spawnEffect(event.position.x, event.position.y, event.position.z, event.size);
      } else if (event.type === 'spawnEnemy' && event.enemyType === 'missile') {
        this.enemies.push(new MissileEnemy(this.scene, event.position));
      }
    }
  }

  activatePulse() {
    if (!this.player.canUsePulse()) {
      return false;
    }

    this.player.triggerPulse();
    let hits = 0;
    const pulseOrigin = this.player.group.position.clone();
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        continue;
      }
      if (enemy.group.position.distanceTo(pulseOrigin) > CONFIG.player.pulseRadius) {
        continue;
      }
      this.applyDamageToEnemy(enemy, enemy.group.position, enemy.type === 'missile' ? 999 : CONFIG.player.pulseDamage);
      hits += 1;
    }
    if (this.runStats) {
      this.runStats.maxPulseHits = Math.max(this.runStats.maxPulseHits, hits);
    }
    this.spawnEffect(pulseOrigin.x, pulseOrigin.y, pulseOrigin.z, 5.2);
    this.state.status = hits > 0
      ? `EMP pulse hit ${hits} target${hits === 1 ? '' : 's'} within close range.`
      : `EMP pulse missed. No enemies were inside ${CONFIG.player.pulseRadius}m.`;
    return true;
  }

  cleanupEnemies() {
    const survivors = [];
    const playerPosition = this.player.group.position;
    for (const enemy of this.enemies) {
      if (!enemy.alive) {
        enemy.dispose();
        continue;
      }

      const distance = enemy.group.position.distanceTo(playerPosition);
      if (enemy.preventAutoDespawn) {
        if (distance <= CONFIG.world.enemyDespawnDistance) {
          enemy.preventAutoDespawn = false;
        }
        survivors.push(enemy);
        continue;
      }
      if (distance > CONFIG.world.enemyDespawnDistance) {
        enemy.dispose();
        continue;
      }

      survivors.push(enemy);
    }
    this.enemies = survivors;
  }

  updatePickups(dt) {
    this.pickupSpawnTimer -= dt;
    this.emergencyRepairTimer = Math.max(0, this.emergencyRepairTimer - dt);
    if (this.pickupSpawnTimer <= 0) {
      if (this.pickups.length < CONFIG.powerUps.maxActive) {
        this.spawnAmbientPickup();
      }
      this.scheduleNextPickupSpawn();
    }

    if (
      this.player.health <= CONFIG.powerUps.lowHealthRepairThreshold
      && this.emergencyRepairTimer <= 0
      && this.pickups.length < CONFIG.powerUps.maxActive
      && !this.pickups.some((pickup) => pickup.type === 'repair')
    ) {
      this.spawnEmergencyRepairPickup();
    }

    const survivors = [];
    for (const pickup of this.pickups) {
      pickup.age += dt;
      if (pickup.age >= CONFIG.powerUps.life) {
        disposeObject3D(this.scene, pickup.mesh);
        continue;
      }

      pickup.mesh.rotation.y += dt * 1.9;
      pickup.mesh.position.y = pickup.baseY + Math.sin(pickup.age * CONFIG.powerUps.bobSpeed) * 1.4;
      const horizontalDistance = Math.hypot(
        pickup.mesh.position.x - this.player.group.position.x,
        pickup.mesh.position.z - this.player.group.position.z,
      );
      const verticalDistance = Math.abs(pickup.mesh.position.y - this.player.group.position.y);
      const beacon = pickup.mesh.children[1];
      const ring = pickup.mesh.children[2];
      if (beacon?.material) {
        beacon.material.opacity = 0.12 + (Math.sin(pickup.age * 7) * 0.5 + 0.5) * 0.18;
      }
      if (ring?.material) {
        ring.material.opacity = 0.3 + (Math.sin(pickup.age * 8) * 0.5 + 0.5) * 0.45;
        ring.scale.setScalar(0.92 + (Math.sin(pickup.age * 6) * 0.5 + 0.5) * 0.3);
      }

      if (horizontalDistance <= this.player.runModifiers.collectionRadius + 2.2 && verticalDistance <= 8) {
        this.player.applyPowerUp(pickup.type);
        if (this.runStats) {
          this.runStats.pickupsCollected += 1;
        }
        this.pickupEvents.push({ type: pickup.type });
        this.state.health = this.player.health;
        this.state.status = pickup.type === 'repair'
          ? 'Health restored by repair pickup.'
          : `${pickup.type.toUpperCase()} power-up collected and active.`;
        disposeObject3D(this.scene, pickup.mesh);
        continue;
      }

      survivors.push(pickup);
    }
    this.pickups = survivors;
  }

  updateHazards(dt) {
    const survivors = [];
    for (const hazard of this.hazards) {
      hazard.age += dt;
      hazard.tick -= dt;
      hazard.mesh.rotation.y += dt * 0.35;
      hazard.mesh.material.opacity = 0.1 + Math.sin(hazard.age * 3.5) * 0.04 + 0.08;

      if (hazard.tick <= 0) {
        hazard.tick = CONFIG.hazards.tickInterval;
        if (this.player.group.position.distanceTo(hazard.position) <= hazard.radius) {
          const damage = CONFIG.hazards.dps * CONFIG.hazards.tickInterval;
          const applied = this.player.applyDamage(damage);
          if (applied) {
            this.recordPlayerDamage(hazard.position.x, hazard.position.y, hazard.position.z, damage);
            this.state.health = this.player.health;
          }
        }

        for (const enemy of this.enemies) {
          if (!enemy.alive) {
            continue;
          }
          if (enemy.group.position.distanceTo(hazard.position) <= hazard.radius) {
            this.applyDamageToEnemy(enemy, enemy.group.position, CONFIG.hazards.dps * CONFIG.hazards.tickInterval);
          }
        }
      }

      if (hazard.age >= CONFIG.hazards.duration) {
        disposeObject3D(this.scene, hazard.mesh);
        continue;
      }

      survivors.push(hazard);
    }
    this.hazards = survivors;
  }

  syncMissilePositions() {
    this.missilePositions = this.enemies
      .filter((enemy) => enemy.alive && enemy.type === 'missile')
      .map((enemy) => ({
        id: enemy.group.uuid,
        x: enemy.group.position.x,
        y: enemy.group.position.y,
        z: enemy.group.position.z,
      }));
  }

  update(dt, controls) {
    if (controls.pausePressed) {
      if (this.state.mode === GAME_STATES.PAUSED) {
        this.resume();
      } else if (this.state.mode === GAME_STATES.RUNNING) {
        this.pause('Paused');
      }
    }

    if (this.state.mode !== GAME_STATES.RUNNING) {
      return;
    }

    const wasWaveCleared = this.wasWaveCleared;
    this.state.time += dt;
    this.waveElapsed += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.fireFlash = Math.max(0, this.fireFlash - dt);
    this.player.update(dt, controls);
    this.environment.update(this.player.group.position, this.state.time);
    this.terrain.update(this.player.group.position, this.state.time);
    this.state.health = this.player.health;

    if (controls.abilityPressed) {
      this.activatePulse();
    }

    if (this.player.wantsToFire(controls)) {
      this.firePlayerWeapon(controls);
    }

    this.trySpawnNext(dt);

    for (const enemy of this.enemies) {
      const events = enemy.update(dt, {
        player: this.player,
        terrain: this.terrain,
      });
      this.handleEnemyEvents(enemy, events);
    }

    this.projectiles.update(dt, {
      terrain: this.terrain,
      playerPosition: this.player.group.position,
      getEnemyById: (id) => this.enemies.find((enemy) => enemy.alive && enemy.group.uuid === id) ?? null,
      tempOrigin: this.tempOrigin,
      tempAim: this.tempAim,
      tempVelocity: this.tempVelocity,
      enemyAimOffset: this.enemyAimOffset,
      resolveEnemyHit: (projectile, start, end) => this.resolveEnemyHit(projectile, start, end),
      resolvePlayerHit: (projectile, start, end) => this.resolvePlayerHit(projectile, start, end),
      recordImpact: (x, y, z) => this.recordImpact(x, y, z),
      spawnEffect: (x, y, z, size) => this.spawnEffect(x, y, z, size),
    });

    this.cleanupEnemies();
    this.syncMissilePositions();
    this.updatePickups?.(dt);
    this.updateHazards?.(dt);
    this.updateEffects(dt);

    if (this.enemies.length === 0 && this.spawnQueue.length > 0) {
      this.spawnCooldown = Math.min(this.spawnCooldown, 0.08);
    }

    const playerDead = this.player.health <= 0;
    const waveCleared = this.spawnQueue.length === 0 && this.enemies.length === 0;
    if (!playerDead && this.state.wave > 0 && !wasWaveCleared && waveCleared) {
      if (this._waveDamageTaken === 0) {
        if (this.runStats) {
          this.runStats.flawlessWaves += 1;
        }
      }
      this.waveCompleteEvents.push({ wave: this.state.wave });
    }
    this.wasWaveCleared = waveCleared;

    if (playerDead) {
      this.state.mode = GAME_STATES.GAME_OVER;
      this.state.status = 'Drone destroyed. Press R to relaunch.';
      trackGameOver(this.state.score, this.state.wave, this.state.time);
    } else if (waveCleared) {
      this.interWaveDelay -= dt;
      this.state.status = this.interWaveDelay > 0
        ? `Sector clear. Next wave in ${this.interWaveDelay.toFixed(1)}s`
        : `Wave ${this.state.wave + 1} incoming.`;
      if (this.interWaveDelay <= 0) {
        this.beginWave(this.state.wave + 1);
      }
    } else if (!this.state.status.includes('engaged') && !this.state.status.includes('burst')) {
      this.state.status = `Wave ${this.state.wave} in progress.`;
    }

    if (this.waveElapsed > CONFIG.waves.softTimeout && this.spawnQueue.length === 0) {
      this.state.status = `Wave ${this.state.wave} extended. Finish the remaining targets.`;
    }

    this.state.enemyCount = this.enemies.length + this.spawnQueue.length;
    if (this.runStats) {
      this.runStats.highestWave = Math.max(this.runStats.highestWave, this.state.wave);
      this.runStats.score = this.state.score;
    }
  }

  clearFrameEvents() {
    this.killEvents.length = 0;
    this.damageEvents.length = 0;
    this.fireEvents.length = 0;
    this.impactEvents.length = 0;
    this.waveCompleteEvents.length = 0;
    if (this.pickupEvents) {
      this.pickupEvents.length = 0;
    }
  }

  getSnapshot() {
    return {
      mode: this.state.mode,
      score: this.state.score,
      bestScore: this.state.bestScore,
      bestWave: this.state.bestWave,
      achievementCount: this.state.achievementCount,
      wave: this.state.wave,
      health: this.state.health,
      enemyCount: this.state.enemyCount,
      status: this.state.status,
      mission: this.state.mission ? { ...this.state.mission } : null,
      playerPosition: this.player.group.position,
      playerYaw: this.player.yaw,
      lastHit: this.lastHit,
      hitFlash: this.hitFlash,
      fireFlash: this.fireFlash,
      killEvents: this.killEvents.slice(),
      damageEvents: this.damageEvents.slice(),
      fireEvents: this.fireEvents.slice(),
      impactEvents: this.impactEvents.slice(),
      waveCompleteEvents: this.waveCompleteEvents.slice(),
      pickupEvents: this.pickupEvents.slice(),
      missilePositions: this.missilePositions.slice(),
      pickups: this.pickups.map((pickup) => ({
        type: pickup.type,
        position: pickup.mesh.position,
      })),
      time: this.state.time,
      ...this.player.getCombatStatus(),
    };
  }

  getAimCandidates() {
    return this.enemies
      .filter((enemy) => enemy.alive)
      .map((enemy) => ({
        id: enemy.group.uuid,
        type: enemy.type,
        label: enemy.getHudLabel(),
        position: enemy.group.position,
        health: enemy.health,
        maxHealth: enemy.maxHealth,
      }));
  }

  getRunSummary() {
    if (!this.runStats) {
      return {
        score: this.state.score,
        highestWave: this.state.wave,
        kills: 0,
        pickupsCollected: 0,
        bossesDefeated: 0,
        maxPulseHits: 0,
        flawlessWaves: 0,
        damageTaken: 0,
        mission: this.state.mission ? { ...this.state.mission } : null,
      };
    }
    return {
      ...this.runStats,
      score: this.state.score,
      highestWave: Math.max(this.runStats.highestWave, this.state.wave),
      timePlayed: this.state.time,
      mission: this.state.mission ? { ...this.state.mission } : null,
    };
  }

  dispose() {
    this.clearEnemies();
    this.clearEffects();
    this.clearPickups();
    this.clearHazards();
    this.player.dispose();
    this.projectiles.dispose();
    this.environment.dispose();
    this.terrain.dispose();
  }
}
