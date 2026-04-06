import * as THREE from 'three';

import { CONFIG } from './config.js';
import { InputController } from './input.js';
import { findAimAssistTarget } from './math.js';
import { Simulation } from './Simulation.js';

export class Game {
  constructor({ mount, hud }) {
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
    this.simulation = new Simulation(this.scene);
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
    this.input.dispose();
    this.simulation.dispose();
    this.renderer.dispose();
  }
}
