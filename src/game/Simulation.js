import * as THREE from 'three';

import { CONFIG } from './config.js';
import { createEnvironment } from './world/environment.js';
import { createTerrain } from './world/terrain.js';
import { createRng, segmentIntersectsSphereAt } from './math.js';
import { createGameState, GAME_STATES, resetGameState } from './state.js';
import { Player } from './entities/Player.js';
import { ProjectilePool } from './entities/Projectile.js';
import { TankEnemy } from './entities/TankEnemy.js';
import { DroneEnemy } from './entities/DroneEnemy.js';
import { MissileEnemy } from './entities/MissileEnemy.js';
import { ShipEnemy } from './entities/ShipEnemy.js';
import { canSpawnType, createWaveQueue } from './systems/waves.js';
import { trackGameRestart, trackWaveStart, trackWaveComplete, trackEnemyKilled, trackGameOver } from './analytics.js';

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

export class Simulation {
  constructor(scene, { seed = 1337, mapTheme } = {}) {
    this.scene = scene;
    this.seed = seed;
    this.rng = createRng(seed);
    this.environment = createEnvironment(scene, { mapTheme });
    this.terrain = createTerrain(scene, this.rng, { mapTheme });
    this.player = new Player(scene, this.terrain);
    this.projectiles = new ProjectilePool(scene);
    this.state = createGameState();
    this.enemies = [];
    this.killEvents = [];
    this.damageEvents = [];
    this.effects = [];
    this.spawnQueue = [];
    this.spawnCooldown = 0;
    this.interWaveDelay = CONFIG.waves.interWaveDelay;
    this.waveElapsed = 0;
    this.lastHit = null;
    this.hitFlash = 0;
    this.fireFlash = 0;
    this.tempOrigin = new THREE.Vector3();
    this.tempAim = new THREE.Vector3();
    this.tempVelocity = new THREE.Vector3();
    this.enemyAimOffset = new THREE.Vector3(0, 1.5, 0);
  }

