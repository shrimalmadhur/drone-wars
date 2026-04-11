import * as THREE from 'three/webgpu';

import { CONFIG } from '../config.js';
import { segmentIntersectsSphere, segmentIntersectsSphereAt } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

export class MissileEnemy extends EnemyBase {
  constructor(scene, position, profile = CONFIG.enemies.missile) {
    super(scene, {
      type: 'missile',
      position,
      health: profile.health,
      radius: profile.radius,
      scoreValue: profile.score,
    });
    this.profile = profile;
    this.velocity = new THREE.Vector3(0, 0, -profile.moveSpeed);
    this.life = 0;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: CONFIG.palette.missile,
      emissive: 0x6a1212,
      roughness: 0.35,
      metalness: 0.3,
    });
    const noseMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.2,
      metalness: 0.7,
    });
    const finMat = new THREE.MeshStandardMaterial({
      color: 0x881111,
      roughness: 0.5,
      metalness: 0.2,
    });
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff4400,
      emissiveIntensity: 3,
      transparent: true,
      opacity: 0.8,
    });

    // Main body cylinder
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.45, 4.5, 10),
      bodyMat,
    );
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;

    // Nose cone
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 1.8, 10),
      noseMat,
    );
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = 3.15;
    nose.castShadow = true;

    // Seeker head band (ring near nose)
    const seekerBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.06, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.6 }),
    );
    seekerBand.rotation.x = Math.PI / 2;
    seekerBand.position.z = 2.0;

    // Tail fins — 4 cruciform
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0.8, 0);
    finShape.lineTo(0.4, 1.4);
    finShape.lineTo(0, 1.4);
    finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.06,
      bevelEnabled: false,
    });
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.rotation.z = (Math.PI / 2) * i;
      fin.position.z = -2.2;
      fin.castShadow = true;
      this.group.add(fin);
    }

    // Exhaust glow at rear
    const exhaust = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 8, 8),
      exhaustMat,
    );
    exhaust.position.z = -2.4;
    exhaust.scale.set(0.8, 0.8, 1.5);
    this.exhaust = exhaust;

    // Body panel line rings
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x992222, roughness: 0.4, metalness: 0.4 });
    const ringPositions = [-0.8, 0.4, 1.6];
    for (const rz of ringPositions) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.44, 0.03, 6, 12), ringMat
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(0, 0, rz);
      this.group.add(ring);
    }

    // Enhanced exhaust with inner glow
    const innerExhaustGeo = new THREE.SphereGeometry(0.2, 6, 6);
    const innerExhaustMat = new THREE.MeshStandardMaterial({
      color: 0xffff00, emissive: 0xffaa00, emissiveIntensity: 4,
      transparent: true, opacity: 0.9,
    });
    this.innerExhaust = new THREE.Mesh(innerExhaustGeo, innerExhaustMat);
    this.innerExhaust.position.set(0, 0, -2.5);
    this.innerExhaust.scale.set(0.6, 0.6, 1.2);
    this.group.add(this.innerExhaust);

    this.group.add(body, nose, seekerBand, exhaust);
    this.scene.add(this.group);
  }

  update(dt, context) {
    this.life += dt;
    const previousPosition = this.group.position.clone();
    const desired = new THREE.Vector3()
      .copy(context.player.group.position)
      .sub(this.group.position)
      .normalize()
      .multiplyScalar(this.profile.moveSpeed);

    this.velocity.lerp(desired, Math.min(1, dt * this.profile.turnRate));
    this.group.position.addScaledVector(this.velocity, dt);
    this.group.lookAt(this.group.position.clone().add(this.velocity));
    // Flickering exhaust
    const flicker = 0.6 + Math.random() * 0.4;
    this.exhaust.scale.set(0.8 * flicker, 0.8 * flicker, 1.5 * flicker);
    this.innerExhaust.scale.set(0.6 * flicker, 0.6 * flicker, 1.2 * flicker);

    if (this.life > this.profile.life) {
      this.alive = false;
      return [{ type: 'effect', position: this.group.position.clone(), size: 1.2 }];
    }

    const obstacleHit = context.terrain.getSegmentObstacleHit?.(
      previousPosition,
      this.group.position,
      this.radius,
    ) ?? null;
    if (obstacleHit) {
      this.alive = false;
      return [{ type: 'effect', position: this.group.position.clone(), size: 1.4 }];
    }

    const dist = this.group.position.distanceTo(context.player.group.position);
    if (dist < CONFIG.enemies.missile.radius + CONFIG.player.collisionRadius) {
      this.alive = false;
      return [
        { type: 'effect', position: this.group.position.clone(), size: 1.6 },
        {
          type: 'impactPlayer',
          damage: this.profile.damage,
          sourceX: this.group.position.x,
          sourceY: this.group.position.y,
          sourceZ: this.group.position.z,
        },
      ];
    }

    return [];
  }

  intersectSegmentAt(start, end, radiusPadding) {
    return segmentIntersectsSphereAt(start, end, this.group.position, this.radius + radiusPadding);
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsSphere(start, end, this.group.position, this.radius + radiusPadding);
  }
}
