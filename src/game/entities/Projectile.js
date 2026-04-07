import * as THREE from 'three';

import { CONFIG } from '../config.js';

export function createProjectileStore(capacity) {
  return {
    items: Array.from({ length: capacity }, () => ({
      active: false,
      team: 'player',
      damage: 0,
      radius: 0.9,
      x: 0,
      y: 0,
      z: 0,
      prevX: 0,
      prevY: 0,
      prevZ: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      maxLife: 0,
      targetId: null,
      turnRate: 0,
      mesh: null,
      trail: null,
      light: null,
    })),
  };
}

export function spawnProjectile(store, spec) {
  const slot = store.items.find((item) => !item.active);
  if (!slot) {
    return null;
  }

  slot.active = true;
  slot.team = spec.team;
  slot.damage = spec.damage;
  slot.radius = spec.radius ?? 0.9;
  slot.x = spec.origin.x;
  slot.y = spec.origin.y;
  slot.z = spec.origin.z;
  slot.prevX = slot.x;
  slot.prevY = slot.y;
  slot.prevZ = slot.z;
  slot.vx = spec.velocity.x;
  slot.vy = spec.velocity.y;
  slot.vz = spec.velocity.z;
  slot.age = 0;
  slot.maxLife = spec.maxLife;
  slot.targetId = spec.targetId ?? null;
  slot.turnRate = spec.turnRate ?? 0;
  return slot;
}

export function resetProjectileStore(store) {
  for (const item of store.items) {
    item.active = false;
    item.age = 0;
  }
}

export function stepProjectileStore(store, dt, expiryCheck) {
  for (const item of store.items) {
    if (!item.active) {
      continue;
    }

    item.prevX = item.x;
    item.prevY = item.y;
    item.prevZ = item.z;
    item.x += item.vx * dt;
    item.y += item.vy * dt;
    item.z += item.vz * dt;
    item.age += dt;

    if (expiryCheck(item)) {
      item.active = false;
    }
  }
}

export class ProjectilePool {
  constructor(scene) {
    this.scene = scene;
    this.store = createProjectileStore(CONFIG.projectiles.maxCount);
    this.geometry = new THREE.SphereGeometry(0.8, 10, 10);
    this.trailGeometry = new THREE.CylinderGeometry(0.18, 0.44, 4.8, 8);
    this.trailGeometry.rotateX(Math.PI / 2);
    this.materials = {
      player: new THREE.MeshStandardMaterial({
        color: CONFIG.palette.playerShot,
        emissive: CONFIG.palette.playerShot,
        emissiveIntensity: 1.8,
      }),
      enemy: new THREE.MeshStandardMaterial({
        color: CONFIG.palette.hostileShot,
        emissive: CONFIG.palette.hostileShot,
        emissiveIntensity: 1.4,
      }),
    };
    this.trailMaterials = {
      player: new THREE.MeshBasicMaterial({
        color: CONFIG.palette.playerShot,
        transparent: true,
        opacity: 0.58,
      }),
      enemy: new THREE.MeshBasicMaterial({
        color: CONFIG.palette.hostileShot,
        transparent: true,
        opacity: 0.52,
      }),
    };

    for (const item of this.store.items) {
      const mesh = new THREE.Mesh(this.geometry, this.materials.player);
      const trail = new THREE.Mesh(this.trailGeometry, this.trailMaterials.player);
      const light = new THREE.PointLight(CONFIG.palette.playerShot, CONFIG.effects.trail.lightIntensity, CONFIG.effects.trail.lightRange, 2);
      mesh.visible = false;
      trail.visible = false;
      light.visible = false;
      mesh.castShadow = true;
      item.mesh = mesh;
      item.trail = trail;
      item.light = light;
      this.scene.add(mesh);
      this.scene.add(trail);
      this.scene.add(light);
    }
  }

  spawn(spec) {
    const item = spawnProjectile(this.store, spec);
    if (!item) {
      return false;
    }
    item.mesh.visible = true;
    item.trail.visible = true;
    item.light.visible = true;
    item.mesh.material = spec.team === 'player' ? this.materials.player : this.materials.enemy;
    item.trail.material = spec.team === 'player' ? this.trailMaterials.player : this.trailMaterials.enemy;
    item.mesh.scale.setScalar(spec.team === 'player' ? 1.2 : 1);
    item.mesh.position.set(item.x, item.y, item.z);
    item.trail.position.set(item.x, item.y, item.z);
    item.light.position.set(item.x, item.y, item.z);
    item.light.color.setHex(spec.team === 'player' ? CONFIG.palette.playerShot : CONFIG.palette.hostileShot);
    return true;
  }