  restart() {
    if (this.state.mode !== GAME_STATES.BOOT) {
      trackGameRestart(this.state.score, this.state.wave);
    }
    resetGameState(this.state);
    this.player.reset();
    this.environment.update(this.player.group.position, 0);
    this.terrain.update(this.player.group.position, 0);
    this.projectiles.reset();
    this.clearEnemies();
    this.clearEffects();
    this.spawnQueue = [];
    this.spawnCooldown = 0;
    this.interWaveDelay = 0;
    this.waveElapsed = 0;
    this.lastHit = null;
    this.hitFlash = 0;
    this.fireFlash = 0;
    this.killEvents.length = 0;
    this.damageEvents.length = 0;
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
      this.scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.mesh.material.dispose();
    }
    this.effects = [];
  }

  beginWave(wave) {
    if (wave > 1) {
      trackWaveComplete(wave - 1, this.waveElapsed);
    }
    this.state.wave = wave;
    this.spawnQueue = createWaveQueue(wave, this.rng);
    this.spawnCooldown = 0.25;
    this.waveElapsed = 0;
    this.interWaveDelay = CONFIG.waves.interWaveDelay;
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
    const position = this.terrain.getSpawnPoint(type, this.player.group.position);
    if (!position) {
      return false;
    }

    if (type === 'tank') {
      this.enemies.push(new TankEnemy(this.scene, position, this.rng));
    } else if (type === 'drone') {
      this.enemies.push(new DroneEnemy(this.scene, position, this.rng));
    } else if (type === 'missile') {
      this.enemies.push(new MissileEnemy(this.scene, position));
    } else if (type === 'ship') {
      this.enemies.push(new ShipEnemy(this.scene, position));
    }
    return true;
  }

  getActiveCounts() {
    const counts = { tank: 0, drone: 0, missile: 0, ship: 0 };
    for (const enemy of this.enemies) {
      if (enemy.alive) {
        counts[enemy.type] += 1;
      }
    }
    return counts;
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
        this.scene.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
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

  applyDamageToEnemy(enemy, impactPoint) {
    this.spawnEffect(impactPoint.x, impactPoint.y, impactPoint.z, 1.1);
    const destroyed = enemy.takeDamage(CONFIG.projectiles.playerDamage);
    this.registerEnemyHit(enemy);
    if (destroyed) {
      this.state.score += enemy.scoreValue;
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
      this.spawnEffect(projectile.x, projectile.y, projectile.z, 0.95);
      return true;
    }

    return false;
  }

  firePlayerWeapon(controls) {
    this.player.consumeShotCooldown();
    const spec = this.player.buildShotSpec(controls.aimDirection, controls.lockedTargetId);
    const spawned = this.projectiles.spawn(spec);
    if (!spawned) {
      this.state.status = 'Weapon grid saturated.';
      return;
    }
    this.player.triggerMuzzleFlash(spec.origin);
    this.spawnEffect(this.player.fireOrigin.x, this.player.fireOrigin.y, this.player.fireOrigin.z, 0.65);
    this.fireFlash = 0.12;
    this.state.status = controls.lockedTargetId ? 'Tracking shot launched.' : 'Weapons firing.';
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
      this.spawnEffect(projectile.x, projectile.y, projectile.z, 0.95);
      return true;
    }
    const hit = playerHitT !== null;
    if (!hit) {
      return false;
    }

    this.player.applyDamage(projectile.damage);
    this.damageEvents.push({
      sourceX: projectile.x,
      sourceY: projectile.y,
      sourceZ: projectile.z,
      damage: projectile.damage,
    });
    this.state.health = this.player.health;
    this.spawnEffect(this.player.group.position.x, this.player.group.position.y, this.player.group.position.z, 1.3);
    if (this.player.health <= 0) {
      this.state.mode = GAME_STATES.GAME_OVER;
      this.state.status = 'Drone destroyed. Press R to relaunch.';
    }
    return true;
  }

  handleEnemyEvents(events) {
    for (const event of events) {
      if (event.type === 'spawnProjectile') {
        this.projectiles.spawn(event.spec);
      } else if (event.type === 'impactPlayer') {
        this.player.applyDamage(event.damage);
        this.state.health = this.player.health;
      } else if (event.type === 'effect') {
        this.spawnEffect(event.position.x, event.position.y, event.position.z, event.size);
      }
    }
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
      if (distance > CONFIG.world.enemyDespawnDistance) {
        enemy.dispose();
        continue;
      }

      survivors.push(enemy);
    }
    this.enemies = survivors;
  }

  update(dt, controls) {
    if (controls.restartPressed) {
      this.restart();
      return;
    }

    if (controls.pausePressed) {
      if (this.state.mode === GAME_STATES.PAUSED) {
        this.resume();
      } else if (this.state.mode === GAME_STATES.RUNNING) {
        this.pause('Paused');
      }
    }

    if (this.state.mode === GAME_STATES.BOOT) {
      this.restart();
    }

    if (this.state.mode !== GAME_STATES.RUNNING) {
      return;
    }

    this.state.time += dt;
    this.waveElapsed += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.fireFlash = Math.max(0, this.fireFlash - dt);
    this.player.update(dt, controls);
    this.environment.update(this.player.group.position, this.state.time);
    this.terrain.update(this.player.group.position, this.state.time);
    this.state.health = this.player.health;

    if (this.player.wantsToFire(controls)) {
      this.firePlayerWeapon(controls);
    }

    this.trySpawnNext(dt);

    for (const enemy of this.enemies) {
      const events = enemy.update(dt, {
        player: this.player,
        terrain: this.terrain,
      });
      this.handleEnemyEvents(events);
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
      spawnEffect: (x, y, z, size) => this.spawnEffect(x, y, z, size),
    });

    this.cleanupEnemies();
    this.updateEffects(dt);

    if (this.enemies.length === 0 && this.spawnQueue.length > 0) {
      this.spawnCooldown = Math.min(this.spawnCooldown, 0.08);
    }

    if (this.player.health <= 0) {
      this.state.mode = GAME_STATES.GAME_OVER;
      this.state.status = 'Drone destroyed. Press R to relaunch.';
      trackGameOver(this.state.score, this.state.wave, this.state.time);
    } else if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
      this.interWaveDelay -= dt;
      this.state.status = this.interWaveDelay > 0
        ? `Sector clear. Next wave in ${this.interWaveDelay.toFixed(1)}s`
        : `Wave ${this.state.wave + 1} incoming.`;
      if (this.interWaveDelay <= 0) {
        this.beginWave(this.state.wave + 1);
      }
    } else {
      this.state.status = `Wave ${this.state.wave} in progress.`;
    }

    if (this.waveElapsed > CONFIG.waves.softTimeout && this.spawnQueue.length === 0) {
      this.state.status = `Wave ${this.state.wave} extended. Finish the remaining targets.`;
    }

    this.state.enemyCount = this.enemies.length + this.spawnQueue.length;
  }

  clearFrameEvents() {
    this.killEvents.length = 0;
    this.damageEvents.length = 0;
  }

  getSnapshot() {
    return {
      mode: this.state.mode,
      score: this.state.score,
      wave: this.state.wave,
      health: this.state.health,
      enemyCount: this.state.enemyCount,
      status: this.state.status,
      playerPosition: this.player.group.position,
      playerYaw: this.player.yaw,
      lastHit: this.lastHit,
      hitFlash: this.hitFlash,
      fireFlash: this.fireFlash,
      killEvents: this.killEvents.slice(),
      damageEvents: this.damageEvents.slice(),
    };
  }

  getAimCandidates() {
    return this.enemies
      .filter((enemy) => enemy.alive)
      .map((enemy) => ({
        id: enemy.group.uuid,
        type: enemy.type,
        position: enemy.group.position,
        health: enemy.health,
        maxHealth: enemy.maxHealth,
      }));
  }

  dispose() {
    this.clearEnemies();
    this.clearEffects();
    this.player.dispose();
    this.projectiles.dispose();
    this.environment.dispose();
    this.terrain.dispose();
  }
}
