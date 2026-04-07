import * as THREE from 'three';

import { CONFIG } from './config.js';
import { InputController } from './input.js';
import { findAimAssistTarget, projectRadarContact } from './math.js';
import { Simulation } from './Simulation.js';
import { CameraShake } from './effects/CameraShake.js';
import { ExplosionEffect } from './effects/ExplosionEffect.js';

const RADAR_COLORS = Object.fromEntries(
  ['tank', 'drone', 'missile', 'ship'].map(k => [k, '#' + CONFIG.palette[k].toString(16).padStart(6, '0')])
);

export class Game {
  constructor({ mount, hud, mapTheme }) {
    this.mount = mount;
    this.hud = hud;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
    this.mount.appendChild(this.renderer.domElement);

    this.input = new InputController(window, document);
    this.simulation = new Simulation(this.scene, { mapTheme });
    this.cameraShake = new CameraShake();
    this.explosions = new ExplosionEffect(this.scene);
    this.hitIndicators = [];
    this._lastHitFlash = 0;
    this._lastFireFlash = 0;
    this.cameraPosition = new THREE.Vector3(0, 24, 78);
    this.lookTarget = new THREE.Vector3();
    this.cameraDirection = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3();
    this.aimDirection = null;
    this.playerOrigin = new THREE.Vector3();
    this.aimState = {
      locked: false,
      label: 'CENTER SIGHT',
      target: null,
    };
    this.radarCtx = hud.radar.getContext('2d');
    this.radarSize = hud.radar.width;
    this.radarCenter = this.radarSize / 2;
    this.radarWorldRadius = CONFIG.world.arenaRadius;
    this.radarDrawRadius = this.radarCenter - 10;
    this.clock = {
      last: 0,
      accumulator: 0,
    };

    this.onResize = () => this.resize();
    this.onVisibility = () => {
      if (document.hidden) {
        this.simulation.pause('Auto-paused: tab hidden.');
        this.input.reset();
      }
    };
    this.onBlur = () => {
      this.simulation.pause('Auto-paused: focus lost.');
      this.input.reset();
    };
    this.onContextLost = (event) => {
      event.preventDefault();
      this.hud.status.textContent = 'Rendering context lost. Reload the page.';
    };

    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.resize();
  }

  start() {
    this.clock.last = performance.now();
    const tick = (time) => {
      const elapsed = Math.min((time - this.clock.last) / 1000, CONFIG.simulation.maxFrameTime);
      this.clock.last = time;
      this.clock.accumulator += elapsed;

      this.updateCamera();
      this.updateAimSolution();

      const controls = this.input.snapshot();
      controls.aimDirection = this.aimDirection;
      controls.lockedTargetId = this.aimState.target?.id ?? null;
      let steps = 0;
      while (this.clock.accumulator >= CONFIG.simulation.step && steps < CONFIG.simulation.maxSubsteps) {
        this.simulation.update(CONFIG.simulation.step, controls);
        this.clock.accumulator -= CONFIG.simulation.step;
        steps += 1;
      }

      this.updateCamera();
      this.updateAimSolution();
      this.renderHud();
      this.updateHitIndicators(elapsed);
      this.cameraShake.update(elapsed);
      this.cameraShake.apply(this.camera);
      this.explosions.update(elapsed);
      this.renderer.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(tick);
    };

    this.frame = requestAnimationFrame(tick);
  }

