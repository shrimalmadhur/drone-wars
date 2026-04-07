import * as THREE from 'three';

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
  const material = new THREE.MeshBasicMaterial({
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
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(preset.topColor) },
      horizonColor: { value: new THREE.Color(preset.horizonColor) },
      bottomColor: { value: new THREE.Color(preset.bottomColor) },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vWorldPosition;

      void main() {
        float h = normalize(vWorldPosition).y * 0.5 + 0.5;
        vec3 color = mix(bottomColor, horizonColor, smoothstep(0.0, 0.45, h));
        color = mix(color, topColor, smoothstep(0.48, 1.0, h));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
}

export function createEnvironment(scene, { mapTheme } = {}) {
  const theme = sanitizeMapTheme(mapTheme);
  const preset = SKY_PRESETS[theme];

  scene.background = new THREE.Color(preset.background);
  scene.fog = new THREE.Fog(preset.fog, preset.fogNear, preset.fogFar);

  const skyGroup = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 32), createSkyMaterial(preset));
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(9, 18, 18),
    new THREE.MeshBasicMaterial({
      color: preset.sunGlow,
      transparent: true,
      opacity: 0.65,
    }),
  );
  const haze = new THREE.Mesh(
    new THREE.SphereGeometry(280, 24, 24),
    new THREE.MeshBasicMaterial({
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
  sun.position.set(preset.sunOffset.x, preset.sunOffset.y, preset.sunOffset.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 360;
  sun.shadow.camera.left = -180;
  sun.shadow.camera.right = 180;
  sun.shadow.camera.top = 180;
  sun.shadow.camera.bottom = -180;

  scene.add(hemi, ambient, sun);

  return {
    update(center, time = 0) {
      skyGroup.position.copy(center);
      sun.position.set(
        center.x + preset.sunOffset.x,
        preset.sunOffset.y,
        center.z + preset.sunOffset.z,
      );
      sunGlow.position.set(
        center.x + preset.glowOffset.x,
        preset.glowOffset.y + Math.sin(time * 0.08) * 8,
        center.z + preset.glowOffset.z,
      );
      scene.fog.color.setStyle(preset.fog);
    },
    dispose() {
      scene.remove(skyGroup, hemi, ambient, sun, clouds.group);
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
