import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { segmentIntersectsCylinder, segmentIntersectsCylinderAt } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

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
      this.group.add(engine);
    }

    this.group.add(core, bridge, canopy);
    this.scene.add(this.group);
  }

  update(dt, context) {
    this.hoverPhase += dt;
    const playerPos = context.player.group.position;
    const target = new THREE.Vector3(
      playerPos.x + Math.cos(this.hoverPhase * 0.3) * 54,
      Math.max(18, playerPos.y + 16 + Math.sin(this.hoverPhase * 0.9) * 5),
      playerPos.z + Math.sin(this.hoverPhase * 0.3) * 54,
    );

    this.group.position.lerp(target, Math.min(1, dt * 0.26));
    this.group.lookAt(playerPos.x, playerPos.y + 4, playerPos.z);

    const events = [];
    this.fireCooldown -= dt;
    this.missileCooldown -= dt;

    if (this.fireCooldown <= 0) {
      const offsets = this.profile.salvoCount >= 5
        ? [-0.28, -0.14, 0, 0.14, 0.28]
        : [-0.18, 0, 0.18];
      for (const offset of offsets) {
        const shotTarget = new THREE.Vector3(
          playerPos.x + offset * 18,
          playerPos.y + 1.6,
          playerPos.z + offset * 10,
        );
        const shot = this.buildShot(
          shotTarget,
          this.profile.projectileSpeed,
          this.profile.projectileLife,
          this.profile.damage,
        );
        shot.origin.y += 3.8;
        events.push({ type: 'spawnProjectile', spec: shot });
      }
      this.fireCooldown = this.profile.fireInterval;
    }

    if (this.missileCooldown <= 0) {
      const missileOffsets = (this.profile.missileVolleyCount ?? 2) >= 3
        ? [-8, 0, 8]
        : [-8, 8];
      for (const x of missileOffsets) {
        events.push({
          type: 'spawnEnemy',
          enemyType: 'missile',
          position: this.group.position.clone().add(new THREE.Vector3(x, 1.5, 0)),
        });
      }
      this.missileCooldown = this.profile.missileInterval;
    }

    return events;
  }

  getHudLabel() {
    return 'COMMAND CARRIER';
  }

  intersectSegmentAt(start, end, radiusPadding) {
    return segmentIntersectsCylinderAt(start, end, this.group.position, this.radius + radiusPadding, 6.8);
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsCylinder(start, end, this.group.position, this.radius + radiusPadding, 6.8);
  }
}
