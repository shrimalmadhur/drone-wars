import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { damp, randomRange, segmentIntersectsSphere } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

export class DroneEnemy extends EnemyBase {
  constructor(scene, position, rng) {
    super(scene, {
      type: 'drone',
      position,
      health: CONFIG.enemies.drone.health,
      radius: CONFIG.enemies.drone.radius,
      scoreValue: CONFIG.enemies.drone.score,
    });
    this.rng = rng;
    this.velocity = new THREE.Vector3();
    this.orbitPhase = randomRange(rng, -Math.PI, Math.PI);
    this.fireCooldown = randomRange(rng, 0.9, 1.5);

    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.3, 0),
      new THREE.MeshStandardMaterial({
        color: CONFIG.palette.drone,
        emissive: 0x5a0f0f,
        roughness: 0.35,
      }),
    );
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 0.25, 0.8),
      new THREE.MeshStandardMaterial({ color: 0x46211f, metalness: 0.25 }),
    );
    core.castShadow = true;
    wing.castShadow = true;
    this.group.add(core, wing);
    this.scene.add(this.group);
  }

  update(dt, context) {
    const playerPos = context.player.group.position;
    this.orbitPhase += dt * 0.7;
    const orbitRadius = 26;
    const target = new THREE.Vector3(
      playerPos.x + Math.cos(this.orbitPhase) * orbitRadius,
      playerPos.y + 8 + Math.sin(this.orbitPhase * 1.7) * 4,
      playerPos.z + Math.sin(this.orbitPhase) * orbitRadius,
    );

    this.velocity.x = damp(this.velocity.x, (target.x - this.group.position.x) * 1.4, 2.6, dt);
    this.velocity.y = damp(this.velocity.y, (target.y - this.group.position.y) * 1.7, 3.6, dt);
    this.velocity.z = damp(this.velocity.z, (target.z - this.group.position.z) * 1.4, 2.6, dt);
    this.velocity.clampLength(0, CONFIG.enemies.drone.moveSpeed);
    this.group.position.addScaledVector(this.velocity, dt);
    context.terrain.clampToArena(this.group.position);
    this.group.position.y = Math.max(this.group.position.y, context.terrain.getGroundHeight(this.group.position.x, this.group.position.z) + 10);

    this.group.lookAt(playerPos.x, playerPos.y, playerPos.z);
    this.fireCooldown -= dt;
    if (this.group.position.distanceTo(playerPos) < 86 && this.fireCooldown <= 0) {
      this.fireCooldown = CONFIG.enemies.drone.fireInterval + randomRange(this.rng, -0.2, 0.2);
      const shot = this.buildShot(
        new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z),
        CONFIG.enemies.drone.projectileSpeed,
        CONFIG.enemies.drone.projectileLife,
        CONFIG.enemies.drone.damage,
      );
      return [{ type: 'spawnProjectile', spec: shot }];
    }

    return [];
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsSphere(start, end, this.group.position, this.radius + radiusPadding);
  }
}