  update(dt, context) {
    for (const item of this.store.items) {
      if (!item.active || item.team !== 'player' || !item.targetId || item.turnRate <= 0) {
        continue;
      }

      const target = context.getEnemyById(item.targetId);
      if (!target) {
        item.targetId = null;
        item.turnRate = 0;
        continue;
      }

      const speed = Math.hypot(item.vx, item.vy, item.vz);
      context.tempVelocity.set(item.vx, item.vy, item.vz);
      context.tempAim
        .copy(target.group.position)
        .add(context.enemyAimOffset)
        .sub(context.tempOrigin.set(item.x, item.y, item.z))
        .normalize()
        .multiplyScalar(speed);
      context.tempVelocity.lerp(context.tempAim, Math.min(1, dt * item.turnRate));
      item.vx = context.tempVelocity.x;
      item.vy = context.tempVelocity.y;
      item.vz = context.tempVelocity.z;
    }

    stepProjectileStore(this.store, dt, (item) => {
      const playerDx = item.x - context.playerPosition.x;
      const playerDz = item.z - context.playerPosition.z;
      const distanceFromPlayer = Math.hypot(playerDx, playerDz);
      if (item.age >= item.maxLife || distanceFromPlayer > CONFIG.world.arenaRadius * 2 || item.y < -12 || item.y > 120) {
        return true;
      }
      if (item.y <= context.terrain.getGroundHeight(item.x, item.z) + 0.6) {
        context.spawnEffect(item.x, item.y, item.z, 0.8);
        return true;
      }
      return false;
    });

    for (const item of this.store.items) {
      if (!item.active) {
        item.mesh.visible = false;
        item.trail.visible = false;
        item.light.visible = false;
        continue;
      }

      const start = { x: item.prevX, y: item.prevY, z: item.prevZ };
      const end = { x: item.x, y: item.y, z: item.z };

      let hit = false;
      if (item.team === 'player') {
        hit = context.resolveEnemyHit(item, start, end);
      } else {
        hit = context.resolvePlayerHit(item, start, end);
      }

      if (hit) {
        item.active = false;
        item.mesh.visible = false;
        item.trail.visible = false;
        item.light.visible = false;
        continue;
      }

      item.mesh.visible = true;
      item.mesh.position.set(item.x, item.y, item.z);
      item.trail.visible = true;
      item.trail.position.set(
        (item.prevX + item.x) * 0.5,
        (item.prevY + item.y) * 0.5,
        (item.prevZ + item.z) * 0.5,
      );
      item.trail.lookAt(item.prevX, item.prevY, item.prevZ);
      const dist = Math.hypot(item.x - item.prevX, item.y - item.prevY, item.z - item.prevZ);
      item.trail.scale.z = Math.max(2.2, dist * 0.7);

      // Widen trail when tracking a target (don't mutate shared material opacity)
      if (item.targetId) {
        item.trail.scale.x = CONFIG.effects.trail.trackingWidthMultiplier;
        item.trail.scale.y = CONFIG.effects.trail.trackingWidthMultiplier;
      } else {
        item.trail.scale.x = 1;
        item.trail.scale.y = 1;
      }
      item.light.visible = true;
      item.light.position.set(item.x, item.y, item.z);
    }
  }

  reset() {
    resetProjectileStore(this.store);
    for (const item of this.store.items) {
      item.mesh.visible = false;
      item.trail.visible = false;
      item.light.visible = false;
    }
  }

  dispose() {
    for (const item of this.store.items) {
      this.scene.remove(item.mesh);
      this.scene.remove(item.trail);
      this.scene.remove(item.light);
    }
    this.geometry.dispose();
    this.trailGeometry.dispose();
    this.materials.player.dispose();
    this.materials.enemy.dispose();
    this.trailMaterials.player.dispose();
    this.trailMaterials.enemy.dispose();
  }
}
