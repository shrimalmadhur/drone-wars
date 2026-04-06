import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { segmentIntersectsCylinder } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

export class ShipEnemy extends EnemyBase {
  constructor(scene, position) {
    super(scene, {
      type: 'ship',
      position,
      health: CONFIG.enemies.ship.health,
      radius: CONFIG.enemies.ship.radius,
      scoreValue: CONFIG.enemies.ship.score,
    });
    this.fireCooldown = 1.2;
    this.bob = Math.random() * Math.PI * 2;

    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(13, 3.2, 30),
      new THREE.MeshStandardMaterial({ color: CONFIG.palette.ship, roughness: 0.62, metalness: 0.2 }),
    );
    hull.castShadow = true;
    hull.receiveShadow = true;
    hull.position.y = 1.8;
    this.group.add(hull);

    this.turret = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.8, 1.4, 12),
      new THREE.MeshStandardMaterial({ color: 0x0f3f44, roughness: 0.45 }),
    );
    this.turret.position.set(0, 4, -1);
    this.group.add(this.turret);

    this.scene.add(this.group);
  }

  update(dt, context) {
    this.bob += dt;
    this.group.position.y = context.terrain.getGroundHeight(this.group.position.x, this.group.position.z) + 1 + Math.sin(this.bob * 1.7) * 0.4;

    const playerPos = context.player.group.position;
    this.turret.lookAt(playerPos.x, playerPos.y, playerPos.z);

    this.fireCooldown -= dt;
    if (this.fireCooldown <= 0 && this.group.position.distanceTo(playerPos) < 150) {
      this.fireCooldown = CONFIG.enemies.ship.fireInterval;
      const shot = this.buildShot(
        new THREE.Vector3(playerPos.x, playerPos.y + 1.5, playerPos.z),
        CONFIG.enemies.ship.projectileSpeed,
        CONFIG.enemies.ship.projectileLife,
        CONFIG.enemies.ship.damage,
      );
      shot.origin.y += 5;
      return [{ type: 'spawnProjectile', spec: shot }];
    }
    return [];
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsCylinder(start, end, this.group.position, this.radius + radiusPadding, 3.6);
  }
}
