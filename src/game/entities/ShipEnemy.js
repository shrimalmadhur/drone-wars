import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { segmentIntersectsCylinder, segmentIntersectsCylinderAt } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

export class ShipEnemy extends EnemyBase {
  constructor(scene, position) {
    super(scene, {
      type: 'ship',
      position,
      health: CONFIG.enemies.ship.health,
      radius: CONFIG.enemies.ship.radius,
      scoreValue: CONFIG.enemies.ship.score,
    });
    this.fireCooldown = 1.2;
    this.bob = Math.random() * Math.PI * 2;

    const hullMat = new THREE.MeshStandardMaterial({
      color: CONFIG.palette.ship,
      roughness: 0.62,
      metalness: 0.2,
    });
    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x3a5a5e,
      roughness: 0.7,
      metalness: 0.15,
    });
    const superMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.5,
      metalness: 0.3,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x0f3f44,
      roughness: 0.45,
      metalness: 0.4,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.4,
      metalness: 0.7,
    });

    // Main hull — tapered bow using a custom shape
    const hullMain = new THREE.Mesh(
      new THREE.BoxGeometry(11, 3, 22),
      hullMat,
    );
    hullMain.position.y = 1.5;
    hullMain.castShadow = true;
    hullMain.receiveShadow = true;

    // Bow (front taper)
    const bowShape = new THREE.Shape();
    bowShape.moveTo(-5.5, 0);
    bowShape.lineTo(5.5, 0);
    bowShape.lineTo(0, 10);
    bowShape.closePath();
    const bowGeometry = new THREE.ExtrudeGeometry(bowShape, {
      depth: 3,
      bevelEnabled: false,
    });
    bowGeometry.rotateX(-Math.PI / 2);
    bowGeometry.rotateY(Math.PI);
    const bow = new THREE.Mesh(bowGeometry, hullMat);
    bow.position.set(0, 0, 11);
    bow.castShadow = true;

    // Deck
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 0.3, 21),
      deckMat,
    );
    deck.position.y = 3.05;

    // Superstructure / bridge
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(6, 3.5, 6),
      superMat,
    );
    bridge.position.set(0, 4.8, -3);
    bridge.castShadow = true;

    // Bridge windows
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x112233,
      roughness: 0.1,
      metalness: 0.8,
    });
    const windowGeo = new THREE.BoxGeometry(5.5, 0.8, 0.1);
    const windowFront = new THREE.Mesh(windowGeo, windowMat);
    windowFront.position.set(0, 5.2, 0.02);
    bridge.add(windowFront);

    // Radar mast
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.15, 3, 6),
      metalMat,
    );
    mast.position.set(0, 8.3, -3);

    const radarDish = new THREE.Mesh(
      new THREE.BoxGeometry(3.5, 0.12, 0.6),
      metalMat,
    );
    radarDish.position.set(0, 9.8, -3);
    this.radarDish = radarDish;

    // Forward gun turret
    this.turret = new THREE.Group();
    const turretBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.0, 1.0, 10),
      darkMat,
    );
    turretBase.castShadow = true;
    const turretDome = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      darkMat,
    );
    turretDome.position.y = 0.4;
    const gunBarrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 5, 8),
      metalMat,
    );
    gunBarrel.rotation.x = Math.PI / 2;
    gunBarrel.position.set(0, 0.2, 3.0);
    this.turret.add(turretBase, turretDome, gunBarrel);
    this.turret.position.set(0, 3.5, 6);

    // Stern details — exhaust stacks
    for (const sx of [-2, 2]) {
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 2, 6),
        metalMat,
      );
      stack.position.set(sx, 4.5, -8);
      stack.castShadow = true;
      this.group.add(stack);
    }

    // Railing posts along the deck edges
    const railGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 4);
    for (const side of [-5, 5]) {
      for (let rz = -8; rz <= 8; rz += 4) {
        const rail = new THREE.Mesh(railGeo, metalMat);
        rail.position.set(side, 3.7, rz);
        this.group.add(rail);
      }
    }

    this.group.add(hullMain, bow, deck, bridge, mast, radarDish, this.turret);
    this.scene.add(this.group);
  }

  update(dt, context) {
    this.bob += dt;
    this.group.position.y = context.terrain.getGroundHeight(this.group.position.x, this.group.position.z) + 1 + Math.sin(this.bob * 1.7) * 0.4;

    // Spin radar dish
    this.radarDish.rotation.y += 1.8 * dt;

    const playerPos = context.player.group.position;
    const toPlayerAngle = Math.atan2(
      playerPos.x - this.group.position.x,
      playerPos.z - this.group.position.z,
    ) - this.group.rotation.y;
    this.turret.rotation.y = toPlayerAngle;

    this.fireCooldown -= dt;
    if (this.fireCooldown <= 0 && this.group.position.distanceTo(playerPos) < 150) {
      const shot = this.buildShot(
        new THREE.Vector3(playerPos.x, playerPos.y + 1.5, playerPos.z),
        CONFIG.enemies.ship.projectileSpeed,
        CONFIG.enemies.ship.projectileLife,
        CONFIG.enemies.ship.damage,
      );
      shot.origin.y += 5;
      if (!(context.terrain.hasLineOfSight?.(shot.origin, playerPos, shot.radius) ?? true)) {
        this.fireCooldown = 0.35;
        return [];
      }
      this.fireCooldown = CONFIG.enemies.ship.fireInterval;
      return [{ type: 'spawnProjectile', spec: shot }];
    }
    return [];
  }

  intersectSegmentAt(start, end, radiusPadding) {
    return segmentIntersectsCylinderAt(start, end, this.group.position, this.radius + radiusPadding, 3.6);
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsCylinder(start, end, this.group.position, this.radius + radiusPadding, 3.6);
  }
}
