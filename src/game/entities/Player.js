import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { clamp, damp } from '../math.js';

export class Player {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.projectileDirection = new THREE.Vector3();
    this.fireOrigin = new THREE.Vector3();
    this.cooldown = 0;
    this.invulnerability = 0;
    this.yaw = 0;
    this.health = CONFIG.player.maxHealth;

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: CONFIG.palette.player,
      emissive: 0x0a0a0a,
      roughness: 0.3,
      metalness: 0.6,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.4,
      metalness: 0.5,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: CONFIG.palette.playerAccent,
      emissive: 0x8f5b12,
      roughness: 0.2,
      metalness: 0.5,
    });
    const ledMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff44,
      emissive: 0x00ff44,
      emissiveIntensity: 2,
    });
    const rotorMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const lensMaterial = new THREE.MeshStandardMaterial({
      color: 0x111122,
      roughness: 0.05,
      metalness: 0.9,
    });

    // Central body — flattened capsule shape
    const bodyTop = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.8, 0.7, 12),
      bodyMaterial,
    );
    const bodyBottom = new THREE.Mesh(
      new THREE.CylinderGeometry(1.8, 1.5, 0.5, 12),
      darkMaterial,
    );
    bodyBottom.position.y = -0.5;

    // Canopy / top shell
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      bodyMaterial,
    );
    canopy.position.y = 0.3;

    // Four arms extending to motors
    const armGeometry = new THREE.BoxGeometry(0.4, 0.25, 3.2);
    const armPositions = [
      { x: 1.0, z: 1.0, ry: Math.PI / 4 },
      { x: -1.0, z: 1.0, ry: -Math.PI / 4 },
      { x: 1.0, z: -1.0, ry: -Math.PI / 4 },
      { x: -1.0, z: -1.0, ry: Math.PI / 4 },
    ];
    const motorTipOffset = 2.8;
    const motorPositions = [
      [motorTipOffset * Math.sin(Math.PI / 4), 0.15, motorTipOffset * Math.cos(Math.PI / 4)],
      [-motorTipOffset * Math.sin(Math.PI / 4), 0.15, motorTipOffset * Math.cos(Math.PI / 4)],
      [motorTipOffset * Math.sin(Math.PI / 4), 0.15, -motorTipOffset * Math.cos(Math.PI / 4)],
      [-motorTipOffset * Math.sin(Math.PI / 4), 0.15, -motorTipOffset * Math.cos(Math.PI / 4)],
    ];

    for (const arm of armPositions) {
      const armMesh = new THREE.Mesh(armGeometry, darkMaterial);
      armMesh.position.set(arm.x, 0, arm.z);
      armMesh.rotation.y = arm.ry;
      armMesh.castShadow = true;
      this.model.add(armMesh);
    }

    // Motor housings + rotor discs
    const motorGeometry = new THREE.CylinderGeometry(0.45, 0.5, 0.55, 10);
    const rotorDiscGeometry = new THREE.CylinderGeometry(1.6, 1.6, 0.06, 20);
    this.rotors = [];
    for (const [x, y, z] of motorPositions) {
      const motor = new THREE.Mesh(motorGeometry, darkMaterial);
      motor.position.set(x, y, z);
      motor.castShadow = true;
      this.model.add(motor);

      const rotor = new THREE.Mesh(rotorDiscGeometry, rotorMaterial);
      rotor.position.set(x, y + 0.35, z);
      this.rotors.push(rotor);
      this.model.add(rotor);

      // LED on each motor
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 6, 6),
        z > 0 ? ledMaterial : new THREE.MeshStandardMaterial({
          color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 2,
        }),
      );
      led.position.set(x, y + 0.3, z + (z > 0 ? 0.5 : -0.5));
      this.model.add(led);
    }

    // Camera gimbal underneath
    const gimbalMount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.3, 8),
      darkMaterial,
    );
    gimbalMount.position.set(0, -0.65, 0.5);
    const cameraLens = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 10),
      lensMaterial,
    );
    cameraLens.position.set(0, -0.65, 0.85);

    // Landing skids
    const skidGeometry = new THREE.BoxGeometry(0.15, 0.12, 2.8);
    const strutGeometry = new THREE.BoxGeometry(0.12, 0.6, 0.12);
    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(skidGeometry, darkMaterial);
      skid.position.set(side * 1.2, -0.95, 0);
      this.model.add(skid);
      for (const fz of [-0.8, 0.8]) {
        const strut = new THREE.Mesh(strutGeometry, darkMaterial);
        strut.position.set(side * 1.2, -0.65, fz);
        this.model.add(strut);
      }
    }

    bodyTop.castShadow = true;
    bodyBottom.castShadow = true;
    canopy.castShadow = true;
    this.model.add(bodyTop, bodyBottom, canopy, gimbalMount, cameraLens);
    // Scale the whole model to match the original drone's footprint
    this.model.scale.set(1.3, 1.3, 1.3);
    this.group.add(this.model);
    this.scene.add(this.group);

    this.reset();
  }

  reset() {
    this.group.position.set(0, 18, 54);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.PI;
    this.cooldown = 0;
    this.invulnerability = 0;
    this.health = CONFIG.player.maxHealth;
  }

  getHeading() {
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.right.set(this.forward.z, 0, -this.forward.x);
    return this.forward;
  }

  update(dt, controls) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    this.yaw += controls.yaw * CONFIG.player.yawSpeed * dt;

    const forward = this.getHeading();
    const targetForwardSpeed = controls.thrust >= 0
      ? controls.thrust * CONFIG.player.thrust
      : controls.thrust * CONFIG.player.reverseThrust;
    const targetStrafeSpeed = controls.strafe * CONFIG.player.strafe;
    const targetVerticalSpeed = controls.vertical * CONFIG.player.vertical;

    this.velocity.x = damp(this.velocity.x, forward.x * targetForwardSpeed + this.right.x * targetStrafeSpeed, 5, dt);
    this.velocity.z = damp(this.velocity.z, forward.z * targetForwardSpeed + this.right.z * targetStrafeSpeed, 5, dt);
    this.velocity.y = damp(this.velocity.y, targetVerticalSpeed, 4, dt);
    this.group.position.addScaledVector(this.velocity, dt);

    this.terrain.clampToArena(this.group.position);
    const floor = this.terrain.getGroundHeight(this.group.position.x, this.group.position.z) + CONFIG.world.minAltitude;
    this.group.position.y = clamp(this.group.position.y, floor, CONFIG.world.maxAltitude);

    this.model.rotation.z = damp(this.model.rotation.z, -controls.strafe * 0.32 - controls.yaw * 0.28, 7, dt);
    this.model.rotation.x = damp(this.model.rotation.x, controls.pitch * 0.22 - controls.thrust * 0.08, 7, dt);
    this.group.rotation.y = this.yaw;

    // Spin rotor discs
    for (const rotor of this.rotors) {
      rotor.rotation.y += 35 * dt;
    }
  }

  wantsToFire(controls) {
    return controls.fire && this.cooldown <= 0;
  }

  consumeShotCooldown() {
    this.cooldown = CONFIG.player.fireCooldown;
  }

  getShotDirection(aimDirection) {
    this.getHeading();
    if (aimDirection) {
      return this.projectileDirection.copy(aimDirection).normalize();
    }
    return this.projectileDirection.copy(this.forward).normalize();
  }

  getMuzzleOrigin(direction) {
    this.fireOrigin.copy(this.group.position).addScaledVector(direction, 5);
    this.fireOrigin.y += 0.7;
    return this.fireOrigin.clone();
  }

  buildShotSpec(aimDirection, targetId = null) {
    const direction = this.getShotDirection(aimDirection);
    const origin = this.getMuzzleOrigin(direction);
    return {
      team: 'player',
      damage: CONFIG.projectiles.playerDamage,
      radius: 1.05,
      maxLife: CONFIG.player.projectileLife,
      targetId,
      turnRate: targetId ? CONFIG.player.projectileTurnRate : 0,
      origin,
      velocity: new THREE.Vector3(
        direction.x * CONFIG.player.projectileSpeed + this.velocity.x * 0.18,
        direction.y * CONFIG.player.projectileSpeed + this.velocity.y * 0.18,
        direction.z * CONFIG.player.projectileSpeed + this.velocity.z * 0.18,
      ),
    };
  }

  applyDamage(amount) {
    if (this.invulnerability > 0) {
      return false;
    }
    this.health = Math.max(0, this.health - amount);
    this.invulnerability = CONFIG.player.invulnerabilityTime;
    return true;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
