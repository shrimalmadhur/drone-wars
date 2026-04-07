import * as THREE from 'three';

export class EnemyBase {
  constructor(scene, options) {
    this.scene = scene;
    this.type = options.type;
    this.health = options.health;
    this.maxHealth = options.health;
    this.radius = options.radius;
    this.scoreValue = options.scoreValue;
    this.group = new THREE.Group();
    this.tempTarget = new THREE.Vector3();
    this.tempOrigin = new THREE.Vector3();
    this.group.position.copy(options.position);
    this.alive = true;
  }

  takeDamage(amount) {
    this.health -= amount;
    if (this.health <= 0) {
      this.alive = false;
    }
    return !this.alive;
  }

  getHudLabel() {
    return this.type.toUpperCase();
  }

  buildShot(targetPosition, speed, maxLife, damage) {
    this.tempTarget.copy(targetPosition).sub(this.group.position).normalize().multiplyScalar(speed);
    this.tempOrigin.copy(this.group.position);
    return {
      team: 'enemy',
      damage,
      radius: 0.9,
      maxLife,
      origin: this.tempOrigin.clone(),
      velocity: this.tempTarget.clone(),
    };
  }

  intersectSegmentAt() {
    return null;
  }

  intersectsSegment() {
    return this.intersectSegmentAt(...arguments) !== null;
  }

  dispose() {
    this.scene.remove(this.group);
  }
}
