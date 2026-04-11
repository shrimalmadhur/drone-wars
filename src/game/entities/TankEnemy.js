import * as THREE from 'three/webgpu';

import { CONFIG } from '../config.js';
import { normalizeAngle, randomRange, segmentIntersectsCylinder, segmentIntersectsCylinderAt } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

export class TankEnemy extends EnemyBase {
  constructor(scene, position, rng, profile = CONFIG.enemies.tank) {
    super(scene, {
      type: 'tank',
      position,
      health: profile.health,
      radius: profile.radius,
      scoreValue: profile.score,
    });
    this.rng = rng;
    this.profile = profile;
    this.heading = randomRange(rng, -Math.PI, Math.PI);
    this.fireCooldown = randomRange(rng, 0.5, 1.4);
    this.turnTimer = randomRange(rng, 1.5, 3.2);

    const hullMat = new THREE.MeshStandardMaterial({
      color: CONFIG.palette.tank,
      roughness: 0.82,
      metalness: 0.15,
    });
    const darkGreenMat = new THREE.MeshStandardMaterial({
      color: 0x2e3d22,
      roughness: 0.9,
      metalness: 0.1,
    });
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 1,
      metalness: 0.05,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.5,
      metalness: 0.6,
    });

    // Main hull — trapezoidal (wider at bottom)
    const hullBottom = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 1.4, 9),
      hullMat,
    );
    hullBottom.position.y = 1.0;
    hullBottom.castShadow = true;
    hullBottom.receiveShadow = true;

    // Hull top — slightly narrower
    const hullTop = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.8, 7.6),
      hullMat,
    );
    hullTop.position.y = 2.0;
    hullTop.castShadow = true;

    // Front glacis plate — angled
    const glacis = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.5, 1.8),
      darkGreenMat,
    );
    glacis.position.set(0, 1.8, 4.2);
    glacis.rotation.x = -0.35;
    glacis.castShadow = true;

    // Track assemblies (left and right)
    for (const side of [-1, 1]) {
      const track = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.6, 9.6),
        trackMat,
      );
      track.position.set(side * 3.5, 0.8, 0);
      track.castShadow = true;
      this.group.add(track);

      // Track guard / fender
      const fender = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.15, 9.8),
        hullMat,
      );
      fender.position.set(side * 3.5, 1.65, 0);
      this.group.add(fender);

      // Wheels visible between tracks
      const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 8);
      for (let wz = -3.6; wz <= 3.6; wz += 1.8) {
        const wheel = new THREE.Mesh(wheelGeo, metalMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 3.5, 0.5, wz);
        this.group.add(wheel);
      }
    }

    // Turret base — dome shape
    this.turret = new THREE.Group();
    const turretBase = new THREE.Mesh(
      new THREE.CylinderGeometry(2.0, 2.3, 1.0, 10),
      darkGreenMat,
    );
    turretBase.position.y = 0;
    turretBase.castShadow = true;

    // Turret dome
    const turretDome = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      hullMat,
    );
    turretDome.position.y = 0.4;
    turretDome.castShadow = true;

    // Gun barrel
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 6.5, 8),
      metalMat,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.2, 3.8);
    barrel.castShadow = true;
    this.barrel = barrel;

    // Muzzle brake — child of barrel so it follows elevation
    const muzzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.5, 8),
      metalMat,
    );
    muzzle.position.set(0, 3.2, 0);
    barrel.add(muzzle);

    // Commander's hatch
    const hatch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.25, 8),
      metalMat,
    );
    hatch.position.set(-0.6, 0.9, -0.5);

    this.turret.add(turretBase, turretDome, barrel, hatch);
    this.turret.position.set(0, 2.5, -0.5);
    this.group.add(hullBottom, hullTop, glacis, this.turret);

    this.scene.add(this.group);
  }

  update(dt, context) {
    this.turnTimer -= dt;
    if (this.turnTimer <= 0) {
      this.turnTimer = randomRange(this.rng, 1.6, 3.4);
      this.heading += randomRange(this.rng, -0.9, 0.9);
    }

    const playerPos = context.player.group.position;
    const toPlayer = Math.atan2(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
    const headingError = normalizeAngle(toPlayer - this.heading);
    this.heading += Math.sign(headingError) * Math.min(Math.abs(headingError), dt * 0.55);

    const nextX = this.group.position.x + Math.sin(this.heading) * this.profile.moveSpeed * dt;
    const nextZ = this.group.position.z + Math.cos(this.heading) * this.profile.moveSpeed * dt;
    if (context.terrain.canOccupy('tank', nextX, nextZ)) {
      this.group.position.x = nextX;
      this.group.position.z = nextZ;
    } else {
      const turnDirection = this.rng() < 0.5 ? -1 : 1;
      this.heading += turnDirection * randomRange(this.rng, Math.PI * 0.35, Math.PI * 0.65);
    }
    context.terrain.clampToArena(this.group.position);
    this.group.position.y = context.terrain.getGroundHeight(this.group.position.x, this.group.position.z);

    this.turret.rotation.y = normalizeAngle(toPlayer - this.heading);
    // Elevate barrel toward player
    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    const dy = playerPos.y - (this.group.position.y + 2.5);
    const horizDist = Math.sqrt(dx * dx + dz * dz);
    this.barrel.rotation.x = Math.PI / 2 - Math.atan2(dy, horizDist) * 0.3;
    this.group.rotation.y = this.heading;

    this.fireCooldown -= dt;
    const horizontalDistance = Math.hypot(playerPos.x - this.group.position.x, playerPos.z - this.group.position.z);
    if (horizontalDistance < 118 && this.fireCooldown <= 0) {
      const shotOrigin = this.group.position.clone();
      shotOrigin.y += 3.4;
      if (!(context.terrain.hasLineOfSight?.(shotOrigin, playerPos, 0.9) ?? true)) {
        this.fireCooldown = 0.35;
        return [];
      }

      const shots = [];
      const burstCount = this.profile.burstCount ?? 1;
      const spreadOffsets = burstCount === 1
        ? [0]
        : burstCount === 2
          ? [-0.08, 0.08]
          : [-0.14, 0, 0.14];
      for (const offset of spreadOffsets) {
        const shot = this.buildShot(
          new THREE.Vector3(playerPos.x + offset * 18, playerPos.y + 1.8, playerPos.z + offset * 10),
          this.profile.projectileSpeed,
          this.profile.projectileLife,
          this.profile.damage,
        );
        shot.origin.y += 3.4;
        shots.push({ type: 'spawnProjectile', spec: shot });
      }
      this.fireCooldown = this.profile.fireInterval + randomRange(this.rng, -0.35, 0.25);
      return shots;
    }
    return [];
  }

  intersectSegmentAt(start, end, radiusPadding) {
    return segmentIntersectsCylinderAt(start, end, this.group.position, this.radius + radiusPadding, 2.4);
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsCylinder(start, end, this.group.position, this.radius + radiusPadding, 2.4);
  }
}
