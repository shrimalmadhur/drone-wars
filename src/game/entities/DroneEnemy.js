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

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a3a,
      roughness: 0.35,
      metalness: 0.5,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.4,
      metalness: 0.4,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: CONFIG.palette.drone,
      emissive: 0x5a0f0f,
      roughness: 0.3,
      metalness: 0.3,
    });
    const rotorMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xff2200,
      emissive: 0xff2200,
      emissiveIntensity: 2,
    });

    // Central body — angular, aggressive
    const bodyTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.4, 0.6, 6),
      bodyMat,
    );
    const bodyBottom = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.0, 0.5, 6),
      darkMat,
    );
    bodyBottom.position.y = -0.45;

    // Sensor eye — glowing red
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      eyeMat,
    );
    eye.position.set(0, -0.15, 1.2);

    // Four arms + motors + rotor discs
    const armGeo = new THREE.BoxGeometry(0.3, 0.18, 2.4);
    const motorGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.4, 8);
    const rotorGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.04, 16);
    const tipDist = 2.1;
    const armConfigs = [
      { x: 0.7, z: 0.7, ry: Math.PI / 4 },
      { x: -0.7, z: 0.7, ry: -Math.PI / 4 },
      { x: 0.7, z: -0.7, ry: -Math.PI / 4 },
      { x: -0.7, z: -0.7, ry: Math.PI / 4 },
    ];
    const motorTips = [
      [tipDist * Math.SQRT1_2, 0.1, tipDist * Math.SQRT1_2],
      [-tipDist * Math.SQRT1_2, 0.1, tipDist * Math.SQRT1_2],
      [tipDist * Math.SQRT1_2, 0.1, -tipDist * Math.SQRT1_2],
      [-tipDist * Math.SQRT1_2, 0.1, -tipDist * Math.SQRT1_2],
    ];

    this.rotors = [];
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(armGeo, darkMat);
      arm.position.set(armConfigs[i].x, 0, armConfigs[i].z);
      arm.rotation.y = armConfigs[i].ry;
      arm.castShadow = true;
      this.group.add(arm);

      const motor = new THREE.Mesh(motorGeo, accentMat);
      motor.position.set(motorTips[i][0], motorTips[i][1], motorTips[i][2]);
      motor.castShadow = true;
      this.group.add(motor);

      const rotor = new THREE.Mesh(rotorGeo, rotorMat);
      rotor.position.set(motorTips[i][0], motorTips[i][1] + 0.25, motorTips[i][2]);
      this.rotors.push(rotor);
      this.group.add(rotor);
    }

    bodyTop.castShadow = true;
    bodyBottom.castShadow = true;
    this.group.add(bodyTop, bodyBottom, eye);
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
    for (const rotor of this.rotors) {
      rotor.rotation.y += 30 * dt;
    }
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
