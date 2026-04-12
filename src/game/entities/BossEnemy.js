import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { segmentIntersectsCylinder, segmentIntersectsCylinderAt } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

function randomRange(rng, min, max) {
  return min + rng() * (max - min);
}

function formatAttackLabel(type) {
  if (type === 'missileBarrage') {
    return 'MISSILE BARRAGE';
  }
  if (type === 'crossfireSweep') {
    return 'CROSSFIRE SWEEP';
  }
  return 'PLASMA FAN';
}

export class BossEnemy extends EnemyBase {
  constructor(scene, position, rng, profile = CONFIG.enemies.boss) {
    super(scene, {
      type: 'boss',
      position,
      health: profile.health,
      radius: profile.radius,
      scoreValue: profile.score,
    });
    this.rng = rng;
    this.profile = profile;
    this.fireCooldown = 1.8;
    this.missileCooldown = 4.4;
    this.hoverPhase = rng() * Math.PI * 2;
    this.currentPhase = 1;
    this.currentAttack = null;
    this.attackCooldown = 1.2;
    this.canopyMaterial = null;
    this.engineMaterials = [];

    const hullMat = new THREE.MeshStandardMaterial({
      color: CONFIG.palette.boss,
      emissive: 0x162d35,
      roughness: 0.52,
      metalness: 0.34,
    });
    const armorMat = new THREE.MeshStandardMaterial({
      color: 0x4d5f6b,
      roughness: 0.7,
      metalness: 0.18,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x9feeff,
      roughness: 0.1,
      metalness: 0.82,
      transparent: true,
      opacity: 0.84,
    });
    const engineMat = new THREE.MeshStandardMaterial({
      color: 0xffd68f,
      emissive: 0xd36f12,
      emissiveIntensity: 1.8,
    });

    const core = new THREE.Mesh(new THREE.BoxGeometry(14, 3.8, 22), hullMat);
    core.position.y = 4;
    core.castShadow = true;
    core.receiveShadow = true;

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(8.5, 4.5, 7.5), armorMat);
    bridge.position.set(0, 7.1, -1.5);
    bridge.castShadow = true;

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 12), glassMat);
    canopy.scale.set(1.3, 0.62, 1);
    canopy.position.set(0, 8.2, 1.6);
    canopy.castShadow = true;
    this.canopyMaterial = glassMat;

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 12), armorMat);
      wing.position.set(side * 8.2, 4.2, 1);
      wing.castShadow = true;
      this.group.add(wing);

      const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 6.5, 10), engineMat);
      cannon.rotation.x = Math.PI / 2;
      cannon.position.set(side * 5.4, 4.5, 8.3);
      cannon.castShadow = true;
      this.group.add(cannon);

      const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 2.1, 10), engineMat);
      engine.rotation.x = Math.PI / 2;
      engine.position.set(side * 4.8, 3.8, -9.8);
      this.engineMaterials.push(engineMat);
      this.group.add(engine);
    }

    this.group.add(core, bridge, canopy);
    this.scene.add(this.group);
  }

  getPhaseForHealth() {
    const ratio = this.maxHealth > 0 ? this.health / this.maxHealth : 0;
    if (ratio <= (this.profile.phaseThresholds?.phase3 ?? 0.33)) {
      return 3;
    }
    if (ratio <= (this.profile.phaseThresholds?.phase2 ?? 0.66)) {
      return 2;
    }
    return 1;
  }

  getAttackCooldownRange() {
    if (this.currentPhase >= 3) {
      return this.profile.attackCooldownRange?.phase3 ?? [0.75, 1.3];
    }
    if (this.currentPhase >= 2) {
      return this.profile.attackCooldownRange?.phase2 ?? [1.0, 1.7];
    }
    return this.profile.attackCooldownRange?.phase1 ?? [1.4, 2.1];
  }

  getAttackWarmup(type) {
    return this.profile.attackWarmup?.[type] ?? 0.8;
  }

  chooseAttackPattern() {
    const roll = this.rng();
    if (this.currentPhase === 1) {
      return roll < 0.65 ? 'plasmaFan' : 'crossfireSweep';
    }
    if (this.currentPhase === 2) {
      if (roll < 0.35) {
        return 'plasmaFan';
      }
      if (roll < 0.7) {
        return 'crossfireSweep';
      }
      return 'missileBarrage';
    }
    if (roll < 0.3) {
      return 'plasmaFan';
    }
    if (roll < 0.58) {
      return 'crossfireSweep';
    }
    return 'missileBarrage';
  }

  startAttack(type) {
    const warmup = this.getAttackWarmup(type);
    this.currentAttack = {
      type,
      warmup,
      announced: false,
      stepCooldown: 0,
      stepIndex: 0,
      stepsRemaining: type === 'missileBarrage'
        ? (this.currentPhase >= 3 ? 3 : this.currentPhase >= 2 ? 2 : 1)
        : type === 'crossfireSweep'
          ? (this.currentPhase >= 3 ? 4 : this.currentPhase >= 2 ? 3 : 2)
          : 1,
    };

    return [{
      type: 'status',
      message: `Command carrier ${formatAttackLabel(type).toLowerCase()} incoming.`,
      duration: 1.5,
    }];
  }

  updateMaterials() {
    const telegraphProgress = this.currentAttack
      ? 1 - Math.max(0, this.currentAttack.warmup) / Math.max(0.001, this.getAttackWarmup(this.currentAttack.type))
      : 0;
    const phaseBoost = this.currentPhase >= 3 ? 0.9 : this.currentPhase >= 2 ? 0.5 : 0.2;
    if (this.canopyMaterial) {
      this.canopyMaterial.emissiveIntensity = 0.2 + phaseBoost + telegraphProgress * 1.6;
      this.canopyMaterial.opacity = 0.8 + telegraphProgress * 0.12;
    }
    for (const material of this.engineMaterials) {
      material.emissiveIntensity = 1.8 + phaseBoost * 0.7 + telegraphProgress * 1.2;
    }
  }

  buildFanVolley(playerPos, centerBias = 0, width = 1) {
    const phaseShotCount = this.currentPhase >= 3 ? 7 : 5;
    const offsets = phaseShotCount === 7
      ? [-0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36]
      : [-0.24, -0.12, 0, 0.12, 0.24];
    return offsets.map((offset) => {
      const shotTarget = new THREE.Vector3(
        playerPos.x + (offset + centerBias) * 20 * width,
        playerPos.y + 1.8,
        playerPos.z + (offset + centerBias) * 12 * width,
      );
      const shot = this.buildShot(
        shotTarget,
        this.profile.projectileSpeed,
        this.profile.projectileLife,
        this.profile.damage,
      );
      shot.origin.y += 3.8;
      return { type: 'spawnProjectile', spec: shot };
    });
  }

  executeAttackStep(playerPos) {
    if (!this.currentAttack) {
      return [];
    }

    const events = [];
    if (this.currentAttack.type === 'plasmaFan') {
      events.push(...this.buildFanVolley(playerPos, 0, 1));
      this.currentAttack.stepsRemaining = 0;
      return events;
    }

    if (this.currentAttack.type === 'crossfireSweep') {
      const totalSteps = this.currentPhase >= 3 ? 4 : this.currentPhase >= 2 ? 3 : 2;
      const progress = totalSteps === 1 ? 0.5 : this.currentAttack.stepIndex / (totalSteps - 1);
      const bias = -0.36 + progress * 0.72;
      events.push(...this.buildFanVolley(playerPos, bias, 0.9));
      this.currentAttack.stepIndex += 1;
      this.currentAttack.stepsRemaining -= 1;
      this.currentAttack.stepCooldown = 0.26;
      return events;
    }

    const sideOffsets = this.currentPhase >= 3
      ? [-10, -4, 4, 10, 0]
      : [-10, -4, 4, 10];
    for (const x of sideOffsets) {
      events.push({
        type: 'spawnEnemy',
        enemyType: 'missile',
        position: this.group.position.clone().add(new THREE.Vector3(x, 1.8, this.currentAttack.stepIndex * 1.5)),
      });
    }
    if (this.currentPhase >= 2) {
      events.push(...this.buildFanVolley(playerPos, 0, 0.55));
    }
    this.currentAttack.stepIndex += 1;
    this.currentAttack.stepsRemaining -= 1;
    this.currentAttack.stepCooldown = 0.42;
    return events;
  }

  update(dt, context) {
    this.hoverPhase += dt;
    const nextPhase = this.getPhaseForHealth();
    const events = [];
    if (nextPhase !== this.currentPhase) {
      this.currentPhase = nextPhase;
      this.currentAttack = null;
      this.attackCooldown = 0.45;
      events.push({
        type: 'status',
        message: `Command carrier phase ${this.currentPhase} engaged.`,
        duration: 2,
      });
    }

    const playerPos = context.player.group.position;
    const orbitRadius = this.currentPhase >= 3 ? 34 : this.currentPhase >= 2 ? 44 : 54;
    const altitude = this.currentPhase >= 3 ? 24 : this.currentPhase >= 2 ? 21 : 18;
    const target = new THREE.Vector3(
      playerPos.x + Math.cos(this.hoverPhase * (this.currentPhase >= 3 ? 0.52 : 0.3)) * orbitRadius,
      Math.max(altitude, playerPos.y + 16 + Math.sin(this.hoverPhase * 0.9) * (this.currentPhase >= 3 ? 7 : 5)),
      playerPos.z + Math.sin(this.hoverPhase * (this.currentPhase >= 3 ? 0.52 : 0.3)) * orbitRadius,
    );

    this.group.position.lerp(target, Math.min(1, dt * (this.currentPhase >= 3 ? 0.42 : 0.26)));
    this.group.lookAt(playerPos.x, playerPos.y + 4, playerPos.z);

    this.attackCooldown -= dt;
    if (!this.currentAttack && this.attackCooldown <= 0) {
      events.push(...this.startAttack(this.chooseAttackPattern()));
    }

    if (this.currentAttack) {
      this.currentAttack.warmup -= dt;
      if (this.currentAttack.warmup <= 0) {
        this.currentAttack.stepCooldown -= dt;
        if (this.currentAttack.stepCooldown <= 0 && this.currentAttack.stepsRemaining > 0) {
          events.push(...this.executeAttackStep(playerPos));
        }
        if (this.currentAttack.stepsRemaining <= 0) {
          this.currentAttack = null;
          const [minCooldown, maxCooldown] = this.getAttackCooldownRange();
          this.attackCooldown = randomRange(this.rng, minCooldown, maxCooldown);
        }
      }
    }

    this.updateMaterials();
    return events;
  }

  getHudLabel() {
    if (this.currentAttack) {
      return `COMMAND CARRIER // ${formatAttackLabel(this.currentAttack.type)}`;
    }
    return `COMMAND CARRIER // PHASE ${this.currentPhase}`;
  }

  intersectSegmentAt(start, end, radiusPadding) {
    return segmentIntersectsCylinderAt(start, end, this.group.position, this.radius + radiusPadding, 6.8);
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsCylinder(start, end, this.group.position, this.radius + radiusPadding, 6.8);
  }
}