  updateCamera() {
    const snapshot = this.simulation.getSnapshot();
    const forward = new THREE.Vector3(Math.sin(snapshot.playerYaw), 0, Math.cos(snapshot.playerYaw));
    const desiredPosition = snapshot.playerPosition.clone()
      .addScaledVector(forward, -24)
      .add(new THREE.Vector3(0, 12, 0));
    this.cameraPosition.lerp(desiredPosition, 0.12);
    this.lookTarget.copy(snapshot.playerPosition).addScaledVector(forward, 22).add(new THREE.Vector3(0, 3, 0));
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.lookTarget);
  }

  updateAimSolution() {
    const snapshot = this.simulation.getSnapshot();
    this.camera.getWorldDirection(this.cameraDirection).normalize();

    const lock = findAimAssistTarget(
      this.camera.position,
      this.cameraDirection,
      this.simulation.getAimCandidates(),
      { minDot: 0.965, maxDistance: 240 },
    );

    if (lock) {
      this.aimPoint.copy(lock.position);
      this.aimState.locked = true;
      this.aimState.label = `LOCK ${lock.type.toUpperCase()}`;
      this.aimState.target = lock;
      this.playerOrigin.copy(snapshot.playerPosition);
      this.playerOrigin.y += 0.7;
      this.aimDirection = this.aimPoint.clone().sub(this.playerOrigin).normalize();
    } else {
      this.aimState.locked = false;
      this.aimState.label = 'CENTER SIGHT';
      this.aimState.target = null;
      this.aimDirection = null;
    }
  }

  renderHud() {
    const snapshot = this.simulation.getSnapshot();
    this.hud.score.textContent = snapshot.score.toString();
    this.hud.wave.textContent = snapshot.wave.toString();
    this.hud.enemyCount.textContent = snapshot.enemyCount.toString();
    this.hud.healthValue.textContent = `${Math.round(snapshot.health)}%`;
    this.hud.healthFill.style.width = `${Math.max(0, snapshot.health)}%`;
    this.hud.status.textContent = snapshot.status;
    this.hud.reticleLabel.textContent = this.aimState.label;
    this.hud.reticle.classList.toggle('reticle--locked', this.aimState.locked);
    this.hud.reticle.classList.toggle('reticle--hit', snapshot.hitFlash > 0);
    this.hud.reticle.classList.toggle('reticle--firing', snapshot.fireFlash > 0);

    // Screen shake on damage
    if (snapshot.hitFlash > 0 && snapshot.hitFlash > this._lastHitFlash) {
      const cfg = CONFIG.effects.shake.onDamage;
      this.cameraShake.add(cfg.intensity, cfg.duration);
    }
    this._lastHitFlash = snapshot.hitFlash;

    // Fire recoil shake
    if (snapshot.fireFlash > 0 && snapshot.fireFlash > this._lastFireFlash) {
      const cfg = CONFIG.effects.shake.onFire;
      // Recoil: backward along camera's look direction
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion);
      this.cameraShake.add(cfg.intensity, cfg.duration, dir.x, dir.y, dir.z);
    }
    this._lastFireFlash = snapshot.fireFlash;

    // Kill shake + explosion
    for (const kill of snapshot.killEvents) {
      const cfg = CONFIG.effects.shake.onKill;
      this.cameraShake.add(cfg.intensity, cfg.duration);
      const color = CONFIG.palette[kill.type] || CONFIG.palette.effect;
      this.explosions.spawn(kill.position.x, kill.position.y, kill.position.z, color);
    }

    for (const dmg of snapshot.damageEvents) {
      this.showHitIndicator(dmg.sourceX, dmg.sourceY, dmg.sourceZ, dmg.damage);
    }

    if (this.aimState.target) {
      const hp = Math.max(0, Math.ceil(this.aimState.target.health));
      const maxHp = Math.ceil(this.aimState.target.maxHealth);
      this.hud.targetName.textContent = `${this.aimState.target.type.toUpperCase()} LOCKED`;
      this.hud.targetHealth.textContent = `Health ${hp} / ${maxHp}`;
    } else if (snapshot.lastHit && snapshot.hitFlash > 0) {
      this.hud.targetName.textContent = `${snapshot.lastHit.type.toUpperCase()} HIT`;
      this.hud.targetHealth.textContent = snapshot.lastHit.destroyed
        ? 'Target destroyed'
        : `Health ${snapshot.lastHit.health} / ${snapshot.lastHit.maxHealth}`;
    } else {
      this.hud.targetName.textContent = 'No target locked';
      this.hud.targetHealth.textContent = 'Bring the reticle over a target to inspect health.';
    }
    this.renderRadar();
  }

  renderRadar() {
    const ctx = this.radarCtx;
    const cx = this.radarCenter;
    const r = this.radarDrawRadius;
    const markerInset = 8;
    const markerHalfWidth = 3.5;
    const markerDepth = 2.5;
    const markerReach = 5.5;

    ctx.clearRect(0, 0, this.radarSize, this.radarSize);

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(9, 17, 32, 0.8)';
    ctx.fill();

    // Border ring
    ctx.beginPath();
    ctx.arc(cx, cx, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(138, 244, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Crosshair lines
    ctx.strokeStyle = 'rgba(138, 244, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - r, cx);
    ctx.lineTo(cx + r, cx);
    ctx.moveTo(cx, cx - r);
    ctx.lineTo(cx, cx + r);
    ctx.stroke();

    // Range ring at 75%
    ctx.beginPath();
    ctx.arc(cx, cx, r * 0.75, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(138, 244, 255, 0.06)';
    ctx.stroke();

    // Player chevron (pointing up = forward)
    ctx.fillStyle = 'rgba(138, 244, 255, 0.9)';
    ctx.beginPath();
    ctx.moveTo(cx, cx - 5);
    ctx.lineTo(cx - 3.5, cx + 3);
    ctx.lineTo(cx + 3.5, cx + 3);
    ctx.closePath();
    ctx.fill();

    // Enemy dots
    const snapshot = this.simulation.getSnapshot();
    const candidates = this.simulation.getAimCandidates();
    const scale = this.radarDrawRadius / this.radarWorldRadius;

    for (const enemy of candidates) {
      const contact = projectRadarContact(
        snapshot.playerPosition,
        snapshot.playerYaw,
        enemy.position,
        this.radarWorldRadius,
      );
      const px = cx + contact.lateral * scale;
      const py = cx - contact.forward * scale;
      const color = RADAR_COLORS[enemy.type] || '#ffffff';

      if (contact.outOfRange) {
        const vx = px - cx;
        const vy = py - cx;
        const length = Math.hypot(vx, vy) || 1;
        const dirX = vx / length;
        const dirY = vy / length;
        const tangentX = -dirY;
        const tangentY = dirX;
        const markerX = cx + dirX * (r - markerInset);
        const markerY = cx + dirY * (r - markerInset);
        const falloff = Math.min(
          Math.max(
            (contact.distance - this.radarWorldRadius)
              / (CONFIG.world.enemyDespawnDistance - this.radarWorldRadius),
            0,
          ),
          1,
        );

        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.globalAlpha = 1 - falloff * 0.45;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(markerX + dirX * markerReach, markerY + dirY * markerReach);
        ctx.lineTo(
          markerX - dirX * markerDepth + tangentX * markerHalfWidth,
          markerY - dirY * markerDepth + tangentY * markerHalfWidth,
        );
        ctx.lineTo(
          markerX - dirX * markerDepth - tangentX * markerHalfWidth,
          markerY - dirY * markerDepth - tangentY * markerHalfWidth,
        );
        ctx.closePath();
        ctx.fill();
        continue;
      }

      // Fade nearby dots at the edge of radar range
      const alpha = contact.distance > this.radarWorldRadius * 0.85
        ? 1 - (contact.distance - this.radarWorldRadius * 0.85) / (this.radarWorldRadius * 0.15)
        : 1;

      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Reset shadow and alpha
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  showHitIndicator(sourceX, sourceY, sourceZ, damage) {
    const cfg = CONFIG.effects.hitIndicator;
    const totalDuration = cfg.fadeIn + cfg.hold + cfg.fadeOut;

    // Compute angle from player forward to damage source
    const snapshot = this.simulation.getSnapshot();
    const dx = sourceX - snapshot.playerPosition.x;
    const dz = sourceZ - snapshot.playerPosition.z;
    const angleToSource = Math.atan2(dx, dz);
    const relativeAngle = angleToSource - snapshot.playerYaw;

    // Vignette — offset radial gradient toward damage side
    const vignX = 50 + Math.sin(relativeAngle) * 30;
    const vignY = 50 - Math.cos(relativeAngle) * 30;
    const intensity = Math.min(1, damage / 20);
    this.hud.hitVignette.style.background =
      `radial-gradient(circle at ${vignX}% ${vignY}%, transparent 30%, rgba(255, 40, 40, ${0.35 * intensity}) 100%)`;

    // Chevron — position on circle around screen center
    const chevron = document.createElement('div');
    chevron.className = 'hit-chevron';
    const arrow = document.createElement('div');
    arrow.className = 'hit-chevron__arrow';
    chevron.appendChild(arrow);

    const r = cfg.chevronRadius;
    const cx = Math.sin(relativeAngle) * r;
    const cy = -Math.cos(relativeAngle) * r;
    chevron.style.transform = `translate(${cx}px, ${cy}px) rotate(${relativeAngle}rad)`;
    this.hud.hitChevrons.appendChild(chevron);

    this.hitIndicators.push({
      elapsed: 0,
      duration: totalDuration,
      fadeIn: cfg.fadeIn,
      hold: cfg.hold,
      fadeOut: cfg.fadeOut,
      chevron,
    });
  }

  updateHitIndicators(dt) {
    let anyActive = false;

    for (let i = this.hitIndicators.length - 1; i >= 0; i--) {
      const ind = this.hitIndicators[i];
      ind.elapsed += dt;

      if (ind.elapsed >= ind.duration) {
        ind.chevron.remove();
        this.hitIndicators.splice(i, 1);
        continue;
      }

      anyActive = true;
      let opacity;
      if (ind.elapsed < ind.fadeIn) {
        opacity = ind.elapsed / ind.fadeIn;
      } else if (ind.elapsed < ind.fadeIn + ind.hold) {
        opacity = 1;
      } else {
        opacity = 1 - (ind.elapsed - ind.fadeIn - ind.hold) / ind.fadeOut;
      }
      ind.chevron.style.opacity = opacity;
    }

    if (anyActive) {
      this.hud.hitVignette.classList.add('hit-vignette--active');
    } else {
      this.hud.hitVignette.classList.remove('hit-vignette--active');
      this.hud.hitVignette.style.background = '';
    }
  }

  resize() {
    const width = this.mount.clientWidth || window.innerWidth;
    const height = this.mount.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.cameraShake.reset();
    this.explosions.dispose();
    this.input.dispose();
    this.simulation.dispose();
    this.renderer.dispose();
  }
}
