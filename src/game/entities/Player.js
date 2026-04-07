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
    const panelMaterial = new THREE.MeshStandardMaterial({
      color: 0x303846,
      roughness: 0.5,
      metalness: 0.56,
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

    const glassMaterial = new THREE.MeshStandardMaterial({
      color: 0x7db1c9,
      roughness: 0.08,
      metalness: 0.82,
      transparent: true,
      opacity: 0.88,
    });
    const warningMaterial = new THREE.MeshStandardMaterial({
      color: 0xff8a3d,
      emissive: 0x7a3000,
      roughness: 0.28,
      metalness: 0.42,
    });
    const rotorRingMaterial = new THREE.MeshStandardMaterial({
      color: 0x262b34,
      roughness: 0.72,
      metalness: 0.22,
    });

    const fuselage = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.88, 4.8, 6, 12),
      bodyMaterial,
    );
    fuselage.rotation.z = Math.PI * 0.5;
    fuselage.castShadow = true;

    const belly = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.45, 3.9),
      darkMaterial,
    );
    belly.position.y = -0.42;
    belly.castShadow = true;

    const dorsalSpine = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.36, 2.4),
      accentMaterial,
    );
    dorsalSpine.position.set(0, 0.62, -0.1);
    dorsalSpine.castShadow = true;

    const noseCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 1.45, 10),
      bodyMaterial,
    );
    noseCone.rotation.x = Math.PI * 0.5;
    noseCone.position.set(0, -0.05, 3.1);
    noseCone.castShadow = true;

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 16, 12),
      glassMaterial,
    );
    canopy.scale.set(0.9, 0.62, 1.15);
    canopy.position.set(0, 0.46, 1.46);
    canopy.castShadow = true;

    const sensorTurret = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 12, 12),
      lensMaterial,
    );
    sensorTurret.position.set(0, -0.48, 2.3);
    sensorTurret.castShadow = true;

    const chinMount = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.26, 0.5),
      darkMaterial,
    );
    chinMount.position.set(0, -0.32, 1.92);
    chinMount.castShadow = true;

    const wingGeometry = new THREE.BoxGeometry(5.2, 0.18, 1.55);
    const wingletGeometry = new THREE.BoxGeometry(0.14, 0.9, 0.62);
    const pylonGeometry = new THREE.BoxGeometry(0.34, 0.22, 1.8);
    const motorGeometry = new THREE.CylinderGeometry(0.44, 0.5, 0.72, 12);
    const rotorDiscGeometry = new THREE.CylinderGeometry(1.25, 1.25, 0.06, 24);
    const rotorRingGeometry = new THREE.TorusGeometry(1.28, 0.05, 8, 18);
    rotorRingGeometry.rotateX(Math.PI * 0.5);

    const mainWing = new THREE.Mesh(wingGeometry, darkMaterial);
    mainWing.position.set(0, 0.08, 0.55);
    mainWing.castShadow = true;

    const rearWing = new THREE.Mesh(
      new THREE.BoxGeometry(3.7, 0.16, 1.1),
      darkMaterial,
    );
    rearWing.position.set(0, 0.02, -1.8);
    rearWing.castShadow = true;

    const tailBoom = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 2.85),
      bodyMaterial,
    );
    tailBoom.position.set(0, 0.02, -3.65);
    tailBoom.castShadow = true;

    const tailPlane = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 0.12, 0.75),
      darkMaterial,
    );
    tailPlane.position.set(0, 0.12, -5.05);
    tailPlane.castShadow = true;

    for (const side of [-1, 1]) {
      const winglet = new THREE.Mesh(wingletGeometry, darkMaterial);
      winglet.position.set(side * 0.72, 0.72, -4.95);
      winglet.castShadow = true;
      this.model.add(winglet);
    }

    const nacellePositions = [
      [2.45, 0.2, 1.45],
      [-2.45, 0.2, 1.45],
      [2.18, 0.14, -1.55],
      [-2.18, 0.14, -1.55],
    ];
    this.rotors = [];
    for (const [x, y, z] of nacellePositions) {
      const pylon = new THREE.Mesh(pylonGeometry, darkMaterial);
      pylon.position.set(x * 0.46, 0.14, z);
      pylon.castShadow = true;
      this.model.add(pylon);

      const motor = new THREE.Mesh(motorGeometry, panelMaterial);
      motor.position.set(x, y, z);
      motor.castShadow = true;
      this.model.add(motor);

      const rotorRing = new THREE.Mesh(rotorRingGeometry, rotorRingMaterial);
      rotorRing.position.set(x, y + 0.26, z);
      rotorRing.castShadow = true;
      this.model.add(rotorRing);

      const rotor = new THREE.Mesh(rotorDiscGeometry, rotorMaterial);
      rotor.position.set(x, y + 0.3, z);
      this.rotors.push(rotor);
      this.model.add(rotor);

      const positionLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 8, 8),
        z > 0 ? ledMaterial : warningMaterial,
      );
      positionLight.position.set(x, y + 0.22, z + (z > 0 ? 0.52 : -0.52));
      this.model.add(positionLight);
    }

    const intakeLeft = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.42, 1.2),
      panelMaterial,
    );
    intakeLeft.position.set(0.86, 0.02, 0.72);
    intakeLeft.castShadow = true;
    const intakeRight = intakeLeft.clone();
    intakeRight.position.x = -0.86;

    const accentStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.12, 2.9),
      accentMaterial,
    );
    accentStripe.position.set(0, 0.12, 0.5);
    accentStripe.castShadow = true;

    const skidGeometry = new THREE.CylinderGeometry(0.06, 0.06, 2.95, 10);
    skidGeometry.rotateX(Math.PI * 0.5);
    const strutGeometry = new THREE.BoxGeometry(0.08, 0.56, 0.08);
    for (const side of [-1, 1]) {
      const skid = new THREE.Mesh(skidGeometry, darkMaterial);
      skid.position.set(side * 1.08, -0.96, 0);
      skid.castShadow = true;
      this.model.add(skid);
      for (const fz of [-0.9, 1]) {
        const strut = new THREE.Mesh(strutGeometry, darkMaterial);
        strut.position.set(side * 1.02, -0.64, fz);
        strut.castShadow = true;
        this.model.add(strut);
      }
    }

    this.model.add(
      fuselage,
      belly,
      dorsalSpine,
      noseCone,
      canopy,
      chinMount,
      sensorTurret,
      mainWing,
      rearWing,
      tailBoom,
      tailPlane,
      intakeLeft,
      intakeRight,
      accentStripe,
    );
    this.model.scale.set(1.22, 1.22, 1.22);
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
    this.yaw -= controls.yaw * CONFIG.player.yawSpeed * dt;

    const forward = this.getHeading();
    const targetForwardSpeed = controls.thrust >= 0
      ? controls.thrust * CONFIG.player.thrust
      : controls.thrust * CONFIG.player.reverseThrust;
    const targetStrafeSpeed = -controls.strafe * CONFIG.player.strafe;
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
