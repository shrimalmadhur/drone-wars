import * as THREE from 'three/webgpu';
import { CONFIG } from '../config.js';

function createTextTexture(text, color) {
  const cfg = CONFIG.effects.scorePop;
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  ctx.font = `bold ${cfg.fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 4;
  ctx.strokeText(text, size / 2, size / 2);

  // Fill
  const c = new THREE.Color(color);
  ctx.fillStyle = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
  ctx.fillText(text, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export class ScorePop {
  constructor(scene) {
    this.scene = scene;
    const cfg = CONFIG.effects.scorePop;

    this.pool = [];
    for (let i = 0; i < cfg.poolSize; i++) {
      const mat = new THREE.SpriteMaterial({
        map: null,
        transparent: true,
        opacity: 0,
        depthTest: false,
        sizeAttenuation: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.scale.setScalar(3);
      scene.add(sprite);

      this.pool.push({
        active: false,
        elapsed: 0,
        sprite,
        mat,
        startY: 0,
      });
    }
  }

  spawn(x, y, z, score, color) {
    const cfg = CONFIG.effects.scorePop;
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

    const text = `+${score}`;
    if (entry.mat.map) entry.mat.map.dispose();
    entry.mat.map = createTextTexture(text, color);
    entry.mat.opacity = 1;
    entry.mat.needsUpdate = true;

    entry.sprite.position.set(x, y + 2, z);
    entry.sprite.scale.setScalar(3 * cfg.startScale);
    entry.sprite.visible = true;

    entry.active = true;
    entry.elapsed = 0;
    entry.startY = y + 2;
  }

  update(dt) {
    const cfg = CONFIG.effects.scorePop;

    for (const entry of this.pool) {
      if (!entry.active) continue;
      entry.elapsed += dt;

      const progress = entry.elapsed / cfg.duration;
      if (progress >= 1) {
        entry.active = false;
        entry.sprite.visible = false;
        continue;
      }

      entry.sprite.position.y = entry.startY + entry.elapsed * cfg.riseSpeed;

      const scale = cfg.startScale + (cfg.endScale - cfg.startScale) * progress;
      entry.sprite.scale.setScalar(3 * scale);

      if (progress > 0.5) {
        entry.mat.opacity = 1 - (progress - 0.5) / 0.5;
      } else {
        entry.mat.opacity = 1;
      }
    }
  }

  reset() {
    for (const entry of this.pool) {
      entry.active = false;
      entry.sprite.visible = false;
    }
  }

  dispose() {
    for (const entry of this.pool) {
      if (entry.mat.map) entry.mat.map.dispose();
      entry.mat.dispose();
      this.scene.remove(entry.sprite);
    }
  }
}
