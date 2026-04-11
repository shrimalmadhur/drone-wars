import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, float, uniform,
  positionWorld, normalize, dot, pow, max, abs,
  smoothstep, mix, sin, floor, fract, select,
  Loop,
} from 'three/tsl';

import { MAP_THEMES, sanitizeMapTheme } from '../../mapThemes.js';

const SKY_PRESETS = {
  [MAP_THEMES.FRONTIER]: {
    background: '#0a1a3a',
    fog: '#7baacf',
    fogNear: 120,
    fogFar: 360,
    topColor: '#1a5fb4',
    horizonColor: '#b0d4f1',
    bottomColor: '#0a1a3a',
    sunGlow: '#fffce8',
    haze: '#9ec8e8',
    hemiSky: 0x87ceeb,
    hemiGround: 0x24425d,
    hemiIntensity: 1.15,
    ambient: 0x8ab4d0,
    ambientIntensity: 0.5,
    sun: 0xfffff0,
    sunIntensity: 1.9,
    sunOffset: { x: 120, y: 150, z: -90 },
    glowOffset: { x: 180, y: 140, z: -140 },
  },
  [MAP_THEMES.CITY]: {
    background: '#0c1830',
    fog: '#84a8c8',
    fogNear: 95,
    fogFar: 300,
    topColor: '#2068b8',
    horizonColor: '#a8d0ee',
    bottomColor: '#0c1830',
    sunGlow: '#fff8e0',
    haze: '#a0c4e0',
    hemiSky: 0x87ceeb,
    hemiGround: 0x2a3848,
    hemiIntensity: 1.0,
    ambient: 0x7a9cb8,
    ambientIntensity: 0.45,
    sun: 0xfffff0,
    sunIntensity: 1.6,
    sunOffset: { x: 95, y: 150, z: -70 },
    glowOffset: { x: 130, y: 130, z: -108 },
  },
};

function createClouds(count = 18) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicNodeMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  for (let i = 0; i < count; i++) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < puffs; j++) {
      const size = 8 + Math.random() * 14;
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(size, 8, 6),
        material,
      );
      puff.position.set(
        (j - puffs / 2) * (size * 0.9) + Math.random() * 4,
        Math.random() * 4 - 2,
        Math.random() * 6 - 3,
      );
      puff.scale.y = 0.45 + Math.random() * 0.15;
      cloud.add(puff);
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = 80 + Math.random() * 250;
    cloud.position.set(
      Math.cos(angle) * radius,
      90 + Math.random() * 60,
      Math.sin(angle) * radius,
    );
    cloud.rotation.y = Math.random() * Math.PI;
    group.add(cloud);
  }

  return { group, material };
}

function createSkyMaterial(preset) {
  const topColor = uniform(new THREE.Color(preset.topColor));
  const horizonColor = uniform(new THREE.Color(preset.horizonColor));
  const bottomColor = uniform(new THREE.Color(preset.bottomColor));
  const sunDir = uniform(new THREE.Vector3(preset.sunOffset.x, preset.sunOffset.y, preset.sunOffset.z).normalize());
  const sunCol = uniform(new THREE.Color(preset.sunGlow));
  const timeU = uniform(0);

  // Hash function for procedural noise
  const hash2d = Fn(([p]) => {
    return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453123));
  });

  // 2D value noise
  const noise2d = Fn(([p_immutable]) => {
    const p = p_immutable.toVar();
    const i = floor(p);
    const f = fract(p).toVar();
    f.assign(f.mul(f).mul(float(3.0).sub(f.mul(2.0))));
    const a = hash2d(i);
    const b = hash2d(i.add(vec2(1.0, 0.0)));
    const c = hash2d(i.add(vec2(0.0, 1.0)));
    const d = hash2d(i.add(vec2(1.0, 1.0)));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  });

  // Fractal Brownian Motion (4 octaves)
  const fbm = Fn(([p_immutable]) => {
    const p = p_immutable.toVar();
    const v = float(0).toVar();
    const a = float(0.5).toVar();
    Loop(4, () => {
      v.addAssign(a.mul(noise2d(p)));
      p.assign(p.mul(2.0).add(vec2(100.0)));
      a.mulAssign(0.5);
    });
    return v;
  });

  // Main sky color function
  const skyColor = Fn(() => {
    const dir = normalize(positionWorld);
    const h = dir.y;

    // Base sky gradient: upper half blends horizon->top, lower half blends horizon->bottom
    const upperGrad = mix(horizonColor, topColor, smoothstep(0.0, 0.45, h));
    const lowerGrad = mix(horizonColor, bottomColor, smoothstep(0.0, -0.25, h));
    const color = select(h.greaterThan(0.0), upperGrad, lowerGrad).toVar();

    // Sun disc with soft glow and halo
    const sunDot = dot(dir, sunDir);
    const sunDisc = smoothstep(0.9965, 0.9985, sunDot);
    const sunGlow = pow(max(sunDot, 0.0), 64.0).mul(0.4);
    const sunHalo = pow(max(sunDot, 0.0), 8.0).mul(0.15);
    color.addAssign(sunCol.mul(sunDisc.add(sunGlow).add(sunHalo)));

    // Warm horizon tint near sun
    const horizonBlend = float(1.0).sub(abs(h));
    const sunProximity = pow(max(sunDot, 0.0), 3.0);
    color.addAssign(vec3(0.3, 0.15, 0.05).mul(horizonBlend).mul(sunProximity).mul(0.3));

    // Procedural cloud layer at horizon band
    const inCloudBand = h.greaterThan(-0.05).and(h.lessThan(0.35));
    const cloudUV = dir.xz.div(h.add(0.1)).mul(0.3).add(timeU.mul(0.002)).toVar();
    const clouds = smoothstep(0.35, 0.65, fbm(cloudUV.mul(3.0)));
    const cloudFade = smoothstep(-0.05, 0.05, h).mul(smoothstep(0.35, 0.15, h));
    const cloudCol = mix(horizonColor, vec3(1.0), 0.6);
    const cloudBlended = mix(color, cloudCol, clouds.mul(cloudFade).mul(0.5));
    color.assign(select(inCloudBand, cloudBlended, color));

    return color;
  });

  const mat = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    depthWrite: false,
  });
  mat.colorNode = skyColor();

  // Store time uniform reference for updates
  mat.userData = { timeUniform: timeU };

  return mat;
}

