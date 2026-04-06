import * as THREE from 'three';

function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color('#6ca0d8') },
      horizonColor: { value: new THREE.Color('#f4b487') },
      bottomColor: { value: new THREE.Color('#08111e') },
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

export function createEnvironment(scene) {
  scene.background = new THREE.Color('#08111e');
  scene.fog = new THREE.Fog('#3f6681', 120, 360);

  const skyGroup = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 32), createSkyMaterial());
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(9, 18, 18),
    new THREE.MeshBasicMaterial({
      color: '#ffd79b',
      transparent: true,
      opacity: 0.65,
    }),
  );
  const haze = new THREE.Mesh(
    new THREE.SphereGeometry(280, 24, 24),
    new THREE.MeshBasicMaterial({
      color: '#7fb6da',
      transparent: true,
      opacity: 0.03,
      side: THREE.BackSide,
    }),
  );

  sunGlow.position.set(180, 120, -140);
  skyGroup.add(sky, haze, sunGlow);
  scene.add(skyGroup);

  const hemi = new THREE.HemisphereLight(0xd5efff, 0x24425d, 1.05);
  const ambient = new THREE.AmbientLight(0x6f8fac, 0.45);
  const sun = new THREE.DirectionalLight(0xfff4d2, 1.85);
  sun.position.set(120, 150, -90);
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
      sun.position.set(center.x + 120, 150, center.z - 90);
      sunGlow.position.set(center.x + 180, 120 + Math.sin(time * 0.08) * 8, center.z - 140);
      scene.fog.color.setStyle('#5b7f95');
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
