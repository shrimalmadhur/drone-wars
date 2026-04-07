import * as THREE from 'three';

import { MAP_THEMES, sanitizeMapTheme } from '../../mapThemes.js';

const SKY_PRESETS = {
  [MAP_THEMES.FRONTIER]: {
    background: '#08111e',
    fog: '#5b7f95',
    fogNear: 120,
    fogFar: 360,
    topColor: '#6ca0d8',
    horizonColor: '#f4b487',
    bottomColor: '#08111e',
    sunGlow: '#ffd79b',
    haze: '#7fb6da',
    hemiSky: 0xd5efff,
    hemiGround: 0x24425d,
    hemiIntensity: 1.05,
    ambient: 0x6f8fac,
    ambientIntensity: 0.45,
    sun: 0xfff4d2,
    sunIntensity: 1.85,
    sunOffset: { x: 120, y: 150, z: -90 },
    glowOffset: { x: 180, y: 120, z: -140 },
  },
  [MAP_THEMES.CITY]: {
    background: '#0b1019',
    fog: '#6d7b8b',
    fogNear: 95,
    fogFar: 300,
    topColor: '#7a93b8',
    horizonColor: '#ffbe7d',
    bottomColor: '#0b1019',
    sunGlow: '#ffd2a2',
    haze: '#9eb5c8',
    hemiSky: 0xcfdcf1,
    hemiGround: 0x293445,
    hemiIntensity: 0.9,
    ambient: 0x56657a,
    ambientIntensity: 0.4,
    sun: 0xffebcb,
    sunIntensity: 1.55,
    sunOffset: { x: 95, y: 130, z: -70 },
    glowOffset: { x: 130, y: 96, z: -108 },
  },
};

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
      scene.remove(skyGroup, hemi, ambient, sun);
      sky.geometry.dispose();
      sky.material.dispose();
      sunGlow.geometry.dispose();
      sunGlow.material.dispose();
      haze.geometry.dispose();
      haze.material.dispose();
    },
  };
}
