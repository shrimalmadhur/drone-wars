import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { clamp, damp } from '../math.js';
import { getAbilityDefinition, sanitizeAbilityId } from '../meta/abilities.js';

export class Player {
  constructor(scene, terrain, runModifiers = {}, loadout = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.projectileDirection = new THREE.Vector3();
    this.fireOrigin = new THREE.Vector3();
    this.fireRight = new THREE.Vector3();
    this.dashDirection = new THREE.Vector3();
    this.cooldown = 0;
    this.invulnerability = 0;
    this.abilityCooldown = 0;
    this.equippedAbility = sanitizeAbilityId(loadout?.ability);
    this.activePowerUp = null;
    this.activePowerUpTimer = 0;
    this.repairFlashTimer = 0;
    this.dashFlashTimer = 0;
    this.yaw = 0;
    this.runModifiers = {
      maxHealth: CONFIG.player.maxHealth,
      pulseCooldown: CONFIG.player.pulseCooldown,
      collectionRadius: CONFIG.powerUps.collectionRadius,
      spreadAngle: CONFIG.player.spreadAngle,
      ...runModifiers,
    };
    this.health = this.runModifiers.maxHealth;

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

    // Muzzle flash
    this.muzzleLight = new THREE.PointLight(
      CONFIG.palette.playerShot,
      0,
      CONFIG.effects.muzzleFlash.lightRange,
    );
    this.muzzleLight.visible = false;
    this.group.add(this.muzzleLight);
    this.muzzleFlashTimer = 0;

    const shieldMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.palette.pickup.shield,
      transparent: true,
      opacity: 0,
      wireframe: true,
    });
    this.shieldShell = new THREE.Mesh(
      new THREE.SphereGeometry(4.8, 16, 12),
      shieldMaterial,
    );
    this.shieldShell.visible = false;
    this.group.add(this.shieldShell);

    const overdriveMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.palette.pickup.overdrive,
      transparent: true,
      opacity: 0,
    });
    this.overdriveRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.35, 0.12, 8, 32),
      overdriveMaterial,
    );
    this.overdriveRing.rotation.x = Math.PI * 0.5;
    this.overdriveRing.position.y = -0.15;
    this.overdriveRing.visible = false;
    this.group.add(this.overdriveRing);

    const spreadMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.palette.pickup.spread,
      transparent: true,
      opacity: 0,
    });
    this.spreadRings = [-1, 1].map((side) => {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.82, 0.08, 8, 24),
        spreadMaterial.clone(),
      );
      ring.rotation.y = Math.PI * 0.5;
      ring.position.set(side * 2.75, 0.08, 0.65);
      ring.visible = false;
      this.group.add(ring);
      return ring;
    });

    const repairMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.palette.pickup.repair,
      transparent: true,
      opacity: 0,
    });
    this.repairPulse = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.14, 8, 32),
      repairMaterial,
    );
    this.repairPulse.rotation.x = Math.PI * 0.5;
    this.repairPulse.position.y = -0.55;
    this.repairPulse.visible = false;
    this.group.add(this.repairPulse);

    const dashMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.palette.playerAccent,
      transparent: true,
      opacity: 0,
    });
    this.dashRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.1, 8, 36),
      dashMaterial,
    );
    this.dashRing.rotation.y = Math.PI * 0.5;
    this.dashRing.position.z = -0.2;
    this.dashRing.visible = false;
    this.group.add(this.dashRing);

    this.reset();
  }

  setRunModifiers(runModifiers = {}) {
    this.runModifiers = {
      maxHealth: CONFIG.player.maxHealth,
      pulseCooldown: CONFIG.player.pulseCooldown,
      collectionRadius: CONFIG.powerUps.collectionRadius,
      spreadAngle: CONFIG.player.spreadAngle,
      ...runModifiers,
    };
    this.health = Math.min(this.health, this.runModifiers.maxHealth);
  }

  setLoadout(loadout = {}) {
    this.equippedAbility = sanitizeAbilityId(loadout?.ability);
  }

  reset() {
    this.group.position.set(0, 18, 54);
    this.velocity.set(0, 0, 0);
    this.yaw = Math.PI;
    this.cooldown = 0;
    this.invulnerability = 0;
    this.abilityCooldown = 0;
    this.activePowerUp = null;
    this.activePowerUpTimer = 0;
    this.repairFlashTimer = 0;
    this.dashFlashTimer = 0;
    this.health = this.runModifiers.maxHealth;
    this.muzzleFlashTimer = 0;
    if (this.muzzleLight) {
      this.muzzleLight.intensity = 0;
      this.muzzleLight.visible = false;
    }
    this.hidePowerVisuals();
  }

  getHeading() {
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.right.set(this.forward.z, 0, -this.forward.x);
    return this.forward;
  }

  update(dt, controls) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invulnerability = Math.max(0, this.invulnerability - dt);
    this.abilityCooldown = Math.max(0, this.abilityCooldown - dt);
    this.activePowerUpTimer = Math.max(0, this.activePowerUpTimer - dt);
    this.repairFlashTimer = Math.max(0, this.repairFlashTimer - dt);
    this.dashFlashTimer = Math.max(0, this.dashFlashTimer - dt);
    if (this.activePowerUpTimer <= 0) {
      this.activePowerUp = null;
    }
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

    this.model.rotation.z = damp(this.model.rotation.z, controls.strafe * 0.32 - controls.yaw * 0.28, 7, dt);
    this.model.rotation.x = damp(this.model.rotation.x, controls.pitch * 0.22 - controls.thrust * 0.08, 7, dt);
    this.group.rotation.y = this.yaw;

    // Spin rotor discs
    for (const rotor of this.rotors) {
      rotor.rotation.y += 35 * dt;
    }

    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      if (this.muzzleFlashTimer <= 0) {
        this.muzzleLight.intensity = 0;
        this.muzzleLight.visible = false;
      } else {
        const progress = 1 - this.muzzleFlashTimer / CONFIG.effects.muzzleFlash.duration;
        this.muzzleLight.intensity = CONFIG.effects.muzzleFlash.lightIntensity * (1 - progress);
      }
    }

    this.updatePowerVisuals(dt);
  }

  triggerMuzzleFlash(origin) {
    const cfg = CONFIG.effects.muzzleFlash;
    this.muzzleLight.position.copy(origin).sub(this.group.position);
    this.muzzleLight.intensity = cfg.lightIntensity;
    this.muzzleLight.visible = true;
    this.muzzleFlashTimer = cfg.duration;
  }

  wantsToFire(controls) {
    return controls.fire && this.cooldown <= 0;
  }

  consumeShotCooldown() {
    this.cooldown = this.activePowerUp === 'overdrive'
      ? CONFIG.player.overdriveFireCooldown
      : CONFIG.player.fireCooldown;
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

  buildShotSpecs(aimDirection, targetId = null) {
    const direction = this.getShotDirection(aimDirection);
    const createSpec = (adjustedDirection, lateralOffset = 0) => {
      const origin = this.getMuzzleOrigin(adjustedDirection);
      if (lateralOffset !== 0) {
        this.fireRight.set(adjustedDirection.z, 0, -adjustedDirection.x).normalize();
        origin.addScaledVector(this.fireRight, lateralOffset);
      }
      return {
        team: 'player',
        damage: CONFIG.projectiles.playerDamage,
        radius: 1.05,
        maxLife: CONFIG.player.projectileLife,
        targetId,
        turnRate: targetId ? CONFIG.player.projectileTurnRate : 0,
        origin,
        velocity: new THREE.Vector3(
          adjustedDirection.x * CONFIG.player.projectileSpeed + this.velocity.x * 0.18,
          adjustedDirection.y * CONFIG.player.projectileSpeed + this.velocity.y * 0.18,
          adjustedDirection.z * CONFIG.player.projectileSpeed + this.velocity.z * 0.18,
        ),
      };
    };

    if (this.activePowerUp !== 'spread') {
      return [createSpec(direction)];
    }

    const shots = [createSpec(direction)];
    for (const side of [-1, 1]) {
      const spreadDirection = direction.clone();
      spreadDirection.x += side * this.runModifiers.spreadAngle * Math.cos(this.yaw);
      spreadDirection.z -= side * this.runModifiers.spreadAngle * Math.sin(this.yaw);
      spreadDirection.normalize();
      shots.push(createSpec(spreadDirection, side * 1.4));
    }
    return shots;
  }

  applyDamage(amount) {
    if (this.invulnerability > 0) {
      return false;
    }
    if (this.activePowerUp === 'shield') {
      // Shielded hits are fully absorbed while the pickup is active.
      this.invulnerability = 0.12;
      return false;
    }
    this.health = Math.max(0, this.health - amount);
    this.invulnerability = CONFIG.player.invulnerabilityTime;
    return true;
  }

  canUseAbility() {
    return this.abilityCooldown <= 0;
  }

  canUsePulse() {
    return this.equippedAbility === 'pulse' && this.canUseAbility();
  }

  triggerAbilityCooldown(duration) {
    this.abilityCooldown = duration;
  }

  triggerPulse() {
    this.triggerAbilityCooldown(this.runModifiers.pulseCooldown);
  }

  triggerDash() {
    this.getHeading();
    this.dashDirection.copy(this.forward).normalize();
    this.velocity.addScaledVector(this.dashDirection, 115);
    this.invulnerability = Math.max(this.invulnerability, 0.45);
    this.dashFlashTimer = 0.45;
    this.triggerAbilityCooldown(7.5);
  }

  applyPowerUp(type) {
    if (type === 'repair') {
      this.health = Math.min(this.runModifiers.maxHealth, this.health + CONFIG.powerUps.repairAmount);
      this.repairFlashTimer = 1.1;
      return;
    }

    this.activePowerUp = type;
    this.activePowerUpTimer = type === 'shield'
      ? CONFIG.powerUps.shieldDuration
      : CONFIG.powerUps.timedDuration;
  }

  hidePowerVisuals() {
    this.shieldShell.visible = false;
    this.shieldShell.material.opacity = 0;
    this.overdriveRing.visible = false;
    this.overdriveRing.material.opacity = 0;
    this.repairPulse.visible = false;
    this.repairPulse.material.opacity = 0;
    this.dashRing.visible = false;
    this.dashRing.material.opacity = 0;
    for (const ring of this.spreadRings) {
      ring.visible = false;
      ring.material.opacity = 0;
    }
  }

  updatePowerVisuals(dt) {
    const pulse = Math.sin(performance.now() * 0.01);

    this.shieldShell.visible = this.activePowerUp === 'shield';
    if (this.shieldShell.visible) {
      this.shieldShell.rotation.y += dt * 0.7;
      this.shieldShell.material.opacity = 0.14 + (pulse * 0.5 + 0.5) * 0.16;
      const scale = 1 + (pulse * 0.5 + 0.5) * 0.04;
      this.shieldShell.scale.setScalar(scale);
    } else {
      this.shieldShell.material.opacity = 0;
    }

    this.overdriveRing.visible = this.activePowerUp === 'overdrive';
    if (this.overdriveRing.visible) {
      this.overdriveRing.rotation.z += dt * 1.8;
      this.overdriveRing.material.opacity = 0.18 + (pulse * 0.5 + 0.5) * 0.22;
      const scale = 1 + (pulse * 0.5 + 0.5) * 0.08;
      this.overdriveRing.scale.setScalar(scale);
    } else {
      this.overdriveRing.material.opacity = 0;
    }

    const spreadVisible = this.activePowerUp === 'spread';
    for (const [index, ring] of this.spreadRings.entries()) {
      ring.visible = spreadVisible;
      if (spreadVisible) {
        ring.rotation.z += dt * (index === 0 ? 2.2 : -2.2);
        ring.material.opacity = 0.24 + (pulse * 0.5 + 0.5) * 0.18;
      } else {
        ring.material.opacity = 0;
      }
    }

    this.repairPulse.visible = this.repairFlashTimer > 0;
    if (this.repairPulse.visible) {
      const progress = 1 - this.repairFlashTimer / 1.1;
      this.repairPulse.material.opacity = (1 - progress) * 0.45;
      const scale = 0.85 + progress * 1.35;
      this.repairPulse.scale.setScalar(scale);
    } else {
      this.repairPulse.material.opacity = 0;
      this.repairPulse.scale.setScalar(1);
    }

    this.dashRing.visible = this.dashFlashTimer > 0;
    if (this.dashRing.visible) {
      const progress = 1 - this.dashFlashTimer / 0.45;
      this.dashRing.material.opacity = (1 - progress) * 0.32;
      this.dashRing.scale.setScalar(0.9 + progress * 1.3);
    } else {
      this.dashRing.material.opacity = 0;
      this.dashRing.scale.setScalar(1);
    }
  }

  getCombatStatus() {
    const ability = getAbilityDefinition(this.equippedAbility);
    return {
      activePowerUp: this.activePowerUp,
      activePowerUpTimer: this.activePowerUpTimer,
      equippedAbility: ability.id,
      abilityLabel: ability.label,
      abilitySummary: ability.summary,
      abilityCooldown: this.abilityCooldown,
      collectionRadius: this.runModifiers.collectionRadius,
    };
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
