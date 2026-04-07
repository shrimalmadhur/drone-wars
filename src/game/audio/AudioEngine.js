import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { clamp } from '../math.js';
import { AUDIO_CONSTANTS } from './constants.js';
import {
  createEngineHum,
  createWindLoop,
  playEnemyFire,
  playExplosion,
  playGameOver,
  playImpact,
  playLockOn,
  playLowHealthWarning,
  playMissileFlyby,
  playPlayerFire,
  playPlayerHit,
  playWaveComplete,
} from './sounds.js';

export class AudioEngine {
  constructor(options = {}) {
    this.config = options.config ?? CONFIG.audio;
    this.globalObject = options.globalObject ?? globalThis;
    this.createContext = options.createContext ?? null;
    this.context = null;
    this.masterGain = null;
    this.muted = false;
    this.engineHum = null;
    this.windLoop = null;
    this.lowHealthInterval = null;
    this.missileFlybyCooldowns = new Map();
    this.listenerForward = new THREE.Vector3();
    this.listenerUp = new THREE.Vector3(0, 1, 0);
  }

  get AudioContextCtor() {
    return this.globalObject.AudioContext ?? this.globalObject.webkitAudioContext ?? null;
  }

  ensureContext() {
    if (this.context) {
      return this.context;
    }

    const context = this.createContext
      ? this.createContext()
      : this.AudioContextCtor
        ? new this.AudioContextCtor()
        : null;

    if (!context) {
      return null;
    }

    this.context = context;
    this.masterGain = context.createGain();
    this.masterGain.connect(context.destination);
    this.syncMasterGain();
    return context;
  }

  async resume() {
    try {
      const context = this.ensureContext();
      if (!context) {
        return false;
      }
      if (context.state === 'suspended' && context.resume) {
        await context.resume();
      }
      return true;
    } catch {
      this.context = null;
      this.masterGain = null;
      return false;
    }
  }

