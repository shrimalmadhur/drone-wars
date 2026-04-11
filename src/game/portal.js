import * as THREE from 'three';

import { CONFIG } from './config.js';

const START_PORTAL_COLOR = 0xff6b6b;
const EXIT_PORTAL_COLOR = 0x61ffd8;
const PORTAL_RADIUS = 12;
const PORTAL_INNER_RADIUS = 10;
const PORTAL_TRIGGER_DISTANCE = 18;

function clampHealth(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(100, Math.max(1, parsed));
}

function parseNumber(value, fallback = 0) {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toHexColor(colorValue) {
  if (!colorValue) {
    return '8af4ff';
  }
  const raw = String(colorValue).trim();
  if (!raw) {
    return '8af4ff';
  }
  if (/^[a-z]+$/i.test(raw)) {
    return raw.toLowerCase();
  }
  return raw.replace(/^#/, '');
}

function createLabelSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(5, 8, 20, 0.72)';
  context.fillRect(16, 28, canvas.width - 32, 72);
  context.strokeStyle = '#ffffff';
  context.globalAlpha = 0.14;
  context.lineWidth = 3;
  context.strokeRect(16, 28, canvas.width - 32, 72);
  context.globalAlpha = 1;
  context.fillStyle = '#' + color.toString(16).padStart(6, '0');
  context.font = '700 34px Orbitron, Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(22, 5.5, 1);
  return sprite;
}

function createPortalGroup({ color, label, position }) {
  const group = new THREE.Group();
  group.position.copy(position);

  const outerRing = new THREE.Mesh(
    new THREE.TorusGeometry(PORTAL_RADIUS, 1.4, 18, 56),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.15,
      metalness: 0.32,
      roughness: 0.2,
      transparent: true,
      opacity: 0.95,
    }),
  );
  outerRing.rotation.x = Math.PI * 0.5;

  const innerDisc = new THREE.Mesh(
    new THREE.CircleGeometry(PORTAL_INNER_RADIUS, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
    }),
  );
  innerDisc.rotation.x = Math.PI * 0.5;

  const shimmer = new THREE.Mesh(
    new THREE.RingGeometry(PORTAL_INNER_RADIUS * 0.45, PORTAL_INNER_RADIUS * 0.88, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
    }),
  );
  shimmer.rotation.x = Math.PI * 0.5;
  shimmer.position.y = 0.06;

  const labelSprite = createLabelSprite(label, color);
  labelSprite.position.set(0, 18, 0);

  const light = new THREE.PointLight(color, 2.1, 56, 2);
  light.position.set(0, 10, 0);

  group.add(outerRing, innerDisc, shimmer, labelSprite, light);

  return {
    group,
    outerRing,
    innerDisc,
    shimmer,
    labelSprite,
  };
}

function resolveRefUrl(ref) {
  if (!ref) {
    return null;
  }
  try {
    return new URL(ref, window.location.origin);
  } catch {
    return null;
  }
}

function buildForwardedParams(baseParams, overrides = {}) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(baseParams)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    next.set(key, String(value));
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === '') {
      next.delete(key);
      continue;
    }
    next.set(key, String(value));
  }
  return next;
}

export function getPortalContext(search = window.location.search) {
  const params = new URLSearchParams(search);
  const portal = params.get('portal') === 'true';
  const ref = params.get('ref') || null;
  const username = params.get('username') || '';
  const hp = clampHealth(params.get('hp'));

  const speedX = parseNumber(params.get('speed_x'), 0);
  const speedY = parseNumber(params.get('speed_y'), 0);
  const speedZ = parseNumber(params.get('speed_z'), 0);
  const speed = parseNumber(
    params.get('speed'),
    Math.hypot(speedX, speedY, speedZ),
  );

  return {
    active: portal,
    ref,
    username,
    color: toHexColor(params.get('color')),
    hp,
    avatarUrl: params.get('avatar_url') || '',
    team: params.get('team') || '',
    speed,
    speedX,
    speedY,
    speedZ,
    rotationX: parseNumber(params.get('rotation_x'), 0),
    rotationY: parseNumber(params.get('rotation_y'), Math.PI),
    rotationZ: parseNumber(params.get('rotation_z'), 0),
  };
}

