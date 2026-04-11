import * as THREE from 'three/webgpu';

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

// Scratch objects for instanced projectile transforms
const _projMatrix = new THREE.Matrix4();
const _projQuat = new THREE.Quaternion();
const _projScale = new THREE.Vector3();
const _projPos = new THREE.Vector3();
const _projLookAt = new THREE.Vector3();
const _projUp = new THREE.Vector3(0, 1, 0);
const _hideMatrix = new THREE.Matrix4().compose(
  new THREE.Vector3(0, -9999, 0),
  new THREE.Quaternion(),
  new THREE.Vector3(0.001, 0.001, 0.001),
);

export class ProjectilePool {
  constructor(scene) {
    this.scene = scene;
    this.store = createProjectileStore(CONFIG.projectiles.maxCount);
    const maxCount = CONFIG.projectiles.maxCount;

    // InstancedMesh for projectile spheres (player + enemy share, colored via instanceColor)
    const sphereGeo = new THREE.SphereGeometry(0.8, 8, 6);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 1.6,
    });
    this.spheres = new THREE.InstancedMesh(sphereGeo, sphereMat, maxCount);
    this.spheres.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.spheres.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maxCount * 3), 3,
    );
    this.spheres.count = maxCount;

    // InstancedMesh for trails
    const trailGeo = new THREE.CylinderGeometry(0.18, 0.44, 4.8, 6);
    trailGeo.rotateX(Math.PI / 2);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
    });
    this.trails = new THREE.InstancedMesh(trailGeo, trailMat, maxCount);
    this.trails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trails.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maxCount * 3), 3,
    );
    this.trails.count = maxCount;

    // Cache colors
    this._playerColor = new THREE.Color(CONFIG.palette.playerShot);
    this._enemyColor = new THREE.Color(CONFIG.palette.hostileShot);

    // Hide all instances initially
    for (let i = 0; i < maxCount; i++) {
      this.spheres.setMatrixAt(i, _hideMatrix);
      this.trails.setMatrixAt(i, _hideMatrix);
      this.spheres.setColorAt(i, this._playerColor);
      this.trails.setColorAt(i, this._playerColor);
    }
    this.spheres.instanceMatrix.needsUpdate = true;
    this.trails.instanceMatrix.needsUpdate = true;
    this.spheres.instanceColor.needsUpdate = true;
    this.trails.instanceColor.needsUpdate = true;

    scene.add(this.spheres);
    scene.add(this.trails);

    // Assign index to each store item for instanced access
    for (let i = 0; i < this.store.items.length; i++) {
      this.store.items[i]._idx = i;
    }
  }

  spawn(spec) {
    const item = spawnProjectile(this.store, spec);
    if (!item) {
      return false;
    }
    const idx = item._idx;
    const isPlayer = spec.team === 'player';
    const color = isPlayer ? this._playerColor : this._enemyColor;
    const scale = isPlayer ? 1.2 : 1.0;

    this.spheres.setColorAt(idx, color);
    this.trails.setColorAt(idx, color);

    _projScale.set(scale, scale, scale);
    _projPos.set(item.x, item.y, item.z);
    _projQuat.identity();
    _projMatrix.compose(_projPos, _projQuat, _projScale);
    this.spheres.setMatrixAt(idx, _projMatrix);
    this.trails.setMatrixAt(idx, _projMatrix);

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
        context.recordImpact?.(item.x, item.y, item.z);
        context.spawnEffect(item.x, item.y, item.z, 0.8);
        return true;
      }
      return false;
    });

    let matrixDirty = false;
    let colorDirty = false;

    for (const item of this.store.items) {
      const idx = item._idx;

      if (!item.active) {
        this.spheres.setMatrixAt(idx, _hideMatrix);
        this.trails.setMatrixAt(idx, _hideMatrix);
        matrixDirty = true;
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
        this.spheres.setMatrixAt(idx, _hideMatrix);
        this.trails.setMatrixAt(idx, _hideMatrix);
        matrixDirty = true;
        continue;
      }

      // Update sphere position
      const scale = item.team === 'player' ? 1.2 : 1.0;
      _projPos.set(item.x, item.y, item.z);
      _projScale.set(scale, scale, scale);
      _projQuat.identity();
      _projMatrix.compose(_projPos, _projQuat, _projScale);
      this.spheres.setMatrixAt(idx, _projMatrix);

      // Update trail — position at midpoint, orient toward previous position
      _projPos.set(
        (item.prevX + item.x) * 0.5,
        (item.prevY + item.y) * 0.5,
        (item.prevZ + item.z) * 0.5,
      );
      _projLookAt.set(item.prevX, item.prevY, item.prevZ);
      _projMatrix.lookAt(_projPos, _projLookAt, _projUp);
      _projQuat.setFromRotationMatrix(_projMatrix);
      const dist = Math.hypot(item.x - item.prevX, item.y - item.prevY, item.z - item.prevZ);
      const tw = item.targetId ? CONFIG.effects.trail.trackingWidthMultiplier : 1;
      _projScale.set(tw, tw, Math.max(2.2, dist * 0.7));
      _projMatrix.compose(_projPos, _projQuat, _projScale);
      this.trails.setMatrixAt(idx, _projMatrix);

      matrixDirty = true;
    }

    if (matrixDirty) {
      this.spheres.instanceMatrix.needsUpdate = true;
      this.trails.instanceMatrix.needsUpdate = true;
    }
    if (colorDirty) {
      this.spheres.instanceColor.needsUpdate = true;
      this.trails.instanceColor.needsUpdate = true;
    }
  }

  reset() {
    resetProjectileStore(this.store);
    for (let i = 0; i < this.store.items.length; i++) {
      this.spheres.setMatrixAt(i, _hideMatrix);
      this.trails.setMatrixAt(i, _hideMatrix);
    }
    this.spheres.instanceMatrix.needsUpdate = true;
    this.trails.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.spheres);
    this.scene.remove(this.trails);
    this.spheres.geometry.dispose();
    this.spheres.material.dispose();
    this.trails.geometry.dispose();
    this.trails.material.dispose();
  }
}
