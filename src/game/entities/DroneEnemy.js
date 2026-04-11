import * as THREE from 'three/webgpu';

import { CONFIG } from '../config.js';
import { damp, randomRange, segmentIntersectsSphere, segmentIntersectsSphereAt } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

export class DroneEnemy extends EnemyBase {
  constructor(scene, position, rng, variant = 'assault', profileOverride = null) {
    const baseConfig = CONFIG.enemies.drone;
    const variantConfig = baseConfig.variants?.[variant] ?? {};
    const profile = profileOverride ?? { ...baseConfig, ...variantConfig };
    super(scene, {
      type: 'drone',
      position,
      health: profile.health,
      radius: profile.radius,
      scoreValue: profile.score,
    });
    this.rng = rng;
    this.variant = variant;
    this.profile = profile;
    this.velocity = new THREE.Vector3();
    this.orbitPhase = randomRange(rng, -Math.PI, Math.PI);
    this.fireCooldown = randomRange(rng, 0.9, 1.5);
    this.supportPulseCooldown = profile.repairInterval
      ? randomRange(rng, profile.repairInterval * 0.35, profile.repairInterval)
      : 0;

    const accentColor = variant === 'support'
      ? CONFIG.palette.droneSupport
      : variant === 'jammer'
        ? CONFIG.palette.droneJammer
        : CONFIG.palette.drone;
    const accentEmissive = variant === 'support'
      ? 0x103b23
      : variant === 'jammer'
        ? 0x523500
        : 0x5a0f0f;
    const eyeColor = variant === 'support'
      ? 0x6fe3a7
      : variant === 'jammer'
        ? 0xffd166
        : 0xff2200;

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
      color: accentColor,
      emissive: accentEmissive,
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
      color: eyeColor,
      emissive: eyeColor,
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

    // Wire/cable between arms and body
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.4 });
    const wireGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.8, 4);
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 4) + (Math.PI / 2) * i;
      const wire = new THREE.Mesh(wireGeo, wireMat);
      wire.position.set(Math.cos(angle) * 1.0, -0.25, Math.sin(angle) * 1.0);
      wire.rotation.z = angle + Math.PI / 2;
      wire.rotation.x = 0.15;
      this.group.add(wire);
    }

    // Sensor array under body
    const sensorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.6 });
    const sensorGeo = new THREE.BoxGeometry(0.8, 0.08, 0.5);
    const sensorArray = new THREE.Mesh(sensorGeo, sensorMat);
    sensorArray.position.set(0, -0.55, 0);
    this.group.add(sensorArray);

    this.group.add(bodyTop, bodyBottom, eye);
    this.scene.add(this.group);
  }

  update(dt, context) {
    const playerPos = context.player.group.position;
    this.orbitPhase += dt * 0.7;
    const orbitRadius = this.profile.orbitRadius ?? CONFIG.enemies.drone.orbitRadius;
    const orbitHeight = this.profile.orbitHeight ?? CONFIG.enemies.drone.orbitHeight;
    const orbitVerticalAmplitude = this.profile.orbitVerticalAmplitude ?? CONFIG.enemies.drone.orbitVerticalAmplitude;
    const orbitVerticalFrequency = this.profile.orbitVerticalFrequency ?? CONFIG.enemies.drone.orbitVerticalFrequency;
    const target = new THREE.Vector3(
      playerPos.x + Math.cos(this.orbitPhase) * orbitRadius,
      playerPos.y + orbitHeight + Math.sin(this.orbitPhase * orbitVerticalFrequency) * orbitVerticalAmplitude,
      playerPos.z + Math.sin(this.orbitPhase) * orbitRadius,
    );

    this.velocity.x = damp(this.velocity.x, (target.x - this.group.position.x) * 1.4, 2.6, dt);
    this.velocity.y = damp(this.velocity.y, (target.y - this.group.position.y) * 1.7, 3.6, dt);
    this.velocity.z = damp(this.velocity.z, (target.z - this.group.position.z) * 1.4, 2.6, dt);
    this.velocity.clampLength(0, this.profile.moveSpeed);
    this.group.position.addScaledVector(this.velocity, dt);
    context.terrain.clampToArena(this.group.position);
    this.group.position.y = Math.max(this.group.position.y, context.terrain.getGroundHeight(this.group.position.x, this.group.position.z) + 10);

    this.group.lookAt(playerPos.x, playerPos.y, playerPos.z);
    for (const rotor of this.rotors) {
      rotor.rotation.y += 30 * dt;
    }
    const events = [];
    if (this.variant === 'support' && this.profile.repairInterval) {
      this.supportPulseCooldown -= dt;
      if (this.supportPulseCooldown <= 0) {
        events.push({
          type: 'repairAllies',
          radius: this.profile.repairRadius,
          amount: this.profile.repairAmount,
        });
        this.supportPulseCooldown = this.profile.repairInterval + randomRange(this.rng, -0.35, 0.35);
      }
    }

    this.fireCooldown -= dt;
    if (this.group.position.distanceTo(playerPos) < 86 && this.fireCooldown <= 0) {
      const shot = this.buildShot(
        new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z),
        this.profile.projectileSpeed,
        this.profile.projectileLife,
        this.profile.damage,
      );
      if (!(context.terrain.hasLineOfSight?.(shot.origin, playerPos, shot.radius) ?? true)) {
        this.fireCooldown = 0.25;
        return events;
      }
      this.fireCooldown = this.profile.fireInterval + randomRange(this.rng, -0.2, 0.2);
      events.push({ type: 'spawnProjectile', spec: shot });
    }

    return events;
  }

  getHudLabel() {
    if (this.variant === 'support') {
      return 'SUPPORT DRONE';
    }
    if (this.variant === 'jammer') {
      return 'JAMMER DRONE';
    }
    return super.getHudLabel();
  }

  getRadarType() {
    if (this.variant === 'support') {
      return 'droneSupport';
    }
    if (this.variant === 'jammer') {
      return 'droneJammer';
    }
    return super.getRadarType();
  }

  intersectSegmentAt(start, end, radiusPadding) {
    return segmentIntersectsSphereAt(start, end, this.group.position, this.radius + radiusPadding);
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsSphere(start, end, this.group.position, this.radius + radiusPadding);
  }
}
