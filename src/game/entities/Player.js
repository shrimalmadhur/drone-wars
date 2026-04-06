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
      emissive: 0x0f4456,
      roughness: 0.4,
      metalness: 0.35,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: CONFIG.palette.playerAccent,
      emissive: 0x8f5b12,
      roughness: 0.2,
      metalness: 0.5,
    });

    const core = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.2, 6.6), bodyMaterial);
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.1, 1.8), accentMaterial);
    cockpit.position.set(0, 0.8, 1);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.3, 1.1), bodyMaterial);
    wing.position.y = 0.2;

    const rotorGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.16, 10);
    const rotorOffsets = [
      [-3.4, 0.5, 2.2],
      [3.4, 0.5, 2.2],
      [-3.4, 0.5, -2.2],
      [3.4, 0.5, -2.2],
    ];
    for (const [x, y, z] of rotorOffsets) {
      const rotor = new THREE.Mesh(rotorGeometry, accentMaterial);
      rotor.rotation.z = Math.PI / 2;
      rotor.position.set(x, y, z);
      this.model.add(rotor);
    }

    core.castShadow = true;
    cockpit.castShadow = true;
    wing.castShadow = true;
    this.model.add(core, cockpit, wing);
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