  syncMasterGain() {
    if (!this.masterGain) {
      return;
    }
    const volume = this.muted ? 0 : this.config.masterVolume;
    if (this.masterGain.gain?.setValueAtTime && this.context) {
      this.masterGain.gain.setValueAtTime(volume, this.context.currentTime);
    } else {
      this.masterGain.gain.value = volume;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.syncMasterGain();
    return this.muted;
  }

  createSpatialDestination(position) {
    const context = this.context;
    if (!context || !position) {
      return { node: this.masterGain, cleanup: null };
    }

    const panner = context.createPanner();
    panner.panningModel = AUDIO_CONSTANTS.panner.panningModel;
    panner.distanceModel = AUDIO_CONSTANTS.panner.distanceModel;
    panner.rolloffFactor = AUDIO_CONSTANTS.panner.rolloffFactor;
    panner.refDistance = this.config.distanceRef;
    panner.maxDistance = this.config.distanceMax;

    if (panner.positionX) {
      panner.positionX.setValueAtTime(position.x, context.currentTime);
      panner.positionY.setValueAtTime(position.y, context.currentTime);
      panner.positionZ.setValueAtTime(position.z, context.currentTime);
    } else {
      panner.setPosition(position.x, position.y, position.z);
    }

    panner.connect(this.masterGain);
    return {
      node: panner,
      cleanup: () => panner.disconnect(),
    };
  }

  play(builder, position = null) {
    const context = this.ensureContext();
    if (!context || !this.masterGain) {
      return;
    }
    const destination = this.createSpatialDestination(position);
    const duration = builder(context, destination.node);
    if (destination.cleanup && duration) {
      this.globalObject.setTimeout?.(() => destination.cleanup(), Math.ceil(duration * 1000) + 120);
    }
  }

  playPlayerFire() {
    this.play(playPlayerFire);
  }

  playEnemyFire(position) {
    this.play(playEnemyFire, position);
  }

  playImpact(position) {
    this.play(playImpact, position);
  }

  playPlayerHit() {
    this.play(playPlayerHit);
  }

  playExplosion(position) {
    this.play(playExplosion, position);
  }

  playMissileFlyby(position) {
    this.play(playMissileFlyby, position);
  }

  playLockOn() {
    this.play(playLockOn);
  }

  playWaveComplete() {
    this.play(playWaveComplete);
  }

  playGameOver() {
    this.play(playGameOver);
  }

  startContinuous() {
    const context = this.ensureContext();
    if (!context || !this.masterGain) {
      return;
    }
    if (!this.engineHum) {
      this.engineHum = createEngineHum(context, this.masterGain, this.config.enginePitchRange);
    }
    if (!this.windLoop) {
      this.windLoop = createWindLoop(context, this.masterGain);
    }
  }

  stopContinuous() {
    this.engineHum?.stop();
    this.windLoop?.stop();
    this.engineHum = null;
    this.windLoop = null;
  }

  setEngineSpeed(speed) {
    if (!this.engineHum) {
      return;
    }
    const referenceSpeed = Math.max(CONFIG.player.thrust, CONFIG.player.strafe, CONFIG.player.vertical) * 1.7;
    this.engineHum.setSpeed(clamp(speed / referenceSpeed, 0, 1));
  }

  startLowHealthWarning() {
    if (this.lowHealthInterval) {
      return;
    }
    this.play(playLowHealthWarning);
    this.lowHealthInterval = this.globalObject.setInterval?.(
      () => this.play(playLowHealthWarning),
      AUDIO_CONSTANTS.lowHealthIntervalMs,
    ) ?? null;
  }

  stopLowHealthWarning() {
    if (!this.lowHealthInterval) {
      return;
    }
    this.globalObject.clearInterval?.(this.lowHealthInterval);
    this.lowHealthInterval = null;
  }

  updateMissileFlybys(playerPosition, missileSnapshots) {
    if (!this.context) {
      return;
    }
    const activeMissiles = new Set();
    const maxDistanceSq = AUDIO_CONSTANTS.missileFlybyDistance * AUDIO_CONSTANTS.missileFlybyDistance;
    const now = this.context.currentTime;

    for (const missile of missileSnapshots) {
      activeMissiles.add(missile.id);
      const dx = missile.x - playerPosition.x;
      const dy = missile.y - playerPosition.y;
      const dz = missile.z - playerPosition.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq > maxDistanceSq) {
        continue;
      }
      const lastPlayedAt = this.missileFlybyCooldowns.get(missile.id) ?? Number.NEGATIVE_INFINITY;
      if (now - lastPlayedAt < AUDIO_CONSTANTS.missileFlybyCooldown) {
        continue;
      }
      this.missileFlybyCooldowns.set(missile.id, now);
      this.playMissileFlyby(missile);
    }

    for (const missileId of this.missileFlybyCooldowns.keys()) {
      if (!activeMissiles.has(missileId)) {
        this.missileFlybyCooldowns.delete(missileId);
      }
    }
  }

  updateListener(camera) {
    if (!this.context || !camera) {
      return;
    }

    const listener = this.context.listener;
    camera.getWorldDirection(this.listenerForward).normalize();
    this.listenerUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    if (listener.positionX) {
      listener.positionX.setValueAtTime(camera.position.x, this.context.currentTime);
      listener.positionY.setValueAtTime(camera.position.y, this.context.currentTime);
      listener.positionZ.setValueAtTime(camera.position.z, this.context.currentTime);
      listener.forwardX.setValueAtTime(this.listenerForward.x, this.context.currentTime);
      listener.forwardY.setValueAtTime(this.listenerForward.y, this.context.currentTime);
      listener.forwardZ.setValueAtTime(this.listenerForward.z, this.context.currentTime);
      listener.upX.setValueAtTime(this.listenerUp.x, this.context.currentTime);
      listener.upY.setValueAtTime(this.listenerUp.y, this.context.currentTime);
      listener.upZ.setValueAtTime(this.listenerUp.z, this.context.currentTime);
    } else {
      listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
      listener.setOrientation(
        this.listenerForward.x,
        this.listenerForward.y,
        this.listenerForward.z,
        this.listenerUp.x,
        this.listenerUp.y,
        this.listenerUp.z,
      );
    }
  }

  async dispose() {
    this.stopContinuous();
    this.stopLowHealthWarning();
    this.missileFlybyCooldowns.clear();
    try {
      if (this.context?.close) {
        await this.context.close();
      }
    } catch {
      // Ignore close failures during teardown; the engine is still considered disposed.
    } finally {
      this.context = null;
      this.masterGain = null;
    }
  }
}
