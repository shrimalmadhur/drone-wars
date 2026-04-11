import * as THREE from 'three/webgpu';

import { CONFIG } from '../config.js';
import { normalizeAngle, randomRange, segmentIntersectsCylinder, segmentIntersectsCylinderAt } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

export class TurretEnemy extends EnemyBase {
  constructor(scene, position, rng, profile = CONFIG.enemies.turret) {
    super(scene, {
      type: 'turret',
      position,
      health: profile.health,
      radius: profile.radius,
      scoreValue: profile.score,
    });
    this.rng = rng;
    this.profile = profile;
    this.fireCooldown = randomRange(rng, 0.3, 1.1);
    this.heading = randomRange(rng, -Math.PI, Math.PI);

    const baseMat = new THREE.MeshStandardNodeMaterial({
      color: 0x44515f,
      roughness: 0.86,
      metalness: 0.18,
    });
    const accentMat = new THREE.MeshStandardNodeMaterial({
      color: CONFIG.palette.turret,
      emissive: 0x3a2204,
      roughness: 0.42,
      metalness: 0.3,
    });
    const metalMat = new THREE.MeshStandardNodeMaterial({
      color: 0x737d88,
      roughness: 0.38,
      metalness: 0.62,
    });

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 1.6, 8), baseMat);
    plinth.position.y = 0.8;
    plinth.castShadow = true;

    this.turret = new THREE.Group();
    const turretCore = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 1.6, 8), accentMat);
    turretCore.castShadow = true;
    const sensor = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), metalMat);
    sensor.position.set(0, 0.3, 1.5);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 5.6, 8), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.1, 3.3);
    barrel.castShadow = true;
    this.barrel = barrel;
    this.turret.add(turretCore, sensor, barrel);
    this.turret.position.y = 2.15;

    this.group.add(plinth, this.turret);
    this.scene.add(this.group);
  }

  update(dt, context) {
    const playerPos = context.player.group.position;
    this.group.position.y = context.terrain.getGroundHeight(this.group.position.x, this.group.position.z);

    const toPlayer = Math.atan2(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
    const headingError = normalizeAngle(toPlayer - this.heading);
    this.heading += Math.sign(headingError) * Math.min(Math.abs(headingError), dt * 1.9);
    this.group.rotation.y = this.heading;

    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const dy = playerPos.y - (this.group.position.y + 2.4);
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    this.barrel.rotation.x = Math.PI / 2 - Math.atan2(dy, horizDist) * 0.5;

    this.fireCooldown -= dt;
    if (horizDist < 132 && this.fireCooldown <= 0) {
      const shotOrigin = this.group.position.clone();
      shotOrigin.y += 3.3;
      if (!(context.terrain.hasLineOfSight?.(shotOrigin, playerPos, 0.9) ?? true)) {
        this.fireCooldown = 0.35;
        return [];
      }

      const burstCount = this.profile.burstCount ?? 1;
      const spreadOffsets = burstCount === 1
        ? [0]
        : burstCount === 2
          ? [-0.06, 0.06]
          : [-0.12, 0, 0.12];
      const shots = [];
      for (const offset of spreadOffsets) {
        const shot = this.buildShot(
          new THREE.Vector3(playerPos.x + offset * 14, playerPos.y + 1.2, playerPos.z + offset * 8),
          this.profile.projectileSpeed,
          this.profile.projectileLife,
          this.profile.damage,
        );
        shot.origin.y += 3.3;
        shots.push({ type: 'spawnProjectile', spec: shot });
      }
      this.fireCooldown = this.profile.fireInterval + randomRange(this.rng, -0.15, 0.18);
      return shots;
    }

    return [];
  }

  intersectSegmentAt(start, end, radiusPadding) {
    return segmentIntersectsCylinderAt(start, end, this.group.position, this.radius + radiusPadding, 3.2);
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsCylinder(start, end, this.group.position, this.radius + radiusPadding, 3.2);
  }
}
