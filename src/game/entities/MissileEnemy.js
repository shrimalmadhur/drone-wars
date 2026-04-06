import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { segmentIntersectsSphere } from '../math.js';
import { EnemyBase } from './EnemyBase.js';

export class MissileEnemy extends EnemyBase {
  constructor(scene, position) {
    super(scene, {
      type: 'missile',
      position,
      health: CONFIG.enemies.missile.health,
      radius: CONFIG.enemies.missile.radius,
      scoreValue: CONFIG.enemies.missile.score,
    });
    this.velocity = new THREE.Vector3(0, 0, -CONFIG.enemies.missile.moveSpeed);
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

    this.group.add(body, nose, seekerBand, exhaust);
    this.scene.add(this.group);
  }

  update(dt, context) {
    this.life += dt;
    const desired = new THREE.Vector3()
      .copy(context.player.group.position)
      .sub(this.group.position)
      .normalize()
      .multiplyScalar(CONFIG.enemies.missile.moveSpeed);

    this.velocity.lerp(desired, Math.min(1, dt * CONFIG.enemies.missile.turnRate));
    this.group.position.addScaledVector(this.velocity, dt);
    this.group.lookAt(this.group.position.clone().add(this.velocity));
    // Flickering exhaust
    const flicker = 0.6 + Math.random() * 0.4;
    this.exhaust.scale.set(0.8 * flicker, 0.8 * flicker, 1.5 * flicker);

    if (this.life > CONFIG.enemies.missile.life) {
      this.alive = false;
      return [{ type: 'effect', position: this.group.position.clone(), size: 1.2 }];
    }

    const dist = this.group.position.distanceTo(context.player.group.position);
    if (dist < CONFIG.enemies.missile.radius + CONFIG.player.collisionRadius) {
      this.alive = false;
      return [
        { type: 'effect', position: this.group.position.clone(), size: 1.6 },
        { type: 'impactPlayer', damage: CONFIG.enemies.missile.damage },
      ];
    }

    return [];
  }

  intersectsSegment(start, end, radiusPadding) {
    return segmentIntersectsSphere(start, end, this.group.position, this.radius + radiusPadding);
  }
}
