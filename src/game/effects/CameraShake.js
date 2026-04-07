import { CONFIG } from '../config.js';

export class CameraShake {
  constructor() {
    this.events = [];
    this.offsetX = 0;
    this.offsetY = 0;
    this.offsetZ = 0;
  }

  add(intensity, duration, dirX = 0, dirY = 0, dirZ = 0) {
    this.events.push({ intensity, duration, elapsed: 0, dirX, dirY, dirZ });
  }

  update(dt) {
    this.offsetX = 0;
    this.offsetY = 0;
    this.offsetZ = 0;

    const max = CONFIG.effects.shake.maxDisplacement;

    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      e.elapsed += dt;
      if (e.elapsed >= e.duration) {
        this.events.splice(i, 1);
        continue;
      }
      const progress = e.elapsed / e.duration;
      const strength = e.intensity * (1 - progress);

      if (e.dirX !== 0 || e.dirY !== 0 || e.dirZ !== 0) {
        // Directional shake (e.g., recoil)
        this.offsetX += e.dirX * strength;
        this.offsetY += e.dirY * strength;
        this.offsetZ += e.dirZ * strength;
      } else {
        // Random shake
        this.offsetX += (Math.random() - 0.5) * 2 * strength;
        this.offsetY += (Math.random() - 0.5) * 2 * strength;
      }
    }

    // Clamp to max displacement
    const len = Math.sqrt(this.offsetX * this.offsetX + this.offsetY * this.offsetY + this.offsetZ * this.offsetZ);
    if (len > max) {
      const scale = max / len;
      this.offsetX *= scale;
      this.offsetY *= scale;
      this.offsetZ *= scale;
    }
  }

  apply(camera) {
    camera.position.x += this.offsetX;
    camera.position.y += this.offsetY;
    camera.position.z += this.offsetZ;
  }

  reset() {
    this.events.length = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.offsetZ = 0;
  }
}
