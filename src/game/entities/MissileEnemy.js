import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { segmentIntersectsSphere } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

export class MissileEnemy extends EnemyBase {
  constructor(scene, position) {
    super(scene, {
      type: 'missile',
      position,
      health: CONFIG.enemies.missile.health,
      radius: CONFIG.enemies.missile.radius,
      scoreValue: CONFIG.enemies.missile.score,
    });
    this.velocity = new THREE.Vector3(0, 0, -CONFIG.enemies.missile.moveSpeed);
    this.life = 0;

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.55, 5.8, 10),
      new THREE.MeshStandardMaterial({
        color: CONFIG.palette.missile,
        emissive: 0x6a1212,
        roughness: 0.35,
      }),
    );
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    this.group.add(body);
    this.scene.add(this.group);
  }

  update(dt, context) {
    this.life += dt;
    const desired = new THREE.Vector3()
      .copy(context.player.group.position)
      .sub(this.group.position)
      .normalize()
      .multiplyScalar(CONFIG.enemies.missile.moveSpeed);

    this.velocity.lerp(desired, Math.min(1, dt * CONFIG.enemies.missile.turnRate));
    this.group.position.addScaledVector(this.velocity, dt);
    this.group.lookAt(this.group.position.clone().add(this.velocity));

    if (this.life > CONFIG.enemies.missile.life) {
      this.alive = false;
      return [{ type: 'effect', position: this.group.position.clone(), size: 1.2 }];
    }

    const dist = this.group.position.distanceTo(context.player.group.position);
    if (dist < CONFIG.enemies.missile.radius + CONFIG.player.collisionRadius) {
      this.alive = false;
      return [
        { type: 'effect', position: this.group.position.clone(), size: 1.6 },
        { type: 'impactPlayer', damage: CONFIG.enemies.missile.damage },
      ];
    }

    return [];
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsSphere(start, end, this.group.position, this.radius + radiusPadding);
  }
}