export class PortalSystem {
  constructor(scene, terrain, getPlayerState, portalContext = null) {
    this.scene = scene;
    this.terrain = terrain;
    this.getPlayerState = getPlayerState;
    this.portalContext = portalContext;
    this.redirecting = false;
    this.baseGameUrl = new URL(window.location.pathname, window.location.origin).toString();
    const currentParams = new URLSearchParams(window.location.search);
    this.forwardBaseParams = {};
    for (const [key, value] of currentParams.entries()) {
      if (key === 'portal' || key === 'ref') {
        continue;
      }
      this.forwardBaseParams[key] = value;
    }
    this.forwardBaseParams.username = this.forwardBaseParams.username || portalContext?.username || '';
    this.forwardBaseParams.color = this.forwardBaseParams.color || portalContext?.color || toHexColor(CONFIG.palette.player.toString(16));
    this.forwardBaseParams.avatar_url = this.forwardBaseParams.avatar_url || portalContext?.avatarUrl || '';
    this.forwardBaseParams.team = this.forwardBaseParams.team || portalContext?.team || '';

    const exitPosition = new THREE.Vector3(96, this.terrain.getGroundHeight(96, -36) + 16, -36);
    this.exitPortal = createPortalGroup({
      color: EXIT_PORTAL_COLOR,
      label: 'Vibe Jam Portal',
      position: exitPosition,
    });
    this.scene.add(this.exitPortal.group);

    this.startPortal = null;
    if (portalContext?.active && portalContext?.ref) {
      const startPosition = new THREE.Vector3(0, 18, 54);
      this.startPortal = createPortalGroup({
        color: START_PORTAL_COLOR,
        label: 'Return Portal',
        position: startPosition,
      });
      this.scene.add(this.startPortal.group);
    }
  }

  getSpawnState() {
    if (!this.portalContext?.active) {
      return null;
    }

    const portalPosition = this.startPortal?.group.position ?? new THREE.Vector3(0, 18, 54);
    const spawnPosition = portalPosition.clone().add(new THREE.Vector3(0, 0, 22));
    spawnPosition.y = this.terrain.getGroundHeight(spawnPosition.x, spawnPosition.z) + 18;
    return {
      position: spawnPosition,
      velocity: new THREE.Vector3(
        this.portalContext.speedX,
        this.portalContext.speedY,
        this.portalContext.speedZ,
      ),
      yaw: this.portalContext.rotationY,
      health: this.portalContext.hp,
    };
  }

  buildContinuityParams(playerState, extra = {}) {
    return buildForwardedParams(this.forwardBaseParams, {
      portal: 'true',
      username: playerState.username,
      color: playerState.color,
      speed: playerState.speed.toFixed(2),
      hp: Math.round(playerState.hp),
      speed_x: playerState.speedX.toFixed(2),
      speed_y: playerState.speedY.toFixed(2),
      speed_z: playerState.speedZ.toFixed(2),
      rotation_x: '0',
      rotation_y: playerState.rotationY.toFixed(4),
      rotation_z: '0',
      ...extra,
    });
  }

  redirectToExit(playerState) {
    const params = this.buildContinuityParams(playerState, {
      ref: this.baseGameUrl,
    });
    window.location.href = `https://vibej.am/portal/2026?${params.toString()}`;
  }

  redirectToRef(playerState) {
    const refUrl = resolveRefUrl(this.portalContext?.ref);
    if (!refUrl) {
      return;
    }
    const params = this.buildContinuityParams(playerState, {
      ref: this.baseGameUrl,
    });
    refUrl.search = params.toString();
    window.location.href = refUrl.toString();
  }

  updatePortalAnimation(portal, elapsedSeconds) {
    if (!portal) {
      return;
    }
    const pulse = Math.sin(elapsedSeconds * 2.7) * 0.5 + 0.5;
    portal.outerRing.rotation.z += 0.008;
    portal.shimmer.rotation.z -= 0.013;
    portal.innerDisc.material.opacity = 0.14 + pulse * 0.12;
    portal.shimmer.material.opacity = 0.18 + pulse * 0.16;
    const scale = 1 + pulse * 0.06;
    portal.outerRing.scale.setScalar(scale);
  }

  update(elapsedSeconds = 0) {
    this.updatePortalAnimation(this.exitPortal, elapsedSeconds);
    this.updatePortalAnimation(this.startPortal, elapsedSeconds);

    if (this.redirecting) {
      return;
    }

    const playerState = this.getPlayerState?.();
    if (!playerState?.position) {
      return;
    }

    const exitDistance = playerState.position.distanceTo(this.exitPortal.group.position);
    if (exitDistance <= PORTAL_TRIGGER_DISTANCE) {
      this.redirecting = true;
      this.redirectToExit(playerState);
      return;
    }

    if (this.startPortal) {
      const startDistance = playerState.position.distanceTo(this.startPortal.group.position);
      if (startDistance <= PORTAL_TRIGGER_DISTANCE) {
        this.redirecting = true;
        this.redirectToRef(playerState);
      }
    }
  }

  getRadarContacts() {
    const contacts = [
      {
        kind: 'exit',
        label: 'Vibe Jam Portal',
        position: this.exitPortal.group.position,
      },
    ];

    if (this.startPortal) {
      contacts.push({
        kind: 'return',
        label: 'Return Portal',
        position: this.startPortal.group.position,
      });
    }

    return contacts;
  }

  dispose() {
    if (this.exitPortal) {
      this.scene.remove(this.exitPortal.group);
    }
    if (this.startPortal) {
      this.scene.remove(this.startPortal.group);
    }
  }
}
