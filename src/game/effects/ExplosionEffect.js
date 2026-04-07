import * as THREE from 'three';
import { CONFIG } from '../config.js';

const _debrisGeos = [
  new THREE.BoxGeometry(0.6, 0.6, 0.6),
  new THREE.BoxGeometry(0.4, 0.8, 0.3),
  new THREE.TetrahedronGeometry(0.5),
  new THREE.BoxGeometry(0.3, 0.3, 1.0),
];

export class ExplosionEffect {
  constructor(scene) {
    this.scene = scene;
    const cfg = CONFIG.effects.explosion;

    this.pool = [];
    for (let i = 0; i < cfg.poolSize; i++) {
      const entry = {
        active: false,
        elapsed: 0,
        fireballs: [],
        fireLight: new THREE.PointLight(0xff8800, 0, 20),
        debris: [],
      };

      for (let f = 0; f < 3; f++) {
        const geo = new THREE.SphereGeometry(1, 8, 6);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffaa44,
          transparent: true,
          opacity: 0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        scene.add(mesh);
        entry.fireballs.push({ mesh, mat, offsetX: 0, offsetY: 0, offsetZ: 0 });
      }

      entry.fireLight.visible = false;
      scene.add(entry.fireLight);

      for (let d = 0; d < cfg.debrisCount; d++) {
        const geo = _debrisGeos[d % _debrisGeos.length];
        const mat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          roughness: 0.7,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.visible = false;
        scene.add(mesh);
        entry.debris.push({
          mesh, mat,
          vx: 0, vy: 0, vz: 0,
          spinX: 0, spinY: 0, spinZ: 0,
        });
      }

      this.pool.push(entry);
    }
  }

  spawn(x, y, z, color) {
    const cfg = CONFIG.effects.explosion;
    let entry = null;
    for (let i = 0; i < this.pool.length; i++) {
      if (!this.pool[i].active) { entry = this.pool[i]; break; }
    }
    if (!entry) {
      let oldest = this.pool[0];
      for (let i = 1; i < this.pool.length; i++) {
        if (this.pool[i].elapsed > oldest.elapsed) oldest = this.pool[i];
      }
      entry = oldest;
    }

    entry.active = true;
    entry.elapsed = 0;

    for (let i = 0; i < entry.fireballs.length; i++) {
      const fb = entry.fireballs[i];
      fb.offsetX = (Math.random() - 0.5) * 1.5;
      fb.offsetY = (Math.random() - 0.5) * 1.5;
      fb.offsetZ = (Math.random() - 0.5) * 1.5;
      fb.mesh.position.set(x + fb.offsetX, y + fb.offsetY, z + fb.offsetZ);
      fb.mesh.scale.setScalar(0.3);
      fb.mat.opacity = 1;
      fb.mat.color.set(0xffffcc);
      fb.mesh.visible = true;
    }

    entry.fireLight.position.set(x, y, z);
    entry.fireLight.color.set(0xff8800);
    entry.fireLight.intensity = 5;
    entry.fireLight.visible = true;

    const debrisColor = new THREE.Color(color);
    for (let i = 0; i < entry.debris.length; i++) {
      const d = entry.debris[i];
      d.mesh.position.set(x, y, z);
      d.mesh.scale.setScalar(0.8 + Math.random() * 0.6);
      d.mat.color.copy(debrisColor);
      d.mat.opacity = 1;
      d.mesh.visible = true;

      const angle = Math.random() * Math.PI * 2;
      const elevation = (Math.random() - 0.3) * Math.PI;
      const speed = cfg.debrisSpeed * (0.6 + Math.random() * 0.8);
      d.vx = Math.cos(angle) * Math.cos(elevation) * speed;
      d.vy = Math.sin(elevation) * speed + 4;
      d.vz = Math.sin(angle) * Math.cos(elevation) * speed;

      d.spinX = (Math.random() - 0.5) * 10;
      d.spinY = (Math.random() - 0.5) * 10;
      d.spinZ = (Math.random() - 0.5) * 10;
    }
  }

  update(dt) {
    const cfg = CONFIG.effects.explosion;
    const _white = new THREE.Color(0xffffcc);
    const _orange = new THREE.Color(0xff6622);
    const _gray = new THREE.Color(0x333333);

    for (const entry of this.pool) {
      if (!entry.active) continue;
      entry.elapsed += dt;

      const fbProgress = Math.min(1, entry.elapsed / cfg.fireballDuration);
      for (const fb of entry.fireballs) {
        if (fbProgress >= 1) {
          fb.mesh.visible = false;
          continue;
        }
        const scale = 0.3 + fbProgress * 3.5;
        fb.mesh.scale.setScalar(scale);
        fb.mat.opacity = 1 - fbProgress * 0.9;

        if (fbProgress < 0.4) {
          fb.mat.color.lerpColors(_white, _orange, fbProgress / 0.4);
        } else {
          fb.mat.color.lerpColors(_orange, _gray, (fbProgress - 0.4) / 0.6);
        }
      }

      if (fbProgress < 1) {
        entry.fireLight.intensity = 5 * (1 - fbProgress);
      } else {
        entry.fireLight.visible = false;
      }

      const debrisProgress = entry.elapsed / cfg.debrisDuration;
      for (const d of entry.debris) {
        if (debrisProgress >= 1) {
          d.mesh.visible = false;
          continue;
        }

        d.vy -= cfg.debrisGravity * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;

        d.mesh.rotation.x += d.spinX * dt;
        d.mesh.rotation.y += d.spinY * dt;
        d.mesh.rotation.z += d.spinZ * dt;

        const fadeStart = 1 - cfg.debrisFadeTime / cfg.debrisDuration;
        if (debrisProgress > fadeStart) {
          d.mat.opacity = 1 - (debrisProgress - fadeStart) / (1 - fadeStart);
        }
      }

      if (entry.elapsed >= cfg.debrisDuration) {
        entry.active = false;
        for (const fb of entry.fireballs) fb.mesh.visible = false;
        entry.fireLight.visible = false;
        for (const d of entry.debris) d.mesh.visible = false;
      }
    }
  }

  reset() {
    for (const entry of this.pool) {
      entry.active = false;
      for (const fb of entry.fireballs) fb.mesh.visible = false;
      entry.fireLight.visible = false;
      for (const d of entry.debris) d.mesh.visible = false;
    }
  }

  dispose() {
    for (const entry of this.pool) {
      for (const fb of entry.fireballs) {
        this.scene.remove(fb.mesh);
        fb.mesh.geometry.dispose();
        fb.mat.dispose();
      }
      this.scene.remove(entry.fireLight);
      for (const d of entry.debris) {
        this.scene.remove(d.mesh);
        d.mat.dispose();
      }
    }
  }
}
