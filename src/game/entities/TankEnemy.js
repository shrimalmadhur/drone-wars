import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { normalizeAngle, randomRange, segmentIntersectsCylinder } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

export class TankEnemy extends EnemyBase {
  constructor(scene, position, rng) {
    super(scene, {
      type: 'tank',
      position,
      health: CONFIG.enemies.tank.health,
      radius: CONFIG.enemies.tank.radius,
      scoreValue: CONFIG.enemies.tank.score,
    });
    this.rng = rng;
    this.heading = randomRange(rng, -Math.PI, Math.PI);
    this.fireCooldown = randomRange(rng, 0.5, 1.4);
    this.turnTimer = randomRange(rng, 1.5, 3.2);

    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(6.2, 2.1, 8.4),
      new THREE.MeshStandardMaterial({ color: CONFIG.palette.tank, roughness: 0.82 }),
    );
    hull.castShadow = true;
    hull.receiveShadow = true;
    hull.position.y = 1.3;
    this.group.add(hull);

    this.turret = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 1.1, 12),
      new THREE.MeshStandardMaterial({ color: 0x405234, roughness: 0.7 }),
    );
    this.turret.rotation.z = Math.PI / 2;
    this.turret.position.set(0, 2.5, 0);
    this.group.add(this.turret);

    this.scene.add(this.group);
  }

  update(dt, context) {
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = randomRange(this.rng, 1.6, 3.4);
      this.heading += randomRange(this.rng, -0.9, 0.9);
    }

    const playerPos = context.player.group.position;
    const toPlayer = Math.atan2(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
    const headingError = normalizeAngle(toPlayer - this.heading);
    this.heading += Math.sign(headingError) * Math.min(Math.abs(headingError), dt * 0.55);

    this.group.position.x += Math.sin(this.heading) * CONFIG.enemies.tank.moveSpeed * dt;
    this.group.position.z += Math.cos(this.heading) * CONFIG.enemies.tank.moveSpeed * dt;
    context.terrain.clampToArena(this.group.position);
    this.group.position.y = context.terrain.getGroundHeight(this.group.position.x, this.group.position.z);

    this.turret.rotation.y = normalizeAngle(toPlayer - this.heading);
    this.group.rotation.y = this.heading;

    this.fireCooldown -= dt;
    const horizontalDistance = Math.hypot(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
    if (horizontalDistance < 118 && this.fireCooldown <= 0) {
      this.fireCooldown = CONFIG.enemies.tank.fireInterval + randomRange(this.rng, -0.35, 0.25);
      const shot = this.buildShot(
        new THREE.Vector3(playerPos.x, playerPos.y + 1.8, playerPos.z),
        CONFIG.enemies.tank.projectileSpeed,
        CONFIG.enemies.tank.projectileLife,
        CONFIG.enemies.tank.damage,
      );
      shot.origin.y += 3.4;
      return [{ type: 'spawnProjectile', spec: shot }];
    }
    return [];
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsCylinder(start, end, this.group.position, this.radius + radiusPadding, 2.4);
  }
}