export function createEnvironment(scene, { mapTheme } = {}) {
  const theme = sanitizeMapTheme(mapTheme);
  const preset = SKY_PRESETS[theme];

  scene.background = new THREE.Color(preset.background);
  scene.fog = new THREE.Fog(preset.fog, preset.fogNear, preset.fogFar);

  const skyGroup = new THREE.Group();
  const skyMat = createSkyMaterial(preset);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 32), skyMat);
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(9, 18, 18),
    new THREE.MeshBasicNodeMaterial({
      color: preset.sunGlow,
      transparent: true,
      opacity: 0.65,
    }),
  );
  const haze = new THREE.Mesh(
    new THREE.SphereGeometry(280, 24, 24),
    new THREE.MeshBasicNodeMaterial({
      color: preset.haze,
      transparent: true,
      opacity: 0.03,
      side: THREE.BackSide,
    }),
  );

  sunGlow.position.set(preset.glowOffset.x, preset.glowOffset.y, preset.glowOffset.z);
  skyGroup.add(sky, haze, sunGlow);
  scene.add(skyGroup);

  const clouds = createClouds();
  scene.add(clouds.group);

  const hemi = new THREE.HemisphereLight(preset.hemiSky, preset.hemiGround, preset.hemiIntensity);
  const ambient = new THREE.AmbientLight(preset.ambient, preset.ambientIntensity);
  const sun = new THREE.DirectionalLight(preset.sun, preset.sunIntensity);
  const sunTarget = new THREE.Object3D();
  sun.position.set(preset.sunOffset.x, preset.sunOffset.y, preset.sunOffset.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 360;
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;
  sun.shadow.normalBias = 0.02;
  sunTarget.position.set(0, 0, 0);
  sun.target = sunTarget;

  scene.add(hemi, ambient, sun, sunTarget);

  // Cached Color objects for height-based fog (avoid per-frame allocation)
  const _baseFogColor = new THREE.Color(preset.fog);
  const _distantFogColor = new THREE.Color(preset.fog).offsetHSL(0.05, 0, -0.05);

  return {
    update(center, time = 0) {
      skyGroup.position.copy(center);
      if (skyMat && skyMat.userData.timeUniform) {
        skyMat.userData.timeUniform.value = time;
      }
      sun.position.set(
        center.x + preset.sunOffset.x,
        preset.sunOffset.y,
        center.z + preset.sunOffset.z,
      );
      sunTarget.position.set(center.x, 0, center.z);
      sunTarget.updateMatrixWorld();
      sunGlow.position.set(
        center.x + preset.glowOffset.x,
        preset.glowOffset.y + Math.sin(time * 0.08) * 8,
        center.z + preset.glowOffset.z,
      );

      // Height-based fog: denser near ground, thinner at altitude
      const cameraY = center.y;
      const groundLevel = 5;
      const maxAlt = 80;
      const heightFactor = THREE.MathUtils.clamp((cameraY - groundLevel) / (maxAlt - groundLevel), 0, 1);

      // Fog thins with altitude
      scene.fog.near = preset.fogNear + heightFactor * 40;
      scene.fog.far = preset.fogFar + heightFactor * 80;

      // Fog shifts bluer at distance
      scene.fog.color.copy(_baseFogColor).lerp(_distantFogColor, heightFactor * 0.3);
    },
    dispose() {
      scene.remove(skyGroup, hemi, ambient, sun, sunTarget, clouds.group);
      sky.geometry.dispose();
      sky.material.dispose();
      sunGlow.geometry.dispose();
      sunGlow.material.dispose();
      haze.geometry.dispose();
      haze.material.dispose();
      clouds.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
      });
      clouds.material.dispose();
    },
  };
}
