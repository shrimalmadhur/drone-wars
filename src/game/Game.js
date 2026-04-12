import * as THREE from 'three';

import { CONFIG } from './config.js';
import { InputController, KeyboardInputController } from './input.js';
import { findAimAssistTarget, projectRadarContact } from './math.js';
import { Simulation } from './Simulation.js';
import { GAME_STATES } from './state.js';
import { CameraShake } from './effects/CameraShake.js';
import { ExplosionEffect } from './effects/ExplosionEffect.js';
import { ScorePop } from './effects/ScorePop.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { applyAudioFrame, createAudioFrameState } from './audio/frameAudio.js';
import { PortalSystem } from './portal.js';

const RADAR_COLORS = Object.fromEntries(
  ['tank', 'drone', 'droneSupport', 'droneJammer', 'missile', 'turret', 'ship', 'boss']
    .map(k => [k, '#' + CONFIG.palette[k].toString(16).padStart(6, '0')])
);
const PICKUP_COLORS = Object.fromEntries(
  Object.entries(CONFIG.palette.pickup).map(([k, v]) => [k, '#' + v.toString(16).padStart(6, '0')])
);
const PORTAL_COLORS = {
  exit: '#61ffd8',
  return: '#ff6b6b',
};

export class Game {
  constructor({
    mount,
    hud,
    mapTheme,
    playerProgress,
    runModifiers,
    loadout,
    portalContext,
    playerName,
    inputController,
    onRunComplete,
    onRestartRequested,
  }) {
    this.mount = mount;
    this.hud = hud;
    this.playerName = playerName;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio));
    this.mount.appendChild(this.renderer.domElement);

    this.input = inputController ?? new InputController({
      keyboard: new KeyboardInputController(window, document),
    });
    this.simulation = new Simulation(this.scene, { mapTheme, playerProgress, runModifiers, loadout });
    this.portalSystem = new PortalSystem(
      this.scene,
      this.simulation.terrain,
      () => this.getPortalPlayerState(),
      portalContext,
    );
    this.onRunComplete = onRunComplete;
    this.onRestartRequested = onRestartRequested;
    this.currentRunConfig = { playerProgress, runModifiers, loadout };
    this.didRecordRun = false;
    this.audio = new AudioEngine();
    this.cameraShake = new CameraShake();
    this.explosions = new ExplosionEffect(this.scene);
    this.scorePops = new ScorePop(this.scene);
    this.hitIndicators = [];
    this.empVignetteTimer = 0;
    this.empVignetteMode = 'hit';
    this._lastShieldImpact = 0;
    this._lastShieldExpiry = 0;
    this._lastHitFlash = 0;
    this._lastFireFlash = 0;
    this._lastMode = this.simulation.state.mode;
    this._recoilDir = new THREE.Vector3();
    this.pickupBannerTimer = 0;
    this.shieldVignetteTimer = 0;
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
    this.audioFrameState = createAudioFrameState(this.simulation.state.mode);
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
    this.handleImmediatePause = (reason) => {
      this.simulation.pause(reason);
      this.audio.stopContinuous();
      this.audio.stopLowHealthWarning();
      this.audioFrameState.lastMode = GAME_STATES.PAUSED;
      this.audioFrameState.lowHealthActive = false;
      this._lastMode = GAME_STATES.PAUSED;
      this.input.reset();
    };
    this.onVisibility = () => {
      if (document.hidden) {
        this.handleImmediatePause('Auto-paused: tab hidden.');
      }
    };
    this.onBlur = () => {
      this.handleImmediatePause('Auto-paused: focus lost.');
    };

    window.addEventListener('resize', this.onResize);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
  }

  resumeAudio() {
    return this.audio.resume();
  }

  restartRun({ playerProgress, runModifiers, loadout } = {}) {
    this.currentRunConfig = {
      playerProgress: playerProgress ?? this.currentRunConfig.playerProgress,
      runModifiers: runModifiers ?? this.currentRunConfig.runModifiers,
      loadout: loadout ?? this.currentRunConfig.loadout,
    };
    this.simulation.setRunConfig(this.currentRunConfig);
    this.simulation.restart();
    this.applyPortalSpawnState();
    this.didRecordRun = false;
    this.input.reset();
  }

  applyPortalSpawnState() {
    const spawnState = this.portalSystem?.getSpawnState?.();
    if (!spawnState) {
      return;
    }
    this.simulation.player.group.position.copy(spawnState.position);
    this.simulation.player.velocity.copy(spawnState.velocity);
    this.simulation.player.yaw = spawnState.yaw;
    this.simulation.player.group.rotation.y = spawnState.yaw;
    if (spawnState.health !== null && spawnState.health !== undefined) {
      this.simulation.player.health = Math.min(
        this.simulation.player.runModifiers.maxHealth,
        Math.max(1, spawnState.health),
      );
      this.simulation.state.health = this.simulation.player.health;
    }
    this.simulation.state.status = 'Portal arrival registered. Continue the run.';
  }

  getPortalPlayerState() {
    const velocity = this.simulation.player.velocity;
    return {
      username: this.playerName || 'Portal Pilot',
      color: CONFIG.palette.player.toString(16).padStart(6, '0'),
      hp: this.simulation.player.health,
      speed: velocity.length(),
      speedX: velocity.x,
      speedY: velocity.y,
      speedZ: velocity.z,
      rotationY: this.simulation.player.yaw,
      position: this.simulation.player.group.position,
    };
  }

  finalizeCompletedRun(currentMode) {
    if (currentMode === GAME_STATES.RUNNING) {
      this.didRecordRun = false;
      return;
    }

    if (!this.didRecordRun && currentMode === GAME_STATES.GAME_OVER) {
      this.didRecordRun = true;
      const result = this.onRunComplete?.(this.simulation.getRunSummary());
      if (result?.progress) {
        this.simulation.state.bestScore = result.progress.bestScore;
        this.simulation.state.bestWave = result.progress.bestWave;
        this.simulation.state.achievementCount = result.progress.achievements.length;
      }
    }
  }

  start() {
    this.clock.last = performance.now();
    this._fpsFrames = 0;
    this._fpsLastTime = performance.now();
    this._fpsEl = this.hud.fpsCounter;
    const tick = (time) => {
      this._fpsFrames++;
      if (time - this._fpsLastTime >= 500) {
        const fps = Math.round(this._fpsFrames * 1000 / (time - this._fpsLastTime));
        if (this._fpsEl) this._fpsEl.textContent = fps + ' FPS';
        this._fpsFrames = 0;
        this._fpsLastTime = time;
      }
      const elapsed = Math.min((time - this.clock.last) / 1000, CONFIG.simulation.maxFrameTime);
      this.clock.last = time;
      this.clock.accumulator += elapsed;

      let snapshot = this.simulation.getSnapshot();
      snapshot.portals = this.portalSystem?.getRadarContacts?.() ?? [];
      let aimCandidates = this.simulation.getAimCandidates();
      this.updateCamera(snapshot);
      this.updateAimSolution(snapshot, aimCandidates);

      const controls = this.input.snapshot();
      if (controls.mutePressed) {
        this.audio.toggleMute();
      }
      controls.aimDirection = this.aimDirection;
      controls.lockedTargetId = this.aimState.target?.id ?? null;
      let steps = 0;
      while (this.clock.accumulator >= CONFIG.simulation.step && steps < CONFIG.simulation.maxSubsteps) {
        this.simulation.update(CONFIG.simulation.step, controls);
        this.clock.accumulator -= CONFIG.simulation.step;
        steps += 1;
      }

      const currentMode = this.simulation.state.mode;
      this.finalizeCompletedRun(currentMode);
      if (this._lastMode === GAME_STATES.GAME_OVER && currentMode === GAME_STATES.RUNNING) {
        this.cameraShake.reset();
        this.clearHitIndicators();
        this.explosions.reset();
        this.scorePops.reset();
        this.hidePickupBanner();
        this.hideShieldVignette();
        this.hideEmpVignette();
      }

      snapshot = this.simulation.getSnapshot();
      snapshot.portals = this.portalSystem?.getRadarContacts?.() ?? [];
      aimCandidates = this.simulation.getAimCandidates();
      this.updateCamera(snapshot);
      this.updateAimSolution(snapshot, aimCandidates);
      this.audio.updateListener(this.camera);
      applyAudioFrame({
        audio: this.audio,
        snapshot,
        aimLocked: this.aimState.locked,
        state: this.audioFrameState,
        lowHealthThreshold: CONFIG.audio.lowHealthThreshold,
        playerSpeed: this.simulation.player.velocity.length(),
      });
      this.renderHud(snapshot, aimCandidates);
      this.simulation.clearFrameEvents();
      this.updatePickupBanner(elapsed);
      this.updateHitIndicators(elapsed);
      this.cameraShake.update(elapsed);
      this.cameraShake.apply(this.camera);
      this.explosions.update(elapsed);
      this.scorePops.update(elapsed);
      this.portalSystem?.update(snapshot.time);
      this.renderer.render(this.scene, this.camera);
      this._lastMode = currentMode;
      this.frame = requestAnimationFrame(tick);
    };

    this.frame = requestAnimationFrame(tick);
  }

  updateCamera(snapshot) {
    const forward = new THREE.Vector3(Math.sin(snapshot.playerYaw), 0, Math.cos(snapshot.playerYaw));
    const desiredPosition = snapshot.playerPosition.clone()
      .addScaledVector(forward, -24)
      .add(new THREE.Vector3(0, 12, 0));
    this.cameraPosition.lerp(desiredPosition, 0.12);
    this.lookTarget.copy(snapshot.playerPosition).addScaledVector(forward, 22).add(new THREE.Vector3(0, 3, 0));
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(this.lookTarget);
  }

  updateAimSolution(snapshot, candidates) {
    this.camera.getWorldDirection(this.cameraDirection).normalize();

    const lock = findAimAssistTarget(
      this.camera.position,
      this.cameraDirection,
      candidates,
      {
        minDot: 0.965 + snapshot.jammerStrength * 0.02,
        maxDistance: 240 - snapshot.jammerStrength * 90,
      },
    );

    if (lock) {
      this.aimPoint.copy(lock.position);
      this.aimState.locked = true;
      this.aimState.label = `LOCK ${lock.label}`;
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

  renderHud(snapshot, candidates) {
    this.hud.score.textContent = snapshot.score.toString();
    this.hud.bestScore.textContent = snapshot.bestScore.toString();
    this.hud.bestWave.textContent = snapshot.bestWave.toString();
    this.hud.achievements.textContent = snapshot.achievementCount.toString();
    this.hud.wave.textContent = snapshot.wave.toString();
    this.hud.enemyCount.textContent = snapshot.enemyCount.toString();
    this.hud.healthValue.textContent = `${Math.round(snapshot.health)}%`;
    this.hud.healthFill.style.width = `${Math.max(0, snapshot.health)}%`;
    this.hud.status.textContent = snapshot.status;
    this.hud.powerup.textContent = snapshot.activePowerUp
      ? snapshot.activePowerUp === 'shield'
        ? `${snapshot.activePowerUpTimer <= 3 ? 'SHIELD FADING' : 'SHIELD ACTIVE'} ${snapshot.activePowerUpTimer.toFixed(1)}s`
        : `${snapshot.activePowerUp.toUpperCase()} ${snapshot.activePowerUpTimer.toFixed(1)}s`
      : 'No active power-up';
    this.hud.mutator.textContent = `Mutator: ${snapshot.mutatorLabel}`;
    if (snapshot.equippedAbility === 'dash') {
      this.hud.pulse.textContent = snapshot.abilityCooldown > 0
        ? `${snapshot.abilityLabel} recharging ${snapshot.abilityCooldown.toFixed(1)}s`
        : `${snapshot.abilityLabel} ready (F) short evasive burst`;
    } else {
      this.hud.pulse.textContent = snapshot.abilityCooldown > 0
        ? `${snapshot.abilityLabel} recharging ${snapshot.abilityCooldown.toFixed(1)}s`
        : `${snapshot.abilityLabel} ready (F) close range ${CONFIG.player.pulseRadius}m`;
    }
    if (snapshot.mission) {
      const missionRatio = snapshot.mission.target > 0
        ? snapshot.mission.progress / snapshot.mission.target
        : 0;
      this.hud.missionName.textContent = snapshot.mission.chainDepth > 0
        ? `${snapshot.mission.label} // Chain ${snapshot.mission.chainDepth + 1}`
        : snapshot.mission.label;
      this.hud.missionProgress.textContent = snapshot.mission.completed
        ? `${snapshot.mission.description} complete`
        : `${snapshot.mission.description} ${snapshot.mission.progress}/${snapshot.mission.target}`;
      this.hud.missionProgressFill.style.width = `${Math.max(8, missionRatio * 100)}%`;
      if (snapshot.mission.bonusObjective) {
        const bonus = snapshot.mission.bonusObjective;
        this.hud.bonusObjectiveName.textContent = `Bonus: ${bonus.label}`;
        this.hud.bonusObjectiveProgress.textContent = bonus.completed
          ? `${bonus.description} complete`
          : `${bonus.description} ${bonus.progress}/${bonus.target}`;
      } else {
        this.hud.bonusObjectiveName.textContent = 'Bonus: Stand by';
        this.hud.bonusObjectiveProgress.textContent = 'No bonus objective assigned for this wave.';
      }
    } else {
      this.hud.missionName.textContent = 'No active objective';
      this.hud.missionProgress.textContent = 'Complete the run to receive a combat objective.';
      this.hud.missionProgressFill.style.width = '0%';
      this.hud.bonusObjectiveName.textContent = 'Bonus: Stand by';
      this.hud.bonusObjectiveProgress.textContent = 'No bonus objective assigned for this wave.';
    }
    if (snapshot.waveDirective) {
      this.hud.waveDirectiveName.textContent = `Directive: ${snapshot.waveDirective.label}`;
      this.hud.waveDirectiveCopy.textContent = snapshot.waveDirective.description;
      this.hud.waveDirectiveName.dataset.directive = snapshot.waveDirective.id;
    } else {
      this.hud.waveDirectiveName.textContent = 'Directive: Standard pressure';
      this.hud.waveDirectiveCopy.textContent = 'Wave conditions normal. Expect baseline enemy composition.';
      this.hud.waveDirectiveName.dataset.directive = 'standard';
    }
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
      this._recoilDir.set(0, 0, 1).applyQuaternion(this.camera.quaternion);
      this.cameraShake.add(cfg.intensity, cfg.duration, this._recoilDir.x, this._recoilDir.y, this._recoilDir.z);
    }
    this._lastFireFlash = snapshot.fireFlash;

    // Kill shake + explosion
    for (const kill of snapshot.killEvents) {
      const cfg = CONFIG.effects.shake.onKill;
      this.cameraShake.add(cfg.intensity, cfg.duration);
      const color = CONFIG.palette[kill.type] || CONFIG.palette.effect;
      this.explosions.spawn(kill.position.x, kill.position.y, kill.position.z, color);
      this.scorePops.spawn(kill.position.x, kill.position.y, kill.position.z, kill.score, color);
    }

    for (const dmg of snapshot.damageEvents) {
      this.showHitIndicator(dmg.sourceX, dmg.sourceY, dmg.sourceZ, dmg.damage, snapshot);
    }

    for (const pickupEvent of snapshot.pickupEvents) {
      this.showPickupBanner(pickupEvent.type);
    }

    for (const empEvent of snapshot.empEvents ?? []) {
      this.showEmpVignette(empEvent.hits > 0 ? 'hit' : 'miss');
      this.cameraShake.add(empEvent.hits > 0 ? 0.26 : 0.1, empEvent.hits > 0 ? 0.16 : 0.08);
    }

    for (const shieldEvent of snapshot.shieldEvents ?? []) {
      if (shieldEvent.type === 'expired') {
        this.showPickupBanner('shield-expired');
      }
    }

    if ((snapshot.shieldImpactFlash ?? 0) > this._lastShieldImpact) {
      this.showShieldVignette('impact');
      this.cameraShake.add(0.14, 0.12);
    } else if ((snapshot.shieldExpiryFlash ?? 0) > this._lastShieldExpiry) {
      this.showShieldVignette('expiry');
    }
    this._lastShieldImpact = snapshot.shieldImpactFlash ?? 0;
    this._lastShieldExpiry = snapshot.shieldExpiryFlash ?? 0;

    if (!this.aimState.target && snapshot.pickups.length > 0) {
      const nearestPickup = snapshot.pickups.reduce((best, pickup) => {
        const dx = pickup.position.x - snapshot.playerPosition.x;
        const dz = pickup.position.z - snapshot.playerPosition.z;
        const distance = Math.hypot(dx, dz);
        if (!best || distance < best.distance) {
          return { pickup, distance };
        }
        return best;
      }, null);
      if (nearestPickup) {
        this.hud.targetName.textContent = `${nearestPickup.pickup.type.toUpperCase()} PICKUP`;
        this.hud.targetHealth.textContent = nearestPickup.pickup.type === 'repair'
          ? 'Red cross restores health on contact.'
          : 'Fly through it to activate immediately.';
        this.renderRadar(snapshot, candidates);
        return;
      }
    }

    if (this.aimState.target) {
      const hp = Math.max(0, Math.ceil(this.aimState.target.health));
      const maxHp = Math.ceil(this.aimState.target.maxHealth);
      this.hud.targetName.textContent = `${this.aimState.target.label.toUpperCase()} LOCKED`;
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
    this.renderRadar(snapshot, candidates);
  }

  showPickupBanner(type) {
    const copyByType = {
      repair: {
        title: 'Repair pickup secured',
        copy: 'Health restored. Red cross pickups heal on contact.',
      },
      overdrive: {
        title: 'Overdrive online',
        copy: 'Fire rate boosted for a short burst.',
      },
      spread: {
        title: 'Spread fire engaged',
        copy: 'Your weapon now fires a 3-shot spread.',
      },
      shield: {
        title: 'Shield activated',
        copy: 'Incoming hits are fully absorbed until the shield expires.',
      },
      'shield-expired': {
        title: 'Shield offline',
        copy: 'The barrier collapsed. Hull damage will land again.',
      },
    };
    const content = copyByType[type] ?? {
      title: 'Pickup collected',
      copy: 'A temporary combat bonus is now active.',
    };

    this.hud.pickupBannerTitle.textContent = content.title;
    this.hud.pickupBannerCopy.textContent = content.copy;
    this.hud.pickupBanner.dataset.type = type;
    this.hud.pickupBanner.classList.add('pickup-banner--visible');
    this.pickupBannerTimer = 2.2;
  }

  hidePickupBanner() {
    this.hud.pickupBanner.classList.remove('pickup-banner--visible');
    delete this.hud.pickupBanner.dataset.type;
    this.pickupBannerTimer = 0;
  }

  showEmpVignette(mode = 'hit') {
    this.empVignetteMode = mode;
    this.empVignetteTimer = mode === 'hit' ? 0.42 : 0.28;
    this.hud.empVignette.dataset.mode = mode;
    this.hud.empVignette.classList.add('emp-vignette--visible');
  }

  hideEmpVignette() {
    this.hud.empVignette.classList.remove('emp-vignette--visible');
    delete this.hud.empVignette.dataset.mode;
    this.hud.empVignette.style.background = '';
    this.empVignetteTimer = 0;
  }

  updatePickupBanner(dt) {
    if (this.pickupBannerTimer <= 0) {
      return;
    }

    this.pickupBannerTimer = Math.max(0, this.pickupBannerTimer - dt);
    if (this.pickupBannerTimer === 0) {
      this.hidePickupBanner();
    }
  }

  showShieldVignette(mode = 'impact') {
    this.shieldVignetteTimer = mode === 'expiry' ? 0.7 : 0.35;
    this.hud.shieldVignette.dataset.mode = mode;
    this.hud.shieldVignette.classList.add('shield-vignette--visible');
  }

  hideShieldVignette() {
    this.hud.shieldVignette.classList.remove('shield-vignette--visible');
    delete this.hud.shieldVignette.dataset.mode;
    this.hud.shieldVignette.style.background = '';
    this.shieldVignetteTimer = 0;
  }

  renderRadar(snapshot, candidates) {
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
    const effectiveRadarWorldRadius = snapshot.radarRange ?? this.radarWorldRadius;
    const scale = this.radarDrawRadius / effectiveRadarWorldRadius;

    for (const enemy of candidates) {
      const contact = projectRadarContact(
        snapshot.playerPosition,
        snapshot.playerYaw,
        enemy.position,
        effectiveRadarWorldRadius,
      );
      const px = cx + contact.lateral * scale;
      const py = cx - contact.forward * scale;
      const color = RADAR_COLORS[enemy.radarType || enemy.type] || '#ffffff';

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
            (contact.distance - effectiveRadarWorldRadius)
              / (CONFIG.world.enemyDespawnDistance - effectiveRadarWorldRadius),
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
      const alpha = contact.distance > effectiveRadarWorldRadius * 0.85
        ? 1 - (contact.distance - effectiveRadarWorldRadius * 0.85) / (effectiveRadarWorldRadius * 0.15)
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

    const blinkAlpha = 0.45 + (Math.sin(snapshot.time * 7) * 0.5 + 0.5) * 0.55;
    for (const pickup of snapshot.pickups) {
      const contact = projectRadarContact(
        snapshot.playerPosition,
        snapshot.playerYaw,
        pickup.position,
        this.radarWorldRadius,
      );
      if (contact.outOfRange) {
        continue;
      }
      const px = cx + contact.lateral * scale;
      const py = cx - contact.forward * scale;
      const color = PICKUP_COLORS[pickup.type] || '#ffffff';

      ctx.save();
      ctx.globalAlpha = blinkAlpha;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      if (pickup.type === 'repair') {
        ctx.beginPath();
        ctx.moveTo(px - 4, py);
        ctx.lineTo(px + 4, py);
        ctx.moveTo(px, py - 4);
        ctx.lineTo(px, py + 4);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(px, py - 4.5);
        ctx.lineTo(px + 4.5, py);
        ctx.lineTo(px, py + 4.5);
        ctx.lineTo(px - 4.5, py);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const portal of snapshot.portals ?? []) {
      const contact = projectRadarContact(
        snapshot.playerPosition,
        snapshot.playerYaw,
        portal.position,
        this.radarWorldRadius,
      );
      if (contact.outOfRange) {
        continue;
      }

      const px = cx + contact.lateral * scale;
      const py = cx - contact.forward * scale;
      const color = PORTAL_COLORS[portal.kind] || '#ffffff';

      ctx.save();
      ctx.globalAlpha = 0.94;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (portal.kind === 'return') {
        ctx.beginPath();
        ctx.moveTo(px - 3.5, py);
        ctx.lineTo(px + 3.5, py);
        ctx.moveTo(px, py - 3.5);
        ctx.lineTo(px, py + 3.5);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Reset shadow and alpha
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    if (snapshot.jammerStrength > 0.05) {
      ctx.strokeStyle = `rgba(255, 209, 102, ${0.2 + snapshot.jammerStrength * 0.3})`;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(cx, cx, r * (0.9 - snapshot.jammerStrength * 0.18), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  showHitIndicator(sourceX, sourceY, sourceZ, damage, snapshot) {
    const cfg = CONFIG.effects.hitIndicator;
    const totalDuration = cfg.fadeIn + cfg.hold + cfg.fadeOut;

    // Compute angle from player forward to damage source
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

  clearHitIndicators() {
    for (const ind of this.hitIndicators) {
      ind.chevron.remove();
    }
    this.hitIndicators.length = 0;
    this.hud.hitVignette.classList.remove('hit-vignette--active');
    this.hud.hitVignette.style.background = '';
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

    if (this.shieldVignetteTimer > 0) {
      this.shieldVignetteTimer = Math.max(0, this.shieldVignetteTimer - dt);
      const mode = this.hud.shieldVignette.dataset.mode;
      const intensity = mode === 'expiry'
        ? 0.12 + this.shieldVignetteTimer * 0.22
        : 0.2 + this.shieldVignetteTimer * 0.55;
      this.hud.shieldVignette.style.background = mode === 'expiry'
        ? `radial-gradient(circle at center, rgba(199, 138, 255, ${intensity * 0.18}) 0%, rgba(199, 138, 255, ${intensity * 0.35}) 48%, transparent 76%)`
        : `radial-gradient(circle at center, rgba(138, 244, 255, ${intensity * 0.2}) 0%, rgba(199, 138, 255, ${intensity * 0.42}) 46%, transparent 74%)`;
      if (this.shieldVignetteTimer === 0) {
        this.hideShieldVignette();
      }
    }

    if (this.empVignetteTimer > 0) {
      this.empVignetteTimer = Math.max(0, this.empVignetteTimer - dt);
      const intensity = this.empVignetteMode === 'hit'
        ? 0.16 + this.empVignetteTimer * 0.8
        : 0.08 + this.empVignetteTimer * 0.44;
      this.hud.empVignette.style.background = this.empVignetteMode === 'hit'
        ? `radial-gradient(circle at center, rgba(138, 244, 255, ${intensity * 0.24}) 0%, rgba(138, 244, 255, ${intensity * 0.42}) 36%, transparent 72%)`
        : `radial-gradient(circle at center, rgba(255, 95, 109, ${intensity * 0.18}) 0%, rgba(255, 209, 102, ${intensity * 0.28}) 34%, transparent 70%)`;
      if (this.empVignetteTimer === 0) {
        this.hideEmpVignette();
      }
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
    this.cameraShake.reset();
    this.clearHitIndicators();
    this.explosions.dispose();
    this.scorePops.dispose();
    this.input.dispose();
    this.portalSystem?.dispose?.();
    this.simulation.dispose();
    void this.audio.dispose().catch(() => {});
    this.renderer.dispose();
  }
}
